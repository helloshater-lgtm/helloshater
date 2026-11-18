import {
  AdminDirectTrialBooking,
  DirectTrialBookingStatus,
  TutorAvailableSlot,
} from '../types';
import {
  getTimezoneArabicLabel,
  isSlotInFuture,
  parseCalendarDateParts,
  toArabicDigits,
} from './formatters';
import {
  ResolvedTutorAdminContact,
  buildTutorWhatsAppUrl,
  normalizeTutorContactPhone,
} from './tutorReadinessAndContact';

/**
 * Extracts year/month/day/hour/minute/second of a UTC instant formatted inside an IANA timezone.
 */
function getZonedDateTimeParts(
  utcMs: number,
  timezone: string
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} | null {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    const parts = formatter.formatToParts(new Date(utcMs));
    const lookup: Record<string, number> = {};
    for (const part of parts) {
      if (part.type !== 'literal') {
        lookup[part.type] = Number(part.value);
      }
    }
    if (
      !Number.isFinite(lookup.year) ||
      !Number.isFinite(lookup.month) ||
      !Number.isFinite(lookup.day) ||
      !Number.isFinite(lookup.hour) ||
      !Number.isFinite(lookup.minute) ||
      !Number.isFinite(lookup.second)
    ) {
      return null;
    }
    return {
      year: lookup.year,
      month: lookup.month,
      day: lookup.day,
      hour: lookup.hour === 24 ? 0 : lookup.hour,
      minute: lookup.minute,
      second: lookup.second,
    };
  } catch {
    return null;
  }
}

/**
 * Converts a local calendar date (YYYY-MM-DD) + time (HH:mm[:ss]) in `timezone`
 * accurately into a UTC epoch timestamp (ms), independent of the browser's local timezone.
 */
export function getZonedSlotUtcMs(
  slotDate: string,
  timeStr: string,
  timezone = 'Africa/Cairo'
): number | null {
  const dateParts = parseCalendarDateParts(slotDate);
  if (!dateParts) return null;

  const cleanTime = String(timeStr || '').trim();
  const timeMatch = cleanTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!timeMatch) return null;

  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] || 0);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    return null;
  }

  const targetAsUtc = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    hour,
    minute,
    second
  );
  const tz = (timezone || 'Africa/Cairo').trim() || 'Africa/Cairo';

  // Two-pass fixed-point adjustment handles DST boundaries accurately
  let candidateUtcMs = targetAsUtc;
  for (let i = 0; i < 2; i++) {
    const zoned = getZonedDateTimeParts(candidateUtcMs, tz);
    if (!zoned) {
      return candidateUtcMs;
    }
    const zonedAsUtc = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
      zoned.second
    );
    const delta = targetAsUtc - zonedAsUtc;
    candidateUtcMs += delta;
    if (delta === 0) break;
  }

  return candidateUtcMs;
}

/**
 * Checks if a trial slot is genuinely available and satisfies `minimumNoticeMinutes` from `referenceNowMs`.
 */
export function isTrialSlotWithinBookingWindow(
  slot: TutorAvailableSlot,
  minimumNoticeMinutes: number,
  referenceNowMs: number = Date.now()
): boolean {
  if (!slot || slot.isAvailable === false || slot.isBooked || slot.adminSuspended) {
    return false;
  }
  const tz = (slot.timezone || 'Africa/Cairo').trim() || 'Africa/Cairo';
  if (!isSlotInFuture(slot.slotDate, slot.startTime, tz, referenceNowMs)) {
    return false;
  }
  const slotUtcMs = getZonedSlotUtcMs(slot.slotDate, slot.startTime, tz);
  if (slotUtcMs === null) {
    return false;
  }
  const safeNotice = Math.max(0, Number(minimumNoticeMinutes) || 0);
  return slotUtcMs >= referenceNowMs + safeNotice * 60_000;
}

/**
 * Filters and chronologically sorts trial slots that qualify for direct instant booking.
 */
