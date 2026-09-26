-- Netlify Database migrations run as their own principal, while Functions use
-- netlifydb_owner. Both connection paths must be able to assume the restricted
-- role before any application query runs.
DO $$
DECLARE
  runtime_role_oid oid;
  netlify_owner_oid oid;
BEGIN
  SELECT oid INTO runtime_role_oid FROM pg_roles WHERE rolname = 'reparosm_runtime';
  SELECT oid INTO netlify_owner_oid FROM pg_roles WHERE rolname = 'netlifydb_owner';

  IF runtime_role_oid IS NOT NULL AND netlify_owner_oid IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_auth_members
       WHERE roleid = runtime_role_oid AND member = netlify_owner_oid
     ) THEN
    EXECUTE 'GRANT reparosm_runtime TO netlifydb_owner';
  END IF;
END
$$;
