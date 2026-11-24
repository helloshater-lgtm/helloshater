-- =============================================================================
-- 026 — Richer public directory (filters + tutor card) and admin list of
--        tutors without open trial slots (to remind them on WhatsApp).
-- Replaces get_public_tutor_directory() from 025 (same shape + new fields).
-- Safe to run more than once.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_public_tutor_directory()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_notice INT;
BEGIN
  SELECT COALESCE((SELECT minimum_notice_minutes FROM public.direct_trial_booking_policy WHERE singleton LIMIT 1), 0)
    INTO v_notice;
  RETURN (
    WITH slots AS (
      SELECT s.tutor_id,
             (s.slot_date + s.start_time) AT TIME ZONE COALESCE(NULLIF(BTRIM(s.timezone), ''), 'Africa/Cairo') AS st,
             (s.slot_date + s.end_time) AT TIME ZONE COALESCE(NULLIF(BTRIM(s.timezone), ''), 'Africa/Cairo') AS en
        FROM public.tutor_available_slots s
       WHERE s.is_available IS TRUE AND s.is_booked IS NOT TRUE AND s.admin_suspended IS NOT TRUE
    ), open_slots AS (
      SELECT * FROM slots
       WHERE st > NOW() + make_interval(mins => v_notice) AND en - st = INTERVAL '20 minutes'
    ), done AS (
      SELECT tutor_id, count(*) AS n FROM (
        SELECT tutor_id FROM public.direct_trial_bookings WHERE status = 'completed'
        UNION ALL SELECT tutor_id FROM public.tutor_private_bookings WHERE status = 'completed'
      ) x GROUP BY tutor_id
    ), t AS (
      SELECT tu.*,
             EXISTS (SELECT 1 FROM public.tutor_account_links tal WHERE tal.tutor_id = tu.id AND tal.is_active IS TRUE) AS ok,
             (SELECT min(st) FROM open_slots o WHERE o.tutor_id = tu.id) AS earliest,
             (SELECT count(*) FROM open_slots o WHERE o.tutor_id = tu.id) AS cnt,
             COALESCE((SELECT n FROM done d WHERE d.tutor_id = tu.id), 0) AS completed,
             (SELECT CASE pi.country_code WHEN '+20' THEN 'EG' WHEN '+966' THEN 'SA' WHEN '+971' THEN 'AE'
                       WHEN '+965' THEN 'KW' WHEN '+974' THEN 'QA' WHEN '+968' THEN 'OM' WHEN '+973' THEN 'BH'
                       WHEN '+962' THEN 'JO' ELSE NULL END
                FROM public.tutor_private_info pi WHERE pi.tutor_id = tu.id) AS country
        FROM public.tutors tu
       WHERE tu.is_published IS TRUE
    )
    SELECT jsonb_build_object(
      'stages', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) ORDER BY s.id), '[]'::JSONB) FROM public.educational_stages s),
      'subjects', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) ORDER BY s.name), '[]'::JSONB) FROM public.subjects s),
      'stats', jsonb_build_object(
        'tutors', (SELECT count(*) FROM t),
        'completedSessions', (SELECT COALESCE(sum(completed), 0) FROM t),
        'ratedTutors', (SELECT count(*) FROM t WHERE rating IS NOT NULL AND reviews_count > 0),
        'avgRating', (SELECT round(avg(rating)::numeric, 1) FROM t WHERE rating IS NOT NULL AND reviews_count > 0),
        'reviews', (SELECT COALESCE(sum(reviews_count), 0) FROM t)
      ),
      'tutors', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', t.id, 'name', t.name, 'honorific', t.honorific, 'headline', t.headline,
          'summary', left(COALESCE(NULLIF(BTRIM(t.help_child_summary), ''), NULLIF(BTRIM(t.help_child_quote), '')), 220),
          'avatarUrl', t.avatar_url, 'rating', t.rating, 'reviewsCount', t.reviews_count,
          'yearsOfExperience', t.years_of_experience, 'verified', t.verified_credentials,
          'priceMin', t.hourly_rate_min, 'priceMax', t.hourly_rate_max, 'currency', t.currency,
          'sessionMinutes', t.session_duration_minutes,
          'country', t.country,
          'completedSessions', t.completed,
          'studentsTaught', t.total_students_taught,
          'stageIds', COALESCE((SELECT jsonb_agg(DISTINCT o.stage_id) FROM public.v_tutor_school_offerings o
                                 WHERE o.tutor_id = t.id AND o.course_is_active IS TRUE AND o.stage_id IS NOT NULL), '[]'::JSONB),
          'subjectIds', COALESCE((SELECT jsonb_agg(DISTINCT o.subject_id) FROM public.v_tutor_school_offerings o
                                   WHERE o.tutor_id = t.id AND o.course_is_active IS TRUE AND o.subject_id IS NOT NULL), '[]'::JSONB),
          'quran', EXISTS (SELECT 1 FROM public.tutor_quran_offerings q WHERE q.tutor_id = t.id),
          'bookable', t.ok,
          'earliestTrialAt', CASE WHEN t.ok THEN t.earliest END,
          'trialSlotsCount', CASE WHEN t.ok THEN t.cnt ELSE 0 END,
          -- «dow-part» of open trial slots in the next 21 days (Cairo): dow 0=Sun..6=Sat, part m/a/e
          'slotBuckets', CASE WHEN t.ok THEN COALESCE((
              SELECT jsonb_agg(DISTINCT
                extract(dow FROM (o.st AT TIME ZONE 'Africa/Cairo'))::int || '-' ||
                CASE WHEN extract(hour FROM (o.st AT TIME ZONE 'Africa/Cairo')) < 12 THEN 'm'
                     WHEN extract(hour FROM (o.st AT TIME ZONE 'Africa/Cairo')) < 17 THEN 'a' ELSE 'e' END)
                FROM open_slots o WHERE o.tutor_id = t.id AND o.st < NOW() + INTERVAL '21 days'), '[]'::JSONB)
            ELSE '[]'::JSONB END
        ) ORDER BY (t.ok AND t.earliest IS NOT NULL) DESC, CASE WHEN t.ok THEN t.earliest END NULLS LAST, t.rating DESC NULLS LAST), '[]'::JSONB)
        FROM t
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_tutor_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_tutor_directory() TO anon, authenticated;

