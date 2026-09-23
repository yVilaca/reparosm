# Plano: esquema relacional do banco

> **Status (2026-09-23):** Fases 0–4 concluídas (PRs #5–#9). Fase 5 pendente.
> Desvios em relação ao texto abaixo:
>
> - Inventário de produção (Fase 0) não executado; as cópias de dados foram escritas de forma defensiva e testadas com registros inválidos (`tests/migrations.test.mjs`).
> - `orders.code` não é `UNIQUE`: o app gera `OS-` + 5 dígitos do relógio, que se repetem a cada ~27 h. Próximo passo sugerido: numeração sequencial por conta no servidor.
> - `cash_entries` não tem `order_id` (a referência é texto livre e nenhuma tela usa o vínculo).
> - Login: bloqueio de 15 min após 10 falhas por par usuário+IP (tabela `login_failures`).
> - Backup de `records` antes do `DROP` não foi feito (sistema em desenvolvimento).

Substituir a tabela genérica `records` (id, type, data JSON em texto) por tabelas
por entidade, com `account_id` em todo dado de negócio.

## Objetivos

- Isolamento entre lojistas garantido pelo banco (FK + `WHERE account_id`), não por `.filter` em JS.
- Consultas lendo só os dados da loja (índices começando por `account_id`).
- Integridade: FKs, `CHECK`, transações em gravações de vários passos.
- Tipos corretos: `numeric(12,2)` para dinheiro, `timestamptz`/`date` para datas.
- Sessões seguras: só o hash do token no banco.

## Fora do escopo

- Dividir `app/page.tsx` e trocar `/api/state` por rotas por recurso (plano próprio).
- Baixa de estoque por OS (`order_items`) e criptografia da senha do aparelho: Fase 5, opcional.

## Princípios de execução

1. **Contrato da API preservado até a Fase 4.** `/api/state` continua devolvendo
   `{ records: [{ id, type, data }] }`. Cada repositório converte linha ⇄ esse formato,
   então `app/page.tsx` não muda nas Fases 1–3.
2. **Cada migração cria as tabelas e já copia os dados de `records`** no mesmo SQL
   (`INSERT … SELECT` com `data::jsonb`). Deploy = estrutura + dados, sem script manual.
3. **`records` só é removida na Fase 4.** Até lá, reverter o código é possível; gravações
   feitas depois da troca existem só nas tabelas novas (ver Riscos).
4. **Ids atuais preservados como `text`** (`order-<uuid>`, `quote-<uuid>`, `account-<usuário>`):
   links públicos `/o/<id>` já enviados continuam válidos. Novos ids seguem o mesmo formato.
5. **Sem ORM.** SQL parametrizado do `@netlify/database` + um módulo por tabela em `lib/repos/`.
   Transações via `getDatabase().pool` (`BEGIN`/`COMMIT`).
6. Status em `text` + `CHECK` (não `ENUM`), para acrescentar valores sem migração complexa.

## Fase 0 — Preparação (1 PR)

- [ ] Inventário de produção, somente leitura: contagem por `type`, registros sem
      `_accountId`, `_accountId` apontando para conta inexistente, telefones/códigos duplicados
      por loja (quebrariam `UNIQUE`). Registrar o resultado no PR.
- [ ] Postgres no CI: service container `postgres:17` no `ci.yml`, `DATABASE_URL` apontando para ele.
- [ ] `scripts/migrate-local.mjs`: aplica `netlify/database/migrations/*.sql` em ordem num banco
      vazio (CI e desenvolvimento local; em produção a Netlify aplica as migrações no deploy).
- [ ] Helper de teste `tests/db.mjs`: cria schema temporário, roda migrações, limpa ao final.
- [ ] `lib/db.ts`: expor `sql` e `transaction(fn)` além das funções atuais.
- [ ] Documentar no README como subir Postgres local (`docker run postgres:17`) e rodar testes.

**Pronto quando:** CI roda testes de integração contra Postgres real.

## Fase 1 — Contas e autenticação (1 PR)

Migração `0002_accounts.sql`:

```sql
CREATE TABLE accounts (
  id text PRIMARY KEY,                       -- 'account-<usuário>' / 'account-admin'
  username text NOT NULL UNIQUE,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','merchant')),
  status text NOT NULL CHECK (status IN ('active','suspended','cancelled')),
  password_hash text NOT NULL,
  must_change_password boolean NOT NULL DEFAULT false,
  plan text, due_date date, access_policy text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,               -- sha256(token); o token só existe no cookie
  account_id text NOT NULL REFERENCES accounts ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON sessions (account_id);
CREATE INDEX ON sessions (expires_at);
CREATE TABLE password_requests (
  account_id text PRIMARY KEY REFERENCES accounts ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending','resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE TABLE whatsapp_configs (
  account_id text PRIMARY KEY REFERENCES accounts ON DELETE CASCADE,
  iv text NOT NULL, cipher text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- backfill: INSERT … SELECT de records WHERE type IN ('account','password-request','whatsapp-config')
-- sessões NÃO são copiadas (tokens em texto puro): todos fazem login de novo uma vez.
```

Código:

- [ ] `lib/repos/accounts.ts`, `lib/repos/sessions.ts` (hash SHA-256 do token; `revokeSessions`
      vira `DELETE … WHERE account_id = $1`; limpeza de expiradas no login).
- [ ] `lib/auth.ts`: `ensureAdmin`, `accountByUsername`, `currentSession`, `currentAccount`.
      `currentAccount` passa a ser 1 consulta (join sessão + conta).
- [ ] `app/api/auth/route.ts`, `app/api/accounts/route.ts` (DELETE de conta = um `DELETE FROM accounts`
      quando as demais tabelas tiverem FK; até a Fase 3, apagar também os `records` da conta).
- [ ] `lib/whatsapp.ts`: `whatsappConfiguration` / `saveWhatsappConfiguration`; `/api/whatsapp` disconnect.
- [ ] `businessTypes` deixa de precisar excluir `account`/`session` (não estão mais em `records`).
- [ ] Recomendado no mesmo PR (P0 de segurança): tabela `login_attempts` e bloqueio temporário
      após N falhas por usuário/IP.

Testes: `scripts/test-recovery.mjs` migrado para Postgres real; casos de hash de token,
revogação, sessão expirada, conta suspensa, exclusão em cascata.

## Fase 2 — Loja, clientes, orçamentos e OS (1 PR)

Migração `0003_core.sql`:

```sql
CREATE TABLE shops (
  account_id text PRIMARY KEY REFERENCES accounts ON DELETE CASCADE,
  name text NOT NULL, phone text NOT NULL, address text, document text, email text, logo text,
  profile jsonb NOT NULL DEFAULT '{}',       -- instagram, rodapé, horários, termos…
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE clients (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts ON DELETE CASCADE,
  name text NOT NULL, phone text NOT NULL DEFAULT '', email text, document text, address text,
  birth date, status text, vip boolean NOT NULL DEFAULT false, notes text,
  automatic boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON clients (account_id, updated_at DESC);
CREATE INDEX ON clients (account_id, phone);
CREATE TABLE quotes (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts ON DELETE CASCADE,
  client_id text REFERENCES clients ON DELETE SET NULL,
  code text, customer text NOT NULL, phone text NOT NULL DEFAULT '',
  device text NOT NULL, problem text, service text NOT NULL, notes text,
  labor numeric(12,2) NOT NULL DEFAULT 0, parts numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  valid_until date, status text NOT NULL DEFAULT 'Aguardando'
    CHECK (status IN ('Aguardando','Aprovado','Recusado')),
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE orders (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts ON DELETE CASCADE,
  client_id text REFERENCES clients ON DELETE SET NULL,
  quote_id text REFERENCES quotes ON DELETE SET NULL,
  code text NOT NULL,
  customer text NOT NULL, phone text NOT NULL DEFAULT '',   -- retrato no momento da OS
  device text NOT NULL, imei text, device_password text, pattern int[],
  problem text, service text, notes text, technician text,
  priority text NOT NULL DEFAULT 'Normal', stage text NOT NULL DEFAULT 'Recebido',
  status text NOT NULL DEFAULT 'Aberto',
  labor numeric(12,2) NOT NULL DEFAULT 0, parts numeric(12,2) NOT NULL DEFAULT 0,
  cost numeric(12,2) NOT NULL DEFAULT 0, total numeric(12,2) NOT NULL DEFAULT 0,
  warranty_days int, whatsapp_consent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, code)
);
CREATE INDEX ON orders (account_id, updated_at DESC);
CREATE INDEX ON quotes (account_id, updated_at DESC);
-- backfill em ordem: shops → clients → quotes → orders; client_id resolvido por telefone
-- normalizado e depois por nome (mesma regra de lib/orders.ts findMatchingClient).
-- profit NÃO vira coluna: é total - cost, calculado na leitura.
-- lastOrderId/lastOrderCode/lastDevice do cliente viram consulta (última OS por client_id).
```

Código:

- [ ] `lib/repos/{shops,clients,quotes,orders}.ts` com conversão linha ⇄ `{id,type,data}`.
- [ ] `app/api/state/route.ts`: GET/POST/DELETE despacham por `type` para o repositório;
      tipos ainda não migrados continuam em `records`.
- [ ] Salvar OS + criar/atualizar cliente numa transação; `findMatchingClient` vira
      `SELECT … WHERE account_id = $1 AND (phone = $2 OR lower(name) = $3)`.
- [ ] `app/api/public/quote/route.ts`: aprovação (OS + cliente + orçamento) numa transação,
      com `SELECT … FOR UPDATE` no orçamento para impedir aprovação dupla.
- [ ] Vitrine pública (`shop`) lendo de `shops`.

Resolver no inventário antes do PR: códigos de OS repetidos na mesma loja (renomear com sufixo).

## Fase 3 — Estoque, financeiro, mensagens e demais (1 PR)

Migração `0004_rest.sql`:

- `parts` (stock `int CHECK (stock >= 0)`, cost/price `numeric`, published, sku, category, image)
  - índice `(account_id, published)` para a vitrine.
- `cash_entries` (`kind IN ('in','out')` substitui `payment`/`expense`; `order_id` FK opcional,
  preenchido quando `reference` casar com um código de OS da mesma loja).
- `messages` (`order_id` FK `ON DELETE SET NULL`), `films` (só os da loja; o catálogo padrão
  continua em `lib/film-catalog.ts`), `automations`, `tutorials`.
- Backfill de todos a partir de `records`.

Código: repositórios restantes, `/api/state` sem nenhum tipo em `records`, `notifyOrder`
gravando em `messages`, relatório (`/relatorio`) somando no SQL se for simples.

## Fase 4 — Remoção de `records` (1 PR)

- [ ] Conferir contagens: cada tipo em `records` = linhas na tabela nova (query no PR).
- [ ] Backup (`pg_dump` da tabela `records`) guardado fora do repositório.
- [ ] Migração `0005_drop_records.sql`: `DROP TABLE records`.
- [ ] Remover `listRecords/getRecord/saveRecord/deleteRecord/clearRecords`, `_accountId`,
      o fallback `|| 'account-admin'`, `businessTypes` e `StoredRecord` genérico.

## Fase 5 — Opcional, depois

- `order_items (order_id, part_id, quantity, unit_price)` com baixa de estoque na mesma transação.
- Criptografar `device_password`/`pattern` com a mesma chave AES-GCM do WhatsApp (ou uma própria).
- Row Level Security como segunda barreira de isolamento.

## Verificação por fase

- `pnpm lint`, `pnpm typecheck`, `pnpm test` (com Postgres) e `pnpm build` no CI.
- Teste de isolamento obrigatório em cada repositório: conta A não lê, altera nem apaga dado da conta B.
- Após o deploy: login admin, login lojista, criar/editar OS, aprovar orçamento pelo link público,
  vitrine, WhatsApp de teste; conferir contagens por tabela.

## Riscos

| Risco                                                                         | Mitigação                                                                                                                      |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Rollback depois da troca perde gravações novas (existem só nas tabelas novas) | Fases pequenas, deploy em horário de pouco uso, validar logo após; se preciso, SQL reverso copiando das tabelas para `records` |
| Dados antigos inválidos quebram `NOT NULL`/`CHECK`/`UNIQUE` no backfill       | Inventário da Fase 0; backfill com `COALESCE`/normalização; migração falha inteira (transação) em vez de parcial               |
| Deploy preview usando o banco de produção                                     | Confirmar se a Netlify cria banco separado por preview; se não, validar só no CI/local antes do merge                          |
| Todos deslogados na Fase 1                                                    | Esperado (sessões não migradas); avisar os lojistas                                                                            |

## Ordem e tamanho

Fase 0 → 1 → 2 → 3 → 4, um PR por fase, cada um deployável sozinho.
A Fase 2 é a maior (OS e orçamentos concentram a lógica).
