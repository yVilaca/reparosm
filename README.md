# ReparoSM

Sistema de gestão para assistências técnicas e lojas de celulares.

## Estado desta cópia

Código-fonte atual preparado para armazenamento privado no GitHub. Não inclui o histórico anterior, bancos de dados locais, sessões, credenciais ou dados de clientes. A versão publicada atualmente não foi alterada.

Esta versão usa **Next.js e Netlify Database (Postgres)**. A estrutura do banco é criada pelas migrações em `netlify/database/migrations`. A implantação só está concluída após configurar o administrador, importar os registros e validar a aplicação publicada. Não publique somente arquivos estáticos: autenticação, cadastros e WhatsApp dependem do servidor e do banco.

## Desenvolvimento

- Node.js 22.13 ou superior.
- Instalação: `npm ci`.
- Desenvolvimento: `npm run dev`.
- Build para Netlify: `npm run build`.
- Configuração de publicação: `netlify.toml`, saída `.next`.
- O banco pode ser substituído por outro Postgres com `DATABASE_URL`; mantenha esta variável somente no servidor.

O ambiente local não contém os dados de produção. As configurações em `.env.example` são exemplos, não credenciais utilizáveis.

## Configuração segura

Configure as variáveis secretas somente no servidor/hospedagem:

- `ADMIN_PASSWORD_HASH`: hash PBKDF2 da senha administrativa, nunca a senha em texto.
- `WHATSAPP_CONFIG_KEY`: chave de criptografia das configurações do WhatsApp. A migração dos registros criptografados exige preservar a mesma chave; caso contrário será necessário reconectar os números.

Não envie arquivos `.env`, backups do banco, tokens nem chaves ao GitHub. Não configure segredos em variáveis expostas ao navegador.

## Antes de mudar a hospedagem

1. Criar o projeto na Netlify importando este repositório privado e confirmar o provisionamento do banco.
2. Migrar registros preservando os identificadores e a separação por lojista.
3. Configurar segredos fora do repositório.
4. Validar login, isolamento entre contas, OS, estoque, pagamentos, links públicos e WhatsApp.
5. Trocar o endereço somente após a validação, mantendo a versão atual disponível.
