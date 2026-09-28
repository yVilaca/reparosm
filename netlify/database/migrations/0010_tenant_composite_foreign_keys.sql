DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM quotes q JOIN clients c ON c.id = q.client_id
    WHERE q.client_id IS NOT NULL AND q.account_id <> c.account_id
  ) THEN
    RAISE EXCEPTION '0010 blocked: quotes.client_id references another account';
  END IF;
  IF EXISTS (
    SELECT 1 FROM orders o JOIN clients c ON c.id = o.client_id
    WHERE o.client_id IS NOT NULL AND o.account_id <> c.account_id
  ) THEN
    RAISE EXCEPTION '0010 blocked: orders.client_id references another account';
  END IF;
  IF EXISTS (
    SELECT 1 FROM orders o JOIN quotes q ON q.id = o.quote_id
    WHERE o.quote_id IS NOT NULL AND o.account_id <> q.account_id
  ) THEN
    RAISE EXCEPTION '0010 blocked: orders.quote_id references another account';
  END IF;
  IF EXISTS (
    SELECT 1 FROM messages m JOIN orders o ON o.id = m.order_id
    WHERE m.order_id IS NOT NULL AND m.account_id <> o.account_id
  ) THEN
    RAISE EXCEPTION '0010 blocked: messages.order_id references another account';
  END IF;
END
$$;

ALTER TABLE clients ADD CONSTRAINT clients_account_id_id_key UNIQUE (account_id, id);
ALTER TABLE quotes ADD CONSTRAINT quotes_account_id_id_key UNIQUE (account_id, id);
ALTER TABLE orders ADD CONSTRAINT orders_account_id_id_key UNIQUE (account_id, id);

ALTER TABLE quotes DROP CONSTRAINT quotes_client_id_fkey;
ALTER TABLE orders DROP CONSTRAINT orders_client_id_fkey;
ALTER TABLE orders DROP CONSTRAINT orders_quote_id_fkey;
ALTER TABLE messages DROP CONSTRAINT messages_order_id_fkey;

ALTER TABLE quotes ADD CONSTRAINT quotes_account_client_fkey
  FOREIGN KEY (account_id, client_id) REFERENCES clients (account_id, id)
  ON DELETE SET NULL (client_id);
ALTER TABLE orders ADD CONSTRAINT orders_account_client_fkey
  FOREIGN KEY (account_id, client_id) REFERENCES clients (account_id, id)
  ON DELETE SET NULL (client_id);
ALTER TABLE orders ADD CONSTRAINT orders_account_quote_fkey
  FOREIGN KEY (account_id, quote_id) REFERENCES quotes (account_id, id)
  ON DELETE SET NULL (quote_id);
ALTER TABLE messages ADD CONSTRAINT messages_account_order_fkey
  FOREIGN KEY (account_id, order_id) REFERENCES orders (account_id, id)
  ON DELETE SET NULL (order_id);

CREATE INDEX quotes_account_client_idx ON quotes (account_id, client_id);
CREATE INDEX orders_account_client_idx ON orders (account_id, client_id);
CREATE INDEX orders_account_quote_idx ON orders (account_id, quote_id);
CREATE INDEX messages_account_order_idx ON messages (account_id, order_id);
