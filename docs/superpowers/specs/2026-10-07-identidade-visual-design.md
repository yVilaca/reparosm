# Identidade visual: a marca nas telas, não só no menu

## Por que

O logo tem personalidade (violeta, uma tinta quase preta arroxeada e um
letreiro geométrico pesado), mas as telas eram o kit padrão: preto e cinza
neutros, Inter, cartões soltos e etiquetas em pílula. A primeira passada levou
a marca só ao menu, e no modo escuro o menu (tinta arroxeada) brigava com o
conteúdo (cinza neutro). A ideia é parecer minimalista como Stripe ou Notion,
mas com detalhes que só fazem sentido numa assistência técnica.

Complementa [linguagem visual](2026-10-03-linguagem-visual-design.md): os tons
com significado continuam valendo.

## Base

| Nome    | Claro     | Escuro    | Uso                                         |
| ------- | --------- | --------- | ------------------------------------------- |
| Tinta   | `#1B1636` | `#ECEBF5` | texto (no lugar do preto) e o menu no claro |
| Violeta | `#6C4CF1` | `#7556F4` | ação: botão principal, item ativo, foco     |
| Bancada | `#F4F4F8` | `#13111F` | fundo das páginas                           |
| Névoa   | `#E5E3EE` | branco 9% | filetes e bordas                            |
| Grafite | `#6B6783` | `#A3A0B9` | texto secundário                            |

- Os cinzas puxam para a tinta. No escuro, a tela inteira é feita da tinta e o
  menu fica um degrau mais fundo (`#0D0B17`), então menu e conteúdo são da
  mesma família nos dois temas.
- Tipografia numa família só, a do letreiro: **Red Hat Text** para ler e
  **Red Hat Display** para títulos de página e de janela e números de resumo.
- Checkbox e rádio nativos usam o violeta (`accent-color`).

## Assinatura: o trilho da OS

O caminho do aparelho pela bancada (Recebido → Aguardando peça → Em serviço →
Retirada → Concluído) em cinco segmentos; os segmentos até a etapa atual ficam
na cor dela. É a mesma figura em todo lugar onde a etapa aparece:

- lista de OS e Mesa: compacto, ao lado do nome da etapa (`StageTrack`);
- ficha da OS: com os nomes das etapas no topo (`StageSteps`);
- Início: o "Fluxo dos aparelhos" é o trilho grande, um segmento por etapa com
  a quantidade embaixo.

## Detalhes

- **Etiqueta do código** (`RefTag`): OS-50 e ORC-20 aparecem como a etiqueta
  colada no aparelho, o tipo apagado e o número em destaque, separados por um
  picote. Leitores de tela ouvem o código inteiro. Em listas de dinheiro e de
  orçamentos, ela abre a linha de contexto (`ListRow` com `tag`).
- **Faixa de resumo** (`StatGroup`): os números de uma tela numa superfície só,
  separados por filetes, em vez de quatro cartões soltos.
- Etiquetas de status com canto de 6px, não pílula; cabeçalho de tabela em
  texto pequeno e apagado.

## Onde está

- `app/globals.css` (tokens dos dois temas) e `app/layout.tsx` (fontes).
- `components/ui/stage-track.tsx`, `components/ui/ref-tag.tsx`,
  `components/ui/stat-card.tsx` (`StatGroup`).

Telas novas que mostram etapa de OS usam o trilho; códigos de registro usam a
etiqueta; números de resumo vão numa `StatGroup`.
