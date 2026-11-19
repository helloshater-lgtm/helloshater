import assert from 'node:assert/strict';
import {
  orderParentTrialBookings,
  resolveBookingDraftSlot,
  sanitizeDirectTrialReturnTarget,
} from '../src/utils/directTrialBooking';
import { TutorAvailableSlot } from '../src/types';

// Return target for the booking page is allowed; anything else stays rejected
assert.equal(sanitizeDirectTrialReturnTarget('book/tutor-6472'), 'book/tutor-6472');
assert.equal(sanitizeDirectTrialReturnTarget('#book/tutor-6472'), 'book/tutor-6472');
assert.equal(sanitizeDirectTrialReturnTarget('book/../admin'), null);
assert.equal(sanitizeDirectTrialReturnTarget('admin'), null);

const slot = (id: string): TutorAvailableSlot =>
  ({ id, tutorId: 't1', slotDate: '2026-12-05', startTime: '16:00:00', endTime: '16:20:00', timezone: 'Africa/Cairo', isAvailable: true } as TutorAvailableSlot);
const draft = { tutorId: 't1', slotId: 's2', savedAt: Date.now() };

// The parent's own slot is restored (2nd slot, not the first one)
assert.deepEqual(resolveBookingDraftSlot(draft, [slot('s1'), slot('s2')]), { status: 'available', slot: slot('s2') });
// Taken while verifying: no automatic replacement
assert.deepEqual(resolveBookingDraftSlot(draft, [slot('s1'), slot('s3')]), { status: 'unavailable', slot: null });
assert.deepEqual(resolveBookingDraftSlot(null, [slot('s1')]), { status: 'none', slot: null });

// «حجوزاتي» ordering: next upcoming first, then the rest newest first
const NOW = Date.UTC(2026, 10, 19, 10, 0, 0);
const b = (id: string, status: string, startIso: string) => ({
  id, status, startsAt: startIso, endsAt: new Date(Date.parse(startIso) + 20 * 60000).toISOString(),
});
const { ordered, nextBookingId } = orderParentTrialBookings(
  [
    b('past', 'completed', '2026-11-10T10:00:00Z'),
    b('later', 'confirmed', '2026-11-25T10:00:00Z'),
    b('cancel', 'cancelled', '2026-11-20T10:00:00Z'),
    b('soon', 'confirmed', '2026-11-20T15:00:00Z'),
    b('ended', 'confirmed', '2026-11-18T10:00:00Z'),
  ],
  NOW
);
assert.equal(nextBookingId, 'soon');
assert.deepEqual(ordered.map((x) => x.id), ['soon', 'later', 'cancel', 'ended', 'past']);
assert.equal(orderParentTrialBookings([], NOW).nextBookingId, null);

console.log('All parent booking tests passed.');
