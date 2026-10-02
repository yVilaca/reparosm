# ReparoSM: financeiro ligado à ordem de serviço

## Objetivo

Transformar a aba Financeiro de um bloco de notas de valores soltos em um
caixa que acompanha o processo da OS. Motivação do usuário: a aba "está muito
solta e pouco útil", "deve se ligar ao processo de ordem de serviço" e o fluxo
de caixa "hoje está muito abstrato".

Ao final, a aba responde três perguntas concretas que hoje ela não responde:

1. Quanto entrou e saiu **hoje**, quebrado por forma de pagamento.
2. Como está **este mês** comparado ao mesmo período do mês anterior.
3. Quanto ainda **vai entrar**, separando o que está pronto para retirada do
   que ainda está em serviço.

E o dinheiro de uma OS passa a nascer da própria OS, em vez de ser redigitado
à mão no financeiro.

## Estado atual (verificado no código)

- `cash_entries` guarda entradas (`kind = 'in'`) e saídas (`kind = 'out'`) com
  `description`, `reference` (texto livre), `value`, `method` e `date`
  (`netlify/database/migrations/0004_rest.sql:20`). **Não há vínculo com a
  OS.**
- A OS carrega `labor`, `parts`, `cost` e `total` como colunas reais
  (`0003_core.sql:74-77`) e nada disso gera lançamento financeiro. Fecha-se
  uma OS de R$ 350 e o caixa não toma conhecimento.
- `components/finance-route.tsx:108-116` soma _todos_ os lançamentos já
  existentes, sem recorte de período. O painel compara a receita acumulada de
  toda a história contra uma meta de R$ 50.000 chumbada no código
  (`components/dashboard-route.tsx:37`).
- Ambas as páginas carregam a tabela inteira a cada abertura
  (`app/(painel)/pagamentos/page.tsx`), sem filtro nem paginação.
- O projeto já tem o padrão de FK multi-tenant composta: a migração 0010
  trocou `messages.order_id` por
  `FOREIGN KEY (account_id, order_id) REFERENCES orders (account_id, id) ON DELETE SET NULL (order_id)`,
  apoiada na constraint `orders_account_id_id_key`.
- `lib/warranty.ts:23` exporta `todayInSaoPaulo()`, já usado para data de
  retirada e cálculo de garantia: o "hoje" do produto **já é** São Paulo.
- Duas rotas alteram etapa de OS: `/ordens` e `/mesa`. Ambas renderizam os
  mesmos componentes (`order-modals.tsx`, `orders-table.tsx`); a Mesa tem
  ainda seu próprio avanço de etapa (`components/mesa-route.tsx:77`). A
  criação chumba `stage: 'Recebido'` e não oferece seletor
  (`components/order-modals.tsx:344`).

## Decisões de produto

Fixadas em conversa com o usuário; o desenho inteiro depende delas.

- **O pagamento acontece inteiro na retirada.** Sem entrada/sinal, sem
  parcelamento, sem fiado. Consequência: **uma OS tem no máximo um
  recebimento.**
- **A cobrança é confirmada por diálogo**, não criada em silêncio: ao entrar
  em Retirada, abre-se uma confirmação com o valor e a forma de pagamento.
- **O custo digitado na OS não vira saída de caixa.** O caixa registra apenas
  dinheiro que de fato entrou ou saiu; o custo continua servindo só ao cálculo
  de margem. Lançar também o custo da OS contaria o mesmo dinheiro duas vezes
  para quem já lança a compra de peças como despesa.
- **O valor cobrado é sempre o total atual da OS.** Desconto negociado no
  balcão se faz alterando o total da OS, não o recebimento — caso contrário a
  via impressa que o cliente leva diverge do caixa.
- **Alterar o total depois de pago não gera cobrança.** O recebimento registra
  o dinheiro que entrou; o total representa o valor comercial atual. A
  divergência é exibida, não cobrada.
