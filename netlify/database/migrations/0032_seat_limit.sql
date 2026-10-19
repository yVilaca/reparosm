-- "1 usuário em cada plano": quantos logins da loja podem estar ativos ao mesmo
-- tempo. Cada sessão válida ocupa uma vaga (1 login = 1 vaga, em qualquer
-- aparelho). O admin ajusta por loja para vender vagas extras.
ALTER TABLE accounts
  ADD COLUMN max_active_users integer NOT NULL DEFAULT 1
  CONSTRAINT accounts_max_active_users_positive CHECK (max_active_users >= 1);

GRANT SELECT (max_active_users) ON accounts TO reparosm_runtime;
