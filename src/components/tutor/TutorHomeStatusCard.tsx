import React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Eye,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { toArabicDigits } from '../../utils/formatters';

export interface TutorHomeStep {
  key: string;
  title: string;
  completed: boolean;
  statusText: string;
  actionLabel: string;
}

interface TutorHomeStatusCardProps {
  isPublished: boolean;
  steps: TutorHomeStep[];
  completedCount: number;
  percent: number;
  evaluationError: boolean;
  evaluationErrorMessage?: string | null;
  confirmedTrialsCount: number;
  missingMeetingLinkCount: number;
  isLoadingPreview: boolean;
  onRetry: () => void;
  onStepAction: (stepKey: string) => void;
  onOpenCalendar: () => void;
  onOpenPreview: () => void;
}

/** Steps the tutor cannot complete alone (handled by Shatir admin). */
const ADMIN_MANAGED_STEPS = new Set(['specializations']);

/**
 * First thing the accepted tutor sees: profile status + the one next step,
 * then the readiness checklist (same rules as the admin readiness indicator).
 */
export const TutorHomeStatusCard: React.FC<TutorHomeStatusCardProps> = ({
  isPublished,
  steps,
  completedCount,
  percent,
  evaluationError,
  evaluationErrorMessage,
  confirmedTrialsCount,
  missingMeetingLinkCount,
  isLoadingPreview,
  onRetry,
  onStepAction,
  onOpenCalendar,
  onOpenPreview,
}) => {
  const total = steps.length || 6;
  const missing = steps.filter((s) => !s.completed);
  const nextStep = missing.find((s) => !ADMIN_MANAGED_STEPS.has(s.key)) || null;
  const onlyAdminStepsLeft = missing.length > 0 && !nextStep;

  type StatusTone = 'published' | 'review' | 'preparing';
  const tone: StatusTone = isPublished ? 'published' : missing.length === 0 ? 'review' : 'preparing';

  const statusMeta: Record<StatusTone, { label: string; className: string; icon: React.ReactNode }> = {
    published: {
      label: 'ملفك منشور ومتاح للحجز',
      className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      icon: <CheckCircle2 className="w-4 h-4" />,
    },
    review: {
      label: 'ملفك مكتمل وبانتظار مراجعة الإدارة للنشر',
      className: 'bg-[#EBF3FC] text-[#0D4E8B] border-[#0D4E8B]/30',
      icon: <ShieldCheck className="w-4 h-4" />,
    },
    preparing: {
      label: 'ملفك قيد التجهيز وغير ظاهر لأولياء الأمور',
      className: 'bg-amber-50 text-amber-900 border-amber-200',
      icon: <Clock3 className="w-4 h-4" />,
    },
  };

  // ---- Next step block
  let nextTitle = '';
  let nextText = '';
  let nextButton: { label: string; onClick: () => void } | null = null;

  if (evaluationError) {
    nextTitle = 'تعذر تقييم جاهزية ملفك';
    nextText = evaluationErrorMessage || 'حدث خطأ أثناء تحميل بياناتك.';
    nextButton = { label: 'إعادة المحاولة', onClick: onRetry };
  } else if (isPublished && missingMeetingLinkCount > 0) {
    nextTitle = `أضف رابط الحصة لـ ${toArabicDigits(missingMeetingLinkCount)} حجز تجريبي`;
    nextText = 'وليّ الأمر بيستنى الرابط في صفحة «حجوزاتي». افتح الحجز من التقويم وأضف رابط Google Meet أو Zoom.';
    nextButton = { label: 'فتح التقويم', onClick: onOpenCalendar };
  } else if (nextStep) {
    nextTitle = nextStep.title;
    nextText = nextStep.statusText;
    nextButton = { label: nextStep.actionLabel, onClick: () => onStepAction(nextStep.key) };
  } else if (onlyAdminStepsLeft) {
    nextTitle = 'بانتظار اعتماد التخصصات من الإدارة';
    nextText = 'كل البنود اللي عليك مكتملة. فريق شاطر هيضيف تخصصاتك المعتمدة ويتواصل معك.';
  } else if (!isPublished) {
    nextTitle = 'كل البنود مكتملة 🎉';
    nextText = 'الإدارة هتراجع جودة ملفك وتنشره. لحد ده الوقت تقدر تضيف مواعيد جديدة وتعاين ملفك.';
    nextButton = { label: 'شوف ملفك زي ولي الأمر', onClick: onOpenPreview };
  } else {
    nextTitle = confirmedTrialsCount > 0 ? 'تابع حجوزاتك القادمة' : 'أضف مواعيد جديدة ليحجز أولياء الأمور';
    nextText =
      confirmedTrialsCount > 0
        ? `عندك ${toArabicDigits(confirmedTrialsCount)} حجز تجريبي مؤكد.`
        : 'كل ما تكون مواعيدك المتاحة أكتر، كل ما فرص الحجز تزيد.';
    nextButton = { label: 'فتح التقويم', onClick: onOpenCalendar };
  }

  const status = statusMeta[tone];

  return (
    <section
      aria-label="حالة ملفك والخطوة التالية"
      className="bg-white rounded-3xl border border-[#E2E8F0] shadow-xs overflow-hidden"
    >
      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs sm:text-sm font-bold ${status.className}`}
          >
            {status.icon}
            {status.label}
          </span>
          {!evaluationError && (
            <span className="text-xs font-bold text-[#64748B] tabular-nums">
              {toArabicDigits(completedCount)} من {toArabicDigits(total)} بنود جاهزة
            </span>
          )}
        </div>

        {!evaluationError && (
          <div
            className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label="نسبة اكتمال الملف"
          >
            <div
              className={`h-full rounded-full transition-all duration-300 ${percent === 100 ? 'bg-emerald-600' : 'bg-[#0D4E8B]'}`}
              style={{ width: `${percent}%` }}
            />
          </div>
        )}

        {/* Next step */}
        <div
          className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            evaluationError ? 'bg-rose-50 border-rose-200' : 'bg-[#F0F6FD] border-[#0D4E8B]/20'
          }`}
        >
          <div className="space-y-1 min-w-0">
            <span className={`text-[11px] font-bold ${evaluationError ? 'text-rose-700' : 'text-[#0D4E8B]'}`}>
              {evaluationError ? 'تنبيه' : 'الخطوة التالية'}
            </span>
            <h2 className="font-['Cairo'] text-base sm:text-lg font-extrabold text-[#1F2A44] flex items-center gap-2">
              {evaluationError && <AlertTriangle className="w-5 h-5 text-rose-700 shrink-0" />}
              {nextTitle}
            </h2>
            <p className="text-xs sm:text-sm text-[#475569] leading-relaxed">{nextText}</p>
          </div>
          {nextButton && (
            <button
              type="button"
              onClick={nextButton.onClick}
              className={`shrink-0 min-h-[48px] px-5 rounded-xl text-white text-sm font-bold font-['Cairo'] flex items-center justify-center gap-2 shadow-xs cursor-pointer ${
                evaluationError ? 'bg-rose-700 hover:bg-rose-800' : 'bg-[#0D4E8B] hover:bg-[#003767]'
              }`}
            >
              {evaluationError ? <RefreshCw className="w-4 h-4" /> : null}
              <span>{nextButton.label}</span>
              {!evaluationError && <ArrowLeft className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Checklist */}
      {!evaluationError && steps.length > 0 && (
        <div className="border-t border-[#F1F5F9] p-4 sm:p-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#1F2A44]">
              {missing.length > 0
                ? `المطلوب قبل النشر (${toArabicDigits(missing.length)} ${missing.length === 1 ? 'بند' : 'بنود'})`
                : 'بنود تجهيز الملف'}
            </h3>
            <button
              type="button"
              onClick={onOpenPreview}
              disabled={isLoadingPreview}
              className="min-h-[40px] px-3 rounded-xl bg-white border border-[#CBD5E1] text-xs font-bold text-[#0D4E8B] hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              {isLoadingPreview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              <span>شوف ملفك زي ولي الأمر</span>
            </button>
          </div>

          <ul className="divide-y divide-[#F1F5F9] rounded-2xl border border-[#E2E8F0]">
            {[...missing, ...steps.filter((s) => s.completed)].map((step) => {
              const adminManaged = ADMIN_MANAGED_STEPS.has(step.key);
              return (
                <li key={step.key} className="p-3 sm:p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    {step.completed ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" aria-label="مكتمل" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-label="ناقص" />
                    )}
                    <div className="min-w-0">
                      <span
                        className={`block text-sm font-bold ${step.completed ? 'text-[#64748B]' : 'text-[#1F2A44]'}`}
                      >
                        {step.title}
                      </span>
                      <span className="block text-[11px] sm:text-xs text-[#64748B] leading-relaxed">
                        {step.statusText}
                      </span>
                    </div>
                  </div>
                  {adminManaged ? (
                    !step.completed && (
                      <span className="shrink-0 text-[11px] font-bold text-[#64748B] bg-slate-100 px-2.5 py-1 rounded-lg">
                        تتولاه الإدارة
                      </span>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() => onStepAction(step.key)}
                      className={`shrink-0 min-h-[40px] px-3 rounded-xl text-xs font-bold cursor-pointer ${
                        step.completed
                          ? 'bg-white border border-[#CBD5E1] text-[#0D4E8B] hover:bg-slate-50'
                          : 'bg-[#0D4E8B] hover:bg-[#003767] text-white'
                      }`}
                    >
                      {step.completed ? 'تعديل' : step.actionLabel}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!evaluationError && (
        <div className="border-t border-[#F1F5F9] px-4 sm:px-6 py-3 bg-[#F8FAFC] flex items-center justify-between gap-2">
          <span className="text-[11px] sm:text-xs text-[#64748B]">
            {isPublished
              ? 'تعديلاتك ومواعيدك تظهر لأولياء الأمور فور الحفظ.'
              : 'كل اللي بتحفظه بيظهر لك فورًا هنا وفي المعاينة، ومش هيظهر لأولياء الأمور قبل النشر.'}
          </span>
          <button
            type="button"
            onClick={onOpenCalendar}
            className="shrink-0 text-xs font-bold text-[#0D4E8B] flex items-center gap-1 cursor-pointer"
          >
            <CalendarDays className="w-4 h-4" />
            <span>التقويم</span>
          </button>
        </div>
      )}
    </section>
  );
};
