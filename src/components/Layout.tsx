import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Activity, FileSpreadsheet, FileText, LayoutDashboard, List, LogOut, Mail, Menu, Settings, X } from 'lucide-react';
import type { Me } from '@shared/types';
import { useI18n, type MessageKey } from '@/i18n';
import { api, fetchers, keys } from '@/lib/api';
import { LanguageSwitch, PrefsBar } from './Preferences';
import { cn } from './ui';

const groups: { label: MessageKey; items: { to: string; label: MessageKey; icon: typeof List; end?: boolean; badge?: 'unmatched' }[] }[] = [
  {
    label: 'nav.groupWork',
    items: [
      { to: '/', label: 'nav.dashboard', icon: LayoutDashboard, end: true },
      { to: '/sites', label: 'nav.sites', icon: List },
      { to: '/replies', label: 'nav.replies', icon: Mail, badge: 'unmatched' },
      { to: '/import', label: 'nav.import', icon: FileSpreadsheet }
    ]
  },
  {
    label: 'nav.groupManage',
    items: [
      { to: '/templates', label: 'nav.templates', icon: FileText },
      { to: '/activity', label: 'nav.activity', icon: Activity },
      { to: '/settings', label: 'nav.settings', icon: Settings }
    ]
  }
];

export const BrandMark = ({ className }: { className?: string }) => (
  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-crimson to-crimson-dark text-xs font-bold tracking-tight text-white shadow-sm shadow-crimson/30', className)}>
    TS
  </span>
);

const Brand = () => {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark />
      <span className="leading-tight">
        <span className="block text-sm font-bold text-ink">Tech Studio Lab</span>
        <span className="block text-xs text-ink-muted">{t('app.brandSub')}</span>
      </span>
    </div>
  );
};

const logout = async () => {
  await api.post('/auth/logout').catch(() => undefined);
  location.assign('/login');
};

const NavItems = ({ onNavigate }: { onNavigate?: () => void }) => {
  const { t } = useI18n();
  const stats = useQuery({ queryKey: keys.stats(30), queryFn: () => fetchers.stats(30), refetchInterval: 30_000 });
  const unmatched = stats.data?.totals.unmatched ?? 0;
  return (
    <nav className="flex flex-col gap-5">
      {groups.map(g => (
        <div key={g.label}>
          <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-muted/80">{t(g.label)}</p>
          <div className="flex flex-col gap-0.5">
            {g.items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-ink-soft hover:bg-paper hover:text-ink'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-crimson" />}
                    <item.icon className={cn('h-4 w-4 transition-colors', isActive ? 'text-crimson' : 'text-ink-muted group-hover:text-ink-soft')} />
                    <span className="flex-1">{t(item.label)}</span>
                    {item.badge && unmatched > 0 && <span className="tabular min-w-[20px] rounded-full bg-crimson px-1.5 text-center text-[11px] font-semibold leading-5 text-white">{unmatched}</span>}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
};

const UserBox = ({ me }: { me: Me }) => {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface p-2.5 shadow-sm">
      {me.picture ? (
        <img src={me.picture} alt="" className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />
      ) : (
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-crimson-soft text-xs font-semibold text-crimson-fg">{(me.name || me.email)[0]?.toUpperCase()}</span>
      )}
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-xs font-semibold">{me.name || me.email}</span>
        <span className="block text-xs text-ink-muted">{me.role === 'owner' ? t('role.owner') : t('role.agent')}</span>
      </span>
      <button onClick={logout} className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-paper hover:text-ink" title={t('nav.logout')} aria-label={t('nav.logout')}>
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
};

const SidebarBody = ({ me, onNavigate }: { me: Me; onNavigate?: () => void }) => (
  <>
    <div className="scrollbar-thin flex-1 overflow-y-auto">
      <NavItems onNavigate={onNavigate} />
    </div>
    <div className="space-y-3">
      <PrefsBar className="px-1" />
      <UserBox me={me} />
    </div>
  </>
);

export const Layout = ({ me, children }: { me: Me; children: ReactNode }) => {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col gap-6 border-r border-line bg-sidebar px-3 py-5 lg:flex">
        <div className="px-2">
          <Brand />
        </div>
        <SidebarBody me={me} />
      </aside>

      {/* Mobile top bar + drawer */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-line bg-surface/90 px-4 backdrop-blur lg:hidden">
        <Brand />
        <div className="flex items-center gap-1">
          <LanguageSwitch size="sm" />
          <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-ink-soft hover:bg-paper" aria-label={t('nav.menu')}>
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-y-0 right-0 flex w-72 animate-fade-in flex-col gap-6 border-l border-line bg-sidebar px-3 py-4 shadow-pop" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-2">
              <Brand />
              <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 hover:bg-paper" aria-label={t('common.close')}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <SidebarBody me={me} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <main key={pathname.split('/')[1]} className="mx-auto max-w-[1320px] animate-fade-in px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        {children}
      </main>
    </div>
  );
};
