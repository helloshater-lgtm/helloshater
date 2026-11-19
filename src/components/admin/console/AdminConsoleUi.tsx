import React from 'react';
import { AlertCircle, Download, Loader2, RefreshCw } from 'lucide-react';
import { AdminConsoleUnavailableError } from '../../../services/adminConsoleService';
import { toArabicDigits } from '../../../utils/formatters';

/** Shared building blocks for the admin console (one card style, one tile style). */

export type Tone = 'blue' | 'amber' | 'green' | 'rose' | 'slate';

export const TONE_TILE: Record<Tone, string> = {
  blue: 'bg-[#EBF3FC] text-[#0D4E8B]',
  amber: 'bg-amber-50 text-amber-700',
  green: 'bg-emerald-50 text-emerald-700',
  rose: 'bg-rose-50 text-rose-700',
  slate: 'bg-slate-100 text-slate-600',
};

export const TONE_PILL: Record<Tone, string> = {
  blue: 'bg-[#EBF3FC] text-[#0D4E8B]',
  amber: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
  green: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200',
  rose: 'bg-rose-50 text-rose-800 ring-1 ring-rose-200',
  slate: 'bg-slate-100 text-slate-700',
};

export const ICON = { className: 'w-5 h-5', strokeWidth: 1.75 } as const;