- **`orders.status` permanece independente.** O pagamento não altera esse
  campo: ele alimenta outro fluxo (o filtro de "ordens em atendimento" do
  painel) e confundi-los teria efeito colateral fora do financeiro.

## Modelo de dados

Migração nova (`netlify/database/migrations/0015_cash_entry_order_link.sql`):

```sql
ALTER TABLE cash_entries ADD COLUMN order_id text;

ALTER TABLE cash_entries ADD CONSTRAINT cash_entries_account_order_fkey
  FOREIGN KEY (account_id, order_id) REFERENCES orders (account_id, id)
  ON DELETE SET NULL (order_id);

-- Despesa nunca pertence a uma OS: só entradas podem ter vínculo.
ALTER TABLE cash_entries ADD CONSTRAINT cash_entries_order_income_only
  CHECK (kind = 'in' OR order_id IS NULL);

-- "Uma OS tem no máximo um recebimento" vira garantia do banco, não
-- esperança do código: resolve duas confirmações simultâneas.
CREATE UNIQUE INDEX cash_entries_order_income_idx
  ON cash_entries (account_id, order_id) WHERE kind = 'in' AND order_id IS NOT NULL;
```

Notas de implementação:

- A FK **tem que ser composta**. Uma FK para `orders (id)` apenas não garante
  que lançamento e OS pertençam à mesma conta.
- Não é preciso um índice adicional em `(account_id, order_id)`: o CHECK
  garante que todo registro com `order_id` preenchido tem `kind = 'in'`,
  então o índice único parcial já cobre 100% das linhas vinculadas.
  (`messages` precisou de um índice comum porque não tem essa restrição.)
- Nenhuma mudança de RLS ou de GRANT: a política `tenant_isolation` de
  `cash_entries` é por linha (`account_id`) e o GRANT da 0007 é no nível da
  tabela, então a coluna nova já entra coberta.
- Se a OS for excluída, o lançamento **permanece** no caixa e perde apenas o
  vínculo. O dinheiro entrou de verdade; apagá-lo falsearia o histórico.

**Não existe campo de pagamento em `orders`.** O estado "paga" é derivado: a
OS tem entrada vinculada. Uma única fonte de verdade, nada para sincronizar,
impossível divergir.

## Escrita: a cobrança da OS

### Resumo de leitura

As leituras de OS passam a expor um resumo, nunca uma coluna persistida:

```ts
payment: { id: string; value: number; method: string; date: string } | null
```

Com ele a interface distingue quatro situações: total zero (não cobra),
recebido com valor batendo, recebido com divergência, e pagamento pendente.

O resumo é montado em `lib/repos/orders.ts` por `LEFT JOIN` em `cash_entries`
(`kind = 'in'`), tanto no `get` quanto no `list` — o `list` alimenta a
listagem de `/ordens` e a Mesa, que precisam do indicador em cada linha. O
índice único parcial já serve esse join; não há consulta por OS em laço.

### Gatilho

`lib/orders.ts` já detecta transição de etapa para decidir a notificação de
WhatsApp, mas compara **a etapa crua enviada pelo cliente** com a persistida
(`lib/orders.ts:64` usa `order.stage`, não o `stage` normalizado da linha 46).
Uma OS em "Recebido" salva sem o campo dispara hoje uma notificação de mudança
de etapa sem mudança nenhuma. **Esta spec corrige esse bug**: a comparação
passa a ser `previousStage` contra `nextStage`, ambos normalizados, e tanto a
notificação quanto a cobrança passam a usá-la.

A cobrança é devida quando, e somente quando:

1. a etapa normalizada entrou em `'Retirada'` agora (`previousStage !== 'Retirada'`
   e `nextStage === 'Retirada'`, incluindo o caso sem OS anterior); **e**
2. `total > 0`; **e**
3. não existe entrada vinculada à OS.

O servidor devolve esse sinal junto da resposta de `saveOrder()`. A regra mora
no servidor; as duas telas apenas obedecem abrindo o diálogo compartilhado.

### Endpoint dedicado

