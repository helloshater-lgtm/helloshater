import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CalendarCheck2,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  Circle,
  Link2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Video,
} from 'lucide-react';
import { ApprovedSpecializationItem, DirectTrialBooking } from '../../types';
import { toArabicDigits } from '../../utils/formatters';
import { formatBookingInOwnTimezone } from '../../utils/directTrialBooking';

export interface TutorHomeStep {
  key: string;
  title: string;
  completed: boolean;
  statusText: string;
  actionLabel: string;
}

interface TutorDashboardHomeProps {
  isPublished: boolean;
  steps: TutorHomeStep[];
  completedCount: number;
  evaluationError: boolean;
  evaluationErrorMessage?: string | null;
  /** Confirmed bookings that have not ended yet, sorted by start time. */
  upcomingBookings: DirectTrialBooking[];
  availableSlotsCount: number;
  specializations: ApprovedSpecializationItem[];
  onRetry: () => void;
  onStepAction: (stepKey: string) => void;
  onOpenCalendar: (addType?: 'trial' | 'private') => void;
  onOpenBookings: () => void;
  onOpenPreview: () => void;
}

/** Short verb for the next-step button. */
const STEP_ACTION_LABELS: Record<string, string> = {
  avatar: 'إضافة صورتك',
  bio: 'كتابة نبذتك',
  pricing: 'تحديد السعر',
  trialSlot: 'إضافة موعد تجريبي',
  paidPrivateSlot: 'إضافة موعد خاص',
};

/** Steps the tutor cannot complete alone (handled by Shatir admin). */
const ADMIN_MANAGED_STEPS = new Set(['specializations']);

