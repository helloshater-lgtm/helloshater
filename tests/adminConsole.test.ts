import assert from 'node:assert/strict';
import {
  AdminConsoleService,
  AdminConsoleUnavailableError,
  __setAdminConsoleSupabaseForTests,
} from '../src/services/adminConsoleService';
import {
  allowedAdminTabs,
  canAccessAdminTab,
  canEditPlatform,
  describeAuditEntry,
  parseAdminHash,
  buildAdminHash,
  qualityFlags,
  whatsappLink,
  percent,
  adminDayLabel,
} from '../src/utils/adminConsole';
import { buildCsv, csvCell } from '../src/utils/csvExport';

async function main() {
  // Permissions
  assert.ok(allowedAdminTabs('super_admin').includes('team'));
  assert.ok(!allowedAdminTabs('admin').includes('team'));
  assert.ok(allowedAdminTabs('admin').includes('activity'));
  assert.deepEqual(allowedAdminTabs('support'), ['home', 'parents', 'quality']);
  assert.equal(canAccessAdminTab('support', 'tutors'), false);
  assert.equal(canAccessAdminTab(null, 'home'), false);
  assert.equal(canEditPlatform('support'), false);
  assert.equal(canEditPlatform('admin'), true);

  // Deep links
  assert.deepEqual(parseAdminHash('#admin'), { tab: null, id: null });
  assert.deepEqual(parseAdminHash('#admin/parents/0000-aa'), { tab: 'parents', id: '0000-aa' });
  assert.deepEqual(parseAdminHash('#admin/nope'), { tab: null, id: null });
  assert.deepEqual(parseAdminHash('#admin/parents/<script>'), { tab: null, id: null });
  assert.equal(buildAdminHash('team'), '#admin/team');

  // Formatting
  assert.equal(whatsappLink('01012345678'), 'https://wa.me/201012345678');
  assert.equal(whatsappLink('+20 101 234 5678', 'أهلا'), 'https://wa.me/201012345678?text=%D8%A3%D9%87%D9%84%D8%A7');
  assert.equal(whatsappLink('12'), null);
  assert.equal(percent(1, 3), 33);
  assert.equal(percent(1, 0), null);
  const now = new Date('2026-11-19T10:00:00Z');
  assert.equal(adminDayLabel('2026-11-19T18:00:00Z', now), 'النهارده');
  assert.equal(adminDayLabel('2026-11-20T08:00:00Z', now), 'بكرة');

  // Activity log wording
  const base = { id: 1, actorEmail: 'a@x.com', entityId: 't', tutorId: 't', summary: null, createdAt: '' };
  assert.equal(
    describeAuditEntry({ ...base, action: 'update', entityType: 'tutors', tutorName: 'سارة', details: { changed: ['is_published'], values: { is_published: { from: false, to: true } } } }),
    'نشر ملف المعلم — سارة'
  );
  assert.equal(
    describeAuditEntry({ ...base, action: 'update', entityType: 'parent_leads', tutorName: null, details: { changed: ['status'], values: { status: { from: 'new', to: 'contacted' } } } }),
    'غيّر الحالة في طلب وليّ أمر: جديد ← اتكلمنا معاه'
  );
  assert.equal(
    describeAuditEntry({ ...base, action: 'update', entityType: 'tutor_private_info', tutorName: 'سارة', details: { changed: ['national_id_number'], values: {} } }),
    'عدّل بيانات معلم الخاصة — سارة (الرقم القومي)'
  );
  assert.equal(describeAuditEntry({ ...base, action: 'insert', entityType: 'direct_trial_reports', tutorName: null, details: {} }), 'أضاف تقرير حصة');

  // Quality flags
  const row = { tutorId: 't', tutorName: 'x', isPublished: true, rating: 5, reviewsCount: 1, pendingReviews: 0, bookings: 4, completed: 2, cancelled: 2, reports: 3, missingReports: 1, absences: 1, upcomingMissingLink: 1, lateLinks: 0 };
  const flags = qualityFlags(row).map((f) => f.label);
  assert.ok(flags[0].includes('من غير رابط'));
  assert.ok(flags.includes('غياب عالي'));
  assert.ok(flags.includes('إلغاء عالي'));
  assert.deepEqual(qualityFlags({ ...row, missingReports: 0, upcomingMissingLink: 0, absences: 0, cancelled: 0 }), []);

  // CSV
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('-5'), '-5');
  assert.equal(csvCell('+201012345678'), `'+201012345678`);
  assert.equal(csvCell(true), 'نعم');
  const csv = buildCsv([{ a: 'أم يوسف', b: 'x,y' }], [{ header: 'الاسم', value: (r) => r.a }, { header: 'B', value: (r) => r.b }]);
  assert.ok(csv.startsWith('﻿'));
  assert.equal(csv.slice(1), 'الاسم,B\r\nأم يوسف,"x,y"');

  // Service: normalization + errors
  const calls: Array<{ fn: string; args: any }> = [];
  __setAdminConsoleSupabaseForTests({
    rpc: async (fn: string, args?: any) => {
      calls.push({ fn, args });
      if (fn === 'admin_console_overview') {
        return { data: { role: 'support', todo: { missingLinks: 2 }, sessions: [{ id: 's1', startsAt: 'a', endsAt: 'b', hasLink: false }], kpis: { attendanceRate30d: null } }, error: null };
      }
      if (fn === 'admin_list_parents') return { data: { total: 1, items: [{ userId: 'u1', bookingsCount: '3' }] }, error: null };
      if (fn === 'admin_get_parent') return { data: { profile: { userId: 'u1' }, bookings: [{ id: 'b1', report: { attended: true } }], notes: [], children: [{ id: 'c', name: 'سلمى' }], leads: [] }, error: null };
      if (fn === 'admin_add_parent_note') return { data: null, error: { message: 'NOTE_INVALID' } };
      if (fn === 'admin_console_quality') return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
      if (fn === 'admin_invite_team_member') return { data: { status: 'invited' }, error: null };
      if (fn === 'admin_log_event') throw new Error('network');
      return { data: null, error: null };
    },
  } as any);

  const ov = await AdminConsoleService.getOverview();
  assert.equal(ov.role, 'support');
  assert.equal(ov.todo.missingLinks, 2);
  assert.equal(ov.todo.newLeads, 0);
  assert.equal(ov.kpis.attendanceRate30d, null);
  assert.equal(ov.sessions[0].hasLink, false);

  const parents = await AdminConsoleService.listParents('  أم  ');
  assert.equal(parents.items[0].bookingsCount, 3);
  assert.equal(calls.find((c) => c.fn === 'admin_list_parents')!.args.p_search, 'أم');
  const empty = await AdminConsoleService.listParents('   ');
  assert.equal(calls.filter((c) => c.fn === 'admin_list_parents')[1].args.p_search, null);
  assert.equal(empty.total, 1);

  const detail = await AdminConsoleService.getParent('u1');
  assert.equal(detail.bookings[0].report?.attended, true);
  assert.equal(detail.children[0].name, 'سلمى');

  await assert.rejects(() => AdminConsoleService.addParentNote('u1', ''), /اكتب الملاحظة/);
  await assert.rejects(() => AdminConsoleService.getQuality(30), (e: any) => e instanceof AdminConsoleUnavailableError);
  assert.equal(await AdminConsoleService.inviteTeamMember('a@b.com', 'support'), 'invited');
  await AdminConsoleService.logEvent('export_csv', 'x'); // never throws

  __setAdminConsoleSupabaseForTests(null);
  console.log('admin console: all checks passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
