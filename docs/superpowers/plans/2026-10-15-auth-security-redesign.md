# Auth Security Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar login Google, TOTP opcional, aparelhos confiáveis por 30 dias, recuperação administrativa e uma experiência visual própria sem substituir contas, usuários ou sessões do ReparoSM.

**Architecture:** Senha e Google convergem para um único `finishPrimaryAuth`, que cria uma sessão existente ou um desafio MFA de dez minutos. TOTP, recovery codes, identidades e aparelhos ficam em tabelas RLS aditivas; a interface usa um `AuthShell` compartilhado e o painel existente de Minha conta.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, PostgreSQL com RLS, Web Crypto AES-256-GCM, `jose`, `otpauth`, Node test runner e componentes existentes.

**Spec:** `docs/superpowers/specs/2026-10-15-auth-security-redesign-design.md`

## Global Constraints

- Antes de alterar rotas/cookies, ler `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`, `02-guides/authentication.md`, `02-guides/data-security.md` e `03-api-reference/04-functions/cookies.md`.
- Manter `accounts`, `users` e `sessions` como fonte de verdade; não introduzir Auth.js, sessão Google ou cadastro automático.
- Adicionar somente `jose` e `otpauth`; reutilizar Web Crypto, `QrCode`, componentes, feedback e padrões de repositório existentes.
- Google pede apenas `openid email`; não persistir authorization code, access token, ID token ou refresh token.
- TOTP permanece opcional; confiança dura exatamente 30 dias e dispensa apenas o segundo fator.
- Toda nova tabela com `account_id` tem RLS forçado, FK composta para `users` e testes de isolamento.
- Segredos e tokens ficam cifrados ou como SHA-256; nunca em logs, URL, `localStorage` ou respostas posteriores ao passo que os exibe.
- Preservar tinta `#1B1636`, violeta `#6C4CF1`, Red Hat Display/Text e o logo; evitar gradientes genéricos, glassmorphism, bolhas e excesso de cartões.
- Manter mensagens públicas neutras sobre existência de usuário, e-mail, Google ou TOTP.
- Todo comportamento não trivial nasce com teste falhando; executar `graft build && graft check` depois das alterações relevantes e nunca commitar `graft/`.

## Review Focus

1. Callback Google sem cookies, com `state` trocado ou `nonce` reaproveitado deve falhar sem criar/vincular identidade nem sessão — coberto na Task 6.
2. Duas pessoas no mesmo navegador não podem compartilhar a confiança MFA — coberto na Task 4.
3. Dois pedidos concorrentes não podem consumir o mesmo desafio, passo TOTP ou recovery code duas vezes — coberto nas Tasks 3 e 5.
4. Reset de senha de quem usa TOTP não pode criar sessão antes do segundo fator — coberto na Task 8.
5. Trocar o e-mail ReparoSM não deve trocar silenciosamente o `sub` Google; um novo Google com o e-mail antigo não pode sequestrar a conta — coberto na Task 6.

---

### Task 1: Configuração e cofre de segredos

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.env.example`
- Modify: `lib/env.ts`
- Create: `lib/auth-secrets.ts`
- Modify: `tests/env.test.mjs`
- Create: `tests/auth-secrets.test.mjs`

**Interfaces:**

- Produces: `googleConfigured(): boolean`, `authEncryptionConfigured(): boolean`.
- Produces: `encryptAuthSecret(value: string): Promise<string>` e `decryptAuthSecret(payload: string): Promise<string>`; payload versionado `v1.<iv>.<ciphertext>` em base64url.
- Consumes: `AUTH_ENCRYPTION_KEY` com 64 hexadecimais; `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` presentes juntos ou ausentes juntos.

- [ ] **Step 1: Escrever os testes que falham**

```js
test('Google config is enabled only when client id and secret are both present', () => {
  assert.equal(googleConfigured(), true);
  assert.throws(() => validateEnv(), /GOOGLE_CLIENT_SECRET/);
});

