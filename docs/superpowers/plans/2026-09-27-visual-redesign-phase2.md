# ReparoSM visual redesign — Phase 2 implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the dashboard, service orders, and clients screens with the Phase 1 design system while preserving their data, callbacks, and workflows.

**Architecture:** Reuse the existing `PageHeader`, `EmptyState`, `Button`, `Card`, `Input`, and `Label` primitives. Add only the shadcn primitives needed for this phase, then migrate each route and its dialogs in place; keep all repository/API calls and record calculations unchanged.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, shadcn/Radix UI, Node test runner through `tsx`, PostgreSQL-backed integration tests.

**Spec:** `docs/superpowers/specs/2026-09-27-visual-redesign-design.md`

## Global Constraints

- The phase is visual and structural; do not change business rules, API contracts, database schema, tenant scoping, or authentication.
- Preserve `OrdersRoute`, `OrdersTable`, `OrderCreateModal`, `OrderEditModal`, `ClientsRoute`, and `ClientModal` public props and callbacks.
- Preserve the existing `useFeedback()` signatures and keep errors and destructive confirmations visible.
- Use the Phase 1 Inter font, `#6c4cf1` brand token, and existing theme variables; status colors must remain legible in both themes.
- Keep the desktop table and mobile card representations usable at 375px, with visible keyboard focus and named controls.
- Do not touch the separate `codex/etapa3-melhorias` worktree or the primary checkout's existing user changes.
- Keep shared legacy CSS selectors used by screens outside this phase; remove only selectors exclusive to migrated screens after checking all indexed callers with Graft.
- Add no runtime package dependency; use the installed `radix-ui`, `class-variance-authority`, and shadcn CLI.

## Design Direction

- **Palette:** background (`--background`), card (`--card`), foreground (`--foreground`), muted text (`--muted-foreground`), brand (`--primary`, `#6c4cf1`), and semantic success/warning colors. Reuse tokens instead of introducing another palette.
- **Type:** keep Inter; use a clear page title, compact but readable table text, and labels in sentence case.
- **Dashboard layout:** make the repair queue the first working surface, with one row per actionable queue; place the revenue goal beside it and store totals/activity below. Avoid repeating the same four counts in two card grids.

```text
[Dashboard title and actions: Mesa | Nova OS]
[Fila da assistência (2/3 width)] [Meta de receita (1/3 width)]
[Resumo da loja]                 [Atividades recentes]
```

- **Orders layout:** title/actions, one filter toolbar, then a dense semantic table on desktop and the existing actionable cards on mobile. Stage and priority badges carry meaning through text as well as color.
- **Clients layout:** title/new-client action, compact totals, searchable directory, and inline status. Keep the mobile client cards and all contact/edit/delete actions.
- **Forms:** Radix dialogs handle focus and Escape; fields use the shared input, label, select, and textarea primitives. The four-step OS creation flow remains intact.
- **Self-critique:** a generic KPI-card grid would repeat existing counts and hide the repair workflow. The queue-first dashboard and data-dense directory make this phase specific to a repair shop; the rest of each screen stays quiet and uses existing tokens.

## Review Focus

- An empty dashboard still shows a useful queue, revenue progress at 0%, and the existing primary navigation.
- Unknown/future OS stages and client statuses remain readable with a neutral badge instead of disappearing or receiving a misleading success color.
- Dialog close, cancel, and save controls remain distinct; clicking cancel or pressing Escape must not submit a form.
- Search with no matches remains distinguishable from a truly empty account, and the clear-filter action remains available.
- At 375px, OS and client actions remain reachable without relying on the desktop table or horizontal page scrolling.

---

### Task 1: Add the shared primitives needed by Phase 2

**Files:**

- Create: `components/ui/badge.tsx`, `components/ui/dialog.tsx`, `components/ui/select.tsx`, `components/ui/table.tsx`, `components/ui/textarea.tsx`
- Test: `tests/ui-primitives.test.mjs`

**Interfaces:**

- Produces: `Badge` with `default`, `secondary`, `outline`, `destructive`, `success`, and `warning` variants; semantic table wrappers; Radix `Dialog`/`Select`; styled `Textarea`.
- Consumes: the existing `cn()` helper and installed Radix/CVA packages.

- [x] **Step 1: Add failing semantic-render tests**

Add the dynamic imports below so absent modules become assertion failures instead of loader errors. Add:

