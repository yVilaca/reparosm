# Receber e pagar: uma tela só

## Problema

O dinheiro da assistência estava espalhado em quatro entradas do menu, cada uma
com um formato diferente:

| Entrada          | O que mostrava                                                |
| ---------------- | ------------------------------------------------------------- |
| Contas a receber | OS com valor e sem recebimento, numa lista sem ordem de prazo |
| Contas a pagar   | Contas por vencimento, com pagamento e histórico              |
| Compras          | As mesmas contas a pagar, filtradas por tipo Compra           |
| Caixa            | O que já entrou e saiu, e de novo um bloco "A receber"        |

O lojista de assistência técnica não pensa em "contas a receber" e "contas a
pagar" como módulos. Ele pensa: _quem me deve, o que eu devo, e o que preciso
resolver hoje_. Ter que abrir duas telas para responder isso, e ainda uma
terceira só para compras, é a maior fonte de confusão.

## O que o lojista espera

1. Abrir uma tela e ver, de cara, quanto tem para receber e quanto tem para
   pagar.
2. Ver primeiro o que está atrasado ou é para hoje, dos dois lados juntos.
3. Resolver ali mesmo: receber a OS, pagar a conta, cobrar o cliente pelo
   WhatsApp.
4. Conferir o que já foi pago e recebido nos últimos meses, e desfazer um
   engano.
5. Cadastrar uma conta nova em poucos campos.

## Desenho

**Uma tela, "Receber e pagar"** (`/receber-e-pagar`), no lugar de Contas a
receber, Contas a pagar e Compras no menu. O Caixa continua sendo o registro do
que já aconteceu; esta tela é o que ainda vai acontecer.

### Resumo

Dois cartões lado a lado, também no celular, um para cada direção do dinheiro:

- **Para receber**: valor das OS prontas para cobrar (concluídas sem pagamento
  e prontas para retirada), quantas são, e quanto ainda está no conserto.
- **Para pagar**: valor das contas vencidas e das que vencem nos próximos 7
  dias (até dd/mm), quantas são, e quanto disso já venceu.

Não há "saldo previsto": sem o saldo do caixa, um "falta R$ X" assustaria sem
ser verdade.

### Lista única por prazo

As pendências dos dois lados ficam numa só lista, nos mesmos grupos:

| Grupo           | Receber                                                  | Pagar                         |
| --------------- | -------------------------------------------------------- | ----------------------------- |
| Atrasados       | OS concluída sem pagamento há 1 dia ou mais              | Conta vencida                 |
| Hoje            | OS concluída hoje sem pagamento; OS pronta para retirada | Conta que vence hoje          |
| Próximos 7 dias | —                                                        | Conta que vence em até 7 dias |
| Mais adiante    | —                                                        | Conta que vence depois        |
| No conserto     | OS ainda em serviço, com valor                           | —                             |
| Sem vencimento  | —                                                        | Conta sem data                |

Cada grupo mostra quanto entra e quanto sai. A idade da OS usa a última
atualização, como o painel Hoje, para os dois mostrarem os mesmos dias.

Cada linha deixa a direção óbvia sem depender só de cor: ícone de seta (entra
ou sai), sinal no valor (+ ou −) e o verbo do botão ("Receber" ou "Pagar"). O
botão é preenchido só no que é atrasado ou de hoje. O resto das ações fica num
menu: na OS, abrir a OS e cobrar ou avisar pelo WhatsApp; na conta, copiar o
código, editar e excluir.

Um filtro "Tudo · Receber · Pagar" e a busca (cliente, OS, aparelho,
descrição, fornecedor, categoria) servem os dois lados.

### Pagos e recebidos

Segunda visão da mesma tela: os recebimentos de OS e as contas pagas dos
últimos 3 meses, por mês, com quanto entrou e saiu em cada um. Dá para desfazer
os dois (o recebimento volta a OS para "a receber"; o pagamento volta a conta
para "em aberto"). O histórico completo continua no Caixa.

### Links e rotas antigas

- `?ver=receber` ou `?ver=pagar` abre com o filtro aplicado.
- `?pagar=<id>` abre o pagamento da conta (o "Pagar" do painel Hoje usa).
- `/contas-receber`, `/contas-pagar` e `/compras` redirecionam para a tela
  nova, mantendo os parâmetros.
- Compra continua sendo um tipo de conta a pagar, escolhido no formulário.

## Fora de escopo

- Conta a receber avulsa, sem OS (venda fiado de acessório, por exemplo).
- Recebimento parcial ou sinal de OS.
- Saldo do caixa e projeção de fluxo de caixa.
- Tirar o bloco "A receber" do Caixa (o arquivo está em edição por outro
  agente).

## Testes

- Funções puras: classificação da OS no grupo certo, agrupamento misto com
  totais por direção, resumo, busca e histórico por mês.
- Banco: OS em aberto com idade e etapa, sem OS paga, cancelada, zerada ou de
  outra loja; recebimentos da janela de 3 meses.
- Tela: grupos mistos, filtros, ações por direção, links diretos e estados
  vazios.
