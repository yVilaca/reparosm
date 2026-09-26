const read = (name: string) => process.env[name]?.trim() || undefined;

export const env = {
  get databaseUrl() {
    return read('DATABASE_URL');
  },
  get siteUrl() {
    const value = read('URL') || 'http://localhost:3000';
    try {
      return new URL(value).toString();
    } catch {
      throw new Error(`A variável URL precisa conter uma URL válida: ${value}`);
    }
  },
  get adminPasswordHash() {
    return read('ADMIN_PASSWORD_HASH');
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
  requiredEnv(
    'DATABASE_URL ou NETLIFY_DB_URL',
    env.databaseUrl || read('NETLIFY_DB_URL'),
    /^postgres(?:ql)?:\/\//i,
  );
  requiredEnv('URL', env.siteUrl);
  requiredEnv('ADMIN_PASSWORD_HASH', env.adminPasswordHash, /^pbkdf2\$/);
  if (env.whatsappConfigKey)
    requiredEnv('WHATSAPP_CONFIG_KEY', env.whatsappConfigKey, /^[a-f0-9]{64}$/i);
  return env;
}