export function filterDirectBookingTrialSlots(
  slots: TutorAvailableSlot[],
  minimumNoticeMinutes: number,
  referenceNowMs: number = Date.now()
): TutorAvailableSlot[] {
  if (!Array.isArray(slots)) return [];
  return slots
    .filter((slot) => isTrialSlotWithinBookingWindow(slot, minimumNoticeMinutes, referenceNowMs))
    .sort((a, b) => {
      const aMs = getZonedSlotUtcMs(a.slotDate, a.startTime, a.timezone || 'Africa/Cairo') ?? 0;
      const bMs = getZonedSlotUtcMs(b.slotDate, b.startTime, b.timezone || 'Africa/Cairo') ?? 0;
      if (aMs !== bMs) return aMs - bMs;
      const cmpDate = a.slotDate.localeCompare(b.slotDate);
      if (cmpDate !== 0) return cmpDate;
      return a.startTime.localeCompare(b.startTime);
    });
}

export function formatMinimumNoticeArabic(minimumNoticeMinutes: number): string {
  const mins = Math.max(0, Math.round(Number(minimumNoticeMinutes) || 0));
  if (mins === 0) return 'فوراً قبل بدء الموعد';
  if (mins % 60 === 0) {
    const hours = mins / 60;
    if (hours === 1) return 'ساعة واحدة';
    if (hours === 2) return 'ساعتين';
    if (hours <= 10) return `${toArabicDigits(hours)} ساعات`;
    return `${toArabicDigits(hours)} ساعة`;
  }
  if (mins === 1) return 'دقيقة واحدة';
  if (mins === 2) return 'دقيقتين';
  if (mins <= 10) return `${toArabicDigits(mins)} دقائق`;
  return `${toArabicDigits(mins)} دقيقة`;
}

export interface FormattedBookingTimeDisplay {
  dayName: string;
  shortDate: string;
  fullDateLabel: string;
  startTimeLabel: string;
  endTimeLabel: string;
  timeRangeLabel: string;
  timezoneLabel: string;
}

/**
 * Formats booking ISO timestamps strictly inside the booking's own `timezone` field.
 */
export function formatBookingInOwnTimezone(
  startsAtIso: string,
  endsAtIso: string,
  timezone?: string | null
): FormattedBookingTimeDisplay {
  const tz = (timezone || 'Africa/Cairo').trim() || 'Africa/Cairo';
  const startDate = new Date(startsAtIso);
  const endDate = new Date(endsAtIso);
  const timezoneLabel = getTimezoneArabicLabel(tz);

  if (Number.isNaN(startDate.getTime())) {
    return {
      dayName: '',
      shortDate: '',
      fullDateLabel: startsAtIso || '',
      startTimeLabel: '',
      endTimeLabel: '',
      timeRangeLabel: '',
      timezoneLabel,
    };
  }

  try {
    const dayName = new Intl.DateTimeFormat('ar-EG', {
      weekday: 'long',
      timeZone: tz,
    }).format(startDate);

    const shortDate = new Intl.DateTimeFormat('ar-EG', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: tz,
    }).format(startDate);

    const timeFmt = new Intl.DateTimeFormat('ar-EG', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: tz,
    });

    const startTimeLabel = timeFmt.format(startDate);
    const endTimeLabel = Number.isNaN(endDate.getTime()) ? '' : timeFmt.format(endDate);
    const timeRangeLabel = endTimeLabel ? `${startTimeLabel} – ${endTimeLabel}` : startTimeLabel;

    return {
      dayName,
      shortDate,
      fullDateLabel: `${dayName}، ${shortDate}`,
      startTimeLabel,
      endTimeLabel,
      timeRangeLabel,
      timezoneLabel,
    };
  } catch {
    return {
      dayName: '',
      shortDate: '',
      fullDateLabel: startDate.toLocaleDateString('ar-EG'),
      startTimeLabel: startDate.toLocaleTimeString('ar-EG'),
      endTimeLabel: Number.isNaN(endDate.getTime()) ? '' : endDate.toLocaleTimeString('ar-EG'),
      timeRangeLabel: startDate.toLocaleTimeString('ar-EG'),
      timezoneLabel,
    };
  }
}

/**
 * Returns true if the booking's scheduled end timestamp has passed.
 */
export function hasBookingEnded(
  endsAtIso: string,
  referenceNowMs: number = Date.now()
): boolean {
  const endMs = Date.parse(endsAtIso);
  if (Number.isNaN(endMs)) return false;
  return endMs <= referenceNowMs;
}

export interface ValidatedMeetingUrlResult {
  isValid: boolean;
  normalizedUrl: string;
  provider: 'google_meet' | 'zoom' | null;
  providerLabel: string;
  error?: string;
}