test('auth secrets round-trip and reject tampering', async () => {
  const encrypted = await encryptAuthSecret('totp-secret');
  assert.notEqual(encrypted, 'totp-secret');
  assert.equal(await decryptAuthSecret(encrypted), 'totp-secret');
  await assert.rejects(() => decryptAuthSecret(`${encrypted}x`));
});
```

- [ ] **Step 2: Confirmar a falha**

Run: `pnpm exec tsx --import ./tests/support/setup.mjs --test tests/env.test.mjs tests/auth-secrets.test.mjs`

Expected: FAIL por exports/arquivo inexistentes.

- [ ] **Step 3: Implementar a fundação mínima**

Run: `pnpm add jose otpauth`

Adicionar getters de ambiente, validação do par Google e chave hex. Implementar AES-256-GCM com `crypto.subtle`; IV aleatório de 12 bytes e versão no payload. Atualizar `names`/restore do teste de ambiente e `.env.example` sem valores reais.

- [ ] **Step 4: Verificar e commitar**

Run: `pnpm exec tsx --import ./tests/support/setup.mjs --test tests/env.test.mjs tests/auth-secrets.test.mjs && pnpm typecheck`

Expected: PASS.

```bash
git add package.json pnpm-lock.yaml .env.example lib/env.ts lib/auth-secrets.ts tests/env.test.mjs tests/auth-secrets.test.mjs
git commit -m "feat: add auth security configuration"
```

### Task 2: Esquema RLS e repositório de segurança

**Files:**

- Create: `netlify/database/migrations/0031_auth_security.sql`
- Create: `lib/repos/auth-security.ts`
- Modify: `lib/db.ts`
- Modify: `lib/types.ts`
- Modify: `tests/db.test.mjs`
- Modify: `tests/migrations.test.mjs`
- Create: `tests/auth-security.test.mjs`

**Interfaces:**

- Produces: tabelas `user_identities`, `user_authenticators`, `recovery_codes`, `auth_challenges`, `auth_devices`, `mfa_reset_requests` e `sessions.device_id` anulável.
- Produces: `AuthMethod = 'password' | 'google'`, `AuthUserContext`, `AuthDevice`, `AuthSecurityState` e `MfaResetRequest` em `lib/types.ts`.
- Produces: repositório `authSecurity` com operações atômicas por callback `Query`; os serviços das Tasks 3–6 são os únicos consumidores.
- Produces: `googleIdentityTransaction(subject, fn)` e `authChallengeTransaction(tokenHash, fn)` em `lib/db.ts`.

- [ ] **Step 1: Escrever testes de migração e isolamento**

Adicionar testes com estes nomes e asserções:

```js
test('0031 adds auth security tables without changing existing sessions', { skip }, async () => {
  assert.deepEqual(newTables.sort(), expectedTables.sort());
  assert.equal(oldSessionStillAuthenticates, true);
});

test(
  'auth security rows are visible only to their user, tenant capability or admin',
  { skip },
  async () => {
    assert.equal(otherTenantRows.length, 0);
    assert.equal(ownRows.length, 1);
    assert.equal(adminRows.length, 1);
  },
);
```

Estender o teste genérico de RLS para as seis tabelas e o teste de cascade para a exclusão de conta.

- [ ] **Step 2: Confirmar a falha em banco configurado**

Run: `pnpm exec tsx --import ./tests/support/setup.mjs --test tests/db.test.mjs tests/migrations.test.mjs tests/auth-security.test.mjs`

Expected: FAIL com tabelas/migração ausentes; sem `DATABASE_URL`, testes DB devem aparecer como SKIP, não PASS falso.

- [ ] **Step 3: Criar a migração aditiva**

Aplicar os campos, checks, índices e unicidades exatos da spec. Conceder apenas colunas necessárias a `reparosm_runtime`; forçar RLS. Contextos de login veem somente subject/desafio correspondente, sessão vê o próprio usuário, tenant vê sua conta e admin usa `app.admin_account_id`.

- [ ] **Step 4: Implementar os tipos e o repositório fino**

Usar funções específicas em vez de um CRUD genérico:

```ts
findIdentity(provider: 'google', subject: string): Promise<AuthUserContext | null>
linkIdentity(user: AuthUserContext, subject: string, email: string, run?: Query): Promise<void>
authenticator(userId: string, run: Query): Promise<StoredAuthenticator | null>
savePendingAuthenticator(userId: string, accountId: string, ciphertext: string, run: Query): Promise<void>
enableAuthenticator(userId: string, step: number, codeHashes: string[], run: Query): Promise<void>
createChallenge(input: NewAuthChallenge, run: Query): Promise<string>
consumeChallenge(tokenHash: string, run: Query): Promise<StoredAuthChallenge | null>
```

Operações de aparelho, recovery code e reset entram no mesmo repositório quando suas Tasks criarem os respectivos testes; não criar interface especulativa agora.

- [ ] **Step 5: Verificar e commitar**

Run: `pnpm test && pnpm typecheck`

Expected: testes sem banco continuam verdes; testes DB passam onde `DATABASE_URL` está configurada.

```bash
git add netlify/database/migrations/0031_auth_security.sql lib/repos/auth-security.ts lib/db.ts lib/types.ts tests/db.test.mjs tests/migrations.test.mjs tests/auth-security.test.mjs
git commit -m "feat: add auth security schema"
```

### Task 3: TOTP e códigos de recuperação

**Files:**

- Create: `lib/totp.ts`
- Modify: `lib/repos/auth-security.ts`
- Create: `tests/totp.test.mjs`
- Modify: `tests/auth-security.test.mjs`

**Interfaces:**

- Produces: `createTotpEnrollment(label: string): { secret: string; uri: string }`.
- Produces: `verifyTotp(secret: string, code: string, options: { now?: number; lastUsedStep?: number | null }): { valid: boolean; step?: number }`.
- Produces: `createRecoveryCodes(): string[]`, `hashRecoveryCode(code: string): Promise<string>` e `normalizeRecoveryCode(code: string): string`.
- Produces no repositório: `useTotpStep(...)` e `consumeRecoveryCode(...)` com `UPDATE ... WHERE` atômico e retorno booleano.

- [ ] **Step 1: Escrever testes RFC e de concorrência**

```js
test('TOTP accepts RFC 6238 vectors and at most one adjacent 30-second step', () => {
  assert.equal(verifyTotp(secret, exact, { now }).valid, true);
  assert.equal(verifyTotp(secret, tooOld, { now }).valid, false);
});

