-- Acesso por e-mail: cada pessoa pode ter um e-mail (único no sistema) e recebe
-- links de uso único para criar a senha (convite), trocar a senha esquecida
-- (nova senha) ou confirmar um e-mail novo. Lojas criadas por uma compra guardam
-- a referência externa, para o mesmo pedido nunca criar duas lojas.

ALTER TABLE users
  ADD COLUMN email text,
  ADD COLUMN email_verified_at timestamptz,
  ADD CONSTRAINT users_email_format CHECK (
    email IS NULL OR (email = lower(email) AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
  );
CREATE UNIQUE INDEX users_email_key ON users (email);
GRANT SELECT (email, email_verified_at) ON users TO reparosm_runtime;
GRANT UPDATE (email, email_verified_at) ON users TO reparosm_runtime;

-- "Esqueci minha senha" e login aceitam o e-mail: o contexto app.auth_email lê
-- só o usuário daquele e-mail, como app.auth_username faz com o usuário.
DROP POLICY users_scoped_read ON users;
CREATE POLICY users_scoped_read ON users FOR SELECT TO reparosm_runtime
  USING (
    username = NULLIF(current_setting('app.auth_username', true), '')
    OR email = NULLIF(current_setting('app.auth_email', true), '')
    OR id = NULLIF(current_setting('app.session_user_id', true), '')
    OR account_id = NULLIF(current_setting('app.account_id', true), '')
    OR NULLIF(current_setting('app.admin_account_id', true), '') IS NOT NULL
  );

ALTER TABLE accounts ADD COLUMN external_ref text UNIQUE;
GRANT SELECT (external_ref) ON accounts TO reparosm_runtime;

-- Links de acesso. Só o hash (SHA-256) do token fica guardado; o token vai no
-- link e some do servidor. `sent_to` diz para qual e-mail o link foi mandado:
-- usar um link recebido por e-mail confirma esse e-mail; um link copiado, não.
CREATE TABLE access_links (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  user_id text NOT NULL,
  account_id text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('invite', 'reset', 'email')),
  email text,
  sent_to text,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_links_email_purpose CHECK ((purpose = 'email') = (email IS NOT NULL)),
  CONSTRAINT access_links_user_account_fkey FOREIGN KEY (user_id, account_id)
    REFERENCES users (id, account_id) ON DELETE CASCADE
);
CREATE INDEX access_links_user_id_idx ON access_links (user_id, created_at);
CREATE INDEX access_links_account_id_idx ON access_links (account_id);

REVOKE ALL PRIVILEGES ON TABLE access_links FROM PUBLIC, reparosm_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE access_links TO reparosm_runtime;
ALTER TABLE access_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_links FORCE ROW LEVEL SECURITY;

-- Contextos: o próprio link (app.access_link_hash), a loja (Dono em Equipe), o
-- próprio usuário na sessão (trocar o e-mail), o "esqueci minha senha" do
-- próprio usuário (app.auth_username) e o administrador.
CREATE POLICY access_links_scoped ON access_links TO reparosm_runtime
  USING (
    token_hash = NULLIF(current_setting('app.access_link_hash', true), '')
    OR account_id = NULLIF(current_setting('app.account_id', true), '')
    OR user_id = NULLIF(current_setting('app.session_user_id', true), '')
    OR user_id IN (
      SELECT u.id FROM users AS u
      WHERE u.username = NULLIF(current_setting('app.auth_username', true), '')
    )
    OR NULLIF(current_setting('app.admin_account_id', true), '') IS NOT NULL
  )
  WITH CHECK (
    token_hash = NULLIF(current_setting('app.access_link_hash', true), '')
    OR account_id = NULLIF(current_setting('app.account_id', true), '')
    OR user_id = NULLIF(current_setting('app.session_user_id', true), '')
    OR (user_id, account_id) IN (
      SELECT u.id, u.account_id FROM users AS u
      WHERE u.username = NULLIF(current_setting('app.auth_username', true), '')
    )
    OR NULLIF(current_setting('app.admin_account_id', true), '') IS NOT NULL
  );
