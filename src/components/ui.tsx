import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown, Loader2, X } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useI18n } from '@/i18n';

export const cn = (...a: Parameters<typeof clsx>) => twMerge(clsx(...a));

export const Card = ({ className, children, title, action, icon }: { className?: string; children: ReactNode; title?: ReactNode; action?: ReactNode; icon?: ReactNode }) => (
  <section className={cn('rounded-2xl border border-line bg-surface shadow-card', className)}>
    {(title || action) && (
      <header className="flex min-h-[52px] items-center justify-between gap-3 border-b border-line-soft px-5 py-3">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
          {icon && <span className="text-ink-muted">{icon}</span>}
          {title}
        </h2>
        {action}
      </header>
    )}
    {children}
  </section>
);

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'info'; size?: 'sm' | 'md'; busy?: boolean };

export const btnClass = (variant: BtnProps['variant'] = 'secondary', size: BtnProps['size'] = 'md') =>
  cn(
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crimson/40 focus-visible:ring-offset-1 focus-visible:ring-offset-surface active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
    size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
    variant === 'primary' && 'bg-crimson text-white shadow-sm shadow-crimson/20 hover:bg-crimson-dark',
    variant === 'secondary' && 'border border-line bg-surface text-ink shadow-sm hover:border-ink-muted/40 hover:bg-paper-light',
    variant === 'ghost' && 'text-ink-soft hover:bg-paper hover:text-ink',
    variant === 'danger' && 'border border-danger-line bg-surface text-danger hover:bg-danger-soft',
    variant === 'info' && 'border border-info-line bg-info-soft text-info hover:border-info-solid/50'
  );

export const Btn = ({ variant = 'secondary', size = 'md', busy, className, children, disabled, ...rest }: BtnProps) => (
  <button {...rest} disabled={disabled || busy} className={cn(btnClass(variant, size), className)}>
    {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
    {children}
  </button>
);

const field =
  'w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink shadow-sm transition-colors placeholder:text-ink-muted/70 hover:border-ink-muted/40 focus:border-crimson/60 focus:outline-none focus:ring-2 focus:ring-crimson/15 disabled:cursor-not-allowed disabled:bg-paper-light disabled:text-ink-muted';

export const Input = ({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) => <input {...rest} className={cn(field, 'h-9', className)} />;
export const Textarea = ({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...rest} className={cn(field, 'py-2 leading-relaxed', className)} />;
// className sizes the wrapper (width); selectClassName styles the control itself
export const Select = ({ className, selectClassName, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { selectClassName?: string }) => (
  <div className={cn('relative', className)}>
    <select {...rest} className={cn(field, 'h-9 w-full cursor-pointer appearance-none pr-8', selectClassName)}>
      {children}
    </select>
    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 opacity-60" />
  </div>
);

export const Field = ({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) => (
  <label className={cn('block', className)}>
    <span className="mb-1.5 block text-xs font-medium text-ink-soft">{label}</span>
    {children}
    {hint && <span className="mt-1.5 block text-xs leading-relaxed text-ink-muted">{hint}</span>}
  </label>
);

export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cn('h-5 w-5 animate-spin text-ink-muted', className)} />;

export const Loading = () => (
  <div className="flex justify-center py-16">
    <Spinner />
  </div>
);

export const Empty = ({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) => (
  <div className="flex flex-col items-center px-6 py-12 text-center">
    {icon && <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-paper text-ink-muted">{icon}</div>}
    <p className="text-sm font-medium text-ink">{title}</p>
    {children && <div className="mt-1 max-w-md text-sm text-ink-muted">{children}</div>}
  </div>
);

export const Progress = ({ value, max, className, tone = 'crimson' }: { value: number; max: number; className?: string; tone?: 'crimson' | 'ink' }) => (
  <div className={cn('h-2 overflow-hidden rounded-full bg-paper', className)}>
    <div
      className={cn('h-full rounded-full transition-[width] duration-500', tone === 'crimson' ? 'bg-gradient-to-r from-crimson to-crimson-dark' : 'bg-ink-muted/60')}
      style={{ width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%` }}
    />
  </div>
);

// Notice boxes (warnings, errors, hints)
const noticeTone = {
  danger: 'border-danger-line bg-danger-soft text-danger',
  warn: 'border-warn-line bg-warn-soft text-warn',
  info: 'border-info-line bg-info-soft text-info',
  success: 'border-success-line bg-success-soft text-success'
};
export const Notice = ({ tone, icon, children, className }: { tone: keyof typeof noticeTone; icon?: ReactNode; children: ReactNode; className?: string }) => (
  <div className={cn('flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm', noticeTone[tone], className)}>
    {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
    <div className="min-w-0 flex-1">{children}</div>
  </div>
);

export const Modal = ({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) => {
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn('max-h-[92vh] w-full animate-fade-in overflow-y-auto rounded-t-2xl border border-line bg-surface shadow-pop sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line-soft bg-surface/95 px-5 py-4 backdrop-blur">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-paper hover:text-ink" aria-label={t('common.close')}>
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
};

export const Chip = ({ active, onClick, children, count }: { active?: boolean; onClick?: () => void; children: ReactNode; count?: number }) => (
  <button
    onClick={onClick}
    className={cn(
      'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-colors',
      active ? 'border-inverse bg-inverse text-inverse-fg shadow-sm' : 'border-line bg-surface text-ink-soft hover:border-ink-muted/50 hover:text-ink'
    )}
  >
    {children}
    {count !== undefined && <span className={cn('tabular rounded-full px-1.5 py-px text-[11px]', active ? 'bg-inverse-fg/20' : 'bg-paper')}>{count}</span>}
  </button>
);

// Segmented control (two to five options)
export const Segmented = <T extends string>({ value, onChange, options, size = 'md', className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; title?: string }[]; size?: 'sm' | 'md'; className?: string }) => (
  <div className={cn('inline-flex rounded-lg border border-line bg-paper-light p-0.5', className)} role="radiogroup">
    {options.map(o => (
      <button
        key={o.value}
        type="button"
        role="radio"
        aria-checked={value === o.value}
        title={o.title}
        onClick={() => onChange(o.value)}
        className={cn(
          'inline-flex items-center justify-center gap-1 rounded-md font-medium transition-all',
          size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-2.5 text-xs',
          value === o.value ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-ink-muted hover:text-ink'
        )}
      >
        {o.label}
      </button>
    ))}
  </div>
);

export const PageHeader = ({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) => (
  <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
      {description && <div className="mt-1.5 text-sm text-ink-muted">{description}</div>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);
