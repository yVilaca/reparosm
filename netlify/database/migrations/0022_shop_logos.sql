-- Logo binary is isolated from the editable shop profile and always scoped to one tenant.
CREATE TABLE shop_logos (
  account_id text PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  content_type text NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp')),
  bytes bytea NOT NULL,
  byte_length integer NOT NULL CHECK (byte_length BETWEEN 1 AND 1048576),
  CONSTRAINT shop_logos_bytes_length CHECK (octet_length(bytes) = byte_length),
  width integer NOT NULL CHECK (width BETWEEN 1 AND 2048),
  height integer NOT NULL CHECK (height BETWEEN 1 AND 2048),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL PRIVILEGES ON TABLE shop_logos FROM PUBLIC, reparosm_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE shop_logos TO reparosm_runtime;
ALTER TABLE shop_logos ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_logos FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON shop_logos TO reparosm_runtime
  USING (account_id = NULLIF(current_setting('app.account_id', true), ''))
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), ''));
CREATE POLICY public_store_read ON shop_logos FOR SELECT TO reparosm_runtime
  USING (account_id = NULLIF(current_setting('app.public_store_account_id', true), ''));
