# P0 Tenant RLS Progress

- [x] Approved architecture/spec committed as `9623649`.
- [x] Implementation plan drafted and reviewed against the approved spec.
- [x] Task 1: migration and cross-tenant integration tests (`0007_tenant_rls.sql`; 14 database/migration tests pass).
- [ ] Task 2: restricted-role DB helpers.
- [ ] Task 3: tenant repositories and public routes.
- [ ] Task 4: complete verification and P1 rollout checklist.

## Decisions and blockers

- Work is isolated in `D:\Projetos\reparosm\reparosm-tenant-rls-design` on `codex/tenant-rls-design`; unrelated changes in the primary checkout are preserved.
- The local PostgreSQL login is privileged, so tests must explicitly `SET LOCAL ROLE reparosm_runtime` to prove actual RLS behavior.
- Netlify preview's database principal and role-membership behavior have not yet been verified. Do not treat local test success as preview or production deployment approval.
