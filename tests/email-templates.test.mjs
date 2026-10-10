import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.APP_URL = 'https://app.reparosm.test';
const templates = await import('../lib/email-templates.ts');

const person = {
  to: 'marcos@loja.test',
  name: 'Marcos <img src=x onerror=alert(1)> Oliveira',
  username: 'marcos',
  storeName: 'Cell "Prime" & Cia',
  url: 'https://app.reparosm.test/acesso#t=abc',
  validity: 'O link vale por 3 dias e só pode ser usado uma vez.',
};

test('access e-mails escape every value from the registry', () => {
  const mail = templates.newStoreEmail(person);
  assert.equal(mail.to, 'marcos@loja.test');
  assert.match(mail.subject, /Sua loja Cell "Prime" & Cia está pronta/);
  assert.doesNotMatch(mail.html, /<img src=x/);
  assert.match(mail.html, /Cell &quot;Prime&quot; &amp; Cia/);
  assert.match(mail.html, /Boas-vindas, Marcos/);
  assert.equal(
    templates.escapeHtml(`<a href='x'>&</a>`),
    '&lt;a href=&#39;x&#39;&gt;&amp;&lt;/a&gt;',
  );
});

test('every access e-mail has the button, the copyable address and a plain-text version', () => {
  for (const mail of [
    templates.newStoreEmail(person),
    templates.teamInviteEmail({ ...person, role: 'staff' }),
    templates.resetEmail(person),
    templates.confirmEmailEmail(person),
  ]) {
    assert.match(mail.html, /href="https:\/\/app\.reparosm\.test\/acesso#t=abc"/);
    assert.match(mail.html, /https:\/\/app\.reparosm\.test\/brand\/reparosm-logo-dark\.png/);
    assert.match(mail.text, /https:\/\/app\.reparosm\.test\/acesso#t=abc/);
    assert.match(mail.text, /Seu usuário: marcos/);
    assert.match(mail.text, /O link vale por 3 dias/);
    assert.doesNotMatch(mail.text, /<[a-z]/i, 'texto puro, sem HTML');
  }
  assert.match(templates.teamInviteEmail({ ...person, role: 'staff' }).text, /como Funcionário/);
});

test('the password-changed notice carries no access link', () => {
  const mail = templates.passwordChangedEmail(person);
  assert.match(mail.subject, /senha do ReparoSM foi alterada/);
  assert.doesNotMatch(mail.html, /#t=/);
  assert.match(mail.html, /https:\/\/app\.reparosm\.test\/login/);
});
