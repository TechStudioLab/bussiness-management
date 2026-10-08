import { useSearchParams } from 'react-router';
import { BarChart3, CheckCircle2, FileSpreadsheet, MailCheck } from 'lucide-react';
import { BrandMark } from '@/components/Layout';
import { PrefsBar } from '@/components/Preferences';
import { Notice } from '@/components/ui';
import { useI18n, type MessageKey } from '@/i18n';

const errors: Record<string, MessageKey> = {
  not_member: 'login.error.not_member',
  expired: 'login.error.expired',
  cancelled: 'login.error.cancelled',
  access_denied: 'login.error.cancelled',
  unverified: 'login.error.unverified',
  token: 'login.error.google',
  userinfo: 'login.error.google',
  session: 'login.error.session'
};

const GoogleMark = () => (
  <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

export const LoginPage = () => {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const error = params.get('error');
  const next = params.get('next') ?? '/';
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const features = [
    { icon: FileSpreadsheet, text: t('login.feature1') },
    { icon: MailCheck, text: t('login.feature2') },
    { icon: BarChart3, text: t('login.feature3') }
  ];
  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-[#13151b] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-crimson/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 right-0 h-[24rem] w-[24rem] rounded-full bg-crimson/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <BrandMark />
          <span className="text-sm font-semibold tracking-tight">Tech Studio Lab</span>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold leading-tight tracking-tight">{t('login.heroTitle')}</h2>
          <p className="mt-4 text-base leading-relaxed text-white/70">{t('login.heroBody')}</p>
          <ul className="mt-8 space-y-3">
            {features.map(f => (
              <li key={f.text} className="flex items-center gap-3 text-sm text-white/85">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <f.icon className="h-4 w-4" />
                </span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/40">© Tech Studio Lab</p>
      </div>

      {/* Sign-in */}
      <div className="flex flex-col px-4 py-6 sm:px-8">
        <PrefsBar className="ml-auto gap-3" />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm animate-fade-in">
            <BrandMark className="h-12 w-12 text-sm lg:hidden" />
            <h1 className="mt-5 text-2xl font-bold tracking-tight lg:mt-0">{t('login.title')}</h1>
            <p className="mt-2 text-sm text-ink-muted">{t('login.subtitle')}</p>
            {error && (
              <Notice tone="danger" className="mt-6">
                {t(errors[error] ?? 'login.error.default')}
                {params.get('email') && <span className="mt-1 block text-xs opacity-80">{params.get('email')}</span>}
              </Notice>
            )}
            <a
              href={`/auth/login?next=${encodeURIComponent(next)}`}
              className="mt-8 flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-line bg-surface text-sm font-semibold text-ink shadow-sm transition-all hover:border-ink-muted/40 hover:shadow-card active:scale-[0.99]"
            >
              <GoogleMark />
              {t('login.google')}
            </a>
            <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-muted">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t('login.membersOnly')}
            </p>
            {local && (
              <a href={`/auth/dev?next=${encodeURIComponent(next)}`} className="mt-8 block text-center text-xs text-ink-muted underline underline-offset-2 hover:text-ink">
                {t('login.dev')}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