/** Same icon style everywhere: tinted rounded square + 20px icon. */
const IconTile: React.FC<{ tone: 'blue' | 'amber' | 'green' | 'rose'; children: React.ReactNode }> = ({
  tone,
  children,
}) => {
  const tones = {
    blue: 'bg-[#EBF3FC] text-[#0D4E8B]',
    amber: 'bg-amber-50 text-amber-700',
    green: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700',
  };
  return (
    <span className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${tones[tone]}`}>
      {children}
    </span>
  );
};

const ICON = { className: 'w-5 h-5', strokeWidth: 1.75 } as const;

export const TutorDashboardHome: React.FC<TutorDashboardHomeProps> = ({
  isPublished,
  steps,
  completedCount,
  evaluationError,
  evaluationErrorMessage,
  upcomingBookings,
  availableSlotsCount,
  specializations,
  onRetry,
  onStepAction,
  onOpenCalendar,
  onOpenBookings,
  onOpenPreview,
}) => {
  const total = steps.length || 6;
  const missing = steps.filter((s) => !s.completed);
  const done = steps.filter((s) => s.completed);
  const nextStep = missing.find((s) => !ADMIN_MANAGED_STEPS.has(s.key)) || null;
  const missingLinks = upcomingBookings.filter((b) => !b.meetingUrl);
  const nextBooking = upcomingBookings[0] || null;
  const [showDone, setShowDone] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(missing.length > 0);

  // ---------------------------------------------------------------- next step
  let tone: 'blue' | 'amber' | 'green' | 'rose' = 'blue';
  let icon: React.ReactNode = <Sparkles {...ICON} />;
  let title = '';
  let text = '';
  let action: { label: string; onClick: () => void } | null = null;

  if (evaluationError) {
    tone = 'rose';
    icon = <AlertTriangle {...ICON} />;
    title = 'تعذر تحميل حالة ملفك';
    text = evaluationErrorMessage || 'حدث خطأ أثناء تحميل بياناتك.';
    action = { label: 'إعادة المحاولة', onClick: onRetry };
  } else if (missingLinks.length > 0) {
    tone = 'amber';
    icon = <Video {...ICON} />;
    title = missingLinks.length === 1 ? 'أضف رابط الحصة للحجز القادم' : `أضف روابط ${toArabicDigits(missingLinks.length)} حجوزات`;
    text = 'وليّ الأمر بيستنى الرابط في صفحة «حجوزاتي».';
    action = { label: 'إضافة الرابط', onClick: onOpenBookings };
  } else if (nextStep) {
    tone = 'amber';
    icon = <Sparkles {...ICON} />;
    title = nextStep.title;
    text = toArabicDigits(nextStep.statusText);
    action = { label: STEP_ACTION_LABELS[nextStep.key] || nextStep.actionLabel, onClick: () => onStepAction(nextStep.key) };
  } else if (missing.length > 0) {
    tone = 'blue';
    icon = <ShieldCheck {...ICON} />;
    title = 'بانتظار اعتماد تخصصاتك من الإدارة';
    text = 'كل اللي عليك مكتمل، وفريق شاطر هيتواصل معك.';
  } else if (!isPublished) {
    tone = 'blue';
    icon = <ShieldCheck {...ICON} />;
    title = 'ملفك مكتمل وبانتظار النشر';
    text = 'الإدارة بتراجع ملفك. لحد ده الوقت تقدر تضيف مواعيد وتعاين ملفك.';
    action = { label: 'معاينة ملفي', onClick: onOpenPreview };
  } else if (availableSlotsCount === 0) {
    tone = 'amber';
    icon = <CalendarPlus {...ICON} />;
    title = 'مفيش مواعيد متاحة للحجز';
    text = 'أضف مواعيد جديدة عشان أولياء الأمور يقدروا يحجزوا معاك.';
    action = { label: 'إضافة موعد', onClick: () => onOpenCalendar('trial') };
  } else {
    tone = 'green';
    icon = <CheckCircle2 {...ICON} />;
    title = 'كل حاجة جاهزة';
    text = 'ملفك منشور ومواعيدك متاحة. تابع حجوزاتك من هنا.';
    action = { label: 'فتح التقويم', onClick: () => onOpenCalendar() };
  }

  const nextBookingTime = nextBooking
    ? formatBookingInOwnTimezone(nextBooking.startsAt, nextBooking.endsAt, nextBooking.timezone)
    : null;

  const stats = [
    {
      key: 'bookings',
      label: 'حجوزات قادمة',
      value: upcomingBookings.length,
      icon: <CalendarCheck2 {...ICON} />,
      tone: 'green' as const,
      onClick: onOpenBookings,
    },
    {
      key: 'slots',
      label: 'مواعيد متاحة',
      value: availableSlotsCount,
      icon: <CalendarClock {...ICON} />,
      tone: 'blue' as const,
      onClick: () => onOpenCalendar(),
    },
    {
      key: 'links',
      label: 'روابط ناقصة',
      value: missingLinks.length,
      icon: <Link2 {...ICON} />,
      tone: missingLinks.length > 0 ? ('amber' as const) : ('blue' as const),
      onClick: onOpenBookings,
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in">
      {/* 1. Next step — the only primary button on this screen */}
      <section
        aria-label="الخطوة التالية"
        className="bg-white rounded-3xl border border-[#E2E8F0] shadow-xs p-4 sm:p-6"
      >
        <div className="flex items-start gap-3.5">
          <IconTile tone={tone}>{icon}</IconTile>
          <div className="flex-1 min-w-0 space-y-1">
            <span className="text-xs font-bold text-[#64748B] flex items-center gap-2">
              الخطوة التالية
              {!evaluationError && missing.length > 0 && (
                <span className="text-[11px] font-bold text-[#0D4E8B] bg-[#EBF3FC] px-2 py-0.5 rounded-full tabular-nums">
                  {toArabicDigits(completedCount)} من {toArabicDigits(total)} جاهزة
                </span>
              )}
            </span>
            <h2 className="font-['Cairo'] text-lg sm:text-xl font-extrabold text-[#1F2A44] leading-snug">{title}</h2>
            <p className="text-sm text-[#475569] leading-relaxed">{text}</p>
          </div>
        </div>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className={`mt-4 w-full sm:w-auto sm:min-w-[220px] h-12 px-6 rounded-2xl text-white text-sm font-extrabold font-['Cairo'] flex items-center justify-center gap-2 shadow-xs cursor-pointer ${
              evaluationError ? 'bg-rose-700 hover:bg-rose-800' : 'bg-[#0D4E8B] hover:bg-[#003767]'
            }`}
          >
            {evaluationError && <RefreshCw className="w-4 h-4" />}
            <span>{action.label}</span>
            {!evaluationError && <ArrowLeft className="w-4 h-4" />}
          </button>
        )}
      </section>

      {/* 2. Next session */}
      <section aria-label="الحصة القادمة" className="bg-white rounded-3xl border border-[#E2E8F0] shadow-xs p-4 sm:p-5">
        {nextBooking && nextBookingTime ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-start gap-3.5 flex-1 min-w-0">
              <IconTile tone="green">
                <CalendarCheck2 {...ICON} />
              </IconTile>
              <div className="min-w-0">
                <span className="text-xs font-bold text-[#64748B]">الحصة القادمة · تجريبية</span>
                <p className="font-['Cairo'] text-base font-extrabold text-[#1F2A44]">{nextBookingTime.fullDateLabel}</p>
                <p className="text-sm text-[#475569]">
                  {nextBookingTime.timeRangeLabel} · {nextBookingTime.timezoneLabel}
                </p>
              </div>
            </div>
            {nextBooking.meetingUrl ? (
              <a
                href={nextBooking.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="h-11 px-5 rounded-2xl border border-emerald-300 text-emerald-800 hover:bg-emerald-50 text-sm font-bold flex items-center justify-center gap-2"
              >
                <Video className="w-4 h-4" />
                <span>دخول الحصة</span>
              </a>
            ) : (
              <button
                type="button"
                onClick={onOpenBookings}
                className="h-11 px-5 rounded-2xl border border-amber-300 text-amber-900 bg-amber-50 hover:bg-amber-100 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Link2 className="w-4 h-4" />
                <span>أضف رابط الحصة</span>
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3.5">
            <IconTile tone="blue">
              <CalendarClock {...ICON} />
            </IconTile>
            <div className="flex-1 min-w-0">
              <p className="font-['Cairo'] text-base font-extrabold text-[#1F2A44]">مفيش حصص محجوزة لسه</p>
              <p className="text-sm text-[#475569]">
                {isPublished ? 'الحجوزات الجديدة هتظهر هنا.' : 'الحجز هيتفتح لأولياء الأمور بعد نشر ملفك.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenCalendar()}
              className="shrink-0 text-sm font-bold text-[#0D4E8B] hover:underline cursor-pointer"
            >
              التقويم
            </button>
          </div>
        )}
      </section>

      {/* 3. Numbers */}
      <section aria-label="ملخص" className="grid grid-cols-3 gap-2.5 sm:gap-4">
        {stats.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={s.onClick}
            className="bg-white rounded-3xl border border-[#E2E8F0] shadow-xs p-3 sm:p-4 flex flex-col items-start gap-2 text-right hover:border-[#0D4E8B]/40 transition-colors cursor-pointer"
          >
            <IconTile tone={s.tone}>{s.icon}</IconTile>
            <span className="font-['Cairo'] text-2xl font-extrabold text-[#1F2A44] tabular-nums leading-none">
              {toArabicDigits(s.value)}
            </span>
            <span className="text-xs font-bold text-[#64748B]">{s.label}</span>
          </button>
        ))}
      </section>

      {/* 4. Profile checklist (collapsed when complete) */}
      {!evaluationError && steps.length > 0 && (
        <section aria-label="بنود تجهيز الملف" className="bg-white rounded-3xl border border-[#E2E8F0] shadow-xs">
          <button
            type="button"
            onClick={() => setChecklistOpen((v) => !v)}
            aria-expanded={checklistOpen}
            className="w-full p-4 sm:p-5 flex items-center gap-3.5 text-right cursor-pointer"
          >
            <IconTile tone={missing.length > 0 ? 'amber' : 'green'}>
              {missing.length > 0 ? <Circle {...ICON} /> : <CheckCircle2 {...ICON} />}
            </IconTile>
            <span className="flex-1 min-w-0">
              <span className="block font-['Cairo'] text-base font-extrabold text-[#1F2A44]">
                {missing.length > 0
                  ? `فاضل ${toArabicDigits(missing.length)} ${missing.length === 1 ? 'بند' : 'بنود'} في ملفك`
                  : 'ملفك مكتمل'}
              </span>
              <span className="block text-xs text-[#64748B] tabular-nums">
                {toArabicDigits(completedCount)} من {toArabicDigits(total)} بنود جاهزة
              </span>
            </span>
            <span className="w-24 h-2 rounded-full bg-slate-100 overflow-hidden hidden sm:block" aria-hidden>
              <span
                className={`block h-full rounded-full ${missing.length > 0 ? 'bg-[#0D4E8B]' : 'bg-emerald-600'}`}
                style={{ width: `${Math.round((completedCount / total) * 100)}%` }}
              />
            </span>
            <ChevronDown className={`w-5 h-5 text-[#64748B] transition-transform ${checklistOpen ? 'rotate-180' : ''}`} />
          </button>

          {checklistOpen && (
            <div className="border-t border-[#F1F5F9] px-4 sm:px-5 pb-4 sm:pb-5">
              <ul className="divide-y divide-[#F1F5F9]">
                {[...missing, ...(showDone || missing.length === 0 ? done : [])].map((step) => {
                  const adminManaged = ADMIN_MANAGED_STEPS.has(step.key);
                  return (
                    <li key={step.key} className="py-3 flex items-center gap-3">
                      {step.completed ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" strokeWidth={1.75} aria-label="مكتمل" />
                      ) : (
                        <Circle className="w-5 h-5 text-amber-500 shrink-0" strokeWidth={2} aria-label="ناقص" />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className={`block text-sm font-bold ${step.completed ? 'text-[#64748B]' : 'text-[#1F2A44]'}`}>
                          {step.title}
                        </span>
                        {!step.completed && (
                          <span className="block text-xs text-[#64748B] leading-relaxed">
                            {toArabicDigits(step.statusText)}
                          </span>
                        )}
                      </div>
                      {adminManaged ? (
                        !step.completed && <span className="shrink-0 text-xs font-bold text-[#64748B]">تتولاه الإدارة</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onStepAction(step.key)}
                          className={`shrink-0 h-9 px-3.5 rounded-xl text-xs font-bold cursor-pointer ${
                            step.completed
                              ? 'text-[#0D4E8B] hover:bg-[#F0F6FD]'
                              : 'border border-[#0D4E8B]/30 text-[#0D4E8B] hover:bg-[#F0F6FD]'
                          }`}
                        >
                          {step.completed ? 'تعديل' : 'استكمال'}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {missing.length > 0 && done.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowDone((v) => !v)}
                  className="mt-1 text-xs font-bold text-[#0D4E8B] hover:underline cursor-pointer"
                >
                  {showDone ? 'إخفاء البنود المكتملة' : `عرض البنود المكتملة (${toArabicDigits(done.length)})`}
                </button>
              )}
            </div>
          )}
        </section>
      )}

    </div>
  );
};
