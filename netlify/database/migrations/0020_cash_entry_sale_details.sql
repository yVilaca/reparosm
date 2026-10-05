-- Venda rápida: custo do que foi vendido e desconto dado, para saber o lucro.
-- O valor da entrada continua sendo o que entrou no caixa (preço menos desconto).
ALTER TABLE cash_entries
  ADD COLUMN cost numeric(12, 2) CHECK (cost IS NULL OR cost >= 0),
  ADD COLUMN discount numeric(12, 2) CHECK (discount IS NULL OR discount >= 0);
