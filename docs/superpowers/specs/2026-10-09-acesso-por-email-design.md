# Acesso por e-mail

## Por que

Senha provisória definida pelo dono ou pelo administrador é frágil: duas
pessoas conhecem a senha e ela costuma ir por mensagem. E, quando a loja passar
a ser criada sozinha depois da compra, não haverá ninguém para inventar e
entregar uma senha. Agora ninguém define a senha de ninguém: a pessoa recebe um
link de uso único e cria a dela.

Complementa [usuários da loja](2026-10-08-usuarios-da-loja-design.md), que
passa a não ter mais senha provisória.

## Fluxos

| Momento                          | Quem dispara               | Link             | Validade |
| -------------------------------- | -------------------------- | ---------------- | -------- |
| Loja nova                        | Administrador ou compra    | Convite do Dono  | 3 dias   |
| Pessoa nova na equipe            | Dono (ou administrador)    | Convite          | 3 dias   |
| Esqueci minha senha (com e-mail) | A própria pessoa, no login | Nova senha       | 1 hora   |
| Nova senha pedida por outro      | Dono ou administrador      | Nova senha       | 1 hora   |
| Trocar o próprio e-mail          | A pessoa, em Minha conta   | Confirmar e-mail | 24 horas |

- **E-mail ou link para copiar.** Com e-mail cadastrado e SMTP ligado, o link
  vai por e-mail. Sem e-mail, sem SMTP ou se o envio falhar, o link aparece
  para quem pediu copiar ou mandar pelo WhatsApp. O e-mail nunca é o único
  caminho.
- **O link já entra logado.** Ao criar a senha, a pessoa entra direto no
  sistema.
- **Esqueci minha senha** aceita usuário ou e-mail. Quem tem e-mail recebe o link
  na hora. Quem não tem abre um pedido: o do Funcionário vai para o Dono (em
  Equipe), o do Dono vai para o administrador (em Lojas).
- **Login com usuário ou e-mail.**
- **Aviso de senha alterada** por e-mail sempre que a senha muda (troca em
  Minha conta ou pelo link de nova senha).

## Segurança

- **Token:** 32 bytes aleatórios (256 bits) em base64url. No banco
  (`access_links`) fica só o hash SHA-256. Quem lê o banco não consegue usar
  um link.
- **Fora de logs:** o token vai depois do `#` (`/acesso#t=…`), então não chega
  ao servidor no carregamento da página. A página tira o token da barra de
  endereço assim que abre, e tudo que leva o token é POST. A página é
  `no-referrer` e `noindex`.
- **Abrir não gasta:** antivírus de e-mail "clicam" nos links. Só criar a senha
  (ou confirmar o e-mail) gasta o link, num `UPDATE … WHERE used_at IS NULL AND
expires_at > now()` atômico.
- **Uso único e um de cada vez:** um link novo vence os anteriores da mesma
  pessoa (convite e nova senha se substituem). Usar um link vence os outros e
  desconecta todos os aparelhos da pessoa.
- **Quem pode usar:** a pessoa e a loja precisam estar ativas. A conta do
  administrador nunca entra por link: a senha dela vem de `ADMIN_PASSWORD_HASH`.
- **E-mail confirmado de verdade:** usar um link recebido no e-mail cadastrado
  confirma o e-mail. Um link copiado, não. Trocar o próprio e-mail pede a senha
  atual e só vale depois do clique no link que chega no e-mail novo.
- **Limite:** no máximo 3 links pedidos pelo "esqueci minha senha" por pessoa
  a cada 15 minutos (ninguém enche a caixa de outra pessoa). A resposta é
  sempre a mesma e sai antes do envio (`after()`), sem revelar cadastro nem
  pelo tempo de resposta.
- **Endereço do link:** vem de `APP_URL`, nunca do `Host` da requisição (que
  pode ser forjado).
- **SMTP só com TLS** (`requireTLS`). O corpo do e-mail nunca vai para o log.
- **HTML do e-mail escapado:** nome de loja ou de pessoa nunca vira HTML.
- **RLS:** `access_links` tem RLS forçado. O link é visto pelo próprio token,
  pela loja dele, pela própria pessoa (sessão ou login) ou pelo administrador.
- **Limpeza:** as senhas antigas saíram da tabela de lojas (migração 0027). Só
  `users` guarda senha.

## Compra automática

`POST /api/provisioning/stores`, de servidor para servidor (integração do meio
de pagamento ou automação como Make/Zapier):

```http
POST /api/provisioning/stores
Authorization: Bearer <PROVISIONING_TOKEN>
Content-Type: application/json

{
  "externalId": "pedido-123",
  "storeName": "Cell Prime",
  "ownerName": "Marcos Oliveira",
  "ownerEmail": "marcos@exemplo.com",
  "plan": "Mensal",
  "dueDate": "2026-11-10"
}
```

- Cria a loja e o Dono e manda o convite. O usuário do Dono sai do começo do
  e-mail (`marcos`, `marcos2`…). Ele entra com o usuário ou com o e-mail.
- **Idempotente:** o mesmo `externalId` devolve a loja existente
  (`200 {"created": false, …}`) e nunca cria outra, nem com dois avisos
  simultâneos.
- `201 {"created": true, "accountId", "username", "invite"}`. Se o e-mail não
  saiu, `invite` traz o link para a integração entregar de outro jeito.
- A chave é comparada em tempo constante. Sem `PROVISIONING_TOKEN`, a rota
  responde 404.
- Falta só o adaptador de cada meio de pagamento (validar a assinatura do
  webhook dele e chamar esta rota). Ele depende de qual meio for escolhido.

## Configurar o envio (SMTP)

As variáveis ficam na Vercel (Settings → Environment Variables, ambiente
Production) e no `.env` local. Veja o `.env.example`.

| Variável         | Exemplo                                 |
| ---------------- | --------------------------------------- |
| `APP_URL`        | `https://reparosm.vercel.app`           |
| `SMTP_HOST`      | `smtp.gmail.com`                        |
| `SMTP_PORT`      | `465`                                   |
| `SMTP_USER`      | `suporte.reparosm@gmail.com`            |
| `SMTP_PASSWORD`  | senha de app de 16 letras (Gmail)       |
| `EMAIL_FROM`     | `ReparoSM <suporte.reparosm@gmail.com>` |
| `EMAIL_REPLY_TO` | opcional                                |

- **Gmail (para começar):** ative a verificação em duas etapas na conta e crie
  uma "senha de app" em myaccount.google.com/apppasswords. O `EMAIL_FROM`
  precisa ser o próprio Gmail. O limite é de cerca de 500 e-mails por dia.
- **Com domínio próprio:** Brevo (300 por dia grátis, `smtp-relay.brevo.com`,
  porta 587) ou Resend (3.000 por mês, até 100 por dia, `smtp.resend.com`,
  porta 465, usuário `resend`, senha = a chave da API). Configure SPF, DKIM e
  DMARC no domínio, como o painel do provedor indicar.
- Depois de salvar as variáveis, faça um novo deploy. As telas de Equipe e Minha
  conta deixam de mostrar o aviso "envio de e-mail ainda não está ligado".

## Onde está

- `netlify/database/migrations/0027_drop_account_passwords.sql`,
  `0028_email_access.sql`
- `lib/email.ts` (envio), `lib/email-templates.ts` (modelos),
  `lib/repos/access-links.ts` (links), `lib/access.ts` (fluxos)
- `scripts/email-preview.mts`: gera os e-mails em HTML para conferir o visual
- `app/api/access` (usar o link), `app/api/provisioning/stores` (compra),
  `app/acesso` (página do link)