O recebimento de OS **não** pode passar pelo CRUD genérico de pagamentos. O
upsert do `simpleRepo` faz `ON CONFLICT (id) DO UPDATE SET` em _todas_ as
colunas declaradas (`lib/repos/simple.ts:99-104`): bastaria uma edição vinda
do modal atual — que desconhece `orderId` — para gravar `order_id = NULL` e
apagar o vínculo em silêncio.

**O mecanismo de proteção é a omissão: `order_id` não entra em `cashColumns`.**
O `simpleRepo` só sabe gravar colunas declaradas, então, sem declará-la, as
quatro garantias saem de graça, sem nenhum código de defesa:

- lançamento manual novo nasce com `order_id = NULL` (coluna ausente do
  `INSERT`, default nulo);
- apenas o endpoint dedicado cria o vínculo, com SQL própria;
- edição de recebimento vinculado preserva o vínculo (coluna fora do
  `DO UPDATE SET`);
- payload do cliente não consegue forjar vínculo — o campo sequer é lido.

A leitura do histórico com a OS de origem não depende disso: ela vem das
consultas próprias de `lib/repos/cash.ts`, não do `simpleRepo`.

O endpoint dedicado:

- recebe apenas **forma de pagamento e data**;
- valida no servidor que a OS existe, pertence à conta e tem `total > 0`;
- **ignora qualquer valor enviado pelo cliente** e grava o `orders.total`
  atual — a igualdade fica garantida no servidor, não na interface;
- define `account_id`, `kind = 'in'` e `order_id` no servidor;
- responde **409** à violação do índice único (a OS já foi paga em outra aba),
  nunca 500. A tela que recebeu o 409 recarrega o resumo `payment` da OS e
  mostra que o recebimento já foi registrado, em vez de insistir na cobrança.

### Diálogo

Um único componente `<OrderPaymentDialog>`, usado por `/ordens`, `/mesa` e
`/pagamentos` (este último para recuperar cobranças canceladas, via o grupo
"pronto pra retirar"): valor exibido **fixo e não editável** (o total atual da
OS), forma de pagamento obrigatória, data com default em São Paulo, e a frase
"para cobrar outro valor, altere o total da OS".

**Cancelar o diálogo não cria lançamento e não reverte a etapa:** a OS fica em
Retirada e pendente. Como ela já está em Retirada, _não haverá nova transição_
— a cobrança não reapareceria sozinha. A via de recuperação é explícita: tanto
o indicador "Pagamento pendente" na OS quanto a lista "pronto pra retirar" do
financeiro oferecem a ação **"Registrar recebimento"**, que abre o mesmo
diálogo e chama o mesmo endpoint.

### Casos de borda

| Situação                                  | Comportamento                                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| OS de garantia / total R$ 0               | Não cobra. Sem valor, sem cobrança.                                                                                                        |
| Aparelho volta na garantia e é reentregue | Não cobra de novo: já existe entrada vinculada.                                                                                            |
| OS criada já em "Retirada"                | A interface não produz isso (criação chumba "Recebido"), mas a API aceita qualquer etapa; a regra trata por ser escrita sobre a transição. |
| Total editado depois de paga              | O lançamento não muda. A OS passa a exibir "Recebido R$ 350 de R$ 400".                                                                    |
| OS cancelada depois de paga               | Nada automático. Havendo devolução, lança-se uma saída de estorno à mão.                                                                   |
| Lançamento excluído                       | A OS volta a contar como não paga; a ação "Registrar recebimento" fica disponível de novo.                                                 |
| OS excluída                               | O lançamento permanece, sem vínculo (`ON DELETE SET NULL`).                                                                                |

## Leitura: de onde sai cada número

Módulo novo `lib/repos/cash.ts`, com agregação em SQL. O `simpleRepo` é CRUD
genérico e não é ferramenta de relatório; somar array no navegador é o que
hoje obriga a carregar o histórico inteiro a cada abertura da aba.

Separação de responsabilidades:

