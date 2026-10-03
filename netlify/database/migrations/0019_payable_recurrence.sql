-- Reformulação de contas a pagar: repetição, parcelas, código de pagamento,
-- pagamento com valor e data reais e vínculo íntegro com a saída do caixa.
-- Repetição: fica uma ocorrência em aberto; pagá-la gera a próxima.
ALTER TABLE payables
  ADD COLUMN series_id text,
  ADD COLUMN generated_from text,
  ADD COLUMN recurrence text CHECK (recurrence IN ('weekly', 'monthly', 'yearly')),
  ADD COLUMN recurrence_day integer,
  ADD COLUMN installment_number integer,
  ADD COLUMN installment_count integer,
  ADD COLUMN payment_code text,
  ADD COLUMN paid_amount numeric(12, 2),
  ADD COLUMN paid_on date;

-- Contas pagas antes desta migração (nenhuma em produção) ganham os campos novos.
UPDATE payables
SET paid_on = (paid_at AT TIME ZONE 'America/Sao_Paulo')::date, paid_amount = amount
WHERE status = 'paid';

ALTER TABLE payables ADD CONSTRAINT payables_recurrence_valid CHECK (
  (recurrence IS NULL AND recurrence_day IS NULL) OR
  (recurrence IS NOT NULL AND source <> 'purchase' AND due_date IS NOT NULL
    AND recurrence_day BETWEEN 1 AND 31 AND installment_count IS NULL)
);
ALTER TABLE payables ADD CONSTRAINT payables_installment_valid CHECK (
  (installment_count IS NULL AND installment_number IS NULL) OR
  (installment_count BETWEEN 2 AND 48 AND installment_number BETWEEN 1 AND installment_count
    AND series_id IS NOT NULL)
);
-- Paga = tem data, valor e saída no caixa; em aberto = não tem nenhum deles.
ALTER TABLE payables ADD CONSTRAINT payables_payment_consistent CHECK (
  (status = 'pending' AND paid_at IS NULL AND paid_on IS NULL AND paid_amount IS NULL
    AND cash_entry_id IS NULL) OR
  (status = 'paid' AND paid_at IS NOT NULL AND paid_on IS NOT NULL AND paid_amount > 0
    AND cash_entry_id IS NOT NULL)
);

ALTER TABLE payables ADD CONSTRAINT payables_account_id_id_key UNIQUE (account_id, id);
ALTER TABLE cash_entries ADD CONSTRAINT cash_entries_account_id_id_key UNIQUE (account_id, id);

-- A saída de uma conta paga não pode sumir do caixa: desfaz-se o pagamento.
ALTER TABLE payables ADD CONSTRAINT payables_account_cash_entry_fkey
  FOREIGN KEY (account_id, cash_entry_id) REFERENCES cash_entries (account_id, id)
  ON DELETE RESTRICT;
ALTER TABLE payables ADD CONSTRAINT payables_account_generated_from_fkey
  FOREIGN KEY (account_id, generated_from) REFERENCES payables (account_id, id)
  ON DELETE SET NULL (generated_from);

-- No máximo uma próxima ocorrência por pagamento, mesmo com cliques simultâneos.
CREATE UNIQUE INDEX payables_account_generated_from_idx
  ON payables (account_id, generated_from) WHERE generated_from IS NOT NULL;
CREATE INDEX payables_account_series_idx
  ON payables (account_id, series_id) WHERE series_id IS NOT NULL;
