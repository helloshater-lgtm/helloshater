import assert from 'node:assert/strict';
import { buildTrialBookingUrl, buildTrialBookingWhatsAppShareUrl } from '../src/utils/bookingLinks';
import { ParentDashboardService, __setParentDashboardSupabaseForTests } from '../src/services/parentDashboardService';

// Booking links open #book/<id> directly, with UTM for ads/share
assert.equal(buildTrialBookingUrl('tutor-2934'), 'https://www.shatirclasses.com/#book/tutor-2934');
assert.equal(
  buildTrialBookingUrl('tutor-2934', { source: 'ads' }),
  'https://www.shatirclasses.com/?utm_source=ads&utm_medium=paid&utm_campaign=trial_booking#book/tutor-2934'
);
assert.equal(buildTrialBookingUrl('../admin'), '', 'unsafe ids are rejected');
const wa = buildTrialBookingWhatsAppShareUrl('tutor-1', 'أ. سارة');
assert.ok(wa.startsWith('https://wa.me/?text='));
assert.ok(decodeURIComponent(wa).includes('#book/tutor-1'));

async function main() {
  const calls: any[] = [];
  let mode: 'ok' | 'missing' = 'ok';
  __setParentDashboardSupabaseForTests({
    rpc: async (fn: string, args?: any) => {
      calls.push({ fn, args });
      if (mode === 'missing') return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
      if (fn === 'parent_get_my_dashboard')
        return {
          data: {
            children: [{ id: 'c1', name: 'سلمى', gradeLabel: 'الصف الرابع', notes: null, createdAt: 'x' }],
            bookings: [{ id: 'b1', tutorId: 't1', tutorName: 'س', startsAt: '2026-11-20T10:00:00Z', endsAt: '2026-11-20T10:20:00Z', timezone: 'Africa/Cairo', status: 'completed', childId: 'c1', childName: 'سلمى',
              report: { bookingId: 'b1', attended: true, levelSummary: 'كويس', covered: null, recommendation: 'حصتين', homework: null, updatedAt: 'y' } }],
          },
          error: null,
        };
      if (fn === 'parent_upsert_child') return { data: { id: 'c2', name: args.p_name, gradeLabel: args.p_grade_label }, error: null };
      if (fn === 'tutor_submit_trial_report')
        return args.p_attended === null
          ? { data: null, error: { message: 'REPORT_ATTENDANCE_REQUIRED' } }
          : { data: { success: true, report: { bookingId: args.p_booking_id, attended: args.p_attended } }, error: null };
      if (fn === 'tutor_get_my_trial_extras') return { data: [{ bookingId: 'b1', childName: 'سلمى', childGrade: null, report: null }], error: null };
      return { data: { success: true }, error: null };
    },
  } as any);

  const d = await ParentDashboardService.getDashboard();
  assert.equal(d!.children[0].name, 'سلمى');
  assert.equal(d!.bookings[0].childName, 'سلمى');
  assert.equal(d!.bookings[0].report!.recommendation, 'حصتين');
  assert.equal(d!.bookings[0].status, 'completed');

  const c = await ParentDashboardService.upsertChild({ name: '  يوسف ', gradeLabel: '' });
  assert.equal(c.id, 'c2');
  assert.deepEqual(calls.at(-1).args, { p_child_id: null, p_name: 'يوسف', p_grade_label: null, p_notes: null });

  await ParentDashboardService.setTrialChild('b1', 'c2');
  assert.deepEqual(calls.at(-1), { fn: 'parent_set_trial_child', args: { p_booking_id: 'b1', p_child_id: 'c2' } });

  const r = await ParentDashboardService.tutorSubmitReport({ bookingId: 'b1', attended: false, levelSummary: ' ' });
  assert.equal(r!.attended, false);
  assert.equal(calls.at(-1).args.p_level_summary, null, 'blank text is sent as null');
  await assert.rejects(() => ParentDashboardService.tutorSubmitReport({ bookingId: 'b1', attended: null as any }), /حدد الطفل حضر/);

  const extras = await ParentDashboardService.tutorGetTrialExtras();
  assert.equal(extras!['b1'].childName, 'سلمى');

  // Before migration 023 is applied: reads fall back quietly
  mode = 'missing';
  assert.equal(await ParentDashboardService.getDashboard(), null);
  assert.equal(await ParentDashboardService.tutorGetTrialExtras(), null);
  await assert.rejects(() => ParentDashboardService.tutorSubmitReport({ bookingId: 'b1', attended: true }), /ما اتفعّلتش/);

  __setParentDashboardSupabaseForTests(null);
  console.log('Parent dashboard service tests passed.');
}
main().catch((e) => { console.error(e); process.exit(1); });
