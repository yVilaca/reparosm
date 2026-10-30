-- Linhas de uma venda rápida. A entrada no caixa continua sendo o cabeçalho financeiro.

CREATE TABLE quick_sale_items (
  account_id text NOT NULL,
  sale_id text NOT NULL,
  position smallint NOT NULL CHECK (position >= 0),
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 200),
  price numeric(12,2) NOT NULL CHECK (price > 0),
  discount numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  cost numeric(12,2) CHECK (cost IS NULL OR cost >= 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  part_id text,
  PRIMARY KEY (account_id, sale_id, position),
  CONSTRAINT quick_sale_items_sale_fkey FOREIGN KEY (account_id, sale_id)
    REFERENCES cash_entries (account_id, id) ON DELETE CASCADE,
  CONSTRAINT quick_sale_items_part_fkey FOREIGN KEY (account_id, part_id)
    REFERENCES parts (account_id, id) ON DELETE RESTRICT
);

CREATE INDEX quick_sale_items_sale_idx ON quick_sale_items (account_id, sale_id);

ALTER TABLE quick_sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE quick_sale_items FORCE ROW LEVEL SECURITY;
CREATE POLICY quick_sale_items_tenant ON quick_sale_items TO reparosm_runtime
  USING (account_id = NULLIF(current_setting('app.account_id', true), ''))
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), ''));
REVOKE ALL ON quick_sale_items FROM PUBLIC, reparosm_runtime;
GRANT SELECT, INSERT, DELETE ON quick_sale_items TO reparosm_runtime;