```js
const badgeModule = await import('../components/ui/badge.tsx').catch(() => null);
const tableModule = await import('../components/ui/table.tsx').catch(() => null);

test('Badge renders its status text', () => {
  assert.equal(typeof badgeModule?.Badge, 'function');
  const html = renderToStaticMarkup(
    createElement(badgeModule.Badge, { variant: 'warning' }, 'Aguardando'),
  );
  assert.match(html, /Aguardando/);
});

test('Table primitives keep headers and cells semantic', () => {
  assert.ok(tableModule);
  const html = renderToStaticMarkup(
    createElement(
      tableModule.Table,
      null,
      createElement(
        tableModule.TableHeader,
        null,
        createElement(tableModule.TableRow, null, createElement(tableModule.TableHead, null, 'OS')),
      ),
      createElement(
        tableModule.TableBody,
        null,
        createElement(
          tableModule.TableRow,
          null,
          createElement(tableModule.TableCell, null, 'OS-1'),
        ),
      ),
    ),
  );
  assert.match(html, /<table/);
  assert.match(html, /<th[^>]*>OS<\/th>/);
  assert.match(html, /<td[^>]*>OS-1<\/td>/);
});
```

- [x] **Step 2: Run the focused test and confirm the primitives are missing**

Run: `pnpm exec tsx --import ./tests/support/setup.mjs --test tests/ui-primitives.test.mjs`

Expected: both tests fail their explicit module-presence assertion because the Phase 2 primitive files do not exist yet.

- [x] **Step 3: Add the primitives from the configured shadcn registry**

Run: `pnpm exec shadcn add badge dialog select table textarea --yes`

The registry added Badge, Select, Table, and Textarea before prompting to overwrite the existing Phase 1 Button. Keep Button unchanged and add the Dialog wrapper using the installed Radix primitive. Extend Badge with success/warning variants using readable light/dark utility colors. No runtime dependency or lockfile change.

- [x] **Step 4: Run the focused test and commit**

Run: `pnpm exec tsx --import ./tests/support/setup.mjs --test tests/ui-primitives.test.mjs`, `pnpm format:check`, `pnpm lint`, and `pnpm typecheck`.

Expected: the new semantic tests and focused quality checks pass. Commit the primitives and tests as `feat(ui): add phase two shadcn primitives`.

### Task 2: Restyle the dashboard around the repair queue

**Files:**

- Modify: `components/dashboard-route.tsx`, `app/globals.css`
- Test: `tests/dashboard-ui.test.mjs`

**Interfaces:**

- Consumes: Phase 1 `PageHeader`, `Card`, `Button`, and `EmptyState`.
- Preserves: the existing seven data props and all current calculations/links.

- [x] **Step 1: Add a failing progress accessibility test**

Create `tests/dashboard-ui.test.mjs` using `node:test`, `node:assert/strict`, `createElement`, `renderToStaticMarkup`, and `DashboardRoute`. Render it with seven empty arrays and assert that the revenue goal exposes `role="progressbar"`, `aria-valuemin="0"`, `aria-valuemax="100"`, and `aria-valuenow="0"`.

- [x] **Step 2: Run the focused test and confirm the current progress is not exposed accessibly**

Run: `pnpm exec tsx --import ./tests/support/setup.mjs --test tests/dashboard-ui.test.mjs`

Expected: fail because the existing decorative progress bar has no progressbar role or value attributes.

- [x] **Step 3: Implement the queue-first dashboard**

Use `PageHeader` and `Button asChild` for the existing Mesa/OS actions. Replace duplicate attention and metrics grids with one actionable queue; use `Card` for the queue, revenue goal, store summary, and recent activity. Add the progressbar semantics and `EmptyState` for no activity. Keep the revenue, order, quote, inventory, and activity calculations unchanged.

- [x] **Step 4: Verify and remove only dashboard-exclusive CSS**

