const read = (name: string) => process.env[name]?.trim() || undefined;

export const env = {
  get databaseUrl() {
    // Every query runs SET LOCAL ROLE for RLS tenant isolation (see lib/db.ts), which
    // transaction-mode pgbouncer-style poolers (e.g. a pooled Neon/Vercel Postgres
    // DATABASE_URL) reject with "permission denied to set role". Prefer the direct,
    // unpooled connection whenever one is available.
    return read('DATABASE_URL_UNPOOLED') || read('DATABASE_URL');
  },
  get siteUrl() {
    const value = read('URL') || 'http://localhost:3000';
    try {
      return new URL(value).toString();
    } catch {
      throw new Error(`A variável URL precisa conter uma URL válida: ${value}`);
    }
  },
  /**
   * Endereço público do sistema, usado nos links enviados por e-mail. Nunca vem
   * da requisição (o Host pode ser forjado): APP_URL, depois URL (Netlify), depois
   * o domínio de produção da Vercel.
   */
  get appUrl() {
    const vercel = read('VERCEL_PROJECT_PRODUCTION_URL');
    const value =
      read('APP_URL') || read('URL') || (vercel && `https://${vercel}`) || 'http://localhost:3000';
    try {
      return new URL(value).origin;
    } catch {
      throw new Error(`A variável APP_URL precisa conter uma URL válida: ${value}`);
    }
  },
  get adminPasswordHash() {
    return read('ADMIN_PASSWORD_HASH');
  },
  /** SMTP para os e-mails de acesso. Sem SMTP_HOST, os links são copiados à mão. */
  get smtp() {
    const host = read('SMTP_HOST');
    if (!host) return null;
    const port = Number(read('SMTP_PORT') || 587);
    return {
      host,
      port,
      // 465 é TLS direto; 587 e 2525 começam sem TLS e sobem com STARTTLS.
      secure: read('SMTP_SECURE') ? read('SMTP_SECURE') === 'true' : port === 465,
      user: read('SMTP_USER'),
      password: read('SMTP_PASSWORD'),
    };
  },
  /** Remetente dos e-mails, ex.: "ReparoSM <nao-responda@seudominio.com.br>". */
  get emailFrom() {
    return read('EMAIL_FROM');
  },
  get emailReplyTo() {
    return read('EMAIL_REPLY_TO');
  },
  /** "memory": os testes guardam os e-mails em vez de enviar. */
  get emailTransport() {
    return read('EMAIL_TRANSPORT');
  },
  /** Chave que a integração de pagamento usa para criar lojas depois da compra. */
  get provisioningToken() {
    return read('PROVISIONING_TOKEN');
  },
  get whatsappAccessToken() {
    return read('WHATSAPP_ACCESS_TOKEN');
  },
  get whatsappPhoneNumberId() {
    return read('WHATSAPP_PHONE_NUMBER_ID');
  },
  get whatsappWabaId() {
    return read('WHATSAPP_WABA_ID');
  },
  get whatsappOrderTemplate() {
    return read('WHATSAPP_ORDER_TEMPLATE') || '';
  },
  get whatsappStatusTemplate() {
    return read('WHATSAPP_STATUS_TEMPLATE') || '';
  },
  get whatsappTemplateLanguage() {
    return read('WHATSAPP_TEMPLATE_LANGUAGE') || 'pt_BR';
  },
  get whatsappGraphVersion() {
    return read('WHATSAPP_GRAPH_VERSION') || 'v25.0';
  },
  get whatsappConfigKey() {
    return read('WHATSAPP_CONFIG_KEY');
  },
};

export function requiredEnv(name: string, value: string | undefined, pattern?: RegExp) {
  if (!value || (pattern && !pattern.test(value)))
    throw new Error(`A variável ${name} não está configurada ou tem formato inválido.`);
  return value;
}

export function validateEnv() {
  requiredEnv('DATABASE_URL', env.databaseUrl, /^postgres(?:ql)?:\/\//i);
  requiredEnv('URL', env.siteUrl);
  requiredEnv('ADMIN_PASSWORD_HASH', env.adminPasswordHash, /^pbkdf2\$/);
  if (env.whatsappConfigKey)
    requiredEnv('WHATSAPP_CONFIG_KEY', env.whatsappConfigKey, /^[a-f0-9]{64}$/i);
  requiredEnv('APP_URL', env.appUrl);
  if (env.smtp) {
    requiredEnv('EMAIL_FROM', env.emailFrom, /@/);
    if (!Number.isInteger(env.smtp.port) || env.smtp.port < 1)
      throw new Error('A variável SMTP_PORT precisa ser um número de porta.');
  }
  if (env.provisioningToken && env.provisioningToken.length < 32)
    throw new Error('A variável PROVISIONING_TOKEN precisa ter pelo menos 32 caracteres.');
  return env;
}
