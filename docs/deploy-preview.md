# Deploy previews

O `netlify.toml` define o build dos Deploy Previews criados para pull requests.
Com o Netlify Database vinculado ao site, a plataforma fornece `NETLIFY_DB_URL`
ao runtime e cria uma branch de banco para o preview. O app também aceita
`DATABASE_URL` como conexão explícita quando o projeto usa outro Postgres. Aplique
as demais variáveis necessárias ao preview (`ADMIN_PASSWORD_HASH` e, se usado,
`WHATSAPP_CONFIG_KEY`) no escopo `Deploy previews`.

O CI valida o código contra um Postgres efêmero do GitHub Actions; a branch de
banco da Netlify permite validar o comportamento do preview publicado.
