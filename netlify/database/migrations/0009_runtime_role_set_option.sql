-- 0008 may already have granted membership with SET FALSE on an existing role
-- membership. Explicitly enable SET ROLE for the Functions connection principal.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'netlifydb_owner')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'reparosm_runtime') THEN
    EXECUTE 'GRANT reparosm_runtime TO netlifydb_owner WITH SET TRUE';
  END IF;
END
$$;
