# Isolamento multi-loja com PostgreSQL RLS

**Status:** proposta para revisão; nenhuma política ou migration foi aplicada.
**Data:** 26/09/2026

## Objetivo

Fazer o PostgreSQL impor o isolamento por loja, inclusive quando uma consulta da aplicação esquecer o filtro `account_id`. A identidade da loja vem da sessão validada no servidor; consultas sem contexto devem falhar fechadas.

## Diagnóstico do projeto

- As migrations `0003_core.sql`, `0004_rest.sql` e `0006_order_code_sequence.sql` já guardam `account_id` nas tabelas operacionais, e os repositórios normalmente filtram por ele. Ainda não há política RLS.
- Tabelas operacionais com `account_id`: `shops`, `clients`, `quotes`, `orders`, `parts`, `cash_entries`, `messages`, `films`, `automations`, `tutorials`, `whatsapp_configs` e `order_code_counters`.
- `lib/db.ts` envia consultas avulsas pelo cliente HTTP serverless e usa `pool.connect()` para transações. Contexto `SET LOCAL` só pode proteger uma consulta se contexto e consulta usarem a mesma transação e conexão.
- A URL local atual conecta como `postgres`, superusuário e proprietário das tabelas. Esse ambiente ignora RLS; não serve sozinho para comprovar isolamento.
- Uma prova descartável no Postgres local confirmou que `SET LOCAL ROLE` com papel sem `BYPASSRLS` filtra linhas por `current_setting(..., true)`, nega tudo sem contexto e restaura papel/contexto no `COMMIT`. Os objetos de prova foram removidos; isso não valida ainda o papel e o driver do deploy Netlify.
- A autenticação resolve `account.id` no servidor. As páginas e rotas de loja passam esse ID aos repositórios, sem precisar confiar num `account_id` do corpo de uma requisição.
- Existem dois acessos públicos intencionais: a vitrine usa `?loja=<accountId>` e deve exibir apenas itens publicados com estoque; o link de orçamento usa o ID aleatório do orçamento como capacidade de acesso e retorna uma projeção filtrada.
- `accounts`, `sessions`, `password_requests` e `login_failures` são dados de controle de autenticação, com fluxos de login, recuperação e administração que ainda não carregam um contexto uniforme de loja.

## Decisão proposta

Usar RLS do PostgreSQL com contexto por transação e papel efetivo restrito. Aproveitar o `pg.Pool` já fornecido por `@netlify/database`; não adicionar dependências nem usar contexto de sessão que possa sobreviver à devolução da conexão ao pool.

### P0 — proteção dos dados operacionais

1. Criar o papel efetivo `reparosm_runtime`, sem `SUPERUSER`, `BYPASSRLS` ou propriedade das tabelas. Conceder somente `SELECT`, `INSERT`, `UPDATE` e `DELETE` necessários. O principal usado pelas migrations continua separado e privilegiado.
2. Em cada operação da aplicação, abrir uma transação no pool e executar `SET LOCAL ROLE reparosm_runtime`. Para operação de loja, definir `app.account_id` com `set_config(..., true)` antes da consulta. A conexão volta ao pool sem papel ou loja persistidos.
3. Criar um helper mínimo para consulta e transação tenant-scoped. Repositórios que já recebem `accountId` passam a usá-lo por padrão; transações de várias escritas recebem o mesmo contexto uma única vez. O contexto só vem da conta validada no servidor.
4. Habilitar e forçar RLS nas 12 tabelas operacionais listadas acima. A política normal permite linhas cujo `account_id` corresponda a `app.account_id`, tanto em `USING` quanto em `WITH CHECK`. Contexto ausente ou vazio não corresponde a nenhuma linha.
5. Preservar a vitrine com políticas somente de leitura separadas: em `parts`, `app.public_store_account_id` permite apenas produtos publicados e com estoque positivo; em `shops`, permite somente a loja correspondente. Como RLS é por linha, o repositório público também seleciona e serializa apenas os campos públicos do perfil. O ID da URL não concede acesso a consultas ou escritas administrativas.
6. Preservar o orçamento público com uma política somente de leitura para o `id` indicado por `app.public_quote_id`. Na resposta do orçamento, a aplicação primeiro lê apenas esse orçamento pela capacidade do link; dentro da mesma transação, define `app.account_id` a partir do `account_id` retornado pelo banco antes de criar ordem/cliente e atualizar o orçamento. Não aceitar `account_id` do cliente.
7. Manter `accounts`, `sessions`, `password_requests` e `login_failures` fora desta primeira migration, sob seus fluxos atuais de autenticação e administração. A aplicação e os testes não devem tratar essa exceção como isolamento RLS; ela é o item prioritário do P1 abaixo.

