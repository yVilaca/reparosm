# Redesenho visual — Fase 1: Fundação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instalar Tailwind CSS v4 + shadcn/ui no ReparoSM e migrar a casca do
app (layout raiz, navegação do painel, login, sistema de feedback/toast) para
o novo sistema de design, sem alterar nenhuma regra de negócio.

**Architecture:** shadcn/ui roda como CLI que copia componentes-fonte para
`components/ui/`, sobre Tailwind v4 (tokens via `@theme`/`:root`/`.dark` em
`app/globals.css`). `useFeedback()` (`notify`/`confirm`) mantém a mesma
assinatura pública; só o HTML/CSS interno muda (Sonner + AlertDialog).

**Tech Stack:** Next.js 16.2.6, React 19.2.6, TypeScript strict, Tailwind CSS
v4, shadcn/ui (Radix UI + `class-variance-authority` + `tailwind-merge` +
`clsx`), `next-themes`, fonte Inter via `next/font/google`.

**Spec:** `docs/superpowers/specs/2026-09-27-visual-redesign-design.md`

## Global Constraints

- Roxo de marca: `#6c4cf1` (mesmo tom em tema claro e escuro — ver Task 2
  para a justificativa de contraste).
- Nenhuma dependência de runtime relacionada a regra de negócio muda; esta
  fase é puramente visual/estrutural.
- `useFeedback()` (`notify(message, tone?)`, `confirm(message): Promise<boolean>`)
  mantém a assinatura atual — dezenas de arquivos fora desta fase dependem
  dela e não devem ser tocados.