test('recovery codes are eight unique one-use values', async () => {
  const codes = createRecoveryCodes();
  assert.equal(codes.length, 8);
  assert.equal(new Set(codes).size, 8);
  assert.ok(codes.every((code) => /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)));
});
```

No teste DB, disparar dois consumos concorrentes do mesmo passo/código e exigir exatamente um `true`.

- [ ] **Step 2: Confirmar a falha**

Run: `pnpm exec tsx --import ./tests/support/setup.mjs --test tests/totp.test.mjs tests/auth-security.test.mjs`

Expected: FAIL por `lib/totp.ts` ausente.

- [ ] **Step 3: Implementar com `otpauth` e Web Crypto**

Usar SHA-1, seis dígitos e período de 30 segundos para compatibilidade com autenticadores. Manter a janela em um passo para cada lado. Hash de recovery code usa SHA-256 porque o código é aleatório de alta entropia; comparação e consumo ficam no banco.

- [ ] **Step 4: Verificar e commitar**

Run: `pnpm exec tsx --import ./tests/support/setup.mjs --test tests/totp.test.mjs tests/auth-security.test.mjs && pnpm typecheck`

Expected: PASS/SKIP apenas onde faltar banco.

```bash
git add lib/totp.ts lib/repos/auth-security.ts tests/totp.test.mjs tests/auth-security.test.mjs
git commit -m "feat: add totp and recovery codes"
```

### Task 4: Aparelhos, confiança e sessões

**Files:**

- Modify: `lib/auth.ts`
- Modify: `lib/repos/auth-security.ts`
- Modify: `lib/repos/sessions.ts`
- Modify: `lib/types.ts`
- Modify: `app/api/me/route.ts`
- Modify: `tests/store-users.test.mjs`
- Modify: `tests/users-ui.test.mjs`

**Interfaces:**

- Produces: `browserToken(request: Request): string | undefined` e `browserCookie(token, maxAge?, secure?): string` (`HttpOnly`, `SameSite=Lax`).
- Produces: `deviceForLogin(user, rawBrowserToken, { userAgent, ip }, run): Promise<AuthDevice>`; uma linha por usuário e hash do navegador.
- Produces: `isTrusted(device, now?): boolean`, `trustDevice(deviceId, 30, run)`, `revokeOwnDevice(sessionToken, deviceId)` e `listOwnDevices(sessionToken)`.
- Modifica: `createSession(..., deviceId?: string)` e `StoreSession` para agrupar sessões pelo aparelho sem quebrar linhas antigas com `device_id = NULL`.

- [ ] **Step 1: Escrever testes de isolamento por pessoa**

```js
test('the same browser is trusted separately for each user', { skip }, async () => {
  assert.equal(await trustedFor(userA, browserToken), true);
  assert.equal(await trustedFor(userB, browserToken), false);
});

