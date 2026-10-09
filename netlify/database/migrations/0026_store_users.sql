-- Uma loja (accounts) passa a ter vários usuários, cada um com login e senha
-- próprios. accounts continua sendo o tenant de todas as tabelas.
--
-- Migração de expansão: a versão anterior do app continua funcionando enquanto
-- a nova é publicada (ela ainda lê accounts.password_hash e cria sessões sem
-- user_id). As colunas de senha de accounts saem numa migração seguinte.

CREATE TABLE users (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'staff')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  password_hash text NOT NULL,
  must_change_password boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Alvo das chaves compostas: a sessão e o pedido de senha ficam na loja do usuário.
  UNIQUE (id, account_id)
);
CREATE INDEX users_account_id_idx ON users (account_id);

-- Cada conta existente vira o Dono da própria loja, com o mesmo usuário e senha.
INSERT INTO users (
  id, account_id, username, name, role, status, password_hash, must_change_password,
  created_at, updated_at
)
SELECT 'user-' || a.username, a.id, a.username, a.name, 'owner', 'active', a.password_hash,
       a.must_change_password, a.created_at, a.updated_at
FROM accounts a;

-- Lojas novas não têm senha própria; a coluna sai na próxima migração.
ALTER TABLE accounts ALTER COLUMN password_hash DROP NOT NULL;

-- Sessões: de qual usuário, de que aparelho e IP. As abertas passam para o Dono.
ALTER TABLE sessions
  ADD COLUMN id text NOT NULL DEFAULT gen_random_uuid()::text,
  ADD COLUMN user_id text,
  ADD COLUMN user_agent text,
  ADD COLUMN ip text;
UPDATE sessions s SET user_id = u.id FROM users u
WHERE u.account_id = s.account_id AND u.role = 'owner';
DELETE FROM sessions WHERE user_id IS NULL;
ALTER TABLE sessions
  ALTER COLUMN user_id SET NOT NULL,
  ADD CONSTRAINT sessions_id_key UNIQUE (id),
  ADD CONSTRAINT sessions_user_account_fkey FOREIGN KEY (user_id, account_id)
    REFERENCES users (id, account_id) ON DELETE CASCADE;
CREATE INDEX sessions_user_id_idx ON sessions (user_id);

-- Transição: a versão anterior cria sessões sem user_id; elas ficam com o Dono.
-- Sai junto com as colunas de senha de accounts.
CREATE FUNCTION public.sessions_default_user() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    SELECT u.id INTO NEW.user_id FROM public.users AS u
    WHERE u.account_id = NEW.account_id AND u.role = 'owner'
    ORDER BY u.created_at, u.id
    LIMIT 1;
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER sessions_default_user BEFORE INSERT ON sessions
  FOR EACH ROW EXECUTE FUNCTION public.sessions_default_user();

-- Pedidos de senha passam a ser de um usuário (vários por loja).
ALTER TABLE password_requests ADD COLUMN user_id text;
UPDATE password_requests r SET user_id = u.id FROM users u
WHERE u.account_id = r.account_id AND u.role = 'owner';
DELETE FROM password_requests WHERE user_id IS NULL;
ALTER TABLE password_requests
  DROP CONSTRAINT password_requests_pkey,
  ALTER COLUMN user_id SET NOT NULL,
  ADD PRIMARY KEY (user_id),
  ADD CONSTRAINT password_requests_user_account_fkey FOREIGN KEY (user_id, account_id)
    REFERENCES users (id, account_id) ON DELETE CASCADE;
CREATE INDEX password_requests_account_id_idx ON password_requests (account_id);

-- Usuários: RLS forçado; o runtime nunca lê password_hash diretamente e não
-- muda id, loja ou usuário de ninguém. Desativar substitui excluir.
REVOKE ALL PRIVILEGES ON TABLE users FROM PUBLIC, reparosm_runtime;
GRANT SELECT (
  id, account_id, username, name, role, status, must_change_password, last_login_at,
  created_at, updated_at
) ON users TO reparosm_runtime;
GRANT INSERT ON users TO reparosm_runtime;
GRANT UPDATE (
  name, role, status, password_hash, must_change_password, last_login_at, updated_at
) ON users TO reparosm_runtime;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

-- Contextos: login (o próprio usuário), sessão (o próprio usuário), loja
-- (Equipe, conferida no servidor) e administrador.
CREATE POLICY users_scoped_read ON users FOR SELECT TO reparosm_runtime
  USING (
    username = NULLIF(current_setting('app.auth_username', true), '')
    OR id = NULLIF(current_setting('app.session_user_id', true), '')
    OR account_id = NULLIF(current_setting('app.account_id', true), '')
    OR NULLIF(current_setting('app.admin_account_id', true), '') IS NOT NULL
  );

-- No contexto de login só se cria o próprio administrador (primeira subida).
CREATE POLICY users_scoped_insert ON users FOR INSERT TO reparosm_runtime
  WITH CHECK (
    (id = 'user-adminreparosm' AND account_id = 'account-admin'
     AND username = NULLIF(current_setting('app.auth_username', true), ''))
    OR account_id = NULLIF(current_setting('app.account_id', true), '')
    OR NULLIF(current_setting('app.admin_account_id', true), '') IS NOT NULL
  );

