# Autenticação reforçada e nova experiência de acesso

## Situação

Design aprovado em 15 de outubro de 2026. Esta especificação complementa
[Usuários da loja](2026-10-08-usuarios-da-loja-design.md),
[Acesso por e-mail](2026-10-09-acesso-por-email-design.md) e
[Identidade visual](2026-10-07-identidade-visual-design.md).

## Objetivo

Reformular a entrada do ReparoSM sem substituir o modelo próprio de contas,
usuários e sessões. A entrega adiciona:

- entrada com Google para pessoas já cadastradas;
- autenticação TOTP opcional e recomendada, compatível com Google
  Authenticator e outros aplicativos autenticadores;
- oito códigos de recuperação de uso único;
- navegador confiável por 30 dias, dispensando somente o TOTP;
- gestão de aparelhos e revogação remota;
- recuperação administrativa do segundo fator;
- uma família visual única para login, recuperação, convites e verificação.

Sucesso significa que senha, Google e TOTP parecem partes do mesmo produto,
preservam as regras multiusuário e multiloja existentes e não criam um segundo
sistema de sessão.

## Fora do escopo

- cadastro público ou criação automática de lojas e usuários pelo Google;
- login sem senha por e-mail, passkeys, SMS ou WhatsApp;
- obrigatoriedade de TOTP por loja, papel ou plano;
- geolocalização por IP, fingerprint do navegador ou reconhecimento biométrico;
- acesso a APIs do Google além dos dados de identidade `openid email`;
- substituição das sessões ReparoSM por Auth.js, Clerk, Auth0 ou sessões do
  provedor.

## Decisões de produto

1. TOTP é opcional para cada pessoa, mas Minha conta recomenda sua ativação.
2. Um navegador confiável dispensa o código TOTP por 30 dias. Senha ou Google
   continuam obrigatórios em toda nova autenticação.
3. Remover um aparelho encerra todas as sessões daquele aparelho e apaga sua
   confiança imediatamente.
4. Google só autentica um usuário ativo existente cujo e-mail confirmado seja
   igual ao e-mail verificado pelo provedor. Nunca provisiona uma pessoa ou loja.
5. No primeiro acesso Google válido, o identificador imutável `sub` é vinculado
   ao usuário. Os acessos seguintes usam esse vínculo, não uma nova comparação
   apenas por e-mail.
6. Ao ativar TOTP, o sistema mostra oito códigos de recuperação uma única vez.
7. Sem autenticador nem código de recuperação, um funcionário pede reset ao
   dono; um dono pede ao administrador da plataforma.

## Arquitetura

`accounts`, `users` e `sessions` continuam sendo a fonte de verdade. Password e
Google são duas formas de provar a identidade da mesma linha em `users`. O TOTP
é um segundo passo opcional. Uma sessão definitiva só nasce depois de todos os
passos exigidos.

As responsabilidades ficam separadas:

- `lib/auth.ts`: orquestra login, estado intermediário e criação de sessão;
- `lib/google-oidc.ts`: cria a autorização, troca o código e valida o ID token;
- `lib/totp.ts`: gera, apresenta e valida TOTP e códigos de recuperação;
- `lib/auth-secrets.ts`: criptografia autenticada de segredos TOTP;
- repositórios pequenos em `lib/repos/`: identidades, autenticadores, desafios e
  aparelhos;
- rotas HTTP validam origem e formato e delegam a regra aos módulos acima;
- componentes de tela não decidem autenticação nem manipulam segredos.

O login Google usa Authorization Code no servidor com PKCE, `state` e `nonce`.
O backend troca o código, verifica assinatura, emissor, audiência, expiração,
`nonce` e `email_verified`, e descarta os tokens do Google depois de extrair a
identidade. Não são solicitados refresh tokens nem acesso offline.

A validação JWT/JWKS usará `jose`; TOTP usará `otpauth`. O QR existente em
`components/qr-code.tsx` renderiza a URI `otpauth://`. Não haverá framework de
autenticação adicional.

## Modelo de dados

Uma migração aditiva cria as tabelas abaixo e a referência de aparelho nas
sessões. Todas as tabelas com `account_id` recebem RLS forçado e políticas com
os mesmos contextos restritos já usados por usuários, login e administração.

### `user_identities`

- `id`, `account_id`, `user_id`;
- `provider`, inicialmente somente `google`;
- `provider_subject`, o `sub` imutável do provedor;
- `email_at_link`, para auditoria e exibição;
- `created_at`, `last_used_at`;
- unicidade por `(provider, provider_subject)` e `(user_id, provider)`.

