CREATE TABLE order_photos (
  id text PRIMARY KEY,
  account_id text NOT NULL,
  order_id text NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 8388608),
  -- Photo bytes live in Postgres, not the filesystem: Netlify's Next.js runtime
  -- has no durable, shared disk across serverless invocations.
  bytes bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (account_id, order_id) REFERENCES orders (account_id, id) ON DELETE CASCADE
);

CREATE INDEX order_photos_account_order_created_idx
  ON order_photos (account_id, order_id, created_at);

REVOKE ALL ON TABLE order_photos FROM PUBLIC, reparosm_runtime;
GRANT SELECT, INSERT, DELETE ON TABLE order_photos TO reparosm_runtime;
ALTER TABLE order_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_photos FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON order_photos TO reparosm_runtime
  USING (account_id = NULLIF(current_setting('app.account_id', true), ''))
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), ''));
