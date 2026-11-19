/**
 * Runs migrations 023 + 024 on an in-memory Postgres (PGlite) with a minimal
 * stub of the older objects they depend on, then checks roles, the activity
 * log trigger, parents CRM, search, overview, quality, funnel and team rules.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const STUB = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id UUID PRIMARY KEY, email TEXT, created_at TIMESTAMPTZ DEFAULT NOW(),
  last_sign_in_at TIMESTAMPTZ, email_confirmed_at TIMESTAMPTZ DEFAULT NOW());
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
CREATE TABLE public.admin_users (user_id UUID PRIMARY KEY REFERENCES auth.users(id), email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin', is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_users_role_check CHECK (role IN ('super_admin', 'admin')));
CREATE FUNCTION public.is_admin() RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND is_active) $$;
CREATE TABLE public.tutors (id TEXT PRIMARY KEY, name TEXT, is_published BOOLEAN DEFAULT TRUE,
  rating NUMERIC, reviews_count INT DEFAULT 0, updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE public.tutor_private_info (tutor_id TEXT PRIMARY KEY, phone_number TEXT, whatsapp_number TEXT, email TEXT, national_id_number TEXT);
CREATE TABLE public.tutor_account_links (tutor_id TEXT, user_id UUID, is_active BOOLEAN);
CREATE TABLE public.tutor_applications (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), reference_code TEXT, full_name TEXT,
  phone TEXT, whatsapp_number TEXT, email TEXT, status TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE public.tutor_profile_drafts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tutor_id TEXT, status TEXT);
CREATE TABLE public.tutor_reviews (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tutor_id TEXT, status TEXT);
CREATE TABLE public.tutor_groups (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tutor_id TEXT, review_status TEXT);
CREATE TABLE public.parent_leads (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), reference_code TEXT, status TEXT DEFAULT 'new',
  guardian_name TEXT, country_code TEXT, phone TEXT, utm_source TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE public.direct_trial_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slot_id UUID, tutor_id TEXT NOT NULL,
  guardian_user_id UUID NOT NULL, guardian_name TEXT NOT NULL, guardian_whatsapp TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ NOT NULL, timezone TEXT NOT NULL DEFAULT 'Africa/Cairo',
  status TEXT NOT NULL DEFAULT 'confirmed', meeting_url TEXT, meeting_added_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE FUNCTION public.get_current_tutor_id() RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT tutor_id FROM public.tutor_account_links WHERE user_id = auth.uid() AND is_active LIMIT 1 $$;
CREATE FUNCTION public.acquire_tutor_lock(p TEXT) RETURNS VOID LANGUAGE sql AS $$ SELECT $$;
CREATE FUNCTION public.internal_direct_trial_json(p_booking public.direct_trial_bookings) RETURNS JSONB LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('id', p_booking.id, 'tutorId', p_booking.tutor_id, 'status', p_booking.status,
    'startsAt', p_booking.starts_at, 'endsAt', p_booking.ends_at) $$;
`;

const SUPER = '00000000-0000-0000-0000-0000000000a1';
const ADMIN = '00000000-0000-0000-0000-0000000000a2';
const SUPPORT = '00000000-0000-0000-0000-0000000000a3';
const PARENT = '00000000-0000-0000-0000-0000000000b1';
const STRANGER = '00000000-0000-0000-0000-0000000000c1';
const INVITEE = '00000000-0000-0000-0000-0000000000d1';

const read = (name: string) =>
  readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8').replace(/NOTIFY pgrst[^;]*;/, '');

async function main() {
  const db = new PGlite();
  await db.exec(STUB);
  await db.exec(read('023_parent_children_and_trial_reports.sql'));
  const m024 = read('024_admin_console.sql');
  await db.exec(m024);
  await db.exec(m024); // idempotent

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${SUPER}', 'boss@x.com'), ('${ADMIN}', 'ops@x.com'),
      ('${SUPPORT}', 'help@x.com'), ('${PARENT}', 'mom@x.com'), ('${STRANGER}', 'nobody@x.com');
    INSERT INTO public.admin_users (user_id, email, role) VALUES ('${SUPER}', 'boss@x.com', 'super_admin'), ('${ADMIN}', 'ops@x.com', 'admin');
    INSERT INTO public.tutors (id, name) VALUES ('tutor-1', 'سارة أحمد'), ('tutor-2', 'محمد علي');
    INSERT INTO public.tutor_private_info VALUES ('tutor-1', '01012345678', NULL, 'sara@x.com', '2990101');
    INSERT INTO public.parent_leads (guardian_name, country_code, phone, utm_source, reference_code)
      VALUES ('أم يوسف', '+20', '1098765432', 'facebook', 'L-100'), ('أبو آدم', '+20', '1111111111', NULL, 'L-101');
    INSERT INTO public.tutor_applications (full_name, status, reference_code) VALUES ('منى حسن', 'submitted', 'A-1');
    INSERT INTO public.direct_trial_bookings (id, tutor_id, guardian_user_id, guardian_name, guardian_whatsapp, starts_at, ends_at)
      VALUES ('10000000-0000-0000-0000-000000000001', 'tutor-1', '${PARENT}', 'أم يوسف', '+201098765432', NOW() - interval '2 hour', NOW() - interval '100 minute'),
             ('10000000-0000-0000-0000-000000000002', 'tutor-1', '${PARENT}', 'أم يوسف', '+201098765432', NOW() + interval '3 hour', NOW() + interval '200 minute');
  `);

  const as = async (uid: string | null, sql: string, params: any[] = []) => {
    await db.exec(`SELECT set_config('test.uid', '${uid ?? ''}', false)`);
    return (await db.query<any>(sql, params)).rows;
  };
  const one = async (uid: string | null, sql: string, params: any[] = []) => Object.values((await as(uid, sql, params))[0])[0] as any;
  const rejects = async (uid: string | null, sql: string, params: any[], code: string) => {
    await assert.rejects(() => as(uid, sql, params), (e: any) => String(e.message).includes(code), code);
  };

  // --- Roles / team --------------------------------------------------------------
  assert.equal((await one(SUPER, `SELECT public.admin_invite_team_member('help@x.com', 'support')`)).status, 'added');
  assert.equal((await one(SUPER, `SELECT public.admin_invite_team_member('New@X.com', 'admin')`)).status, 'invited');
  await rejects(ADMIN, `SELECT public.admin_invite_team_member('a@b.com', 'admin')`, [], 'ADMIN_FORBIDDEN');
  await rejects(SUPER, `SELECT public.admin_update_team_member($1, 'admin', TRUE)`, [SUPER], 'TEAM_SELF_CHANGE');
  await rejects(SUPER, `SELECT public.admin_invite_team_member('bad', 'admin')`, [], 'TEAM_EMAIL_INVALID');
  await rejects(SUPER, `SELECT public.admin_invite_team_member('a@b.com', 'owner')`, [], 'TEAM_ROLE_INVALID');
  assert.equal(await one(SUPPORT, `SELECT public.is_admin()`), false, 'support is not a full admin');
  assert.equal(await one(SUPPORT, `SELECT public.is_admin_staff()`), true);
  assert.equal(await one(ADMIN, `SELECT public.is_admin()`), true);
  const team = await one(SUPER, `SELECT public.admin_list_team()`);
  assert.equal(team.members.length, 3);
  assert.equal(team.invites[0].email, 'new@x.com');

  // Invite claim: only the verified owner of that email
  await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${INVITEE}', 'new@x.com')`);
  assert.equal((await one(STRANGER, `SELECT public.admin_claim_team_invite()`)).claimed, false);
  const claim = await one(INVITEE, `SELECT public.admin_claim_team_invite()`);
  assert.equal(claim.claimed, true);
  assert.equal(claim.role, 'admin');
  assert.equal(await one(INVITEE, `SELECT public.is_admin()`), true);

  // --- Access: non-staff refused everywhere ------------------------------------------
  for (const sql of [
    `SELECT public.admin_console_overview()`,
    `SELECT public.admin_console_search('سارة')`,
    `SELECT public.admin_list_parents(NULL, 50, 0)`,
    `SELECT public.admin_console_quality(30)`,
    `SELECT public.admin_console_funnel(30)`,
    `SELECT public.admin_list_audit_log(50, NULL, NULL)`,
  ]) {
    await rejects(PARENT, sql, [], 'ADMIN_FORBIDDEN');
    await rejects(null, sql, [], 'ADMIN_FORBIDDEN');
  }
  await rejects(SUPPORT, `SELECT public.admin_list_audit_log(50, NULL, NULL)`, [], 'ADMIN_FORBIDDEN');
  await rejects(SUPPORT, `SELECT public.admin_list_team()`, [], 'ADMIN_FORBIDDEN');

  // --- Overview ------------------------------------------------------------------------
  const ov = await one(SUPPORT, `SELECT public.admin_console_overview()`);
  assert.equal(ov.role, 'support');
  assert.equal(ov.todo.missingLinks, 1);
  assert.equal(ov.todo.missingReports, 1);
  assert.equal(ov.todo.pendingApplications, 1);
  assert.equal(ov.todo.newLeads, 2);
  assert.equal(ov.sessions.length, 1);
  assert.equal(ov.sessions[0].tutorName, 'سارة أحمد');
  assert.equal(ov.kpis.newBookings7d, 2);
  assert.equal(ov.kpis.attendanceRate30d, null);

  // --- Search ----------------------------------------------------------------------------
  const s1 = await one(ADMIN, `SELECT public.admin_console_search('سارة')`);
  assert.equal(s1.tutors[0].id, 'tutor-1');
  const s2 = await one(ADMIN, `SELECT public.admin_console_search('01098765432')`);
  assert.equal(s2.parents.length, 1, 'parent found by whatsapp digits');
  assert.equal(s2.leads.length, 1, 'lead found by phone digits');
  const s3 = await one(ADMIN, `SELECT public.admin_console_search('012345')`);
  assert.equal(s3.tutors[0].id, 'tutor-1', 'tutor found by private phone');
  const s4 = await one(ADMIN, `SELECT public.admin_console_search('%')`);
  assert.equal(s4.tutors.length, 0, '% is not a wildcard');

  // --- Parents CRM ----------------------------------------------------------------------
  const list = await one(SUPPORT, `SELECT public.admin_list_parents(NULL, 50, 0)`);
  assert.equal(list.total, 1);
  assert.equal(list.items[0].email, 'mom@x.com');
  assert.equal(list.items[0].bookingsCount, 2);
  assert.ok(list.items[0].nextSessionAt);
  assert.equal((await one(SUPPORT, `SELECT public.admin_list_parents('غير موجود', 50, 0)`)).total, 0);
  await as(SUPPORT, `SELECT public.admin_add_parent_note($1, 'اتصلنا بيها وهتحجز الأسبوع الجاي')`, [PARENT]);
  await rejects(SUPPORT, `SELECT public.admin_add_parent_note($1, '   ')`, [PARENT], 'NOTE_INVALID');
  const detail = await one(ADMIN, `SELECT public.admin_get_parent($1)`, [PARENT]);
  assert.equal(detail.profile.name, 'أم يوسف');
  assert.equal(detail.bookings.length, 2);
  assert.equal(detail.notes.length, 1);
  assert.equal(detail.notes[0].canDelete, false, 'admin cannot delete support note');
  assert.equal(detail.leads.length, 1, 'lead matched by phone');
  await rejects(ADMIN, `SELECT public.admin_delete_parent_note($1)`, [detail.notes[0].id], 'NOTE_NOT_FOUND');
  await as(SUPER, `SELECT public.admin_delete_parent_note($1)`, [detail.notes[0].id]);

  // --- Quality + funnel ---------------------------------------------------------------
  const q = await one(ADMIN, `SELECT public.admin_console_quality(30)`);
  assert.equal(q.tutors.length, 1);
  assert.equal(q.tutors[0].missingReports, 1);
  assert.equal(q.tutors[0].upcomingMissingLink, 1);
  assert.equal(q.publishedWithoutBookings, 1);
  const f = await one(ADMIN, `SELECT public.admin_console_funnel(30)`);
  assert.equal(f.leads.total, 2);
  assert.equal(f.direct.booked, 2);
  assert.equal(f.sources.length, 2);
  assert.equal(f.weeks.length, 8);

  // --- Activity log: staff changes are logged, others are not; no sensitive values ----
  await as(ADMIN, `UPDATE public.tutors SET is_published = FALSE WHERE id = 'tutor-2'`);
  await as(ADMIN, `UPDATE public.tutor_private_info SET national_id_number = '999' WHERE tutor_id = 'tutor-1'`);
  await as(ADMIN, `UPDATE public.tutors SET updated_at = NOW() WHERE id = 'tutor-2'`); // no real change → no log
  await as(PARENT, `UPDATE public.parent_leads SET status = 'contacted' WHERE reference_code = 'L-101'`);
  const log = await one(SUPER, `SELECT public.admin_list_audit_log(50, NULL, NULL)`);
  const tutorLog = log.find((e: any) => e.entityType === 'tutors' && e.action === 'update');
  assert.ok(tutorLog, 'tutor update logged');
  assert.equal(tutorLog.actorEmail, 'ops@x.com');
  assert.deepEqual(tutorLog.details.values.is_published, { from: true, to: false });
  assert.equal(tutorLog.tutorName, 'محمد علي');
  const piLog = log.find((e: any) => e.entityType === 'tutor_private_info');
  assert.deepEqual(piLog.details.changed, ['national_id_number']);
  assert.ok(!JSON.stringify(piLog).includes('999'), 'sensitive value not stored');
  assert.equal(log.filter((e: any) => e.entityType === 'tutors' && e.action === 'update').length, 1);
  assert.ok(!log.some((e: any) => e.entityType === 'parent_leads' && e.action === 'update'), 'non-staff change not logged');
  assert.ok(log.some((e: any) => e.entityType === 'admin_users'), 'team changes logged');
  await as(ADMIN, `SELECT public.admin_log_event('export_csv', 'تصدير أولياء الأمور', '{"rows": 1}'::jsonb)`);
  await rejects(PARENT, `SELECT public.admin_log_event('export_csv', NULL, NULL)`, [], 'ADMIN_FORBIDDEN');
  await rejects(ADMIN, `SELECT public.admin_log_event('DROP TABLE', NULL, NULL)`, [], 'ADMIN_INVALID_INPUT');
  const page2 = await one(SUPER, `SELECT public.admin_list_audit_log(2, NULL, NULL)`);
  const older = await one(SUPER, `SELECT public.admin_list_audit_log(2, $1, NULL)`, [page2[1].id]);
  assert.ok(older.every((e: any) => e.id < page2[1].id), 'pagination');

  console.log('admin console migration: all checks passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
