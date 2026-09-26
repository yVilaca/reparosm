# P0 Tenant RLS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this plan task-by-task. Keep the progress ledger current and commit each completed task.

**Goal:** Enforce tenant isolation for all twelve P0 business tables at the PostgreSQL boundary while preserving the public storefront and quote-response flows.

**Architecture:** Add a non-login `reparosm_runtime` role, enable and force RLS on every P0 table, and run application SQL in short transactions as that role. Tenant repository calls set `app.account_id` transaction-locally; the public storefront and quote bearer flow use narrowly scoped transaction-local capabilities. Migration execution stays on the privileged connection and is named separately from application queries.

**Tech Stack:** Next.js 16, TypeScript, PostgreSQL, `@netlify/database`, Node test runner, pnpm, Graft.

**Spec:** [2026-09-26-tenant-rls-design.md](../specs/2026-09-26-tenant-rls-design.md)

## Global Constraints

- Preserve unrelated files and existing worktree state.
- Never use privileged migration helpers from request handlers or repositories.
- Missing tenant context must return no rows and reject writes to P0 tables.
- Set role and all RLS context with transaction-local SQL; never use session-level `SET` or `set_config(..., false)`.
- Keep account/auth control tables outside P0 RLS for this change; P1 must explicitly cover them.
- Public storefront reads may expose only published, in-stock parts and the matching shop. Quote bearer access may expose only the exact quote ID.
- Do not add dependencies. Keep public response field projection unchanged.
- Each task begins with a failing focused test, is verified before commit, and updates `.superpowers/sdd/2026-09-26-tenant-rls/progress.md`.

## Review Focus

