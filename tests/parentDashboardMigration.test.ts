/**
 * Runs migration 023 on an in-memory Postgres (PGlite) with a minimal stub of
 * the 022 objects it depends on, then checks the ownership rules.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const STUB_022 = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id UUID PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
CREATE TABLE public.tutors (id TEXT PRIMARY KEY, name TEXT);
CREATE TABLE public.tutor_account_links (tutor_id TEXT, user_id UUID, is_active BOOLEAN);
CREATE TABLE public.direct_trial_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slot_id UUID, tutor_id TEXT NOT NULL,
  guardian_user_id UUID NOT NULL, guardian_name TEXT NOT NULL, guardian_whatsapp TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ NOT NULL, timezone TEXT NOT NULL DEFAULT 'Africa/Cairo',
  status TEXT NOT NULL DEFAULT 'confirmed', meeting_url TEXT, completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE FUNCTION public.get_current_tutor_id() RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT tutor_id FROM public.tutor_account_links WHERE user_id = auth.uid() AND is_active LIMIT 1 $$;
CREATE FUNCTION public.acquire_tutor_lock(p TEXT) RETURNS VOID LANGUAGE sql AS $$ SELECT $$;
CREATE FUNCTION public.internal_direct_trial_json(p_booking public.direct_trial_bookings) RETURNS JSONB LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('id', p_booking.id, 'tutorId', p_booking.tutor_id, 'status', p_booking.status,
    'startsAt', p_booking.starts_at, 'endsAt', p_booking.ends_at) $$;
`;

const PARENT_A = '00000000-0000-0000-0000-00000000000a';
const PARENT_B = '00000000-0000-0000-0000-00000000000b';
const TUTOR_U = '00000000-0000-0000-0000-0000000000f1';

async function main() {
  const db = new PGlite();
  await db.exec(STUB_022);
  const migration = readFileSync(new URL('../supabase/migrations/023_parent_children_and_trial_reports.sql', import.meta.url), 'utf8')
    .replace(/NOTIFY pgrst[^;]*;/, '');
  await db.exec(migration);
  await db.exec(migration); // idempotent

  await db.exec(`
    INSERT INTO auth.users VALUES ('${PARENT_A}'), ('${PARENT_B}'), ('${TUTOR_U}');
    INSERT INTO public.tutors VALUES ('tutor-1', 'سارة');
    INSERT INTO public.tutor_account_links VALUES ('tutor-1', '${TUTOR_U}', TRUE);
    INSERT INTO public.direct_trial_bookings (id, tutor_id, guardian_user_id, guardian_name, guardian_whatsapp, starts_at, ends_at)
      VALUES ('10000000-0000-0000-0000-000000000001', 'tutor-1', '${PARENT_A}', 'أم سلمى', '+20101', NOW() - interval '2 hour', NOW() - interval '100 minute'),
             ('10000000-0000-0000-0000-000000000002', 'tutor-1', '${PARENT_A}', 'أم سلمى', '+20101', NOW() + interval '1 day', NOW() + interval '1 day 20 minute');
  `);

  const as = async (uid: string | null, sql: string, params: any[] = []) => {
    await db.exec(`SELECT set_config('test.uid', '${uid ?? ''}', false)`);
    return (await db.query<any>(sql, params)).rows;
  };
  const rejects = async (uid: string | null, sql: string, params: any[], code: string) => {
    await assert.rejects(() => as(uid, sql, params), (e: any) => String(e.message).includes(code), code);
  };

  // Children
  const child = (await as(PARENT_A, `SELECT public.parent_upsert_child(NULL, $1, $2, NULL) AS c`, ['سلمى', 'الصف الرابع']))[0].c;
  assert.equal(child.name, 'سلمى');
  await rejects(null, `SELECT public.parent_upsert_child(NULL, 'x y', NULL, NULL)`, [], 'PARENT_AUTH_REQUIRED');
  await rejects(PARENT_A, `SELECT public.parent_upsert_child(NULL, ' ', NULL, NULL)`, [], 'CHILD_NAME_INVALID');
  await rejects(PARENT_B, `SELECT public.parent_upsert_child($1, 'سرقة', NULL, NULL)`, [child.id], 'CHILD_NOT_FOUND');

  // «الحصة لمين؟»
  await as(PARENT_A, `SELECT public.parent_set_trial_child('10000000-0000-0000-0000-000000000001', $1)`, [child.id]);
  await rejects(PARENT_B, `SELECT public.parent_set_trial_child('10000000-0000-0000-0000-000000000001', NULL)`, [], 'TRIAL_NOT_FOUND');
  const childB = (await as(PARENT_B, `SELECT public.parent_upsert_child(NULL, 'يوسف', NULL, NULL) AS c`))[0].c;
  await rejects(PARENT_A, `SELECT public.parent_set_trial_child('10000000-0000-0000-0000-000000000001', $1)`, [childB.id], 'CHILD_NOT_FOUND');

  // Tutor report: not before the session ends, not by others, then visible to the guardian
  await rejects(TUTOR_U, `SELECT public.tutor_submit_trial_report('10000000-0000-0000-0000-000000000002', TRUE, 'x', NULL, NULL, NULL)`, [], 'TRIAL_NOT_FINISHED');
  await rejects(PARENT_A, `SELECT public.tutor_submit_trial_report('10000000-0000-0000-0000-000000000001', TRUE, 'x', NULL, NULL, NULL)`, [], 'TRIAL_FORBIDDEN');
  const rep = (await as(TUTOR_U, `SELECT public.tutor_submit_trial_report('10000000-0000-0000-0000-000000000001', TRUE, $1, $2, $3, $4) AS r`,
    ['بتقرأ الحروف كويس', 'مخارج الحروف', 'حصتين في الأسبوع', 'مراجعة حرف الباء']))[0].r;
  assert.equal(rep.success, true);
  assert.equal(rep.report.attended, true);
  const status = (await db.query<any>(`SELECT status FROM public.direct_trial_bookings WHERE id = '10000000-0000-0000-0000-000000000001'`)).rows[0].status;
  assert.equal(status, 'completed', 'report marks the trial completed');

  const extras = (await as(TUTOR_U, `SELECT public.tutor_get_my_trial_extras() AS x`))[0].x;
  const ex1 = extras.find((x: any) => x.bookingId === '10000000-0000-0000-0000-000000000001');
  assert.equal(ex1.childName, 'سلمى');
  assert.equal(ex1.childGrade, 'الصف الرابع');
  assert.equal(ex1.report.levelSummary, 'بتقرأ الحروف كويس');

  const dashA = (await as(PARENT_A, `SELECT public.parent_get_my_dashboard() AS d`))[0].d;
  assert.equal(dashA.children.length, 1);
  assert.equal(dashA.bookings.length, 2);
  const b1 = dashA.bookings.find((b: any) => b.id === '10000000-0000-0000-0000-000000000001');
  assert.equal(b1.childName, 'سلمى');
  assert.equal(b1.report.recommendation, 'حصتين في الأسبوع');
  const dashB = (await as(PARENT_B, `SELECT public.parent_get_my_dashboard() AS d`))[0].d;
  assert.equal(dashB.bookings.length, 0, 'other guardians see nothing');
  assert.equal(dashB.children.length, 1);

  // Delete child keeps the booking, unlinks it
  await as(PARENT_A, `SELECT public.parent_delete_child($1)`, [child.id]);
  const after = (await as(PARENT_A, `SELECT public.parent_get_my_dashboard() AS d`))[0].d;
  assert.equal(after.children.length, 0);
  assert.equal(after.bookings.find((b: any) => b.id === '10000000-0000-0000-0000-000000000001').childId, null);

  // anon cannot execute
  const grants = (await db.query<any>(`SELECT has_function_privilege('anon', 'public.parent_get_my_dashboard()', 'EXECUTE') AS a,
     has_function_privilege('authenticated', 'public.parent_get_my_dashboard()', 'EXECUTE') AS b`)).rows[0];
  assert.equal(grants.a, false);
  assert.equal(grants.b, true);

  console.log('Migration 023 tests passed (PGlite).');
}
main().catch((e) => { console.error(e); process.exit(1); });
