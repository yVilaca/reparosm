-- "1 usuário em cada plano": quantas pessoas da loja podem estar conectadas ao
-- mesmo tempo. Cada pessoa com sessão válida ocupa uma vaga, em quantos
-- aparelhos estiver. O admin ajusta por loja para vender vagas extras.
ALTER TABLE accounts
  ADD COLUMN max_active_users integer NOT NULL DEFAULT 1
  CONSTRAINT accounts_max_active_users_positive CHECK (max_active_users >= 1);

GRANT SELECT (max_active_users) ON accounts TO reparosm_runtime;
