-- Contas a pagar. Uma conta paga gera exatamente uma saída no caixa.
CREATE TABLE payables (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  description text NOT NULL,
  supplier text,
  category text,
  source text NOT NULL DEFAULT 'other' CHECK (source IN ('purchase', 'fixed', 'other')),
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  due_date date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  paid_at timestamptz,
  method text,
  notes text,
  cash_entry_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payables_account_status_due_idx ON payables (account_id, status, due_date);
CREATE UNIQUE INDEX payables_account_cash_entry_idx
  ON payables (account_id, cash_entry_id) WHERE cash_entry_id IS NOT NULL;

REVOKE ALL PRIVILEGES ON TABLE payables FROM PUBLIC, reparosm_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE payables TO reparosm_runtime;
ALTER TABLE payables ENABLE ROW LEVEL SECURITY;
ALTER TABLE payables FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payables TO reparosm_runtime
  USING (account_id = NULLIF(current_setting('app.account_id', true), ''))
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), ''));
