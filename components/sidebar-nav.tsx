'use client';

import {
  Bot,
  ClipboardList,
  Columns3,
  CreditCard,
  Database,
  ArrowDownUp,
  Home,
  LifeBuoy,
  Mail,
  Menu,
  Package,
  Settings,
  ShieldCheck,
  Smartphone,
  Store,
  UserCog,
  UserRound,
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
/** O que o menu mostra: o Funcionário não vê as telas de gestão da loja. */
export type NavAccess = 'admin' | 'owner' | 'staff';

const primary: NavItem[] = [
  { href: '/', label: 'Início', icon: Home },
  { href: '/pagamentos', label: 'Venda rápida', icon: CreditCard },
  { href: '/ordens', label: 'Ordens', icon: Wrench },
  { href: '/clientes', label: 'Clientes', icon: Users },
];

const groups = (access: NavAccess): NavGroup[] => [
  {
    label: 'Trabalho',
    items: [
      primary[0],
      primary[2],
      { href: '/mesa', label: 'Mesa', icon: Columns3 },
      { href: '/orcamentos', label: 'Orçamentos', icon: ClipboardList },
    ],
  },
  {
    label: 'Vendas',
    items: [
      primary[1],
      primary[3],
      { href: '/receber-e-pagar', label: 'Financeiro', icon: ArrowDownUp },
      { href: '/pos-venda', label: 'Pós-venda', icon: Mail },
      { href: '/garantias', label: 'Garantias', icon: ShieldCheck },
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
    label: 'Gestão',
    items: [
      ...(access === 'staff'
        ? []
        : [
            { href: '/minha-assistencia', label: 'Minha assistência', icon: Store },
            { href: '/equipe', label: 'Equipe', icon: UserCog },
            { href: '/dados', label: 'Dados e exportação', icon: Database },
          ]),
      { href: '/minha-conta', label: 'Minha conta', icon: UserRound },
      ...(access === 'admin' ? [{ href: '/contas', label: 'Lojas', icon: Settings }] : []),
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
        'flex min-h-10 min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none',
        'max-md:min-h-[60px] max-md:flex-col max-md:justify-center max-md:gap-1 max-md:px-1 max-md:py-1 max-md:text-[10px]',
        // Ativo: pílula violeta da marca sobre a tinta.
        active &&
          'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm hover:bg-sidebar-primary hover:text-sidebar-primary-foreground',
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

export default function SidebarNav({ access }: { access: NavAccess }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const allGroups = groups(access);
  const secondary = allGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => !primary.includes(item)) }))
    .filter((group) => group.items.length);
  const moreActive = secondary.some((group) =>
    group.items.some((item) => isActive(pathname, item.href)),
  );

  return (
    <nav
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto [scrollbar-color:rgb(255_255_255/0.18)_transparent] [scrollbar-width:thin]"
      aria-label="Navegação principal"
    >
      <div className="hidden flex-col gap-4 md:flex">
        {allGroups.map((group) => (
          <div className="flex flex-col gap-1" key={group.label}>
            <span className="px-3 pb-0.5 text-xs font-medium text-sidebar-foreground/45">
              {group.label}
            </span>
            {group.items.map((item) => (
              <Item item={item} pathname={pathname} key={item.href} />
            ))}
          </div>
        ))}
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-stretch bg-sidebar p-1 text-sidebar-foreground md:hidden">
        {primary.map((item) => (
          <Item item={item} pathname={pathname} key={item.href} close={() => setMoreOpen(false)} />
        ))}
        <button
          className={cn(
            'flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-lg px-1 py-1 font-sans text-[10px] font-medium text-sidebar-foreground/70',
            moreActive && 'bg-sidebar-primary text-sidebar-primary-foreground',
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
          className="fixed inset-x-3 bottom-[4.25rem] z-40 flex max-h-[60vh] flex-col gap-4 overflow-y-auto rounded-xl bg-sidebar p-3 text-sidebar-foreground shadow-lg ring-1 ring-sidebar-border md:hidden"
        >
          {secondary.map((group) => (
            <div className="flex flex-col gap-1" key={group.label}>
              <span className="px-3 pb-0.5 text-xs font-medium text-sidebar-foreground/45">
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
