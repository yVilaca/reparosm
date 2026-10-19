# Assinatura na tela

## Por que

A landing promete "OS com fotos e assinatura" e "assinatura direto na tela", mas
o sistema só imprime a linha em branco para assinar com caneta. A loja que usa
tablet ou celular no balcão precisa imprimir, pedir a assinatura no papel e
guardar o papel. Com a assinatura na tela, a impressão já sai assinada, e o
papel continua sendo uma opção.

## O que muda

Cada OS pode ter duas assinaturas, as mesmas linhas que a impressão já tem:

- **Cliente:** quem deixa o aparelho.
- **Assistência:** quem recebe pela loja.

Onde assinar:

- **Na prévia da impressão** (`/ordens/<id>/imprimir`): botões "Assinar na tela"
  para o cliente e para a assistência. Assinou, a prévia já mostra a assinatura
  e é só imprimir. É o caminho principal: abrir a impressão, passar o tablet ao
  cliente, imprimir.
- **Na ficha da OS:** bloco "Assinaturas", com quem assinou e quando, "Assinar
  na tela", "Assinar de novo" e "Remover".

A janela de assinatura mostra o que está sendo assinado (número da OS, aparelho,
problema relatado, serviço, valor e os termos da assistência), uma declaração
curta, o nome de quem assina (o cliente da OS já vem preenchido) e a área de
assinatura. Funciona com dedo, mouse e caneta; com caneta, o traço acompanha a
pressão e a mão apoiada na tela é ignorada. Dá para limpar e desfazer o último
traço. Um risco acidental não conta: é preciso assinar de verdade.

Na impressão, a assinatura aparece sobre a linha, com o nome e "Assinado na tela
em dd/mm/aaaa às hh:mm". Sem assinatura, a linha continua em branco, como hoje.
Vale para a impressão completa, a reduzida e a de várias OS.

## Prova do que foi assinado

Junto com a imagem fica o registro de quem e quando: nome de quem assinou, data
e hora, quem da loja colheu a assinatura, IP e navegador, e uma cópia do que
estava na tela (número, cliente, aparelho, problema, serviço, valor e termos)
com o SHA-256 dela. O servidor monta essa cópia a partir da OS gravada, não do
que o navegador mandou.

Se depois da assinatura mudarem os dados de entrada (cliente, aparelho,
problema relatado ou termos), a ficha avisa e oferece assinar de novo, e a
impressão diz "assinado antes de mudanças em: aparelho". Mudanças de serviço,
valor e etapa não contam: elas acontecem depois do diagnóstico, e o valor é
aprovado no orçamento.

## Segurança

- Só a loja dona da OS lê e grava as assinaturas (RLS por loja).
- A imagem é conferida no servidor: só PNG válido, até 256 KB e 2048 px.
- Na impressão a assinatura vai embutida como imagem; nada de SVG ou HTML vindo
  do navegador.
- Excluir a OS exclui as assinaturas.

## Dados

`order_signatures`: loja, OS, papel (`customer` ou `shop`), imagem PNG, nome,
assinado em, quem colheu, IP, navegador, conteúdo assinado (jsonb) e o hash dele.
Uma assinatura por papel por OS; assinar de novo substitui. Migração só de
expansão (0031).

## Fora desta versão

- Assinatura pelo celular do próprio cliente, por link.
- Assinatura no checklist impresso (PR #30) e na retirada do aparelho.
- Assinatura padrão da assistência, salva uma vez para todas as OS.
