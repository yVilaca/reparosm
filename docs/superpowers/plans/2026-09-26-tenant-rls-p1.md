# Tenant isolation P1 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` and `superpowers:test-driven-development`. Complete tasks in order and keep the plan ledger current.

**Goal:** Close P1 tenant-isolation gaps by enforcing same-account references in PostgreSQL and applying forced RLS to authentication/control tables without breaking public or administrative flows.

**Architecture:** Add composite foreign keys over `(account_id, id)` for client, quote, order, and message references. Add transaction-local runtime contexts for login username, hashed session token, login-failure identity, current session account, and server-verified administrator; enforce those contexts with forced RLS on `accounts`, `sessions`, `password_requests`, and `login_failures`. Keep all migration and test seeding operations on the existing privileged migration connection.

**Tech Stack:** PostgreSQL 17+, Next.js 16, TypeScript, Node test runner, `@netlify/database`, pnpm, Graft.

**Spec:** `docs/superpowers/specs/2026-09-26-tenant-rls-design.md`

## Global constraints

- Work only against a disposable PostgreSQL cluster on localhost; do not call Netlify, deploy, or access production.
- Keep application SQL under `reparosm_runtime`; do not import privileged migration helpers from app code.
- Set all contexts with transaction-local `set_config(..., true)`; no session-level role or context changes.
- Login context is the normalized username; session context is only the SHA-256 token hash; login-failure context is the exact username/IP pair.
- Admin context is an `AdminActor` created only after `currentAccount` confirms an active admin; helpers reject any other role, and routes never build it from request fields or headers.
- Public storefront and quote flows select only the account status they need; do not load password hashes through public capabilities.
- Composite FK deletion must null only the relationship column, preserving the non-null account ID.
- Do not silently repair existing cross-account relationships. The migration must fail with a clear error if it finds any.
- No new dependencies; preserve existing API response shapes and account deletion cascades.

## Review focus

- Every reference among `quotes`, `orders`, `clients`, and `messages` is constrained by the same `account_id`.
- `ON DELETE SET NULL` affects only `client_id`, `quote_id`, or `order_id`, never `account_id`.
- All four authentication/control tables have `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`.
- Unscoped runtime queries cannot read or write authentication/control rows.
- A login context sees only its username; a session context sees only its hashed session and the account derived from that session; a failure context sees only its username/IP pair.
- Public users cannot read password hashes or enumerate other accounts; non-admin sessions cannot run account-management routes.
- Existing login, logout, lockout, reset, session-revocation, suspension, deletion, storefront, and quote approval flows still pass.

---

## Task 1: Enforce same-tenant foreign keys

**Files:** `tests/db.test.mjs`; `netlify/database/migrations/0010_tenant_composite_foreign_keys.sql`.

- [x] **Step 1: Write the failing relationship test.** In `tests/db.test.mjs`, add `P1 references cannot cross accounts and unlink only the foreign key column`. Seed accounts `p1-fk-a` and `p1-fk-b`, one client, quote, and order per account, plus a message for account A. Assert SQLSTATE `23503` for the four invalid references (A quote→B client, A order→B client, A order→B quote, A message→B order). Use assertions like:

```js
await assert.rejects(
  db.migrationQuery(`INSERT INTO quotes
    (id, account_id, client_id, customer, device, service)
    VALUES ('p1-cross-quote-client', 'p1-fk-a', 'p1-client-b', 'A', 'B', 'C')`),
  { code: '23503' },
);
```

Also delete A's client, quote, and order in turn; assert only `client_id`, `quote_id`, or `order_id` becomes `NULL`, while `account_id` remains A.

- [x] **Step 2: Verify the test fails for the intended reason.** Run `pnpm test -- --test-name-pattern="P1 references cannot cross accounts"` against the disposable local database. Before migration 0010, the old single-column FK accepts the first cross-account reference, so the expected `23503` assertion fails.

- [x] **Step 3: Add migration 0010.** First raise a descriptive exception if any existing non-null `quotes.client_id`, `orders.client_id`, `orders.quote_id`, or `messages.order_id` points to a row with another `account_id`. Add unique constraints `clients_account_id_id_key`, `quotes_account_id_id_key`, and `orders_account_id_id_key` on `(account_id, id)`. Drop `quotes_client_id_fkey`, `orders_client_id_fkey`, `orders_quote_id_fkey`, and `messages_order_id_fkey`; add named composite FKs `quotes_account_client_fkey`, `orders_account_client_fkey`, `orders_account_quote_fkey`, and `messages_account_order_fkey`:

```sql
FOREIGN KEY (account_id, client_id) REFERENCES clients (account_id, id)
  ON DELETE SET NULL (client_id)
FOREIGN KEY (account_id, client_id) REFERENCES clients (account_id, id)
  ON DELETE SET NULL (client_id)
FOREIGN KEY (account_id, quote_id) REFERENCES quotes (account_id, id)
  ON DELETE SET NULL (quote_id)
FOREIGN KEY (account_id, order_id) REFERENCES orders (account_id, id)
  ON DELETE SET NULL (order_id)
```

- [x] **Step 4: Verify the composite constraints and delete behavior.** The first client constraint above is for `quotes`; the second is for `orders`. Add `quotes_account_client_idx`, `orders_account_client_idx`, `orders_account_quote_idx`, and `messages_account_order_idx` on their matching `(account_id, foreign_key_id)` columns. Keep current account-to-account `ON DELETE CASCADE` constraints. Run `pnpm test -- --test-name-pattern="P1 references cannot cross accounts"`; expected: pass, including all four cross-account rejections and all three relation-only nullifications.

- [x] **Step 5: Commit Task 1.** Run `git diff --check`, then commit `tests/db.test.mjs` and migration 0010 as `feat(db): enforce same-tenant foreign keys`.

