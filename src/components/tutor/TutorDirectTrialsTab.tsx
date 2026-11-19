import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DirectTrialBooking, DirectTrialReport, TutorTrialExtras } from '../../types';
import { DirectTrialBookingService } from '../../services/directTrialBookingService';
import { ParentDashboardService } from '../../services/parentDashboardService';
import {
  formatBookingInOwnTimezone,
  hasBookingEnded,
  validateMeetingUrl,
} from '../../utils/directTrialBooking';
import { toArabicDigits } from '../../utils/formatters';
import {
  CalendarCheck2,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  User,
  Video,
} from 'lucide-react';

interface TutorDirectTrialsTabProps {
  bookings: DirectTrialBooking[];
  isLoading: boolean;
  loadError: string | null;
  onRefresh: () => Promise<void> | void;
}

type Stage = 'needs_link' | 'needs_report' | 'upcoming' | 'done' | 'cancelled';

const STAGE_META: Record<Stage, { label: string; chip: string }> = {
  needs_link: { label: 'محتاج رابط الحصة', chip: 'bg-amber-100 text-amber-900' },
  needs_report: { label: 'محتاج تقرير', chip: 'bg-amber-100 text-amber-900' },
  upcoming: { label: 'جاهز', chip: 'bg-emerald-50 text-emerald-800' },
  done: { label: 'مكتملة', chip: 'bg-slate-100 text-slate-700' },
  cancelled: { label: 'ملغية', chip: 'bg-rose-50 text-rose-700' },
};

function stageOf(b: DirectTrialBooking, report: DirectTrialReport | null | undefined): Stage {
  if (b.status === 'cancelled') return 'cancelled';
  const ended = hasBookingEnded(b.endsAt);
  if (b.status === 'completed') return report || !ended ? 'done' : 'needs_report';
  if (ended) return 'needs_report';
  return b.meetingUrl ? 'upcoming' : 'needs_link';
}

const inputCls =
  'w-full rounded-2xl border border-[#CBD5E1] bg-white px-4 text-sm text-[#1F2A44] outline-none focus:border-[#0D4E8B] focus:ring-4 focus:ring-[#0D4E8B]/10';

/**
 * «الحجوزات»: what needs the tutor first (meeting link / report), then upcoming,
 * then past. The report after each session is what the parent sees in «حجوزاتي».
 */