### `user_authenticators`

- uma linha por usuário: `account_id`, `user_id`;
- `secret_ciphertext`, contendo nonce, tag e texto cifrado autenticado;
- `enabled_at`, nulo enquanto a ativação ainda não foi confirmada;
- `last_used_step`, para rejeitar reutilização do mesmo TOTP;
- `created_at`, `updated_at`.

O segredo é aleatório e único por usuário. A cifra usa AES-256-GCM com uma
nova `AUTH_ENCRYPTION_KEY` de 32 bytes. A chave nunca é reutilizada do WhatsApp.

### `recovery_codes`

- `id`, `account_id`, `user_id`;
- `code_hash`, nunca o código legível;
- `used_at`, `created_at`;
- oito linhas novas substituem atomicamente o conjunto anterior.

Os códigos têm entropia criptográfica, formato legível em blocos e comparação
em tempo constante. Consumir um código preenche `used_at` atomicamente.

### `auth_challenges`

- `id`, `account_id`, `user_id`;
- `token_hash`, finalidade (`login` ou `reset`) e método primário usado;
- dados mínimos do aparelho, `expires_at`, `used_at`, `created_at`.

O desafio dura dez minutos, é de uso único e guarda somente o hash do token. O
token fica em cookie `HttpOnly` temporário, não em `localStorage` nem na URL.

### `auth_devices`

- `id`, `account_id`, `user_id`, `browser_token_hash`;
- `user_agent`, `last_ip`, `last_seen_at`;
- `trusted_until`, nulo para aparelho apenas reconhecido;
- `created_at`, `updated_at`;
- unicidade por `(user_id, browser_token_hash)`.

Um cookie aleatório identifica o navegador. A linha de aparelho é por usuário,
portanto um computador compartilhado pode aparecer separadamente para duas
pessoas sem compartilhar a confiança entre elas. O servidor guarda somente o
hash. O prazo confiável é conferido no banco em todo login.

### `mfa_reset_requests`

- `id`, `account_id`, `user_id`, `requested_at`;
- `status` (`pending`, `approved`, `dismissed`), `resolved_at`;
- uma solicitação pendente por usuário.

### `sessions`

Recebe `device_id` anulável para compatibilidade com sessões criadas antes da
migração. Sessões novas sempre recebem um aparelho. Excluir um aparelho primeiro
remove as sessões ligadas e depois sua linha de confiança na mesma transação.

## Fluxos

### Senha

1. O usuário envia usuário/e-mail e senha pela rota existente `/api/auth`.
2. As regras atuais de limite de tentativas, conta ativa e usuário ativo permanecem.
3. Sem TOTP, ou com confiança vigente para aquele usuário e navegador, o servidor
   cria a sessão de 12 horas.
4. Com TOTP e sem confiança, o servidor cria um `auth_challenge`, define o cookie
   temporário e responde `step: "mfa"`. Ainda não existe sessão.

### Google

1. `GET /api/auth/google` cria `state`, `nonce` e PKCE verifier em cookies
   `HttpOnly`, `SameSite=Lax`, de dez minutos, e redireciona ao Google.
2. `GET /api/auth/google/callback` confere os cookies e a resposta antes de trocar
   o código.
3. Um `sub` já vinculado encontra diretamente o usuário. No primeiro acesso, o
   e-mail verificado precisa coincidir com o e-mail confirmado, globalmente único,
   de um usuário ativo. A inserção do vínculo é atômica.
4. Conta ou usuário inativo falham antes de qualquer sessão.
5. O fluxo então segue a mesma decisão TOTP/aparelho confiável da senha.
6. Tokens Google são descartados; somente identidade e datas do vínculo ficam.

O administrador da plataforma também é um usuário existente. Google só fica
disponível para ele depois que um e-mail confirmado for cadastrado, seguindo a
mesma regra das lojas.

### Segundo fator

`POST /api/auth/mfa` aceita um TOTP de seis dígitos ou um código de recuperação.
O desafio, o usuário e o navegador devem coincidir. TOTP usa passo de 30 segundos
e tolerância de no máximo um passo adjacente. Um passo já aceito não vale de
novo. Código de recuperação é consumido uma vez.

Depois da validação, o desafio é consumido e a sessão nasce atomicamente. Se a
opção de confiar estiver marcada, `trusted_until` recebe 30 dias. Usar um código
de recuperação não confia automaticamente no aparelho.

### Ativação e manutenção do TOTP

