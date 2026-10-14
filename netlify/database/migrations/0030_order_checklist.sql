-- Checklist de entrada: o estado do aparelho antes do conserto.

-- Um checklist por OS. `data` guarda a resposta de "liga?", os testes, as
-- avarias, observações, dados do aparelho e quando foi concluído (formato em
-- lib/order-checklist.ts, validado na aplicação).
CREATE TABLE order_checklists (
  account_id text NOT NULL,
  order_id text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data) = 'object'),
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, order_id),
  CONSTRAINT order_checklists_order_fkey FOREIGN KEY (account_id, order_id)
    REFERENCES orders (account_id, id) ON DELETE CASCADE
);
REVOKE ALL PRIVILEGES ON TABLE order_checklists FROM PUBLIC, reparosm_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE order_checklists TO reparosm_runtime;
ALTER TABLE order_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_checklists FORCE ROW LEVEL SECURITY;
CREATE POLICY order_checklists_tenant ON order_checklists TO reparosm_runtime
  USING (account_id = NULLIF(current_setting('app.account_id', true), ''))
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), ''));

-- Links do teste pelo próprio aparelho. Só o hash (SHA-256) do token fica
-- guardado; o token vai no QR code, depois do "#". Vale 2 horas e um por OS.
CREATE TABLE order_device_tests (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  account_id text NOT NULL,
  order_id text NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  opened_at timestamptz,
  last_seen_at timestamptz,
  CONSTRAINT order_device_tests_order_fkey FOREIGN KEY (account_id, order_id)
    REFERENCES orders (account_id, id) ON DELETE CASCADE
);
CREATE INDEX order_device_tests_order_idx ON order_device_tests (account_id, order_id, created_at);
REVOKE ALL PRIVILEGES ON TABLE order_device_tests FROM PUBLIC, reparosm_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE order_device_tests TO reparosm_runtime;
ALTER TABLE order_device_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_device_tests FORCE ROW LEVEL SECURITY;

-- Contextos: a loja dona (app.account_id) e o próprio link aberto no aparelho
-- (app.device_test_hash), que enxerga só a linha daquele hash.
CREATE POLICY order_device_tests_scoped ON order_device_tests TO reparosm_runtime
  USING (
    account_id = NULLIF(current_setting('app.account_id', true), '')
    OR token_hash = NULLIF(current_setting('app.device_test_hash', true), '')
  )
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), ''));
