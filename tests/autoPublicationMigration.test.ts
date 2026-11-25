/** Migration 027 on PGlite: automatic unpublish / republish rules. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const STUB = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid', true), '')::uuid $$;
CREATE TABLE public.tutors (id TEXT PRIMARY KEY, name TEXT, honorific TEXT DEFAULT 'أ.', headline TEXT, avatar_url TEXT,
  help_child_summary TEXT, help_child_quote TEXT, hourly_rate_min INT, session_duration_minutes INT,
  is_published BOOLEAN DEFAULT FALSE, updated_at TIMESTAMPTZ);
CREATE TABLE public.tutor_quality_reviews (tutor_id TEXT, avatar_quality_approved BOOLEAN);
CREATE TABLE public.tutor_school_offerings (tutor_id TEXT);
CREATE TABLE public.tutor_quran_offerings (tutor_id TEXT);
CREATE TABLE public.tutor_private_info (tutor_id TEXT, country_code TEXT, phone_number TEXT, whatsapp_number TEXT);
CREATE TABLE public.tutor_available_slots (tutor_id TEXT, slot_date DATE, start_time TIME, timezone TEXT DEFAULT 'Africa/Cairo',
  is_available BOOLEAN DEFAULT TRUE, is_booked BOOLEAN DEFAULT FALSE, admin_suspended BOOLEAN DEFAULT FALSE);
CREATE TABLE public.tutor_private_slots (tutor_id TEXT, slot_date DATE, start_time TIME, timezone TEXT DEFAULT 'Africa/Cairo',
  is_available BOOLEAN DEFAULT TRUE, is_booked BOOLEAN DEFAULT FALSE, admin_suspended BOOLEAN DEFAULT FALSE);
CREATE TABLE public.tutor_account_links (tutor_id TEXT, user_id UUID, is_active BOOLEAN);
CREATE TABLE public.admin_audit_log (id SERIAL, actor_email TEXT, action TEXT, entity_type TEXT, entity_id TEXT, tutor_id TEXT, summary TEXT, details JSONB);
CREATE TABLE public.admins (uid UUID);
CREATE FUNCTION public.is_admin() RETURNS BOOLEAN LANGUAGE sql STABLE AS $$ SELECT EXISTS (SELECT 1 FROM public.admins WHERE uid = auth.uid()) $$;
CREATE FUNCTION public.get_current_tutor_id() RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT tutor_id FROM public.tutor_account_links WHERE user_id = auth.uid() AND is_active LIMIT 1 $$;
`;
const ADMIN = '00000000-0000-0000-0000-0000000000ad';
const T1U = '00000000-0000-0000-0000-0000000000a1';

async function main() {
  const db = new PGlite();
  await db.exec(STUB);
  const sql = readFileSync(new URL('../supabase/migrations/027_auto_publication.sql', import.meta.url), 'utf8')
    .replace(/CREATE EXTENSION[^;]*;/, '').replace(/NOTIFY pgrst[^;]*;/, '');
  const full = (id: string, pub = true) =>
    `('${id}', 'n', 'أ.', 'عنوان', 'https://x/a.png', 'نبذة', NULL, 100, 50, ${pub})`;
  await db.exec(`
    INSERT INTO public.tutors (id, name, honorific, headline, avatar_url, help_child_summary, help_child_quote, hourly_rate_min, session_duration_minutes, is_published)
      VALUES ${full('ok')}, ${full('nophoto')}, ${full('noslot')}, ${full('newbie', false)};
    UPDATE public.tutors SET avatar_url = NULL WHERE id = 'nophoto';
    INSERT INTO public.tutor_school_offerings VALUES ('ok'), ('nophoto'), ('noslot'), ('newbie');
    INSERT INTO public.tutor_available_slots (tutor_id, slot_date, start_time) VALUES ('ok', CURRENT_DATE + 3, '18:00');
    INSERT INTO public.admins VALUES ('${ADMIN}');
    INSERT INTO public.tutor_account_links VALUES ('nophoto', '${T1U}', TRUE);
  `);
  await db.exec(sql);
  await db.exec(sql);
  const q = async (s: string, uid = '') => {
    await db.exec(`SELECT set_config('test.uid', '${uid}', false)`);
    return (await db.query<any>(s)).rows;
  };
  const pub = async (id: string) => (await q(`SELECT is_published FROM public.tutors WHERE id = '${id}'`))[0].is_published;

  let r = (await q('SELECT public.run_tutor_auto_publication() AS r'))[0].r;
  assert.equal(r.hidden, 1);
  assert.equal(await pub('nophoto'), false, 'missing photo → hidden');
  assert.equal(await pub('ok'), true);
  assert.equal(await pub('noslot'), true, 'no slot → still published at first');
  assert.equal(await pub('newbie'), false, 'never approved → untouched');
  const notes = await q(`SELECT kind, body FROM public.tutor_notifications WHERE tutor_id = 'nophoto'`);
  assert.equal(notes[0].kind, 'unpublished_missing');
  assert.match(notes[0].body, /صورة شخصية/);
  const status = (await q('SELECT public.tutor_get_my_publication_status() AS s', T1U))[0].s;
  assert.deepEqual(status.missing, ['avatar']);
  assert.equal(status.autoHidden, true);

  // 8 days without slots → warning; 15 days → hidden
  await q(`UPDATE public.tutor_publication_state SET no_slots_since = NOW() - interval '8 days' WHERE tutor_id = 'noslot'`);
  r = (await q('SELECT public.run_tutor_auto_publication() AS r'))[0].r;
  assert.equal(r.warned, 1);
  await q(`UPDATE public.tutor_publication_state SET no_slots_since = NOW() - interval '15 days' WHERE tutor_id = 'noslot'`);
  r = (await q('SELECT public.run_tutor_auto_publication() AS r'))[0].r;
  assert.equal(await pub('noslot'), false);

  // Fixed → republished automatically
  await q(`UPDATE public.tutors SET avatar_url = 'https://x/b.png' WHERE id = 'nophoto'`);
  await q(`INSERT INTO public.tutor_available_slots (tutor_id, slot_date, start_time) VALUES ('noslot', CURRENT_DATE + 2, '10:00')`);
  r = (await q('SELECT public.run_tutor_auto_publication() AS r'))[0].r;
  assert.equal(r.published, 2);
  assert.equal(await pub('nophoto'), true);
  assert.equal(await pub('noslot'), true);

  // Admin hides by hand → locked, never auto-republished
  await q(`UPDATE public.tutors SET is_published = FALSE WHERE id = 'ok'`, ADMIN);
  assert.equal((await q(`SELECT admin_locked FROM public.tutor_publication_state WHERE tutor_id = 'ok'`))[0].admin_locked, true);
  await q('SELECT public.run_tutor_auto_publication()');
  assert.equal(await pub('ok'), false, 'admin lock respected');
  // Admin publishes the newbie → approved, then managed automatically
  await q(`UPDATE public.tutors SET is_published = TRUE WHERE id = 'newbie'`, ADMIN);
  assert.equal((await q(`SELECT approved_once FROM public.tutor_publication_state WHERE tutor_id = 'newbie'`))[0].approved_once, true);
  // audit
  assert.ok((await q(`SELECT count(*)::int AS n FROM public.admin_audit_log WHERE actor_email = 'النظام'`))[0].n >= 4);
  await assert.rejects(q('SELECT public.admin_get_auto_publication()'), /ADMIN_FORBIDDEN/);
  assert.ok((await q('SELECT public.admin_get_auto_publication() AS l', ADMIN))[0].l.length >= 4);
  // ---- 028: both trial and fixed slots required ----
  await db.exec(readFileSync(new URL('../supabase/migrations/028_publish_requires_slots.sql', import.meta.url), 'utf8').replace(/NOTIFY pgrst[^;]*;/, ''));
  await q(`UPDATE public.tutor_publication_state SET admin_locked = FALSE`);
  await q(`UPDATE public.tutors SET is_published = TRUE WHERE id IN ('ok','nophoto','noslot','newbie')`);
  r = (await q('SELECT public.run_tutor_auto_publication() AS r'))[0].r;
  assert.equal(r.hidden, 4, 'no fixed slots anywhere → all hidden');
  const m = (await q(`SELECT missing FROM public.tutor_publication_state WHERE tutor_id = 'ok'`))[0].missing;
  assert.deepEqual(m, ['private_slots']);
  const body = (await q(`SELECT body FROM public.tutor_notifications WHERE tutor_id = 'ok' ORDER BY created_at DESC LIMIT 1`))[0].body;
  assert.match(body, /مواعيد ثابتة/);
  await q(`INSERT INTO public.tutor_private_slots (tutor_id, slot_date, start_time) VALUES ('ok', CURRENT_DATE + 4, '17:00')`);
  r = (await q('SELECT public.run_tutor_auto_publication() AS r'))[0].r;
  assert.equal(await pub('ok'), true, 'both slots → republished');
  assert.equal(await pub('newbie'), false, 'newbie has no trial slot → stays hidden');
  console.log('Migration 027 tests passed (PGlite).');
}
main().catch((e) => { console.error(e); process.exit(1); });
