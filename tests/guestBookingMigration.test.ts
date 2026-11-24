/**
 * Migration 025 on PGlite: guest (anonymous) trial booking rules + public directory.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const STUB = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id UUID PRIMARY KEY, email TEXT, email_confirmed_at TIMESTAMPTZ, is_anonymous BOOLEAN DEFAULT FALSE);
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
CREATE TABLE public.tutors (id TEXT PRIMARY KEY, name TEXT, honorific TEXT, headline TEXT, avatar_url TEXT, rating NUMERIC,
  reviews_count INT DEFAULT 0, years_of_experience INT, verified_credentials BOOLEAN DEFAULT FALSE, hourly_rate_min INT,
  hourly_rate_max INT, currency TEXT, session_duration_minutes INT, is_published BOOLEAN DEFAULT TRUE);
CREATE TABLE public.tutor_account_links (tutor_id TEXT, user_id UUID, is_active BOOLEAN);
CREATE TABLE public.tutor_available_slots (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tutor_id TEXT, slot_date DATE,
  start_time TIME, end_time TIME, timezone TEXT DEFAULT 'Africa/Cairo', is_available BOOLEAN DEFAULT TRUE,
  is_booked BOOLEAN DEFAULT FALSE, admin_suspended BOOLEAN DEFAULT FALSE, booked_at TIMESTAMPTZ, updated_at TIMESTAMPTZ);
CREATE TABLE public.direct_trial_booking_policy (singleton BOOLEAN PRIMARY KEY DEFAULT TRUE, minimum_notice_minutes INT);
INSERT INTO public.direct_trial_booking_policy VALUES (TRUE, 60);
CREATE TABLE public.direct_trial_bookings (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), slot_id UUID, tutor_id TEXT,
  guardian_user_id UUID, guardian_name TEXT, guardian_whatsapp TEXT, starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ,
  timezone TEXT, status TEXT DEFAULT 'confirmed', created_at TIMESTAMPTZ DEFAULT NOW());
CREATE FUNCTION public.acquire_tutor_lock(p TEXT) RETURNS VOID LANGUAGE sql AS $$ SELECT $$;
CREATE FUNCTION public.internal_check_tutor_time_conflict(a TEXT, b TIMESTAMPTZ, c TIMESTAMPTZ, d UUID, e UUID, f UUID)
  RETURNS TABLE(has_conflict BOOLEAN) LANGUAGE sql AS $$ SELECT FALSE $$;
CREATE FUNCTION public.internal_direct_trial_json(b public.direct_trial_bookings) RETURNS JSONB LANGUAGE sql AS $$
  SELECT jsonb_build_object('id', b.id, 'tutorId', b.tutor_id, 'status', b.status) $$;
CREATE TABLE public.educational_stages (id TEXT PRIMARY KEY, name TEXT);
CREATE TABLE public.subjects (id TEXT PRIMARY KEY, name TEXT);
CREATE TABLE public.v_tutor_school_offerings (tutor_id TEXT, stage_id TEXT, subject_id TEXT, course_is_active BOOLEAN);
CREATE TABLE public.tutor_quran_offerings (tutor_id TEXT);
`;

const GUEST1 = '00000000-0000-0000-0000-000000000001';
const GUEST2 = '00000000-0000-0000-0000-000000000002';
const NOEMAIL = '00000000-0000-0000-0000-000000000003';
const TUTOR_U = '00000000-0000-0000-0000-0000000000f1';

async function main() {
  const db = new PGlite();
  await db.exec(STUB);
  const sql = readFileSync(new URL('../supabase/migrations/025_guest_booking_and_directory.sql', import.meta.url), 'utf8').replace(/NOTIFY pgrst[^;]*;/, '');
  await db.exec(sql);
  await db.exec(sql);

  const day = `(NOW() AT TIME ZONE 'Africa/Cairo')::date + 2`;
  await db.exec(`
    INSERT INTO auth.users VALUES ('${GUEST1}', NULL, NULL, TRUE), ('${GUEST2}', NULL, NULL, TRUE),
      ('${NOEMAIL}', 'x@y.com', NULL, FALSE), ('${TUTOR_U}', 't@y.com', NOW(), FALSE);
    INSERT INTO public.tutors (id, name, rating) VALUES ('t1', 'سارة', 4.8), ('t2', 'محمد', 4.5), ('t3', 'منى', 5);
    INSERT INTO public.tutor_account_links VALUES ('t1', '${TUTOR_U}', TRUE), ('t2', '${TUTOR_U}', TRUE);
    INSERT INTO public.tutor_available_slots (id, tutor_id, slot_date, start_time, end_time) VALUES
      ('10000000-0000-0000-0000-000000000001', 't1', ${day}, '10:00', '10:20'),
      ('10000000-0000-0000-0000-000000000002', 't1', ${day}, '11:00', '11:20'),
      ('10000000-0000-0000-0000-000000000003', 't2', ${day}, '12:00', '12:20'),
      ('10000000-0000-0000-0000-000000000004', 't3', ${day}, '12:00', '12:20');
    INSERT INTO public.educational_stages VALUES ('elementary', 'ابتدائي');
    INSERT INTO public.subjects VALUES ('math', 'الرياضيات (Math)');
    INSERT INTO public.v_tutor_school_offerings VALUES ('t1', 'elementary', 'math', TRUE);
    INSERT INTO public.tutor_quran_offerings VALUES ('t2');
  `);

  const as = async (uid: string | null, q: string) => {
    await db.exec(`SELECT set_config('test.uid', '${uid ?? ''}', false)`);
    return (await db.query<any>(q)).rows;
  };
  const book = (uid: string, slot: string, phone = '+201012345678') =>
    as(uid, `SELECT public.parent_book_trial('${slot}', 'أم يوسف', '${phone}') AS b`);
  const rejects = (p: Promise<any>, code: string) => assert.rejects(p, (e: any) => String(e.message).includes(code), code);

  // Guest can book without email
  const b1 = (await book(GUEST1, '10000000-0000-0000-0000-000000000001'))[0].b;
  assert.equal(b1.tutorId, 't1');
  // Same guest: only one upcoming trial
  await rejects(book(GUEST1, '10000000-0000-0000-0000-000000000003', '+201099999999'), 'TRIAL_GUEST_LIMIT');
  // New guest session, same phone, same tutor → blocked
  await rejects(book(GUEST2, '10000000-0000-0000-0000-000000000002'), 'TRIAL_REPEAT_TUTOR');
  // Non-anonymous user without verified email still blocked
  await rejects(book(NOEMAIL, '10000000-0000-0000-0000-000000000003'), 'TRIAL_EMAIL_UNVERIFIED');
  // Unauthenticated blocked
  await rejects(as(null, `SELECT public.parent_book_trial('10000000-0000-0000-0000-000000000003', 'x y', '+201012345678')`), 'TRIAL_AUTH_REQUIRED');
  // Other guest/phone can book another tutor
  await book(GUEST2, '10000000-0000-0000-0000-000000000003', '+201011111111');
  // Phone cap: 3 upcoming per number
  await db.exec(`INSERT INTO public.direct_trial_bookings (tutor_id, guardian_user_id, guardian_whatsapp, starts_at, ends_at)
    VALUES ('x', '${TUTOR_U}', '+201011111111', NOW() + interval '1 day', NOW() + interval '1 day 20 min'),
           ('y', '${TUTOR_U}', '+201011111111', NOW() + interval '2 day', NOW() + interval '2 day 20 min')`);
  await db.exec(`UPDATE auth.users SET email = 'g@x.com', email_confirmed_at = NOW(), is_anonymous = FALSE WHERE id = '${NOEMAIL}'`);
  await rejects(book(NOEMAIL, '10000000-0000-0000-0000-000000000002', '+201011111111'), 'TRIAL_GUEST_LIMIT');

  // Directory: public, published only, bookable first, slots hidden for tutors without account
  const dir = (await as(null, `SELECT public.get_public_tutor_directory() AS d`))[0].d;
  assert.equal(dir.tutors.length, 3);
  const byId = Object.fromEntries(dir.tutors.map((t: any) => [t.id, t]));
  assert.deepEqual(byId.t1.stageIds, ['elementary']);
  assert.deepEqual(byId.t1.subjectIds, ['math']);
  assert.equal(byId.t2.quran, true);
  assert.ok(byId.t1.earliestTrialAt, 't1 still has a free slot');
  assert.equal(byId.t1.trialSlotsCount, 1, 'booked slot not counted');
  assert.equal(byId.t3.bookable, false, 'no tutor account → not bookable');
  assert.equal(byId.t3.earliestTrialAt, null);
  assert.equal(dir.tutors[0].id, 't1', 'tutor with a free slot first');
}

main()
  .then(() => console.log('Migration 025 tests passed (PGlite).'))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