test('revoking a device ends all its sessions and trust', { skip }, async () => {
  assert.equal(result.ended, 2);
  assert.equal(await signedIn(firstSession), null);
  assert.equal(await trustedFor(user, browserToken), false);
});
```

Atualizar o teste existente de Minha conta para esperar aparelhos agrupados, `current`, `lastSeenAt`, IP resumido e `trustedUntil`.

- [ ] **Step 2: Confirmar a falha**

Run: `pnpm exec tsx --import ./tests/support/setup.mjs --test tests/store-users.test.mjs tests/users-ui.test.mjs`

Expected: FAIL nos novos campos/ações quando banco estiver disponível.

- [ ] **Step 3: Implementar cookie, repositório e associação de sessão**

Gerar 32 bytes base64url se o navegador não tiver cookie e expirar o cookie em 30 dias. Nunca usar user agent/IP como identidade. `last_seen_at` e `last_ip` atualizam no login; o IP devolvido à UI é abreviado no servidor. Revogação é uma transação. Remover o aparelho atual limpa a sessão, mas preserva o cookie anônimo do navegador para não invalidar a confiança de outra pessoa no mesmo computador; sem a linha daquele usuário, o cookie sozinho não concede confiança. Sessões antigas com `device_id = NULL` continuam listadas individualmente e revogáveis até expirarem.

- [ ] **Step 4: Verificar e commitar**

Run: `pnpm exec tsx --import ./tests/support/setup.mjs --test tests/store-users.test.mjs tests/users-ui.test.mjs && pnpm typecheck`

Expected: PASS/SKIP apenas sem banco.

```bash
git add lib/auth.ts lib/repos/auth-security.ts lib/repos/sessions.ts lib/types.ts app/api/me/route.ts tests/store-users.test.mjs tests/users-ui.test.mjs
git commit -m "feat: track trusted auth devices"
```

### Task 5: Estado único de login e desafio MFA

**Files:**

- Create: `lib/auth-flow.ts`
- Modify: `lib/repos/auth-security.ts`
- Modify: `lib/repos/sessions.ts`
- Modify: `app/api/auth/route.ts`
- Create: `app/api/auth/mfa/route.ts`
- Modify: `tests/auth.test.mjs`
- Modify: `tests/auth-security.test.mjs`

**Interfaces:**

- Consumes: TOTP/recuperação da Task 3 e aparelho da Task 4.
- Produces:

```ts
type PrimaryAuthResult =
  | { step: 'complete'; account: PublicAccount; sessionToken: string; browserToken: string }
  | { step: 'mfa'; browserToken: string; challengeToken: string };

finishPrimaryAuth(input: {
  user: AuthUserContext;
  method: AuthMethod;
  browserToken?: string;
  userAgent: string;
  ip: string;
  upgradedPasswordHash?: string;
}): Promise<PrimaryAuthResult>
```

- Produces: `completeMfa(input): Promise<PrimaryAuthResult & { step: 'complete' }>`; aceita `kind: 'totp' | 'recovery'`, `code` e `trustDevice`.

- [ ] **Step 1: Escrever testes do estado intermediário**

```js
test('password login with TOTP creates no session before the challenge', { skip }, async () => {
  assert.deepEqual(await response.json(), { step: 'mfa' });
  assert.equal(await sessionCount(userId), 0);
});

