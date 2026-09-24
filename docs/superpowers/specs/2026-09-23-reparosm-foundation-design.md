# ReparoSM: base tipada e lógica compartilhada

> **Documento histórico:** este desenho descreve a etapa de compatibilidade anterior à
> migração para rotas por recurso. A API genérica citada abaixo foi aposentada depois
> que os consumidores internos foram migrados.

## Objetivo

Reduzir o risco da evolução do ReparoSM preparando a base para a futura separação do App Router: formatar o código de forma reproduzível, compartilhar os contratos dos registros entre servidor e interface, validar escritas na API genérica existente e centralizar as regras duplicadas de formatação, telefone e sincronização de clientes.

Este incremento cobre somente os itens 1, 3 e 4 da recomendação original. A migração de telas, autenticação server-side, rotas por recurso, CSS, Postgres no CI, ambiente centralizado e preview deploy ficam para incrementos posteriores.

## Estado atual e restrições

- O projeto usa Next.js 16.2.6, React 19, TypeScript strict e pnpm 12.4.1.
- Os registros continuam armazenados como JSON na tabela `records`; este incremento não altera o schema nem a migração do banco.
- `/api/state` continua sendo a API de leitura e escrita durante esta etapa, para evitar uma migração coordenada de todos os consumidores.
- Dados existentes podem conter campos opcionais e registros legados; os validadores não podem exigir campos que não são necessários para operações já suportadas.
- Não devem ser adicionadas dependências de runtime.
- O checkout contém o commit prévio do usuário; mudanças semânticas dele não devem ser reescritas nem misturadas ao commit de formatação.

## Design

### Formatação e CI

Adicionar Prettier como dependência de desenvolvimento, com configuração alinhada ao estilo atual (`singleQuote`, ponto e vírgula e largura de impressão legível), scripts `format` e `format:check`, e uma etapa `pnpm format:check` no CI. A formatação será registrada em um commit isolado sempre que o estado do arquivo permitir; o hash desse commit será registrado em `.git-blame-ignore-revs` em um commit posterior, pois um commit não consegue conter o próprio hash final.

### Contratos e validação

`lib/types.ts` será a fonte compartilhada para os tipos de registro, registros persistidos, tipos de recurso, estados e respostas usadas pela API e pelos componentes. Os tipos de dados manterão campos opcionais onde o armazenamento atual permite dados antigos, mas os campos mínimos necessários para criar cada recurso serão verificados na fronteira de escrita.

`lib/validation.ts` receberá validadores baseados em `unknown`, sem dependência externa. Cada tipo de registro de negócio terá um validador explícito. O POST de `/api/state` fará parse seguro do JSON, verificará o tipo, validará os dados antes de anexar `_accountId` e retornará erro 400 consistente quando o payload for inválido.

### Lógica compartilhada

`lib/format.ts` centralizará moeda, normalização de telefone brasileiro, validação mínima de telefone e construção de links do WhatsApp. A mesma função será usada pelo dashboard, vitrine, relatório, tela pública de orçamento e integração WhatsApp.

`lib/orders.ts` centralizará a identificação e derivação de cliente a partir de uma OS, além da conversão de orçamento aprovado em OS. As rotas ficarão responsáveis por autenticação, parse, autorização, persistência e resposta HTTP; não duplicarão a regra de matching ou montagem dos dados.

## Segurança e tratamento de erros

- Dados recebidos da rede serão tratados como `unknown` até a validação.
- O identificador e o proprietário continuarão sendo controlados pela rota; `_accountId` enviado pelo cliente será ignorado e substituído pela conta autenticada.
- Falhas de JSON inválido, tipo desconhecido, campos obrigatórios ausentes, números não finitos e enums inválidos retornarão 400.
- A publicação de dados públicos continuará usando a lista explícita de campos de `lib/public-data.ts`.
- Nenhum segredo ou campo interno será exposto nos tipos de resposta pública.

## Verificação

- Testes unitários devem cobrir moeda, telefone de 10/11 dígitos, números já prefixados, URL do WhatsApp, validação por recurso, payload inválido e matching de cliente por telefone/nome.
- O conjunto existente deve continuar passando.
- O CI deve executar formatação, lint, typecheck, testes e build.
- Antes de concluir, executar `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build` em sequência e registrar o resultado.
