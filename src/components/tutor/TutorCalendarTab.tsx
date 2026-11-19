import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ApprovedSpecializationItem,
  DirectTrialBooking,
  TutorAvailableSlot,
  TutorPrivateSlot,
} from '../../types';
import { TutorPortalService } from '../../services/tutorPortalService';
import { DirectTrialBookingService } from '../../services/directTrialBookingService';
import {
  SUPPORTED_TUTOR_TIMEZONES,
  addDaysToCalendarDate,
  addMinutesToTimeStr,
  formatTimeArabic12h,
  getCalendarDayOfWeek,
  getTimezoneArabicLabel,
  getTodayCalendarDateInTimezone,
  isSlotInFuture,
  parseCalendarDateParts,
  toArabicDigits,
} from '../../utils/formatters';
import { hasBookingEnded, validateMeetingUrl } from '../../utils/directTrialBooking';
import {
  TUTOR_CALENDAR_KIND_META,
  TutorCalendarEvent,
  TutorCalendarEventKind,
  buildTutorCalendarEvents,
  getCalendarHourRange,
  getCalendarWeekDates,
  timeToMinutes,
} from '../../utils/tutorCalendar';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  EyeOff,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Trash2,
  Video,
  X,
} from 'lucide-react';

export type TutorCalendarAddType = 'trial' | 'private';

export interface TutorCalendarAddRequest {
  type: TutorCalendarAddType;
  nonce: number;
}

interface TutorCalendarTabProps {
  isPublished: boolean;
  defaultPrice: number;
  defaultCurrency: string;
  defaultDurationMinutes: number;
  trialSlots: TutorAvailableSlot[];
  privateSlots: TutorPrivateSlot[];
  directTrialBookings: DirectTrialBooking[];
  specializations: ApprovedSpecializationItem[];
  isLoading: boolean;
  loadError: string | null;
  reloadTrialSlots: (options?: { throwOnError?: boolean }) => Promise<TutorAvailableSlot[]>;
  reloadPrivateSlots: (options?: { throwOnError?: boolean }) => Promise<TutorPrivateSlot[]>;
  reloadDirectTrials: () => Promise<void>;
  /** Opens the add dialog (e.g. from a button on the home page). */
  addRequest?: TutorCalendarAddRequest | null;
}

const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const HOUR_PX = 56;
const DURATION_OPTIONS = [30, 40, 45, 50, 60, 75, 90, 120];
const DEFAULT_TZ = 'Africa/Cairo';

const normalizeDigits = (value: string) =>
  String(value ?? '')
    .trim()
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

function formatDayNumber(date: string): string {
  const parts = parseCalendarDateParts(date);
  return parts ? toArabicDigits(parts.day) : '';
}

