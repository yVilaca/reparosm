# Deploy previews

O `netlify.toml` define o build dos Deploy Previews criados para pull requests.
Configure no painel da Netlify, com escopo `Deploy previews`, uma `DATABASE_URL`
apontando para um banco Postgres separado do ambiente de produção. Aplique as
mesmas variáveis necessárias ao preview (`ADMIN_PASSWORD_HASH` e, se usado,
`WHATSAPP_CONFIG_KEY`), sem reutilizar credenciais de produção.

O CI continua validando o código contra um Postgres efêmero do GitHub Actions;
o banco separado da Netlify é para validar o comportamento do preview publicado.
