# ReparoSM: reformulação visual com shadcn/ui

## Objetivo

Substituir o CSS artesanal atual (`app/globals.css`, ~4.300 linhas, mais
`accounts.css`/`mesa.css`/`recovery.css`/`whatsapp.css`) por um sistema de
design consistente baseado em Tailwind CSS v4 + shadcn/ui, cobrindo todas as
telas do painel e as públicas (vitrine, orçamento público, impressão de OS).
Motivação do usuário: o visual atual parece genérico/datado e denso demais;
o objetivo é um resultado moderno e minimalista (referência: Linear, Stripe,
Notion), mantendo o roxo `#6c4cf1` como cor de marca, com suporte nativo a
tema claro e escuro.

Este é um incremento puramente visual/estrutural de UI. Nenhuma regra de
negócio, contrato de API, schema de banco ou comportamento funcional muda.

## Estado atual e restrições

- Next.js 16.2.6, React 19.2.6, TypeScript strict, pnpm. Tailwind foi
  removido deliberadamente antes (`chore: validate environment and remove
  unused tailwind`); esta reformulação reintroduz Tailwind a pedido explícito
  do usuário, revertendo aquela decisão.
- Não há `tailwind.config.*` nem `postcss.config.*` remanescentes — a
  reinstalação parte do zero, usando Tailwind v4 (config via CSS/`@theme`,
  compatível com Next 16 App Router).
- `components/feedback.tsx` expõe `useFeedback()` (`notify`, `confirm`),
  consumido em dezenas de arquivos. A interface pública (assinatura das duas
  funções) não muda; apenas o HTML/CSS interno do toast e do diálogo de
  confirmação é substituído pelos componentes `Sonner`/`AlertDialog` do
  shadcn.
- **Branch paralela em andamento:** o worktree `reparosm-tenant-rls-design`
  (branch `codex/etapa3-melhorias`) tem trabalho não mesclado de RLS
  multi-tenant e upload de fotos de OS, tocando vários arquivos que este
  incremento também vai tocar (`order-modals.tsx`, `orders-route.tsx`,
  `mesa-route.tsx`, `warranties-route.tsx`, `films-route.tsx`,
  `app/globals.css`). Recomendação: revisar/corrigir os achados críticos
  daquela branch (armazenamento de fotos em disco não funciona no Netlify) e
  mesclá-la antes de iniciar a Fase 2 deste redesenho, para evitar conflitos
  grandes de merge. A Fase 1 (fundação, layout raiz, navegação, login) não
  toca nenhum arquivo em conflito e pode começar imediatamente.
- Sem dependências de teste de snapshot visual hoje; a verificação de UI é
  manual (`pnpm dev` + checagem no navegador), como já vem sendo feito nesta
  sessão.

## Design

### Fundação

- `npx shadcn@latest init` configura Tailwind v4, `components.json`, e as
  variáveis de tema em `app/globals.css` (`@theme`, `:root` para claro,
  `.dark` para escuro). `--primary` mapeado para `#6c4cf1` (`--purple`
  atual); demais tokens (`--background`, `--foreground`, `--muted`,
  `--border`, `--destructive`, etc.) seguem a paleta neutra padrão do
  shadcn ("Slate"), ajustada depois se necessário.
- Fonte: substituir `Arial, Helvetica, sans-serif` por **Inter**, carregada
  via `next/font/google` (build-time, sem dependência de rede em runtime).
- Toggle de tema: componente simples baseado em `next-themes` (dependência
  padrão do ecossistema shadcn), persistido em `localStorage`.
- `components/ui/` recebe os componentes shadcn conforme forem necessários
  (copiados via CLI, não são uma dependência de pacote): `button`, `card`,
  `input`, `label`, `select`, `textarea`, `dialog`, `alert-dialog`, `badge`,
  `table`, `tabs`, `dropdown-menu`, `sonner`, `separator`, `skeleton`.

### Componentes primitivos e mapeamento

