-- Cliente opcional de uma venda rápida. Só acrescenta: o código anterior ignora a coluna.

ALTER TABLE cash_entries ADD COLUMN client_id text;

ALTER TABLE cash_entries ADD CONSTRAINT cash_entries_client_fkey
  FOREIGN KEY (account_id, client_id) REFERENCES clients (account_id, id)
  ON DELETE SET NULL (client_id);

CREATE INDEX cash_entries_account_client_idx ON cash_entries (account_id, client_id)
  WHERE client_id IS NOT NULL;
