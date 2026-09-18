# ReparoSM

Sistema de gestão para assistências técnicas e lojas de celulares.

## Estado desta cópia

Código-fonte atual preparado para armazenamento privado no GitHub. Não inclui o histórico anterior, bancos de dados locais, sessões, credenciais ou dados de clientes. A versão publicada atualmente não foi alterada.

**A migração para Netlify ainda não está concluída.** O projeto usa Vinext e Cloudflare Workers com banco D1. Não publique somente os arquivos estáticos: autenticação, cadastros e WhatsApp dependem do servidor e do banco.

## Desenvolvimento

- Node.js 22.13 ou superior.
- Instalação: `npm ci`.
- Desenvolvimento: `npm run dev`.
- Build atual (Cloudflare): `npm run build`.

O ambiente local não contém os dados de produção. As configurações em `.env.example` são exemplos, não credenciais utilizáveis.

## Configuração segura

Configure as variáveis secretas somente no servidor/hospedagem:

- `ADMIN_PASSWORD_HASH`: hash PBKDF2 da senha administrativa, nunca a senha em texto.
- `WHATSAPP_CONFIG_KEY`: chave de criptografia das configurações do WhatsApp. A migração dos registros criptografados exige preservar a mesma chave; caso contrário será necessário reconectar os números.

Não envie arquivos `.env`, backups do banco, tokens nem chaves ao GitHub. Não configure segredos em variáveis expostas ao navegador.

## Antes de mudar a hospedagem

1. Adaptar a execução do servidor e o acesso ao banco ao novo provedor.
2. Migrar registros preservando os identificadores e a separação por lojista.
3. Configurar segredos fora do repositório.
4. Validar login, isolamento entre contas, OS, estoque, pagamentos, links públicos e WhatsApp.
5. Trocar o endereço somente após a validação, mantendo a versão atual disponível.
