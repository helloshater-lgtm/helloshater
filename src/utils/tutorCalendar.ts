import { DirectTrialBooking, TutorAvailableSlot, TutorPrivateSlot } from '../types';
import { addDaysToCalendarDate, getCalendarDayOfWeek, isSlotInFuture } from './formatters';

/**
 * Tutor dashboard calendar model (pure functions, no React).
 *
 * Each item is placed by its own wall-clock date/time in its own timezone
 * (the same way the tutor entered it), so a slot saved at 16:00 Cairo
 * always appears at 16:00 on the right day.
 */

export type TutorCalendarEventKind =
  | 'trial_available' // موعد تجريبي متاح (مجاني 20 د)
  | 'private_available' // موعد خاص متاح (مدفوع)
  | 'trial_booking' // حجز تجريبي مؤكد
  | 'trial_completed' // حصة تجريبية مكتملة
  | 'private_booking' // حجز خاص مؤكد
  | 'inactive'; // انقضى وقته أو موقوف إدارياً أو غير متاح

export interface TutorCalendarEvent {
  id: string;
  kind: TutorCalendarEventKind;
  date: string; // YYYY-MM-DD in event timezone
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  timezone: string;
  /** Short reason shown for inactive items. */
  inactiveReason?: 'past' | 'suspended' | 'unavailable';
  trialSlot?: TutorAvailableSlot;
  privateSlot?: TutorPrivateSlot;
  booking?: DirectTrialBooking;
}

export const TUTOR_CALENDAR_KIND_META: Record<
  TutorCalendarEventKind,
  { label: string; description: string; chipClass: string; dotClass: string }
> = {
  trial_available: {
    label: 'تجريبي متاح',
    description: 'حصة تجريبية مجانية ٢٠ دقيقة يقدر وليّ الأمر يحجزها',
    chipClass: 'bg-[#EBF3FC] border-[#0D4E8B]/40 text-[#0D4E8B]',
    dotClass: 'bg-[#0D4E8B]',
  },
  private_available: {
    label: 'خاص متاح',
    description: 'حصة خاصة مدفوعة بسعرك ومدتك',
    chipClass: 'bg-[#FFF7DB] border-[#E0A800]/60 text-[#7A5600]',
    dotClass: 'bg-[#FFC629]',
  },
  trial_booking: {
    label: 'حجز تجريبي مؤكد',
    description: 'وليّ أمر حجز الموعد — اضغط لإضافة رابط الحصة',
    chipClass: 'bg-emerald-600 border-emerald-700 text-white',
    dotClass: 'bg-emerald-600',
  },
  private_booking: {
    label: 'حجز خاص مؤكد',
    description: 'حصة خاصة محجوزة ومؤكدة',
    chipClass: 'bg-emerald-600 border-emerald-700 text-white',
    dotClass: 'bg-emerald-600',
  },
  trial_completed: {
    label: 'حصة مكتملة',
    description: 'حصة تجريبية تم تسجيل إتمامها',
    chipClass: 'bg-slate-100 border-slate-300 text-slate-600',
    dotClass: 'bg-slate-400',
  },
  inactive: {
    label: 'غير متاح',
    description: 'انقضى وقته أو موقوف من الإدارة',
    chipClass: 'bg-slate-50 border-dashed border-slate-300 text-slate-500',
    dotClass: 'bg-slate-300',
  },
};

const hhmm = (value: string | null | undefined): string => String(value || '').slice(0, 5);

/**
 * Converts an ISO instant into the wall-clock date and time inside `timezone`.
 */
