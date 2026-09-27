# P0 Tenant RLS Progress

- [x] Approved architecture/spec committed as `9623649`.
- [x] Implementation plan drafted and reviewed against the approved spec.
- [x] Task 1: migration and cross-tenant integration tests (`0007_tenant_rls.sql`; verifies runtime role, forced policies, tenant isolation and public access).
- [x] Task 2: restricted-role DB helpers and separate privileged migration path.
- [x] Task 3: tenant repositories and public routes, including the public quote approval transaction.
- [x] Task 4: final local verification, review findings addressed, and P1 rollout checklist.

## Verification so far

- Historical P0 GitHub CI passed 59/59 tests with no skips, plus format, lint, typecheck, build, and Graft checks on commit `fd23ebf`. P1 CI will run on its pull request.
- Local baseline before P1: 59/59 tests passed with no skips against the disposable PostgreSQL cluster. After P1, the full local suite passed 61/61 with no skips.
- The Netlify Deploy Preview branch applied migrations 0001–0009. Runtime membership now permits `SET ROLE reparosm_runtime`; migration 0008 was restored to its applied contents and migration 0009 carries the repair.
- Live preview DB check: application transaction uses `current_user=reparosm_runtime`, with `rolsuper=false`, `rolbypassrls=false`, and no ownership of the twelve business tables. `shops` has RLS enabled and forced. The connection's `session_user=netlifydb_owner` has `BYPASSRLS`, so application SQL must remain behind `lib/db.ts` and its restricted-role transaction wrapper.
- Live preview isolation test: each of two temporary tenants saw one own shop and no other tenant's shop; no context saw zero rows; cross-tenant insert failed with RLS. All test rows were rolled back.
- Live preview public-flow test: storefront 200; two quote reads 200 with public-only fields; quote approval 200 and one linked order created. Temporary rows were deleted.
- A temporary merchant login/session/logout test passed via server-to-server requests without `Origin`. A request with an explicit preview `Origin` returned 403 and needs browser verification before production rollout.
- Subsequent preview Function invocations returned Netlify's `503 usage_exceeded`; deploy itself is ready, but further runtime checks are blocked by the platform allowance. No billing or plan change was made.
- The DB-backed local tests ran against a disposable cluster at `127.0.0.1:55439`; no database tests were skipped for the recorded 59-test P0 baseline or the 61-test P1 run.

## Decisions and blockers

- Work is isolated in `D:\Projetos\reparosm\reparosm-tenant-rls-design` on `codex/tenant-rls-design`; unrelated changes in the primary checkout are preserved.
- The local PostgreSQL login is privileged, so tests must explicitly `SET LOCAL ROLE reparosm_runtime` to prove actual RLS behavior.
- Runtime-role bootstrap creates secure attributes once, rejects an unsafe pre-existing role, and avoids rewriting cluster-wide role metadata on every test database; parallel migrations exposed and verified this requirement.
- Netlify preview's effective runtime role and cross-tenant RLS behavior have been verified. Production remains untouched until the preview-origin login check and Function availability are resolved.
- Ruling: keep the Netlify-managed `netlifydb_owner` privileges unchanged and require all app SQL to set the non-owner, non-`BYPASSRLS` `reparosm_runtime` role — the provider principal is `BYPASSRLS`, but the live request path successfully switched roles and enforced RLS; changing managed provider privileges could break migrations or the platform; cost if wrong: a future direct query path could bypass policies, so Graft/code search remains a release gate.
- `orders.save()` runs through a tenant-scoped transaction; the account context is taken from the validated server-side account.
- The migration fails closed if an existing runtime role owns an application table or is a member of another role. Public quote approval rolls back if its fallback order ID is already owned by another tenant.
- Migrations have been applied and validated on the Netlify Deploy Preview database; production remains untouched.
