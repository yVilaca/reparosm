# ReparoSM: reformulação de Contas a pagar

## Objetivo

Pedido do usuário: "reformulação inteligente no contas a pagar. Primeiro veja
como funciona, depois elenque como um lojista esperaria que funcionasse e
compare para ver o que precisa mudar. Foque em usabilidade e utilidade. Hoje
vejo MUITAS falhas." O usuário pediu condução de ponta a ponta sem perguntas,
então as decisões abaixo foram tomadas e justificadas aqui em vez de
consultadas.

## Como funciona hoje

Base analisada: `payables` (migração 0018) mais o trabalho de recorrência não
commitado de outro agente (0019, `lib/payable-recurrence.ts`,
`components/payables-route.tsx`, `lib/repos/payables.ts`,
`app/api/payables/route.ts`). Em produção a tabela está vazia e a 0019 nunca
foi aplicada.

- Uma lista única mistura contas em aberto e pagas, ordenada por vencimento.
  Sem busca, sem filtro, sem agrupamento.
- Resumo: "Em aberto" (valor), "Vencidas" (só quantidade, sem valor) e
  "Total listado" (contagem sem utilidade).
- Cada linha em aberto tem três botões: "Marcar como paga" (primário),
  "Editar" e "Excluir" (vermelho).
- Pagar abre um `window.prompt('Forma de pagamento:')`: texto livre, sem data,
  sem valor. A saída no caixa sai sempre com a data de hoje e o valor original.
- Conta paga não tem nenhuma ação: não se edita, não se exclui, não se desfaz.
- O formulário começa em "Conta fixa / recorrente" com repetição **mensal já
  marcada**: registrar uma conta avulsa sem prestar atenção cria uma conta que
  se repete todo mês.
- A escolha entre "Fixa", "Compra" e "Outra" é obrigatória e só serve para a
  tela de Compras e para habilitar a recorrência.
- Recorrência: fica uma ocorrência em aberto; pagar cria a próxima.
- A tela de Compras é a mesma tela filtrada por `source = 'purchase'`.
- A saída gerada no caixa (`cash-payable-…`) aparece no Caixa com Editar e
  Excluir, que falham com "Acesso negado" / "Identificador inválido", porque as
  rotas do Caixa só aceitam ids `expense-…`.
- `payables.cash_entry_id` não tem chave estrangeira: nada impede que a saída
  suma e a conta continue "paga".

## Como o lojista espera que funcione

Dono ou atendente de assistência técnica, no balcão ou no celular:

1. **Abrir e saber o que pagar e quanto dinheiro reservar**: o que já venceu,
   o que vence hoje, o que vence na semana, com o total de cada grupo.
2. **Registrar rápido**: descrição, valor e vencimento. Repetir todo mês
   (aluguel, internet, sistema) com um clique. **Parcelar uma compra**
   ("telas em 3x no boleto"), o caso mais comum de compra a prazo.
3. **Ter o boleto ou a chave Pix à mão** para pagar no app do banco sem
   procurar o papel.
4. **Pagar em poucos toques**, informando quando pagou (pode ter sido ontem),
   quanto pagou (juros, multa ou desconto) e a forma, a mesma lista do Caixa.
5. **Corrigir um engano**: desfazer um pagamento marcado por erro, com o
   estorno da saída no caixa.
6. **Consultar o que já pagou** no mês, com data e forma.

## Comparação e falhas

| #   | Expectativa                         | Hoje                                                         | Gravidade |
| --- | ----------------------------------- | ------------------------------------------------------------ | --------- |
| 1   | Ver o que vence na semana e quanto  | Lista única; vencidas sem valor                              | Alta      |
| 2   | Pagar informando data e valor       | `window.prompt` só com a forma, em texto livre               | Alta      |
| 3   | Desfazer um pagamento errado        | Impossível; conta paga trava                                 | Alta      |
| 4   | Conta avulsa por padrão             | Padrão é mensal recorrente                                   | Alta      |
| 5   | Saída do caixa coerente com a conta | Botões do Caixa falham com mensagem enigmática; sem FK       | Alta      |
| 6   | Parcelar compra                     | Não existe                                                   | Média     |
| 7   | Código do boleto/Pix à mão          | Não existe                                                   | Média     |
| 8   | Histórico de pagas, por mês         | Mistura com as abertas, sem data nem forma                   | Média     |
| 9   | Forma de pagamento padronizada      | Texto livre (Pix, pix, PIX) quebra a soma por forma no Caixa | Média     |
| 10  | Encontrar uma conta                 | Sem busca                                                    | Baixa     |
| 11  | Cadastro sem burocracia             | Escolha obrigatória Fixa/Compra/Outra                        | Baixa     |
| 12  | Ação clara por linha                | Três botões por linha, um vermelho                           | Baixa     |
| 13  | Ir direto ao pagamento pelo "Hoje"  | O link leva à lista, sem destacar a conta                    | Baixa     |

## Decisões

- **Tela organizada por vencimento** em duas abas: _A pagar_ (grupos
  Vencidas, Vence hoje, Próximos 7 dias, Mais adiante, Sem vencimento, cada um
  com total) e _Pagas_ (por mês, padrão o mês atual).
