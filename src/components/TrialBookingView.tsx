import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CalendarCheck2,
  CheckCircle2,
  Clock,
  Gift,
  Loader2,
  Mail,
  MessageCircle,
  User,
  Video,
} from 'lucide-react';
import { DirectTrialBooking, DirectTrialBookingPolicy, Tutor, TutorAvailableSlot } from '../types';
import { DataService } from '../services/dataService';
import { DirectTrialBookingService } from '../services/directTrialBookingService';
import { PARENT_LEAD_COUNTRY_OPTIONS } from '../services/parentLeadService';
import { normalizeTutorContactPhone } from '../utils/tutorReadinessAndContact';
import { getTutorPrimaryTrackTitle } from '../utils/publicShowcase';
import {
  formatSessionPriceSummary,
  formatSlotDateArabic,
  formatTimeArabic12h,
  getTimezoneArabicLabel,
  toArabicDigits,
} from '../utils/formatters';
import {
  clearDirectTrialReturnTarget,
  clearPendingDirectTrialDraft,
  formatBookingInOwnTimezone,
  filterDirectBookingTrialSlots,
  loadPendingDirectTrialDraft,
  resolveBookingDraftSlot,
  saveDirectTrialReturnTarget,
  savePendingDirectTrialDraft,
} from '../utils/directTrialBooking';
import { EmailCodeVerifier } from './EmailCodeVerifier';
import { ParentDashboardService } from '../services/parentDashboardService';
import { ParentChild } from '../types';
import { trackTrialBooked } from '../services/analytics';

interface TrialBookingViewProps {
  tutorId: string;
  /** Slot tapped on the tutor profile («أقرب مواعيد التجربة»), preselected if still available. */
  initialSlotId?: string | null;
  onBack: () => void;
  onOpenTutorProfile: (tutorId: string, options?: { focusBooking?: boolean }) => void;
  onNavigateToMyTrials: () => void;
}

type Step = 'pick' | 'review' | 'done';

const card = 'bg-white rounded-3xl border border-[#E2E8F0] shadow-xs';
const primaryBtn =
  "w-full h-13 min-h-[52px] px-6 rounded-2xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-base font-extrabold font-['Cairo'] flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
const inputCls =
  'w-full h-12 px-4 rounded-2xl border border-[#CBD5E1] bg-white text-base text-[#1F2A44] outline-none focus:border-[#0D4E8B] focus:ring-4 focus:ring-[#0D4E8B]/10';

const SLOT_TAKEN_MESSAGE =
  'الموعد اللي كنت اخترته اتحجز أو مبقاش متاح. اختار موعد تاني من المواعيد المتاحة.';

/**
 * Parent trial booking flow (Preply-like, mobile first):
 *   1. pick a day and a time from the tutor's real eligible slots
 *   2. review the summary, verify email (code on the same page), enter contact, confirm
 *   3. success with a link to «حجوزاتي»
 * Uses the existing RPCs only (get_direct_trial_booking_policy, parent_book_trial).
 */