Run: `pnpm exec tsx --import ./tests/support/setup.mjs --test tests/dashboard-ui.test.mjs`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm exec graft grep` for the old selectors.

Expected: tests and quality checks pass for 0% progress, active priority destinations, and the existing revenue calculation. Use `pnpm exec graft grep` before removing the old dashboard-only selectors; retain shared selectors such as `.metrics` and any selector used by another route. Commit as `refactor(ui): restyle the dashboard around the repair queue`.

### Task 3: Restyle OS filtering, table/cards, and dialogs

**Files:**

- Modify: `components/orders-route.tsx`, `components/orders-table.tsx`, `components/order-modals.tsx`, `app/globals.css`
- Test: `tests/ui-status-badges.test.mjs`

**Interfaces:**

- Consumes: Task 1 `Badge`, `Table`, `Dialog`, `Select`, and `Textarea`, plus existing `Button`, `Card`, `Input`, `Label`, and `EmptyState`.
- Preserves: filter semantics, OS save/delete/WhatsApp requests, `SaveOrder`, and the four-step create flow.

- [x] **Step 1: Add a failing OS-stage mapping test**

Import the orders-table module as a namespace and assert that exported `orderStageVariant('Retirada')` is `success`, `orderStageVariant('Aguardando aprovação')` is `warning`, and an unknown stage maps to `secondary`.

- [x] **Step 2: Run the focused test and confirm the mapping is absent**

Run: `pnpm exec tsx --import ./tests/support/setup.mjs --test tests/ui-status-badges.test.mjs`

Expected: fail because `orderStageVariant` is not exported yet.

- [x] **Step 3: Implement the minimal mapping and restyle the OS screens**

Use the tested mapping for both desktop rows and mobile cards. Replace the legacy filter panel with a compact `Card`, use semantic `Table` wrappers on desktop, keep the existing mobile actions, and use `EmptyState` for no results. Move create/edit forms into `Dialog`; retain labels, validation, confirmation feedback, save payloads, and all endpoint calls.

- [x] **Step 4: Verify the focused test and clean exclusive OS CSS**

Run: `pnpm exec tsx --import ./tests/support/setup.mjs --test tests/ui-status-badges.test.mjs`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm exec graft grep` for the old selectors.

Expected: tests and quality checks pass for ready-to-pick-up, approval-pending, and unknown stages. Use Graft to check every removed OS selector; retain shared `.row-actions`, modal, form, and stock styles. Commit as `refactor(ui): restyle service orders and dialogs`.

### Task 4: Restyle the client directory and dialog

**Files:**

- Modify: `components/clients-route.tsx`, `components/client-modal.tsx`, `app/globals.css`
- Test: `tests/ui-status-badges.test.mjs`

**Interfaces:**

- Consumes: Task 1 `Badge`, `Table`, `Dialog`, `Select`, and `Textarea`, plus the existing Phase 1 primitives.
- Preserves: `initialClients`, `SaveClient`, search behavior, inline status save, WhatsApp, and delete confirmation.

- [x] **Step 1: Add failing client-status mapping assertions**

Import the clients-route module as a namespace and assert that exported `clientStatusVariant('Em atendimento')` is `default`, `clientStatusVariant('Concluído')` is `success`, `clientStatusVariant('Aguardando')` is `warning`, and an unknown status maps to `secondary`.

- [x] **Step 2: Run the focused test and confirm the mapping is absent**

Run: `pnpm exec tsx --import ./tests/support/setup.mjs --test tests/ui-status-badges.test.mjs`

Expected: fail because `clientStatusVariant` is not exported yet.

- [x] **Step 3: Implement the mapping and restyle the directory/form**

Use `PageHeader`, existing metric data, `Input`, `Select`, semantic `Table`, mobile client cards, and `Badge` for status/VIP. Move the form into `Dialog` and style its fields with shared primitives. Keep the save, search, status, WhatsApp, and delete code paths unchanged.

- [x] **Step 4: Verify and remove only client-exclusive CSS**

Run: `pnpm exec tsx --import ./tests/support/setup.mjs --test tests/ui-status-badges.test.mjs`, `pnpm typecheck`, `pnpm lint`, and `pnpm format:check`.

Expected: all OS/client status mapping cases pass and static checks are clean. Graft confirmed the removed client selectors were unused; shared client/quote/finance mobile-card rules remain intact. Commit as `refactor(ui): restyle the client directory and form`.

### Task 5: Integrated verification and delivery

**Files:** all files in Tasks 1–4 and this plan.

- [x] **Step 1: Run the complete local quality gate**

Run: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`

Expected: all commands pass; database-backed tests use the existing local PostgreSQL test setup.

- [x] **Step 2: Refresh Graft**

Run: `pnpm exec graft build && pnpm exec graft check`

Expected: `graph check: OK`.

- [ ] **Step 3: Check desktop/mobile and light/dark UI**

Run `pnpm dev`; inspect `/`, `/ordens`, and `/clientes` at desktop width and 375px in light and dark themes. Confirm no clipped actions, unreadable status badge, broken empty state, or dialog overflow.

Manual interactive inspection was unavailable in this session; this remains unverified and is not replaced by the automated build/tests.

- [ ] **Step 4: Review, commit, push, and open a PR**

Run `git diff --check`, inspect the complete diff, push `codex/visual-redesign-phase2`, open one PR against `main`, and wait for CI to pass before merge. Do not include changes from the separate OS-photo worktree.
