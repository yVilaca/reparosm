# Isolamento multi-loja com PostgreSQL RLS

**Status:** P0 implementado e validado no Deploy Preview de `codex/tenant-rls-design` (migrations 0001–0009 aplicadas). A produção ainda não foi migrada; a integração aguarda a validação final do endpoint de autenticação no preview e a disponibilidade das Functions da Netlify.
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

## Decisão implementada no P0

Usar RLS do PostgreSQL com contexto por transação e papel efetivo restrito. Aproveitar o `pg.Pool` já fornecido por `@netlify/database`; não adicionar dependências nem usar contexto de sessão que possa sobreviver à devolução da conexão ao pool.

### P0 — proteção dos dados operacionais

1. Criar o papel efetivo `reparosm_runtime`, sem `SUPERUSER`, `BYPASSRLS`, propriedade das tabelas da aplicação ou associação que permita assumir outro papel. Conceder somente `SELECT`, `INSERT`, `UPDATE` e `DELETE` necessários. O principal usado pelas migrations continua separado e privilegiado.
2. Em cada operação da aplicação, abrir uma transação no pool e executar `SET LOCAL ROLE reparosm_runtime`. Para operação de loja, definir `app.account_id` com `set_config(..., true)` antes da consulta. A conexão volta ao pool sem papel ou loja persistidos.
3. Criar um helper mínimo para consulta e transação tenant-scoped. Repositórios que já recebem `accountId` passam a usá-lo por padrão; transações de várias escritas recebem o mesmo contexto uma única vez. O contexto só vem da conta validada no servidor.
4. Habilitar e forçar RLS nas 12 tabelas operacionais listadas acima. A política normal permite linhas cujo `account_id` corresponda a `app.account_id`, tanto em `USING` quanto em `WITH CHECK`. Contexto ausente ou vazio não corresponde a nenhuma linha.
5. Preservar a vitrine com políticas somente de leitura separadas: em `parts`, `app.public_store_account_id` permite apenas produtos publicados e com estoque positivo; em `shops`, permite somente a loja correspondente. Como RLS é por linha, o repositório público também seleciona e serializa apenas os campos públicos do perfil. O ID da URL não concede acesso a consultas ou escritas administrativas.
6. Preservar o orçamento público com uma política somente de leitura para o `id` indicado por `app.public_quote_id`. Na resposta do orçamento, a aplicação primeiro lê apenas esse orçamento pela capacidade do link; dentro da mesma transação, define `app.account_id` a partir do `account_id` retornado pelo banco antes de criar ordem/cliente e atualizar o orçamento. Se a ordem não puder ser salva por colisão de ID entre lojas, reverter também a sequência e manter o orçamento sem resposta. Não aceitar `account_id` do cliente.
7. Manter `accounts`, `sessions`, `password_requests` e `login_failures` fora desta primeira migration, sob seus fluxos atuais de autenticação e administração. A aplicação e os testes não devem tratar essa exceção como isolamento RLS; ela é o item prioritário do P1 abaixo.

### P1 — fechar as exceções e relacionamentos

1. Adicionar chaves estrangeiras compostas por loja para referências entre `orders`, `clients`, `quotes` e `messages`, impedindo relações entre lojas mesmo quando IDs forem fornecidos incorretamente. Ao remover um cliente, orçamento ou ordem, anular somente a coluna de referência; `account_id` deve permanecer intacto.
2. Levar `accounts`, `sessions`, `password_requests` e `login_failures` para RLS forçada, com contextos separados para consulta de login por usuário, sessão pelo hash do token, pedido de recuperação por conta e operações administrativas verificadas no servidor. Nenhum contexto de administrador poderá vir de cabeçalho ou corpo HTTP. As consultas públicas devem selecionar somente o status da conta, nunca o hash da senha.
3. Manter um inventário testado das tabelas que têm dados por loja; qualquer nova tabela com `account_id` entra com RLS na mesma migration que a cria.

## Contextos públicos e limite de segurança

As políticas de vitrine e orçamento concedem somente leitura pública ao recurso explicitamente indicado. Para o orçamento, o ID aleatório do link funciona como bearer capability; a resposta pública continua filtrada por `publicRecord`. Para a vitrine, `loja` identifica a conta cuja vitrine já é pública, e a política revela somente produtos publicados e disponíveis.

O contexto de loja é uma decisão confiável do servidor, não uma prova criptográfica dentro do PostgreSQL. RLS protege contra filtros esquecidos e erros comuns no caminho da aplicação; não impede um backend totalmente comprometido ou SQL arbitrário executado com o papel runtime de escolher outro contexto. As consultas permanecem parametrizadas e os IDs de conta não são aceitos do corpo como autoridade. Isolamento contra comprometimento completo do backend exigiria outra fronteira, como credenciais diferentes por loja, fora deste escopo.

