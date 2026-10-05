-- Quantidade vendida para que o estoque e o desfazer sejam simétricos.
ALTER TABLE cash_entries
  ADD COLUMN quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0);