export function getZonedDateAndTime(
  isoString: string,
  timezone = 'Africa/Cairo'
): { date: string; time: string } | null {
  const ms = Date.parse(isoString);
  if (Number.isNaN(ms)) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(ms));
    const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
    const hour = get('hour') === '24' ? '00' : get('hour');
    return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${hour}:${get('minute')}` };
  } catch {
    return null;
  }
}

/**
 * Week shown in the calendar starts on Saturday (common in Egypt and the Gulf).
 * Returns 7 dates (YYYY-MM-DD) from Saturday to Friday containing `anchorDate`.
 */
export function getCalendarWeekDates(anchorDate: string): string[] {
  const dow = getCalendarDayOfWeek(anchorDate); // 0=Sun ... 6=Sat
  if (dow < 0) return [];
  const daysSinceSaturday = (dow + 1) % 7;
  const saturday = addDaysToCalendarDate(anchorDate, -daysSinceSaturday);
  return Array.from({ length: 7 }, (_, i) => addDaysToCalendarDate(saturday, i));
}

export function timeToMinutes(time: string): number {
  const [h, m] = hhmm(time).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

/**
 * Builds a single list of calendar events from the tutor's existing data:
 * - trial slots (tutor_get_my_slots)
 * - private slots (tutor_get_my_private_slots)
 * - direct trial bookings (tutor_get_my_direct_trials)
 *
 * A booked trial slot is represented by its booking (so it is never shown twice).
 */
export function buildTutorCalendarEvents(params: {
  trialSlots: TutorAvailableSlot[];
  privateSlots: TutorPrivateSlot[];
  directTrialBookings: DirectTrialBooking[];
  referenceNowMs?: number;
}): TutorCalendarEvent[] {
  const now = params.referenceNowMs;
  const events: TutorCalendarEvent[] = [];
  const bookedSlotIds = new Set<string>();

  for (const booking of params.directTrialBookings || []) {
    if (!booking || booking.status === 'cancelled') continue;
    const tz = booking.timezone || 'Africa/Cairo';
    const start = getZonedDateAndTime(booking.startsAt, tz);
    const end = getZonedDateAndTime(booking.endsAt, tz);
    if (!start) continue;
    if (booking.slotId) bookedSlotIds.add(booking.slotId);
    events.push({
      id: `booking:${booking.id}`,
      kind: booking.status === 'completed' ? 'trial_completed' : 'trial_booking',
      date: start.date,
      startTime: start.time,
      endTime: end?.time || start.time,
      timezone: tz,
      booking,
    });
  }

  for (const slot of params.trialSlots || []) {
    if (!slot || bookedSlotIds.has(slot.id)) continue;
    const tz = slot.timezone || 'Africa/Cairo';
    const isFuture = isSlotInFuture(slot.slotDate, slot.startTime, tz, now);
    let kind: TutorCalendarEventKind = 'trial_available';
    let inactiveReason: TutorCalendarEvent['inactiveReason'];
    if (slot.adminSuspended) {
      kind = 'inactive';
      inactiveReason = 'suspended';
    } else if (!isFuture) {
      kind = 'inactive';
      inactiveReason = 'past';
    } else if (slot.isBooked) {
      // Booked but its booking row is not visible yet: still show it as booked.
      kind = 'trial_booking';
    } else if (!slot.isAvailable) {
      kind = 'inactive';
      inactiveReason = 'unavailable';
    }
    events.push({
      id: `trial:${slot.id}`,
      kind,
      inactiveReason,
      date: String(slot.slotDate || '').slice(0, 10),
      startTime: hhmm(slot.startTime),
      endTime: hhmm(slot.endTime),
      timezone: tz,
      trialSlot: slot,
    });
  }

  for (const slot of params.privateSlots || []) {
    if (!slot) continue;
    const tz = slot.timezone || 'Africa/Cairo';
    const isFuture = isSlotInFuture(slot.slotDate, slot.startTime, tz, now);
    let kind: TutorCalendarEventKind = 'private_available';
    let inactiveReason: TutorCalendarEvent['inactiveReason'];
    if (slot.isBooked) {
      kind = 'private_booking';
    } else if (slot.adminSuspended) {
      kind = 'inactive';
      inactiveReason = 'suspended';
    } else if (!isFuture) {
      kind = 'inactive';
      inactiveReason = 'past';
    } else if (!slot.isAvailable) {
      kind = 'inactive';
      inactiveReason = 'unavailable';
    }
    events.push({
      id: `private:${slot.id}`,
      kind,
      inactiveReason,
      date: String(slot.slotDate || '').slice(0, 10),
      startTime: hhmm(slot.startTime),
      endTime: hhmm(slot.endTime),
      timezone: tz,
      privateSlot: slot,
    });
  }

  return events.sort((a, b) =>
    a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)
  );
}

/**
 * Hour range shown in the desktop week grid: 08:00–23:00 by default,
 * widened to include any event of the week that falls outside it.
 */
export function getCalendarHourRange(
  events: TutorCalendarEvent[],
  defaultStart = 8,
  defaultEnd = 23
): { startHour: number; endHour: number } {
  let startHour = defaultStart;
  let endHour = defaultEnd;
  for (const ev of events) {
    const s = Math.floor(timeToMinutes(ev.startTime) / 60);
    const eMin = timeToMinutes(ev.endTime);
    const e = Math.ceil((eMin > timeToMinutes(ev.startTime) ? eMin : timeToMinutes(ev.startTime) + 20) / 60);
    startHour = Math.min(startHour, s);
    endHour = Math.max(endHour, Math.min(24, e));
  }
  return { startHour, endHour };
}