test('one MFA challenge can complete exactly once', { skip }, async () => {
  assert.deepEqual(statuses.sort(), [200, 409]);
  assert.equal(await sessionCount(userId), 1);
});
```

Cobrir TOTP errado/expirado, recovery code, limite de dez falhas por identidade/IP e confiança marcada/não marcada. Mesmo com `trustDevice: true`, login por recovery code deve deixar `trusted_until` nulo.

- [ ] **Step 2: Confirmar a falha**

Run: `pnpm exec tsx --import ./tests/support/setup.mjs --test tests/auth.test.mjs tests/auth-security.test.mjs`

Expected: FAIL porque senha ainda cria sessão diretamente e a rota MFA não existe.

- [ ] **Step 3: Implementar a orquestração**

Reutilizar `login_failures` com chaves prefixadas `mfa:<userId>` em vez de criar tabela de rate limit. `finishPrimaryAuth` é o único ponto que decide confiança versus desafio e cria sessão. A rota define cookies; o serviço retorna tokens e nunca depende de `NextRequest`.

- [ ] **Step 4: Verificar e commitar**

Run: `pnpm exec tsx --import ./tests/support/setup.mjs --test tests/auth.test.mjs tests/auth-security.test.mjs && pnpm typecheck`

Expected: PASS/SKIP apenas sem banco.

```bash
git add lib/auth-flow.ts lib/repos/auth-security.ts lib/repos/sessions.ts app/api/auth/route.ts app/api/auth/mfa/route.ts tests/auth.test.mjs tests/auth-security.test.mjs
git commit -m "feat: gate sessions behind mfa"
```

### Task 6: Google OpenID Connect

**Files:**

- Create: `lib/google-oidc.ts`
- Modify: `lib/auth.ts`
- Modify: `lib/repos/auth-security.ts`
- Create: `app/api/auth/google/route.ts`
- Create: `app/api/auth/google/callback/route.ts`
- Create: `tests/google-oidc.test.mjs`
- Modify: `tests/auth-security.test.mjs`

**Interfaces:**

- Produces: `googleAuthorizationUrl(input: { state; nonce; verifier; redirectUri }): Promise<URL>`.
- Produces: `exchangeGoogleCode(input): Promise<{ idToken: string }>` usando `fetch` e sem logar corpo.
- Produces: `verifyGoogleIdToken(idToken, { clientId, nonce, keySet? }): Promise<{ subject: string; email: string }>`; `keySet` é a seam de teste, produção usa JWKS remoto do discovery oficial.
- Produces: `resolveGoogleUser(subject, verifiedEmail): Promise<AuthUserContext>`; subject vinculado vence comparação por e-mail, primeiro vínculo exige `email_verified_at`.
- Consumes: `finishPrimaryAuth` da Task 5.

- [ ] **Step 1: Escrever testes OIDC e anti-sequestro**

```js
test('Google ID token requires issuer audience nonce expiry and verified email', async () => {
  await assert.rejects(() => verifyGoogleIdToken(wrongNonceToken, options), /nonce/);
  assert.deepEqual(await verifyGoogleIdToken(validToken, options), verifiedIdentity);
});

test(
  'a linked Google subject survives an app email change and cannot be relinked',
  { skip },
  async () => {
    assert.equal((await resolveGoogleUser(subject, oldEmail)).user.id, originalUserId);
    await assert.rejects(() => resolveGoogleUser(otherSubject, oldEmail));
  },
);
```

Testar callback sem cookie, `state` trocado, verifier ausente, nonce reutilizado, conta inativa e corrida no primeiro vínculo. Em todos: zero sessão e zero identidade nova. Dez falhas de troca/validação para o mesmo IP bloqueiam novas trocas por 15 minutos sem bloquear senha.

- [ ] **Step 2: Confirmar a falha**

Run: `pnpm exec tsx --import ./tests/support/setup.mjs --test tests/google-oidc.test.mjs tests/auth-security.test.mjs`

Expected: FAIL por módulo/rotas ausentes.

- [ ] **Step 3: Implementar OIDC server-side**

Usar discovery fixo `https://accounts.google.com/.well-known/openid-configuration`, PKCE S256, `state` e `nonce` aleatórios. Cookies transitórios duram dez minutos, `HttpOnly`, `SameSite=Lax`, e são apagados em sucesso ou erro. Redirect URI é `${env.appUrl}/api/auth/google/callback`. Callback chama `finishPrimaryAuth` e redireciona para `/ordens` ou `/login?etapa=verificacao`; erro seguro volta para `/login?erro=google`. Reutilizar `login_failures` com chave `google:callback` para limitar somente falhas que chegam à troca/validação.

- [ ] **Step 4: Verificar e commitar**

Run: `pnpm exec tsx --import ./tests/support/setup.mjs --test tests/google-oidc.test.mjs tests/auth-security.test.mjs && pnpm typecheck`

Expected: PASS/SKIP apenas sem banco.

```bash
git add lib/google-oidc.ts lib/auth.ts lib/repos/auth-security.ts app/api/auth/google/route.ts app/api/auth/google/callback/route.ts tests/google-oidc.test.mjs tests/auth-security.test.mjs
git commit -m "feat: add Google sign in"
```

### Task 7: AuthShell e experiência pública

**Files:**

- Create: `components/auth-shell.tsx`
- Create: `components/login-screen.tsx`
- Modify: `components/login.tsx`
- Modify: `components/access-route.tsx`
- Modify: `app/login/page.tsx`
- Modify: `app/globals.css`
- Create: `tests/auth-ui.test.mjs`

**Interfaces:**

- Produces: `AuthShell({ eyebrow, title, description, children, footer? })` com painel editorial, logo e desenho técnico local.
- Login passa pelos estados `login | forgot | mfa | recovery`, lidos da resposta da API/query, sem duplicar formulários de shell.
- `app/login/page.tsx` volta a ser Server Component e passa `googleEnabled={googleConfigured()}` ao novo `LoginScreen`; esse componente cliente mantém `useRouter`/`useSearchParams`, enquanto `Login` continua apresentacional e testável por SSR.