/**
 * Validates and normalizes Google Meet or Zoom URLs entered by the tutor.
 */
export function validateMeetingUrl(rawUrl: string): ValidatedMeetingUrlResult {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    return {
      isValid: false,
      normalizedUrl: '',
      provider: null,
      providerLabel: '',
      error: 'يرجى إدخال رابط الحصة (Google Meet أو Zoom).',
    };
  }

  let candidate = trimmed;
  if (/^http:\/\//i.test(candidate)) {
    return {
      isValid: false,
      normalizedUrl: '',
      provider: null,
      providerLabel: '',
      error: 'يجب أن يبدأ الرابط الآمن بـ https://.',
    };
  }
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return {
      isValid: false,
      normalizedUrl: '',
      provider: null,
      providerLabel: '',
      error: 'صيغة الرابط غير صالحة. يرجى إدخال رابط Google Meet أو Zoom صحيح.',
    };
  }

  if (parsed.protocol !== 'https:') {
    return {
      isValid: false,
      normalizedUrl: '',
      provider: null,
      providerLabel: '',
      error: 'يجب استخدام رابط آمن يبدأ بـ https://.',
    };
  }

  const host = parsed.hostname.toLowerCase();
  const isGoogleMeet = host === 'meet.google.com';
  const isZoom =
    host === 'zoom.us' ||
    host.endsWith('.zoom.us') ||
    host === 'zoom.com' ||
    host.endsWith('.zoom.com');

  if (!isGoogleMeet && !isZoom) {
    return {
      isValid: false,
      normalizedUrl: '',
      provider: null,
      providerLabel: '',
      error: 'يُقبل فقط رابط Google Meet (meet.google.com) أو Zoom (zoom.us).',
    };
  }

  if (!parsed.pathname || parsed.pathname === '/') {
    return {
      isValid: false,
      normalizedUrl: '',
      provider: null,
      providerLabel: '',
      error: 'يرجى لصق رابط الجلسة الكامل وليس الصفحة الرئيسية للموقع.',
    };
  }

  return {
    isValid: true,
    normalizedUrl: parsed.toString(),
    provider: isGoogleMeet ? 'google_meet' : 'zoom',
    providerLabel: isGoogleMeet ? 'Google Meet' : 'Zoom',
  };
}

export function getDirectTrialStatusMeta(status: DirectTrialBookingStatus): {
  label: string;
  badgeClassName: string;
} {
  switch (status) {
    case 'confirmed':
      return {
        label: 'مؤكد',
        badgeClassName: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      };
    case 'completed':
      return {
        label: 'مكتمل',
        badgeClassName: 'bg-[#F0F5FA] text-[#0D4E8B] border-[#D1DCFE]',
      };
    case 'cancelled':
      return {
        label: 'ملغي',
        badgeClassName: 'bg-rose-50 text-rose-800 border-rose-200',
      };
  }
}

export interface AdminDirectTrialWhatsAppDraft {
  hasValidPhone: boolean;
  phoneDisplay: string;
  whatsappUrl: string | null;
  messageText: string;
  invalidReason?: string;
}

/**
 * Builds a manual WhatsApp draft message for the guardian of a direct trial booking.
 * Never auto-sends; admin clicks to copy or open wa.me.
 */
export function buildAdminDirectTrialGuardianWhatsAppDraft(
  booking: AdminDirectTrialBooking
): AdminDirectTrialWhatsAppDraft {
  const normalizedPhone = normalizeTutorContactPhone(booking.guardianWhatsApp);
  const timeInfo = formatBookingInOwnTimezone(
    booking.startsAt,
    booking.endsAt,
    booking.timezone
  );

  const lines = [
    `السلام عليكم ${booking.guardianName}، معكم فريق شاطر كلاسيز 🌟`,
    `بخصوص الحصة التجريبية المجانية المحجوزة مع ${booking.tutorName}:`,
    `📅 الموعد: ${timeInfo.fullDateLabel}`,
    `⏰ الوقت: ${timeInfo.timeRangeLabel} (${timeInfo.timezoneLabel})`,
  ];

  if (booking.meetingUrl) {
    lines.push(`🔗 رابط الانضمام للحصة: ${booking.meetingUrl}`);
  } else if (booking.status === 'confirmed') {
    lines.push('سيظهر رابط الحصة في صفحة «حجوزاتي» على الموقع قبل بدء الحصة.');
  }
  lines.push('نسعد بتواصلكم لأي استفسار.');

  const messageText = lines.join('\n');
  const whatsappUrl = normalizedPhone.isValid
    ? buildTutorWhatsAppUrl(normalizedPhone.displayPhone, undefined, messageText)
    : null;

  return {
    hasValidPhone: normalizedPhone.isValid,
    phoneDisplay: normalizedPhone.isValid
      ? normalizedPhone.displayPhone
      : booking.guardianWhatsApp || 'غير متوفر',
    whatsappUrl,
    messageText,
    invalidReason: normalizedPhone.invalidReason,
  };
}

