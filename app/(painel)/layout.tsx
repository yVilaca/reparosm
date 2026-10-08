import LogoutButton from '@/components/logout-button';
import BrandLogo from '@/components/brand-logo';
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
    <div className="flex min-h-svh bg-canvas text-foreground print:block print:min-h-0 print:bg-white print:text-black">
      {/* O menu é a superfície da marca: tinta do logo, item ativo em violeta. */}
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col bg-sidebar p-4 text-sidebar-foreground md:flex print:hidden">
        <div className="flex items-center px-2 pt-1 pb-5">
          <BrandLogo className="w-[164px]" onDark sizes="164px" />
        </div>
        <SidebarNav isAdmin={account.role === 'admin'} />
        <Separator className="my-4 bg-sidebar-border" />
        <div className="flex items-center justify-between gap-2 px-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
              {initials}
            </span>
            <div className="min-w-0">
              <strong className="block truncate text-sm font-medium leading-none">
                {account.name}
              </strong>
              <small className="text-xs text-sidebar-foreground/60">
                {account.role === 'admin' ? 'Administrador' : 'Lojista'}
              </small>
            </div>
          </div>
          <ThemeToggle className="border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground dark:bg-transparent" />
        </div>
        <LogoutButton className="text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
      </aside>
      <section className="min-w-0 flex-1 overflow-y-auto p-4 pb-24 sm:p-6 md:p-8 md:pb-8 print:min-h-0 print:w-full print:overflow-visible print:p-0">
        {children}
      </section>
      <div className="md:hidden print:hidden">
        <SidebarNav isAdmin={account.role === 'admin'} />
      </div>
    </div>
  );
}