- [ ] **Step 1: Escrever testes de conteúdo e acessibilidade**

```js
test('the auth shell keeps ReparoSM identity across login access and MFA', () => {
  assert.match(loginHtml, /ReparoSM/);
  assert.match(loginHtml, /Continuar com Google/);
  assert.match(mfaHtml, /Confiar neste dispositivo por 30 dias/);
  assert.match(accessHtml, /Crie uma nova senha/);
});
```

Asserir label persistente, autocomplete `username/current-password/one-time-code`, `inputMode="numeric"`, mensagem `role="alert"`, QR não nesta tela e ausência do botão Google quando desabilitado.

- [ ] **Step 2: Confirmar a falha**

Run: `pnpm exec tsx --import ./tests/support/setup.mjs --test tests/auth-ui.test.mjs`

Expected: FAIL por `AuthShell` ausente e layout antigo.

- [ ] **Step 3: Implementar o shell e estados**

Usar tokens existentes e CSS/SVG local de linhas de diagnóstico; desktop assimétrico, mobile com cabeçalho compacto. Sem imagem remota, carrossel ou animação decorativa. O form mantém foco ao trocar de estado, aceita colar seis dígitos e oferece recovery/reset sem revelar conta. O teste renderiza `AuthShell` e `Login` diretamente; navegação fica isolada em `LoginScreen`.

- [ ] **Step 4: Verificar e commitar**

Run: `pnpm exec tsx --import ./tests/support/setup.mjs --test tests/auth-ui.test.mjs && pnpm typecheck && pnpm lint`

Expected: PASS.

```bash
git add components/auth-shell.tsx components/login-screen.tsx components/login.tsx components/access-route.tsx app/login/page.tsx app/globals.css tests/auth-ui.test.mjs
git commit -m "feat: redesign authentication experience"
```

### Task 8: Links de acesso e reset de senha com MFA

**Files:**

- Modify: `lib/access.ts`
- Modify: `lib/repos/access-links.ts`
- Modify: `app/api/access/route.ts`
- Modify: `components/access-route.tsx`
- Modify: `tests/access-links.test.mjs`
- Modify: `tests/auth.test.mjs`

**Interfaces:**

- Consumes: `finishPrimaryAuth` da Task 5 quando `consumeLink` finaliza convite/reset.
- Modifica: resultado de `consumeLink` para `{ status: 'ok'; purpose; auth?: PrimaryAuthResult }` em vez de sempre devolver `sessionToken`.
- Convite sem autenticador continua criando sessão; reset com TOTP cria desafio e nunca sessão prematura.

- [ ] **Step 1: Escrever o teste de regressão do reset**

```js
test(
  'password reset revokes trust and requires existing TOTP before sign-in',
  { skip },
  async () => {
    assert.equal(await trustedFor(userId, oldBrowser), false);
    assert.equal(await sessionCount(userId), 0);
    assert.deepEqual(await resetResponse.json(), { ok: true, purpose: 'reset', step: 'mfa' });
  },
);
```

Asserir que convite novo ainda responde `signedIn: true`, confirmação de e-mail não altera TOTP/Google e link usado continua atômico.

- [ ] **Step 2: Confirmar a falha**

Run: `pnpm exec tsx --import ./tests/support/setup.mjs --test tests/access-links.test.mjs tests/auth.test.mjs`

Expected: FAIL porque reset ainda cria sessão direto.

- [ ] **Step 3: Integrar o fluxo sem duplicar autenticação**

Ao consumir reset: revogar sessões e todos os `trusted_until`, atualizar senha e chamar `finishPrimaryAuth`. A rota define cookies conforme `complete`/`mfa`; `AccessRoute` navega para `/login?etapa=verificacao` quando houver desafio.

- [ ] **Step 4: Verificar e commitar**

Run: `pnpm exec tsx --import ./tests/support/setup.mjs --test tests/access-links.test.mjs tests/auth.test.mjs && pnpm typecheck`

Expected: PASS/SKIP apenas sem banco.

```bash
git add lib/access.ts lib/repos/access-links.ts app/api/access/route.ts components/access-route.tsx tests/access-links.test.mjs tests/auth.test.mjs
git commit -m "feat: preserve mfa through password reset"
```

### Task 9: Minha conta — autenticador, Google e aparelhos

