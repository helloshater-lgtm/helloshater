/** Migration 026 on PGlite: directory fields for filters/card + admin slot reminders. */
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
  hourly_rate_max INT, currency TEXT, session_duration_minutes INT, is_published BOOLEAN DEFAULT TRUE, help_child_summary TEXT, help_child_quote TEXT, total_students_taught INT);
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
CREATE TABLE public.tutor_private_info (tutor_id TEXT, country_code TEXT, phone_number TEXT, whatsapp_number TEXT);
CREATE TABLE public.tutor_private_bookings (tutor_id TEXT, status TEXT);
CREATE TABLE public.admins (uid UUID);
CREATE FUNCTION public.is_admin() RETURNS BOOLEAN LANGUAGE sql STABLE AS $$ SELECT EXISTS (SELECT 1 FROM public.admins WHERE uid = auth.uid()) $$;
`;

const ADMIN = '00000000-0000-0000-0000-0000000000ad';
const read = (n: string) => readFileSync(new URL(`../supabase/migrations/${n}`, import.meta.url), 'utf8').replace(/NOTIFY pgrst[^;]*;/, '');

async function main() {
  const db = new PGlite();
  await db.exec(STUB);
  await db.exec(read('025_guest_booking_and_directory.sql'));
  await db.exec(read('026_directory_filters_and_slot_reminders.sql'));
  await db.exec(read('026_directory_filters_and_slot_reminders.sql'));
  await db.exec(`
    INSERT INTO auth.users (id) VALUES ('${ADMIN}');
    INSERT INTO public.admins VALUES ('${ADMIN}');
    INSERT INTO public.tutors (id, name, rating, reviews_count, help_child_summary, total_students_taught)
      VALUES ('t1', 'سارة', 4.8, 10, 'بتأسس الأطفال في الرياضيات', 30), ('t2', 'محمد', NULL, 0, NULL, NULL);
    INSERT INTO public.tutor_account_links VALUES ('t1', '${ADMIN}', TRUE), ('t2', '${ADMIN}', TRUE);
    INSERT INTO public.tutor_private_info VALUES ('t1', '+20', '1012345678', NULL), ('t2', '+966', '500000000', '+966500000000');
    INSERT INTO public.tutor_available_slots (tutor_id, slot_date, start_time, end_time)
      VALUES ('t1', (NOW() AT TIME ZONE 'Africa/Cairo')::date + 3, '18:00', '18:20');
    INSERT INTO public.direct_trial_bookings (tutor_id, guardian_user_id, guardian_whatsapp, starts_at, ends_at, status)
      VALUES ('t1', '${ADMIN}', '+201', NOW() - interval '2 day', NOW() - interval '2 day' + interval '20 min', 'completed');
    INSERT INTO public.tutor_private_bookings VALUES ('t1', 'completed'), ('t1', 'cancelled');
  `);
  const as = async (uid: string | null, q: string) => {
    await db.exec(`SELECT set_config('test.uid', '${uid ?? ''}', false)`);
    return (await db.query<any>(q)).rows[0];
  };
  const d = (await as(null, 'SELECT public.get_public_tutor_directory() AS d')).d;
  const t1 = d.tutors.find((t: any) => t.id === 't1');
  assert.equal(t1.country, 'EG');
  assert.equal(t1.completedSessions, 2);
  assert.equal(t1.summary, 'بتأسس الأطفال في الرياضيات');
  assert.equal(t1.slotBuckets.length, 1);
  assert.match(t1.slotBuckets[0], /^[0-6]-e$/);
  assert.equal(d.tutors[0].id, 't1');
  assert.equal(d.stats.tutors, 2);
  assert.equal(d.stats.completedSessions, 2);
  assert.equal(Number(d.stats.avgRating), 4.8);
  await assert.rejects(as(null, 'SELECT public.admin_tutors_without_trial_slots()'), /ADMIN_FORBIDDEN/);
  const list = (await as(ADMIN, 'SELECT public.admin_tutors_without_trial_slots() AS l')).l;
  assert.deepEqual(list.map((x: any) => x.tutorId), ['t2']);
  assert.equal(list[0].whatsapp, '+966500000000');
  console.log('Migration 026 tests passed (PGlite).');
}
main().catch((e) => { console.error(e); process.exit(1); });
