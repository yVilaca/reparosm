# ReparoSM

Sistema de gestão para assistências técnicas e lojas de celulares.

## Estado desta cópia

Código-fonte atual preparado para armazenamento privado no GitHub. Não inclui o histórico anterior, bancos de dados locais, sessões, credenciais ou dados de clientes. A versão publicada atualmente não foi alterada.

Esta versão usa **Next.js e Postgres** (qualquer provedor, via `DATABASE_URL`). A estrutura do banco é criada pelas migrações em `netlify/database/migrations`. A implantação só está concluída após configurar o administrador, importar os registros e validar a aplicação publicada. Não publique somente arquivos estáticos: autenticação, cadastros e WhatsApp dependem do servidor e do banco.

## Desenvolvimento

- Node.js 22.18 ou superior e pnpm (versão fixada em `packageManager`; `corepack enable` instala a correta).
- Instalação: `pnpm install --frozen-lockfile`.
- Desenvolvimento: `pnpm dev`.
- Verificações: `pnpm lint`, `pnpm typecheck` e `pnpm test` (também rodam no CI a cada push/PR).
- Build de produção: `pnpm build`.

### Banco local

Os testes de banco (`tests/*.test.mjs`) criam um banco descartável por arquivo em qualquer Postgres acessível por `DATABASE_URL`; sem essa variável eles são ignorados localmente (o CI sempre os executa com Postgres 17).

```bash
docker run -d --name reparosm-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:17
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
pnpm test          # testes, incluindo os de banco
pnpm db:migrate    # aplica as migrações no banco de DATABASE_URL (desenvolvimento)
```

Em produção as migrações de `netlify/database/migrations` precisam ser aplicadas manualmente contra o banco de produção (`pnpm db:migrate` com `DATABASE_URL` apontando para ele); não há aplicação automática no deploy.

- Hospedagem: Vercel (Next.js detectado automaticamente), banco Postgres gratuito via integração Neon.
- `DATABASE_URL` é obrigatória e deve ser configurada somente no servidor (variável de ambiente do projeto na hospedagem), nunca no repositório.

O ambiente local não contém os dados de produção. As configurações em `.env.example` são exemplos, não credenciais utilizáveis.

## Configuração segura

Configure as variáveis secretas somente no servidor/hospedagem:

- `ADMIN_PASSWORD_HASH`: hash PBKDF2 da senha administrativa, nunca a senha em texto.
- `WHATSAPP_CONFIG_KEY`: chave de criptografia das configurações do WhatsApp. A migração dos registros criptografados exige preservar a mesma chave; caso contrário será necessário reconectar os números.

Não envie arquivos `.env`, backups do banco, tokens nem chaves ao GitHub. Não configure segredos em variáveis expostas ao navegador.

## Antes de mudar a hospedagem

1. Criar o projeto na hospedagem importando este repositório privado e provisionar o banco Postgres (ex.: integração Neon no Vercel).
2. Aplicar as migrações (`pnpm db:migrate`) e, se houver dados existentes, migrá-los preservando os identificadores e a separação por lojista.
3. Configurar segredos fora do repositório (variáveis de ambiente do projeto na hospedagem).
4. Validar login, isolamento entre contas, OS, estoque, pagamentos, links públicos e WhatsApp.
5. Trocar o endereço somente após a validação, mantendo a versão atual disponível.
