import Link from 'next/link';
import LogoutButton from '@/components/logout-button';
import { requireServerAccount } from '@/lib/server-auth';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const account = await requireServerAccount();
  const initials = String(account.name || account.username)
    .slice(0, 2)
    .toUpperCase();
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">R</span>
          <div>
            <strong>ReparoSM</strong>
            <small>Repair System Master</small>
          </div>
        </div>
        <nav>
          <Link className="sidebar-link" href="/">
            <span>▦</span>
            Dashboard
          </Link>
          <Link className="sidebar-link active" href="/ordens">
            <span>⚒</span>
            Ordens de serviço
          </Link>
        </nav>
        <div className="sidebar-foot">
          <div className="profile">
            <span>{initials}</span>
            <div>
              <strong>{account.name}</strong>
              <small>{account.role === 'admin' ? 'Administrador' : 'Lojista'}</small>
            </div>
          </div>
          <LogoutButton />
        </div>
      </aside>
      <section className="workspace">{children}</section>
    </main>
  );
}
