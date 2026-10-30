# Carrinho de venda rápida — design

## Intenção

Permitir que o balcão registre diversos produtos ou serviços em uma única venda rápida, com um único recebimento, comprovante e opção de desfazer.

## Objetivos

- Adicionar, ajustar quantidade e remover itens antes de receber.
- Somar desconto, custo, estoque e total de forma consistente.
- Baixar e restaurar todo o estoque de forma atômica.
- Mostrar todos os itens no comprovante.
- Manter as vendas antigas e a API de item único funcionando.

## Não objetivos

- Pagamentos divididos, cliente vinculado, reserva de estoque ou documento fiscal.

## Abordagens consideradas

1. Criar uma venda independente por item: simples, mas produz vários pagamentos, comprovantes e desfazimentos.
2. Guardar uma descrição concatenada na entrada de caixa: não permite restaurar estoque ou imprimir cada item com precisão.
3. Uma entrada de caixa por venda e linhas normalizadas de itens: escolhida, pois preserva os relatórios existentes e permite baixa/restauração transacional correta.

## Decisões

- A entrada em `cash_entries` continuará sendo o cabeçalho financeiro da venda.
- `quick_sale_items` guardará o snapshot de cada linha: descrição, preço, desconto, quantidade, custo e produto opcional.
- O servidor aceitará o formato antigo de um item e o novo campo `items`, mas o novo fluxo da interface enviará `items`.
- O desconto é aplicado por linha para que o comprovante e o total sejam auditáveis.
