-- Quantidade efetivamente baixada pela OS: permite estornar sem criar estoque.
-- Itens anteriores a esta integração não tiveram baixa automática.
ALTER TABLE order_items
  ADD COLUMN stock_quantity integer NOT NULL DEFAULT 0
  CHECK (stock_quantity >= 0 AND stock_quantity <= quantity);
