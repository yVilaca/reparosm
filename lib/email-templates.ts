import type { Email } from '@/lib/email';
import { env } from '@/lib/env';
import { roleLabel } from '@/lib/user-labels';
import type { UserRole } from '@/lib/types';

/**
 * E-mails de acesso do ReparoSM. HTML de e-mail (tabelas e estilo inline, que
 * Gmail, Outlook e celulares entendem) mais a versão em texto. Tudo que vem do
 * cadastro é escapado: nome de loja ou de pessoa nunca vira HTML.
 */

const ink = '#1b1636';
const violet = '#6c4cf1';
const canvas = '#f4f4f8';
const muted = '#6b6783';
const hairline = '#e5e3ee';
const font = "'Red Hat Text', 'Segoe UI', Helvetica, Arial, sans-serif";
const display = "'Red Hat Display', 'Segoe UI', Helvetica, Arial, sans-serif";

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

type Layout = {
  to: string;
  subject: string;
  /** Linha que aparece ao lado do assunto na caixa de entrada. */
  preheader: string;
  heading: string;
  paragraphs: string[];
  /** Loja e usuário, para a pessoa saber onde e com que usuário entra. */
  details: [string, string][];
  action?: { label: string; url: string; validity: string };
  footer: string;
};

function render(layout: Layout): Email {
  const e = escapeHtml;
  const paragraphs = layout.paragraphs
    .map(
      (text) => `<p style="margin:0 0 16px;font:400 15px/1.6 ${font};color:${ink};">${e(text)}</p>`,
    )
    .join('');
  const details = layout.details
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 0;font:400 13px/1.4 ${font};color:${muted};width:130px;">${e(label)}</td>` +
        `<td style="padding:6px 0;font:600 14px/1.4 ${font};color:${ink};">${e(value)}</td></tr>`,
    )
    .join('');
  const action = layout.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;"><tr>
<td bgcolor="${violet}" style="border-radius:10px;">
<a href="${e(layout.action.url)}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 26px;font:700 16px/1 ${font};color:#ffffff;text-decoration:none;border-radius:10px;">${e(layout.action.label)}</a>
</td></tr></table>
<p style="margin:0 0 20px;font:400 13px/1.5 ${font};color:${muted};">${e(layout.action.validity)} Se o botão não abrir, copie este endereço no navegador:<br>
<a href="${e(layout.action.url)}" style="color:${violet};word-break:break-all;">${e(layout.action.url)}</a></p>`
    : '';
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${e(layout.subject)}</title></head>
<body style="margin:0;padding:0;background:${canvas};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${e(layout.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${canvas};"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="background:${ink};border-radius:14px 14px 0 0;padding:22px 32px;">
<img src="${env.appUrl}/brand/reparosm-logo-dark.png" width="150" height="30" alt="ReparoSM" style="display:block;border:0;width:150px;height:auto;font:700 20px ${display};color:#ffffff;">
</td></tr>
<tr><td style="background:#ffffff;border-radius:0 0 14px 14px;padding:32px;">
<h1 style="margin:0 0 16px;font:700 22px/1.3 ${display};color:${ink};">${e(layout.heading)}</h1>
${paragraphs}
${details ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:4px 0 8px;border-top:1px solid ${hairline};border-bottom:1px solid ${hairline};">${details}</table>` : ''}
${action}
<p style="margin:0;font:400 13px/1.5 ${font};color:${muted};">${e(layout.footer)}</p>
</td></tr>
<tr><td style="padding:16px 32px;text-align:center;font:400 12px/1.5 ${font};color:${muted};">ReparoSM, gestão para assistências técnicas de celular.</td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    layout.heading,
    '',
    ...layout.paragraphs.flatMap((paragraph) => [paragraph, '']),
    ...layout.details.map(([label, value]) => `${label}: ${value}`),
    ...(layout.action
      ? ['', `${layout.action.label}: ${layout.action.url}`, layout.action.validity]
      : []),
    '',
    layout.footer,
    '',
    'ReparoSM',
  ].join('\n');
  return { to: layout.to, subject: layout.subject, html, text };
}

type Person = { to: string; name: string; username: string; storeName: string };

