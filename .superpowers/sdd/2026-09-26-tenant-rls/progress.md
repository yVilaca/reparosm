# P0 Tenant RLS Progress

- [x] Approved architecture/spec committed as `9623649`.
- [x] Implementation plan drafted and reviewed against the approved spec.
- [x] Task 1: migration and cross-tenant integration tests (`0007_tenant_rls.sql`; verifies runtime role, forced policies, tenant isolation and public access).
- [x] Task 2: restricted-role DB helpers and separate privileged migration path.
- [x] Task 3: tenant repositories and public routes, including the public quote approval transaction.
- [x] Task 4: final local verification, review findings addressed, and P1 rollout checklist.

## Verification so far

- Full test suite: 57 passed, 0 failed, against disposable local databases. Added regressions cover fallback order-ID collisions, unsafe runtime role ownership/membership, and rollback context reset.
- `pnpm typecheck`, `pnpm lint`, and `pnpm build` pass. Lint reports one existing warning in `lib/auth.ts`.
- Prettier passes for changed TypeScript, JavaScript, and Markdown files. SQL is excluded because this project does not configure a Prettier SQL parser.
- Graft wiring graph is in sync (548 nodes, 1,253 edges); privileged migration helpers have no application call sites.
- These results validate the implementation locally; they do not verify Netlify's effective database role, migration grants, or deployed behavior.
- Code review identified two important issues and one coverage gap. All three were fixed, and targeted plus full test suites passed.

## Decisions and blockers

- Work is isolated in `D:\Projetos\reparosm\reparosm-tenant-rls-design` on `codex/tenant-rls-design`; unrelated changes in the primary checkout are preserved.
- The local PostgreSQL login is privileged, so tests must explicitly `SET LOCAL ROLE reparosm_runtime` to prove actual RLS behavior.
- Runtime-role bootstrap creates secure attributes once, rejects an unsafe pre-existing role, and avoids rewriting cluster-wide role metadata on every test database; parallel migrations exposed and verified this requirement.
- Netlify preview's database principal and role-membership behavior have not yet been verified. Do not treat local test success as preview or production deployment approval.
- `orders.save()` runs through a tenant-scoped transaction; the account context is taken from the validated server-side account.
- The migration fails closed if an existing runtime role owns an application table or is a member of another role. Public quote approval rolls back if its fallback order ID is already owned by another tenant.
- The migration has only been applied to disposable test databases. Netlify preview and production databases have not been migrated.
