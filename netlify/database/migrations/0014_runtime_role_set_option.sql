-- PostgreSQL 16+ auto-grants a CREATEROLE principal membership in any role it creates
-- (WITH ADMIN OPTION) but not necessarily WITH SET TRUE. 0007's own self-grant to
-- CURRENT_USER was a no-op wherever that auto-membership already existed, leaving the
-- single-principal (migration and runtime share one role, unlike Netlify's split
-- migration/netlifydb_owner principals handled by 0008/0009) unable to SET ROLE.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'reparosm_runtime') THEN
    EXECUTE 'GRANT reparosm_runtime TO ' || quote_ident(CURRENT_USER) || ' WITH SET TRUE';
  END IF;
END
$$;