### P1 — fechar as exceções e relacionamentos

1. Levar `accounts`, `sessions`, `password_requests` e `login_failures` para RLS, com contextos separados para consulta de login por usuário, sessão por hash de token, pedido de recuperação por conta e operações administrativas verificadas no servidor. Nenhum contexto de administrador poderá vir de cabeçalho ou corpo HTTP.
2. Adicionar chaves estrangeiras compostas por loja para referências entre `orders`, `clients`, `quotes` e `messages`, impedindo relações entre lojas mesmo quando IDs forem fornecidos incorretamente. Confirmar a compatibilidade da versão PostgreSQL com as ações `ON DELETE` necessárias antes de escolher a forma final das constraints.
3. Manter um inventário testado das tabelas que têm dados por loja; qualquer nova tabela com `account_id` entra com RLS na mesma migration que a cria.

## Contextos públicos e limite de segurança

As políticas de vitrine e orçamento concedem somente leitura pública ao recurso explicitamente indicado. Para o orçamento, o ID aleatório do link funciona como bearer capability; a resposta pública continua filtrada por `publicRecord`. Para a vitrine, `loja` identifica a conta cuja vitrine já é pública, e a política revela somente produtos publicados e disponíveis.

O contexto de loja é uma decisão confiável do servidor, não uma prova criptográfica dentro do PostgreSQL. RLS protege contra filtros esquecidos e erros comuns no caminho da aplicação; não impede um backend totalmente comprometido ou SQL arbitrário executado com o papel runtime de escolher outro contexto. As consultas permanecem parametrizadas e os IDs de conta não são aceitos do corpo como autoridade. Isolamento contra comprometimento completo do backend exigiria outra fronteira, como credenciais diferentes por loja, fora deste escopo.

## Compatibilidade e implantação

- Consultas tenant-scoped deixarão de usar o caminho HTTP avulso e passarão pelo pool em transação para definir o contexto com segurança. Agrupar consultas relacionadas na mesma transação reduz o custo; consultas simples terão uma transação curta.
- Scripts locais de migration precisam continuar usando uma conexão privilegiada explícita, sem herdar o papel runtime. O código de aplicação não pode importar esse caminho privilegiado.
- Antes de habilitar RLS num deploy preview, verificar que a migration consegue criar/conceder o papel e que cada operação de runtime vê `current_user = reparosm_runtime`, com `rolsuper = false`, `rolbypassrls = false` e papel diferente do proprietário das tabelas. Se Netlify Database não permitir essa separação efetiva, interromper o rollout e resolver o modelo de papel antes de aplicar RLS.
- Validar primeiro em banco local descartável com papel runtime restrito; depois em deploy preview e só então no deploy de produção. As migrations Netlify são executadas por branch, então o preview valida o caminho real de provisionamento sem alterar o branch de produção.

## Verificação de aceite

- Duas lojas de teste não leem, alteram ou excluem linhas uma da outra; inserções com `account_id` diferente do contexto são rejeitadas.
- Sem contexto, consultas tenant-scoped não retornam linhas e escritas são rejeitadas.
- Reutilizar uma conexão após commit, rollback e erro não mantém `account_id` nem papel da operação anterior.
- A vitrine lê somente partes publicadas com estoque e o orçamento público lê somente o ID do link; as rotas autenticadas mantêm os fluxos atuais.
- A matriz roda com o papel runtime restrito, não apenas como `postgres`/proprietário.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` e uma verificação manual dos fluxos login, vitrine e orçamento passam antes da integração.

## Alternativas consideradas

- **Manter apenas `WHERE account_id = ...`:** simples, mas uma consulta esquecida continua vendo dados de todas as lojas.
- **Definir tenant no nível da sessão/conexão:** rejeitado porque conexões reaproveitadas pelo pool podem carregar o contexto para outra requisição.
- **Contexto local por transação + RLS:** recomendado; usa suporte nativo do PostgreSQL e o pool que já existe no projeto.
- **Banco separado por loja:** fronteira mais forte, mas aumenta migrações, conexões, backups e operação; não é a menor mudança para o estágio atual.

## Referências técnicas

- [PostgreSQL — Row Security Policies](https://www.postgresql.org/docs/18/ddl-rowsecurity.html)
- [PostgreSQL — `set_config` e contexto local à transação](https://www.postgresql.org/docs/18/functions-admin.html)
- [Netlify Database — uso do pool para transações](https://docs.netlify.com/build/data-and-storage/netlify-database/api/)
- [Netlify Database — banco e migrations locais](https://docs.netlify.com/build/data-and-storage/netlify-database/local-development/)