function formatLongDate(date: string): string {
  const parts = parseCalendarDateParts(date);
  if (!parts) return date;
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
  try {
    return new Intl.DateTimeFormat('ar-EG', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(d);
  } catch {
    return date;
  }
}

function formatWeekRange(dates: string[]): string {
  if (dates.length === 0) return '';
  const first = parseCalendarDateParts(dates[0]);
  const last = parseCalendarDateParts(dates[dates.length - 1]);
  if (!first || !last) return '';
  const fmt = (p: { year: number; month: number; day: number }, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('ar-EG', { ...opts, timeZone: 'UTC' }).format(
      new Date(Date.UTC(p.year, p.month - 1, p.day, 12))
    );
  const lastLabel = fmt(last, { day: 'numeric', month: 'long', year: 'numeric' });
  const firstLabel =
    first.month === last.month ? fmt(first, { day: 'numeric' }) : fmt(first, { day: 'numeric', month: 'long' });
  return `${firstLabel} – ${lastLabel}`;
}

function timeRangeLabel(ev: TutorCalendarEvent): string {
  return `${formatTimeArabic12h(ev.startTime)} – ${formatTimeArabic12h(ev.endTime)}`;
}

/** Assigns side-by-side lanes to overlapping events of one day. */
function layoutDayEvents(events: TutorCalendarEvent[]) {
  const sorted = [...events].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  const result: Array<{ ev: TutorCalendarEvent; lane: number; lanes: number }> = [];
  let cluster: Array<{ ev: TutorCalendarEvent; lane: number; end: number }> = [];
  let clusterEnd = -1;

  const flush = () => {
    const lanes = cluster.reduce((max, c) => Math.max(max, c.lane + 1), 1);
    cluster.forEach((c) => result.push({ ev: c.ev, lane: c.lane, lanes }));
    cluster = [];
  };

  for (const ev of sorted) {
    const start = timeToMinutes(ev.startTime);
    const rawEnd = timeToMinutes(ev.endTime);
    const end = rawEnd > start ? rawEnd : start + 20;
    if (cluster.length > 0 && start >= clusterEnd) {
      flush();
      clusterEnd = -1;
    }
    const usedLanes = new Set(cluster.filter((c) => c.end > start).map((c) => c.lane));
    let lane = 0;
    while (usedLanes.has(lane)) lane += 1;
    cluster.push({ ev, lane, end });
    clusterEnd = Math.max(clusterEnd, end);
  }
  if (cluster.length > 0) flush();
  return result;
}

export const TutorCalendarTab: React.FC<TutorCalendarTabProps> = ({
  isPublished,
  defaultPrice,
  defaultCurrency,
  defaultDurationMinutes,
  trialSlots,
  privateSlots,
  directTrialBookings,
  specializations,
  isLoading,
  loadError,
  reloadTrialSlots,
  reloadPrivateSlots,
  reloadDirectTrials,
  addRequest,
}) => {
  const today = getTodayCalendarDateInTimezone(DEFAULT_TZ);
  const [anchorDate, setAnchorDate] = useState(today);
  const [selectedDate, setSelectedDate] = useState(today);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Add dialog
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addType, setAddType] = useState<TutorCalendarAddType>('trial');
  const [addDate, setAddDate] = useState(today);
  const [addStart, setAddStart] = useState('17:00');
  const [addTimezone, setAddTimezone] = useState<string>(DEFAULT_TZ);
  const [addDuration, setAddDuration] = useState<number>(defaultDurationMinutes || 50);
  const [addPriceInput, setAddPriceInput] = useState<string>(String(defaultPrice || ''));
  const [addSpecIds, setAddSpecIds] = useState<string[]>([]);
  const [addError, setAddError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Details dialog
  const [selectedEvent, setSelectedEvent] = useState<TutorCalendarEvent | null>(null);
  const [meetingInput, setMeetingInput] = useState('');
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailSuccess, setDetailSuccess] = useState<string | null>(null);
  const [isDetailBusy, setIsDetailBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Confirmed private bookings (names) — loaded once, optional details
  const [privateBookingInfo, setPrivateBookingInfo] = useState<Record<string, any>>({});
  useEffect(() => {
    let active = true;
    TutorPortalService.getMyConfirmedPrivateBookings()
      .then((rows) => {
        if (!active) return;
        const map: Record<string, any> = {};
        (rows || []).forEach((r: any) => {
          if (r?.slotId) map[String(r.slotId)] = r;
        });
        setPrivateBookingInfo(map);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [privateSlots]);

  const openAddDialog = (type: TutorCalendarAddType, date?: string, start?: string) => {
    setAddType(type);
    const safeDate = date && date >= today ? date : today;
    setAddDate(safeDate);
    setAddStart(start || '17:00');
    setAddTimezone(DEFAULT_TZ);
    setAddDuration(defaultDurationMinutes || 50);
    setAddPriceInput(String(defaultPrice || ''));
    setAddSpecIds(specializations.map((s) => s.id));
    setAddError(null);
    setIsAddOpen(true);
  };

  useEffect(() => {
    if (addRequest) openAddDialog(addRequest.type);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addRequest?.nonce]);

  const events = useMemo(
    () => buildTutorCalendarEvents({ trialSlots, privateSlots, directTrialBookings }),
    [trialSlots, privateSlots, directTrialBookings]
  );
  const weekDates = useMemo(() => getCalendarWeekDates(anchorDate), [anchorDate]);
  const weekEvents = useMemo(
    () => events.filter((ev) => weekDates.includes(ev.date)),
    [events, weekDates]
  );
  const { startHour, endHour } = useMemo(() => getCalendarHourRange(weekEvents), [weekEvents]);
  const hours = useMemo(
    () => Array.from({ length: endHour - startHour }, (_, i) => startHour + i),
    [startHour, endHour]
  );

  // Scroll the desktop grid to the first appointment of the week (or 4 PM when empty)
  const gridScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = gridScrollRef.current;
    if (!el) return;
    const firstMinutes = weekEvents.length
      ? Math.min(...weekEvents.map((ev) => timeToMinutes(ev.startTime)))
      : 16 * 60;
    const targetHour = Math.max(startHour, Math.floor(firstMinutes / 60) - 1);
    el.scrollTop = (targetHour - startHour) * HOUR_PX;
  }, [anchorDate, weekEvents, startHour, isLoading]);

  const countsByKind = useMemo(() => {
    const counts: Partial<Record<TutorCalendarEventKind, number>> = {};
    weekEvents.forEach((ev) => {
      counts[ev.kind] = (counts[ev.kind] || 0) + 1;
    });
    return counts;
  }, [weekEvents]);

  const needsLinkCount = directTrialBookings.filter((b) => b.status === 'confirmed' && !b.meetingUrl).length;

  const goToWeek = (offsetDays: number) => {
    const next = addDaysToCalendarDate(anchorDate, offsetDays);
    setAnchorDate(next);
    const nextWeek = getCalendarWeekDates(next);
    setSelectedDate(nextWeek.includes(today) ? today : nextWeek[0]);
  };

  const goToToday = () => {
    setAnchorDate(today);
    setSelectedDate(today);
  };

  const refreshAll = async () => {
    setIsRefreshing(true);
    try {
      await Promise.allSettled([reloadTrialSlots(), reloadPrivateSlots(), reloadDirectTrials()]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const openEvent = (ev: TutorCalendarEvent) => {
    setSelectedEvent(ev);
    setMeetingInput(ev.booking?.meetingUrl || '');
    setDetailError(null);
    setDetailSuccess(null);
    setConfirmDelete(false);
  };

  // Keep the open details dialog in sync after reloads
  useEffect(() => {
    if (!selectedEvent) return;
    const fresh = events.find((e) => e.id === selectedEvent.id);
    if (fresh && fresh !== selectedEvent) setSelectedEvent(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  const visibilityText = isPublished
    ? 'ملفك منشور: المواعيد المتاحة تظهر لأولياء الأمور ويقدروا يحجزوها.'
    : 'ملفك غير منشور: المواعيد اللي بتضيفها محفوظة وظاهرة لك هنا وفي «شوف ملفك زي ولي الأمر» فقط، ولن تظهر لأولياء الأمور إلا بعد نشر ملفك من الإدارة.';

  // ------------------------------------------------------------------ Save new slot
  const handleSaveSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    const date = addDate.trim().slice(0, 10);
    const start = addStart.trim().slice(0, 5);

    if (!date || !start) {
      setAddError('اختر التاريخ ووقت البداية.');
      return;
    }
    if (!isSlotInFuture(date, start, addTimezone)) {
      setAddError('الموعد لازم يكون في وقت لسه ما جاش. اختر تاريخًا أو وقتًا لاحقًا.');
      return;
    }

    setIsSaving(true);
    try {
      if (addType === 'trial') {
        const end = addMinutesToTimeStr(start, 20);
        const res = await TutorPortalService.createSlot(date, start, end, addTimezone);
        const refreshed = await reloadTrialSlots({ throwOnError: true });
        const found = refreshed.some((s) =>
          res.slotId
            ? s.id === res.slotId
            : String(s.slotDate).slice(0, 10) === date && String(s.startTime).slice(0, 5) === start
        );
        if (!found) {
          throw new Error('تم إرسال الموعد، لكنه لم يظهر بعد إعادة التحميل. اضغط «تحديث» وتأكد قبل الإضافة مرة أخرى.');
        }
      } else {
        const chosenSpecs = specializations.filter((s) => addSpecIds.includes(s.id));
        if (chosenSpecs.length === 0) {
          throw new Error('اختر تخصصًا معتمدًا واحدًا على الأقل للحصة الخاصة.');
        }
        const priceStr = normalizeDigits(addPriceInput);
        const price = Number(priceStr);
        if (!priceStr || !/^[0-9]+$/.test(priceStr) || price < 0 || price > 100000) {
          throw new Error('اكتب سعر الحصة رقمًا صحيحًا بدون كسور (من 0 إلى 100000).');
        }
        const end = addMinutesToTimeStr(start, addDuration);
        await TutorPortalService.createPrivateSlots({
          specializations: chosenSpecs,
          durationMinutes: addDuration,
          priceAmount: price,
          currency: defaultCurrency || 'ج.م',
          timezone: addTimezone,
          slots: [{ date, startTime: start, endTime: end }],
        });
        const refreshed = await reloadPrivateSlots({ throwOnError: true });
        const found = refreshed.some(
          (s) => String(s.slotDate).slice(0, 10) === date && String(s.startTime).slice(0, 5) === start
        );
        if (!found) {
          throw new Error('تم إرسال الموعد، لكنه لم يظهر بعد إعادة التحميل. اضغط «تحديث» وتأكد قبل الإضافة مرة أخرى.');
        }
      }

      setIsAddOpen(false);
      setAnchorDate(date);
      setSelectedDate(date);
      setNotice({
        type: 'success',
        text: `تم حفظ الموعد ${addType === 'trial' ? 'التجريبي' : 'الخاص'} يوم ${formatLongDate(date)} الساعة ${formatTimeArabic12h(start)}${
          isPublished ? '، وأصبح متاحًا لأولياء الأمور.' : '. ظاهر لك هنا وفي المعاينة فقط حتى نشر ملفك.'
        }`,
      });
    } catch (err: any) {
      setAddError(err?.message || 'تعذر حفظ الموعد. حاول مرة أخرى.');
    } finally {
      setIsSaving(false);
    }
  };

  // ------------------------------------------------------------------ Details actions
  const handleSaveMeetingLink = async () => {
    const booking = selectedEvent?.booking;
    if (!booking) return;
    setDetailError(null);
    setDetailSuccess(null);
    const validation = validateMeetingUrl(meetingInput);
    if (!validation.isValid) {
      setDetailError(validation.error || 'اكتب رابط Google Meet أو Zoom صحيح.');
      return;
    }
    setIsDetailBusy(true);
    try {
      await DirectTrialBookingService.tutorSetDirectTrialMeeting({
        bookingId: booking.id,
        meetingUrl: validation.normalizedUrl,
      });
      setMeetingInput(validation.normalizedUrl);
      await reloadDirectTrials();
      setDetailSuccess(`تم حفظ رابط ${validation.providerLabel}، وظهر لوليّ الأمر في صفحة «حجوزاتي».`);
    } catch (err: any) {
      setDetailError(err?.message || 'تعذر حفظ رابط الحصة.');
    } finally {
      setIsDetailBusy(false);
    }
  };

  const handleMarkCompleted = async () => {
    const booking = selectedEvent?.booking;
    if (!booking) return;
    setDetailError(null);
    setIsDetailBusy(true);
    try {
      await DirectTrialBookingService.tutorMarkDirectTrialCompleted(booking.id);
      await reloadDirectTrials();
      setDetailSuccess('تم تسجيل إتمام الحصة.');
    } catch (err: any) {
      setDetailError(err?.message || 'تعذر تسجيل إتمام الحصة.');
    } finally {
      setIsDetailBusy(false);
    }
  };

  const handleDeleteSlot = async () => {
    if (!selectedEvent) return;
    setDetailError(null);
    setIsDetailBusy(true);
    try {
      if (selectedEvent.trialSlot) {
        await TutorPortalService.deleteSlot(selectedEvent.trialSlot.id);
        await reloadTrialSlots();
      } else if (selectedEvent.privateSlot) {
        await TutorPortalService.deletePrivateSlot(selectedEvent.privateSlot.id);
        await reloadPrivateSlots();
      }
      setSelectedEvent(null);
      setNotice({ type: 'success', text: 'تم حذف الموعد.' });
    } catch (err: any) {
      setDetailError(err?.message || 'تعذر حذف الموعد.');
    } finally {
      setIsDetailBusy(false);
      setConfirmDelete(false);
    }
  };

  // ------------------------------------------------------------------ Render helpers
  const renderEventChip = (ev: TutorCalendarEvent, compact: boolean) => {
    const meta = TUTOR_CALENDAR_KIND_META[ev.kind];
    const missingLink = ev.kind === 'trial_booking' && ev.booking && !ev.booking.meetingUrl;
    if (compact) {
      return (
        <span className="flex items-center gap-1 min-w-0 text-right text-[10px] leading-tight">
          <span className="font-bold truncate">{meta.label}</span>
          <span className="opacity-90 shrink-0">· {formatTimeArabic12h(ev.startTime)}</span>
          {missingLink && <span className="w-2 h-2 rounded-full bg-amber-300 shrink-0" title="أضف الرابط" />}
        </span>
      );
    }
    return (
      <span className="flex flex-col gap-0.5 min-w-0 text-right">
        <span className={`font-bold truncate ${compact ? 'text-[10px]' : 'text-xs'}`}>
          {meta.label}
        </span>
        <span className={`truncate ${compact ? 'text-[10px]' : 'text-[11px]'} opacity-90`}>
          {formatTimeArabic12h(ev.startTime)}
        </span>
        {missingLink && (
          <span className="text-[10px] font-bold bg-amber-300 text-amber-950 rounded px-1 self-start">
            أضف الرابط
          </span>
        )}
      </span>
    );
  };

  const isCellInPast = (date: string, hour: number) =>
    !isSlotInFuture(date, `${String(hour).padStart(2, '0')}:59`, DEFAULT_TZ);

  const dayEvents = (date: string) => weekEvents.filter((ev) => ev.date === date);

  // ------------------------------------------------------------------ Render
  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header: title, visibility, add button */}
      <div className="bg-white rounded-3xl border border-[#E2E8F0] p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#EBF3FC] text-[#0D4E8B] flex items-center justify-center shrink-0">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-['Cairo'] text-base sm:text-lg font-extrabold text-[#1F2A44]">التقويم</h2>
              <p className="text-[11px] sm:text-xs text-[#64748B]">مواعيدك المتاحة وحجوزاتك في مكان واحد</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refreshAll}
              disabled={isRefreshing || isLoading}
              className="h-11 px-3 rounded-xl border border-[#CBD5E1] text-xs font-bold text-[#1F2A44] hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">تحديث</span>
            </button>
            <button
              type="button"
              onClick={() => openAddDialog('trial', selectedDate)}
              className="h-11 px-4 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs sm:text-sm font-bold font-['Cairo'] flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة موعد</span>
            </button>
          </div>
        </div>

        <div
          className={`p-3 rounded-2xl border text-xs leading-relaxed flex items-start gap-2 ${
            isPublished
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-200 text-amber-950'
          }`}
        >
          {isPublished ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700" />
          ) : (
            <EyeOff className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
          )}
          <span className="font-bold">{visibilityText}</span>
        </div>

        {/* Legend */}
        <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2" aria-label="دليل الألوان">
          {(['trial_available', 'private_available', 'trial_booking'] as TutorCalendarEventKind[]).map((kind) => {
            const meta = TUTOR_CALENDAR_KIND_META[kind];
            const count =
              kind === 'trial_booking'
                ? (countsByKind.trial_booking || 0) + (countsByKind.private_booking || 0)
                : countsByKind[kind] || 0;
            return (
              <li key={kind} className={`px-2.5 py-2 sm:p-2.5 rounded-xl border flex items-start gap-2 ${meta.chipClass}`}>
                <span className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${meta.dotClass} ring-2 ring-white`} />
                <span className="min-w-0">
                  <span className="block text-xs font-bold">
                    {kind === 'trial_booking' ? 'حجز مؤكد' : meta.label}{' '}
                    <span className="tabular-nums">({toArabicDigits(count)} هذا الأسبوع)</span>
                  </span>
                  <span className="block text-[10px] sm:text-[11px] opacity-90">
                    {kind === 'trial_booking' ? 'وليّ أمر حجز الموعد — اضغط لعرض التفاصيل ورابط الحصة' : meta.description}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>

        {needsLinkCount > 0 && (
          <div className="p-3 rounded-2xl bg-amber-100 border border-amber-300 text-amber-950 text-xs font-bold flex items-center gap-2">
            <Video className="w-4 h-4 shrink-0" />
            <span>
              عندك {toArabicDigits(needsLinkCount)} حجز تجريبي بدون رابط حصة. اضغط على الحجز في التقويم وأضف رابط Google Meet أو Zoom.
            </span>
          </div>
        )}

        {notice && (
          <div
            role={notice.type === 'error' ? 'alert' : 'status'}
            className={`p-3 rounded-2xl border text-xs font-bold flex items-start justify-between gap-2 ${
              notice.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <span className="flex items-start gap-2">
              {notice.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span>{notice.text}</span>
            </span>
            <button type="button" onClick={() => setNotice(null)} aria-label="إغلاق" className="cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {loadError && (
          <div role="alert" className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold">
            {loadError}
          </div>
        )}
      </div>

      {/* Week navigation */}
      <div className="bg-white rounded-3xl border border-[#E2E8F0] shadow-xs overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 sm:p-4 border-b border-[#F1F5F9]">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => goToWeek(-7)}
              aria-label="الأسبوع السابق"
              className="w-10 h-10 rounded-xl border border-[#CBD5E1] hover:bg-slate-50 flex items-center justify-center cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => goToWeek(7)}
              aria-label="الأسبوع التالي"
              className="w-10 h-10 rounded-xl border border-[#CBD5E1] hover:bg-slate-50 flex items-center justify-center cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-['Cairo'] text-sm sm:text-base font-bold text-[#1F2A44] mx-1">
              {formatWeekRange(weekDates)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#64748B] hidden sm:inline">
              الأوقات {getTimezoneArabicLabel(DEFAULT_TZ)} ما لم يُذكر غير ذلك
            </span>
            <button
              type="button"
              onClick={goToToday}
              className="h-10 px-3 rounded-xl bg-[#F0F6FD] text-[#0D4E8B] text-xs font-bold hover:bg-[#E2EFFD] cursor-pointer"
            >
              اليوم
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="p-10 text-center text-xs text-[#64748B] flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>جاري تحميل مواعيدك...</span>
          </div>
        ) : (
          <>
            {/* ---------------- Desktop: week grid ---------------- */}
            <div className="hidden md:block overflow-x-auto" data-testid="calendar-week-grid">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-[#E2E8F0] bg-[#F8FAFC]">
                  <div />
                  {weekDates.map((date) => {
                    const isToday = date === today;
                    return (
                      <div
                        key={date}
                        className={`py-2.5 text-center border-r border-[#E2E8F0] ${
                          isToday ? 'text-[#0D4E8B]' : 'text-[#1F2A44]'
                        }`}
                      >
                        <span className="block text-xs font-bold">{DAY_NAMES[getCalendarDayOfWeek(date)]}</span>
                        <span
                          className={`inline-flex items-center justify-center w-7 h-7 mt-0.5 rounded-full text-sm font-extrabold tabular-nums ${
                            isToday ? 'bg-[#0D4E8B] text-white' : ''
                          }`}
                        >
                          {formatDayNumber(date)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div
                  ref={gridScrollRef}
                  className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] max-h-[560px] overflow-y-auto"
                >
                  {/* Hours column */}
                  <div>
                    {hours.map((h) => (
                      <div
                        key={h}
                        style={{ height: HOUR_PX }}
                        className="text-[10px] text-[#64748B] text-center pt-1 border-b border-[#F1F5F9] tabular-nums"
                      >
                        {formatTimeArabic12h(`${String(h).padStart(2, '0')}:00`)}
                      </div>
                    ))}
                  </div>

                  {weekDates.map((date) => (
                    <div
                      key={date}
                      className={`relative border-r border-[#E2E8F0] ${date === today ? 'bg-[#F8FBFF]' : ''}`}
                      style={{ height: hours.length * HOUR_PX }}
                    >
                      {hours.map((h) => {
                        const past = isCellInPast(date, h);
                        return (
                          <button
                            key={h}
                            type="button"
                            disabled={past}
                            onClick={() => openAddDialog('trial', date, `${String(h).padStart(2, '0')}:00`)}
                            aria-label={`إضافة موعد ${DAY_NAMES[getCalendarDayOfWeek(date)]} ${formatTimeArabic12h(
                              `${String(h).padStart(2, '0')}:00`
                            )}`}
                            style={{ height: HOUR_PX }}
                            className={`group block w-full border-b border-[#F1F5F9] ${
                              past ? 'bg-slate-50/70 cursor-default' : 'hover:bg-[#F0F6FD] cursor-pointer'
                            }`}
                          >
                            {!past && (
                              <span className="hidden group-hover:flex items-center justify-center gap-1 text-[10px] font-bold text-[#0D4E8B]">
                                <Plus className="w-3 h-3" /> إضافة
                              </span>
                            )}
                          </button>
                        );
                      })}

                      {layoutDayEvents(dayEvents(date)).map(({ ev, lane, lanes }) => {
                        const startMin = timeToMinutes(ev.startTime);
                        const endMinRaw = timeToMinutes(ev.endTime);
                        const endMin = endMinRaw > startMin ? endMinRaw : startMin + 20;
                        const top = ((startMin - startHour * 60) / 60) * HOUR_PX;
                        const height = Math.max(30, ((endMin - startMin) / 60) * HOUR_PX - 2);
                        const width = 100 / lanes;
                        const meta = TUTOR_CALENDAR_KIND_META[ev.kind];
                        return (
                          <button
                            key={ev.id}
                            type="button"
                            data-kind={ev.kind}
                            onClick={() => openEvent(ev)}
                            title={`${meta.label} — ${timeRangeLabel(ev)}`}
                            className={`absolute rounded-lg border px-1.5 py-1 shadow-xs overflow-hidden hover:brightness-95 cursor-pointer z-10 ${meta.chipClass}`}
                            style={{ top: top + 1, height, right: `${lane * width}%`, width: `calc(${width}% - 3px)` }}
                          >
                            {renderEventChip(ev, height < 44)}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ---------------- Mobile: day strip + list ---------------- */}
            <div className="md:hidden" data-testid="calendar-day-list">
              <div className="grid grid-cols-7 gap-1 p-2 border-b border-[#F1F5F9]" role="tablist">
                {weekDates.map((date) => {
                  const isSelected = date === selectedDate;
                  const isToday = date === today;
                  const kinds = Array.from(new Set(dayEvents(date).map((ev) => ev.kind)));
                  return (
                    <button
                      key={date}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      onClick={() => setSelectedDate(date)}
                      className={`py-2 rounded-xl flex flex-col items-center gap-0.5 cursor-pointer ${
                        isSelected
                          ? 'bg-[#0D4E8B] text-white'
                          : isToday
                          ? 'bg-[#EBF3FC] text-[#0D4E8B]'
                          : 'text-[#1F2A44]'
                      }`}
                    >
                      <span className="text-[10px] font-bold">{DAY_NAMES[getCalendarDayOfWeek(date)].replace('ال', '')}</span>
                      <span className="text-base font-extrabold tabular-nums">{formatDayNumber(date)}</span>
                      <span className="flex gap-0.5 h-1.5">
                        {kinds.slice(0, 3).map((k) => (
                          <span
                            key={k}
                            className={`w-1.5 h-1.5 rounded-full ${TUTOR_CALENDAR_KIND_META[k].dotClass} ${
                              isSelected ? 'ring-1 ring-white' : ''
                            }`}
                          />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="font-['Cairo'] text-sm font-bold text-[#1F2A44]">{formatLongDate(selectedDate)}</h3>
                  <span className="text-[11px] text-[#64748B]">
                    {toArabicDigits(dayEvents(selectedDate).length)} موعد
                  </span>
                </div>

                {dayEvents(selectedDate).length === 0 ? (
                  <div className="p-6 text-center border-2 border-dashed border-[#CBD5E1] rounded-2xl space-y-2">
                    <Clock className="w-7 h-7 text-[#CBD5E1] mx-auto" />
                    <p className="text-xs font-bold text-[#64748B]">مفيش مواعيد في اليوم ده.</p>
                    {selectedDate >= today && (
                      <button
                        type="button"
                        onClick={() => openAddDialog('trial', selectedDate)}
                        className="px-4 py-2 min-h-[40px] rounded-xl bg-[#F0F6FD] text-[#0D4E8B] text-xs font-bold cursor-pointer"
                      >
                        إضافة موعد في اليوم ده
                      </button>
                    )}
                  </div>
                ) : (
                  dayEvents(selectedDate).map((ev) => {
                    const meta = TUTOR_CALENDAR_KIND_META[ev.kind];
                    const missingLink = ev.kind === 'trial_booking' && ev.booking && !ev.booking.meetingUrl;
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        data-kind={ev.kind}
                        onClick={() => openEvent(ev)}
                        className={`w-full p-3 rounded-2xl border flex items-center justify-between gap-3 text-right cursor-pointer ${meta.chipClass}`}
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-extrabold">{timeRangeLabel(ev)}</span>
                          <span className="block text-xs font-bold mt-0.5">{meta.label}</span>
                          {ev.privateSlot && ev.kind !== 'private_booking' && (
                            <span className="block text-[11px] opacity-90 mt-0.5">
                              {toArabicDigits(ev.privateSlot.priceAmount)} {ev.privateSlot.currency} ·{' '}
                              {ev.privateSlot.specializationLabel}
                            </span>
                          )}
                          {missingLink && (
                            <span className="inline-block mt-1 text-[10px] font-bold bg-amber-300 text-amber-950 rounded px-1.5 py-0.5">
                              لم تتم إضافة رابط الحصة
                            </span>
                          )}
                        </span>
                        <ChevronLeft className="w-4 h-4 shrink-0 opacity-70" />
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ---------------- Add slot dialog ---------------- */}
      {isAddOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#1F2A44]/50 flex items-end sm:items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="calendar-add-title"
          dir="rtl"
        >
          <form
            onSubmit={handleSaveSlot}
            noValidate
            className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl p-5 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 id="calendar-add-title" className="font-['Cairo'] text-base font-extrabold text-[#1F2A44]">
                إضافة موعد
              </h3>
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                aria-label="إغلاق"
                className="w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="نوع الموعد">
              {(
                [
                  { value: 'trial', title: 'تجريبي مجاني', sub: '٢٠ دقيقة' },
                  { value: 'private', title: 'حصة خاصة', sub: 'مدفوعة بسعرك' },
                ] as const
              ).map((opt) => {
                const selected = addType === opt.value;
                const meta = TUTOR_CALENDAR_KIND_META[opt.value === 'trial' ? 'trial_available' : 'private_available'];
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setAddType(opt.value)}
                    className={`p-3 rounded-2xl border-2 text-right cursor-pointer ${
                      selected ? `${meta.chipClass} border-current` : 'border-[#E2E8F0] text-[#1F2A44]'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-bold">
                      <span className={`w-2.5 h-2.5 rounded-full ${meta.dotClass}`} />
                      {opt.title}
                    </span>
                    <span className="block text-[11px] mt-0.5 opacity-80">{opt.sub}</span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 col-span-2 sm:col-span-1">
                <span className="text-xs font-bold text-[#1F2A44] block">التاريخ</span>
                <input
                  type="date"
                  min={today}
                  value={addDate}
                  onChange={(e) => setAddDate(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-sm focus:border-[#0D4E8B] outline-none"
                />
              </label>
              <label className="space-y-1 col-span-2 sm:col-span-1">
                <span className="text-xs font-bold text-[#1F2A44] block">وقت البداية</span>
                <input
                  type="time"
                  value={addStart}
                  onChange={(e) => setAddStart(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-sm focus:border-[#0D4E8B] outline-none"
                />
              </label>
              {addType === 'private' && (
                <>
                  <label className="space-y-1">
                    <span className="text-xs font-bold text-[#1F2A44] block">المدة</span>
                    <select
                      value={addDuration}
                      onChange={(e) => setAddDuration(Number(e.target.value))}
                      className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-sm bg-white focus:border-[#0D4E8B] outline-none"
                    >
                      {Array.from(new Set([...DURATION_OPTIONS, defaultDurationMinutes || 50]))
                        .filter((d) => d >= 30 && d <= 120)
                        .sort((a, b) => a - b)
                        .map((d) => (
                          <option key={d} value={d}>
                            {toArabicDigits(d)} دقيقة
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-bold text-[#1F2A44] block">السعر ({defaultCurrency || 'ج.م'})</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={addPriceInput}
                      onChange={(e) => setAddPriceInput(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-sm focus:border-[#0D4E8B] outline-none"
                    />
                  </label>
                </>
              )}
              <label className="space-y-1 col-span-2">
                <span className="text-xs font-bold text-[#1F2A44] block">المنطقة الزمنية</span>
                <select
                  value={addTimezone}
                  onChange={(e) => setAddTimezone(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-sm bg-white focus:border-[#0D4E8B] outline-none"
                >
                  {SUPPORTED_TUTOR_TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {addType === 'private' && (
              <fieldset className="space-y-1.5">
                <legend className="text-xs font-bold text-[#1F2A44] mb-1">التخصصات المتاحة للحصة</legend>
                {specializations.length === 0 ? (
                  <p className="text-xs text-rose-700 font-bold">لا توجد تخصصات معتمدة بعد. تواصل مع الإدارة.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {specializations.map((s) => {
                      const checked = addSpecIds.includes(s.id);
                      return (
                        <label
                          key={s.id}
                          className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold cursor-pointer ${
                            checked ? 'bg-[#EBF3FC] border-[#0D4E8B] text-[#0D4E8B]' : 'border-[#CBD5E1] text-[#64748B]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={checked}
                            onChange={() =>
                              setAddSpecIds((prev) =>
                                prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id]
                              )
                            }
                          />
                          {s.label}
                        </label>
                      );
                    })}
                  </div>
                )}
              </fieldset>
            )}

            <div className="p-3 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs text-[#1F2A44] space-y-1">
              <span className="block font-bold">
                {formatLongDate(addDate)} · {formatTimeArabic12h(addStart)} –{' '}
                {formatTimeArabic12h(addMinutesToTimeStr(addStart, addType === 'trial' ? 20 : addDuration))}
              </span>
              <span className="block text-[#64748B]">
                {isPublished
                  ? 'سيظهر الموعد لأولياء الأمور فور الحفظ.'
                  : 'سيُحفظ ويظهر لك هنا وفي المعاينة فقط، ولن يظهر لأولياء الأمور قبل نشر ملفك.'}
              </span>
            </div>

            {addError && (
              <p role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold">
                {addError}
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 h-12 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-sm font-bold font-['Cairo'] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>حفظ الموعد</span>
              </button>
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="h-12 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-bold text-[#1F2A44] cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ---------------- Event details dialog ---------------- */}
      {selectedEvent && (
        <div
          className="fixed inset-0 z-50 bg-[#1F2A44]/50 flex items-end sm:items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="calendar-detail-title"
          dir="rtl"
        >
          <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl p-5 space-y-4 shadow-xl">
            {(() => {
              const ev = selectedEvent;
              const meta = TUTOR_CALENDAR_KIND_META[ev.kind];
              const booking = ev.booking;
              const privateInfo = ev.privateSlot ? privateBookingInfo[ev.privateSlot.id] : null;
              const canDelete =
                (ev.kind === 'trial_available' || ev.kind === 'private_available') &&
                Boolean(ev.trialSlot || ev.privateSlot);
              return (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold ${meta.chipClass}`}>
                        {meta.label}
                      </span>
                      <h3 id="calendar-detail-title" className="font-['Cairo'] text-base font-extrabold text-[#1F2A44]">
                        {formatLongDate(ev.date)}
                      </h3>
                      <p className="text-sm font-bold text-[#0D4E8B]">{timeRangeLabel(ev)}</p>
                      <p className="text-[11px] text-[#64748B]">{getTimezoneArabicLabel(ev.timezone)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedEvent(null)}
                      aria-label="إغلاق"
                      className="w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {ev.privateSlot && (
                    <div className="p-3 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs space-y-1">
                      <span className="block">
                        <span className="text-[#64748B]">السعر: </span>
                        <span className="font-bold">
                          {toArabicDigits(ev.privateSlot.priceAmount)} {ev.privateSlot.currency} ·{' '}
                          {toArabicDigits(ev.privateSlot.durationMinutes)} دقيقة
                        </span>
                      </span>
                      <span className="block">
                        <span className="text-[#64748B]">التخصص: </span>
                        <span className="font-bold">
                          {(ev.privateSlot.allowedSpecializations || []).map((s) => s.label).join('، ') ||
                            ev.privateSlot.specializationLabel}
                        </span>
                      </span>
                      {privateInfo && (
                        <span className="block">
                          <span className="text-[#64748B]">الطالب / وليّ الأمر: </span>
                          <span className="font-bold">
                            {[privateInfo.studentName, privateInfo.guardianName].filter(Boolean).join(' — ')}
                          </span>
                        </span>
                      )}
                    </div>
                  )}

                  {ev.kind === 'inactive' && (
                    <p className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 font-bold">
                      {ev.inactiveReason === 'suspended'
                        ? 'الموعد موقوف من الإدارة.'
                        : ev.inactiveReason === 'past'
                        ? 'انقضى وقت هذا الموعد.'
                        : 'الموعد غير متاح للحجز.'}
                    </p>
                  )}

                  {(ev.kind === 'trial_available' || ev.kind === 'private_available') && (
                    <p
                      className={`p-3 rounded-2xl border text-xs font-bold flex items-start gap-2 ${
                        isPublished
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          : 'bg-amber-50 border-amber-200 text-amber-950'
                      }`}
                    >
                      {isPublished ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <Lock className="w-4 h-4 shrink-0" />}
                      <span>
                        {isPublished
                          ? 'متاح لأولياء الأمور للحجز الآن.'
                          : 'خاص بك: لن يظهر لأولياء الأمور إلا بعد نشر ملفك.'}
                      </span>
                    </p>
                  )}

                  {/* Trial booking: meeting link */}
                  {booking && (
                    <div className="space-y-3">
                      <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
                        <span className="block font-bold">
                          {booking.status === 'completed' ? 'تم تسجيل إتمام الحصة.' : 'حجز مؤكد من وليّ أمر.'}
                        </span>
                        <span className="block">
                          بيانات التواصل مع وليّ الأمر تتابعها إدارة شاطر، والرابط اللي تضيفه يظهر له في صفحة «حجوزاتي».
                        </span>
                      </div>

                      {booking.status === 'confirmed' && (
                        <div className="space-y-2">
                          <label htmlFor="calendar-meeting-url" className="text-xs font-bold text-[#1F2A44] block">
                            رابط الحصة (Google Meet أو Zoom)
                          </label>
                          <input
                            id="calendar-meeting-url"
                            type="url"
                            dir="ltr"
                            value={meetingInput}
                            onChange={(e) => setMeetingInput(e.target.value)}
                            placeholder="https://meet.google.com/abc-defg-hij"
                            className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-sm focus:border-[#0D4E8B] outline-none"
                          />
                          <button
                            type="button"
                            onClick={handleSaveMeetingLink}
                            disabled={isDetailBusy}
                            className="w-full h-11 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                          >
                            {isDetailBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                            <span>{booking.meetingUrl ? 'تحديث رابط الحصة' : 'حفظ رابط الحصة'}</span>
                          </button>
                        </div>
                      )}

                      {booking.meetingUrl && (
                        <a
                          href={booking.meetingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full h-11 rounded-xl border border-[#CBD5E1] text-sm font-bold text-[#0D4E8B] hover:bg-slate-50 flex items-center justify-center gap-2"
                        >
                          <ExternalLink className="w-4 h-4" />
                          <span>فتح رابط الحصة</span>
                        </a>
                      )}

                      {booking.status === 'confirmed' && hasBookingEnded(booking.endsAt) && (
                        <button
                          type="button"
                          onClick={handleMarkCompleted}
                          disabled={isDetailBusy}
                          className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>تسجيل إتمام الحصة</span>
                        </button>
                      )}
                    </div>
                  )}

                  {detailError && (
                    <p role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold">
                      {detailError}
                    </p>
                  )}
                  {detailSuccess && (
                    <p role="status" className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                      {detailSuccess}
                    </p>
                  )}

                  {canDelete &&
                    (confirmDelete ? (
                      <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 space-y-2">
                        <p className="text-xs font-bold text-rose-900">متأكد إنك عايز تحذف الموعد ده؟</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleDeleteSlot}
                            disabled={isDetailBusy}
                            className="flex-1 h-10 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold cursor-pointer disabled:opacity-60"
                          >
                            نعم، احذف
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(false)}
                            className="flex-1 h-10 rounded-xl bg-white border border-rose-200 text-rose-800 text-xs font-bold cursor-pointer"
                          >
                            تراجع
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(true)}
                        className="w-full h-11 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>حذف الموعد</span>
                      </button>
                    ))}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
