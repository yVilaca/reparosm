import Link from 'next/link';
import LogoutButton from '@/components/logout-button';
import BrandLogo from '@/components/brand-logo';
import ProvisionalPasswordBanner from '@/components/provisional-password-banner';
import SidebarNav, { type NavAccess } from '@/components/sidebar-nav';
import { ThemeToggle } from '@/components/theme-toggle';
import { Separator } from '@/components/ui/separator';
import { initials, roleLabel } from '@/lib/user-labels';
import { requireServerAccount } from '@/lib/server-auth';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const account = await requireServerAccount();
  const { user } = account;
  const access: NavAccess =
    account.role === 'admin' ? 'admin' : user.role === 'owner' ? 'owner' : 'staff';

  return (
    <div className="flex min-h-svh bg-canvas text-foreground print:block print:min-h-0 print:bg-white print:text-black">
      {/* O menu é a superfície da marca: tinta do logo, item ativo em violeta. */}
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col bg-sidebar p-4 text-sidebar-foreground md:flex print:hidden">
        <div className="flex items-center px-2 pt-1 pb-5">
          <BrandLogo className="w-[164px]" onDark sizes="164px" />
        </div>
        <SidebarNav access={access} />
        <Separator className="my-4 bg-sidebar-border" />
        <div className="flex items-center justify-between gap-2">
          {/* Quem está usando e em qual loja; abre Minha conta. */}
          <Link
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
            href="/minha-conta"
            title="Minha conta"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
              {initials(user.name)}
            </span>
            <span className="min-w-0">
              <strong className="block truncate text-sm leading-tight font-medium">
                {user.name}
              </strong>
              <small className="block truncate text-xs text-sidebar-foreground/60">
                {account.role === 'admin'
                  ? 'Administrador'
                  : `${roleLabel(user.role)} · ${account.name}`}
              </small>
            </span>
          </Link>
          <ThemeToggle className="border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground dark:bg-transparent" />
        </div>
        <LogoutButton className="text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
      </aside>
      <section className="min-w-0 flex-1 overflow-y-auto p-4 pb-24 sm:p-6 md:p-8 md:pb-8 print:min-h-0 print:w-full print:overflow-visible print:p-0">
        {user.mustChangePassword && <ProvisionalPasswordBanner />}
        {children}
      </section>
      <div className="md:hidden print:hidden">
        <SidebarNav access={access} />
      </div>
    </div>
  );
}
