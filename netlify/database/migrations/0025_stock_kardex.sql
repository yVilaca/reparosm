ALTER TABLE parts DROP CONSTRAINT parts_stock_check;

CREATE TABLE stock_movements (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  account_id text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- Snapshot: deleting a product must not erase its inventory history.
  part_id text NOT NULL,
  name text NOT NULL,
  sku text,
  source text NOT NULL CHECK (source IN ('opening','adjustment','quick-sale','sale-reversal','order','order-return')),
  reference text,
  reference_id text,
  quantity integer NOT NULL CHECK (quantity <> 0),
  stock_before integer NOT NULL,
  stock_after integer NOT NULL,
  unit_cost numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_movements_account_date_idx ON stock_movements(account_id,created_at DESC,id DESC);
CREATE INDEX stock_movements_account_part_idx ON stock_movements(account_id,part_id,created_at DESC,id DESC);
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements FORCE ROW LEVEL SECURITY;
CREATE POLICY stock_movements_tenant ON stock_movements
  USING (account_id = NULLIF(current_setting('app.account_id',true),''))
  WITH CHECK (account_id = NULLIF(current_setting('app.account_id',true),''));
REVOKE ALL ON stock_movements FROM PUBLIC, reparosm_runtime;
GRANT SELECT, INSERT ON stock_movements TO reparosm_runtime;

-- Opening balances are the current stock, not reconstructed historical sales.
INSERT INTO stock_movements(account_id,part_id,name,sku,source,quantity,stock_before,stock_after,unit_cost)
SELECT account_id,id,name,sku,'opening',stock,0,stock,cost FROM parts WHERE stock <> 0;

CREATE FUNCTION record_part_stock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  previous_stock integer := 0;
  movement_source text;
BEGIN
  IF TG_OP = 'UPDATE' THEN previous_stock := OLD.stock; END IF;
  IF NEW.stock < 0 AND NEW.stock < previous_stock AND NOT EXISTS (
    SELECT 1 FROM shops WHERE account_id = NEW.account_id
      AND profile->'allowNegativeStock' = 'true'::jsonb
  ) THEN
    RAISE EXCEPTION 'Estoque negativo não permitido. Habilite a preferência da assistência.' USING ERRCODE = '23514';
  END IF;
  IF NEW.stock <> previous_stock THEN
    movement_source := COALESCE(NULLIF(current_setting('app.stock_source',true),''),
      CASE WHEN TG_OP = 'INSERT' THEN 'opening' ELSE 'adjustment' END);
    INSERT INTO stock_movements(account_id,part_id,name,sku,source,reference,reference_id,quantity,stock_before,stock_after,unit_cost)
    VALUES(NEW.account_id,NEW.id,NEW.name,NEW.sku,movement_source,
      NULLIF(current_setting('app.stock_reference',true),''),
      NULLIF(current_setting('app.stock_reference_id',true),''),
      NEW.stock-previous_stock,previous_stock,NEW.stock,NEW.cost);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER parts_stock_kardex AFTER INSERT OR UPDATE OF stock ON parts
  FOR EACH ROW EXECUTE FUNCTION record_part_stock();