- **Resumo com três números úteis**: vencido (valor e quantidade), próximos 7
  dias (valor e quantidade) e pago no mês.
- **Diálogo de pagamento** com valor pago (padrão o valor da conta), data
  (padrão hoje, nunca futura) e forma (a mesma lista fixa do Caixa). A
  diferença aparece como juros ou desconto. A saída no caixa usa o valor e a
  data informados.
- **Desfazer pagamento**: volta a conta para "em aberto" e apaga a saída. Se o
  pagamento tinha gerado a próxima ocorrência de uma recorrente e ela ainda
  está em aberto, ela é removida; se já foi paga, o desfazer é recusado com
  explicação (desfaça a seguinte primeiro).
- **Tipo simplificado**: "Despesa" (aluguel, energia, serviços) ou "Compra"
  (peças, materiais, equipamentos), com Despesa como padrão. O valor legado
  `fixed` continua aceito e é exibido como Despesa.
- **Repetição opcional e desligada por padrão**: mensal, semanal ou anual,
  apenas para despesas. Mantém o modelo de uma ocorrência aberta por vez.
- **Parcelamento na criação**: de 2 a 48 parcelas mensais, informando o valor
  total; as parcelas são iguais e os centavos que sobram vão para a última. Cada
  parcela é uma conta própria ("Parcela 2 de 3"). Parcelamento e repetição são
  mutuamente exclusivos.
- **Código de pagamento**: campo opcional para linha digitável do boleto ou
  chave Pix, com botão "Copiar código" na linha.
- **Conta paga não se edita**: para corrigir, desfaz-se o pagamento. Evita que
  conta e saída do caixa divirjam.
- **Uma ação primária por linha**: "Pagar"; o resto (copiar código, editar,
  excluir) fica num menu.
- **Busca** por descrição, fornecedor ou categoria; **sugestões** de fornecedor
  e categoria a partir do que a loja já usou.
- **Link direto**: `/contas-pagar?pagar=<id>` abre o diálogo de pagamento; o
  "Pagar" do painel Hoje passa a usá-lo.
- **Caixa protegido**: as rotas de saída recusam editar ou excluir uma saída
  gerada por conta paga, com mensagem dizendo para desfazer o pagamento em
  Contas a pagar; e uma FK composta impede, no banco, apagar a saída de uma
  conta paga.

## Modelo de dados

A migração `0019` (não aplicada em lugar nenhum) é reescrita para cobrir a
reformulação inteira:

- `series_id` agrupa ocorrências de uma repetição ou parcelas de uma compra.
- `generated_from` aponta a ocorrência cujo pagamento gerou esta, com índice
  único (no máximo uma próxima por ocorrência, mesmo com cliques simultâneos).
- `recurrence` e `recurrence_day`, como no trabalho original, mas permitidos
  para qualquer tipo exceto Compra.
- `installment_number` e `installment_count`.
- `payment_code`, `paid_amount` e `paid_on` (data de negócio do pagamento).
- CHECKs: repetição coerente; parcela coerente; conta paga tem `paid_on`,
  `paid_amount > 0` e `cash_entry_id`; conta em aberto não tem nenhum deles.
- FK composta `payables (account_id, cash_entry_id) → cash_entries (account_id,
id)` com `ON DELETE RESTRICT`, e `generated_from` com FK composta para
  `payables` (`ON DELETE SET NULL`).

## API

- `POST /api/payables` `{ data, id? }`: cria (gerando parcelas quando pedido)
  ou edita uma conta em aberto. Resposta `{ record, records }`.
- `PATCH /api/payables` `{ id, action: 'pay', amount?, paidOn?, method }`:
  paga. Sem `action`, vale `pay` com valor e data padrão (compatível com os
  testes existentes). Resposta `{ record, nextRecord? }`.
- `PATCH /api/payables` `{ id, action: 'undo' }`: desfaz o pagamento.
- `DELETE /api/payables?id=`: exclui conta em aberto.

## Fora de escopo

- Anexar arquivo do boleto (o código de pagamento cobre o uso diário).
- Pagamento parcial de uma conta.
- Entrada da compra no estoque a partir da conta a pagar.
- Relatório de despesas por categoria.
- Itens "vence hoje" no painel Hoje.

## Testes

- Funções puras: agrupamento por vencimento, divisão de parcelas e datas das
  parcelas.
- Banco (rodam localmente contra bancos descartáveis no Neon e no CI): parcelas
  criadas na mesma transação; pagar com valor, data e forma; desfazer, inclusive
  com recorrente; recusa de desfazer quando a seguinte já foi paga; recusa de
  editar conta paga; Caixa recusando editar ou excluir saída de conta paga.
- Tela: grupos e totais, diálogo de pagamento, menu de ações.

## Coordenação com trabalho paralelo

Outro agente trabalha na mesma pasta (ordens e recebíveis). Esta reformulação
assume o trabalho de contas a pagar que estava parado: os arquivos dele nessa
área viram a base e são reescritos aqui. Nada fora de contas a pagar é
alterado, exceto o link do "Pagar" no painel e a rota de saídas do Caixa.
