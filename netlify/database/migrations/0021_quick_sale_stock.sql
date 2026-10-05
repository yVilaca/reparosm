-- Vincula uma venda rápida opcionalmente ao produto que saiu do estoque.
ALTER TABLE cash_entries
  ADD COLUMN part_id text;

ALTER TABLE cash_entries
  ADD CONSTRAINT cash_entries_account_part_fkey
  FOREIGN KEY (account_id, part_id) REFERENCES parts (account_id, id) ON DELETE RESTRICT;

CREATE INDEX cash_entries_account_part_idx
  ON cash_entries (account_id, part_id)
  WHERE part_id IS NOT NULL;
