import assert from 'node:assert/strict';
import {
  buildTutorCalendarEvents,
  getCalendarWeekDates,
  getCalendarHourRange,
  getZonedDateAndTime,
} from '../src/utils/tutorCalendar';
import { DirectTrialBooking, TutorAvailableSlot, TutorPrivateSlot } from '../src/types';

// Reference "now": 2026-11-19 10:00 UTC (12:00 Cairo)
const NOW = Date.UTC(2026, 10, 19, 10, 0, 0);

// Week starts Saturday
assert.deepEqual(getCalendarWeekDates('2026-11-19'), [
  '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20',
]);
assert.equal(getCalendarWeekDates('2026-11-21')[0], '2026-11-21');

// Booking instant is shown in its own timezone
assert.deepEqual(getZonedDateAndTime('2026-11-19T13:00:00Z', 'Africa/Cairo'), { date: '2026-11-19', time: '15:00' });

const trial = (id: string, date: string, start: string, extra: Partial<TutorAvailableSlot> = {}): TutorAvailableSlot => ({
  id, tutorId: 't1', slotDate: date, startTime: `${start}:00`, endTime: '23:59:00',
  timezone: 'Africa/Cairo', isAvailable: true, isBooked: false, ...extra,
} as TutorAvailableSlot);

const priv = (id: string, date: string, start: string, extra: Partial<TutorPrivateSlot> = {}): TutorPrivateSlot => ({
  id, specializationLabel: 'رياضيات', slotDate: date, startTime: `${start}:00`, endTime: '18:50:00',
  timezone: 'Africa/Cairo', durationMinutes: 50, priceAmount: 150, currency: 'ج.م',
  isAvailable: true, isBooked: false, ...extra,
});

const booking: DirectTrialBooking = {
  id: 'b1', slotId: 'tr-booked', tutorId: 't1', tutorName: 'أ. تجربة',
  startsAt: '2026-11-20T14:00:00Z', endsAt: '2026-11-20T14:20:00Z', timezone: 'Africa/Cairo',
  status: 'confirmed', meetingUrl: null, createdAt: '2026-11-19T09:00:00Z',
};

const events = buildTutorCalendarEvents({
  trialSlots: [
    trial('tr-future', '2026-11-20', '16:00'),
    trial('tr-booked', '2026-11-20', '16:00', { isBooked: true }),
    trial('tr-past', '2026-11-18', '16:00'),
    trial('tr-suspended', '2026-11-21', '16:00', { adminSuspended: true }),
  ],
  privateSlots: [
    priv('pv-future', '2026-11-21', '18:00'),
    priv('pv-booked', '2026-11-22', '18:00', { isBooked: true }),
  ],
  directTrialBookings: [booking, { ...booking, id: 'b-cancel', slotId: 'x', status: 'cancelled' }],
  referenceNowMs: NOW,
});

const byId = Object.fromEntries(events.map((e) => [e.id, e]));
assert.equal(byId['trial:tr-future'].kind, 'trial_available');
assert.equal(byId['trial:tr-booked'], undefined, 'booked trial slot is shown once, as its booking');
assert.equal(byId['booking:b1'].kind, 'trial_booking');
assert.equal(byId['booking:b1'].date, '2026-11-20');
assert.equal(byId['booking:b1'].startTime, '16:00');
assert.equal(byId['booking:b-cancel'], undefined, 'cancelled bookings are hidden');
assert.equal(byId['trial:tr-past'].kind, 'inactive');
assert.equal(byId['trial:tr-past'].inactiveReason, 'past');
assert.equal(byId['trial:tr-suspended'].inactiveReason, 'suspended');
assert.equal(byId['private:pv-future'].kind, 'private_available');
assert.equal(byId['private:pv-booked'].kind, 'private_booking');

// Sorted by date then time
const keys = events.map((e) => `${e.date} ${e.startTime}`);
assert.deepEqual([...keys].sort(), keys);

// Hour range widens for early/late events
assert.deepEqual(getCalendarHourRange([]), { startHour: 8, endHour: 23 });
assert.deepEqual(
  getCalendarHourRange([{ ...byId['trial:tr-future'], startTime: '06:30', endTime: '06:50' }]),
  { startHour: 6, endHour: 23 }
);

console.log('All tutor calendar tests passed.');
