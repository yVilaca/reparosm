-- Contração da 0026: a senha mora só em users. Sai o que servia à versão
-- anterior do app durante a troca (senha e troca obrigatória na conta da loja,
-- a função que lia essa senha e a trigger que punha sessões sem usuário no Dono).
-- A versão publicada com a 0026 já não usa nada disto.

DROP TRIGGER sessions_default_user ON sessions;
DROP FUNCTION public.sessions_default_user();

DROP POLICY accounts_password_lookup ON accounts;
DROP FUNCTION public.account_password_hash(text);

ALTER TABLE accounts
  DROP COLUMN password_hash,
  DROP COLUMN must_change_password,
  DROP COLUMN password_reset_at;
