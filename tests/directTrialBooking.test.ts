import assert from 'node:assert/strict';
import {
  getZonedSlotUtcMs,
  filterDirectBookingTrialSlots,
  formatMinimumNoticeArabic,
  formatBookingInOwnTimezone,
  hasBookingEnded,
  validateMeetingUrl,
  buildAdminDirectTrialGuardianWhatsAppDraft,
  buildAdminDirectTrialTutorWhatsAppDraft,
} from '../src/utils/directTrialBooking';
import {
  DirectTrialBookingService,
  DirectTrialBookingError,
  __setDirectTrialSupabaseForTests,
} from '../src/services/directTrialBookingService';
import { isExcludedMetaRoute } from '../src/services/metaPixelService';
import { SHATIR_CONFIG } from '../src/config/shatirConfig';
import { TutorAvailableSlot, AdminDirectTrialBooking } from '../src/types';
import { resolveTutorAdminContact } from '../src/utils/tutorReadinessAndContact';

// 1. Notice window & timezone filtering
{
  // Fix reference time: 2026-12-01T10:00:00Z (12:00 PM Africa/Cairo, 13:00 PM Asia/Riyadh)
  const nowMs = Date.UTC(2026, 11, 1, 10, 0, 0);

  const slots: TutorAvailableSlot[] = [
    {
      id: 'slot-too-soon-cairo',
      tutorId: 'tutor-1',
      slotDate: '2026-12-01',
      startTime: '15:30:00', // 13:30Z -> +3.5h (< 4h notice)
      endTime: '15:50:00',
      timezone: 'Africa/Cairo',
      isAvailable: true,
    },
    {
      id: 'slot-exact-4h-cairo',
      tutorId: 'tutor-1',
      slotDate: '2026-12-01',
      startTime: '16:00:00', // 14:00Z -> +4.0h (=== 240 mins)
      endTime: '16:20:00',
      timezone: 'Africa/Cairo',
      isAvailable: true,
    },
    {
      id: 'slot-booked',
      tutorId: 'tutor-1',
      slotDate: '2026-12-02',
      startTime: '18:00:00',
      endTime: '18:20:00',
      timezone: 'Africa/Cairo',
      isAvailable: true,
      isBooked: true,
    },
    {
      id: 'slot-suspended',
      tutorId: 'tutor-1',
      slotDate: '2026-12-02',
      startTime: '19:00:00',
      endTime: '19:20:00',
      timezone: 'Africa/Cairo',
      isAvailable: true,
      adminSuspended: true,
    },
    {
      id: 'slot-riyadh-valid',
      tutorId: 'tutor-1',
      slotDate: '2026-12-01',
      startTime: '17:30:00', // Riyadh UTC+3 -> 14:30Z -> +4.5h
      endTime: '17:50:00',
      timezone: 'Asia/Riyadh',
      isAvailable: true,
    },
  ];

  const exactUtcCairo = getZonedSlotUtcMs('2026-12-01', '16:00:00', 'Africa/Cairo');
  assert.equal(exactUtcCairo, Date.UTC(2026, 11, 1, 14, 0, 0));

  const exactUtcRiyadh = getZonedSlotUtcMs('2026-12-01', '17:30:00', 'Asia/Riyadh');
  assert.equal(exactUtcRiyadh, Date.UTC(2026, 11, 1, 14, 30, 0));

  const qualifying = filterDirectBookingTrialSlots(slots, 240, nowMs);
  assert.deepEqual(
    qualifying.map((s) => s.id),
    ['slot-exact-4h-cairo', 'slot-riyadh-valid']
  );

  assert.equal(formatMinimumNoticeArabic(240), '٤ ساعات');
  assert.equal(formatMinimumNoticeArabic(45), '٤٥ دقيقة');
}

// 2. Booking time formatting strictly respects booking.timezone and completion boundary
{
  const cairoDisplay = formatBookingInOwnTimezone(
    '2026-12-01T14:00:00.000Z',
    '2026-12-01T14:20:00.000Z',
    'Africa/Cairo'
  );
  const riyadhDisplay = formatBookingInOwnTimezone(
    '2026-12-01T14:00:00.000Z',
    '2026-12-01T14:20:00.000Z',
    'Asia/Riyadh'
  );
  assert.ok(cairoDisplay.timezoneLabel.includes('القاهرة'));
  assert.ok(riyadhDisplay.timezoneLabel.includes('الرياض'));
  assert.notEqual(cairoDisplay.startTimeLabel, riyadhDisplay.startTimeLabel);

  assert.equal(
    hasBookingEnded('2026-12-01T14:20:00.000Z', Date.UTC(2026, 11, 1, 14, 19, 59)),
    false
  );
  assert.equal(
    hasBookingEnded('2026-12-01T14:20:00.000Z', Date.UTC(2026, 11, 1, 14, 20, 0)),
    true
  );
}

