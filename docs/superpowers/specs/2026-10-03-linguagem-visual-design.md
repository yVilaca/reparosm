# Linguagem visual: cor com significado

## Por que

A tela "Receber e pagar" ficou clara porque a cor diz alguma coisa: seta verde
entra, seta vermelha sai, texto vermelho está atrasado, âmbar é para hoje, e o
botão roxo cheio só aparece no que é urgente. As outras telas usavam preto,
branco e roxo puro para tudo: faixas roxas cheias, abas e filtros roxos, etapas
de OS em roxo cheio, cartões de resumo idênticos e vários botões iguais por
linha. Sem hierarquia, tudo parece igualmente importante e a tela parece ter
mais informação do que tem.

## Regras

1. **Cor tem significado, sempre o mesmo.**

   | Tom        | Cor      | Quando                                                     |
   | ---------- | -------- | ---------------------------------------------------------- |
   | Neutro     | cinza    | novo, normal, inativo, sem valor                           |
   | Informação | azul     | em andamento (diagnóstico, em reparo, em atendimento)      |
   | Sucesso    | verde    | pronto, concluído, aprovado, recebido, dinheiro que entra  |
   | Atenção    | âmbar    | esperando alguém, vence em breve, estoque baixo, hoje      |
   | Problema   | vermelho | atrasado, urgente, recusado, sem estoque, dinheiro que sai |
   | Marca      | roxo     | só o botão principal da tela e o item ativo do menu        |

2. **Roxo não é status, aba, filtro nem faixa.** Abas e alternâncias usam o
   controle segmentado neutro; filtros usam pílulas (a ativa fica escura);
   destaques usam um cartão suave com ícone, não um bloco roxo cheio.
3. **Todo número de resumo tem ícone** num círculo tingido com o tom do que
   mede. O valor só ganha cor quando a cor muda a leitura (vencido, negativo).
4. **Uma ação visível por linha ou cartão.** Ela fica contornada, e preenchida
   só quando é urgente; o resto vai para o menu "…". Excluir nunca fica exposto
   numa grade.
5. **O normal não vira etiqueta.** Prioridade "Normal", por exemplo, não aparece;
   só o que foge do normal (Urgente, Garantia).

## Peças compartilhadas

- `components/ui/tone.ts`: tons e classes (chip, texto, superfície, variante de
  etiqueta).
- `lib/status-tones.ts`: o tom de cada status do negócio (etapa e prioridade da
  OS, pagamento, orçamento, cliente, garantia, estoque).
- `IconChip`, `StatCard`, `Segmented`, `FilterPills`, `SoftBanner` e `RowMenu`
  em `components/ui/`.

Telas novas usam essas peças em vez de definir cores próprias.
