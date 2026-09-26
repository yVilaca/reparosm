-- orders.code used to be derived from the clock and could repeat within an
-- account (see docs/plans/2026-09-23-esquema-relacional.md). From now on the
-- app assigns it from a per-account counter; this migration backs that with a
-- table and makes the existing column enforce what was always intended.

CREATE TABLE order_code_counters (
  account_id text PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  next_seq integer NOT NULL DEFAULT 1
);

-- Disambiguate any code that already repeats within an account (oldest order
-- keeps its code; later ones get a suffix) so the UNIQUE constraint below can
-- be added even against data written before this migration.
WITH duplicates AS (
  SELECT id, row_number() OVER (PARTITION BY account_id, code ORDER BY created_at, id) AS rn
  FROM orders
)
UPDATE orders SET code = orders.code || '-dup' || duplicates.rn
FROM duplicates
WHERE orders.id = duplicates.id AND duplicates.rn > 1;

ALTER TABLE orders ADD CONSTRAINT orders_account_id_code_key UNIQUE (account_id, code);
