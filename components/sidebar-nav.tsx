'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';

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
      className={`sidebar-link${active ? ' active' : ''}`}
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
    <nav className="sidebar-navigation" aria-label="Navegação principal">
      <div className="sidebar-desktop-nav">
        {allGroups.map((group) => (
          <div className="sidebar-group" key={group.label}>
            <span className="sidebar-group-label">{group.label}</span>
            {group.items.map((item) => (
              <Item item={item} pathname={pathname} key={item.href} />
            ))}
          </div>
        ))}
      </div>
      <div className="sidebar-mobile-nav">
        {primary.map((item) => (
          <Item item={item} pathname={pathname} key={item.href} close={() => setMoreOpen(false)} />
        ))}
        <button
          className={`sidebar-link sidebar-more-button${moreActive ? ' active' : ''}`}
          type="button"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
        >
          <span aria-hidden="true">☰</span>
          Mais
        </button>
      </div>
      {moreOpen && (
        <div className="sidebar-more-menu">
          {secondary.map((group) => (
            <div className="sidebar-group" key={group.label}>
              <span className="sidebar-group-label">{group.label}</span>
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
