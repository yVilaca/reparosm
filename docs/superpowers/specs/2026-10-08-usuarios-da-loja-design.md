# Usuários da loja

## Por que

Hoje uma conta é ao mesmo tempo a loja e o login (`accounts` guarda o tenant e a
senha). Isso causa três problemas:

1. **Um login por loja.** Dono e funcionário dividem a mesma senha; não dá para
   saber quem é quem nem tirar o acesso de quem saiu.
2. **Um login derruba o outro.** O login apaga todas as sessões da conta antes
   de criar a nova (`revokeSessionsForLogin` em `app/api/auth/route.ts`), então
   balcão e bancada não ficam logados ao mesmo tempo.
3. **Funções básicas faltando.** O lojista não troca a própria senha nem vê onde
   está logado; o painel do administrador só lista, suspende e exclui. Não edita
   plano, vencimento ou nome, não mostra último acesso, não busca e não destaca
   quem está vencido.

## Modelo

- **Loja** = `accounts` (continua sendo o tenant: todas as tabelas e políticas
  de RLS seguem por `account_id`; nada muda no resto do sistema).
- **Usuário** = nova tabela `users`: pertence a uma loja, tem usuário (único no
  sistema), nome, papel, situação e senha própria.
  - Papéis: **Dono** (`owner`) e **Funcionário** (`staff`).
  - Situação: ativo ou desativado.
- **Sessão** passa a apontar para o usuário (`user_id`) além da loja, e guarda
  aparelho (user agent), IP e última atividade.
- Migração: cada conta existente ganha um usuário Dono com o mesmo usuário e a
  mesma senha; as sessões abertas continuam valendo. A senha antiga sai de
  `accounts` (fica só em `users`).

## Regras

- **Sessões simultâneas.** Entrar não derruba ninguém, nem o próprio usuário em
  outro aparelho. Sessões expiram em 12 horas, como hoje.
- **Quem pode o quê.**

  | Ação                                           | Dono | Funcionário |
  | ---------------------------------------------- | ---- | ----------- |
  | Trabalho do dia (OS, vendas, estoque, caixa…)  | sim  | sim         |
  | Minha conta (nome, senha, aparelhos)           | sim  | sim         |
  | Equipe (cadastrar, redefinir senha, desativar) | sim  | não         |
  | Editar dados da assistência e logo             | sim  | não         |
  | Dados e exportação                             | sim  | não         |

  A loja sempre mantém pelo menos um Dono ativo.

- **Senha provisória.** Senha definida pelo dono (para funcionário) ou pelo
  administrador (para qualquer usuário) é provisória: no próximo acesso a pessoa
  cai em Minha conta para criar a sua. Redefinir a senha desconecta a pessoa.
- **Trocar a própria senha** pede a senha atual e desconecta os outros aparelhos
  do usuário.
- **Desativar um usuário** desconecta ele na hora; suspender ou cancelar a loja
  desconecta todos.
- **Esqueci minha senha.** O pedido de um funcionário aparece para o Dono em
  Equipe; o de um Dono aparece para o administrador em Lojas.

## Telas

- **Minha conta** (todos): nome, troca de senha e aparelhos conectados (este
  aparelho, outros, última atividade, "Sair dos outros aparelhos"). Fica no
  rodapé do menu, no nome do usuário.
- **Equipe** (Dono, em Gestão): lista com papel, situação, último acesso e
  aparelhos conectados; pedidos de senha no topo; "Adicionar pessoa"; ficha do
  usuário com editar, redefinir senha, desconectar e desativar.
- **Lojas** (administrador, substitui "Contas de lojistas"):
  - faixa de resumo: ativas, vencendo em 7 dias, vencidas, suspensas ou
    canceladas;
  - pedidos de senha no topo; filtros e busca;
  - lista com dono, número de usuários, plano, vencimento (vermelho vencido,
    âmbar perto) e último acesso;
  - ficha da loja: assinatura editável (nome, plano, vencimento), "Renovar"
    (soma o período do plano ao vencimento), suspender, reativar, cancelar,
    excluir, e os usuários da loja com redefinir senha, desativar e adicionar.

## Segurança

- `users` com RLS forçado. O runtime não lê `password_hash`: a senha só sai por
  uma função `SECURITY DEFINER` no contexto de login (usuário informado) ou da
  própria sessão (para conferir a senha atual).
- Leitura e escrita de usuários só no contexto da loja (`app.account_id`), do
  login do próprio usuário ou do administrador. Papel (dono/funcionário) é
  conferido no servidor em cada rota.
- Sessões: leitura pelo token, pelo próprio usuário no login, pela loja (Equipe)
  ou pelo administrador.

## Fora do escopo

- Registro de quem fez cada ação (autor da OS, do recebimento). É o próximo
  passo natural agora que existe usuário.
- Permissões mais finas que Dono e Funcionário.
