-- =============================================================================
-- 025 — Guest trial booking (no email needed) + public tutor directory.
--
-- 1) parent_book_trial: accepts a Supabase *anonymous* session (guest) as well
--    as a verified email. Guests are limited to stop fake bookings:
--      * one upcoming trial per guest session,
--      * max 3 upcoming trials per WhatsApp number (any account),
--      * the same WhatsApp number cannot book the same tutor twice.
--    Requires «Allow anonymous sign-ins» in Supabase Auth settings; without it
--    the site falls back to the email code automatically.
-- 2) get_public_tutor_directory(): one fast call for the home page / ad landing:
--    published tutors + stages + subjects + quran flag + earliest bookable trial.
-- Safe to run more than once.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.parent_book_trial(p_slot_id uuid, p_guardian_name text, p_whatsapp text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_name TEXT := regexp_replace(BTRIM(COALESCE(p_guardian_name, '')), '[[:space:]]+', ' ', 'g');
  v_phone TEXT := translate(BTRIM(COALESCE(p_whatsapp, '')), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
  v_is_guest BOOLEAN := FALSE;
  v_tutor_id TEXT;
  v_slot public.tutor_available_slots%ROWTYPE;
  v_booking public.direct_trial_bookings%ROWTYPE;
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_tz TEXT;
  v_notice INTEGER;
  v_conflict RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'TRIAL_AUTH_REQUIRED'; END IF;
  SELECT COALESCE(u.is_anonymous, FALSE) INTO v_is_guest FROM auth.users u WHERE u.id = v_uid;
  IF NOT v_is_guest AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_uid
    AND u.email_confirmed_at IS NOT NULL AND NULLIF(BTRIM(u.email), '') IS NOT NULL) THEN
    RAISE EXCEPTION 'TRIAL_EMAIL_UNVERIFIED';
  END IF;
  PERFORM pg_advisory_xact_lock(219022, hashtext(v_uid::TEXT));
  SELECT * INTO v_booking FROM public.direct_trial_bookings
    WHERE guardian_user_id = v_uid AND slot_id = p_slot_id;
  IF FOUND THEN RETURN public.internal_direct_trial_json(v_booking); END IF;

  v_phone := regexp_replace(v_phone, '[[:space:]().-]', '', 'g');
  IF LEFT(v_phone, 2) = '00' THEN v_phone := '+' || SUBSTRING(v_phone FROM 3); END IF;
  IF v_phone ~ '^[1-9][0-9]{7,14}$' THEN v_phone := '+' || v_phone; END IF;
  IF char_length(v_name) NOT BETWEEN 2 AND 120 OR v_name ~ '[[:cntrl:]]'
    OR char_length(v_phone) > 16 OR v_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'TRIAL_INVALID_CONTACT';
  END IF;

  -- Per WhatsApp number (covers guests creating new sessions)
  PERFORM pg_advisory_xact_lock(219025, hashtext(v_phone));
  IF v_is_guest AND EXISTS (SELECT 1 FROM public.direct_trial_bookings
      WHERE guardian_user_id = v_uid AND status = 'confirmed' AND ends_at > NOW()) THEN
    RAISE EXCEPTION 'TRIAL_GUEST_LIMIT';
  END IF;
  IF (SELECT count(*) FROM public.direct_trial_bookings
      WHERE guardian_whatsapp = v_phone AND status = 'confirmed' AND ends_at > NOW()) >= 3 THEN
    RAISE EXCEPTION 'TRIAL_GUEST_LIMIT';
  END IF;

  SELECT tutor_id INTO v_tutor_id FROM public.tutor_available_slots WHERE id = p_slot_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRIAL_SLOT_UNAVAILABLE'; END IF;
  IF EXISTS (SELECT 1 FROM public.direct_trial_bookings
      WHERE guardian_whatsapp = v_phone AND tutor_id = v_tutor_id AND status <> 'cancelled') THEN
    RAISE EXCEPTION 'TRIAL_REPEAT_TUTOR';
  END IF;
  PERFORM public.acquire_tutor_lock(v_tutor_id);
  SELECT * INTO v_slot FROM public.tutor_available_slots WHERE id = p_slot_id FOR UPDATE;
  IF NOT FOUND OR v_slot.tutor_id IS DISTINCT FROM v_tutor_id
    OR NOT COALESCE(v_slot.is_available, FALSE) OR COALESCE(v_slot.is_booked, TRUE)
    OR COALESCE(v_slot.admin_suspended, TRUE) THEN
    RAISE EXCEPTION 'TRIAL_SLOT_UNAVAILABLE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tutors t WHERE t.id = v_tutor_id AND t.is_published IS TRUE)
    OR NOT EXISTS (SELECT 1 FROM public.tutor_account_links tal
      JOIN auth.users u ON u.id = tal.user_id
      WHERE tal.tutor_id = v_tutor_id AND tal.is_active IS TRUE) THEN
    RAISE EXCEPTION 'TRIAL_SLOT_UNAVAILABLE';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tutor_account_links
    WHERE tutor_id = v_tutor_id AND user_id = v_uid AND is_active IS TRUE) THEN
    RAISE EXCEPTION 'TRIAL_SELF_BOOKING';
  END IF;

  v_tz := COALESCE(NULLIF(BTRIM(v_slot.timezone), ''), 'Africa/Cairo');
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = v_tz)
    OR v_slot.end_time <= v_slot.start_time THEN
    RAISE EXCEPTION 'TRIAL_SLOT_UNAVAILABLE';
  END IF;
  v_start := (v_slot.slot_date + v_slot.start_time) AT TIME ZONE v_tz;
  v_end := (v_slot.slot_date + v_slot.end_time) AT TIME ZONE v_tz;
  IF v_end - v_start <> INTERVAL '20 minutes' THEN RAISE EXCEPTION 'TRIAL_SLOT_UNAVAILABLE'; END IF;
  SELECT minimum_notice_minutes INTO STRICT v_notice FROM public.direct_trial_booking_policy WHERE singleton;
  IF v_start <= clock_timestamp() + make_interval(mins => v_notice) THEN
    RAISE EXCEPTION 'TRIAL_TOO_SOON';
  END IF;
  IF EXISTS (SELECT 1 FROM public.direct_trial_bookings WHERE guardian_user_id = v_uid
    AND tutor_id = v_tutor_id AND status <> 'cancelled') THEN
    RAISE EXCEPTION 'TRIAL_REPEAT_TUTOR';
  END IF;
  IF EXISTS (SELECT 1 FROM public.direct_trial_bookings WHERE guardian_user_id = v_uid
    AND status = 'confirmed' AND tstzrange(starts_at, ends_at, '[)') && tstzrange(v_start, v_end, '[)')) THEN
    RAISE EXCEPTION 'TRIAL_TIME_CONFLICT';
  END IF;
  SELECT * INTO v_conflict FROM public.internal_check_tutor_time_conflict(
    v_tutor_id, v_start, v_end, p_slot_id, NULL, NULL);
  IF v_conflict.has_conflict IS DISTINCT FROM FALSE THEN RAISE EXCEPTION 'TRIAL_TIME_CONFLICT'; END IF;

  INSERT INTO public.direct_trial_bookings(slot_id, tutor_id, guardian_user_id,
    guardian_name, guardian_whatsapp, starts_at, ends_at, timezone)
  VALUES (p_slot_id, v_tutor_id, v_uid, v_name, v_phone, v_start, v_end, v_tz)
  RETURNING * INTO v_booking;
  UPDATE public.tutor_available_slots SET is_booked = TRUE, is_available = FALSE,
    booked_at = NOW(), updated_at = NOW() WHERE id = p_slot_id;
  RETURN public.internal_direct_trial_json(v_booking);