export const TrialBookingView: React.FC<TrialBookingViewProps> = ({
  tutorId,
  initialSlotId,
  onBack,
  onOpenTutorProfile,
  onNavigateToMyTrials,
}) => {
  const [tutor, setTutor] = useState<Tutor | null>(null);
  const [rawSlots, setRawSlots] = useState<TutorAvailableSlot[]>([]);
  const [policy, setPolicy] = useState<DirectTrialBookingPolicy | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>('pick');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedSlotId, setSelectedSlotId] = useState<string>('');
  const [pickNotice, setPickNotice] = useState<string | null>(null);

  const [authUser, setAuthUser] = useState<{ id: string; email?: string | null } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [email, setEmail] = useState('');
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [isSendingCode, setIsSendingCode] = useState(false);
  // Guest booking (no login) is the default; email login is optional.
  const [useEmailLogin, setUseEmailLogin] = useState(false);

  const [guardianName, setGuardianName] = useState('');
  const [countryCode, setCountryCode] = useState('+20');
  const [localPhone, setLocalPhone] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState<DirectTrialBooking | null>(null);
  const [draftApplied, setDraftApplied] = useState(false);
  // «الحصة لمين؟» (optional, needs migration 023)
  const [children, setChildren] = useState<ParentChild[] | null>(null);
  const [childChoice, setChildChoice] = useState<string>(''); // child id | 'new' | ''
  const [newChildName, setNewChildName] = useState('');

  useEffect(() => {
    if (!authUser) return;
    let active = true;
    ParentDashboardService.getDashboard()
      .then((d) => {
        if (!active) return;
        setChildren(d ? d.children : null);
        if (d && d.children.length === 1) setChildChoice(d.children[0].id);
        else if (d && d.children.length === 0) setChildChoice('new');
      })
      .catch(() => active && setChildren(null));
    return () => {
      active = false;
    };
  }, [authUser]);

  // Link the confirmed booking to the child; never blocks the booking itself
  const attachChild = async (bookingId: string) => {
    if (children === null) return;
    try {
      let childId = childChoice !== 'new' ? childChoice : '';
      if (childChoice === 'new' && newChildName.trim().length >= 2) {
        childId = (await ParentDashboardService.upsertChild({ name: newChildName })).id;
      }
      if (childId) await ParentDashboardService.setTrialChild(bookingId, childId);
    } catch {
      // optional step
    }
  };

  // ------------------------------------------------------------------ data
  const loadSlots = useCallback(async () => {
    const slots = await DataService.getTutorAvailableSlots(tutorId);
    setRawSlots(slots || []);
    return slots || [];
  }, [tutorId]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setLoadError(null);
    Promise.all([
      DataService.getTutorById(tutorId),
      DataService.getTutorAvailableSlots(tutorId).catch(() => []),
      DirectTrialBookingService.getDirectTrialBookingPolicy(tutorId).catch(() => null),
    ])
      .then(([t, slots, pol]) => {
        if (!active) return;
        setTutor(t);
        setRawSlots(slots || []);
        setPolicy(pol);
        if (!t) setLoadError('ملف المعلم غير متاح حاليًا.');
      })
      .catch(() => active && setLoadError('تعذر تحميل بيانات المعلم. حاول مرة أخرى.'))
      .finally(() => active && setIsLoading(false));
    return () => {
      active = false;
    };
  }, [tutorId]);

  useEffect(() => {
    let active = true;
    DirectTrialBookingService.getCurrentSessionUser()
      .then((u) => active && setAuthUser(u))
      .finally(() => active && setAuthChecked(true));
    const unsubscribe = DirectTrialBookingService.onAuthStateChange((u) => {
      if (!active) return;
      setAuthUser(u);
      setAuthChecked(true);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const directBookingAvailable = Boolean(policy?.directBookingAvailable);
  const slots = useMemo(
    () =>
      directBookingAvailable && policy
        ? filterDirectBookingTrialSlots(rawSlots, policy.minimumNoticeMinutes)
        : [],
    [rawSlots, policy, directBookingAvailable]
  );

  const slotsByDate = useMemo(() => {
    const map = new Map<string, TutorAvailableSlot[]>();
    for (const s of slots) {
      const list = map.get(s.slotDate) || [];
      list.push(s);
      map.set(s.slotDate, list);
    }
    return map;
  }, [slots]);
  const dates = useMemo(() => Array.from(slotsByDate.keys()).sort(), [slotsByDate]);
  const selectedSlot = slots.find((s) => s.id === selectedSlotId) || null;

  // Default day = first available day (never auto-pick a time)
  useEffect(() => {
    if (!selectedDate && dates.length > 0) setSelectedDate(dates[0]);
  }, [dates, selectedDate]);

  // Restore the parent's own choice after email verification / link return
  useEffect(() => {
    if (draftApplied || isLoading || !policy) return;
    setDraftApplied(true);
    const draft = loadPendingDirectTrialDraft(tutorId);
    if (!draft) {
      const preset = initialSlotId ? slots.find((x) => x.id === initialSlotId) : null;
      if (preset) {
        setSelectedDate(preset.slotDate);
        setSelectedSlotId(preset.id);
      }
      return;
    }
    if (draft.guardianName) setGuardianName(draft.guardianName);
    if (draft.countryCode) setCountryCode(draft.countryCode);
    if (draft.localPhone) setLocalPhone(draft.localPhone);
    if (draft.email) setEmail(draft.email);
    const res = resolveBookingDraftSlot(draft, slots);
    if (res.status === 'available' && res.slot) {
      setSelectedDate(res.slot.slotDate);
      setSelectedSlotId(res.slot.id);
      setStep('review');
    } else if (res.status === 'unavailable') {
      setSelectedSlotId('');
      setPickNotice(SLOT_TAKEN_MESSAGE);
      setStep('pick');
    }
  }, [draftApplied, isLoading, policy, slots, tutorId, initialSlotId]);

  const saveDraft = (extra?: { email?: string }) => {
    if (!selectedSlot) return;
    savePendingDirectTrialDraft({
      tutorId,
      slotId: selectedSlot.id,
      guardianName: guardianName.trim() || undefined,
      countryCode,
      localPhone: localPhone.trim() || undefined,
      email: (extra?.email ?? email).trim() || undefined,
    });
  };

  // ------------------------------------------------------------------ actions
  const goToReview = () => {
    if (!selectedSlot) return;
    setPickNotice(null);
    setFormError(null);
    saveDraft();
    setStep('review');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const sendCode = async (target: string) => {
    const returnTarget = `book/${tutorId}`;
    saveDraft({ email: target });
    saveDirectTrialReturnTarget(returnTarget);
    const redirectUrl = `${window.location.origin}${window.location.pathname}?direct_return=${encodeURIComponent(returnTarget)}`;
    await DirectTrialBookingService.signInParentWithOtp(target, redirectUrl);
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSendingCode(true);
    try {
      await sendCode(email.trim());
      setCodeSentTo(email.trim());
    } catch (err: any) {
      setFormError(err?.message || 'تعذر إرسال الكود. تأكد من البريد وحاول مرة أخرى.');
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot) return;
    setFormError(null);
    if (guardianName.trim().length < 2) {
      setFormError('اكتب اسم وليّ الأمر.');
      return;
    }
    const phone = normalizeTutorContactPhone(localPhone, countryCode);
    if (!phone.isValid || !phone.displayPhone) {
      setFormError(phone.invalidReason || 'اكتب رقم واتساب صحيح.');
      return;
    }
    setIsConfirming(true);
    try {
      if (!authUser) {
        try {
          const guest = await DirectTrialBookingService.signInGuest();
          setAuthUser({ id: guest.id, email: null });
        } catch {
          saveDraft();
          setUseEmailLogin(true);
          setFormError('الحجز السريع مش متاح دلوقتي. أكّد بإيميلك في خطوة واحدة.');
          return;
        }
      }
      const booked = await DirectTrialBookingService.parentBookTrial({
        slotId: selectedSlot.id,
        guardianName: guardianName.trim(),
        whatsapp: phone.displayPhone,
      });
      clearPendingDirectTrialDraft();
      clearDirectTrialReturnTarget();
      if (booked?.id) await attachChild(booked.id);
      setConfirmed(booked);
      trackTrialBooked(tutorId, authUser?.email ? 'account' : 'guest');
      setStep('done');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      loadSlots().catch(() => undefined);
    } catch (err: any) {
      if (err?.isSlotUnavailable) {
        await loadSlots().catch(() => undefined);
        setSelectedSlotId('');
        setPickNotice(SLOT_TAKEN_MESSAGE);
        setStep('pick');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        setFormError(err?.message || 'تعذر تأكيد الحجز. حاول مرة أخرى.');
      }
    } finally {
      setIsConfirming(false);
    }
  };

  // ------------------------------------------------------------------ render helpers
  const slotLabel = (s: TutorAvailableSlot) => {
    const d = formatSlotDateArabic(s.slotDate, s.timezone || 'Africa/Cairo');
    return {
      day: d.fullLabel,
      time: `${formatTimeArabic12h(s.startTime.slice(0, 5))} – ${formatTimeArabic12h(s.endTime.slice(0, 5))}`,
      tz: getTimezoneArabicLabel(s.timezone || 'Africa/Cairo'),
    };
  };

  if (isLoading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 flex flex-col items-center gap-3 text-[#64748B]" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-[#0D4E8B]" />
        <span className="text-sm">جاري تحميل المواعيد...</span>
      </div>
    );
  }

  if (!tutor || loadError) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16" dir="rtl">
        <div className={`${card} p-6 text-center space-y-4`}>
          <AlertCircle className="w-10 h-10 text-slate-400 mx-auto" />
          <p className="font-['Cairo'] text-lg font-extrabold text-[#1F2A44]">{loadError || 'ملف المعلم غير متاح.'}</p>
          <button type="button" onClick={onBack} className={primaryBtn}>
            الرجوع للمعلمين
          </button>
        </div>
      </div>
    );
  }

  const price = formatSessionPriceSummary({
    minPrice: tutor.hourlyRateMin,
    maxPrice: tutor.hourlyRateMax,
    currency: tutor.currency,
    durationMinutes: tutor.sessionDurationMinutes,
    useArabicDigits: true,
  });
  const trialMinutes = policy?.trialDurationMinutes || 20;

  const tutorHeader = (
    <div className="flex items-center gap-3.5">
      <div className="w-14 h-14 rounded-2xl overflow-hidden bg-[#F0F6FD] border border-[#E2E8F0] shrink-0 flex items-center justify-center">
        {tutor.avatarUrl ? (
          <img src={tutor.avatarUrl} alt={tutor.name} className="w-full h-full object-cover object-top" referrerPolicy="no-referrer" />
        ) : (
          <User className="w-6 h-6 text-[#0D4E8B]" strokeWidth={1.75} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-['Cairo'] text-base font-extrabold text-[#1F2A44] truncate">
          {tutor.honorific} {tutor.name}
        </p>
        <p className="text-sm font-bold text-[#0D4E8B] truncate">{getTutorPrimaryTrackTitle(tutor)}</p>
        <p className="text-xs text-[#64748B]">
          الحصة الخاصة {price.priceText} · {price.durationText}
        </p>
      </div>
    </div>
  );

  const stepIndex = step === 'pick' ? 1 : step === 'review' ? 2 : 3;

  return (
    <div className="max-w-xl mx-auto px-4 pt-4 pb-36 sm:pb-12 space-y-4" dir="rtl">
      {/* Top bar */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (step === 'review') {
              setStep('pick');
              setCodeSentTo(null);
            } else {
              onBack();
            }
          }}
          aria-label="رجوع"
          className="w-11 h-11 rounded-2xl hover:bg-white flex items-center justify-center text-[#1F2A44] cursor-pointer"
        >
          <ArrowRight className="w-5 h-5" />
        </button>
        <h1 className="font-['Cairo'] text-lg sm:text-xl font-extrabold text-[#1F2A44] flex-1">
          {step === 'done' ? 'تم الحجز' : 'احجز تجربة مجانية'}
        </h1>
        {step !== 'done' && (
          <span className="text-xs font-bold text-[#64748B] tabular-nums">
            خطوة {toArabicDigits(stepIndex)} من ٢
          </span>
        )}
      </div>

      <div className={`${card} p-4`}>{tutorHeader}</div>

      {/* ================= STEP 1: pick ================= */}
      {step === 'pick' && (
        <>
          {pickNotice && (
            <div role="alert" className="px-4 py-3 rounded-2xl bg-amber-50 text-amber-950 text-sm font-bold flex items-start gap-2">
              <AlertCircle className="w-5 h-5 shrink-0" strokeWidth={1.75} />
              <span>{pickNotice}</span>
            </div>
          )}

          {dates.length === 0 ? (
            <div className={`${card} p-5 space-y-4 text-center`}>
              <Clock className="w-10 h-10 text-[#94A3B8] mx-auto" strokeWidth={1.5} />
              <div className="space-y-1">
                <p className="font-['Cairo'] text-base font-extrabold text-[#1F2A44]">
                  مفيش مواعيد متاحة للحجز المباشر دلوقتي
                </p>
                <p className="text-sm text-[#64748B]">فريق شاطر هيساعدك تنسّق موعد التجربة مع المعلم.</p>
              </div>
              <button
                type="button"
                onClick={() => onOpenTutorProfile(tutorId, { focusBooking: true })}
                className={primaryBtn}
              >
                <MessageCircle className="w-5 h-5" />
                <span>تنسيق الموعد عبر واتساب</span>
              </button>
            </div>
          ) : (
            <div className={`${card} p-4 sm:p-5 space-y-4`}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-['Cairo'] text-base font-extrabold text-[#1F2A44]">اختار اليوم</h2>
                <span className="text-xs text-[#64748B]">{getTimezoneArabicLabel(slots[0]?.timezone || 'Africa/Cairo')}</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="الأيام المتاحة">
                {dates.map((date) => {
                  const d = formatSlotDateArabic(date);
                  const active = date === selectedDate;
                  const count = slotsByDate.get(date)?.length || 0;
                  return (
                    <button
                      key={date}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setSelectedDate(date)}
                      className={`shrink-0 w-[84px] py-2.5 rounded-2xl border-2 flex flex-col items-center gap-0.5 cursor-pointer transition-colors ${
                        active ? 'border-[#0D4E8B] bg-[#EBF3FC] text-[#0D4E8B]' : 'border-[#E2E8F0] text-[#1F2A44] hover:border-[#94A3B8]'
                      }`}
                    >
                      <span className="text-xs font-bold">{d.relativeBadge || d.dayName}</span>
                      <span className="font-['Cairo'] text-base font-extrabold">{d.shortDate}</span>
                      <span className="text-[11px] text-[#64748B]">{toArabicDigits(count)} موعد</span>
                    </button>
                  );
                })}
              </div>

              <h2 className="font-['Cairo'] text-base font-extrabold text-[#1F2A44] pt-1">اختار الساعة</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="المواعيد">
                {(slotsByDate.get(selectedDate) || []).map((s) => {
                  const active = s.id === selectedSlotId;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      data-slot-id={s.id}
                      onClick={() => {
                        setSelectedSlotId(s.id);
                        setPickNotice(null);
                      }}
                      className={`h-12 rounded-2xl border-2 font-['Cairo'] text-base font-extrabold cursor-pointer transition-colors ${
                        active
                          ? 'border-[#0D4E8B] bg-[#0D4E8B] text-white'
                          : 'border-[#E2E8F0] text-[#1F2A44] hover:border-[#0D4E8B]/50'
                      }`}
                    >
                      {formatTimeArabic12h(s.startTime.slice(0, 5))}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-[#64748B] flex items-center gap-1.5">
                <Gift className="w-4 h-4 text-emerald-600" strokeWidth={1.75} />
                <span>التجربة مجانية · {toArabicDigits(trialMinutes)} دقيقة أونلاين</span>
              </p>
            </div>
          )}

          {/* Sticky continue bar */}
          {dates.length > 0 && (
            <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-[#E2E8F0] p-3 sm:static sm:bg-transparent sm:border-0 sm:p-0" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
              <div className="max-w-xl mx-auto space-y-2">
                {selectedSlot && (
                  <p className="text-center text-sm font-bold text-[#1F2A44] sm:hidden">
                    {slotLabel(selectedSlot).day} · {formatTimeArabic12h(selectedSlot.startTime.slice(0, 5))}
                  </p>
                )}
                <button type="button" onClick={goToReview} disabled={!selectedSlot} className={primaryBtn}>
                  {selectedSlot ? 'متابعة' : 'اختار موعد للمتابعة'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ================= STEP 2: review + verify + confirm ================= */}
      {step === 'review' && selectedSlot && (
        <>
          <section aria-label="ملخص الحجز" className={`${card} p-4 sm:p-5 space-y-3`}>
            <div className="flex items-center justify-between">
              <h2 className="font-['Cairo'] text-base font-extrabold text-[#1F2A44]">تفاصيل التجربة</h2>
              <button
                type="button"
                onClick={() => setStep('pick')}
                className="text-sm font-bold text-[#0D4E8B] hover:underline cursor-pointer"
              >
                تغيير الموعد
              </button>
            </div>
            <div className="flex items-center gap-3.5">
              <div className="w-[72px] shrink-0 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] text-center py-2">
                <span className="block text-xs font-bold text-[#0D4E8B]">{formatSlotDateArabic(selectedSlot.slotDate).dayName}</span>
                <span className="block font-['Cairo'] text-sm font-extrabold text-[#1F2A44] leading-snug">
                  {formatSlotDateArabic(selectedSlot.slotDate).shortDate}
                </span>
              </div>
              <div className="min-w-0">
                <p className="font-['Cairo'] text-base font-extrabold text-[#1F2A44]">{slotLabel(selectedSlot).time}</p>
                <p className="text-sm text-[#64748B]">{slotLabel(selectedSlot).tz}</p>
              </div>
            </div>
            <div className="px-4 py-3 rounded-2xl bg-emerald-50 text-emerald-900 text-sm font-bold flex items-center gap-2">
              <Gift className="w-4 h-4 shrink-0" strokeWidth={1.75} />
              <span>تجربة مجانية · {toArabicDigits(trialMinutes)} دقيقة · من غير أي دفع</span>
            </div>
          </section>

          {!authChecked ? (
            <div className={`${card} p-6 flex justify-center`}>
              <Loader2 className="w-6 h-6 animate-spin text-[#0D4E8B]" />
            </div>
          ) : !authUser && useEmailLogin ? (
            <section aria-label="تأكيد البريد" className={`${card} p-4 sm:p-5 space-y-4`}>
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-['Cairo'] text-base font-extrabold text-[#1F2A44]">بريدك الإلكتروني</h2>
                  <button type="button" onClick={() => { setUseEmailLogin(false); setCodeSentTo(null); setFormError(null); }} className="text-sm font-bold text-[#0D4E8B] hover:underline cursor-pointer">
                    احجز من غير إيميل
                  </button>
                </div>
                <p className="text-sm text-[#64748B]">هنبعتلك كود تكتبه هنا، عشان تتابع حجزك ورابط الحصة في «حجوزاتي».</p>
              </div>
              {codeSentTo ? (
                <EmailCodeVerifier
                  email={codeSentTo}
                  onResend={() => sendCode(codeSentTo)}
                  onChangeEmail={() => setCodeSentTo(null)}
                />
              ) : (
                <form onSubmit={handleSendCode} noValidate className="space-y-3">
                  <input
                    type="email"
                    dir="ltr"
                    autoComplete="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="parent@example.com"
                    className={inputCls}
                    aria-label="البريد الإلكتروني"
                  />
                  {formError && <p role="alert" className="text-sm font-bold text-rose-700">{formError}</p>}
                  <button type="submit" disabled={isSendingCode || !email.trim()} className={primaryBtn}>
                    {isSendingCode ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mail className="w-5 h-5" />}
                    <span>إرسال الكود</span>
                  </button>
                </form>
              )}
            </section>
          ) : (
            <form onSubmit={handleConfirm} noValidate aria-label="بيانات التواصل" className={`${card} p-4 sm:p-5 space-y-4`}>
              <div className="space-y-1">
                <h2 className="font-['Cairo'] text-base font-extrabold text-[#1F2A44]">بيانات التواصل</h2>
                {authUser?.email ? (
                  <p className="text-xs text-[#64748B]" dir="rtl">
                    مسجّل بـ <span dir="ltr">{authUser.email}</span>
                  </p>
                ) : (
                  <p className="text-xs text-[#64748B]">
                    مش محتاج حساب. اكتب اسمك ورقم الواتساب وأكّد.{' '}
                    {!authUser && (
                      <button type="button" onClick={() => { setUseEmailLogin(true); setFormError(null); }} className="font-bold text-[#0D4E8B] hover:underline cursor-pointer">
                        عندي حساب
                      </button>
                    )}
                  </p>
                )}
              </div>
              {children !== null && (
                <div className="space-y-1.5">
                  <span className="text-sm font-bold text-[#1F2A44] block">
                    الحصة لمين؟ <span className="font-normal text-[#94A3B8]">· اختياري</span>
                  </span>
                  {children.length > 0 && (
                    <select
                      aria-label="الحصة لمين؟"
                      value={childChoice}
                      onChange={(e) => setChildChoice(e.target.value)}
                      className={inputCls}
                    >
                      <option value="">اختار الطفل</option>
                      {children.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                      <option value="new">طفل تاني…</option>
                    </select>
                  )}
                  {childChoice === 'new' && (
                    <input
                      type="text"
                      aria-label="اسم الطفل"
                      value={newChildName}
                      onChange={(e) => setNewChildName(e.target.value)}
                      maxLength={60}
                      placeholder="اسم الطفل"
                      className={inputCls}
                    />
                  )}
                </div>
              )}
              <label className="block space-y-1.5">
                <span className="text-sm font-bold text-[#1F2A44]">اسم وليّ الأمر</span>
                <input
                  type="text"
                  autoComplete="name"
                  value={guardianName}
                  onChange={(e) => setGuardianName(e.target.value)}
                  className={inputCls}
                />
              </label>
              <div className="space-y-1.5">
                <span className="text-sm font-bold text-[#1F2A44] block">رقم الواتساب</span>
                <div className="flex gap-2" dir="ltr">
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    aria-label="كود الدولة"
                    className="h-12 w-28 px-2 rounded-2xl border border-[#CBD5E1] bg-white text-sm"
                  >
                    {PARENT_LEAD_COUNTRY_OPTIONS.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code}
                      </option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    value={localPhone}
                    onChange={(e) => setLocalPhone(e.target.value)}
                    placeholder="10xxxxxxxx"
                    aria-label="رقم الواتساب"
                    className={inputCls}
                  />
                </div>
                <p className="text-xs text-[#64748B]">فريق شاطر هيتواصل معاك عليه لو احتجنا.</p>
              </div>
              {formError && <p role="alert" className="text-sm font-bold text-rose-700">{formError}</p>}
              <button type="submit" disabled={isConfirming} className={primaryBtn}>
                {isConfirming ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                <span>تأكيد الحجز المجاني</span>
              </button>
            </form>
          )}
        </>
      )}

      {/* ================= STEP 3: done ================= */}
      {step === 'done' && confirmed && (
        <section aria-label="تم تأكيد الحجز" className={`${card} p-5 sm:p-6 space-y-5 text-center`}>
          <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
            <CalendarCheck2 className="w-8 h-8" strokeWidth={1.75} />
          </div>
          <div className="space-y-1">
            <h2 className="font-['Cairo'] text-xl font-extrabold text-[#1F2A44]">تم تأكيد التجربة المجانية 🎉</h2>
            {(() => {
              const t = formatBookingInOwnTimezone(confirmed.startsAt, confirmed.endsAt, confirmed.timezone);
              return (
                <p className="text-base font-bold text-[#475569]">
                  {t.fullDateLabel}
                  <span className="block font-normal">
                    {t.timeRangeLabel} · {t.timezoneLabel}
                  </span>
                </p>
              );
            })()}
          </div>
          <div className="px-4 py-3 rounded-2xl bg-[#F8FAFC] text-sm text-[#475569] flex items-start gap-2 text-right">
            <Video className="w-5 h-5 shrink-0 text-[#0D4E8B]" strokeWidth={1.75} />
            <span>
              {confirmed.meetingUrl
                ? 'رابط الحصة جاهز في «حجوزاتي».'
                : 'رابط الحصة هيظهر في «حجوزاتي» أول ما المعلم يضيفه قبل المعاد.'}
            </span>
          </div>
          <button type="button" onClick={onNavigateToMyTrials} className={primaryBtn}>
            عرض في حجوزاتي
          </button>
          <button type="button" onClick={onBack} className="text-sm font-bold text-[#0D4E8B] hover:underline cursor-pointer">
            الرجوع للمعلمين
          </button>
        </section>
      )}
    </div>
  );
};
