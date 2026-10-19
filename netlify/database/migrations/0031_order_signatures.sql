-- Assinatura na tela: o cliente e a assistência assinam a OS no tablet ou no
-- celular, e a impressão já sai assinada.

-- Uma assinatura por papel por OS (assinar de novo substitui). Junto com a
-- imagem fica a prova: quem assinou e quando, quem colheu, IP, navegador e uma
-- cópia do que estava na tela com o SHA-256 dela.
CREATE TABLE order_signatures (
  account_id text NOT NULL,
  order_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('customer', 'shop')),
  image bytea NOT NULL CHECK (octet_length(image) BETWEEN 1 AND 262144),
  signer_name text NOT NULL CHECK (char_length(signer_name) BETWEEN 1 AND 120),
  signed_at timestamptz NOT NULL DEFAULT now(),
  collected_by text,
  ip text,
  user_agent text,
  signed_content jsonb NOT NULL CHECK (jsonb_typeof(signed_content) = 'object'),
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (account_id, order_id, role),
  CONSTRAINT order_signatures_order_fkey FOREIGN KEY (account_id, order_id)
    REFERENCES orders (account_id, id) ON DELETE CASCADE
);
REVOKE ALL PRIVILEGES ON TABLE order_signatures FROM PUBLIC, reparosm_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE order_signatures TO reparosm_runtime;
ALTER TABLE order_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_signatures FORCE ROW LEVEL SECURITY;
CREATE POLICY order_signatures_tenant ON order_signatures TO reparosm_runtime
  USING (account_id = NULLIF(current_setting('app.account_id', true), ''))
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id', true), ''));
