# ReparoSM Foundation Implementation Plan

> **Documento histórico:** este plano foi executado antes da migração para rotas por
> recurso. As referências à API genérica descrevem o estado daquela etapa e não são
> contratos ativos do aplicativo.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Format the codebase once and establish shared types, validation, and business helpers without changing the existing route or database architecture.

**Architecture:** Keep `/api/state` as the compatibility boundary for this increment. Move data contracts to `lib/types.ts`, pure validation to `lib/validation.ts`, formatting to `lib/format.ts`, and order/client derivation to `lib/orders.ts`; routes retain HTTP, authentication, ownership, persistence, and response responsibilities.

**Tech Stack:** Next.js 16.2.6, React 19, TypeScript 5.9, Node test runner, pnpm, Prettier 3.

**Spec:** `docs/superpowers/specs/2026-09-23-reparosm-foundation-design.md`

## Global Constraints

- Do not change the database schema or migration in this increment.
- Do not migrate the app to resource routes, Server Actions, Server Components, CSS Modules, or `proxy.ts` in this increment.
- Do not add runtime dependencies.
- Treat network payloads as `unknown` until validation.
- Preserve the user's existing commit and do not reset, stash, or rewrite unrelated history.
- The format commit must not include semantic changes that predate this work.

## Review Focus

- A 10- or 11-digit Brazilian phone receives country code `55` exactly once; invalid short input must not produce a usable WhatsApp link.
- A client match must prefer an exact normalized phone match and otherwise use a case-insensitive normalized name match within the same account.
- An invalid state payload must return HTTP 400 before persistence and must never be able to set another account's `_accountId`.
- Legacy records with optional fields remain readable and public responses continue exposing only their allowlisted fields.
- A format-only commit must remain distinguishable from the user's previous semantic commit and be ignored by git blame.

---

### Task 1: Add Prettier and isolate the formatting change

**Files:**

- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Create later: `.git-blame-ignore-revs`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.github/workflows/ci.yml`
- Format: tracked TypeScript, TSX, MJS, MTS, JSON, CSS, and config files that are not part of the user's previous semantic change

**Interfaces:**

- Produces `pnpm format` and `pnpm format:check` scripts.
- Produces a CI step that fails when formatting differs.

- [ ] **Step 1: Add the formatting configuration and scripts**

Use a minimal Prettier configuration with `singleQuote: true`, `semi: true`, `trailingComma: "all"`, and `printWidth: 100`. Ignore generated and dependency directories (`.next`, `node_modules`, `coverage`, `dist`, `out`) and lockfiles. Add:

```json
"format": "prettier --write .",
"format:check": "prettier --check ."
```

Add `pnpm format:check` to the CI job after dependency installation and before linting.

- [ ] **Step 2: Install the existing-compatible development dependency**

Run `pnpm add --save-dev prettier@3` and inspect the lockfile diff. Do not use npm or regenerate `package-lock.json`.

- [ ] **Step 3: Run Prettier and inspect the file boundary**

Run `pnpm format`. Before staging, compare `git diff` and `git diff --cached` and remove any file whose diff would mix the user's semantic change with formatting. Do not use reset or checkout; preserve all unrelated changes.

- [ ] **Step 4: Verify the check**

Run: `pnpm format:check`

Expected: exit 0 and every checked file reports `All matched files use Prettier code style!`.

- [ ] **Step 5: Commit only the formatting changes**

Stage only files whose diff is formatting-only plus the Prettier configuration/scripts. Commit with:

```bash
git commit -m "chore: format source with prettier"
```

- [ ] **Step 6: Register the format commit for blame**

Write the format commit hash, one per line, to `.git-blame-ignore-revs`, stage only that file, and commit with:

```bash
git commit -m "chore: ignore formatting commit in git blame"
```

Expected: `git show --format=%H --no-patch HEAD~1` matches the line in `.git-blame-ignore-revs`.

### Task 2: Add shared types and test-first validators

**Files:**

- Create: `lib/types.ts`
- Create: `lib/validation.ts`
- Create: `tests/validation.test.mjs`
- Modify: `lib/db.ts`, `lib/public-data.ts`, `lib/auth.ts`, `lib/whatsapp.ts`

**Interfaces:**

- Produces `RecordType`, `RecordData`, `StoredRecord`, and `validateRecord(type, value)`.
- `validateRecord` accepts `unknown` and returns `{ ok: true, data }` or `{ ok: false, error }`.
- Produces typed `PublicAccount`, `Order`, `Quote`, `Part`, `Film`, `Client`, `Payment`, `Expense`, `Automation`, `Message`, `Tutorial`, and `Shop` contracts.

- [ ] **Step 1: Write failing validator tests**

Add tests for one valid and one invalid payload for each business record type, plus these boundary cases:

```js
assert.equal(
  validateRecord('order', { code: 'OS-1', customer: 'Ana', device: 'iPhone', problem: 'Não liga' })
    .ok,
  true,
);
assert.equal(validateRecord('order', { code: 'OS-1', device: 'iPhone' }).ok, false);
assert.equal(validateRecord('part', { name: 'Tela', stock: 'x', price: 100 }).ok, false);
assert.equal(
  validateRecord('quote', {
    customer: 'Ana',
    phone: '11999999999',
    device: 'iPhone',
    service: 'Troca',
  }).ok,
  true,
);
assert.equal(validateRecord('unknown', {}).ok, false);
```

- [ ] **Step 2: Run the validator tests and verify the expected failure**

Run: `node --test tests/validation.test.mjs`

Expected: FAIL because `lib/validation.ts` and `validateRecord` do not exist yet.

- [ ] **Step 3: Implement minimal shared types and validators**

Define the record union and data map in `lib/types.ts`. In `lib/validation.ts`, use small helpers for object checks, required strings, optional strings, finite numbers, booleans, arrays, and enum values. Return normalized data without trusting a caller-provided `_accountId`; the route adds ownership after validation.

- [ ] **Step 4: Run validator tests and the typecheck**

Run: `node --test tests/validation.test.mjs && pnpm typecheck`

Expected: validator tests pass and TypeScript exits 0.

- [ ] **Step 5: Replace untyped record boundaries**

Update `lib/db.ts` to return `StoredRecord` with `unknown`-safe JSON decoding, update public field filtering to consume typed records, and replace `any` in account and WhatsApp library boundaries with `unknown`/typed response shapes. Preserve behavior for legacy stored rows.

- [ ] **Step 6: Run the full existing tests**

Run: `pnpm test`

Expected: all existing tests plus the validator tests pass with zero failures.

### Task 3: Extract format and order/client business logic test-first

**Files:**

- Create: `lib/format.ts`
- Create: `lib/orders.ts`
- Create: `tests/format.test.mjs`
- Create: `tests/orders.test.mjs`
- Modify: `app/api/state/route.ts`, `app/api/public/quote/route.ts`, `lib/whatsapp.ts`, `app/page.tsx`, `app/vitrine/page.tsx`, `app/o/[id]/page.tsx`, `app/relatorio/page.tsx`

**Interfaces:**

- Produces `formatMoney(value)`, `normalizePhone(value)`, `whatsappPhone(value)`, `whatsappUrl(phone, message)`, and `hasValidWhatsapp(value)`.
- Produces `findMatchingClient(clients, order, accountId)`, `clientFromOrder(order, accountId, orderId, existing, now)`, and `orderFromQuote(quote, quoteId, accountId, answeredAt)`.

- [ ] **Step 1: Write failing format and order tests**

Cover the exact rules:

```js
assert.equal(normalizePhone('(11) 99999-8888'), '11999998888');
assert.equal(whatsappPhone('(11) 99999-8888'), '5511999998888');
assert.equal(whatsappPhone('5511999998888'), '5511999998888');
assert.equal(hasValidWhatsapp('123'), false);
assert.match(whatsappUrl('11999998888', 'Olá mundo'), /^https:\/\/wa\.me\/5511999998888\?text=/);
assert.match(formatMoney(1234.5), /R\$/);
```

Test that same-account phone matching wins, same-account name matching is case-insensitive, cross-account records are ignored, and `orderFromQuote` produces an `Order` with `quoteId`, owner, totals, and initial status.

- [ ] **Step 2: Run the new tests and verify they fail**

Run: `node --test tests/format.test.mjs tests/orders.test.mjs`

Expected: FAIL because the new modules and exports do not exist yet.

- [ ] **Step 3: Implement the minimal pure helpers**

Implement the functions in `lib/format.ts` and `lib/orders.ts` without database or browser dependencies. Keep `clientFromOrder` responsible for preserving existing client fields while updating order-derived fields.

- [ ] **Step 4: Run the focused tests**

Run: `node --test tests/format.test.mjs tests/orders.test.mjs`

Expected: PASS with zero failures.

- [ ] **Step 5: Refactor route orchestration**

In `/api/state`, validate the body before `saveRecord`, call the shared client matcher/deriver for orders, and keep HTTP status and authorization behavior unchanged. In the public quote route, build the approved order with `orderFromQuote` and update the client through the shared helper. Handle malformed JSON with 400 responses.

- [ ] **Step 6: Replace duplicated UI/server helpers**

Replace local money and phone implementations with imports from `lib/format.ts`. Preserve user-visible copy and WhatsApp behavior. Update component props and API response handling to use the shared record types instead of `any` where touched.

- [ ] **Step 7: Run the complete verification suite**

Run: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`

Expected: every command exits 0; lint may retain only warnings in untouched legacy files, but no new errors are introduced.

- [ ] **Step 8: Commit the first batch**

Review `git diff --check` and `git status --short`, stage only files belonging to this first batch, and commit with:

```bash
git commit -m "refactor: type shared records and centralize business rules"
```