CREATE POLICY users_scoped_update ON users FOR UPDATE TO reparosm_runtime
  USING (
    username = NULLIF(current_setting('app.auth_username', true), '')
    OR id = NULLIF(current_setting('app.session_user_id', true), '')
    OR account_id = NULLIF(current_setting('app.account_id', true), '')
    OR NULLIF(current_setting('app.admin_account_id', true), '') IS NOT NULL
  )
  WITH CHECK (
    username = NULLIF(current_setting('app.auth_username', true), '')
    OR id = NULLIF(current_setting('app.session_user_id', true), '')
    OR account_id = NULLIF(current_setting('app.account_id', true), '')
    OR NULLIF(current_setting('app.admin_account_id', true), '') IS NOT NULL
  );

-- Usada pela função SECURITY DEFINER abaixo (o runtime não tem a coluna).
CREATE POLICY users_password_lookup ON users FOR SELECT TO PUBLIC
  USING (
    username = NULLIF(current_setting('app.auth_username', true), '')
    OR id = NULLIF(current_setting('app.session_user_id', true), '')
  );

-- A senha só sai no login do próprio usuário ou na sessão dele (conferir a
-- senha atual antes de trocar).
CREATE FUNCTION public.user_password_hash(user_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT u.password_hash
  FROM public.users AS u
  WHERE u.id = user_password_hash.user_id
    AND (
      u.username = NULLIF(current_setting('app.auth_username', true), '')
      OR u.id = NULLIF(current_setting('app.session_user_id', true), '')
    )
$$;
REVOKE ALL ON FUNCTION public.user_password_hash(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_password_hash(text) TO reparosm_runtime;

-- Loja: o login de um funcionário lê a loja dele.
DROP POLICY accounts_scoped_read ON accounts;
CREATE POLICY accounts_scoped_read ON accounts FOR SELECT TO reparosm_runtime
  USING (
    username = NULLIF(current_setting('app.auth_username', true), '')
    OR id IN (
      SELECT u.account_id FROM users AS u
      WHERE u.username = NULLIF(current_setting('app.auth_username', true), '')
    )
    OR (id = 'account-admin'
        AND NULLIF(current_setting('app.auth_username', true), '') = 'adminreparosm')
    OR id = NULLIF(current_setting('app.session_account_id', true), '')
    OR id = NULLIF(current_setting('app.account_id', true), '')
    OR id = NULLIF(current_setting('app.public_store_account_id', true), '')
    OR NULLIF(current_setting('app.admin_account_id', true), '') IS NOT NULL
  );

-- Sessões: pelo token, pelo próprio usuário (login ou sessão), pela loja
-- (Equipe) ou pelo administrador. A única atualização é a do próprio token.
DROP POLICY sessions_scoped_read ON sessions;
DROP POLICY sessions_scoped_insert ON sessions;
DROP POLICY sessions_scoped_delete ON sessions;
REVOKE UPDATE ON TABLE sessions FROM reparosm_runtime;

CREATE POLICY sessions_scoped_read ON sessions FOR SELECT TO reparosm_runtime
  USING (
    token_hash = NULLIF(current_setting('app.session_token_hash', true), '')
    OR user_id IN (
      SELECT u.id FROM users AS u
      WHERE u.username = NULLIF(current_setting('app.auth_username', true), '')
    )
    OR user_id = NULLIF(current_setting('app.session_user_id', true), '')
    OR account_id = NULLIF(current_setting('app.account_id', true), '')
    OR NULLIF(current_setting('app.admin_account_id', true), '') IS NOT NULL
  );

CREATE POLICY sessions_scoped_insert ON sessions FOR INSERT TO reparosm_runtime
  WITH CHECK (
    (user_id, account_id) IN (
      SELECT u.id, u.account_id FROM users AS u
      WHERE u.username = NULLIF(current_setting('app.auth_username', true), '')
    )
    OR NULLIF(current_setting('app.admin_account_id', true), '') IS NOT NULL
  );

CREATE POLICY sessions_scoped_delete ON sessions FOR DELETE TO reparosm_runtime
  USING (
    token_hash = NULLIF(current_setting('app.session_token_hash', true), '')
    OR user_id IN (
      SELECT u.id FROM users AS u
      WHERE u.username = NULLIF(current_setting('app.auth_username', true), '')
    )
    OR user_id = NULLIF(current_setting('app.session_user_id', true), '')
    OR account_id = NULLIF(current_setting('app.account_id', true), '')
    OR NULLIF(current_setting('app.admin_account_id', true), '') IS NOT NULL
  );

-- Pedidos de senha: abertos no login do próprio usuário; vistos pela loja
-- (Dono resolve o de funcionário) e pelo administrador (resolve o de Dono).
DROP POLICY password_requests_scoped ON password_requests;
CREATE POLICY password_requests_scoped ON password_requests TO reparosm_runtime
  USING (
    user_id IN (
      SELECT u.id FROM users AS u
      WHERE u.username = NULLIF(current_setting('app.auth_username', true), '')
    )
    OR account_id = NULLIF(current_setting('app.account_id', true), '')
    OR NULLIF(current_setting('app.admin_account_id', true), '') IS NOT NULL
  )
  WITH CHECK (
    (user_id, account_id) IN (
      SELECT u.id, u.account_id FROM users AS u
      WHERE u.username = NULLIF(current_setting('app.auth_username', true), '')
    )
    OR account_id = NULLIF(current_setting('app.account_id', true), '')
    OR NULLIF(current_setting('app.admin_account_id', true), '') IS NOT NULL
  );