---

## Task 2: Apply auth RLS and route every auth query through a scoped context

**Files:** `tests/db.test.mjs`, `tests/auth.test.mjs`, `netlify/database/migrations/0011_account_security_rls.sql`, `lib/db.ts`, `lib/repos/accounts.ts`, `lib/repos/sessions.ts`, `lib/auth.ts`, `app/api/auth/route.ts`, `app/api/accounts/route.ts`, `app/api/public/quote/route.ts`, `app/vitrine/page.tsx`.

- [x] **Step 1: Write failing RLS and scoped-access tests.** Extend `tests/db.test.mjs` to cover `accounts`, `sessions`, `password_requests`, and `login_failures`. Seed two merchants, one admin, two hashed sessions, one password request, and two login-failure pairs. Assert ordinary `db.query` sees no rows and that unscoped inserts fail:

```js
for (const table of ['accounts', 'sessions', 'password_requests', 'login_failures'])
  assert.deepEqual(await db.query(`SELECT 1 FROM ${table}`), []);
```

Add scoped assertions for username-only account lookup, a session hash plus its database-derived account, one exact username/IP pair, and active-admin access. Run `pnpm test -- --test-name-pattern="P1 auth"`; before migration 0011, the catalog or unscoped-read assertion must fail because control tables lack RLS.

- [x] **Step 2: Add migration 0011 with forced policies.** Use these boundaries:

- `accounts`: SELECT by matching `app.auth_username`, database-derived `app.session_account_id`, `app.account_id` or `app.public_store_account_id` for status checks, or admin context; INSERT/UPDATE by matching login username or admin context; DELETE only by admin context.
- `sessions`: SELECT/DELETE by exact `app.session_token_hash`, sessions for the account selected by `app.auth_username`, or admin context; INSERT only for the account selected by `app.auth_username`.
- `password_requests`: access only to the merchant selected by `app.auth_username`, or admin context; public reset submission must resolve the username and write the request in one scoped transaction.
- `login_failures`: access only to the exact `app.auth_username` plus `app.login_ip` pair.

- [x] **Step 3: Verify database-only RLS.** Run the focused database test; all four auth tables show RLS enabled and forced, unscoped reads return zero rows, and unscoped writes fail with `42501`.

- [x] **Step 4: Add the scoped DB helpers.** Add `export type AdminActor = Readonly<{ id: string; role: 'admin' }>` and transaction-local helpers in `lib/db.ts`: `authTransaction(username, fn)`, `authQuery(username, text, params)`, `sessionTransaction(tokenHash, fn)`, `setSessionAccountContext(run, accountId)`, `loginFailureTransaction(username, ip, fn)`, `loginFailureQuery(username, ip, text, params)`, and `adminQuery(actor, text, params)`. `adminQuery` rejects non-admin roles and verifies the actor is an active database administrator. `setSessionAccountContext` verifies the active hashed session row belongs to `accountId` before setting the context. Reuse `runAsRuntime`; do not add a second pool or expose a generic arbitrary-settings helper.

- [x] **Step 5: Scope account repository methods.** Username lookup and own password migration use `authQuery`; account administration functions take `AdminActor` and use `adminQuery`; public page/quote checks use a status-only query with their existing transaction runner. Remove unscoped defaults for account/control-table operations. The runtime cannot directly select `password_hash`; a guarded SQL function exposes it only in login/admin contexts.

- [x] **Step 6: Scope session and lockout flows.** `accountForSession` reads the session by token hash, sets `app.session_account_id` from the returned row in that same transaction, and then reads that account. Create/revoke login sessions under the matching normalized username; admin revocation uses the verified admin account ID. Scope login-failure cleanup/count/insert to the same username/IP pair. Expired-session cleanup is limited to the account logging in.

- [x] **Step 7: Update route and public account reads.** `app/api/auth/route.ts` and `app/api/accounts/route.ts` pass identity only from the validated username or `currentAccount` result. The forgot-password operation accepts username and derives the merchant account in the same scoped statement. In the storefront and public quote approval path, query only account `status`; keep the existing public record projection unchanged.

- [x] **Step 8: Verify auth flows.** The full `pnpm test` suite passed against local PostgreSQL; recovery, lockout, login, logout, admin, suspension, deletion, storefront, quote, and new RLS tests all passed with zero skips (61/61).

- [x] **Step 9: Commit Task 2.** `git diff --cached --check` passed; migration 0011, helpers, repositories, routes, and focused tests were committed as `2c3b679 feat(security): isolate authentication data with RLS`.

---

## Task 3: Refresh the P1 record and run the complete local gate

**Files:** `docs/superpowers/specs/2026-09-26-tenant-rls-design.md`, `.superpowers/sdd/2026-09-26-tenant-rls-p1/progress.md`.

- [x] **Step 1: Update the spec and progress records.** Kept composite tenant FKs before auth-table RLS, recorded the context boundaries, and stated that P1 was validated only on disposable local PostgreSQL; left all Netlify/production checks deferred. Updated the P0 progress record with its 59-test local baseline and recorded P1 results.

- [x] **Step 2: Run every local gate.** Ran `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm exec graft build`, and `pnpm exec graft check` in order; all passed with no test skips.

- [x] **Step 3: Review and commit.** Reviewed the full branch diff, verified no application module imports `scripts/migration-db.mjs`, and confirmed `git diff --check` passes. Final review: self-review (no subagent review tool available). The spec/progress updates are committed as `docs(security): record local P1 verification`.

## Review focus

Inspect the complete diff for RLS recursion, public capability expansion, account-row projections that include password hashes, user-controlled admin/session settings, FK delete behavior, and migrations that alter pre-existing rows without consent. Run all checks locally before opening a PR.
