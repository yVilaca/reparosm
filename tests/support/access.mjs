// Links de acesso nos testes: com EMAIL_TRANSPORT=memory os e-mails ficam numa
// caixa em memória; daqui sai o token do link, como a pessoa faria ao clicar.
process.env.EMAIL_TRANSPORT = 'memory';

export const outbox = () => (globalThis.__reparosmOutbox ??= []);

/** O token do último link mandado para esse e-mail (ou de uma URL de link). */
export function linkToken(source) {
  const text = source.includes('@')
    ? [...outbox()].reverse().find((mail) => mail.to === source)?.text
    : source;
  return text?.match(/#t=([A-Za-z0-9_-]{43})/)?.[1];
}

export const accessRequest = (
  body,
  { userAgent = 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0' } = {},
) =>
  new Request('https://test.local/api/access', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin: 'https://test.local',
      'user-agent': userAgent,
    },
    body: JSON.stringify(body),
  });

/** Usa o link criando a senha; devolve a resposta e o cookie da sessão nova. */
export async function openLink(token, password = 'Minhasenha123') {
  const access = await import('../../app/api/access/route.ts');
  const response = await access.POST(accessRequest({ action: 'consume', token, password }));
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  return { response, cookie };
}