export const PageHeader: React.FC<{
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}> = ({ title, subtitle, actions }) => (
  <div className="flex flex-wrap items-end justify-between gap-3">
    <div className="min-w-0">
      <h1 className="font-['Cairo'] text-xl sm:text-2xl font-extrabold text-[#1F2A44]">{title}</h1>
      {subtitle && <p className="text-sm text-[#64748B] mt-0.5">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

export const Card: React.FC<{
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  tone?: Tone;
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ title, subtitle, icon, tone = 'blue', aside, className = '', children }) => (
  <section aria-label={title} className={`bg-white rounded-3xl border border-[#E2E8F0] shadow-xs p-4 sm:p-5 ${className}`}>
    {(title || aside) && (
      <div className="flex items-start gap-3 mb-4">
        {icon && <span className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${TONE_TILE[tone]}`}>{icon}</span>}
        <div className="flex-1 min-w-0">
          {title && <h2 className="font-['Cairo'] text-base font-extrabold text-[#1F2A44]">{title}</h2>}
          {subtitle && <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed">{subtitle}</p>}
        </div>
        {aside}
      </div>
    )}
    {children}
  </section>
);

export const StatTile: React.FC<{
  label: string;
  value: string | number;
  hint?: string;
  tone?: Tone;
  icon?: React.ReactNode;
}> = ({ label, value, hint, tone = 'blue', icon }) => (
  <div className="bg-white rounded-3xl border border-[#E2E8F0] shadow-xs p-4 flex flex-col gap-2 min-w-0">
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs sm:text-sm font-bold text-[#64748B] truncate">{label}</span>
      {icon && <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${TONE_TILE[tone]}`}>{icon}</span>}
    </div>
    <span className="font-['Cairo'] text-2xl sm:text-3xl font-extrabold text-[#1F2A44] tabular-nums leading-none">
      {typeof value === 'number' ? toArabicDigits(value) : value}
    </span>
    {hint && <span className="text-xs text-[#64748B] truncate">{hint}</span>}
  </div>
);

export const Pill: React.FC<{ tone?: Tone; children: React.ReactNode }> = ({ tone = 'slate', children }) => (
  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${TONE_PILL[tone]}`}>
    {children}
  </span>
);

export const CountBadge: React.FC<{ count: number; tone?: 'amber' | 'green' | 'rose' }> = ({ count, tone = 'amber' }) =>
  count > 0 ? (
    <span
      className={`min-w-5 h-5 px-1.5 rounded-full text-[11px] font-extrabold flex items-center justify-center tabular-nums ${
        tone === 'green' ? 'bg-emerald-500 text-white' : tone === 'rose' ? 'bg-rose-500 text-white' : 'bg-amber-400 text-amber-950'
      }`}
    >
      {toArabicDigits(count > 99 ? '99+' : count)}
    </span>
  ) : null;

export const LoadingBlock: React.FC<{ label?: string }> = ({ label = 'جاري التحميل…' }) => (
  <div role="status" className="py-14 flex flex-col items-center justify-center gap-3 text-[#64748B]">
    <Loader2 className="w-7 h-7 text-[#0D4E8B] animate-spin" />
    <span className="text-sm">{label}</span>
  </div>
);

export const EmptyState: React.FC<{ icon: React.ReactNode; title: string; hint?: string; action?: React.ReactNode }> = ({
  icon,
  title,
  hint,
  action,
}) => (
  <div className="py-10 px-4 flex flex-col items-center text-center gap-2">
    <span className="w-12 h-12 rounded-2xl bg-[#F1F5F9] text-[#64748B] flex items-center justify-center">{icon}</span>
    <p className="font-['Cairo'] text-base font-extrabold text-[#1F2A44]">{title}</p>
    {hint && <p className="text-sm text-[#64748B] max-w-sm leading-relaxed">{hint}</p>}
    {action}
  </div>
);

export const ErrorNotice: React.FC<{ error: unknown; onRetry?: () => void }> = ({ error, onRetry }) => {
  const unavailable = error instanceof AdminConsoleUnavailableError;
  const message = (error as any)?.message || 'حصلت مشكلة. حاول تاني.';
  return (
    <div
      role="alert"
      className={`p-4 rounded-2xl flex items-start gap-3 text-sm ${
        unavailable ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200' : 'bg-rose-50 text-rose-800 ring-1 ring-rose-200'
      }`}
    >
      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" strokeWidth={1.75} />
      <div className="flex-1 space-y-1">
        <p className="font-bold">{unavailable ? 'الصفحة دي لسه مستنية تحديث قاعدة البيانات' : message}</p>
        {unavailable && <p className="text-xs leading-relaxed">طبّق تحديث 024 على Supabase وبعدين اعمل تحديث للصفحة.</p>}
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="shrink-0 min-h-[36px] px-3 rounded-xl bg-white/70 hover:bg-white text-xs font-bold flex items-center gap-1.5 cursor-pointer">
          <RefreshCw className="w-3.5 h-3.5" />
          <span>إعادة المحاولة</span>
        </button>
      )}
    </div>
  );
};

export const toolbarButton =
  'min-h-[44px] px-4 rounded-2xl border border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] text-[#1F2A44] text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

export const primaryButton =
  "min-h-[44px] px-5 rounded-2xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-sm font-extrabold font-['Cairo'] flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

export const inputClass =
  'w-full h-11 rounded-2xl border border-[#CBD5E1] bg-white px-4 text-sm text-[#1F2A44] outline-none focus:border-[#0D4E8B] focus:ring-4 focus:ring-[#0D4E8B]/10';

export const ExportButton: React.FC<{ onClick: () => void; disabled?: boolean; label?: string }> = ({
  onClick,
  disabled,
  label = 'تصدير Excel',
}) => (
  <button type="button" onClick={onClick} disabled={disabled} className={toolbarButton}>
    <Download className="w-4 h-4" strokeWidth={1.75} />
    <span>{label}</span>
  </button>
);

export const RefreshButton: React.FC<{ onClick: () => void; loading?: boolean }> = ({ onClick, loading }) => (
  <button type="button" onClick={onClick} disabled={loading} aria-label="تحديث" title="تحديث" className={`${toolbarButton} px-3`}>
    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.75} />
  </button>
);

/** Segmented control (e.g. 7 / 30 / 90 days). */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex p-1 rounded-2xl bg-[#F1F5F9]">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`min-h-[36px] px-3.5 rounded-xl text-sm font-bold cursor-pointer transition-colors ${
            o.value === value ? 'bg-white text-[#0D4E8B] shadow-xs' : 'text-[#64748B] hover:text-[#1F2A44]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