END;
$function$;

CREATE INDEX IF NOT EXISTS direct_trial_bookings_whatsapp_idx
  ON public.direct_trial_bookings (guardian_whatsapp, status);

-- Public directory -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_tutor_directory()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_notice INT;
BEGIN
  SELECT COALESCE((SELECT minimum_notice_minutes FROM public.direct_trial_booking_policy WHERE singleton LIMIT 1), 0)
    INTO v_notice;
  RETURN jsonb_build_object(
    'stages', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) ORDER BY s.id = 'secondary', s.id = 'preparatory', s.id), '[]'::JSONB)
                 FROM public.educational_stages s),
    'subjects', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) ORDER BY s.name), '[]'::JSONB)
                   FROM public.subjects s),
    'tutors', (
      SELECT COALESCE(jsonb_agg(x.j ORDER BY x.has_slot DESC, x.earliest NULLS LAST, x.rating DESC NULLS LAST), '[]'::JSONB)
      FROM (
        SELECT jsonb_build_object(
          'id', t.id, 'name', t.name, 'honorific', t.honorific, 'headline', t.headline,
          'avatarUrl', t.avatar_url, 'rating', t.rating, 'reviewsCount', t.reviews_count,
          'yearsOfExperience', t.years_of_experience, 'verified', t.verified_credentials,
          'priceMin', t.hourly_rate_min, 'priceMax', t.hourly_rate_max, 'currency', t.currency,
          'sessionMinutes', t.session_duration_minutes,
          'stageIds', COALESCE((SELECT jsonb_agg(DISTINCT o.stage_id) FROM public.v_tutor_school_offerings o
                                 WHERE o.tutor_id = t.id AND o.course_is_active IS TRUE AND o.stage_id IS NOT NULL), '[]'::JSONB),
          'subjectIds', COALESCE((SELECT jsonb_agg(DISTINCT o.subject_id) FROM public.v_tutor_school_offerings o
                                   WHERE o.tutor_id = t.id AND o.course_is_active IS TRUE AND o.subject_id IS NOT NULL), '[]'::JSONB),
          'quran', EXISTS (SELECT 1 FROM public.tutor_quran_offerings q WHERE q.tutor_id = t.id),
          'bookable', bk.ok,
          'earliestTrialAt', CASE WHEN bk.ok THEN es.earliest END,
          'trialSlotsCount', CASE WHEN bk.ok THEN es.cnt ELSE 0 END
        ) AS j,
        (bk.ok AND es.earliest IS NOT NULL) AS has_slot,
        CASE WHEN bk.ok THEN es.earliest END AS earliest,
        t.rating
        FROM public.tutors t
        CROSS JOIN LATERAL (
          SELECT EXISTS (SELECT 1 FROM public.tutor_account_links tal
                          WHERE tal.tutor_id = t.id AND tal.is_active IS TRUE) AS ok
        ) bk
        CROSS JOIN LATERAL (
          SELECT min(st) AS earliest, count(*) AS cnt FROM (
            SELECT (s.slot_date + s.start_time) AT TIME ZONE COALESCE(NULLIF(BTRIM(s.timezone), ''), 'Africa/Cairo') AS st,
                   (s.slot_date + s.end_time) AT TIME ZONE COALESCE(NULLIF(BTRIM(s.timezone), ''), 'Africa/Cairo') AS en
              FROM public.tutor_available_slots s
             WHERE s.tutor_id = t.id AND s.is_available IS TRUE AND s.is_booked IS NOT TRUE
               AND s.admin_suspended IS NOT TRUE
          ) z
          WHERE z.st > NOW() + make_interval(mins => v_notice) AND z.en - z.st = INTERVAL '20 minutes'
        ) es
        WHERE t.is_published IS TRUE
      ) x
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_tutor_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_tutor_directory() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
