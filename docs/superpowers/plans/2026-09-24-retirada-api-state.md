# Retirada da API genérica `/api/state` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retirar a rota legada `/api/state` agora que a aplicação usa exclusivamente rotas por recurso, sem alterar o banco nem os dados de produção.

> **Nota de execução:** As ocorrências de `/api/state` neste plano são referências ao
> alvo da remoção; não representam consumidores ativos.

**Architecture:** Manter `/api/<recurso>` como única fronteira HTTP para os registros de negócio. Remover a rota genérica e seu teste legado; os testes existentes de recursos continuam cobrindo autenticação, origem, validação, isolamento e CRUD.

**Tech Stack:** Next.js 16, TypeScript strict, Node test runner, pnpm, Graft e Ponytail.

**Spec:** `docs/plans/2026-09-23-esquema-relacional.md`, seção “Fase 4 — Remoção de `records`”.

## Global Constraints

- Não alterar schema, migrações ou dados do Postgres.
- Não alterar os arquivos de configuração do usuário já modificados e não relacionados.
- Não adicionar dependências.
- Não executar operações CRUD na produção durante esta etapa.
- Não remover rotas por recurso nem alterar seus contratos.
- A retirada só pode ocorrer após confirmar que não existem consumidores internos de `/api/state`.

## Review Focus

- Nenhum componente ou rota da aplicação continua chamando `/api/state`.
- Rotas por recurso continuam sendo a única implementação usada pelos componentes.
- A vitrine pública e `/api/public/quote` não dependem da rota genérica.
- O build do Next não descobre referências quebradas após a remoção.
- O Graft permanece sincronizado e `graft/` não entra no commit.

---

### Task 1: Confirmar o limite da remoção

**Files:**

- Inspect: `app/api/state/route.ts`
- Inspect: `tests/state.test.mjs`
- Inspect: all tracked application files

- [x] **Step 1: Confirmar referências internas**

Run:

```bash
rg -n --hidden --glob '!node_modules' --glob '!.next' --glob '!graft' '/api/state|api/state|\\?type=' app components lib tests
```

Expected: only the legacy route test and documentation references remain; all application fetches target `/api/<resource>`.

- [x] **Step 2: Confirmar que os testes de recursos cobrem o contrato usado**

Read `tests/resources.test.mjs` and keep its existing cases unchanged. Do not create replacement tests unless a coverage gap is found in the current resource tests.

### Task 2: Remover a rota e o teste legados

**Files:**

- Delete: `app/api/state/route.ts`
- Delete: `tests/state.test.mjs`
- Modify: `docs/plans/2026-09-23-esquema-relacional.md`

- [x] **Step 1: Atualizar a documentação do plano**

Replace statements that describe `/api/state` as the active application contract with the current state: application consumers use resource routes, and the generic route is retired in this increment. Keep the database migration history intact.

- [x] **Step 2: Remover os arquivos obsoletos**

Delete only the generic route and its dedicated compatibility test. Do not touch resource routes, repositories, or user-owned configuration files.

- [x] **Step 3: Confirmar ausência de referências**

Run:

```bash
rg -n --hidden --glob '!node_modules' --glob '!.next' --glob '!graft' '/api/state|api/state' app components lib tests docs
```

Expected: no application or test references; any remaining historical mention must be updated or explicitly marked as historical documentation.

### Task 3: Verificar e registrar

- [x] **Step 1: Refresh and check the context graph**

Run:

```bash
pnpm exec graft build
pnpm exec graft check
```

- [x] **Step 2: Run the existing verification suite**

Run:

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Manual production testing is intentionally skipped; the authenticated smoke test already passed in the previous step.

- [x] **Step 3: Review and commit only this lot**

Run `git diff --check` and `git status --short`, verify the eight unrelated user configuration files remain untouched, then commit:

```bash
git add app/api/state/route.ts tests/state.test.mjs .prettierignore docs/plans/2026-09-23-esquema-relacional.md docs/superpowers/plans/2026-09-23-reparosm-foundation.md docs/superpowers/specs/2026-09-23-reparosm-foundation-design.md docs/superpowers/plans/2026-09-24-retirada-api-state.md
git commit -m "refactor: retire generic state api"
```
