-- Accounts, sessions, password requests and WhatsApp settings leave the generic records table.

CREATE TABLE accounts (
  id text PRIMARY KEY,
  username text NOT NULL UNIQUE,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'merchant')),
  status text NOT NULL CHECK (status IN ('active', 'suspended', 'cancelled')),
  password_hash text NOT NULL,
  must_change_password boolean NOT NULL DEFAULT false,
  plan text,
  due_date date,
  access_policy text,
  password_reset_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only a SHA-256 hash of the session token is stored; the token itself lives in the cookie.
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_account_id_idx ON sessions (account_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE password_requests (
  account_id text PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE whatsapp_configs (
  account_id text PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  iv text NOT NULL,
  cipher text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Failed logins per user and IP, for temporary lockout. Per pair, so an attacker elsewhere
-- cannot lock the real user out.
CREATE TABLE login_failures (
  username text NOT NULL,
  ip text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_failures_lookup_idx ON login_failures (username, ip, created_at);

-- Copy existing rows. Values that do not fit the new constraints fall back to safe defaults
-- instead of failing the deploy; malformed dates become NULL / the record's own timestamp.
INSERT INTO accounts (
  id, username, name, role, status, password_hash, must_change_password,
  plan, due_date, access_policy, created_at, updated_at
)
SELECT
  r.id,
  d->>'username',
  COALESCE(NULLIF(d->>'name', ''), d->>'username'),
  CASE WHEN d->>'role' = 'admin' THEN 'admin' ELSE 'merchant' END,
  CASE WHEN d->>'status' IN ('active', 'suspended', 'cancelled') THEN d->>'status' ELSE 'suspended' END,
  d->>'passwordHash',
  COALESCE(d->>'mustChangePassword' = 'true', false),
  NULLIF(d->>'plan', ''),
  CASE WHEN d->>'dueDate' ~ '^\d{4}-\d{2}-\d{2}$' THEN (d->>'dueDate')::date END,
  d->>'accessPolicy',
  CASE WHEN d->>'createdAt' ~ '^\d{4}-\d{2}-\d{2}T' THEN (d->>'createdAt')::timestamptz
       ELSE (r.created_at || '+00')::timestamptz END,
  (r.updated_at || '+00')::timestamptz
FROM records r, LATERAL (SELECT r.data::jsonb AS d) j
WHERE r.type = 'account' AND d->>'username' <> '' AND d->>'passwordHash' <> ''
ON CONFLICT DO NOTHING;

INSERT INTO password_requests (account_id, status, created_at, resolved_at)
SELECT
  d->>'accountId',
  CASE WHEN d->>'status' = 'pending' THEN 'pending' ELSE 'resolved' END,
  CASE WHEN d->>'createdAt' ~ '^\d{4}-\d{2}-\d{2}T' THEN (d->>'createdAt')::timestamptz
       ELSE (r.created_at || '+00')::timestamptz END,
  CASE WHEN d->>'resolvedAt' ~ '^\d{4}-\d{2}-\d{2}T' THEN (d->>'resolvedAt')::timestamptz END
FROM records r, LATERAL (SELECT r.data::jsonb AS d) j
WHERE r.type = 'password-request' AND d->>'accountId' IN (SELECT id FROM accounts)
ON CONFLICT DO NOTHING;

INSERT INTO whatsapp_configs (account_id, iv, cipher, updated_at)
SELECT
  substr(r.id, length('whatsapp-config-') + 1),
  d->>'iv',
  d->>'cipher',
  (r.updated_at || '+00')::timestamptz
FROM records r, LATERAL (SELECT r.data::jsonb AS d) j
WHERE r.type = 'whatsapp-config'
  AND substr(r.id, length('whatsapp-config-') + 1) IN (SELECT id FROM accounts)
  AND d->>'iv' <> '' AND d->>'cipher' <> ''
ON CONFLICT DO NOTHING;

-- Old sessions store raw tokens and are not carried over: everyone signs in again once.
DELETE FROM records WHERE type IN ('account', 'session', 'password-request', 'whatsapp-config');
