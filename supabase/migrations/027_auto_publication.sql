-- =============================================================================
-- 027 — Automatic tutor publication.
--
-- Every hour (pg_cron) the platform checks each tutor that the admin approved
-- at least once:
--   * profile basics missing (photo, headline, bio, price, duration, subject)
--       → unpublished at once + notification listing what is missing
--   * complete but no open trial slot
--       → stays published, warned after 7 days, unpublished after 14 days
--   * auto-hidden and complete again (and has a trial slot when that was the reason)
--       → published again automatically + notification
-- Never touched automatically:
--   * new tutors (never approved by the admin)
--   * tutors the admin hid by hand (admin_locked)
-- Every automatic action is written to admin_audit_log as «النظام».
-- Safe to run more than once.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 1. State per tutor ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tutor_publication_state (
  tutor_id TEXT PRIMARY KEY REFERENCES public.tutors(id) ON DELETE CASCADE,
  approved_once BOOLEAN NOT NULL DEFAULT FALSE,
  admin_locked BOOLEAN NOT NULL DEFAULT FALSE,
  auto_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  auto_reason TEXT,
  missing JSONB NOT NULL DEFAULT '[]'::JSONB,
  no_slots_since TIMESTAMPTZ,
  warned_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.tutor_publication_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tutor_publication_state FROM anon, authenticated;

-- Tutors published today were approved by the admin.
INSERT INTO public.tutor_publication_state (tutor_id, approved_once)
SELECT id, TRUE FROM public.tutors WHERE is_published IS TRUE
ON CONFLICT (tutor_id) DO NOTHING;

-- 2. Notifications for tutors --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tutor_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id TEXT NOT NULL REFERENCES public.tutors(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('unpublished_missing', 'unpublished_no_slots', 'warn_no_slots', 'published')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  missing JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS tutor_notifications_tutor_idx ON public.tutor_notifications (tutor_id, created_at DESC);
ALTER TABLE public.tutor_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tutor_notifications FROM anon, authenticated;

-- 3. Admin publish / hide by hand → approval / lock ---------------------------------
CREATE OR REPLACE FUNCTION public.internal_track_admin_publication()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NEW.is_published IS DISTINCT FROM OLD.is_published
     AND current_setting('shatir.auto_publication', true) IS DISTINCT FROM 'on'
     AND public.is_admin() THEN
    INSERT INTO public.tutor_publication_state (tutor_id, approved_once, admin_locked, auto_hidden)
    VALUES (NEW.id, NEW.is_published IS TRUE, NEW.is_published IS NOT TRUE, FALSE)
    ON CONFLICT (tutor_id) DO UPDATE SET
      approved_once = tutor_publication_state.approved_once OR NEW.is_published IS TRUE,
      admin_locked = NEW.is_published IS NOT TRUE,
      auto_hidden = FALSE,
      auto_reason = NULL,
      updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_track_admin_publication ON public.tutors;
CREATE TRIGGER trg_track_admin_publication AFTER UPDATE OF is_published ON public.tutors
FOR EACH ROW EXECUTE FUNCTION public.internal_track_admin_publication();

-- 4. Readiness ------------------------------------------------------------------------
-- Returns the list of missing items (codes) for a tutor's public profile.
CREATE OR REPLACE FUNCTION public.internal_tutor_missing_items(p_tutor_id TEXT)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(code), '[]'::JSONB) FROM (
    SELECT 'avatar' AS code FROM public.tutors t WHERE t.id = p_tutor_id AND NULLIF(BTRIM(t.avatar_url), '') IS NULL
    UNION ALL SELECT 'avatar' FROM public.tutor_quality_reviews q WHERE q.tutor_id = p_tutor_id AND q.avatar_quality_approved IS FALSE
    UNION ALL SELECT 'headline' FROM public.tutors t WHERE t.id = p_tutor_id AND NULLIF(BTRIM(t.headline), '') IS NULL
    UNION ALL SELECT 'bio' FROM public.tutors t WHERE t.id = p_tutor_id
      AND NULLIF(BTRIM(COALESCE(t.help_child_summary, '')), '') IS NULL AND NULLIF(BTRIM(COALESCE(t.help_child_quote, '')), '') IS NULL
    UNION ALL SELECT 'price' FROM public.tutors t WHERE t.id = p_tutor_id AND COALESCE(t.hourly_rate_min, 0) <= 0
    UNION ALL SELECT 'duration' FROM public.tutors t WHERE t.id = p_tutor_id AND COALESCE(t.session_duration_minutes, 0) <= 0
    UNION ALL SELECT 'subject' WHERE NOT EXISTS (SELECT 1 FROM public.tutor_school_offerings o WHERE o.tutor_id = p_tutor_id)
                                   AND NOT EXISTS (SELECT 1 FROM public.tutor_quran_offerings q WHERE q.tutor_id = p_tutor_id)
  ) x
  -- de-duplicate
  WHERE TRUE
$$;

CREATE OR REPLACE FUNCTION public.internal_tutor_has_trial_slot(p_tutor_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tutor_available_slots s
     WHERE s.tutor_id = p_tutor_id AND s.is_available IS TRUE AND s.is_booked IS NOT TRUE AND s.admin_suspended IS NOT TRUE
       AND (s.slot_date + s.start_time) AT TIME ZONE COALESCE(NULLIF(BTRIM(s.timezone), ''), 'Africa/Cairo') > NOW()
  );
$$;

CREATE OR REPLACE FUNCTION public.internal_missing_labels(p JSONB)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT string_agg(DISTINCT CASE v
    WHEN 'avatar' THEN 'صورة شخصية واضحة'
    WHEN 'headline' THEN 'العنوان التعريفي'
    WHEN 'bio' THEN 'نبذة عنك وطريقتك'
    WHEN 'price' THEN 'سعر الحصة'
    WHEN 'duration' THEN 'مدة الحصة'
    WHEN 'subject' THEN 'المواد أو المراحل اللي بتدرّسها'
    ELSE v END, '، ')
  FROM jsonb_array_elements_text(p) AS v;
$$;

-- 5. The hourly job ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_tutor_auto_publication()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  r RECORD;
  v_missing JSONB;
  v_slot BOOLEAN;
  v_no_since TIMESTAMPTZ;
  v_hidden INT := 0;
  v_published INT := 0;
  v_warned INT := 0;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  PERFORM set_config('shatir.auto_publication', 'on', true);

  FOR r IN
    SELECT t.id, t.name, t.honorific, t.is_published, s.*
      FROM public.tutors t
      JOIN public.tutor_publication_state s ON s.tutor_id = t.id
     WHERE s.approved_once IS TRUE AND s.admin_locked IS NOT TRUE
     ORDER BY t.id
     FOR UPDATE OF s
  LOOP
    SELECT COALESCE(jsonb_agg(DISTINCT e), '[]'::JSONB) INTO v_missing
      FROM jsonb_array_elements(public.internal_tutor_missing_items(r.id)) e;
    v_slot := public.internal_tutor_has_trial_slot(r.id);
    v_no_since := CASE WHEN v_slot THEN NULL ELSE COALESCE(r.no_slots_since, v_now) END;

    IF r.is_published AND jsonb_array_length(v_missing) > 0 THEN
      UPDATE public.tutors SET is_published = FALSE, updated_at = v_now WHERE id = r.id;
      UPDATE public.tutor_publication_state SET auto_hidden = TRUE, auto_reason = 'missing', missing = v_missing,
        no_slots_since = v_no_since, last_checked_at = v_now, updated_at = v_now WHERE tutor_id = r.id;
      INSERT INTO public.tutor_notifications (tutor_id, kind, title, body, missing)
      VALUES (r.id, 'unpublished_missing', 'ملفك اتوقف مؤقتًا',
              'ملفك مش ظاهر لأولياء الأمور لأن ناقص: ' || public.internal_missing_labels(v_missing) || '. كمّلهم وهيتنشر تلقائيًا.', v_missing);
      INSERT INTO public.admin_audit_log (actor_email, action, entity_type, entity_id, tutor_id, summary, details)
      VALUES ('النظام', 'update', 'tutors', r.id, r.id, 'إيقاف تلقائي: ناقص ' || public.internal_missing_labels(v_missing),
              jsonb_build_object('changed', '["is_published"]'::JSONB, 'values', jsonb_build_object('is_published', jsonb_build_object('from', TRUE, 'to', FALSE)), 'auto', TRUE));
      v_hidden := v_hidden + 1;

    ELSIF r.is_published AND NOT v_slot AND v_no_since < v_now - INTERVAL '14 days' THEN
      UPDATE public.tutors SET is_published = FALSE, updated_at = v_now WHERE id = r.id;
      UPDATE public.tutor_publication_state SET auto_hidden = TRUE, auto_reason = 'no_slots', missing = '[]'::JSONB,
        no_slots_since = v_no_since, last_checked_at = v_now, updated_at = v_now WHERE tutor_id = r.id;
      INSERT INTO public.tutor_notifications (tutor_id, kind, title, body)
      VALUES (r.id, 'unpublished_no_slots', 'ملفك اتوقف مؤقتًا',
              'بقالك ١٤ يوم من غير مواعيد تجربة، فوقّفنا ظهورك لأولياء الأمور. افتح مواعيد تجربة من «التقويم» وهيتنشر ملفك تلقائيًا.');
      INSERT INTO public.admin_audit_log (actor_email, action, entity_type, entity_id, tutor_id, summary, details)
      VALUES ('النظام', 'update', 'tutors', r.id, r.id, 'إيقاف تلقائي: ١٤ يوم من غير مواعيد تجربة',
              jsonb_build_object('changed', '["is_published"]'::JSONB, 'values', jsonb_build_object('is_published', jsonb_build_object('from', TRUE, 'to', FALSE)), 'auto', TRUE));
      v_hidden := v_hidden + 1;

    ELSIF NOT r.is_published AND r.auto_hidden AND jsonb_array_length(v_missing) = 0
          AND (v_slot OR r.auto_reason IS DISTINCT FROM 'no_slots') THEN
      BEGIN
        UPDATE public.tutors SET is_published = TRUE, updated_at = v_now WHERE id = r.id;
        UPDATE public.tutor_publication_state SET auto_hidden = FALSE, auto_reason = NULL, missing = '[]'::JSONB,
          no_slots_since = v_no_since, warned_at = NULL, last_checked_at = v_now, updated_at = v_now WHERE tutor_id = r.id;
        INSERT INTO public.tutor_notifications (tutor_id, kind, title, body)
        VALUES (r.id, 'published', 'ملفك اتنشر 🎉', 'ملفك بقى ظاهر لأولياء الأمور تاني. خلّي عندك مواعيد تجربة مفتوحة دايمًا.');
        INSERT INTO public.admin_audit_log (actor_email, action, entity_type, entity_id, tutor_id, summary, details)
        VALUES ('النظام', 'update', 'tutors', r.id, r.id, 'نشر تلقائي: الملف اكتمل',
                jsonb_build_object('changed', '["is_published"]'::JSONB, 'values', jsonb_build_object('is_published', jsonb_build_object('from', FALSE, 'to', TRUE)), 'auto', TRUE));
        v_published := v_published + 1;
      EXCEPTION WHEN OTHERS THEN
        -- the publish trigger refused (e.g. inactive subject): keep hidden, record reason
        UPDATE public.tutor_publication_state SET missing = jsonb_build_array('subject'), last_checked_at = v_now WHERE tutor_id = r.id;
      END;

    ELSE
      IF r.is_published AND NOT v_slot AND v_no_since < v_now - INTERVAL '7 days' AND r.warned_at IS NULL THEN
        INSERT INTO public.tutor_notifications (tutor_id, kind, title, body)
        VALUES (r.id, 'warn_no_slots', 'افتح مواعيد تجربة',
                'بقالك أسبوع من غير مواعيد تجربة. أولياء الأمور مش هيقدروا يحجزوا معاك، ولو فضل كده ٧ أيام كمان هيتوقف ظهور ملفك.');
        UPDATE public.tutor_publication_state SET warned_at = v_now WHERE tutor_id = r.id;
        v_warned := v_warned + 1;
      END IF;
      UPDATE public.tutor_publication_state SET missing = v_missing, no_slots_since = v_no_since,
        warned_at = CASE WHEN v_slot THEN NULL ELSE warned_at END,
        last_checked_at = v_now, updated_at = v_now WHERE tutor_id = r.id;
    END IF;
  END LOOP;

  PERFORM set_config('shatir.auto_publication', 'off', true);
  RETURN jsonb_build_object('hidden', v_hidden, 'published', v_published, 'warned', v_warned, 'at', v_now);
END;
$$;
REVOKE ALL ON FUNCTION public.run_tutor_auto_publication() FROM PUBLIC, anon, authenticated;

-- 6. Tutor side ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tutor_get_my_publication_status()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE v_tutor TEXT := public.get_current_tutor_id(); v_missing JSONB; v_slot BOOLEAN; s public.tutor_publication_state%ROWTYPE;
BEGIN
  IF v_tutor IS NULL THEN RAISE EXCEPTION 'TUTOR_FORBIDDEN'; END IF;
  SELECT * INTO s FROM public.tutor_publication_state WHERE tutor_id = v_tutor;
  SELECT COALESCE(jsonb_agg(DISTINCT e), '[]'::JSONB) INTO v_missing FROM jsonb_array_elements(public.internal_tutor_missing_items(v_tutor)) e;
  v_slot := public.internal_tutor_has_trial_slot(v_tutor);
  RETURN jsonb_build_object(
    'isPublished', (SELECT is_published FROM public.tutors WHERE id = v_tutor),
    'approvedOnce', COALESCE(s.approved_once, FALSE),
    'adminLocked', COALESCE(s.admin_locked, FALSE),
    'autoHidden', COALESCE(s.auto_hidden, FALSE),
    'autoReason', s.auto_reason,
    'missing', v_missing,
    'hasTrialSlot', v_slot,
    'noSlotsSince', CASE WHEN v_slot THEN NULL ELSE s.no_slots_since END,
    'hideAt', CASE WHEN v_slot OR s.no_slots_since IS NULL THEN NULL ELSE s.no_slots_since + INTERVAL '14 days' END,
    'notifications', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body,
                        'createdAt', n.created_at, 'read', n.read_at IS NOT NULL) ORDER BY n.created_at DESC), '[]'::JSONB)
                      FROM (SELECT * FROM public.tutor_notifications WHERE tutor_id = v_tutor ORDER BY created_at DESC LIMIT 10) n)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.tutor_mark_notifications_read()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE v_tutor TEXT := public.get_current_tutor_id();
