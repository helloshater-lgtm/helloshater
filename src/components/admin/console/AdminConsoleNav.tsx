import React, { useEffect } from 'react';
import {
  Activity,
  BarChart3,
  CalendarCheck2,
  ClipboardCheck,
  ExternalLink,
  FileCheck2,
  GaugeCircle,
  History,
  House,
  LogOut,
  Menu,
  MessageCircle,
  ShieldCheck,
  UserCog,
  Users,
  UsersRound,
  X,
  CalendarDays,
} from 'lucide-react';
import { AdminConsoleTab, AdminRole } from '../../../types/adminConsole';
import { ADMIN_ROLE_LABELS, allowedAdminTabs } from '../../../utils/adminConsole';
import { CountBadge } from './AdminConsoleUi';

type IconType = React.ComponentType<{ className?: string; strokeWidth?: number }>;

interface NavItem {
  tab: AdminConsoleTab;
  label: string;
  icon: IconType;
}

export const ADMIN_NAV_GROUPS: Array<{ label: string | null; items: NavItem[] }> = [
  { label: null, items: [{ tab: 'home', label: 'النهارده', icon: House }] },
  {
    label: 'التشغيل',
    items: [
      { tab: 'direct-trials', label: 'الحجوزات التجريبية', icon: CalendarCheck2 },
      { tab: 'parent-leads', label: 'طلبات أولياء الأمور', icon: MessageCircle },
      { tab: 'parents', label: 'أولياء الأمور', icon: UsersRound },
      { tab: 'classes', label: 'الحصص والمجموعات', icon: CalendarDays },
    ],
  },
  {
    label: 'المعلمين',
    items: [
      { tab: 'tutors', label: 'المعلمين', icon: Users },
      { tab: 'applications', label: 'طلبات الانضمام', icon: FileCheck2 },
      { tab: 'recent-edits', label: 'تعديلات المعلمين', icon: History },
    ],
  },
  {
    label: 'التقارير',
    items: [
      { tab: 'quality', label: 'الجودة والأداء', icon: GaugeCircle },
      { tab: 'statistics', label: 'الإحصائيات', icon: BarChart3 },
    ],
  },
  {
    label: 'الإدارة',
    items: [
      { tab: 'activity', label: 'سجل النشاط', icon: Activity },
      { tab: 'team', label: 'الفريق والصلاحيات', icon: UserCog },
    ],
  },
];

export const ADMIN_TAB_LABELS: Record<AdminConsoleTab, string> = Object.fromEntries(
  ADMIN_NAV_GROUPS.flatMap((g) => g.items.map((i) => [i.tab, i.label]))
) as Record<AdminConsoleTab, string>;

type Badges = Partial<Record<AdminConsoleTab, number>>;

interface NavProps {
  role: AdminRole;
  activeTab: AdminConsoleTab;
  onSelect: (tab: AdminConsoleTab) => void;
  badges: Badges;
}

