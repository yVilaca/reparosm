<!-- graft:start -->
## Graft — repo context graph

This repo is indexed in `graft/`: small linked markdown nodes that explain each
system and carry exact file:line spans, kept in sync with the code through git.

For ANY task here — understanding how something works, finding where code lives,
or scoping a change — get context from the graph before grepping or opening
source files. Re-ask freely (it's cheap) and reuse literal identifiers you
already have (symbol, error string, file name) as the query. New to this repo?
Run `graft map` first — a token-budgeted orientation (dir clusters, hubs,
hotspots), no LLM, no key.

- Run `graft ask "<your question>" --source` → ranked nodes with the relevant
  code spans inlined (each hit's ≤8-line crux by default; `--full` for whole
  definitions when the crux isn't enough). Match the tool to the task shape:
  for understanding or editing, the top node IS the answer — cite its
  `covers:` file:line spans and edit straight from `--source`. For
  exhaustive tasks ("every occurrence / every caller of this pattern"), ranked
  results are top-N, not complete — run `graft grep "<literal>"` instead
  (exhaustive over indexed files, grouped by enclosing symbol), falling back
  to raw `grep -rn` only for unindexed files.
- `graft skeleton <file>` → every definition's signature + span, ~10× cheaper
  than reading the file; use it to skim an API surface.
- `graft callers <symbol>` gives precomputed, exact edges — who calls this.
  Add `--direction out` for what it calls, or `--depth N` to walk
  transitively for the full blast radius. For structural questions, skip
  ranking and use this directly.
- Or browse: `graft/INDEX.md` lists every node; follow the links.
- Monorepos and folders of multiple repos rank fairly across sub-projects —
  hits carry `[scope/]` labels naming which one they're from. Narrow with
  `graft ask "<task>" --in <scope>/` once you know where you're working.

If a returned span is truncated ("+N more lines"), open the file at that exact
range before finalizing. Only open source files when a node genuinely lacks a
needed detail, and then at the exact file:line the node points to — never
re-read whole files.

After big code changes, refresh the graph with `graft build` (deterministic,
no API key, $0).
<!-- graft:end -->

Graft is a project devDependency (not global): if `graft` is not on PATH, run it as `pnpm exec graft ...`. Run `pnpm install` first on a fresh clone, then `pnpm exec graft build`.

## Regra obrigatória do projeto

O Graft deve ser usado em toda tarefa neste repositório, sem exceção:

1. Antes de entender ou alterar código, execute `pnpm exec graft check`; se o grafo estiver stale, execute `pnpm exec graft build`.
2. Para explorar o código, use primeiro `pnpm exec graft map`, `ask`, `grep`, `skeleton` ou `callers`; só depois recorra a buscas/leitura direta quando necessário.
3. Depois de alterações relevantes, execute `pnpm exec graft build` e `pnpm exec graft check` antes de finalizar.
4. Nunca inclua o cache local `graft/` em commits, salvo solicitação explícita.

## Regra obrigatória do Ponytail

O Ponytail deve ser aplicado em toda tarefa de código neste repositório, no modo `full` por padrão:

1. Antes de criar algo, verificar se ele é necessário, se já existe no projeto, se a biblioteca padrão ou a plataforma resolve o problema e escolher a menor solução que funcione.
2. Preferir reutilização, exclusão e soluções nativas; não adicionar abstrações, dependências ou boilerplate sem necessidade comprovada.
3. Manter validação em limites de confiança, tratamento de erros, segurança e acessibilidade; a simplificação nunca pode removê-los.
4. Para lógica não trivial, deixar um teste ou verificação executável mínimo.
5. Marcar atalhos deliberados com `ponytail:` e registrar o limite conhecido e o caminho de evolução.
