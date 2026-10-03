-- Produtos do estoque associados à OS. O snapshot mantém o histórico mesmo
-- quando nome ou preço do produto mudarem depois.
ALTER TABLE parts ADD CONSTRAINT parts_account_id_id_key UNIQUE (account_id, id);

CREATE TABLE order_items (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  order_id text NOT NULL,
  part_id text NOT NULL,
  name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(12, 2) NOT NULL DEFAULT 0,
  unit_cost numeric(12, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, order_id, part_id),
  CONSTRAINT order_items_account_order_fkey
    FOREIGN KEY (account_id, order_id) REFERENCES orders (account_id, id) ON DELETE CASCADE,
  CONSTRAINT order_items_account_part_fkey
    FOREIGN KEY (account_id, part_id) REFERENCES parts (account_id, id) ON DELETE RESTRICT
);
CREATE INDEX order_items_account_order_idx ON order_items (account_id, order_id);

REVOKE ALL PRIVILEGES ON TABLE order_items FROM PUBLIC, reparosm_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE order_items TO reparosm_runtime;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON order_items TO reparosm_runtime
  USING (account_id = NULLIF(current_setting('app.account_id', true), ''))
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), ''));