**Files:**

- Create: `app/api/me/security/route.ts`
- Create: `components/account-security.tsx`
- Modify: `components/my-account-route.tsx`
- Modify: `app/(painel)/minha-conta/page.tsx`
- Modify: `lib/repos/auth-security.ts`
- Modify: `lib/repos/sessions.ts`
- Modify: `tests/store-users.test.mjs`
- Modify: `tests/users-ui.test.mjs`
- Modify: `tests/auth-ui.test.mjs`

**Interfaces:**

- Produces: `GET /api/me/security` com `totpEnabled`, `googleIdentity`, `recoveryCodesRemaining` e `devices`; nunca segredo/hash.
- Produces ações POST: `start-totp`, `confirm-totp`, `regenerate-codes`, `disable-totp`, `unlink-google`, `revoke-device`, `revoke-other-devices`.
- `start-totp` retorna `{ secret, uri }` somente depois de senha atual correta; `confirm-totp` retorna os oito códigos uma única vez.
- `regenerate-codes`, `disable-totp` e `unlink-google` exigem senha atual e, quando TOTP estiver ativo, um TOTP ou recovery code válido.
- Produces: `AccountSecurity` isolado do formulário de perfil/senha existente.

- [ ] **Step 1: Escrever testes de ciclo de vida**

```js
test('TOTP is enabled only after password and first valid code', { skip }, async () => {
  assert.equal((await security()).totpEnabled, false);
  assert.equal(startWrongPassword.status, 400);
  assert.equal(confirmValid.status, 200);
  assert.equal((await confirmValid.json()).recoveryCodes.length, 8);
  assert.equal((await security()).totpEnabled, true);
});
```

Testar resposta sem segredo depois da ativação, regeneração invalidando conjunto anterior, desativação revogando outras sessões/confianças, unlink Google sem remover senha e remoção do aparelho atual levando a 401.

- [ ] **Step 2: Confirmar a falha**

Run: `pnpm exec tsx --import ./tests/support/setup.mjs --test tests/store-users.test.mjs tests/users-ui.test.mjs tests/auth-ui.test.mjs`

Expected: FAIL por rota/componente ausente.

- [ ] **Step 3: Implementar API e interface**

Reusar `QrCode`; mostrar chave manual. Códigos têm botão copiar e impressão/texto local, sem persistência no cliente. Separar seções Google, autenticador e aparelhos; status recomendado é discreto. Confirmações destrutivas usam `useFeedback`.

- [ ] **Step 4: Verificar e commitar**

Run: `pnpm exec tsx --import ./tests/support/setup.mjs --test tests/store-users.test.mjs tests/users-ui.test.mjs tests/auth-ui.test.mjs && pnpm typecheck && pnpm lint`

Expected: PASS/SKIP apenas sem banco.

```bash
git add app/api/me/security/route.ts components/account-security.tsx components/my-account-route.tsx 'app/(painel)/minha-conta/page.tsx' lib/repos/auth-security.ts lib/repos/sessions.ts tests/store-users.test.mjs tests/users-ui.test.mjs tests/auth-ui.test.mjs
git commit -m "feat: manage account security"
```

### Task 10: Recuperação administrativa do MFA

**Files:**

- Modify: `lib/repos/auth-security.ts`
- Modify: `lib/repos/users.ts`
- Modify: `app/api/auth/mfa/route.ts`
- Modify: `app/api/team/route.ts`
- Modify: `app/api/accounts/route.ts`
- Modify: `components/team-route.tsx`
- Modify: `components/accounts-route.tsx`
- Create: `scripts/reset-admin-mfa.mts`
- Modify: `tests/store-users.test.mjs`
- Modify: `tests/users-ui.test.mjs`

**Interfaces:**

- Produces: `requestMfaReset(challengeToken)`, `listMfaResetRequests(scope)`, `resolveMfaReset(actor, userId, 'approved' | 'dismissed')`.
- Rotas usam ações explícitas `approve-mfa-reset` e `dismiss-mfa-reset`; pedido do administrador da plataforma não entra em fila e aponta para o procedimento de emergência.
- Aprovação chama `clearUserMfa(userId, run)`, que remove autenticador/códigos/aparelhos, encerra sessões e resolve pedido atomicamente.
- Script aceita somente `--user user-adminreparosm --confirm user-adminreparosm`; qualquer outra combinação termina sem escrita.

- [ ] **Step 1: Escrever testes de autorização e consequência**