BEGIN
  IF v_tutor IS NULL THEN RAISE EXCEPTION 'TUTOR_FORBIDDEN'; END IF;
  UPDATE public.tutor_notifications SET read_at = NOW() WHERE tutor_id = v_tutor AND read_at IS NULL;
  RETURN jsonb_build_object('success', TRUE);
END;
$$;

-- 7. Admin side --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_auto_publication()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'ADMIN_FORBIDDEN'; END IF;
  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'tutorId', t.id, 'name', t.name, 'honorific', t.honorific, 'isPublished', t.is_published,
      'adminLocked', s.admin_locked, 'autoHidden', s.auto_hidden, 'autoReason', s.auto_reason,
      'missing', s.missing, 'noSlotsSince', s.no_slots_since, 'lastCheckedAt', s.last_checked_at,
      'whatsapp', COALESCE(NULLIF(BTRIM(pi.whatsapp_number), ''), NULLIF(BTRIM(COALESCE(pi.country_code, '') || COALESCE(pi.phone_number, '')), ''))
    ) ORDER BY s.auto_hidden DESC, s.no_slots_since NULLS LAST, t.name), '[]'::JSONB)
    FROM public.tutor_publication_state s
    JOIN public.tutors t ON t.id = s.tutor_id
    LEFT JOIN public.tutor_private_info pi ON pi.tutor_id = t.id
    WHERE s.approved_once
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_run_auto_publication()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'ADMIN_FORBIDDEN'; END IF;
  RETURN public.run_tutor_auto_publication();
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_tutor_auto_lock(p_tutor_id TEXT, p_locked BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'ADMIN_FORBIDDEN'; END IF;
  INSERT INTO public.tutor_publication_state (tutor_id, approved_once, admin_locked)
  VALUES (p_tutor_id, TRUE, COALESCE(p_locked, FALSE))
  ON CONFLICT (tutor_id) DO UPDATE SET admin_locked = COALESCE(p_locked, FALSE), updated_at = NOW();
  RETURN jsonb_build_object('success', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.internal_track_admin_publication() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.internal_tutor_missing_items(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.internal_tutor_has_trial_slot(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tutor_get_my_publication_status() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tutor_mark_notifications_read() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_auto_publication() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_run_auto_publication() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_tutor_auto_lock(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_get_my_publication_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tutor_mark_notifications_read() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_auto_publication() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_run_auto_publication() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_tutor_auto_lock(TEXT, BOOLEAN) TO authenticated;

-- 8. Every hour at :07 ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'shatir-auto-publication';
    PERFORM cron.schedule('shatir-auto-publication', '7 * * * *', 'SELECT public.run_tutor_auto_publication()');
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
