# Checklist de entrada

## Por que

O cliente deixa o aparelho e, na retirada, aparece a frase que toda assistência
conhece: "a câmera funcionava quando eu trouxe". Sem registro do estado do
aparelho na entrada, é a palavra da loja contra a do cliente. Hoje a OS guarda
fotos, senha e defeito relatado, mas não o que foi testado.

O checklist registra, antes de mexer no aparelho, o que funciona, o que já tem
defeito e onde estão as avarias físicas. Serve também para achar defeitos que o
cliente não contou, que viram orçamento.

## A ideia central: o aparelho se testa sozinho

Se o aparelho liga, a loja mostra um QR code na tela. O cliente (ou o técnico)
aponta a câmera do próprio aparelho e abre um teste guiado no navegador, sem
instalar nada. O teste usa o hardware de verdade: toque em toda a tela, cores
da tela, alto-falante (o aparelho toca bipes e a pessoa diz quantos ouviu),
microfone (medidor de volume), câmeras traseira e frontal, lanterna, vibração,
sensores de movimento e carregamento (conector o carregador e o aparelho avisa
que começou a carregar). Cada resultado chega na tela da loja na hora: o
checklist se preenche sozinho, com a marca "pelo aparelho".

O que o navegador não alcança (botões, biometria, sensor de proximidade, chip,
Wi-Fi, Bluetooth, auricular, saúde da bateria) a loja marca à mão.

## A tela da loja: a bancada de testes

Em `/ordens/<id>/checklist`, aberta pela ficha da OS:

- **"O aparelho liga?"** Sim ou Não. Com "Não", os testes de funcionamento saem
  de cena (ficam como "não foi possível testar") e sobra o estado físico.
- **O aparelho desenhado**, frente e verso. Cada parte testável é um ponto no
  desenho que acende verde (funciona), vermelho (defeito) ou fica cinza (não
  testado). Clicar no ponto leva ao teste dele. Abaixo, "por dentro": os testes
  sem lugar no desenho (vibração, Wi-Fi, chip...).
- **Mapa de avarias:** no modo "Marcar avaria", um clique no desenho deixa um
  marcador de trinca, risco, amassado ou outro, na frente ou no verso. É o
  vistoria de locadora de carro, para celular.
- **A lista de testes**, por grupo, cada um com "como testar" em uma linha e
  três respostas: Funciona, Defeito, Não testado. Defeito abre um campo curto
  para dizer qual ("touch falha no canto"). Pelo teclado: ↑ ↓ mudam de teste,
  1 / 2 / 3 respondem e o foco já desce para o próximo.
- **Teste pelo próprio aparelho:** QR code, "Enviar no WhatsApp" e "Copiar
  link", com o que está acontecendo ao vivo ("Aguardando o aparelho abrir o
  link", "Aparelho conectado", "6 resultados recebidos").
- **Resumo numa frase**, sempre à vista: "2 defeitos: Câmera traseira,
  Microfone. 1 avaria marcada."
- **Salva sozinho** a cada resposta. "Concluir checklist" volta para a OS.

Na ficha da OS, o bloco **Checklist de entrada** mostra o resultado em
segmentos coloridos (um por teste, como o trilho de etapas), os defeitos e as
avarias, e o botão para abrir a bancada.

## Regras

- **O que a loja marca vale mais.** Resultado do aparelho só preenche teste que
  a loja não respondeu à mão; a loja pode corrigir qualquer resultado.
- **Lista fechada:** só os testes do catálogo, só os três estados, nota curta.
  O link do aparelho só grava os testes que o navegador consegue fazer, e só
  "funciona" ou "defeito".
- **Gravação por partes:** cada resposta manda só o que mudou, então um
  resultado do aparelho que chega no meio não é apagado por um salvamento da
  loja.

## Segurança do link do aparelho

Mesmo modelo do link de acompanhamento:

- Token de 32 bytes aleatórios; no banco fica só o SHA-256.
- O token vai depois do `#` (`/testar#t=<token>`) e segue no corpo de um
  `POST`: não fica em log nem vaza por `Referer`.
- Vale **2 horas** (é para o balcão) e só **um por OS**: gerar outro desativa o
  anterior. A loja pode encerrar a qualquer momento; loja suspensa ou OS
  excluída derrubam o link.
- A página do aparelho vê só o nome da loja, o número da OS e o modelo. Nada do
  cliente.
- A transação pública enxerga só a linha do link com aquele hash
  (`app.device_test_hash`, com RLS) antes de entrar no contexto da loja.
- Toda falha responde igual: "Link inválido ou expirado".
- Página fora de buscadores, sem cache e sem `Referer`.

## Dados

- `order_checklists`: um por OS (`data` jsonb com a resposta de "liga?", os
  testes, as avarias, observações, dados do aparelho e quando foi concluído),
  `updated_at`, `updated_by`. Excluir a OS exclui o checklist.
- `order_device_tests`: links do teste pelo aparelho (hash, loja, OS, quem
  gerou, criado, vence, encerrado, aberto em, último contato).

Migração só de expansão (0030).

## Fora desta versão

- Checklist no comprovante impresso, para o cliente assinar junto.
- Lembrar o checklist ao criar a OS e comparar entrada × saída na retirada.
- Fotos ligadas a cada avaria.
