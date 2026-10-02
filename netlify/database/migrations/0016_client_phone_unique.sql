-- Telefones equivalentes (com ou sem máscara) não podem duplicar um cliente
-- dentro da mesma loja. Telefones vazios ou curtos continuam permitidos porque
-- não são identificadores confiáveis.
DO $$
DECLARE
  conflicts text;
BEGIN
  SELECT string_agg(account_id || ':' || digits, ', ')
    INTO conflicts
  FROM (
    SELECT account_id, regexp_replace(phone, '\D', '', 'g') AS digits
    FROM clients
    WHERE length(regexp_replace(phone, '\D', '', 'g')) >= 10
    GROUP BY account_id, regexp_replace(phone, '\D', '', 'g')
    HAVING count(*) > 1
    LIMIT 20
  ) duplicates;

  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION '0016 bloqueada: existem telefones de clientes duplicados (%). Resolva os cadastros antes de aplicar esta migração.', conflicts;
  END IF;
END $$;

CREATE UNIQUE INDEX clients_account_phone_digits_unique
  ON clients (account_id, (regexp_replace(phone, '\D', '', 'g')))
  WHERE length(regexp_replace(phone, '\D', '', 'g')) >= 10;