/**
 * Builds a manual WhatsApp draft message for the tutor of a direct trial booking.
 * Never auto-sends; uses the tutor's admin-only contact resolved from AdminService.getTutorsList().
 */
export function buildAdminDirectTrialTutorWhatsAppDraft(
  booking: AdminDirectTrialBooking,
  tutorContact?: ResolvedTutorAdminContact | null
): AdminDirectTrialWhatsAppDraft {
  const timeInfo = formatBookingInOwnTimezone(
    booking.startsAt,
    booking.endsAt,
    booking.timezone
  );

  const lines = [
    `السلام عليكم ${booking.tutorName}، تحية من إدارة شاطر كلاسيز 👋`,
    `يوجد حجز تجربة مجانية مؤكد لديك مع ولي الأمر (${booking.guardianName}):`,
    `📅 التاريخ: ${timeInfo.fullDateLabel}`,
    `⏰ الوقت: ${timeInfo.timeRangeLabel} (${timeInfo.timezoneLabel})`,
  ];

  if (!booking.meetingUrl && booking.status === 'confirmed') {
    lines.push(
      'يرجى الدخول إلى لوحة المعلم > تبويب «الحجوزات التجريبية» لإضافة رابط Google Meet أو Zoom في أقرب وقت.'
    );
  } else if (booking.meetingUrl) {
    lines.push(`🔗 الرابط المضاف حاليًا: ${booking.meetingUrl}`);
  }

  const messageText = lines.join('\n');

  if (!tutorContact || !tutorContact.hasValidContact || !tutorContact.directWhatsAppUrl) {
    return {
      hasValidPhone: false,
      phoneDisplay: tutorContact?.displayPhone || 'غير مسجل',
      whatsappUrl: null,
      messageText,
      invalidReason:
        tutorContact?.invalidReason || 'لا يوجد رقم واتساب صالح مسجل لهذا المعلم.',
    };
  }

  const whatsappUrl = buildTutorWhatsAppUrl(
    tutorContact.displayPhone,
    tutorContact.countryCode,
    messageText
  );

  return {
    hasValidPhone: Boolean(whatsappUrl),
    phoneDisplay: tutorContact.displayPhone,
    whatsappUrl,
    messageText,
  };
}

const PENDING_DIRECT_TRIAL_STORAGE_KEY = 'shatir_pending_direct_trial_booking_v1';
const PENDING_DRAFT_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export interface PendingDirectTrialDraft {
  tutorId: string;
  slotId: string;
  guardianName?: string;
  countryCode?: string;
  localPhone?: string;
  savedAt: number;
}

export function savePendingDirectTrialDraft(
  draft: Omit<PendingDirectTrialDraft, 'savedAt'>
): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: PendingDirectTrialDraft = {
      ...draft,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(PENDING_DIRECT_TRIAL_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export function loadPendingDirectTrialDraft(
  tutorId?: string
): PendingDirectTrialDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PENDING_DIRECT_TRIAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingDirectTrialDraft;
    if (!parsed || !parsed.tutorId || !parsed.slotId) return null;
    if (
      typeof parsed.savedAt === 'number' &&
      Date.now() - parsed.savedAt > PENDING_DRAFT_TTL_MS
    ) {
      window.localStorage.removeItem(PENDING_DIRECT_TRIAL_STORAGE_KEY);
      return null;
    }
    if (tutorId && parsed.tutorId !== tutorId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingDirectTrialDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PENDING_DIRECT_TRIAL_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}