const NavList: React.FC<NavProps & { onAfterSelect?: () => void }> = ({ role, activeTab, onSelect, badges, onAfterSelect }) => {
  const allowed = new Set(allowedAdminTabs(role));
  return (
    <div className="space-y-4">
      {ADMIN_NAV_GROUPS.map((group) => {
        const items = group.items.filter((i) => allowed.has(i.tab));
        if (!items.length) return null;
        return (
          <div key={group.label || 'main'}>
            {group.label && <p className="px-3 pb-1.5 text-[11px] font-extrabold text-[#94A3B8] tracking-wide">{group.label}</p>}
            <ul className="space-y-0.5">
              {items.map((item) => {
                const Icon = item.icon;
                const active = item.tab === activeTab;
                return (
                  <li key={item.tab}>
                    <button
                      type="button"
                      aria-current={active ? 'page' : undefined}
                      onClick={() => {
                        onSelect(item.tab);
                        onAfterSelect?.();
                      }}
                      className={`w-full h-11 px-3 rounded-2xl flex items-center gap-3 text-sm font-['Cairo'] transition-colors cursor-pointer ${
                        active ? 'bg-[#EBF3FC] text-[#0D4E8B] font-extrabold' : 'text-[#475569] font-bold hover:bg-[#F8FAFC] hover:text-[#1F2A44]'
                      }`}
                    >
                      <Icon className="w-5 h-5 shrink-0" strokeWidth={active ? 2.25 : 1.75} />
                      <span className="flex-1 text-right truncate">{item.label}</span>
                      <CountBadge count={badges[item.tab] || 0} tone={item.tab === 'parent-leads' ? 'green' : 'amber'} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
};

const AccountBox: React.FC<{ email: string; role: AdminRole; onNavigateHome: () => void; onLogout: () => void }> = ({
  email,
  role,
  onNavigateHome,
  onLogout,
}) => (
  <div className="pt-3 mt-3 border-t border-[#F1F5F9] space-y-2">
    <div className="px-3 flex items-center gap-2.5 min-w-0">
      <span className="w-9 h-9 rounded-full bg-[#0D4E8B] text-white flex items-center justify-center shrink-0 font-['Cairo'] font-extrabold uppercase">
        {email.charAt(0)}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-bold text-[#1F2A44] truncate" dir="ltr">{email}</p>
        <p className="text-[11px] text-[#64748B]">{ADMIN_ROLE_LABELS[role]}</p>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-1.5">
      <button type="button" onClick={onNavigateHome} className="h-10 rounded-xl text-xs font-bold text-[#475569] hover:bg-[#F8FAFC] flex items-center justify-center gap-1.5 cursor-pointer">
        <ExternalLink className="w-3.5 h-3.5" />
        <span>الموقع</span>
      </button>
      <button type="button" onClick={onLogout} className="h-10 rounded-xl text-xs font-bold text-rose-700 hover:bg-rose-50 flex items-center justify-center gap-1.5 cursor-pointer">
        <LogOut className="w-3.5 h-3.5" />
        <span>خروج</span>
      </button>
    </div>
  </div>
);

/** Desktop: grouped side bar on the right (RTL). */
export const AdminSidebar: React.FC<NavProps & { email: string; onNavigateHome: () => void; onLogout: () => void }> = (props) => (
  <aside className="hidden lg:block w-64 shrink-0">
    <nav aria-label="أقسام لوحة الإدارة" className="sticky top-24 bg-white rounded-3xl border border-[#E2E8F0] shadow-xs p-3 max-h-[calc(100vh-7rem)] overflow-y-auto">
      <div className="px-3 pb-3 mb-3 border-b border-[#F1F5F9] flex items-center gap-2.5">
        <span className="w-9 h-9 rounded-xl bg-[#0D4E8B] text-white flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5" strokeWidth={1.75} />
        </span>
        <div>
          <p className="font-['Cairo'] text-sm font-extrabold text-[#1F2A44]">لوحة الإدارة</p>
          <p className="text-[11px] text-[#64748B]">شاطر كلاسيز</p>
        </div>
      </div>
      <NavList {...props} />
      <AccountBox email={props.email} role={props.role} onNavigateHome={props.onNavigateHome} onLogout={props.onLogout} />
    </nav>
  </aside>
);

/** Mobile & tablet: full menu in a sheet. */
export const AdminMenuSheet: React.FC<
  NavProps & { open: boolean; onClose: () => void; email: string; onNavigateHome: () => void; onLogout: () => void }
> = ({ open, onClose, ...props }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="lg:hidden fixed inset-0 z-50" dir="rtl">
      <button type="button" aria-label="إغلاق القائمة" onClick={onClose} className="absolute inset-0 bg-slate-900/40 cursor-pointer" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="قائمة لوحة الإدارة"
        className="absolute top-0 bottom-0 right-0 w-[86%] max-w-xs bg-white shadow-2xl p-3 overflow-y-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
      >
        <div className="flex items-center justify-between px-2 pb-3 mb-3 border-b border-[#F1F5F9]">
          <p className="font-['Cairo'] text-base font-extrabold text-[#1F2A44]">لوحة الإدارة</p>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="w-10 h-10 rounded-xl hover:bg-[#F1F5F9] flex items-center justify-center cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>
        <NavList {...props} onAfterSelect={onClose} />
        <AccountBox email={props.email} role={props.role} onNavigateHome={props.onNavigateHome} onLogout={props.onLogout} />
      </div>
    </div>
  );
};

/** Mobile: 3 main pages + «القائمة», like native apps. */
export const AdminBottomNav: React.FC<NavProps & { onOpenMenu: () => void }> = ({ role, activeTab, onSelect, badges, onOpenMenu }) => {
  const main: NavItem[] =
    role === 'support'
      ? [
          { tab: 'home', label: 'النهارده', icon: House },
          { tab: 'parents', label: 'أولياء الأمور', icon: UsersRound },
          { tab: 'quality', label: 'الجودة', icon: ClipboardCheck },
        ]
      : [
          { tab: 'home', label: 'النهارده', icon: House },
          { tab: 'direct-trials', label: 'الحجوزات', icon: CalendarCheck2 },
          { tab: 'parents', label: 'أولياء الأمور', icon: UsersRound },
        ];
  const otherBadges = Object.entries(badges)
    .filter(([tab]) => !main.some((m) => m.tab === tab))
    .reduce((s, [, n]) => s + (n || 0), 0);
  const item = (key: string, label: string, Icon: IconType, active: boolean, badge: number, onClick: () => void) => (
    <li key={key}>
      <button
        type="button"
        aria-current={active ? 'page' : undefined}
        onClick={onClick}
        className={`w-full h-16 flex flex-col items-center justify-center gap-1 font-['Cairo'] cursor-pointer ${active ? 'text-[#0D4E8B]' : 'text-[#64748B]'}`}
      >
        <span className={`relative w-12 h-7 rounded-full flex items-center justify-center ${active ? 'bg-[#EBF3FC]' : ''}`}>
          <Icon className="w-5 h-5" strokeWidth={active ? 2.25 : 1.75} />
          {badge > 0 && (
            <span className="absolute -top-1 left-1">
              <CountBadge count={badge} />
            </span>
          )}
        </span>
        <span className={`text-[11px] ${active ? 'font-extrabold' : 'font-bold'}`}>{label}</span>
      </button>
    </li>
  );
  return (
    <nav
      aria-label="أقسام لوحة الإدارة"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-[#E2E8F0] shadow-[0_-4px_16px_rgba(15,23,42,0.06)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      dir="rtl"
    >
      <ul className="grid grid-cols-4">
        {main.map((m) =>
          item(m.tab, m.label, m.icon, activeTab === m.tab, badges[m.tab] || 0, () => {
            onSelect(m.tab);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          })
        )}
        {item('menu', 'القائمة', Menu, !main.some((m) => m.tab === activeTab), otherBadges, onOpenMenu)}
      </ul>
    </nav>
  );
};