/** Loja nova (compra ou administrador): o dono cria a senha e entra. */
export const newStoreEmail = (person: Person & { url: string; validity: string }) =>
  render({
    to: person.to,
    subject: `Sua loja ${person.storeName} está pronta no ReparoSM`,
    preheader: 'Crie sua senha para entrar e começar a usar.',
    heading: `Boas-vindas, ${firstName(person.name)}`,
    paragraphs: [
      `Sua loja ${person.storeName} já está pronta no ReparoSM. Crie sua senha para entrar e começar a registrar as ordens de serviço.`,
      'Depois, em Equipe, você cadastra quem trabalha com você: cada pessoa entra com o próprio usuário.',
    ],
    details: [
      ['Loja', person.storeName],
      ['Seu usuário', person.username],
    ],
    action: { label: 'Criar minha senha e entrar', url: person.url, validity: person.validity },
    footer: 'Não esperava este e-mail? Pode ignorá-lo: sem criar a senha, ninguém entra.',
  });

/** Alguém foi adicionado a uma loja que já existe. */
export const teamInviteEmail = (
  person: Person & { role: UserRole; url: string; validity: string },
) =>
  render({
    to: person.to,
    subject: `Você foi adicionado à equipe da loja ${person.storeName}`,
    preheader: 'Crie sua senha para entrar no ReparoSM.',
    heading: `Olá, ${firstName(person.name)}`,
    paragraphs: [
      `Você agora faz parte da equipe da loja ${person.storeName} no ReparoSM, como ${roleLabel(person.role)}. Crie sua senha para entrar.`,
    ],
    details: [
      ['Loja', person.storeName],
      ['Seu usuário', person.username],
    ],
    action: { label: 'Criar minha senha e entrar', url: person.url, validity: person.validity },
    footer: 'Não conhece esta loja? Pode ignorar este e-mail: sem criar a senha, ninguém entra.',
  });

/** "Esqueci minha senha" ou nova senha pedida pelo dono ou pelo suporte. */
export const resetEmail = (person: Person & { url: string; validity: string }) =>
  render({
    to: person.to,
    subject: 'Crie uma nova senha no ReparoSM',
    preheader: 'O link vale por pouco tempo e só uma vez.',
    heading: 'Crie uma nova senha',
    paragraphs: [
      `Recebemos um pedido para trocar a senha do seu acesso à loja ${person.storeName}. Ao criar a nova senha, os outros aparelhos conectados saem.`,
    ],
    details: [
      ['Loja', person.storeName],
      ['Seu usuário', person.username],
    ],
    action: { label: 'Criar nova senha', url: person.url, validity: person.validity },
    footer: 'Não pediu? Ignore este e-mail: sua senha atual continua valendo.',
  });

/** Confirmação de um e-mail novo, mandada para o próprio e-mail novo. */
export const confirmEmailEmail = (person: Person & { url: string; validity: string }) =>
  render({
    to: person.to,
    subject: 'Confirme seu e-mail no ReparoSM',
    preheader: 'Um clique para usar este e-mail no seu acesso.',
    heading: 'Confirme seu e-mail',
    paragraphs: [
      `Confirme que ${person.to} é o seu e-mail no ReparoSM. Com ele você entra no sistema e recupera a senha sozinho quando precisar.`,
    ],
    details: [
      ['Loja', person.storeName],
      ['Seu usuário', person.username],
    ],
    action: { label: 'Confirmar e-mail', url: person.url, validity: person.validity },
    footer: 'Não pediu? Ignore este e-mail: nada muda no seu acesso.',
  });

/** Aviso de segurança depois de uma troca de senha. */
export const passwordChangedEmail = (person: Person) =>
  render({
    to: person.to,
    subject: 'Sua senha do ReparoSM foi alterada',
    preheader: 'Se não foi você, avise o dono da loja ou o suporte.',
    heading: 'Sua senha foi alterada',
    paragraphs: [
      `A senha do seu acesso à loja ${person.storeName} acabou de ser alterada, e os outros aparelhos conectados saíram.`,
      'Se foi você, não precisa fazer nada. Se não foi, peça agora uma nova senha pela tela de entrada e avise o dono da loja ou o suporte ReparoSM.',
    ],
    details: [
      ['Loja', person.storeName],
      ['Seu usuário', person.username],
    ],
    action: {
      label: 'Abrir o ReparoSM',
      url: `${env.appUrl}/login`,
      validity: 'Este botão só abre a tela de entrada.',
    },
    footer: 'Você recebe este aviso sempre que a senha muda.',
  });
