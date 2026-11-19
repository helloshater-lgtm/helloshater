import React from 'react';

/** Shared visual building blocks for the tutor dashboard (one icon style, one card style). */

export type IconTone = 'blue' | 'amber' | 'green' | 'rose';

const TONES: Record<IconTone, string> = {
  blue: 'bg-[#EBF3FC] text-[#0D4E8B]',
  amber: 'bg-amber-50 text-amber-700',
  green: 'bg-emerald-50 text-emerald-700',
  rose: 'bg-rose-50 text-rose-700',
};

export const ICON_PROPS = { className: 'w-5 h-5', strokeWidth: 1.75 } as const;

/** Tinted rounded square + 20px icon. */
export const IconTile: React.FC<{ tone: IconTone; children: React.ReactNode }> = ({ tone, children }) => (
  <span className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${TONES[tone]}`}>{children}</span>
);

/** White card with an icon, title and one short line under it. */
export const SectionCard: React.FC<{
  id?: string;
  icon: React.ReactNode;
  tone?: IconTone;
  title: string;
  subtitle?: string;
  aside?: React.ReactNode;
  highlight?: boolean;
  children: React.ReactNode;
}> = ({ id, icon, tone = 'blue', title, subtitle, aside, highlight, children }) => (
  <section
    id={id}
    aria-label={title}
    className={`bg-white rounded-3xl border shadow-xs p-4 sm:p-6 space-y-5 scroll-mt-28 transition-shadow ${
      highlight ? 'border-[#0D4E8B] ring-4 ring-[#0D4E8B]/10' : 'border-[#E2E8F0]'
    }`}
  >
    <div className="flex items-start gap-3.5">
      <IconTile tone={tone}>{icon}</IconTile>
      <div className="flex-1 min-w-0">
        <h2 className="font-['Cairo'] text-base sm:text-lg font-extrabold text-[#1F2A44]">{title}</h2>
        {subtitle && <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed">{subtitle}</p>}
      </div>
      {aside}
    </div>
    {children}
  </section>
);

/** Inline success / error message. */
export const InlineMessage: React.FC<{ type: 'success' | 'error'; children: React.ReactNode }> = ({ type, children }) => (
  <p
    role={type === 'error' ? 'alert' : 'status'}
    className={`p-3 rounded-2xl text-xs sm:text-sm font-bold ${
      type === 'error' ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'
    }`}
  >
    {children}
  </p>
);

export const fieldClass = (hasError?: boolean) =>
  `w-full rounded-2xl border px-4 text-sm text-[#1F2A44] bg-white outline-none transition-colors focus:border-[#0D4E8B] focus:ring-4 focus:ring-[#0D4E8B]/10 ${
    hasError ? 'border-rose-400 bg-rose-50/40' : 'border-[#CBD5E1]'
  }`;

export const primaryButtonClass =
  "h-12 px-6 rounded-2xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-sm font-extrabold font-['Cairo'] flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

export const secondaryButtonClass =
  'h-12 px-5 rounded-2xl border border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] text-[#1F2A44] text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50';
