# Operação de autenticação

O ReparoSM aceita senha e, opcionalmente, Google. O autenticador TOTP também é opcional por pessoa, mas recomendado. Um aparelho marcado como confiável deixa de pedir somente o código TOTP por 30 dias; senha ou Google continuam obrigatórios em cada nova entrada.

## Variáveis

Configure segredos somente no ambiente da hospedagem, nunca no Git:

- `AUTH_ENCRYPTION_KEY`: 32 bytes em hexadecimal (64 caracteres), usados para criptografar os segredos TOTP. Gere uma vez com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` e preserve o valor em todos os deploys.
- `GOOGLE_CLIENT_ID`: identificador do cliente OAuth Web do Google.
- `GOOGLE_CLIENT_SECRET`: segredo do mesmo cliente OAuth.
- `APP_URL`: origem pública exata do ambiente, sem caminho, por exemplo `https://app.exemplo.com.br`.

O login Google aparece somente quando `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` existem juntos. Remover os dois e publicar novamente desliga apenas o Google; a senha continua funcionando e os vínculos existentes permanecem no banco.

Não troque `AUTH_ENCRYPTION_KEY` durante um deploy comum. A chave anterior é necessária para ler autenticadores já cadastrados. Se ela for perdida, cada MFA afetado precisará ser removido pelo fluxo administrativo ou pelo procedimento de emergência.

## Configurar o Google

1. No [Google Auth Platform](https://console.cloud.google.com/auth/branding), selecione ou crie o projeto e configure Branding e Audience. Enquanto o aplicativo estiver em teste, cadastre os usuários de teste necessários.
2. Em Clients, crie um cliente do tipo **Web application**.
3. Em **Authorized redirect URIs**, adicione exatamente `${APP_URL}/api/auth/google/callback` para cada ambiente habilitado. Para desenvolvimento local, use `http://localhost:3000/api/auth/google/callback`.
4. Salve o Client ID e o Client Secret no gerenciador de segredos da hospedagem. Não baixe nem versione o JSON de credenciais.
5. Configure `APP_URL` com a mesma origem registrada e publique o aplicativo.

O Google exige correspondência exata da redirect URI, incluindo esquema, host, porta, maiúsculas e barra final. A implementação usa Authorization Code + PKCE e solicita apenas `openid email`. Consulte a documentação oficial de [OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect) e das [redirect URIs OAuth](https://developers.google.com/identity/protocols/oauth2/web-server#uri-validation).

## Rollout e migração

Use esta ordem para produção:

1. confirme backup e acesso à conexão direta do Postgres;
2. configure `AUTH_ENCRYPTION_KEY`, `APP_URL` e, se desejado, o par Google;
3. aplique as migrações com a versão nova do repositório:

   ```bash
   DATABASE_URL_UNPOOLED='postgresql://...' pnpm db:migrate
   ```

4. publique a aplicação;
5. execute o smoke test abaixo.

A migração `0031_auth_security.sql` é aditiva. Em rollback da aplicação, mantenha as novas tabelas e colunas; não reverta o banco destrutivamente. Restaure a versão anterior do app e mantenha `AUTH_ENCRYPTION_KEY` guardada para um novo rollout.

## Recuperação de MFA

- Funcionário sem autenticador nem código reserva solicita ajuda na tela de MFA; o pedido aparece para o dono em **Equipe**.
- Dono solicita ajuda ao suporte; o pedido aparece para o administrador em **Lojas**.
- Aprovar remove autenticador e códigos, apaga a confiança dos aparelhos e encerra todas as sessões daquela pessoa em uma transação.
- O administrador protegido não entra em fila. Depois de validar a identidade do operador e o acesso ao host, execute:

  ```bash
  pnpm exec tsx scripts/reset-admin-mfa.mts \
    --user user-adminreparosm \
    --confirm user-adminreparosm
  ```

O comando aceita somente esse identificador repetido nas duas opções e encerra todas as sessões administrativas. Ele usa `DATABASE_URL_UNPOOLED` antes de `DATABASE_URL`.

## Smoke test

Use contas de teste; não registre senhas, códigos, QR codes, cookies ou chaves em tickets e capturas.

- Login por senha conclui e logout invalida a sessão.
- “Esqueci minha senha” responde sem revelar se a conta existe.
- Convite e reset de senha preservam o desafio MFA quando ele estiver ativo.
- Google aparece apenas com o par de variáveis e volta para a URL correta.
- TOTP ativa somente após senha + primeiro código; os oito códigos reserva aparecem uma vez.
- Código reserva funciona uma vez; regenerar invalida o conjunto anterior.
- Aparelho confiável pula somente o TOTP e aparece em **Minha conta**; removê-lo encerra suas sessões.
- Pedido de reset MFA aparece na fila correta; descartar não altera o MFA; aprovar desconecta a pessoa.
- Login, recuperação, convite e Minha conta funcionam em 390 px e desktop, por teclado e em tema claro/escuro.
