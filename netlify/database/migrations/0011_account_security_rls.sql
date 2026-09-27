-- Account credentials are readable only during username authentication or from
-- a server-verified administrator context. RLS is row-based, so remove direct
-- access to the password hash column and expose it through a guarded function.
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE password_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE login_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_failures FORCE ROW LEVEL SECURITY;

REVOKE SELECT ON TABLE accounts FROM PUBLIC, reparosm_runtime;
GRANT SELECT (
  id, username, name, role, status, must_change_password, plan, due_date,
  access_policy, password_reset_at, created_at, updated_at
) ON accounts TO reparosm_runtime;

CREATE POLICY accounts_scoped_read ON accounts FOR SELECT TO reparosm_runtime
  USING (
    username = NULLIF(current_setting('app.auth_username', true), '')
    OR (id = 'account-admin'
        AND NULLIF(current_setting('app.auth_username', true), '') = 'adminreparosm')
    OR id = NULLIF(current_setting('app.session_account_id', true), '')
    OR id = NULLIF(current_setting('app.account_id', true), '')
    OR id = NULLIF(current_setting('app.public_store_account_id', true), '')
    OR NULLIF(current_setting('app.admin_account_id', true), '') IS NOT NULL
  );

CREATE POLICY accounts_scoped_insert ON accounts FOR INSERT TO reparosm_runtime
  WITH CHECK (
    username = NULLIF(current_setting('app.auth_username', true), '')
    OR NULLIF(current_setting('app.admin_account_id', true), '') IS NOT NULL
  );

CREATE POLICY accounts_scoped_update ON accounts FOR UPDATE TO reparosm_runtime
  USING (
    username = NULLIF(current_setting('app.auth_username', true), '')
    OR (id = 'account-admin'
        AND NULLIF(current_setting('app.auth_username', true), '') = 'adminreparosm')
    OR NULLIF(current_setting('app.admin_account_id', true), '') IS NOT NULL
  )
  WITH CHECK (
    username = NULLIF(current_setting('app.auth_username', true), '')
    OR NULLIF(current_setting('app.admin_account_id', true), '') IS NOT NULL
  );

CREATE POLICY accounts_scoped_delete ON accounts FOR DELETE TO reparosm_runtime
  USING (NULLIF(current_setting('app.admin_account_id', true), '') IS NOT NULL);

-- This policy is used by the SECURITY DEFINER accessor below. The runtime role
-- has no direct SELECT privilege on password_hash, and public/session contexts
-- do not satisfy the credential lookup predicate.
CREATE POLICY accounts_password_lookup ON accounts FOR SELECT TO PUBLIC
  USING (
    username = NULLIF(current_setting('app.auth_username', true), '')
    OR (id = 'account-admin'
        AND NULLIF(current_setting('app.auth_username', true), '') = 'adminreparosm')
    OR NULLIF(current_setting('app.admin_account_id', true), '') IS NOT NULL
  );

CREATE FUNCTION public.account_password_hash(account_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT a.password_hash
  FROM public.accounts AS a
  WHERE a.id = account_password_hash.account_id
    AND (
      a.username = NULLIF(current_setting('app.auth_username', true), '')
      OR (a.id = 'account-admin'
          AND NULLIF(current_setting('app.auth_username', true), '') = 'adminreparosm')
      OR NULLIF(current_setting('app.admin_account_id', true), '') IS NOT NULL
    )
$$;
REVOKE ALL ON FUNCTION public.account_password_hash(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_password_hash(text) TO reparosm_runtime;

CREATE POLICY sessions_scoped_read ON sessions FOR SELECT TO reparosm_runtime
  USING (
    token_hash = NULLIF(current_setting('app.session_token_hash', true), '')
    OR account_id IN (
      SELECT a.id FROM accounts AS a
      WHERE a.username = NULLIF(current_setting('app.auth_username', true), '')
    )
    OR NULLIF(current_setting('app.admin_account_id', true), '') IS NOT NULL
  );

CREATE POLICY sessions_scoped_insert ON sessions FOR INSERT TO reparosm_runtime
  WITH CHECK (
    account_id IN (
      SELECT a.id FROM accounts AS a
      WHERE a.username = NULLIF(current_setting('app.auth_username', true), '')
    )
    OR NULLIF(current_setting('app.admin_account_id', true), '') IS NOT NULL
  );

CREATE POLICY sessions_scoped_delete ON sessions FOR DELETE TO reparosm_runtime
  USING (
    token_hash = NULLIF(current_setting('app.session_token_hash', true), '')
    OR account_id IN (
      SELECT a.id FROM accounts AS a
      WHERE a.username = NULLIF(current_setting('app.auth_username', true), '')
    )
    OR NULLIF(current_setting('app.admin_account_id', true), '') IS NOT NULL
  );

CREATE POLICY password_requests_scoped ON password_requests TO reparosm_runtime
  USING (
    account_id IN (
      SELECT a.id FROM accounts AS a
      WHERE a.username = NULLIF(current_setting('app.auth_username', true), '')
    )
    OR NULLIF(current_setting('app.admin_account_id', true), '') IS NOT NULL
  )
  WITH CHECK (
    account_id IN (
      SELECT a.id FROM accounts AS a
      WHERE a.username = NULLIF(current_setting('app.auth_username', true), '')
    )
    OR NULLIF(current_setting('app.admin_account_id', true), '') IS NOT NULL
  );

CREATE POLICY login_failures_scoped ON login_failures TO reparosm_runtime
  USING (
    username = NULLIF(current_setting('app.auth_username', true), '')
    AND ip = NULLIF(current_setting('app.login_ip', true), '')
  )
  WITH CHECK (
    username = NULLIF(current_setting('app.auth_username', true), '')
    AND ip = NULLIF(current_setting('app.login_ip', true), '')
  );