-- Admin: published tutors with an account but no open trial slot -------------
CREATE OR REPLACE FUNCTION public.admin_tutors_without_trial_slots()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'ADMIN_FORBIDDEN'; END IF;
  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'tutorId', t.id, 'name', t.name, 'honorific', t.honorific,
      'whatsapp', COALESCE(NULLIF(BTRIM(pi.whatsapp_number), ''),
                           NULLIF(BTRIM(COALESCE(pi.country_code, '') || COALESCE(pi.phone_number, '')), '')),
      'lastSlotAt', (SELECT max((s.slot_date + s.start_time) AT TIME ZONE COALESCE(NULLIF(BTRIM(s.timezone), ''), 'Africa/Cairo'))
                       FROM public.tutor_available_slots s WHERE s.tutor_id = t.id)
    ) ORDER BY t.name), '[]'::JSONB)
    FROM public.tutors t
    LEFT JOIN public.tutor_private_info pi ON pi.tutor_id = t.id
    WHERE t.is_published IS TRUE
      AND EXISTS (SELECT 1 FROM public.tutor_account_links tal WHERE tal.tutor_id = t.id AND tal.is_active IS TRUE)
      AND NOT EXISTS (
        SELECT 1 FROM public.tutor_available_slots s
         WHERE s.tutor_id = t.id AND s.is_available IS TRUE AND s.is_booked IS NOT TRUE AND s.admin_suspended IS NOT TRUE
           AND (s.slot_date + s.start_time) AT TIME ZONE COALESCE(NULLIF(BTRIM(s.timezone), ''), 'Africa/Cairo') > NOW())
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_tutors_without_trial_slots() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_tutors_without_trial_slots() TO authenticated;

NOTIFY pgrst, 'reload schema';