## Compatibilidade e implantação

- Consultas tenant-scoped deixarão de usar o caminho HTTP avulso e passarão pelo pool em transação para definir o contexto com segurança. Agrupar consultas relacionadas na mesma transação reduz o custo; consultas simples terão uma transação curta.
- Scripts locais de migration precisam continuar usando uma conexão privilegiada explícita, sem herdar o papel runtime. O código de aplicação não pode importar esse caminho privilegiado.
- No preview, `session_user` é `netlifydb_owner` e tem `BYPASSRLS`; por isso, cada consulta da aplicação precisa passar por `lib/db.ts`, que executa `SET LOCAL ROLE reparosm_runtime`. O papel efetivo foi verificado como não superusuário, sem `BYPASSRLS` e sem propriedade das tabelas operacionais. Não usar conexões ou consultas diretas fora desse wrapper.
- Antes de habilitar RLS num deploy preview, verificar que a migration consegue criar/conceder o papel e que cada operação de runtime vê `current_user = reparosm_runtime`, com `rolsuper = false`, `rolbypassrls = false` e papel diferente do proprietário das tabelas. Se Netlify Database não permitir essa separação efetiva, interromper o rollout e resolver o modelo de papel antes de aplicar RLS.
- Validar primeiro em banco local descartável com papel runtime restrito; depois em deploy preview e só então no deploy de produção. As migrations Netlify são executadas por branch, então o preview valida o caminho real de provisionamento sem alterar o branch de produção.

## Verificação de aceite

- Duas lojas de teste não leem, alteram ou excluem linhas uma da outra; inserções com `account_id` diferente do contexto são rejeitadas.
- Sem contexto, consultas tenant-scoped não retornam linhas e escritas são rejeitadas.
- Reutilizar uma conexão após commit, rollback e erro não mantém `account_id` nem papel da operação anterior.
- A vitrine lê somente partes publicadas com estoque e o orçamento público lê somente o ID do link; as rotas autenticadas mantêm os fluxos atuais.
- A matriz roda com o papel runtime restrito, não apenas como `postgres`/proprietário.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` e uma verificação manual dos fluxos login, vitrine e orçamento passam antes da integração.

### Resultado do P0 e validação do preview

- A CI passou com 59/59 testes, sem skips, além de typecheck, lint, build e verificações do Graft. Essa execução antecede somente a remoção dos diagnósticos temporários; uma execução final está pendente após a limpeza.
- As migrations 0001–0009 estão aplicadas no banco do Deploy Preview; não há migrations pendentes. A migration 0008 foi restaurada ao conteúdo já aplicado e a correção da associação ficou na migration nova 0009, evitando alterar o checksum histórico.
- A conexão da Function usa `session_user = netlifydb_owner`; a associação permite `SET ROLE reparosm_runtime`. Dentro da transação real da aplicação, `current_user = reparosm_runtime`, `rolsuper = false`, `rolbypassrls = false` e o papel não é proprietário de nenhuma das 12 tabelas operacionais. `shops` está com RLS habilitado e forçado.
- Smoke test real no preview: duas lojas temporárias viram somente a própria linha; sem contexto nenhuma linha ficou visível; uma escrita na loja alheia foi rejeitada. Os registros foram removidos ao fim do teste.
- A vitrine respondeu 200; orçamento público de duas contas respondeu 200 com projeção limitada; a aprovação pública respondeu 200 e criou uma ordem vinculada. Os dados temporários também foram removidos.
- Login/logout de uma conta merchant temporária passou num teste servidor-a-servidor sem cabeçalho `Origin`. Uma tentativa com `Origin` explícito retornou 403; é necessário repetir o fluxo em navegador e confirmar a origem percebida pelo handler antes de promover.
- Depois desses testes, novas chamadas de Function ao preview começaram a retornar `503` com `usage_exceeded`, embora o deploy continue marcado como pronto. Não foi feita alteração de plano ou billing; a checagem final de runtime depende de a Netlify voltar a aceitar invocações.
- A produção não recebeu migrations nem deploy desta branch.

## Checklist antes do rollout

1. [x] Confirmar no preview o principal, o papel efetivo, atributos RLS e propriedade das tabelas.
2. [x] Aplicar as migrations do preview e confirmar que a associação permite assumir o papel restrito.
3. [x] Executar smoke tests de isolamento entre lojas, ausência de contexto, vitrine e leitura/aprovação de orçamento.
4. [ ] Repetir login/logout em navegador com `Origin` real e retestar Functions depois que a Netlify liberar invocações.
5. [ ] Promover as migrations e verificar o deploy de produção somente após concluir o item 4.

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