1. Em Minha conta, a pessoa confirma sua senha atual.
2. O servidor gera e cifra um segredo ainda não habilitado.
3. A tela mostra QR, chave manual e campo para o primeiro código.
4. Somente um TOTP correto define `enabled_at` e gera os oito códigos de
   recuperação.
5. Os códigos são exibidos uma vez, com copiar e imprimir/baixar em texto. Sair
   da tela os torna irrecuperáveis; o usuário pode gerar um conjunto novo depois.

Desativar TOTP ou regenerar códigos exige senha atual e um TOTP ou código de
recuperação. Desativar remove autenticador e códigos, apaga todas as confianças e
encerra as outras sessões. Desvincular o Google exige a mesma confirmação forte e
nunca remove a senha existente.

### Reset de senha e convites

- convite de pessoa nova continua criando uma sessão, pois ainda não existe TOTP;
- reset de senha revoga sessões e confianças existentes;
- se o usuário tiver TOTP, consumir o link de reset cria um desafio MFA em vez de
  uma sessão definitiva;
- confirmar e-mail não altera TOTP nem o vínculo Google existente.

### Perda do autenticador

Na tela MFA, `Usar código de recuperação` troca o campo sem revelar dados da
conta. `Não tenho mais acesso` cria a solicitação genérica a partir do desafio:

- pedido de funcionário aparece para o dono em Equipe;
- pedido de dono de loja aparece para o administrador em Lojas;
- aprovar remove autenticador e códigos e revoga todos os aparelhos e sessões;
- o usuário volta a entrar com senha ou Google e recebe recomendação para ativar
  TOTP novamente.

Para o usuário administrador da plataforma não existe aprovador superior na
interface. A recuperação excepcional é um comando de manutenção executado com
acesso ao ambiente de produção; ele exige confirmação explícita do identificador,
desativa o TOTP e revoga todas as sessões e aparelhos do administrador.

### Aparelhos

Minha conta lista os aparelhos do usuário, agrupando suas sessões. Cada item
mostra nome derivado do user agent, sistema/navegador, aparelho atual, último uso,
IP resumido e, quando existir, `Confiável até <data>`. Não há geolocalização.

Remover outro aparelho pede confirmação e encerra todas as sessões dele. Remover
o aparelho atual também encerra a sessão corrente e leva ao login. `Sair dos outros
aparelhos` continua existindo e passa a remover também a confiança dos demais.

## API e cookies

- `/api/auth`: senha, esqueci minha senha e logout, agora capaz de devolver MFA;
- `/api/auth/google`: início do OIDC;
- `/api/auth/google/callback`: callback OIDC;
- `/api/auth/mfa`: TOTP, recuperação e solicitação de reset;
- `/api/me/security`: leitura e ações sobre TOTP, códigos, Google e aparelhos;
- `/api/team`: dono aprova ou descarta reset de funcionário;
- `/api/accounts`: administrador aprova ou descarta reset de dono;
- comando de manutenção dedicado ao reset do administrador.

Cookies permanentes continuam com `Secure` em HTTPS, `HttpOnly`, caminho mínimo e
sem acesso por JavaScript. A sessão usa `SameSite=Strict`. O identificador de
aparelho e os cookies transitórios do OIDC usam `SameSite=Lax`, necessário para o
callback reconhecer um aparelho confiável depois do retorno do Google. Os cookies
transitórios são apagados no callback mesmo em erro. Respostas de auth usam
`Cache-Control: no-store`.

## Experiência e identidade visual

A referência de direção é a composição dividida do arquivo público do Figma
`Login - Return to Login`, sem copiar sua arte ou marca.

### Estrutura

- desktop: painel editorial assimétrico em tinta à esquerda e formulário claro,
  estreito e arejado à direita;
- mobile: o painel vira um cabeçalho compacto e o formulário ocupa o foco;
- um novo `AuthShell` é compartilhado por login, recuperação, convite, senha e
  MFA para impedir que cada fluxo pareça outro produto;
- o painel usa o logo real, uma frase curta e desenho técnico discreto inspirado
  em bancada, diagnóstico, trilhas e marcações de medição;
- a ornamentação é CSS/SVG local, sem fotografia genérica, carrossel ou ativo de
  IA.

### Linguagem

- tinta `#1B1636`, violeta `#6C4CF1`, Bancada e Névoa existentes;
- Red Hat Display nos títulos e Red Hat Text nos controles;
- rótulos de campo sempre visíveis, foco violeta e mensagens próximas da origem;
- sem glassmorphism, gradientes genéricos, bolhas, brilho neon, excesso de pílulas
  ou um cartão flutuante centralizado;
