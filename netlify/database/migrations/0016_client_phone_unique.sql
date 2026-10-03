-- Telefones equivalentes (com ou sem máscara) não podem duplicar um cliente
-- dentro da mesma loja. Só conta telefone que identifica alguém: vazio, curto
-- (< 10 dígitos) ou placeholder com todos os dígitos iguais (000…, digitado
-- quando o campo era obrigatório) continuam livres. Mesmo critério de
-- identifyingPhoneDigits() em lib/format.ts — os dois precisam andar juntos.
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
      AND regexp_replace(phone, '\D', '', 'g') !~ '^(\d)\1*$'
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
  WHERE length(regexp_replace(phone, '\D', '', 'g')) >= 10
    AND regexp_replace(phone, '\D', '', 'g') !~ '^(\d)\1*$';
