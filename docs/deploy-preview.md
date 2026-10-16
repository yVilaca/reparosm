# Deploy previews

O CI valida cada pull request contra um Postgres 17 efêmero. Um preview publicado precisa de banco isolado e segredos próprios; nunca aponte um preview para produção.

Na Netlify, configure as variáveis no contexto `Deploy previews`. A plataforma permite valores diferentes por [deploy context](https://docs.netlify.com/deploy/deploy-overview/#deploy-contexts), e alterações de variáveis só entram depois de novo build/deploy. Na Vercel, use o contexto Preview equivalente do projeto.

Variáveis mínimas do preview:

- `DATABASE_URL_UNPOOLED` (preferida) ou `DATABASE_URL`, apontando para a branch/banco do preview;
- `ADMIN_PASSWORD_HASH` no formato PBKDF2 esperado pelo app;
- `AUTH_ENCRYPTION_KEY` exclusiva do preview;
- `APP_URL` com a origem pública exata do preview;
- `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` somente se a callback daquele preview estiver cadastrada no Google;
- `WHATSAPP_CONFIG_KEY` apenas quando a integração for exercitada nesse ambiente.

O login por senha continua disponível quando o par Google não é configurado. Para previews efêmeros, esse é o padrão mais simples; callbacks Google com hostname variável não devem reutilizar credenciais de produção.

As migrações deste repositório não são automáticas no deploy. Aplique-as primeiro no banco isolado com `pnpm db:migrate`, depois publique o app. A [documentação da Netlify Database](https://docs.netlify.com/build/data-and-storage/netlify-database/migrations/) também recomenda que migrações manuais de produção sejam executadas fora do publish e sejam retrocompatíveis.

Depois do deploy, siga o checklist de [operação de autenticação](./auth-operations.md#smoke-test) sem armazenar credenciais ou códigos nos logs do PR.