- movimento apenas funcional e respeitando `prefers-reduced-motion`.

### Telas

1. Login: usuário/e-mail, senha, ação principal e `Continuar com Google`.
2. Recuperação: mesma estrutura e resposta neutra sobre existência da conta.
3. MFA: seis dígitos, confiar por 30 dias, código de recuperação e pedido de reset.
4. Acesso: convite, nova senha, confirmação e link inválido no mesmo `AuthShell`.
5. Minha conta / Segurança: Google, TOTP, códigos e aparelhos em seções claras.
6. Equipe e Lojas: pedidos de reset MFA junto aos pedidos de senha, com ação e
   consequência explicitadas.

O botão Google é omitido quando as variáveis do provedor não estão configuradas;
isso mantém ambientes locais e previews utilizáveis. TOTP só é apresentado quando
`AUTH_ENCRYPTION_KEY` é válida.

## Erros, abuso e privacidade

- senha, Google, TOTP e recuperação têm limites de tentativa por identidade e IP;
- respostas públicas não revelam se usuário, e-mail, vínculo Google ou TOTP existem;
- falha de `state`, `nonce`, PKCE, assinatura ou claims encerra o fluxo e retorna
  ao login com mensagem segura e um identificador interno de diagnóstico;
- callbacks e códigos nunca entram em logs; tokens Google não são persistidos;
- transações tornam atômicos: vincular Google, consumir desafio, usar recovery
  code, confiar aparelho e resetar MFA;
- e-mails continuam normalizados e globalmente únicos;
- user agent e IP já usados pelas sessões são os únicos metadados exibidos. O IP
  aparece resumido e não é enviado a serviço externo;
- segredos não aparecem em telemetria, erros, HTML de servidor ou propriedades de
  componentes depois do passo que precisa deles.

## Configuração e entrega

Novas variáveis:

| Variável               | Regra                                |
| ---------------------- | ------------------------------------ |
| `GOOGLE_CLIENT_ID`     | ID do cliente Web do Google          |
| `GOOGLE_CLIENT_SECRET` | segredo do cliente Web               |
| `AUTH_ENCRYPTION_KEY`  | 64 caracteres hexadecimais, 32 bytes |

As variáveis Google são opcionais em conjunto: ambas presentes habilitam o botão;
somente uma presente é erro de configuração. A chave de criptografia é obrigatória
para habilitar TOTP. `.env.example`, validação de ambiente e setup dos testes são
atualizados no mesmo conjunto.

O Google Cloud recebe callbacks separados de desenvolvimento, preview aceito e
produção. O callback sempre deriva de `APP_URL`, nunca do cabeçalho `Host`.

A ordem de entrega é:

1. publicar variáveis e redirect URIs;
2. aplicar a migração aditiva;
3. publicar a aplicação;
4. testar senha, Google, TOTP, reset e revogação em produção;
5. manter o login por senha como retorno seguro durante todo o rollout.

## Verificação

### Unidade

- vetores oficiais RFC 6238, janelas permitidas e bloqueio de reuso;
- cifra/decifra AES-GCM, chave incorreta e payload adulterado;
- formato, hash, consumo único e regeneração dos recovery codes;
- criação e expiração de cookies e nomes de aparelhos.

### Banco e rotas

- vínculo Google por e-mail confirmado somente no primeiro uso e depois por `sub`;
- colisão de `sub`, e-mail ausente/não confirmado, usuário ou loja inativos;
- isolamento RLS de todas as novas tabelas e capacidades de login/admin;
- senha e Google, com e sem TOTP e com confiança vigente/expirada;
- desafio expirado, usado ou de outro navegador;
- consumo concorrente de TOTP, recovery code e callback Google;
- reset de senha com TOTP sem criação prematura de sessão;
- revogação de aparelho, outras sessões e reset administrativo;
- migração preserva usuários e sessões anteriores.

### Interface e acessibilidade

- fluxo completo de cada estado do `AuthShell` em desktop e mobile;
- ordem de tabulação, autocomplete correto, foco após erro e anúncio por leitor
  de tela;
- colagem do código de seis dígitos, teclado numérico e envio por Enter;
- QR com chave manual equivalente e recuperação visível uma única vez;
- contraste nos temas claro/escuro e `prefers-reduced-motion`;
- aparelho atual, confiança, revogação e redirecionamento após remover a sessão
  corrente.

Antes da conclusão: testes, typecheck, lint, build, migração em banco de teste,
inspeção visual das telas responsivas e `graft build && graft check`.