Cada elemento repetido no CSS atual vira um primitivo shadcn, usado por
todas as telas (isto é o que resolve a inconsistência entre telas):

| Padrão atual (CSS ad-hoc) | Primitivo shadcn |
| --- | --- |
| `.panel`, `.page-panel` | `Card` |
| `<button>` estilizado por classe | `Button` (variants: default/outline/ghost/destructive) |
| `<input>`/`<select>`/`<textarea>` em formulários | `Input`/`Select`/`Textarea` + `Label` |
| `.modal-backdrop`/`.modal` (order-modals, client-modal, part-modal, money-modal, quote-modal) | `Dialog` |
| `.feedback-dialog` (confirmação) | `AlertDialog` |
| `.toast`/`.toast-region` | `Sonner` (mantendo `useFeedback()` como fachada) |
| tabelas de listagem (orders-table, etc.) | `Table` |
| badges de status/prioridade/estágio | `Badge` (variants por cor semântica) |
| cabeçalho de cada tela do painel | novo primitivo local `PageHeader` (título + ação principal), composto com `Button` |
| estados vazios ("Nenhum registro") | novo primitivo local `EmptyState` |

`PageHeader` e `EmptyState` não existem no shadcn (são específicos deste
produto); ficam em `components/ui/page-header.tsx` e
`components/ui/empty-state.tsx`, seguindo a mesma convenção visual dos
demais primitivos (Tailwind + `cva` quando houver variantes).

### Fases de entrega

Reaproveitando o padrão de fases já usado neste repositório
(`codex/ux-p0`…`p5`), cada fase é um PR separado, revisável e testável
isoladamente:

1. **Fundação** — init do Tailwind/shadcn, tokens de tema, fonte, toggle
   claro/escuro, `app/layout.tsx`, `components/sidebar-nav.tsx`,
   `components/login.tsx`, `components/feedback.tsx` (por trás do mesmo
   `useFeedback()`).
2. **Telas de maior uso** — `dashboard-route.tsx`, `orders-route.tsx`,
   `orders-table.tsx`, `order-modals.tsx`, `clients-route.tsx`,
   `client-modal.tsx`.
3. **Telas restantes do painel** — `stock-route.tsx`, `part-modal.tsx`,
   `finance-route.tsx`, `money-modal.tsx`, `quotes-route.tsx`,
   `quote-modal.tsx`, `warranties-route.tsx`, `films-route.tsx`,
   `accounts-route.tsx`, `support-route.tsx`, `business-assistant-route.tsx`,
   `my-shop-route.tsx`, `data-tools-route.tsx`, `after-sales-route.tsx`,
   `report-route.tsx`, `mesa-route.tsx`.
4. **Público** — `public-store-route.tsx` (vitrine), página de orçamento
   público, página de impressão de OS (`app/o/[id]`).

Ao final de cada fase, os arquivos CSS legados relacionados àquelas telas
são removidos (`accounts.css` ao final da fase 3, `mesa.css` na fase 3,
`recovery.css`/`whatsapp.css` conforme as telas correspondentes forem
migradas); `app/globals.css` só é totalmente esvaziado ao final da fase 4.

## Acessibilidade

Os primitivos Radix (base do shadcn) já trazem foco gerenciado, roles ARIA
e navegação por teclado corretos para diálogo, dropdown, tabs e select —
uma melhoria em relação ao HTML manual atual, não uma regressão. O padrão
`aria-live`/`role="status"` do toast atual é preservado pelo `Sonner`.

## Verificação

- Cada fase: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`
  e `pnpm build` continuam verdes (refatoração visual não deve quebrar
  nenhum teste existente, já que nenhuma regra de negócio muda).
- Checagem manual no navegador (`pnpm dev`) de cada tela tocada na fase,
  em ambos os temas (claro/escuro) e em largura mobile, antes de abrir o PR.
- `graft build && graft check` ao final de cada fase, por regra do projeto.