// 3. Google Meet / Zoom link validator
{
  const meetValid = validateMeetingUrl('https://meet.google.com/abc-defg-hij');
  assert.equal(meetValid.isValid, true);
  assert.equal(meetValid.provider, 'google_meet');

  const zoomValid = validateMeetingUrl('us06web.zoom.us/j/123456789?pwd=xyz');
  assert.equal(zoomValid.isValid, true);
  assert.equal(zoomValid.provider, 'zoom');
  assert.ok(zoomValid.normalizedUrl.startsWith('https://'));

  assert.equal(validateMeetingUrl('http://meet.google.com/abc-defg-hij').isValid, false);
  assert.equal(validateMeetingUrl('https://example.com/room/1').isValid, false);
  assert.equal(validateMeetingUrl('https://meet.google.com/').isValid, false);
}

// 4. DirectTrialBookingService RPC contracts & slot conflict handling
async function testServiceRpcs() {
  const recordedCalls: Array<{ fn: string; args?: any }> = [];

  const mockSupabase: any = {
    rpc: async (fn: string, args?: any) => {
      recordedCalls.push({ fn, args });
      if (fn === 'get_direct_trial_booking_policy') {
        return {
          data: {
            minimumNoticeMinutes: 240,
            trialDurationMinutes: 20,
            directBookingAvailable: true,
          },
          error: null,
        };
      }
      if (fn === 'parent_book_trial') {
        if (args?.p_slot_id === 'taken-slot') {
          return {
            data: null,
            error: { code: 'P0001', message: 'Selected slot is already booked' },
          };
        }
        return {
          data: {
            id: 'booking-1',
            slotId: args?.p_slot_id,
            tutorId: 'tutor-1',
            tutorName: 'أ. مريم عادل',
            startsAt: '2026-12-05T14:00:00Z',
            endsAt: '2026-12-05T14:20:00Z',
            timezone: 'Africa/Cairo',
            status: 'confirmed',
            meetingUrl: null,
            createdAt: '2026-12-01T10:00:00Z',
          },
          error: null,
        };
      }
      if (fn === 'parent_get_my_trial_bookings' || fn === 'tutor_get_my_direct_trials') {
        return {
          data: [
            {
              id: 'booking-1',
              slotId: 'slot-1',
              tutorId: 'tutor-1',
              tutorName: 'أ. مريم عادل',
              startsAt: '2026-12-05T14:00:00Z',
              endsAt: '2026-12-05T14:20:00Z',
              timezone: 'Africa/Cairo',
              status: 'confirmed',
              meetingUrl: 'https://meet.google.com/abc-defg-hij',
              createdAt: '2026-12-01T10:00:00Z',
            },
          ],
          error: null,
        };
      }
      if (fn === 'tutor_set_direct_trial_meeting') {
        return {
          data: {
            id: args.p_booking_id,
            slotId: 'slot-1',
            tutorId: 'tutor-1',
            tutorName: 'أ. مريم عادل',
            startsAt: '2026-12-05T14:00:00Z',
            endsAt: '2026-12-05T14:20:00Z',
            timezone: 'Africa/Cairo',
            status: 'confirmed',
            meetingUrl: args.p_meeting_url,
            createdAt: '2026-12-01T10:00:00Z',
          },
          error: null,
        };
      }
      if (fn === 'tutor_mark_direct_trial_completed') {
        return {
          data: {
            id: args.p_booking_id,
            slotId: 'slot-1',
            tutorId: 'tutor-1',
            tutorName: 'أ. مريم عادل',
            startsAt: '2026-12-05T14:00:00Z',
            endsAt: '2026-12-05T14:20:00Z',
            timezone: 'Africa/Cairo',
            status: 'completed',
            meetingUrl: 'https://meet.google.com/abc-defg-hij',
            createdAt: '2026-12-01T10:00:00Z',
          },
          error: null,
        };
      }
      if (fn === 'admin_get_direct_trial_bookings') {
        return {
          data: [
            {
              id: 'booking-1',
              slotId: null,
              tutorId: 'tutor-1',
              tutorName: 'أ. مريم عادل',
              startsAt: '2026-12-05T14:00:00Z',
              endsAt: '2026-12-05T14:20:00Z',
              timezone: 'Africa/Cairo',
              status: 'confirmed',
              meetingUrl: null,
              createdAt: '2026-12-01T10:00:00Z',
              guardianName: 'والدة سلمى',
              guardianWhatsApp: '+201012345678',
            },
          ],
          error: null,
        };
      }
      if (fn === 'admin_cancel_direct_trial') {
        return {
          data: {
            id: args.p_booking_id,
            slotId: null,
            tutorId: 'tutor-1',
            tutorName: 'أ. مريم عادل',
            startsAt: '2026-12-05T14:00:00Z',
            endsAt: '2026-12-05T14:20:00Z',
            timezone: 'Africa/Cairo',
            status: 'cancelled',
            meetingUrl: null,
            createdAt: '2026-12-01T10:00:00Z',
            guardianName: 'والدة سلمى',
            guardianWhatsApp: '+201012345678',
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  };

  __setDirectTrialSupabaseForTests(mockSupabase);

  try {
    const policy = await DirectTrialBookingService.getDirectTrialBookingPolicy('tutor-1');
    assert.equal(policy.directBookingAvailable, true);
    assert.equal(policy.minimumNoticeMinutes, 240);

    const booking = await DirectTrialBookingService.parentBookTrial({
      slotId: 'slot-1',
      guardianName: 'والدة سلمى',
      whatsapp: '+201012345678',
    });
    assert.equal(booking.id, 'booking-1');
    assert.equal(booking.status, 'confirmed');

    // Conflict scenario marks isSlotUnavailable so TutorProfileView reloads slots
    await assert.rejects(
      async () =>
        DirectTrialBookingService.parentBookTrial({
          slotId: 'taken-slot',
          guardianName: 'والدة سلمى',
          whatsapp: '+201012345678',
        }),
      (err: unknown) =>
        err instanceof DirectTrialBookingError && err.isSlotUnavailable === true
    );

    const myTrials = await DirectTrialBookingService.parentGetMyTrialBookings();
    assert.equal(myTrials.length, 1);

    const tutorTrials = await DirectTrialBookingService.tutorGetMyDirectTrials();
    assert.equal(tutorTrials.length, 1);

    await DirectTrialBookingService.tutorSetDirectTrialMeeting({
      bookingId: 'booking-1',
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
    });
    await DirectTrialBookingService.tutorMarkDirectTrialCompleted('booking-1');

    const adminList = await DirectTrialBookingService.adminGetDirectTrialBookings();
    assert.equal(adminList.length, 1);
    assert.equal(adminList[0].guardianName, 'والدة سلمى');
    assert.equal(adminList[0].guardianWhatsApp, '+201012345678');

    await DirectTrialBookingService.adminCancelDirectTrial('booking-1');

    assert.deepEqual(
      recordedCalls.map((c) => c.fn),
      [
        'get_direct_trial_booking_policy',
        'parent_book_trial',
        'parent_book_trial',
        'parent_get_my_trial_bookings',
        'tutor_get_my_direct_trials',
        'tutor_set_direct_trial_meeting',
        'tutor_mark_direct_trial_completed',
        'admin_get_direct_trial_bookings',
        'admin_cancel_direct_trial',
      ]
    );
    assert.deepEqual(recordedCalls[0].args, { p_tutor_id: 'tutor-1' });
    assert.deepEqual(recordedCalls[1].args, {
      p_slot_id: 'slot-1',
      p_guardian_name: 'والدة سلمى',
      p_whatsapp: '+201012345678',
    });
  } finally {
    __setDirectTrialSupabaseForTests(null);
  }
}

// 5. Admin manual WhatsApp drafts + Meta Pixel isolation
function testAdminDraftsAndMetaExclusion() {
  const adminBooking: AdminDirectTrialBooking = {
    id: 'booking-99',
    slotId: null,
    tutorId: 'tutor-1',
    tutorName: 'أ. مريم عادل',
    startsAt: '2026-12-05T14:00:00Z',
    endsAt: '2026-12-05T14:20:00Z',
    timezone: 'Africa/Cairo',
    status: 'confirmed',
    meetingUrl: null,
    createdAt: '2026-12-01T10:00:00Z',
    guardianName: 'أحمد علي',
    guardianWhatsApp: '+966501234567',
  };

  const guardianDraft = buildAdminDirectTrialGuardianWhatsAppDraft(adminBooking);
  assert.equal(guardianDraft.hasValidPhone, true);
  assert.ok(guardianDraft.whatsappUrl?.startsWith('https://wa.me/966501234567?text='));

  const tutorContact = resolveTutorAdminContact({
    tutorId: 'tutor-1',
    privateInfo: {
      countryCode: '+20',
      whatsappNumber: '01099887766',
    },
  });
  const tutorDraft = buildAdminDirectTrialTutorWhatsAppDraft(adminBooking, tutorContact);
  assert.equal(tutorDraft.hasValidPhone, true);
  assert.ok(tutorDraft.whatsappUrl?.startsWith('https://wa.me/201099887766?text='));
  assert.ok(tutorDraft.messageText.includes('الحجوزات التجريبية'));

  // Meta Pixel remains disabled and #my-trials route is excluded
  assert.equal(SHATIR_CONFIG.metaPixelEnabled, false);
  assert.equal(isExcludedMetaRoute('my-trials', '#my-trials'), true);
}

async function main() {
  await testServiceRpcs();
  testAdminDraftsAndMetaExclusion();
  console.log('ALL DIRECT TRIAL BOOKING TESTS PASSED ✅');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
