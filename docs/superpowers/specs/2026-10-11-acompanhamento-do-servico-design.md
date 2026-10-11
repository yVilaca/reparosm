# Acompanhamento do serviço

## Por que

Quem deixa o celular na assistência fica sem o aparelho e sem notícia. As
perguntas são sempre as mesmas, e chegam pelo WhatsApp ou pelo telefone:

1. **Já ficou pronto?**
2. **Em que pé está?** Recebido, esperando peça, em reparo.
3. **Quanto vou pagar e o que já paguei?**
4. **Onde e quando eu busco?**
5. **Depois de entregue: até quando vale a garantia?**

O link de acompanhamento responde as cinco sem a loja precisar parar para
responder, do mesmo jeito que o link do orçamento já deixa o cliente aprovar
sozinho. A loja manda o link uma vez, e o cliente abre quando quiser.

## O que o cliente vê

Uma página só, pensada para celular, em `/acompanhar#t=<token>`:

- **Quem é a loja:** logo, nome e, embaixo, endereço, horário, telefone e
  botões "Falar no WhatsApp" (com a OS na mensagem), "Ligar" e "Como chegar".
- **A situação, em uma frase grande**, com cor de significado: "Pronto para
  retirada", "Em reparo", "Aguardando peça", "Recebemos seu aparelho",
  "Entregue" ou "Serviço cancelado", mais uma linha explicando o que acontece
  agora (ex.: "Pode vir buscar. Leve este número: OS-123.").
- **Progresso em 4 passos:** Recebido, Em reparo, Pronto, Entregue. "Aguardando
  peça" aparece como um momento do passo "Em reparo".
- **Linha do tempo com data e hora** de cada mudança de etapa.
- **O serviço:** aparelho, problema relatado, serviço e o número da OS.
- **Valores:** total, se já foi pago e quanto falta pagar na retirada. Sem total
  definido, a página diz que o valor será informado pela loja.
- **Garantia:** depois da entrega, "Garantia até dd/mm/aaaa" e o texto de
  garantia da loja.
- **Última atualização** ("Atualizado hoje às 14:32").

O cliente é tratado pelo primeiro nome. A página não pede login nem instala
nada.

## O que nunca aparece

A página monta a resposta a partir de uma lista fechada de campos. Nunca saem:
senha e padrão de desbloqueio, IMEI, telefone e sobrenome do cliente,
observações internas, técnico, custo, lucro, peças com custo, fotos e qualquer
outra OS. Teste automatizado confere isso.

## Segurança

- **Token:** 32 bytes aleatórios (256 bits) em base64url, gerado no servidor.
  No banco (`order_tracking_links`) fica só o hash SHA-256: quem lê o banco não
  consegue montar um link válido.
- **O token vai depois do `#`.** Não chega ao servidor na abertura da página,
  não fica em log de acesso e não vaza por `Referer`. A página lê o token no
  navegador e pede os dados com `POST`. A prévia do link no WhatsApp não vê
  nada da OS.
- **Só leitura.** O link não altera a OS; a única gravação é a contagem de
  visitas, que mostra à loja que o cliente abriu.
- **Acesso no banco pelo hash:** a transação pública enxerga só a linha do link
  com aquele hash (contexto `app.tracking_hash`, com RLS). Só depois de achar o
  link ela entra no contexto da loja dona para ler a OS, como a aprovação de
  orçamento já faz.
- **Validade de 6 meses**, para cobrir o conserto e a garantia. A loja pode
  desativar todos os links da OS a qualquer momento; loja suspensa e OS
  excluída derrubam o link na hora.
- **Resposta igual para tudo que falha** (token malformado, inexistente,
  vencido, desativado, loja suspensa): "Link inválido ou expirado". Não dá para
  sondar o que existe.
- **Página sem cache e fora de buscadores:** `Cache-Control: no-store`,
  `noindex` e `Referrer-Policy: no-referrer`.
- **Vários links por OS.** Como o token não fica guardado, a loja não consegue
  "copiar de novo" um link antigo: cada envio gera um link novo e os anteriores
  continuam valendo (no máximo 10 ativos por OS; o 11º desativa o mais antigo).

## O que a loja vê

Na ficha da OS, ao lado da situação, o bloco **Acompanhamento do cliente**:

- "Enviar no WhatsApp": gera o link e abre a conversa com a mensagem pronta.
- "Copiar link".
- O que aconteceu com o link: "Ainda não enviado", "Enviado, ainda não aberto"
  ou "Cliente abriu hoje às 14:32 (3 visitas)".
- "Desativar links", com confirmação.

A ação "WhatsApp" das ordens selecionadas também passa a levar o link.

## Dados

- `order_tracking_links`: hash, loja, OS, quem gerou, criado, vence, desativado,
  última visita e número de visitas. Excluir a OS exclui os links.
- `order_events`: cada mudança de etapa ou de status da OS, com data e hora.
  Gravado por gatilho no banco, então vale para qualquer caminho (ficha, Mesa,
  aprovação de orçamento). OS antigas mostram a data de entrada e a etapa
  atual, sem inventar datas.

Migração só de expansão (tabelas novas e um gatilho).

## Fora desta versão

- QR code do link no comprovante impresso.
- Fotos de entrada do aparelho na página.
- Link nas mensagens automáticas do WhatsApp (dependem de modelos aprovados
  pela Meta).
