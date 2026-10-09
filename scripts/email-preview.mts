// Gera os e-mails de acesso como arquivos HTML para conferir o visual.
// Uso: APP_URL=http://localhost:3000 node --import ./tests/support/setup.mjs --import tsx scripts/email-preview.mts <pasta>
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  confirmEmailEmail,
  newStoreEmail,
  passwordChangedEmail,
  resetEmail,
  teamInviteEmail,
} from '../lib/email-templates.ts';

const folder = process.argv[2] || 'email-preview';
const person = {
  to: 'marcos@exemplo.com',
  name: 'Marcos Oliveira',
  username: 'marcos',
  storeName: 'Cell Prime Assistência',
  url: `${process.env.APP_URL || 'http://localhost:3000'}/acesso#t=exemplo`,
  validity: 'O link vale por 3 dias e só pode ser usado uma vez.',
};
const mails = {
  'loja-nova': newStoreEmail(person),
  convite: teamInviteEmail({ ...person, role: 'staff' }),
  'nova-senha': resetEmail({
    ...person,
    validity: 'O link vale por 1 hora e só pode ser usado uma vez.',
  }),
  'confirmar-email': confirmEmailEmail({ ...person, validity: 'O link vale por 24 horas.' }),
  'senha-alterada': passwordChangedEmail(person),
};
await mkdir(folder, { recursive: true });
for (const [name, mail] of Object.entries(mails)) {
  await writeFile(join(folder, `${name}.html`), mail.html);
  await writeFile(join(folder, `${name}.txt`), `Assunto: ${mail.subject}\n\n${mail.text}`);
}
console.log(`E-mails em ${folder}: ${Object.keys(mails).join(', ')}`);
