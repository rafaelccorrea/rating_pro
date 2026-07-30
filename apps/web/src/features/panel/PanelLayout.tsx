import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  ClipboardList,
  Gauge,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Sun,
  UserCircle,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { PROFILE_STATUS_LABEL } from '@rating-pro/shared';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/features/auth/AuthProvider';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/cn';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end: boolean;
}

/** Agrupar dá hierarquia à barra e separa o que é da carteira do que é da operação. */
const RESELLER_NAV: NavItem[] = [
  { to: '/painel', label: 'Visão geral', icon: LayoutDashboard, end: true },
  { to: '/painel/pedidos', label: 'Pedidos', icon: ClipboardList, end: false },
  { to: '/painel/clientes', label: 'Clientes', icon: Users, end: false },
];

const MASTER_NAV: NavItem[] = [
  { to: '/master', label: 'Fila de análise', icon: Gauge, end: true },
  { to: '/master/revendedores', label: 'Revendedores', icon: Users, end: false },
  { to: '/master/leads', label: 'Leads', icon: MessageSquare, end: false },
];

const ACCOUNT_NAV: NavItem[] = [
  { to: '/painel/perfil', label: 'Meu perfil', icon: UserCircle, end: false },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

function NavGroup({
  title,
  items,
  onNavigate,
}: {
  title?: string;
  items: NavItem[];
  onNavigate: () => void;
}) {
  return (
    <div>
      {title && (
        <p className="px-3 pb-2 text-[11px] font-semibold tracking-[0.12em] text-ink-400 uppercase">
          {title}
        </p>
      )}

      <div className="space-y-0.5">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-white text-brand-700 shadow-soft dark:bg-ink-800 dark:text-brand-300'
                  : 'text-ink-600 hover:bg-white/70 hover:text-ink-900 dark:text-ink-400 dark:hover:bg-ink-800/60 dark:hover:text-ink-100',
              )
            }
          >
            {({ isActive }) => (
              <>
                {/* Marcador vertical: sinaliza a página atual sem depender só da cor. */}
                <span
                  className={cn(
                    'absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-brand-600 transition-opacity',
                    isActive ? 'opacity-100' : 'opacity-0',
                  )}
                  aria-hidden
                />
                <Icon className="size-4 shrink-0" aria-hidden />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

export function PanelLayout() {
  const { profile, isMaster, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const close = () => setSidebarOpen(false);

  const handleSignOut = () => {
    signOut();
    navigate('/entrar', { replace: true });
  };

  return (
    <div className="min-h-dvh bg-ink-50 dark:bg-ink-950">
      {/* ---------------------------------------------------------- topbar */}
      <header className="sticky top-0 z-40 border-b border-ink-200/80 bg-white/85 backdrop-blur-xl dark:border-ink-800/80 dark:bg-ink-900/85">
        <div className="container-app flex h-16 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen((open) => !open)}
              className="-ml-2 grid size-10 place-items-center rounded-xl text-ink-600 lg:hidden dark:text-ink-300"
              aria-label={sidebarOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={sidebarOpen}
            >
              {sidebarOpen ? (
                <X className="size-5" aria-hidden />
              ) : (
                <Menu className="size-5" aria-hidden />
              )}
            </button>

            <Link to="/painel" className="text-ink-950 dark:text-white">
              <Logo textClassName="hidden sm:inline" />
            </Link>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggle}
              className="grid size-10 place-items-center rounded-xl text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800 dark:hover:bg-ink-800 dark:hover:text-ink-100"
              aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
            >
              {theme === 'dark' ? (
                <Sun className="size-5" aria-hidden />
              ) : (
                <Moon className="size-5" aria-hidden />
              )}
            </button>

            <div className="mx-1 h-6 w-px bg-ink-200 dark:bg-ink-800" aria-hidden />

            {/* Identidade compacta: avatar sempre, texto quando couber. */}
            <div className="flex items-center gap-2.5">
              <div className="hidden text-right sm:block">
                <p className="max-w-40 truncate text-sm font-medium text-ink-900 dark:text-ink-100">
                  {profile?.fullName}
                </p>
                <p className="text-xs text-ink-500">
                  {isMaster ? 'Master' : PROFILE_STATUS_LABEL[profile?.status ?? 'active']}
                </p>
              </div>

              <span
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold',
                  isMaster
                    ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white'
                    : 'bg-ink-200 text-ink-700 dark:bg-ink-800 dark:text-ink-200',
                )}
                title={profile?.fullName}
              >
                {initials(profile?.fullName ?? '?')}
              </span>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              className="grid size-10 place-items-center rounded-xl text-ink-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
              aria-label="Sair"
            >
              <LogOut className="size-5" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <div className="container-app flex gap-6 py-6 xl:gap-8">
        {/* --------------------------------------------------------- sidebar */}
        {sidebarOpen && (
          <button
            type="button"
            className="fixed inset-0 top-16 z-20 bg-ink-950/30 lg:hidden"
            onClick={close}
            aria-label="Fechar menu"
            tabIndex={-1}
          />
        )}

        <aside
          className={cn(
            'shrink-0',
            sidebarOpen
              ? 'fixed inset-y-0 top-16 left-0 z-30 w-64 overflow-y-auto border-r border-ink-200 bg-ink-50 p-4 lg:hidden dark:border-ink-800 dark:bg-ink-950'
              : 'hidden w-56 lg:block xl:w-60',
          )}
        >
          <nav aria-label="Navegação do painel" className="space-y-6 lg:sticky lg:top-24">
            <NavGroup title="Minha carteira" items={RESELLER_NAV} onNavigate={close} />
            {isMaster && <NavGroup title="Operação" items={MASTER_NAV} onNavigate={close} />}
            <NavGroup title="Conta" items={ACCOUNT_NAV} onNavigate={close} />
          </nav>
        </aside>

        <main className="min-w-0 flex-1 pb-16">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-950 dark:text-white">
          {title}
        </h1>
        {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
