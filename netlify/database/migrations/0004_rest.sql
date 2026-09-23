-- Inventory, cash entries, messages, films, automations and tutorials leave the records table.

CREATE TABLE parts (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  sku text,
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  cost numeric(12, 2) NOT NULL DEFAULT 0,
  price numeric(12, 2) NOT NULL DEFAULT 0,
  published boolean NOT NULL DEFAULT false,
  image text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX parts_account_updated_idx ON parts (account_id, updated_at DESC);

-- Payments ('in') and expenses ('out') share one table.
CREATE TABLE cash_entries (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('in', 'out')),
  description text NOT NULL,
  reference text,
  value numeric(12, 2) NOT NULL DEFAULT 0,
  method text,
  date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cash_entries_account_kind_idx ON cash_entries (account_id, kind, updated_at DESC);

CREATE TABLE messages (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  order_id text REFERENCES orders (id) ON DELETE SET NULL,
  customer text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT '',
  provider_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_account_updated_idx ON messages (account_id, updated_at DESC);
CREATE INDEX messages_order_idx ON messages (order_id);

-- Store-specific films; the shared default catalogue stays in lib/film-catalog.ts.
CREATE TABLE films (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  brand text NOT NULL,
  model text NOT NULL,
  compatible text NOT NULL,
  size text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX films_account_updated_idx ON films (account_id, updated_at DESC);

CREATE TABLE automations (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  name text NOT NULL,
  schedule text NOT NULL,
  message text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX automations_account_idx ON automations (account_id);

CREATE TABLE tutorials (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  title text NOT NULL,
  url text NOT NULL,
  category text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tutorials_account_idx ON tutorials (account_id);

-- Copy helpers: malformed legacy values become NULL / 0 instead of failing the deploy.
CREATE FUNCTION migration_num(value text) RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN value ~ '^-?\d+(\.\d+)?$' THEN round(value::numeric, 2) ELSE 0 END
$$;
CREATE FUNCTION migration_day(value text) RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN value ~ '^\d{4}-\d{2}-\d{2}$' THEN value::date END
$$;
CREATE FUNCTION migration_ts(value text, fallback text) RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN value ~ '^\d{4}-\d{2}-\d{2}T' THEN value::timestamptz
              ELSE (fallback || '+00')::timestamptz END
$$;

-- Legacy rows without an owner belonged to the administrator.
CREATE VIEW migration_legacy AS
SELECT r.id, r.type, r.data::jsonb AS d, coalesce(r.data::jsonb->>'_accountId', 'account-admin') AS owner,
       r.created_at, (r.updated_at || '+00')::timestamptz AS updated_at
FROM records r
WHERE coalesce(r.data::jsonb->>'_accountId', 'account-admin') IN (SELECT id FROM accounts);

INSERT INTO parts (id, account_id, name, category, sku, stock, cost, price, published, image,
                   created_at, updated_at)
SELECT id, owner, coalesce(nullif(d->>'name', ''), 'Sem nome'), d->>'category', d->>'sku',
       greatest(0, round(migration_num(d->>'stock')))::integer, migration_num(d->>'cost'),
       migration_num(d->>'price'), coalesce(d->>'published' = 'true', false), d->>'image',
       migration_ts(d->>'createdAt', created_at), updated_at
FROM migration_legacy WHERE type = 'part';

INSERT INTO cash_entries (id, account_id, kind, description, reference, value, method, date,
                          created_at, updated_at)
SELECT id, owner, CASE WHEN type = 'payment' THEN 'in' ELSE 'out' END,
       coalesce(d->>'description', ''), d->>'reference', migration_num(d->>'value'), d->>'method',
       migration_day(d->>'date'), migration_ts(d->>'createdAt', created_at), updated_at
FROM migration_legacy WHERE type IN ('payment', 'expense');

INSERT INTO messages (id, account_id, order_id, customer, phone, kind, message, status,
                      provider_id, error, sent_at, created_at, updated_at)
SELECT l.id, l.owner, o.id, coalesce(d->>'customer', ''), coalesce(d->>'phone', ''),
       coalesce(d->>'kind', ''), coalesce(d->>'message', ''), coalesce(d->>'status', ''),
       d->>'providerId', d->>'error',
       CASE WHEN d->>'sentAt' ~ '^\d{4}-\d{2}-\d{2}T' THEN (d->>'sentAt')::timestamptz END,
       migration_ts(d->>'sentAt', l.created_at), l.updated_at
FROM migration_legacy l
LEFT JOIN orders o ON o.id = l.d->>'orderId' AND o.account_id = l.owner
WHERE l.type = 'message';

INSERT INTO films (id, account_id, brand, model, compatible, size, updated_at)
SELECT id, owner, coalesce(d->>'brand', ''), coalesce(d->>'model', ''),
       coalesce(d->>'compatible', ''), d->>'size', updated_at
FROM migration_legacy WHERE type = 'film' AND id NOT LIKE 'film-default-%';

INSERT INTO automations (id, account_id, name, schedule, message, enabled, updated_at)
SELECT id, owner, coalesce(d->>'name', ''), coalesce(d->>'schedule', ''),
       coalesce(d->>'message', ''), coalesce(d->>'enabled' = 'true', false), updated_at
FROM migration_legacy WHERE type = 'automation';

INSERT INTO tutorials (id, account_id, title, url, category, description, created_at, updated_at)
SELECT id, owner, coalesce(d->>'title', ''), coalesce(d->>'url', ''), d->>'category',
       d->>'description', migration_ts(d->>'createdAt', created_at), updated_at
FROM migration_legacy WHERE type = 'tutorial';

DROP VIEW migration_legacy;
DROP FUNCTION migration_num(text);
DROP FUNCTION migration_day(text);
DROP FUNCTION migration_ts(text, text);

DELETE FROM records
WHERE type IN ('part', 'payment', 'expense', 'message', 'film', 'automation', 'tutorial');
