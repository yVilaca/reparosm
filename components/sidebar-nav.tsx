'use client';

import {
  Bot,
  ClipboardList,
  CreditCard,
  Database,
  ArrowDownToLine,
  ArrowUpFromLine,
  Home,
  LifeBuoy,
  Mail,
  Menu,
  Package,
  Settings,
  ShieldCheck,
  Smartphone,
  Store,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';

type NavItem = { href: string; label: string; icon: LucideIcon };
type NavGroup = { label: string; items: NavItem[] };

const primary: NavItem[] = [
  { href: '/', label: 'Início', icon: Home },
  { href: '/ordens', label: 'Ordens', icon: Wrench },
  { href: '/clientes', label: 'Clientes', icon: Users },
];

const groups = (isAdmin: boolean): NavGroup[] => [
  {
    label: 'Trabalho',
    items: [
      primary[0],
      primary[1],
      { href: '/orcamentos', label: 'Orçamentos', icon: ClipboardList },
    ],
  },
  {
    label: 'Catálogo',
    items: [
      { href: '/estoque', label: 'Estoque e vitrine', icon: Package },
      { href: '/peliculas', label: 'Películas', icon: Smartphone },
    ],
  },
  {
    label: 'Relacionamento',
    items: [
      primary[2],
      { href: '/pos-venda', label: 'Pós-venda', icon: Mail },
      { href: '/garantias', label: 'Garantias', icon: ShieldCheck },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { href: '/contas-receber', label: 'Contas a receber', icon: ArrowDownToLine },
      { href: '/contas-pagar', label: 'Contas a pagar', icon: ArrowUpFromLine },
      { href: '/compras', label: 'Compras', icon: Package },
      { href: '/pagamentos', label: 'Caixa', icon: CreditCard },
      { href: '/minha-assistencia', label: 'Minha assistência', icon: Store },
      { href: '/dados', label: 'Dados e exportação', icon: Database },
      ...(isAdmin ? [{ href: '/contas', label: 'Contas de lojistas', icon: Settings }] : []),
    ],
  },
  {
    label: 'Ajuda',
    items: [
      { href: '/assistente', label: 'Assistente', icon: Bot },
      { href: '/suporte', label: 'Tutoriais e suporte', icon: LifeBuoy },
    ],
  },
];

const isActive = (pathname: string, href: string) =>
  href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

function Item({ item, pathname, close }: { item: NavItem; pathname: string; close?: () => void }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;

  return (
    <Link
      className={cn(
        'flex min-h-10 min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
        'max-md:min-h-[60px] max-md:flex-col max-md:justify-center max-md:gap-1 max-md:px-1 max-md:py-1 max-md:text-[10px]',
        active &&
          'bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary dark:hover:text-primary-foreground',
      )}
      href={item.href}
      aria-current={active ? 'page' : undefined}
      onClick={close}
    >
      <Icon className="size-4 shrink-0 max-md:size-5" aria-hidden="true" />
      <span className="truncate">{item.label}</span>
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
    <nav
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto"
      aria-label="Navegação principal"
    >
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
      <div className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 items-stretch border-t bg-background p-1 md:hidden">
        {primary.map((item) => (
          <Item item={item} pathname={pathname} key={item.href} close={() => setMoreOpen(false)} />
        ))}
        <button
          className={cn(
            'flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-lg px-1 py-1 font-sans text-[10px] font-medium text-muted-foreground',
            moreActive && 'bg-primary/10 text-primary dark:bg-primary dark:text-primary-foreground',
          )}
          type="button"
          aria-controls="mobile-more-menu"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
        >
          <Menu className="size-5" aria-hidden="true" />
          Mais
        </button>
      </div>
      {moreOpen && (
        <div
          id="mobile-more-menu"
          className="fixed inset-x-3 bottom-[4.25rem] z-40 flex max-h-[60vh] flex-col gap-4 overflow-y-auto rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg md:hidden"
        >
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
