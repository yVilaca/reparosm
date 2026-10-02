-- O caixa passa a saber de qual OS veio cada recebimento. Segue o padrão
-- multi-tenant da 0010: FK composta, para que lançamento e OS não possam
-- pertencer a contas diferentes.
ALTER TABLE cash_entries ADD COLUMN order_id text;

ALTER TABLE cash_entries ADD CONSTRAINT cash_entries_account_order_fkey
  FOREIGN KEY (account_id, order_id) REFERENCES orders (account_id, id)
  ON DELETE SET NULL (order_id);

-- Despesa nunca pertence a uma OS.
ALTER TABLE cash_entries ADD CONSTRAINT cash_entries_order_income_only
  CHECK (kind = 'in' OR order_id IS NULL);

-- O pagamento acontece inteiro na retirada: uma OS tem no máximo um
-- recebimento. Garantia do banco, não do código — é o que resolve duas
-- confirmações simultâneas. Dispensa índice comum: o CHECK acima garante
-- que toda linha com order_id preenchido tem kind = 'in'.
CREATE UNIQUE INDEX cash_entries_order_income_idx
  ON cash_entries (account_id, order_id) WHERE kind = 'in' AND order_id IS NOT NULL;
