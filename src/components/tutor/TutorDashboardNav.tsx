import React from 'react';
import { CalendarCheck2, CalendarDays, House, UserRound } from 'lucide-react';
import { toArabicDigits } from '../../utils/formatters';

/** Every screen of the tutor dashboard (kept as-is from the existing dashboard). */
export type TutorDashboardTab =
  | 'overview'
  | 'calendar'
  | 'pricing'
  | 'profile-draft'
  | 'trials'
  | 'direct-trials'
  | 'private'
  | 'groups';

/** The 4 main sections shown in the side bar (desktop) and bottom bar (mobile). */
export type TutorDashboardSection = 'home' | 'calendar' | 'bookings' | 'profile';

interface SectionDef {
  key: TutorDashboardSection;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  /** `hidden` tabs belong to the section but share another tab's page (no own sub tab). */
  tabs: Array<{ tab: TutorDashboardTab; label: string; hidden?: boolean }>;
}

export const TUTOR_DASHBOARD_SECTIONS: SectionDef[] = [
  { key: 'home', label: 'الرئيسية', icon: House, tabs: [{ tab: 'overview', label: 'الرئيسية' }] },
  {
    key: 'calendar',
    label: 'التقويم',
    icon: CalendarDays,
    tabs: [
      { tab: 'calendar', label: 'الأسبوع' },
      { tab: 'trials', label: 'المواعيد التجريبية' },
      { tab: 'private', label: 'الحصص الخاصة' },
    ],
  },
  {
    key: 'bookings',
    label: 'الحجوزات',
    icon: CalendarCheck2,
    tabs: [{ tab: 'direct-trials', label: 'الحجوزات' }],
  },
  {
    key: 'profile',
    label: 'ملفي',
    icon: UserRound,
    tabs: [
      { tab: 'profile-draft', label: 'بياناتي' },
      { tab: 'pricing', label: 'بياناتي', hidden: true },
      { tab: 'groups', label: 'المجموعات' },
    ],
  },
];

export function getSectionForTab(tab: TutorDashboardTab): SectionDef {
  return (
    TUTOR_DASHBOARD_SECTIONS.find((s) => s.tabs.some((t) => t.tab === tab)) || TUTOR_DASHBOARD_SECTIONS[0]
  );
}

interface NavProps {
  activeTab: TutorDashboardTab;
  onSelectTab: (tab: TutorDashboardTab) => void;
  /** Small badge per section (e.g. bookings missing a meeting link). */
  badges?: Partial<Record<TutorDashboardSection, number>>;
}

/** Desktop: vertical navigation on the right side (RTL). */
export const TutorDashboardSidebar: React.FC<NavProps> = ({ activeTab, onSelectTab, badges }) => {
  const active = getSectionForTab(activeTab).key;
  return (
    <nav
      aria-label="أقسام لوحة المعلم"
      className="hidden md:block sticky top-24 bg-white rounded-3xl border border-[#E2E8F0] p-2.5 shadow-xs"
    >
      <ul className="space-y-1">
        {TUTOR_DASHBOARD_SECTIONS.map((section) => {
          const Icon = section.icon;
          const isActive = section.key === active;
          const badge = badges?.[section.key] || 0;
          return (
            <li key={section.key}>
              <button
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelectTab(section.tabs[0].tab)}
                className={`w-full h-12 px-3 rounded-2xl flex items-center gap-3 text-sm font-['Cairo'] transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#EBF3FC] text-[#0D4E8B] font-extrabold'
                    : 'text-[#475569] font-bold hover:bg-[#F8FAFC] hover:text-[#1F2A44]'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" strokeWidth={isActive ? 2.25 : 1.75} />
                <span className="flex-1 text-right">{section.label}</span>
                {badge > 0 && (
                  <span className="min-w-5 h-5 px-1.5 rounded-full bg-amber-400 text-amber-950 text-[11px] font-extrabold flex items-center justify-center tabular-nums">
                    {toArabicDigits(badge)}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

/** Mobile: fixed bottom bar with the 4 sections, like native apps. */
export const TutorDashboardBottomNav: React.FC<NavProps> = ({ activeTab, onSelectTab, badges }) => {
  const active = getSectionForTab(activeTab).key;
  return (
    <nav
      aria-label="أقسام لوحة المعلم"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-[#E2E8F0] shadow-[0_-4px_16px_rgba(15,23,42,0.06)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      dir="rtl"
    >
      <ul className="grid grid-cols-4">
        {TUTOR_DASHBOARD_SECTIONS.map((section) => {
          const Icon = section.icon;
          const isActive = section.key === active;
          const badge = badges?.[section.key] || 0;
          return (
            <li key={section.key}>
              <button
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => {
                  onSelectTab(section.tabs[0].tab);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`w-full h-16 flex flex-col items-center justify-center gap-1 font-['Cairo'] cursor-pointer ${
                  isActive ? 'text-[#0D4E8B]' : 'text-[#64748B]'
                }`}
              >
                <span
                  className={`relative w-12 h-7 rounded-full flex items-center justify-center transition-colors ${
                    isActive ? 'bg-[#EBF3FC]' : ''
                  }`}
                >
                  <Icon className="w-5 h-5" strokeWidth={isActive ? 2.25 : 1.75} />
                  {badge > 0 && (
                    <span className="absolute -top-1 left-1 min-w-4 h-4 px-1 rounded-full bg-amber-400 text-amber-950 text-[10px] font-extrabold flex items-center justify-center tabular-nums">
                      {toArabicDigits(badge)}
                    </span>
                  )}
                </span>
                <span className={`text-[11px] ${isActive ? 'font-extrabold' : 'font-bold'}`}>{section.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

/** Segmented control for the screens inside one section (e.g. ملفي → الصورة / السعر / المجموعات). */
export const TutorDashboardSubTabs: React.FC<NavProps> = ({ activeTab, onSelectTab }) => {
  const section = getSectionForTab(activeTab);
  const visibleTabs = section.tabs.filter((t) => !t.hidden);
  if (visibleTabs.length < 2) return null;
  const activeVisible =
    section.tabs.find((t) => t.tab === activeTab)?.hidden
      ? visibleTabs.find((t) => t.label === section.tabs.find((x) => x.tab === activeTab)?.label)?.tab
      : activeTab;
  return (
    <div role="tablist" aria-label={section.label} className="flex gap-1 p-1 rounded-2xl bg-[#EEF2F7] overflow-x-auto">
      {visibleTabs.map(({ tab, label }) => {
        const isActive = tab === activeVisible;
        return (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelectTab(tab)}
            className={`flex-1 min-w-max h-10 px-4 rounded-xl text-xs sm:text-sm font-['Cairo'] whitespace-nowrap transition-colors cursor-pointer ${
              isActive ? 'bg-white text-[#0D4E8B] font-extrabold shadow-xs' : 'text-[#475569] font-bold hover:text-[#1F2A44]'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
};