- `lib/repos/cash.ts` — totais, períodos, formas de pagamento, histórico
  filtrado, a receber e divergências (**leitura**);
- endpoint/repositório de pagamento de OS — criação e edição do recebimento
  vinculado, concorrência e preservação do vínculo (**escrita**).

### Fuso horário

Toda data do financeiro é São Paulo, como já é o resto do produto:

```sql
-- data de competência de um lançamento
COALESCE(date, (created_at AT TIME ZONE 'America/Sao_Paulo')::date)
```

O "hoje" não é calculado no SQL: chega como parâmetro (ver "Data de
referência injetável" abaixo).

Dois motivos, ambos verificados:

- `date` é anulável e `dateOrNull` transforma string vazia em `NULL`. Sem o
  `COALESCE`, um lançamento sem data sumiria de _todos_ os períodos ao mesmo
  tempo em que continuaria somando no total geral — um relatório que não
  fecha.
- `CURRENT_DATE`/`now()` usariam o fuso do servidor (UTC em produção): o dia
  viraria às 21h de Brasília. É também por isso que o "hoje" vem de fora, já
  resolvido em São Paulo.

O mesmo vale na escrita: o default de data do formulário usa hoje
`new Date().toISOString().slice(0, 10)` (`components/money-modal.tsx:43`), que
entre 21h e meia-noite já devolve o dia seguinte. Passa a usar
`todayInSaoPaulo()`, que já existe.

### Data de referência injetável

Toda função de leitura de `lib/repos/cash.ts` recebe um `asOfDate` opcional
(`YYYY-MM-DD`) e **sempre** passa essa data ao SQL como parâmetro. O default
é `todayInSaoPaulo()`, calculado em TypeScript.

Decisão deliberada: `now()` **não aparece** nas consultas de período. Ter o
"hoje" às vezes vindo do SQL e às vezes do TypeScript criaria dois caminhos
que podem divergir; com um só, o que o teste exercita é exatamente o que roda
em produção. A conversão de fuso continua no SQL apenas onde é sobre dado
armazenado (o `COALESCE` da competência, que converte `created_at`).

Sem isso, os testes de fronteira — fechamento de 31 de março contra fevereiro,
virada de mês, lançamento às 21h30 — seriam impossíveis de escrever de forma
determinística: dependeriam do dia em que a suíte roda.

### Hoje (fechamento do dia)

Entradas, saídas, saldo e quebra por forma de pagamento (`GROUP BY method`),
com `method` nulo ou vazio agrupado como **"Não informado"** — nunca um balde
silencioso.

### Mês contra mesmo período anterior

Comparar mês parcial com mês inteiro mente. A comparação é **acumulada até o
mesmo número de dias decorridos**:

```
hoje          = $asOfDate            -- parâmetro; default todayInSaoPaulo()
inicio_mes    = date_trunc('month', hoje)::date
decorridos    = hoje - inicio_mes
anterior_ini  = (inicio_mes - interval '1 month')::date
anterior_fim  = LEAST(anterior_ini + decorridos, inicio_mes - 1)
```

O `LEAST` não é detalhe: em 31 de março, `anterior_ini + 30` cairia em 3 de
março e a janela "anterior" vazaria para dentro do mês corrente. O limite é o
último dia do mês anterior — não se compara 31 dias contra um mês de 28.

Rótulos na interface: **"Este mês"** e **"Mesmo período anterior"**. A variação
é exibida em valor absoluto **e** percentual; com período anterior igual a
zero, o percentual aparece como "—" (sem divisão por zero).

### A receber

Sai de `orders`, não do caixa: OS com `total > 0`, `status <> 'Cancelado'` e
**sem** entrada vinculada, em dois grupos, cada um com soma e contagem:

- **Pronto pra retirar** — `stage = 'Retirada'`;
- **Em andamento** — demais etapas.

Uma OS concluída, entregue e sem recebimento aparece no primeiro grupo: é
exatamente o vazamento que esse número existe para expor.

O grupo "pronto pra retirar" **lista as OS**, não apenas o total: é onde mora
a ação "Registrar recebimento" para quem cancelou o diálogo. "Em andamento"
pode ficar só com soma e contagem — não há ação a tomar ali.

### Conferir (divergências)

Bloco **separado** de "A receber", e deliberadamente: "A receber" responde
quanto ainda deve entrar, e uma OS que recebeu R$ 350 e teve o total alterado
para R$ 400 não tem R$ 400 nem R$ 50 a receber — a decisão de produto é que
alteração posterior não gera cobrança. Somá-la ali corromperia o número-âncora.

O bloco cobre **duas** condições, ambas decorrentes de decisões de produto que
deliberadamente não agem sozinhas:

**1. Divergência de valor** — OS com entrada vinculada cujo `value` difere do
`total` atual. Exibe três informações, nunca uma soma líquida (que deixaria
uma diferença positiva cancelar uma negativa):

- quantidade de OS divergentes;
- **total a completar**: soma de `total - recebido` onde positivo;
- **total recebido acima**: soma de `recebido - total` onde negativo.

OS cancelada **entra** nesta contagem quando houver divergência: pode exigir
devolução ou ajuste manual. Continua fora de "A receber" e sem ação
automática.

**2. Cancelada com recebimento** — OS com `status = 'Cancelado'` e entrada
vinculada, **independente de haver divergência**. Linha própria, com contagem
e soma do valor recebido (não de um delta: o que está em questão é o dinheiro
inteiro, não uma diferença).

A condição 2 não estava na revisão e eu a acrescentei: a decisão da Parte 1 é
que cancelar uma OS paga não faz nada automático. Sem esta linha, o caso mais
grave — serviço cancelado com o dinheiro do cliente retido — seria justamente
o único invisível, porque uma OS cancelada cujo recebimento bate com o total
não é "divergente" por nenhum critério de valor.

### Histórico

Filtrado no banco por período (Hoje / Este mês / Mês passado), não mais
carregando a tabela inteira. Cada linha vinculada mostra a OS de origem.

**Destino do link — decisão:** `/ordens?busca=<código>`. Não existe rota de
detalhe de OS (as únicas rotas por OS são `/ordens` e `/ordens/[id]/imprimir`)
e a busca da listagem é estado local (`components/orders-route.tsx:50`), sem
leitura de query param. A implementação semeia o estado inicial da busca a
partir do parâmetro — cerca de cinco linhas em `orders-route.tsx` — o que
também torna a listagem deep-linkável.

Descartada a alternativa de apontar para `/ordens/[id]/imprimir`: quem clica
numa linha do caixa quer ver a OS, não cair numa prévia de impressão.

## Tela

Aba Financeiro, de cima para baixo:

1. Cabeçalho com os botões de lançamento manual, que continuam existindo —
   despesa e receita avulsa não vêm de OS.
2. **Hoje**: entradas, saídas, saldo e quebra por forma de pagamento.
3. **Este mês**: receita, despesa e resultado, com o mesmo período anterior ao
   lado e a variação.
4. **A receber**: pronto pra retirar e em andamento, com soma e contagem.
5. **Conferir**: quantidade, total a completar e total recebido acima.
6. **Histórico**: seletor de período e coluna da OS.

Na OS, o resumo `payment` vira um indicador: "Recebido R$ 350", "Recebido
R$ 350 de R$ 400", "Pagamento pendente" (com ação de registrar), ou nada
quando o total é zero.

## Painel (ajuste adjacente)

A primeira tela do produto hoje soma a receita de toda a história contra uma
meta fixa de R$ 50.000 (`components/dashboard-route.tsx:36-38`), o que ficaria
incoerente com o financeiro novo. Passa a usar **receita acumulada do mês**,
com o rótulo **"Meta mensal"** e o progresso calculado contra os mesmos
R$ 50.000.

A atividade recente continua como está. A meta segue chumbada e igual para
todo lojista — torná-la configurável está **fora** desta spec.

## Fora de escopo

- Pagamento parcial, entrada/sinal, parcelamento e fiado.
- Estorno automático de OS cancelada (registra-se saída manual).
- Meta mensal configurável por loja.
- Baixa de estoque por OS e custo de peça derivado do estoque.
- Reescrita do painel ou do Assistente IA.
- Rota de detalhe de OS (`/ordens/[id]`).

## Testes

Suíte atual: `node:test` com banco Postgres descartável por arquivo
(`tests/support/db.mjs`). Os testes que de fato justificam esforço:

Os testes de período usam `asOfDate` para fixar a data; sem isso dependeriam
do dia em que a suíte roda.

- **Fuso**: lançamento às 21h30 de São Paulo cai no dia correto em "Hoje" e no
  mês. É o teste que paga por toda a discussão de timezone.
- **Virada de mês**: com `asOfDate = 31 de março`, a janela "mesmo período
  anterior" termina em 28/29 de fevereiro e não invade março. Inclui um ano
  bissexto.
- **Concorrência**: duas confirmações simultâneas → uma entra, a outra recebe
  409 pelo índice único. Há precedente na suíte
  (`public quote approval creates one linked order when answered concurrently`).
- **Invariantes do banco**: despesa com `order_id` rejeitada pelo CHECK;
  lançamento não consegue apontar para OS de outra conta (FK composta).
- **Vínculo protegido por omissão**: salvar um recebimento vinculado pelo CRUD
  genérico não zera `order_id`; e um payload com `orderId` não cria vínculo
  por esse caminho.
- **Gatilho**: OS em "Recebido" salva sem o campo não dispara cobrança nem
  notificação (regressão do bug de etapa crua); total zero não cobra; OS já
  paga não cobra de novo; cancelar o diálogo deixa a OS pendente e recuperável
  pela ação "Registrar recebimento".
- **Servidor ignora valor do cliente**: enviar um valor diferente do total
  grava o total.
- **Leituras**: baldes de a receber; divergências positivas e negativas sem se
  cancelarem; OS cancelada com recebimento aparecendo em "Conferir" mesmo sem
  divergência de valor; e `method` vazio caindo em "Não informado".

## Sequência sugerida

Três blocos, cada um entregando algo verificável sozinho:

1. **Banco e escrita** — migração, resumo `payment` nas leituras de OS,
   correção da comparação de etapa, endpoint dedicado e o
   `<OrderPaymentDialog>` em `/ordens` e `/mesa`. Ao final disso o dinheiro da
   OS já nasce da OS.
2. **Leituras** — `lib/repos/cash.ts` com os cinco blocos (hoje, mês, a
   receber, conferir, histórico filtrado), o `asOfDate` injetável e a correção
   de fuso no default de data do formulário.
3. **Telas** — a aba Financeiro reorganizada sobre o módulo de leitura,
   incluindo a ação "Registrar recebimento" no grupo "pronto pra retirar"
   (terceiro ponto de uso do `<OrderPaymentDialog>`, que fecha o caso do
   diálogo cancelado), o link `/ordens?busca=` e o ajuste da métrica do
   painel.

## Riscos e pontos de atenção

- `ON DELETE SET NULL (column)` exige PostgreSQL 15+. Produção roda PG 18
  (Neon) e o CI roda PG 17 — atendido, mas a migração quebraria em um Postgres
  mais antigo.
- A correção da comparação de etapa altera **quando a notificação de WhatsApp
  dispara**. É uma correção de bug (hoje dispara sem mudança real), mas muda
  comportamento observável e deve ser citada na descrição do PR.
- A migração roda em banco com dados: `order_id` nasce nulo em todos os
  lançamentos existentes. Nenhum lançamento histórico será vinculado
  retroativamente — todos aparecem no histórico sem OS, o que é verdade.
- Existe trabalho em paralelo no mesmo repositório (outros worktrees). Os
  arquivos de maior risco de conflito são `components/finance-route.tsx`,
  `components/dashboard-route.tsx`, `lib/orders.ts` e `lib/repos/rest.ts`.
