-- Acompanhamento do serviço: o cliente recebe um link só de leitura da OS.

-- Histórico da OS: cada mudança de etapa ou de status, com data e hora. Um
-- gatilho grava, então vale para qualquer caminho (ficha, Mesa, aprovação de
-- orçamento). OS antigas não ganham datas inventadas.
CREATE TABLE order_events (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  account_id text NOT NULL,
  order_id text NOT NULL,
  stage text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_events_order_fkey FOREIGN KEY (account_id, order_id)
    REFERENCES orders (account_id, id) ON DELETE CASCADE
);
CREATE INDEX order_events_order_idx ON order_events (account_id, order_id, created_at);
REVOKE ALL PRIVILEGES ON TABLE order_events FROM PUBLIC, reparosm_runtime;
GRANT SELECT, INSERT ON TABLE order_events TO reparosm_runtime;
ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_events FORCE ROW LEVEL SECURITY;
CREATE POLICY order_events_tenant ON order_events TO reparosm_runtime
  USING (account_id = NULLIF(current_setting('app.account_id', true), ''))
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), ''));

CREATE FUNCTION record_order_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.stage IS DISTINCT FROM OLD.stage
     OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO order_events (account_id, order_id, stage, status)
    VALUES (NEW.account_id, NEW.id, NEW.stage, NEW.status);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orders_record_event AFTER INSERT OR UPDATE OF stage, status ON orders
  FOR EACH ROW EXECUTE FUNCTION record_order_event();

-- Links de acompanhamento. Só o hash (SHA-256) do token fica guardado; o token
-- vai no link, depois do "#", e não chega ao servidor na abertura da página.
-- Cada envio cria um link; os anteriores continuam valendo até vencer ou a loja
-- desativar. `views` e `last_viewed_at` mostram à loja que o cliente abriu.
CREATE TABLE order_tracking_links (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  account_id text NOT NULL,
  order_id text NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_viewed_at timestamptz,
  views integer NOT NULL DEFAULT 0 CHECK (views >= 0),
  CONSTRAINT order_tracking_links_order_fkey FOREIGN KEY (account_id, order_id)
    REFERENCES orders (account_id, id) ON DELETE CASCADE
);
CREATE INDEX order_tracking_links_order_idx
  ON order_tracking_links (account_id, order_id, created_at);
REVOKE ALL PRIVILEGES ON TABLE order_tracking_links FROM PUBLIC, reparosm_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE order_tracking_links TO reparosm_runtime;
ALTER TABLE order_tracking_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_tracking_links FORCE ROW LEVEL SECURITY;

-- Contextos: a loja dona (app.account_id) e o próprio link aberto pelo cliente
-- (app.tracking_hash), que enxerga só a linha daquele hash.
CREATE POLICY order_tracking_links_scoped ON order_tracking_links TO reparosm_runtime
  USING (
    account_id = NULLIF(current_setting('app.account_id', true), '')
    OR token_hash = NULLIF(current_setting('app.tracking_hash', true), '')
  )
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), ''));
