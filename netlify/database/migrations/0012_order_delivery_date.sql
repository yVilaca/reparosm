-- Keep the actual delivery date separate from the order's workflow stage.
-- Existing delivered orders remain unknown instead of receiving an invented date.
ALTER TABLE orders ADD COLUMN delivered_at date;
