import React from 'react';
import {
  CalendarCheck2,
  CheckCircle2,
  ChevronLeft,
  ClipboardCheck,
  FileCheck2,
  FileText,
  History,
  Link2Off,
  MessageCircle,
  Star,
  TrendingDown,
  TrendingUp,
  Users,
  UsersRound,
  Video,
} from 'lucide-react';
import { AdminConsoleTab, AdminOverview, AdminRole } from '../../../types/adminConsole';
import {
  adminDayLabel,
  canAccessAdminTab,
  formatAdminTime,
  formatPercent,
  whatsappLink,
} from '../../../utils/adminConsole';
import { toArabicDigits } from '../../../utils/formatters';
import { Card, EmptyState, ErrorNotice, ICON, LoadingBlock, PageHeader, Pill, RefreshButton, StatTile, Tone, TONE_TILE } from './AdminConsoleUi';

interface Props {
  role: AdminRole;
  overview: AdminOverview | null;
  loading: boolean;
  error: unknown;
  onRefresh: () => void;
  onNavigate: (tab: AdminConsoleTab) => void;
  onOpenParent: (userId: string) => void;
}

type TodoItem = { key: string; count: number; label: string; hint: string; tab: AdminConsoleTab; tone: Tone; icon: React.ReactNode };

export const AdminTodayView: React.FC<Props> = ({ role, overview, loading, error, onRefresh, onNavigate, onOpenParent }) => {
  const today = new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  if (!overview) {
    return (
      <div className="space-y-5">
        <PageHeader title="النهارده" subtitle={today} actions={<RefreshButton onClick={onRefresh} loading={loading} />} />
        {error ? <ErrorNotice error={error} onRetry={onRefresh} /> : <LoadingBlock label="بنجهّز ملخص النهارده…" />}
      </div>
    );
  }

  const t = overview.todo;
  const k = overview.kpis;
  const todo: TodoItem[] = [
    { key: 'links', count: t.missingLinks, label: 'حصص من غير رابط', hint: 'المعلم لسه ما حطّش رابط الحصة', tab: 'direct-trials' as const, tone: 'rose' as const, icon: <Link2Off {...ICON} /> },
    { key: 'leads', count: t.newLeads, label: 'طلبات أولياء أمور جديدة', hint: 'محتاجين حد يكلمهم على واتساب', tab: 'parent-leads' as const, tone: 'amber' as const, icon: <MessageCircle {...ICON} /> },
    { key: 'reports', count: t.missingReports, label: 'حصص من غير تقرير', hint: 'المعلم ما كتبش تقرير بعد الحصة', tab: 'quality' as const, tone: 'amber' as const, icon: <FileText {...ICON} /> },
    { key: 'apps', count: t.pendingApplications, label: 'طلبات انضمام معلمين', hint: 'مستنية مراجعة', tab: 'applications' as const, tone: 'blue' as const, icon: <FileCheck2 {...ICON} /> },
    { key: 'drafts', count: t.pendingDrafts, label: 'تعديلات معلمين', hint: 'صور أو بيانات مستنية موافقة', tab: 'recent-edits' as const, tone: 'blue' as const, icon: <History {...ICON} /> },
    { key: 'groups', count: t.pendingGroups, label: 'مجموعات مستنية مراجعة', hint: 'قبل ما تظهر لأولياء الأمور', tab: 'classes' as const, tone: 'blue' as const, icon: <Users {...ICON} /> },
    { key: 'reviews', count: t.pendingReviews, label: 'تقييمات مستنية مراجعة', hint: 'من صفحة المعلم', tab: 'tutors' as const, tone: 'blue' as const, icon: <Star {...ICON} /> },
  ].filter((i) => i.count > 0);

  const delta = k.newBookings7d - k.newBookingsPrev7d;
  const sessionsByDay = overview.sessions.reduce<Record<string, typeof overview.sessions>>((acc, s) => {
    const day = adminDayLabel(s.startsAt);
    (acc[day] ||= []).push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <PageHeader title="النهارده" subtitle={today} actions={<RefreshButton onClick={onRefresh} loading={loading} />} />
      {error ? <ErrorNotice error={error} onRetry={onRefresh} /> : null}

      {/* محتاج منك */}
      <Card
        title="محتاج منك"
        subtitle={todo.length ? 'ابدأ من فوق لتحت: الأهم الأول.' : undefined}
        icon={<ClipboardCheck {...ICON} />}
        tone={todo.length ? 'amber' : 'green'}
      >
        {todo.length === 0 ? (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 text-emerald-800">
            <CheckCircle2 className="w-5 h-5 shrink-0" strokeWidth={1.75} />
            <p className="text-sm font-bold">كله تمام، مفيش حاجة مستنياك دلوقتي.</p>
          </div>
        ) : (
          <ul className="divide-y divide-[#F1F5F9]">
            {todo.map((item) => {
              const canOpen = canAccessAdminTab(role, item.tab);
              const body = (
                <>
                  <span className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${TONE_TILE[item.tone]}`}>{item.icon}</span>
                  <span className="flex-1 min-w-0 text-right">
                    <span className="block text-sm font-bold text-[#1F2A44]">{item.label}</span>
                    <span className="block text-xs text-[#64748B] truncate">{item.hint}</span>
                  </span>
                  <span className="font-['Cairo'] text-xl font-extrabold text-[#1F2A44] tabular-nums">{toArabicDigits(item.count)}</span>
                  {canOpen && <ChevronLeft className="w-5 h-5 text-[#94A3B8] shrink-0" />}
                </>
              );
              return (
                <li key={item.key}>
                  {canOpen ? (
                    <button
                      type="button"
                      onClick={() => onNavigate(item.tab)}
                      className="w-full py-3 first:pt-0 flex items-center gap-3 rounded-xl hover:bg-[#F8FAFC] cursor-pointer"
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="w-full py-3 flex items-center gap-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* أرقام الأسبوع */}
      <section aria-label="أرقام الأسبوع" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="حجوزات جديدة"
          value={k.newBookings7d}
          hint={delta === 0 ? 'آخر ٧ أيام · زي الأسبوع اللي فات' : `آخر ٧ أيام · ${delta > 0 ? '+' : '−'}${toArabicDigits(Math.abs(delta))} عن اللي فات`}
          icon={delta < 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
          tone={delta < 0 ? 'rose' : 'green'}
        />
        <StatTile label="حصص اتعملت" value={k.completed7d} hint="آخر ٧ أيام" icon={<CalendarCheck2 className="w-4 h-4" />} />
        <StatTile
          label="نسبة الحضور"
          value={formatPercent(k.attendanceRate30d)}
          hint={k.reports30d ? `من ${toArabicDigits(k.reports30d)} تقرير · ٣٠ يوم` : 'لسه مفيش تقارير'}
          icon={<CheckCircle2 className="w-4 h-4" />}
          tone="green"
        />
        <StatTile label="معلمين منشورين" value={k.publishedTutors} hint={`${toArabicDigits(k.newLeads7d)} طلب و${toArabicDigits(k.newParents7d)} وليّ أمر جديد هذا الأسبوع`} icon={<Users className="w-4 h-4" />} />
      </section>

      {/* حصص النهارده وبكرة */}
      <Card title="الحصص التجريبية: النهارده وبكرة" icon={<Video {...ICON} />}>
        {overview.sessions.length === 0 ? (
          <EmptyState icon={<CalendarCheck2 {...ICON} />} title="مفيش حصص النهارده ولا بكرة" hint="أول ما وليّ أمر يحجز هتظهر هنا." />
        ) : (
          <div className="space-y-4">
            {Object.entries(sessionsByDay).map(([day, sessions]) => (
              <div key={day}>
                <p className="text-xs font-extrabold text-[#94A3B8] pb-2">{day}</p>
                <ul className="space-y-2">
                  {sessions.map((s) => {
                    const wa = whatsappLink(s.guardianWhatsapp);
                    return (
                      <li key={s.id} className="p-3 rounded-2xl border border-[#E2E8F0] flex flex-wrap items-center gap-3">
                        <span className="w-16 shrink-0 text-center">
                          <span className="block font-['Cairo'] text-base font-extrabold text-[#0D4E8B] tabular-nums">{formatAdminTime(s.startsAt)}</span>
                        </span>
                        <div className="flex-1 min-w-[10rem]">
                          <p className="text-sm font-bold text-[#1F2A44] truncate">{s.tutorName || 'معلم'}</p>
                          <p className="text-xs text-[#64748B] truncate">
                            {s.guardianName}
                            {s.childName ? ` · ${s.childName}` : ''}
                          </p>
                        </div>
                        {s.hasLink ? <Pill tone="green">الرابط جاهز</Pill> : <Pill tone="rose">من غير رابط</Pill>}
                        <div className="flex items-center gap-1.5">
                          {wa && (
                            <a
                              href={wa}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`واتساب ${s.guardianName}`}
                              className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center justify-center"
                            >
                              <MessageCircle className="w-4 h-4" strokeWidth={1.75} />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => onOpenParent(s.guardianUserId)}
                            aria-label={`ملف ${s.guardianName}`}
                            className="w-10 h-10 rounded-xl bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0] flex items-center justify-center cursor-pointer"
                          >
                            <UsersRound className="w-4 h-4" strokeWidth={1.75} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
