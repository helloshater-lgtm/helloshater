-- =============================================================================
-- 028 — A tutor is published only with BOTH an open trial slot and an open
--        fixed (private) slot. Missing either → hidden at once; adding both
--        → published again automatically (checked every 15 minutes).
-- Builds on 027. Safe to run more than once.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.internal_tutor_has_private_slot(p_tutor_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tutor_private_slots s
     WHERE s.tutor_id = p_tutor_id AND s.is_available IS TRUE AND s.is_booked IS NOT TRUE AND s.admin_suspended IS NOT TRUE
       AND (s.slot_date + s.start_time) AT TIME ZONE COALESCE(NULLIF(BTRIM(s.timezone), ''), 'Africa/Cairo') > NOW()
  );
$$;

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
    UNION ALL SELECT 'trial_slots' WHERE NOT public.internal_tutor_has_trial_slot(p_tutor_id)
    UNION ALL SELECT 'private_slots' WHERE NOT public.internal_tutor_has_private_slot(p_tutor_id)
  ) x;
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
    WHEN 'trial_slots' THEN 'مواعيد حصص تجريبية'
    WHEN 'private_slots' THEN 'مواعيد ثابتة للحصص الخاصة'
    ELSE v END, '، ')
  FROM jsonb_array_elements_text(p) AS v;
$$;

REVOKE ALL ON FUNCTION public.internal_tutor_has_private_slot(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.internal_tutor_missing_items(TEXT) FROM PUBLIC, anon, authenticated;

-- Check every 15 minutes so a tutor who adds slots appears quickly.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'shatir-auto-publication';
    PERFORM cron.schedule('shatir-auto-publication', '*/15 * * * *', 'SELECT public.run_tutor_auto_publication()');
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