- Verify every P0 table has `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and an account policy for both `USING` and `WITH CHECK`.
- Verify runtime privileges are limited to the twelve P0 tables plus existing account/auth tables needed by the app, and that the runtime role is neither owner nor superuser nor `BYPASSRLS`.
- Verify no app path can query a tenant table through the privileged helper.
- Verify transaction rollback/reset behavior and that one pooled connection cannot retain a tenant or public capability setting.
- Verify public endpoints cannot use client-provided account IDs to choose a tenant.
- Verify migration compatibility with the deployed PostgreSQL/Netlify role model before rollout; deployment-role identity remains a preview acceptance check.

---

## Task 1: Add P0 RLS schema migration and cross-tenant database tests

**Files:**

- Create `netlify/database/migrations/0007_tenant_rls.sql`.
- Update `tests/db.test.mjs` to assert P0 table policy coverage and exercise two accounts under `reparosm_runtime`.
- Update the expected table list in `tests/db.test.mjs` only if the migration adds a table (it should not).

**Test first:** Add an integration test that inserts two shops and parts for distinct account IDs, then executes as `reparosm_runtime` with `app.account_id` set to one account. Assert only that account's rows are visible; assert no-context reads see zero rows and cross-tenant inserts/updates fail. Run `pnpm test -- --test-name-pattern="RLS|tenant isolation"`; it must fail before migration because the runtime role/policies do not exist.

**Implementation:** In migration 0007, idempotently create/configure `reparosm_runtime` as `NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS`, grant membership to the migration's current database principal, revoke its pre-existing table grants in `public`, and grant only the app's required privileges. Enable and force RLS on `shops`, `clients`, `quotes`, `orders`, `parts`, `cash_entries`, `messages`, `films`, `automations`, `tutorials`, `whatsapp_configs`, and `order_code_counters`. Add account policies using `account_id = NULLIF(current_setting('app.account_id', true), '')` for both row visibility and write checks. Add a SELECT policy on `shops` for `app.public_store_account_id`, and on `parts` for the same public store only when `published` is true and `stock > 0`. Add a quote SELECT capability policy using only `app.public_quote_id`.

**Verify:** Run `pnpm test -- --test-name-pattern="RLS|tenant isolation"` and `pnpm exec graft check`. Confirm tests prove isolation when using `SET LOCAL ROLE reparosm_runtime`, including no-context deny behavior. Commit as `feat(db): add tenant row-level security policies`.

## Task 2: Make application DB helpers default to the restricted role

**Files:**

- Update `lib/db.ts` with `tenantQuery(accountId, text, params)`, `tenantTransaction(accountId, fn)`, public capability transaction helpers, and explicitly named privileged migration helpers.
- Update `scripts/migrate.mjs` and `tests/support/db.mjs` to use privileged migration operations only for schema management/seeding.
- Extend `tests/db.test.mjs` for effective role, transaction-local settings, rollback, and pooled-connection reset.

**Test first:** Add tests asserting that ordinary `query`/`transaction` execute as `reparosm_runtime`, `tenantQuery` sees only its account, a missing context sees no P0 rows, and context/role do not survive commit or rollback. The tests must fail against the existing owner-level query helper.

**Implementation:** Route `query` and `transaction` through `pool.connect()`, `BEGIN`, `SET LOCAL ROLE reparosm_runtime`, callback/query, and `COMMIT`/`ROLLBACK`. Tenant helpers set `app.account_id` transaction-locally. Public helpers set exactly one store or quote capability and do not accept a client-selected tenant for quote writes. Keep privileged migration helpers visibly named and out of application imports. Always release clients in `finally`.

**Verify:** Run `pnpm test -- --test-name-pattern="query|transaction|tenant isolation|RLS"`, then `pnpm typecheck`. Confirm callback exceptions roll back and clients are released. Commit as `refactor(db): scope application queries to runtime role`.

## Task 3: Route all tenant repositories and public flows through scoped helpers

**Files:**

- Update `lib/repos/simple.ts`, `lib/repos/clients.ts`, `lib/repos/quotes.ts`, `lib/repos/orders.ts`, `lib/repos/shops.ts`, and `lib/whatsapp.ts`.
- Update `lib/orders.ts`, `app/vitrine/page.tsx`, and `app/api/public/quote/route.ts`.
- Update focused tests in `tests/resources.test.mjs`, `tests/resource-flows.test.mjs`, `tests/orders.test.mjs`, and `tests/public-data.test.mjs` as needed.

**Test first:** Add/adjust regression tests for each of these cases: tenant A cannot list/get/update/delete tenant B rows; storefront shows only its shop and published in-stock items; quote GET exposes only its bearer quote; quote approval derives accountId from the locked database row and atomically creates linked order/client records. Verify a body-supplied accountId cannot alter quote tenant selection.

**Implementation:** Make every repository direct operation use `tenantQuery(accountId)` and keep passed transaction query callbacks for grouped writes. Use `tenantTransaction(accountId, ...)` for order writes. The storefront uses a public-store transaction with the URL store identifier as the explicit public capability and preserves existing response projection. Quote GET uses its quote-ID capability. Quote POST first locks the quote by capability ID, reads accountId from that row, then sets the transaction-local tenant context before accessing account/order/client/quote records. Ensure all writes and related reads share the same transaction.

**Verify:** Run targeted resource/order/public tests and `pnpm typecheck`. Search the Graft graph for remaining app references to direct `query` against P0 tables; inspect any such result and scope it or justify it as migration-only. Commit as `feat(security): scope tenant repositories and public access`.

## Task 4: Verify complete P0 behavior and leave P1 rollout work ready

**Files:**

- Update `docs/superpowers/specs/2026-09-26-tenant-rls-design.md` with the implemented P0 decisions, verification results, and preview-role acceptance checklist.
- Update the implementation progress ledger.
- Update focused test fixtures only if the full suite exposes required compatibility changes.

**Test first:** Add any missing test for the concrete regression exposed by earlier tasks before changing code. Do not add tests that only mirror implementation details.

**Implementation:** Run and resolve the full required checks. Document P1 as the next scoped task: tenant-composite foreign keys, then account/session/password-reset/login-failure RLS and their auth/admin policies. Record the exact preview checks: effective `current_user`, `rolsuper=false`, `rolbypassrls=false`, runtime role is not table owner, migration-created membership works, and a two-account isolation smoke test passes.

**Verify:** Run `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm exec graft build`, and `pnpm exec graft check`. Review the complete branch diff for security bypasses and unrelated changes. Do not claim production readiness until the preview database confirms its actual principal and role membership. Commit as `docs(security): record RLS verification and P1 rollout`.
