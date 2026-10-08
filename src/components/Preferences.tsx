import { Languages, Monitor, Moon, Sun } from 'lucide-react';
import { locales, useI18n, type Locale } from '@/i18n';
import { useTheme, type ThemePref } from '@/lib/theme';
import { Segmented, cn } from './ui';

// Language: 日本語 / EN
export const LanguageSwitch = ({ size = 'md', className }: { size?: 'sm' | 'md'; className?: string }) => {
  const { locale, setLocale, t } = useI18n();
  return (
    <Segmented<Locale>
      size={size}
      className={className}
      value={locale}
      onChange={setLocale}
      options={locales.map(l => ({ value: l.key, label: size === 'sm' ? l.short : l.label, title: `${t('prefs.language')}: ${l.label}` }))}
    />
  );
};

// Theme: light / dark / follow the system
export const ThemeSwitch = ({ size = 'md', labels, className }: { size?: 'sm' | 'md'; labels?: boolean; className?: string }) => {
  const { pref, setPref } = useTheme();
  const { t } = useI18n();
  const opts: { value: ThemePref; icon: typeof Sun; label: string }[] = [
    { value: 'light', icon: Sun, label: t('prefs.light') },
    { value: 'dark', icon: Moon, label: t('prefs.dark') },
    { value: 'system', icon: Monitor, label: t('prefs.system') }
  ];
  return (
    <Segmented<ThemePref>
      size={size}
      className={className}
      value={pref}
      onChange={setPref}
      options={opts.map(o => ({
        value: o.value,
        title: `${t('prefs.theme')}: ${o.label}`,
        label: (
          <>
            <o.icon className="h-3.5 w-3.5" />
            {labels && o.label}
          </>
        )
      }))}
    />
  );
};

// Compact row for the sidebar and the login page
export const PrefsBar = ({ className }: { className?: string }) => (
  <div className={cn('flex items-center justify-between gap-2', className)}>
    <span className="flex items-center gap-1.5">
      <Languages className="h-4 w-4 text-ink-muted" aria-hidden="true" />
      <LanguageSwitch size="sm" />
    </span>
    <ThemeSwitch size="sm" />
  </div>
);
