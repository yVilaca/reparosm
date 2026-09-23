-- Shops, clients, quotes and service orders leave the generic records table.

CREATE TABLE shops (
  account_id text PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  -- Display-only profile fields (address, logo, social links, terms…), never filtered on.
  profile jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clients (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  email text,
  document text,
  address text,
  birth date,
  status text,
  vip boolean NOT NULL DEFAULT false,
  notes text,
  automatic boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clients_account_updated_idx ON clients (account_id, updated_at DESC);
CREATE INDEX clients_account_phone_idx ON clients (account_id, phone);

CREATE TABLE quotes (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  client_id text REFERENCES clients (id) ON DELETE SET NULL,
  code text,
  customer text NOT NULL,
  phone text NOT NULL DEFAULT '',
  device text NOT NULL,
  problem text,
  service text NOT NULL,
  notes text,
  labor numeric(12, 2) NOT NULL DEFAULT 0,
  parts numeric(12, 2) NOT NULL DEFAULT 0,
  total numeric(12, 2) NOT NULL DEFAULT 0,
  valid_until date,
  status text NOT NULL DEFAULT 'Aguardando' CHECK (status IN ('Aguardando', 'Aprovado', 'Recusado')),
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quotes_account_updated_idx ON quotes (account_id, updated_at DESC);

CREATE TABLE orders (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  client_id text REFERENCES clients (id) ON DELETE SET NULL,
  quote_id text REFERENCES quotes (id) ON DELETE SET NULL,
  -- Display code. Not unique: the app derives it from the clock and it can repeat.
  code text NOT NULL,
  -- Customer name and phone as given on the order (the client record may change later).
  customer text NOT NULL,
  phone text NOT NULL DEFAULT '',
  device text NOT NULL,
  imei text,
  device_password text,
  pattern integer[],
  problem text,
  service text,
  notes text,
  technician text,
  priority text NOT NULL DEFAULT 'Normal',
  stage text NOT NULL DEFAULT 'Recebido',
  status text NOT NULL DEFAULT 'Aberto',
  labor numeric(12, 2) NOT NULL DEFAULT 0,
  parts numeric(12, 2) NOT NULL DEFAULT 0,
  cost numeric(12, 2) NOT NULL DEFAULT 0,
  total numeric(12, 2) NOT NULL DEFAULT 0,
  warranty_days integer,
  whatsapp_consent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_account_updated_idx ON orders (account_id, updated_at DESC);
CREATE INDEX orders_account_code_idx ON orders (account_id, code);
CREATE INDEX orders_client_idx ON orders (client_id);
CREATE INDEX orders_quote_idx ON orders (quote_id);

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
CREATE FUNCTION migration_digits(value text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(coalesce(value, ''), '\D', '', 'g')
$$;

-- Legacy rows without an owner belonged to the administrator.
CREATE VIEW migration_legacy AS
SELECT r.id, r.type, r.data::jsonb AS d, coalesce(r.data::jsonb->>'_accountId', 'account-admin') AS owner,
       r.created_at, r.updated_at
FROM records r;

INSERT INTO shops (account_id, name, phone, profile, updated_at)
SELECT DISTINCT ON (owner)
  owner, coalesce(d->>'name', ''), coalesce(d->>'phone', ''),
  d - '_accountId' - 'id' - 'name' - 'phone', (updated_at || '+00')::timestamptz
FROM migration_legacy
WHERE type = 'shop' AND owner IN (SELECT id FROM accounts)
ORDER BY owner, updated_at DESC;

INSERT INTO clients (id, account_id, name, phone, email, document, address, birth, status, vip,
                     notes, automatic, created_at, updated_at)
SELECT id, owner, coalesce(nullif(trim(d->>'name'), ''), 'Sem nome'), coalesce(d->>'phone', ''),
       d->>'email', d->>'document', d->>'address', migration_day(d->>'birth'), d->>'status',
       coalesce(d->>'vip' = 'true', false), d->>'notes', coalesce(d->>'automatic' = 'true', false),
       migration_ts(d->>'createdAt', created_at), (updated_at || '+00')::timestamptz
FROM migration_legacy
WHERE type = 'client' AND owner IN (SELECT id FROM accounts);

INSERT INTO quotes (id, account_id, code, customer, phone, device, problem, service, notes, labor,
                    parts, total, valid_until, status, answered_at, created_at, updated_at)
SELECT id, owner, d->>'code', coalesce(d->>'customer', ''), coalesce(d->>'phone', ''),
       coalesce(d->>'device', ''), d->>'problem', coalesce(d->>'service', ''), d->>'notes',
       migration_num(d->>'labor'), migration_num(d->>'parts'), migration_num(d->>'total'),
       migration_day(d->>'validUntil'),
       CASE WHEN d->>'status' IN ('Aprovado', 'Recusado') THEN d->>'status' ELSE 'Aguardando' END,
       CASE WHEN d->>'answeredAt' ~ '^\d{4}-\d{2}-\d{2}T' THEN (d->>'answeredAt')::timestamptz END,
       migration_ts(d->>'createdAt', created_at), (updated_at || '+00')::timestamptz
FROM migration_legacy
WHERE type = 'quote' AND owner IN (SELECT id FROM accounts);

INSERT INTO orders (id, account_id, quote_id, code, customer, phone, device, imei, device_password,
                    pattern, problem, service, notes, technician, priority, stage, status, labor,
                    parts, cost, total, warranty_days, whatsapp_consent, created_at, updated_at)
SELECT l.id, l.owner, q.id, coalesce(nullif(d->>'code', ''), 'OS-' || right(l.id, 5)),
       coalesce(d->>'customer', ''), coalesce(d->>'phone', ''), coalesce(d->>'device', ''),
       d->>'imei', d->>'password',
       CASE WHEN jsonb_typeof(d->'pattern') = 'array' THEN ARRAY(
         SELECT e::integer FROM jsonb_array_elements_text(d->'pattern') e WHERE e ~ '^\d{1,9}$'
       ) END,
       d->>'problem', d->>'service', d->>'notes', d->>'technician',
       coalesce(nullif(d->>'priority', ''), 'Normal'), coalesce(nullif(d->>'stage', ''), 'Recebido'),
       coalesce(nullif(d->>'status', ''), 'Aberto'),
       migration_num(d->>'labor'), migration_num(d->>'parts'), migration_num(d->>'cost'),
       migration_num(d->>'total'),
       CASE WHEN d->>'warrantyDays' ~ '^\d{1,6}$' THEN (d->>'warrantyDays')::integer END,
       coalesce(d->>'whatsappConsent' = 'true', false),
       migration_ts(d->>'createdAt', l.created_at), (l.updated_at || '+00')::timestamptz
FROM migration_legacy l
LEFT JOIN quotes q ON q.id = l.d->>'quoteId' AND q.account_id = l.owner
WHERE l.type = 'order' AND l.owner IN (SELECT id FROM accounts);

-- Link orders to clients the way the app matched them: same phone first, then same name.
UPDATE orders o SET client_id = (
  SELECT c.id FROM clients c
  WHERE c.account_id = o.account_id
    AND ((length(migration_digits(o.phone)) >= 10
          AND migration_digits(c.phone) = migration_digits(o.phone))
         OR lower(trim(c.name)) = lower(trim(o.customer)))
  ORDER BY migration_digits(c.phone) = migration_digits(o.phone) DESC, c.updated_at DESC
  LIMIT 1
);
UPDATE quotes q SET client_id = o.client_id FROM orders o WHERE o.quote_id = q.id;

DROP VIEW migration_legacy;
DROP FUNCTION migration_num(text);
DROP FUNCTION migration_day(text);
DROP FUNCTION migration_ts(text, text);
DROP FUNCTION migration_digits(text);

DELETE FROM records WHERE type IN ('shop', 'client', 'quote', 'order');