```js
test(
  'staff MFA reset goes to the owner and owner reset goes to platform admin',
  { skip },
  async () => {
    assert.deepEqual(
      ownerQueue.map((row) => row.username),
      ['staff'],
    );
    assert.deepEqual(
      adminQueue.map((row) => row.username),
      ['owner'],
    );
  },
);

test('approving MFA reset clears every second-factor access atomically', { skip }, async () => {
  assert.equal(await authenticator(userId), null);
  assert.equal(await sessionCount(userId), 0);
  assert.equal(await deviceCount(userId), 0);
});
```

Asserir que funcionário não aprova, dono não reseta outro tenant/admin, pedido duplicado continua um, descartar não altera MFA e script exige dupla confirmação.

- [ ] **Step 2: Confirmar a falha**

Run: `pnpm exec tsx --import ./tests/support/setup.mjs --test tests/store-users.test.mjs tests/users-ui.test.mjs`

Expected: FAIL por fila/ações ausentes.

- [ ] **Step 3: Implementar filas, UI e comando de emergência**

Seguir a hierarquia e o desenho das filas de `password_requests`; exibir MFA separadamente com a consequência `remove o segundo fator e desconecta todos os aparelhos`. O script usa `DATABASE_URL_UNPOOLED || DATABASE_URL`, não aceita conta arbitrária e nunca imprime segredo.

- [ ] **Step 4: Verificar e commitar**

Run: `pnpm exec tsx --import ./tests/support/setup.mjs --test tests/store-users.test.mjs tests/users-ui.test.mjs && pnpm typecheck && pnpm lint`

Expected: PASS/SKIP apenas sem banco.

```bash
git add lib/repos/auth-security.ts lib/repos/users.ts app/api/auth/mfa/route.ts app/api/team/route.ts app/api/accounts/route.ts components/team-route.tsx components/accounts-route.tsx scripts/reset-admin-mfa.mts tests/store-users.test.mjs tests/users-ui.test.mjs
git commit -m "feat: add mfa recovery workflow"
```

### Task 11: Verificação integrada, documentação e entrega

**Files:**

- Create: `docs/auth-operations.md`
- Modify: `docs/deploy-preview.md`
- Modify: `tests/public-data.test.mjs`
- Modify: `tests/proxy.test.mjs`
- Modify: `tests/auth-ui.test.mjs`

**Interfaces:**

- Produces: instruções exatas de Google Cloud, callback `${APP_URL}/api/auth/google/callback`, geração de `AUTH_ENCRYPTION_KEY`, rollout e reset de emergência.
- Produces: checklist de smoke test sem armazenar credenciais no repositório.

- [ ] **Step 1: Fechar testes de fronteira restantes**

Adicionar asserts de que tabelas de auth não entram em registros de negócio/exportação, proxy continua protegendo o painel, rotas/callbacks são `no-store` e a UI não renderiza segredos após sair do passo de recovery.

- [ ] **Step 2: Documentar configuração e rollback**

Incluir os três envs, redirect URIs por ambiente, ordem `env → migração → app`, login por senha como fallback e como desabilitar somente Google removendo o par de envs. Não documentar segredo real.

- [ ] **Step 3: Rodar a verificação completa**

Run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec graft build
pnpm exec graft check
git diff --check
```

Expected: tudo termina com código 0; testes DB só podem ficar SKIP localmente por ausência declarada de `DATABASE_URL` e devem passar no CI/deploy com banco.

- [ ] **Step 4: Fazer QA visual e funcional**

Inspecionar login, esqueci senha, Google habilitado/desabilitado, MFA, convite, reset e Minha conta em 390px e desktop; teclado, foco, leitor de tela, tema escuro e reduced motion. Executar smoke real de Google/TOTP apenas com credenciais de ambiente configuradas.

- [ ] **Step 5: Revisar o branch e commitar**

Confirmar que `git status --short` não lista `graft/`, `.env` nem credenciais. Revisar diff contra `origin/main`, corrigir somente achados do escopo e repetir os comandos afetados.

```bash
git add docs/auth-operations.md docs/deploy-preview.md tests/public-data.test.mjs tests/proxy.test.mjs tests/auth-ui.test.mjs
git commit -m "docs: add secure auth operations"
```

- [ ] **Step 6: Publicar para revisão**

Push de `codex/auth-security-redesign`, abrir PR com resumo, riscos, comandos executados e variáveis ainda necessárias. Anexar o PR à tarefa. Migração de produção ocorre pelo fluxo existente de build/deploy somente depois da revisão; não inserir credenciais Google via commit.