export const TutorDirectTrialsTab: React.FC<TutorDirectTrialsTabProps> = ({
  bookings,
  isLoading,
  loadError,
  onRefresh,
}) => {
  const [extras, setExtras] = useState<Record<string, TutorTrialExtras> | null>({});
  const [reportsAvailable, setReportsAvailable] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [linkInput, setLinkInput] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [rowOk, setRowOk] = useState<Record<string, string>>({});
  const [showPast, setShowPast] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<{
    attended: boolean | null;
    levelSummary: string;
    covered: string;
    recommendation: string;
    homework: string;
  }>({ attended: null, levelSummary: '', covered: '', recommendation: '', homework: '' });

  const loadExtras = useCallback(async () => {
    try {
      const map = await ParentDashboardService.tutorGetTrialExtras();
      setReportsAvailable(map !== null);
      setExtras(map || {});
    } catch {
      setExtras({});
    }
  }, []);

  useEffect(() => {
    loadExtras();
  }, [loadExtras, bookings]);

  const grouped = useMemo(() => {
    const withStage = bookings.map((b) => ({ b, stage: stageOf(b, extras?.[b.id]?.report) }));
    const byStart = (x: { b: DirectTrialBooking }, y: { b: DirectTrialBooking }) =>
      Date.parse(x.b.startsAt) - Date.parse(y.b.startsAt);
    return {
      action: withStage.filter((x) => x.stage === 'needs_link' || x.stage === 'needs_report').sort(byStart),
      upcoming: withStage.filter((x) => x.stage === 'upcoming').sort(byStart),
      past: withStage
        .filter((x) => x.stage === 'done' || x.stage === 'cancelled')
        .sort((x, y) => -byStart(x, y)),
    };
  }, [bookings, extras]);

  const setMsg = (id: string, ok: string | null, err: string | null) => {
    setRowOk((p) => ({ ...p, [id]: ok || '' }));
    setRowError((p) => ({ ...p, [id]: err || '' }));
  };

  const saveLink = async (b: DirectTrialBooking) => {
    const v = validateMeetingUrl(linkInput[b.id] ?? b.meetingUrl ?? '');
    if (!v.isValid) return setMsg(b.id, null, v.error || 'اكتب رابط Google Meet أو Zoom صحيح.');
    setBusyId(b.id);
    try {
      await DirectTrialBookingService.tutorSetDirectTrialMeeting({ bookingId: b.id, meetingUrl: v.normalizedUrl });
      setMsg(b.id, `تم حفظ رابط ${v.providerLabel}، وظهر لوليّ الأمر في «حجوزاتي».`, null);
      await onRefresh();
    } catch (e: any) {
      setMsg(b.id, null, e?.message || 'تعذر حفظ الرابط.');
    } finally {
      setBusyId(null);
    }
  };

  const openReport = (b: DirectTrialBooking) => {
    const r = extras?.[b.id]?.report;
    setForm({
      attended: r ? r.attended : null,
      levelSummary: r?.levelSummary || '',
      covered: r?.covered || '',
      recommendation: r?.recommendation || '',
      homework: r?.homework || '',
    });
    setOpenId(b.id);
    setMsg(b.id, null, null);
  };

  const saveReport = async (b: DirectTrialBooking) => {
    if (form.attended === null) return setMsg(b.id, null, 'حدد الطفل حضر ولا لأ.');
    setBusyId(b.id);
    try {
      await ParentDashboardService.tutorSubmitReport({
        bookingId: b.id,
        attended: form.attended,
        levelSummary: form.levelSummary,
        covered: form.covered,
        recommendation: form.recommendation,
        homework: form.homework,
      });
      setOpenId(null);
      setNotice('تم حفظ التقرير، ووليّ الأمر هيشوفه في «حجوزاتي». الحصة اتنقلت لـ«السابقة».');
      await Promise.all([onRefresh(), loadExtras()]);
    } catch (e: any) {
      setMsg(b.id, null, e?.message || 'تعذر حفظ التقرير.');
    } finally {
      setBusyId(null);
    }
  };

  const markCompleted = async (b: DirectTrialBooking) => {
    setBusyId(b.id);
    try {
      await DirectTrialBookingService.tutorMarkDirectTrialCompleted(b.id);
      setMsg(b.id, 'تم تسجيل إتمام الحصة.', null);
      await onRefresh();
    } catch (e: any) {
      setMsg(b.id, null, e?.message || 'تعذر تسجيل إتمام الحصة.');
    } finally {
      setBusyId(null);
    }
  };

  const renderCard = ({ b, stage }: { b: DirectTrialBooking; stage: Stage }) => {
    const t = formatBookingInOwnTimezone(b.startsAt, b.endsAt, b.timezone);
    const ex = extras?.[b.id];
    const report = ex?.report || null;
    const guardianName = (b as any).guardianName as string | undefined;
    const meta = STAGE_META[stage];
    const isOpen = openId === b.id;

    return (
      <li key={b.id} data-booking-id={b.id} data-stage={stage} className="bg-white rounded-3xl border border-[#E2E8F0] shadow-xs p-4 sm:p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-['Cairo'] text-base font-extrabold text-[#1F2A44]">{t.fullDateLabel}</p>
            <p className="text-sm text-[#475569]">
              {t.timeRangeLabel} · {t.timezoneLabel}
            </p>
            <p className="mt-1 text-sm text-[#475569] flex items-center gap-1.5">
              <User className="w-4 h-4 text-[#94A3B8] shrink-0" strokeWidth={1.75} />
              <span className="truncate">
                {ex?.childName ? `${ex.childName}${ex.childGrade ? ` · ${ex.childGrade}` : ''}` : 'تجربة مجانية'}
                {guardianName ? ` — وليّ الأمر: ${guardianName}` : ''}
              </span>
            </p>
          </div>
          <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-extrabold ${meta.chip}`}>{meta.label}</span>
        </div>

        {/* Meeting link (before/at the session) */}
        {(stage === 'needs_link' || stage === 'upcoming') && (
          <div className="space-y-2">
            {b.meetingUrl && (
              <a
                href={b.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-bold text-[#0D4E8B] hover:underline"
              >
                <ExternalLink className="w-4 h-4" />
                <span>فتح رابط الحصة</span>
              </a>
            )}
            <div className="flex gap-2">
              <input
                type="url"
                dir="ltr"
                aria-label="رابط الحصة"
                value={linkInput[b.id] ?? b.meetingUrl ?? ''}
                onChange={(e) => setLinkInput((p) => ({ ...p, [b.id]: e.target.value }))}
                placeholder="https://meet.google.com/..."
                className={`${inputCls} h-11 flex-1 min-w-0`}
              />
              <button
                type="button"
                onClick={() => saveLink(b)}
                disabled={busyId === b.id}
                className="h-11 px-4 rounded-2xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-sm font-extrabold flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-60"
              >
                {busyId === b.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                <span>{b.meetingUrl ? 'تحديث' : 'حفظ الرابط'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Report (after the session) */}
        {(stage === 'needs_report' || stage === 'done') && b.status !== 'cancelled' && (
          <>
            {report && !isOpen && (
              <div className="p-3.5 rounded-2xl bg-[#F8FAFC] space-y-1 text-sm text-[#334155]">
                <p className="font-bold text-[#1F2A44] flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-[#0D4E8B]" strokeWidth={1.75} />
                  {report.attended ? 'الطفل حضر' : 'الطفل ما حضرش'}
                </p>
                {report.levelSummary && <p><span className="text-[#64748B]">المستوى: </span>{report.levelSummary}</p>}
                {report.recommendation && <p><span className="text-[#64748B]">التوصية: </span>{report.recommendation}</p>}
              </div>
            )}

            {reportsAvailable && !isOpen && (
              <button
                type="button"
                onClick={() => openReport(b)}
                className={`w-full min-h-[44px] rounded-2xl text-sm font-extrabold flex items-center justify-center gap-1.5 cursor-pointer ${
                  report
                    ? 'border border-[#CBD5E1] text-[#0D4E8B] hover:bg-[#F8FAFC]'
                    : 'bg-[#0D4E8B] hover:bg-[#003767] text-white'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>{report ? 'تعديل التقرير' : 'اكتب تقرير الحصة'}</span>
              </button>
            )}

            {!reportsAvailable && b.status === 'confirmed' && (
              <button
                type="button"
                onClick={() => markCompleted(b)}
                disabled={busyId === b.id}
                className="w-full min-h-[44px] rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-extrabold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>تسجيل إتمام الحصة</span>
              </button>
            )}

            {isOpen && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveReport(b);
                }}
                aria-label="تقرير الحصة"
                className="p-4 rounded-2xl bg-[#F8FAFC] space-y-3"
              >
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="الحضور">
                  {[
                    { v: true, label: 'الطفل حضر' },
                    { v: false, label: 'الطفل ما حضرش' },
                  ].map((o) => (
                    <button
                      key={String(o.v)}
                      type="button"
                      role="radio"
                      aria-checked={form.attended === o.v}
                      onClick={() => setForm((f) => ({ ...f, attended: o.v }))}
                      className={`h-11 rounded-2xl border-2 text-sm font-extrabold cursor-pointer ${
                        form.attended === o.v ? 'border-[#0D4E8B] bg-[#EBF3FC] text-[#0D4E8B]' : 'border-[#E2E8F0] bg-white text-[#1F2A44]'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                {(
                  [
                    ['levelSummary', 'مستوى الطفل', 'مثال: بيقرأ الحروف كويس ومحتاج يركّز على المدود'],
                    ['covered', 'اتعمل إيه في الحصة', 'مثال: مراجعة مخارج الحروف وقراءة سورة الفاتحة'],
                    ['recommendation', 'توصيتك', 'مثال: حصتين في الأسبوع ٥٠ دقيقة'],
                    ['homework', 'واجب أو متابعة (اختياري)', 'مثال: تكرار سورة الإخلاص يوميًا'],
                  ] as const
                ).map(([key, label, ph]) => (
                  <label key={key} className="block space-y-1">
                    <span className="text-sm font-bold text-[#1F2A44]">{label}</span>
                    <textarea
                      rows={2}
                      maxLength={1000}
                      value={form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      placeholder={ph}
                      className={`${inputCls} py-2.5`}
                    />
                  </label>
                ))}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={busyId === b.id}
                    className="flex-1 min-h-[44px] rounded-2xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-sm font-extrabold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    {busyId === b.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    <span>حفظ التقرير</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenId(null)}
                    className="min-h-[44px] px-4 rounded-2xl border border-[#CBD5E1] bg-white text-sm font-bold text-[#1F2A44] cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            )}
          </>
        )}

        {rowError[b.id] && <p role="alert" className="text-sm font-bold text-rose-700">{rowError[b.id]}</p>}
        {rowOk[b.id] && <p role="status" className="text-sm font-bold text-emerald-700">{rowOk[b.id]}</p>}
      </li>
    );
  };

  const section = (title: string, items: Array<{ b: DirectTrialBooking; stage: Stage }>, hint?: string) =>
    items.length > 0 && (
      <section aria-label={title} className="space-y-2.5">
        <div className="px-1">
          <h3 className="font-['Cairo'] text-base font-extrabold text-[#1F2A44]">
            {title} <span className="text-sm font-bold text-[#64748B]">({toArabicDigits(items.length)})</span>
          </h3>
          {hint && <p className="text-xs text-[#64748B]">{hint}</p>}
        </div>
        <ul className="space-y-3">{items.map(renderCard)}</ul>
      </section>
    );

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-['Cairo'] text-lg font-extrabold text-[#1F2A44]">الحجوزات التجريبية</h2>
          <p className="text-sm text-[#64748B]">أضف رابط الحصة قبلها، واكتب تقرير قصير بعدها.</p>
        </div>
        <button
          type="button"
          onClick={() => Promise.all([onRefresh(), loadExtras()])}
          disabled={isLoading}
          aria-label="تحديث"
          className="w-11 h-11 rounded-2xl border border-[#E2E8F0] bg-white text-[#475569] hover:bg-[#F8FAFC] flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} strokeWidth={1.75} />
        </button>
      </div>

      {notice && (
        <p role="status" className="px-4 py-3 rounded-2xl bg-emerald-50 text-emerald-800 text-sm font-bold flex items-center justify-between gap-2">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-xs underline cursor-pointer">إغلاق</button>
        </p>
      )}
      {loadError && <p role="alert" className="px-4 py-3 rounded-2xl bg-rose-50 text-rose-800 text-sm font-bold">{loadError}</p>}

      {isLoading && bookings.length === 0 ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[#0D4E8B]" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="bg-white rounded-3xl border border-[#E2E8F0] p-8 text-center space-y-2">
          <CalendarCheck2 className="w-10 h-10 text-[#CBD5E1] mx-auto" strokeWidth={1.5} />
          <p className="font-['Cairo'] text-base font-extrabold text-[#1F2A44]">مفيش حجوزات لسه</p>
          <p className="text-sm text-[#64748B]">أول ما وليّ أمر يحجز تجربة معاك هتظهر هنا.</p>
        </div>
      ) : (
        <>
          {section('محتاجة منك', grouped.action, 'رابط الحصة قبل المعاد، أو التقرير بعدها.')}
          {section('القادمة', grouped.upcoming)}
          {grouped.past.length > 0 && (
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => setShowPast((v) => !v)}
                aria-expanded={showPast}
                className="w-full px-1 flex items-center justify-between text-right cursor-pointer"
              >
                <span className="font-['Cairo'] text-base font-extrabold text-[#1F2A44]">
                  السابقة <span className="text-sm font-bold text-[#64748B]">({toArabicDigits(grouped.past.length)})</span>
                </span>
                <ChevronDown className={`w-5 h-5 text-[#64748B] transition-transform ${showPast ? 'rotate-180' : ''}`} />
              </button>
              {showPast && <ul className="space-y-3">{grouped.past.map(renderCard)}</ul>}
            </div>
          )}
        </>
      )}
    </div>
  );
};
