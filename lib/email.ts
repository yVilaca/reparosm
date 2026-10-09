import { createTransport } from 'nodemailer';
import { env } from '@/lib/env';

/**
 * Envio de e-mail por SMTP. Sem SMTP configurado (ou se o servidor recusar), o
 * envio volta `sent: false` e quem chamou oferece copiar o link: e-mail nunca é
 * o único caminho para entrar.
 */

export type Email = { to: string; subject: string; html: string; text: string };
export type EmailResult = { sent: true } | { sent: false; reason: 'not-configured' | 'failed' };

type Outbox = Email[];
const globalOutbox = globalThis as typeof globalThis & { __reparosmOutbox?: Outbox };

/** E-mails "enviados" com EMAIL_TRANSPORT=memory (testes). */
export function memoryOutbox(): Outbox {
  globalOutbox.__reparosmOutbox ??= [];
  return globalOutbox.__reparosmOutbox;
}

let transport: ReturnType<typeof createTransport> | undefined;
let transportKey = '';

function smtpTransport() {
  const smtp = env.smtp;
  if (!smtp || !env.emailFrom) return null;
  const key = JSON.stringify(smtp);
  if (!transport || key !== transportKey) {
    transport = createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      // Sem STARTTLS a senha e o link iriam abertos: exige TLS sempre.
      requireTLS: !smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.password || '' } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    transportKey = key;
  }
  return transport;
}

export const emailConfigured = () =>
  env.emailTransport === 'memory' || Boolean(env.smtp && env.emailFrom);

export async function sendEmail(email: Email): Promise<EmailResult> {
  if (env.emailTransport === 'memory') {
    memoryOutbox().push(email);
    return { sent: true };
  }
  const smtp = smtpTransport();
  if (!smtp) {
    if (process.env.NODE_ENV !== 'production')
      console.info(`[e-mail] SMTP não configurado; não enviado para ${email.to}: ${email.subject}`);
    return { sent: false, reason: 'not-configured' };
  }
  try {
    await smtp.sendMail({
      from: env.emailFrom,
      replyTo: env.emailReplyTo,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    return { sent: true };
  } catch (error) {
    // Nunca registrar o corpo: ele carrega o link de acesso.
    console.error(`[e-mail] Falha ao enviar para ${email.to}:`, (error as Error).message);
    return { sent: false, reason: 'failed' };
  }
}
