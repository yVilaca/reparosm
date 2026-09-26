-- The app connects with the migration/database owner credentials, but every
-- application query must explicitly assume this restricted, non-login role.
DO $$
DECLARE
  created boolean := false;
  unsafe boolean;
  runtime_role_oid oid;
BEGIN
  BEGIN
    CREATE ROLE reparosm_runtime
      NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    created := true;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  IF NOT created THEN
    SELECT rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication
           OR rolcanlogin OR rolinherit
    INTO unsafe
    FROM pg_roles WHERE rolname = 'reparosm_runtime';
    IF unsafe THEN
      RAISE EXCEPTION 'Existing reparosm_runtime role has unsafe attributes';
    END IF;
  END IF;

  SELECT oid INTO runtime_role_oid FROM pg_roles WHERE rolname = 'reparosm_runtime';
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = ANY(ARRAY[
        'shops', 'clients', 'quotes', 'orders', 'parts', 'cash_entries', 'messages',
        'films', 'automations', 'tutorials', 'whatsapp_configs', 'order_code_counters',
        'accounts', 'sessions', 'password_requests', 'login_failures'
      ])
      AND c.relowner = runtime_role_oid
  ) THEN
    RAISE EXCEPTION 'Existing reparosm_runtime role must not own application tables';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_auth_members WHERE member = runtime_role_oid) THEN
    RAISE EXCEPTION 'Existing reparosm_runtime role must not be a member of another role';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_auth_members m
    JOIN pg_roles granted ON granted.oid = m.roleid
    JOIN pg_roles grantee ON grantee.oid = m.member
    WHERE granted.rolname = 'reparosm_runtime' AND grantee.rolname = CURRENT_USER
  ) THEN
    GRANT reparosm_runtime TO CURRENT_USER;
  END IF;
END
$$;
GRANT USAGE ON SCHEMA public TO reparosm_runtime;

DO $$
DECLARE
  tenant_table text;
BEGIN
  FOREACH tenant_table IN ARRAY ARRAY[
    'shops', 'clients', 'quotes', 'orders', 'parts', 'cash_entries', 'messages',
    'films', 'automations', 'tutorials', 'whatsapp_configs', 'order_code_counters'
  ] LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE %I FROM PUBLIC, reparosm_runtime', tenant_table
    );
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO reparosm_runtime', tenant_table
    );
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tenant_table);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I TO reparosm_runtime
       USING (account_id = NULLIF(current_setting(''app.account_id'', true), ''''))
       WITH CHECK (account_id = NULLIF(current_setting(''app.account_id'', true), ''''))',
      tenant_table
    );
  END LOOP;
END
$$;

-- Public capabilities are intentionally read-only and scoped to one public
-- store or one unguessable quote ID. They never grant general tenant access.
CREATE POLICY public_store_read ON shops FOR SELECT TO reparosm_runtime
  USING (account_id = NULLIF(current_setting('app.public_store_account_id', true), ''));

CREATE POLICY public_store_read ON parts FOR SELECT TO reparosm_runtime
  USING (
    account_id = NULLIF(current_setting('app.public_store_account_id', true), '')
    AND published
    AND stock > 0
  );

CREATE POLICY public_quote_read ON quotes FOR SELECT TO reparosm_runtime
  USING (id = NULLIF(current_setting('app.public_quote_id', true), ''));

-- Authentication/control tables remain outside P0 RLS. Give the app only the
-- CRUD privileges its existing login, session, and password-reset paths need.
REVOKE ALL PRIVILEGES ON TABLE accounts, sessions, password_requests, login_failures
  FROM PUBLIC, reparosm_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE accounts, sessions, password_requests, login_failures TO reparosm_runtime;