- Ao final de cada task: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`,
  `pnpm test` e `pnpm build` devem passar.
- `pnpm exec graft build && pnpm exec graft check` ao final da fase (regra
  obrigatória do projeto).

## Review Focus

- Alternar para tema escuro e reabrir a página não deve resetar a preferência
  salva (persistência real, não só estado em memória).
- Um toast de erro dev permanecer legível (contraste) nos dois temas, não só
  no claro em que foi provavelmente testado primeiro.
- `useFeedback().confirm()` chamado duas vezes em sequência rápida (dois
  cliques em botões de exclusão diferentes antes de resolver o primeiro
  diálogo) não deve perder a segunda confirmação nem misturar as mensagens.
- Login com usuário/senha errados continua mostrando o erro existente
  (`role="alert"`) mesmo depois da troca de markup — é a única tela pública
  não autenticada desta fase, sem cobertura de teste automatizado hoje.
- Sidebar em largura mobile (o menu "Mais") continua fechando ao navegar,
  como hoje — fácil de regredir ao restilizar o `onClick`/estado.

---

### Task 1: Instalar Tailwind v4 e shadcn/ui

**Files:**

- Create: `components.json`, `lib/utils.ts`
- Modify: `package.json`, `pnpm-lock.yaml`, `app/globals.css`

**Interfaces:**

- Produces: `cn(...inputs: ClassValue[]): string` exportado de `lib/utils.ts`
  (usado por todo componente shadcn e por todas as tasks seguintes).

- [x] **Step 1: Rodar o instalador do shadcn**

```bash
pnpm dlx shadcn@latest init -y
```

O CLI detecta o Next.js App Router e o alias `@/*` já existente em
`tsconfig.json` automaticamente. Ele vai adicionar `@import "tailwindcss";`
e um bloco de tokens (`@theme`, `:root`, `.dark`) no topo de
`app/globals.css`, criar `components.json` e `lib/utils.ts`, e instalar as
dependências necessárias (`tailwindcss@4`, `class-variance-authority`,
`clsx`, `tailwind-merge`, `lucide-react`, e o que mais o CLI decidir —
não adicione nada manualmente, deixe o instalador gerenciar o
`package.json`).

- [x] **Step 2: Verificar que o bloco de tokens ficou no topo do arquivo**

Abra `app/globals.css` e confirme que `@import "tailwindcss";` e o bloco de
tokens gerado pelo CLI estão **antes** das ~4.300 linhas de CSS legado
existentes (o CLI normalmente insere no início do arquivo; se tiver
inserido em outro lugar, mova manualmente para o topo — CSS legado depois
dos tokens deve continuar funcionando, já que não há conflito de nomes de
classe, só de variáveis, que a Task 2 resolve).

- [x] **Step 3: Confirmar que `lib/utils.ts` foi criado com o `cn` helper**

```ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Se o CLI gerou algo diferente disso, mantenha o que ele gerou — esta é
apenas a forma padrão esperada, para referência.

- [x] **Step 4: Rodar o build pra confirmar que nada quebrou**

Run: `pnpm typecheck && pnpm build`

Expected: ambos saem com código 0. O app deve continuar funcionando
visualmente igual a antes (o CSS legado ainda está intacto, só ganhou
Tailwind por cima).

- [x] **Step 5: Commit**

```bash
git add components.json lib/utils.ts package.json pnpm-lock.yaml app/globals.css
git commit -m "chore: install tailwind v4 and shadcn/ui"
```

---

### Task 2: Tokens de marca (roxo) e fonte Inter

**Files:**

- Modify: `app/globals.css`, `app/layout.tsx`

**Interfaces:**

- Consumes: bloco `:root`/`.dark` gerado na Task 1.
- Produces: variável CSS `--primary`/`--primary-foreground` = roxo de marca
  em ambos os temas; classe `font-sans` do Tailwind passa a resolver para
  Inter em todo o app (via `next/font/google` + variável CSS).

- [x] **Step 1: Sobrescrever os tokens de cor primária**

No bloco `:root` gerado pelo CLI em `app/globals.css`, adicione/substitua:

```css
:root {
  --primary: #6c4cf1;
  --primary-foreground: #ffffff;
}
```

E no bloco `.dark`:

```css
.dark {
  --primary: #6c4cf1;
  --primary-foreground: #ffffff;
}
```

Motivo de usar o mesmo tom nos dois temas: contraste calculado
(WCAG) de branco sobre `#6c4cf1` é ~5.3:1, acima do mínimo de 4.5:1 para
texto normal — não precisa clarear a cor pro tema escuro. Deixe as demais
variáveis (`--background`, `--foreground`, `--muted`, `--border`, etc.)
como o CLI gerou.

- [x] **Step 2: Adicionar a fonte Inter**

Em `app/layout.tsx`, importe e aplique a fonte:

```tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { FeedbackProvider } from '@/components/feedback';
import { env } from '@/lib/env';
import './accounts.css';
import './globals.css';
import './mesa.css';
import './recovery.css';
import './whatsapp.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: 'ReparoSM | Repair System Master',
  description:
    'Controle produtos, serviços, estoque, clientes e resultados da sua assistência técnica em um só lugar.',
  openGraph: {
    title: 'ReparoSM | Repair System Master',
    description: 'Produtos, ordens de serviço, estoque e resultados em um só lugar.',
    images: ['/og.jpg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ReparoSM | Repair System Master',
    description: 'Produtos, ordens de serviço, estoque e resultados em um só lugar.',
    images: ['/og.jpg'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={inter.variable} suppressHydrationWarning>
      <body className="antialiased font-sans">
        <FeedbackProvider>{children}</FeedbackProvider>
      </body>
    </html>
  );
}
```

`suppressHydrationWarning` no `<html>` é necessário porque a Task 3 (tema
claro/escuro) altera a classe do `<html>` no cliente antes da hidratação;
sem essa prop o React acusa um warning de mismatch inofensivo.

Se o `@theme`/`:root` gerado pelo CLI já define `--font-sans` para outra
coisa, garanta que a variável `--font-sans` do `next/font` (`inter.variable`)
seja a que o Tailwind resolve para a classe `font-sans` — normalmente o
próprio `@theme` do shadcn já mapeia `--font-sans: var(--font-sans)` por
convenção; confirme visualmente no Step 4 que o texto renderiza em Inter e
não em Arial.

- [x] **Step 3: Verificar tipos e build**

Run: `pnpm typecheck && pnpm build`

Expected: ambos saem com código 0.

- [ ] **Step 4: Verificação manual**

Run: `pnpm dev`, abra `http://localhost:3000` no navegador.

Expected: a página (ainda com o CSS legado por cima) renderiza com a fonte
Inter em vez de Arial (dá pra notar pela forma das letras — Inter tem
"a" de caixa dupla e traços mais uniformes que Arial). Abra o DevTools,
rode `getComputedStyle(document.body).fontFamily` no console e confirme
que começa com `"Inter"` (ou o nome da variável CSS `var(--font-sans)`
resolvida para o font-family injetado pelo `next/font`).

- [x] **Step 5: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "feat: apply brand purple tokens and Inter font"
```

---

### Task 3: Alternância de tema claro/escuro

**Files:**

- Create: `components/theme-provider.tsx`, `components/theme-toggle.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**

- Consumes: `--primary`/tokens de tema da Task 2.
- Produces: `<ThemeProvider>` (wrapper de `next-themes`) e
  `<ThemeToggle />` (botão que alterna claro/escuro/sistema), reutilizável
  por qualquer tela a partir daqui.

- [x] **Step 1: Instalar `next-themes`**

```bash
pnpm add next-themes
```

- [x] **Step 2: Criar o provider de tema**

Create `components/theme-provider.tsx`:

```tsx
'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ComponentProps } from 'react';

export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem {...props}>
      {children}
    </NextThemesProvider>
  );
}
```

- [x] **Step 3: Criar o botão de alternância**

Antes deste step, rode `pnpm dlx shadcn@latest add button dropdown-menu` se
ainda não tiver feito (necessário para o próximo componente — pode já ter
sido feito na Task 4/6; se `components/ui/button.tsx` e
`components/ui/dropdown-menu.tsx` já existirem, pule a instalação).

Create `components/theme-toggle.tsx`:

```tsx
'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function ThemeToggle() {
  const { setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Alternar tema">
          <Sun className="h-4 w-4 scale-100 dark:scale-0" />
          <Moon className="absolute h-4 w-4 scale-0 dark:scale-100" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')}>Claro</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>Escuro</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>Sistema</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [x] **Step 4: Envolver o app com o provider**

Em `app/layout.tsx`, importe `ThemeProvider` e envolva `FeedbackProvider`:

```tsx
import { ThemeProvider } from '@/components/theme-provider';
// ...
<body className="antialiased font-sans">
  <ThemeProvider>
    <FeedbackProvider>{children}</FeedbackProvider>
  </ThemeProvider>
</body>;
```

- [x] **Step 5: Verificar tipos e build**

Run: `pnpm typecheck && pnpm build`

Expected: ambos saem com código 0.

- [ ] **Step 6: Verificação manual de persistência**

Run: `pnpm dev`. No navegador, abra o DevTools console e rode
`document.documentElement.className` — confirme que existe uma classe
`light` ou `dark`. Alterne pelo botão (ainda sem estar visível em nenhuma
tela real — teste montando `<ThemeToggle />` temporariamente em
`app/layout.tsx` ou aguarde a Task 6, que o coloca na sidebar de verdade).
Recarregue a página (F5): a classe deve continuar a mesma escolhida, não
voltar para o padrão do sistema — isso confirma que `next-themes` está
persistindo em `localStorage` (chave `theme`).

- [x] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml components/theme-provider.tsx components/theme-toggle.tsx app/layout.tsx
git commit -m "feat: add light/dark theme toggle"
```

---

### Task 4: Restilizar o sistema de feedback (toast + confirmação)

**Files:**

- Modify: `components/feedback.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**

- Consumes: `Button` (shadcn), `Sonner`/`toast` (shadcn), `AlertDialog`
  (shadcn).
- Produces: nenhuma mudança de interface — `useFeedback()` continua
  exportando `{ notify(message, tone?), confirm(message): Promise<boolean> }`
  exatamente como antes; todo consumidor existente continua funcionando sem
  alteração.

- [x] **Step 1: Instalar os componentes shadcn necessários**

```bash
pnpm dlx shadcn@latest add sonner alert-dialog button
```

- [x] **Step 2: Reescrever `components/feedback.tsx`**

```tsx
'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type NoticeTone = 'info' | 'success' | 'error';
type PendingConfirmation = {
  message: string;
  resolve: (confirmed: boolean) => void;
};
type FeedbackContextValue = {
  notify: (message: string, tone?: NoticeTone) => void;
  confirm: (message: string) => Promise<boolean>;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const pendingQueue = useRef<PendingConfirmation[]>([]);

  const notify = useCallback((message: string, tone: NoticeTone = 'info') => {
    if (tone === 'success') toast.success(message);
    else if (tone === 'error') toast.error(message);
    else toast(message);
  }, []);

  const showNext = useCallback(() => {
    const next = pendingQueue.current.shift();
    setPending(next ?? null);
  }, []);

  const confirm = useCallback(
    (message: string) =>
      new Promise<boolean>((resolve) => {
        const entry = { message, resolve };
        if (pending) {
          pendingQueue.current.push(entry);
          return;
        }
        setPending(entry);
      }),
    [pending],
  );

  const resolveConfirmation = useCallback(
    (confirmed: boolean) => {
      pending?.resolve(confirmed);
      showNext();
    },
    [pending, showNext],
  );

  return (
    <FeedbackContext.Provider value={{ notify, confirm }}>
      {children}
      <Toaster richColors closeButton />
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => !open && resolveConfirmation(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirme esta ação</AlertDialogTitle>
            <AlertDialogDescription>{pending?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => resolveConfirmation(false)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => resolveConfirmation(true)}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error('useFeedback precisa estar dentro de FeedbackProvider.');
  return context;
}
```

A fila (`pendingQueue`) resolve o item do "Review Focus": duas chamadas de
`confirm()` em sequência antes da primeira ser respondida agora enfileiram
a segunda em vez de perdê-la ou sobrescrever a primeira.

- [x] **Step 3: Verificar tipos e build**

Run: `pnpm typecheck && pnpm build`

Expected: ambos saem com código 0. Nenhum outro arquivo deveria precisar
mudar — todo consumidor de `useFeedback()` usa só `notify`/`confirm`.

- [ ] **Step 4: Teste manual de fila de confirmação**

Run: `pnpm dev`, entre com um usuário de teste, vá a uma tela com dois
botões de exclusão visíveis ao mesmo tempo (ex.: lista de clientes com 2+
registros). Clique em "excluir" no primeiro registro, e sem responder,
clique em "excluir" no segundo. Confirme visualmente: o segundo diálogo só
aparece depois de você responder (confirmar ou cancelar) o primeiro, e a
mensagem do segundo diálogo corresponde ao segundo registro (não ao
primeiro).

Em seguida, force um toast de erro (ex.: tente salvar um formulário com um
campo obrigatório vazio, ou desconecte a rede e tente qualquer ação) e
confirme que o texto do toast é legível — repita alternando para o tema
escuro (Task 3) antes de disparar o mesmo erro de novo. `richColors` do
Sonner já ajusta automaticamente a cor de fundo do toast de erro por tema;
esta checagem é só para confirmar visualmente, não exige mudança de
código se já estiver legível.

- [x] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml components/feedback.tsx components/ui/sonner.tsx components/ui/alert-dialog.tsx components/ui/button.tsx
git commit -m "refactor: restyle feedback toasts and confirmation with shadcn"
```

---

### Task 5: Restilizar a tela de login

**Files:**

- Modify: `components/login.tsx`

**Interfaces:**

- Consumes: `Card`, `Input`, `Label`, `Button` (shadcn).
- Produces: nenhuma mudança de interface — `Login({ onLogin })` continua
  com a mesma prop.

- [x] **Step 1: Instalar os componentes shadcn necessários**

```bash
pnpm dlx shadcn@latest add card input label
```

- [x] **Step 2: Reescrever `components/login.tsx`**

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { PublicAccount } from '@/lib/types';

export default function Login({ onLogin }: { onLogin: (account: PublicAccount) => void }) {
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [forgot, setForgot] = useState(false),
    [notice, setNotice] = useState(''),
    [showPassword, setShowPassword] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    setNotice('');
    const f = new FormData(e.currentTarget);
    try {
      const r = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: forgot ? 'forgot-password' : 'login',
          username: f.get('username'),
          ...(!forgot ? { password: f.get('password') } : {}),
        }),
      });
      const x = await r.json();
      if (!r.ok) throw new Error(x.error || 'Não foi possível continuar.');
      if (forgot) setNotice(x.message);
      else onLogin(x.account);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha na conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <form onSubmit={submit}>
          <CardHeader className="gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">
                R
              </span>
              <div>
                <h1 className="text-lg font-semibold leading-none">ReparoSM</h1>
                <p className="text-sm text-muted-foreground">Repair System Master</p>
              </div>
            </div>
            <div>
              <h2 className="text-base font-medium">
                {forgot ? 'Esqueci minha senha' : 'Entre na sua assistência'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {forgot
                  ? 'Informe seu usuário para solicitar uma nova senha ao administrador.'
                  : 'Cada loja possui uma conta e dados separados.'}
              </p>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="login-username">Usuário</Label>
              <Input
                id="login-username"
                name="username"
                required
                minLength={3}
                maxLength={80}
                autoComplete="username"
                placeholder="Digite seu usuário"
                autoFocus
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'login-error' : undefined}
              />
            </div>
            {!forgot && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="login-password">Senha</Label>
                <div className="relative">
                  <Input
                    id="login-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    placeholder="Digite sua senha"
                    className="pr-10"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? 'login-error' : undefined}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                    aria-controls="login-password"
                    aria-pressed={showPassword}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}
            {error && (
              <p id="login-error" className="text-sm font-medium text-destructive" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p id="login-notice" className="text-sm text-muted-foreground" role="status">
                {notice}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Aguarde...' : forgot ? 'Solicitar ao administrador' : 'Entrar no sistema'}
            </Button>
            <button
              type="button"
              className="text-sm text-muted-foreground underline-offset-2 hover:underline disabled:opacity-60"
              disabled={loading}
              onClick={() => {
                setForgot(!forgot);
                setError('');
                setNotice('');
              }}
            >
              {forgot ? 'Voltar ao login' : 'Esqueci minha senha'}
            </button>
            <small className="text-xs text-muted-foreground">
              {forgot
                ? 'Sua senha só será alterada pelo administrador após confirmar sua identidade.'
                : 'A sessão expira automaticamente após 12 horas.'}
            </small>
          </CardContent>
        </form>
      </Card>
    </main>
  );
}
```

- [x] **Step 3: Verificar tipos e build**

Run: `pnpm typecheck && pnpm build`

Expected: ambos saem com código 0.

- [ ] **Step 4: Verificação manual do fluxo completo**

Run: `pnpm dev`, abra `/login`.
Expected, em sequência: (1) autofoco no campo usuário ao carregar; (2)
digitar usuário/senha incorretos mostra o erro em vermelho; (3) o ícone de
olho alterna a visibilidade da senha; (4) "Esqueci minha senha" troca pro
formulário de recuperação e volta; (5) login com as credenciais válidas
(`adminreparosm` / a senha do seu `.env` local) navega para `/ordens`.
Repita alternando o tema (claro/escuro, via o toggle temporário da Task 3
ou definitivo da Task 6) e confirme que o texto continua legível nos dois.

- [x] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml components/login.tsx components/ui/card.tsx components/ui/input.tsx components/ui/label.tsx
git commit -m "refactor: restyle login screen with shadcn primitives"
```

---

### Task 6: Restilizar a casca do painel (sidebar + layout)

**Files:**

- Modify: `app/(painel)/layout.tsx`, `components/sidebar-nav.tsx`,
  `components/logout-button.tsx`

**Interfaces:**

- Consumes: `Button`, `Separator`, `ThemeToggle` (Task 3).
- Produces: nenhuma mudança de interface — `SidebarNav({ isAdmin })` e
  `LogoutButton()` continuam com a mesma assinatura.

- [x] **Step 1: Instalar o componente shadcn necessário**

```bash
pnpm dlx shadcn@latest add separator
```

- [x] **Step 2: Reescrever `components/sidebar-nav.tsx`**

```tsx
'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type NavItem = { href: string; label: string; icon: string };
type NavGroup = { label: string; items: NavItem[] };

const primary: NavItem[] = [
  { href: '/', label: 'Início', icon: '▦' },
  { href: '/mesa', label: 'Mesa', icon: '☷' },
  { href: '/ordens', label: 'Ordens', icon: '⚒' },
  { href: '/clientes', label: 'Clientes', icon: '◌' },
];

const groups = (isAdmin: boolean): NavGroup[] => [
  {
    label: 'Trabalho',
    items: [
      primary[0],
      primary[1],
      primary[2],
      { href: '/orcamentos', label: 'Orçamentos', icon: '▤' },
    ],
  },
  {
    label: 'Catálogo',
    items: [
      { href: '/estoque', label: 'Estoque e vitrine', icon: '◇' },
      { href: '/peliculas', label: 'Películas', icon: '▯' },
    ],
  },
  {
    label: 'Relacionamento',
    items: [
      primary[3],
      { href: '/pos-venda', label: 'Pós-venda', icon: '✉' },
      { href: '/garantias', label: 'Garantias', icon: '◉' },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { href: '/pagamentos', label: 'Pagamentos', icon: '↗' },
      { href: '/minha-assistencia', label: 'Minha assistência', icon: '⚙' },
      { href: '/dados', label: 'Dados e exportação', icon: '⇩' },
      ...(isAdmin ? [{ href: '/contas', label: 'Contas de lojistas', icon: '♙' }] : []),
    ],
  },
  {
    label: 'Ajuda',
    items: [
      { href: '/assistente', label: 'Assistente', icon: '✦' },
      { href: '/suporte', label: 'Tutoriais e suporte', icon: '?' },
    ],
  },
];

const isActive = (pathname: string, href: string) =>
  href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

function Item({ item, pathname, close }: { item: NavItem; pathname: string; close?: () => void }) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
        active && 'bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary',
      )}
      href={item.href}
      aria-current={active ? 'page' : undefined}
      onClick={close}
    >
      <span aria-hidden="true">{item.icon}</span>
      {item.label}
    </Link>
  );
}

export default function SidebarNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const allGroups = groups(isAdmin);
  const secondary = allGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => !primary.includes(item)) }))
    .filter((group) => group.items.length);
  const moreActive = secondary.some((group) =>
    group.items.some((item) => isActive(pathname, item.href)),
  );

  return (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto" aria-label="Navegação principal">
      <div className="hidden flex-col gap-4 md:flex">
        {allGroups.map((group) => (
          <div className="flex flex-col gap-1" key={group.label}>
            <span className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
              {group.label}
            </span>
            {group.items.map((item) => (
              <Item item={item} pathname={pathname} key={item.href} />
            ))}
          </div>
        ))}
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t bg-background p-2 md:hidden">
        {primary.map((item) => (
          <Item item={item} pathname={pathname} key={item.href} close={() => setMoreOpen(false)} />
        ))}
        <button
          className={cn(
            'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground',
            moreActive && 'text-primary',
          )}
          type="button"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
        >
          <span aria-hidden="true">☰</span>
          Mais
        </button>
      </div>
      {moreOpen && (
        <div className="fixed inset-x-0 bottom-14 z-40 max-h-[60vh] overflow-y-auto rounded-t-lg border bg-background p-3 shadow-lg md:hidden">
          {secondary.map((group) => (
            <div className="flex flex-col gap-1" key={group.label}>
              <span className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                {group.label}
              </span>
              {group.items.map((item) => (
                <Item
                  item={item}
                  pathname={pathname}
                  key={item.href}
                  close={() => setMoreOpen(false)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </nav>
  );
}
```

- [x] **Step 3: Reescrever `components/logout-button.tsx`**

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function LogoutButton() {
  const router = useRouter();
  const logout = async () => {
    await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    });
    router.replace('/login');
    router.refresh();
  };
  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start gap-2"
      onClick={() => void logout()}
    >
      <LogOut className="h-4 w-4" />
      Sair da conta
    </Button>
  );
}
```

- [x] **Step 4: Reescrever `app/(painel)/layout.tsx`**

```tsx
import LogoutButton from '@/components/logout-button';
import SidebarNav from '@/components/sidebar-nav';
import { ThemeToggle } from '@/components/theme-toggle';
import { Separator } from '@/components/ui/separator';
import { requireServerAccount } from '@/lib/server-auth';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const account = await requireServerAccount();
  const initials = String(account.name || account.username)
    .slice(0, 2)
    .toUpperCase();
  return (
    <main className="flex min-h-svh">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-background p-4 md:flex">
        <div className="flex items-center gap-3 px-2 pb-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">
            R
          </span>
          <div>
            <strong className="block text-sm font-semibold leading-none">ReparoSM</strong>
            <small className="text-xs text-muted-foreground">Repair System Master</small>
          </div>
        </div>
        <Separator className="mb-4" />
        <SidebarNav isAdmin={account.role === 'admin'} />
        <Separator className="my-4" />
        <div className="flex items-center justify-between gap-2 px-2">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
              {initials}
            </span>
            <div className="overflow-hidden">
              <strong className="block truncate text-sm font-medium leading-none">
                {account.name}
              </strong>
              <small className="text-xs text-muted-foreground">
                {account.role === 'admin' ? 'Administrador' : 'Lojista'}
              </small>
            </div>
          </div>
          <ThemeToggle />
        </div>
        <LogoutButton />
      </aside>
      <section className="flex-1 overflow-y-auto pb-20 md:pb-0">{children}</section>
      <div className="md:hidden">
        <SidebarNav isAdmin={account.role === 'admin'} />
      </div>
    </main>
  );
}
```

Nota: `SidebarNav` renderiza tanto a navegação desktop (`hidden md:flex`
dentro dela mesma) quanto a mobile (`fixed ... md:hidden`); por isso ela
aparece nos dois lugares do JSX acima — cada instância só desenha a parte
relevante pro tamanho de tela atual, sem duplicar o menu visível.

- [x] **Step 5: Verificar tipos e build**

Run: `pnpm typecheck && pnpm build`

Expected: ambos saem com código 0.

- [ ] **Step 6: Verificação manual em desktop e mobile**

Run: `pnpm dev`, logue como lojista e como admin (dois usuários diferentes,
ou o mesmo alternando). Expected: (1) desktop (≥768px) mostra a sidebar
fixa à esquerda com todos os grupos; (2) admin vê o item extra "Contas de
lojistas", lojista não; (3) redimensione pra <768px (ou DevTools modo
mobile): a sidebar desktop some, aparece a barra inferior com os 4 itens
principais + "Mais"; (4) clicar em "Mais" abre o menu com os grupos
secundários, e clicar em qualquer item fecha o menu e navega; (5) o botão
de tema na sidebar (desktop) alterna claro/escuro e persiste ao recarregar;
(6) "Sair da conta" desloga e volta pra `/login`.

- [x] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml components/sidebar-nav.tsx components/logout-button.tsx "app/(painel)/layout.tsx" components/ui/separator.tsx
git commit -m "refactor: restyle panel shell, sidebar and logout with shadcn"
```

---

### Task 7: Primitivos locais `PageHeader` e `EmptyState`

**Files:**

- Create: `components/ui/page-header.tsx`, `components/ui/empty-state.tsx`

**Interfaces:**

- Produces: `<PageHeader title, description?, action? />` e
  `<EmptyState title, description?, action? />`, para uso nas Fases 2-4
  (nenhuma tela é migrada para eles nesta fase — só ficam prontos).

- [x] **Step 1: Escrever o teste de import/tipo (smoke test)**

Create `tests/ui-primitives.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import PageHeader from '../components/ui/page-header.tsx';
import EmptyState from '../components/ui/empty-state.tsx';

test('PageHeader renders title, description and action', () => {
  const html = renderToStaticMarkup(
    createElement(PageHeader, {
      title: 'Ordens',
      description: 'Gerencie as OS da loja',
      action: createElement('button', null, 'Nova OS'),
    }),
  );
  assert.match(html, /Ordens/);
  assert.match(html, /Gerencie as OS da loja/);
  assert.match(html, /Nova OS/);
});

test('EmptyState renders title without description when omitted', () => {
  const html = renderToStaticMarkup(createElement(EmptyState, { title: 'Nada por aqui' }));
  assert.match(html, /Nada por aqui/);
});
```

- [x] **Step 2: Rodar e confirmar que falha (arquivos ainda não existem)**

Run: `node --import ./tests/support/setup.mjs --test tests/ui-primitives.test.mjs`

Expected: FAIL com erro de módulo não encontrado
(`components/ui/page-header.tsx`/`empty-state.tsx`).

- [x] **Step 3: Implementar `components/ui/page-header.tsx`**

```tsx
import type { ReactNode } from 'react';

export default function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 pb-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
```

- [x] **Step 4: Implementar `components/ui/empty-state.tsx`**

```tsx
import type { ReactNode } from 'react';

export default function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
```

- [x] **Step 5: Rodar o teste de novo**

Run: `node --import ./tests/support/setup.mjs --test tests/ui-primitives.test.mjs`

Expected: PASS, 2 testes.

- [ ] **Step 6: Rodar a suíte completa**

Run: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`

Expected: tudo verde.

- [x] **Step 7: Commit**

```bash
git add tests/ui-primitives.test.mjs components/ui/page-header.tsx components/ui/empty-state.tsx
git commit -m "feat: add PageHeader and EmptyState primitives for later phases"
```

---

### Task 8: Fechamento da fase — verificação completa e `graft`

**Files:**

- Inspect: todos os arquivos tocados nas Tasks 1-7

- [x] **Step 1: Rodar a suíte completa uma última vez**

Run: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`

Expected: tudo verde. Se `pnpm test` tiver sido rodado sem `DATABASE_URL`,
rode também com a variável apontando pro Postgres local
(`postgres://postgres:postgres@127.0.0.1:5432/postgres`, como usado nas
fases anteriores desta sessão) pra cobrir os testes de banco.

- [x] **Step 2: Atualizar o grafo do Graft**

Run: `pnpm exec graft build && pnpm exec graft check`

Expected: `graph check: OK`.

- [x] **Step 3: Checagem visual final nas duas telas desta fase**

Feito em sessão seguinte via Playwright headless (login, ordens, mobile,
claro/escuro — screenshots reais). Achado durante a checagem: o import do
Tailwind gerado nesta execução tinha `theme.css` + `utilities.css` mas
faltava `preflight.css` (o reset de base), então qualquer `<button>` sem
o componente `Button` do shadcn (ex.: "Esqueci minha senha" do login, os
botões WhatsApp/Editar/Excluir da tabela de OS) mantinha a aparência
padrão do navegador — visualmente parecia "desabilitado" ao lado dos
botões shadcn corretos. Corrigido adicionando
`@import 'tailwindcss/preflight.css' layer(base);` em `app/globals.css`
(commit `dd43f04`); reverificado visualmente que a correção não regride
as telas ainda não migradas (Mesa, Dashboard).

- [x] **Step 4: Push e abertura do PR**

```bash
git push -u origin "$(git branch --show-current)"
gh pr create --title "feat: fundação do redesenho visual (Tailwind v4 + shadcn/ui)" --body "Fase 1 do redesenho visual descrito em docs/superpowers/specs/2026-09-27-visual-redesign-design.md: instala Tailwind v4 + shadcn/ui, aplica tokens de marca (roxo) e tema claro/escuro, e migra layout raiz, sidebar, login e sistema de feedback. Nenhuma regra de negócio muda."
```

Aguarde o CI passar antes de mesclar (mesmo fluxo já usado nesta sessão
para a PR #27).
