-- ============================================================================
-- Migration 019: Admin Tutors Management, Unified 6/6 Publish Readiness,
--                Initial Human Quality Review, and Future Slot Evaluation
-- ============================================================================
-- Rules & Guarantees:
-- 1. Additive & idempotent migration (does NOT rewrite 017, does NOT use DROP ... CASCADE).
-- 2. Unifies the 6 independent readiness requirements across DB triggers & RPCs:
--    (a) Valid personal photo (non-empty, non-placeholder)
--    (b) Valid headline (10..250 chars) + bio (summary 20..2500 OR quote 5..350) without contact/URL leaks
--    (c) Valid session pricing (integer 1..100000, max >= min, currency in ('ج.م','ر.س','د.إ','$'), duration 30..120m)
--    (d) At least 1 active approved specialization (school_course_options or quran_offerings)
--    (e) At least 1 future available unbooked non-suspended paid private 1:1 slot (price_amount > 0, duration 30..120m)
--    (f) At least 1 future available unbooked non-suspended 20-minute trial slot
-- 3. Enforces readiness strictly on unpublished -> published transition (is_published: false -> true).
-- 4. Never auto-unpublishes existing published tutors when their slots expire or get booked.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Table: public.tutor_quality_reviews (Initial Human Quality Review State)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tutor_quality_reviews (
  tutor_id TEXT PRIMARY KEY REFERENCES public.tutors(id) ON DELETE CASCADE,
  avatar_quality_approved BOOLEAN NOT NULL DEFAULT FALSE,
  approved_avatar_url TEXT,
  price_quality_approved BOOLEAN NOT NULL DEFAULT FALSE,
  approved_price_amount INTEGER,
  approved_price_min INTEGER,
  approved_price_max INTEGER,
  approved_currency TEXT,
  approved_duration_minutes INTEGER,
  review_notes TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tutor_quality_reviews
  ADD COLUMN IF NOT EXISTS approved_price_amount INTEGER;

ALTER TABLE public.tutor_quality_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage tutor quality reviews" ON public.tutor_quality_reviews;
CREATE POLICY "Admins can manage tutor quality reviews"
  ON public.tutor_quality_reviews
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

REVOKE ALL ON public.tutor_quality_reviews FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tutor_quality_reviews TO authenticated;

-- Backfill quality review records for tutors that are ALREADY published so existing
-- published tutors remain approved for their current avatar & pricing.
INSERT INTO public.tutor_quality_reviews (
  tutor_id,
  avatar_quality_approved,
  approved_avatar_url,
  price_quality_approved,
  approved_price_amount,
  approved_price_min,
  approved_price_max,
  approved_currency,
  approved_duration_minutes,
  review_notes
)
SELECT
  t.id,
  TRUE,
  t.avatar_url,
  TRUE,
  t.hourly_rate_min,
  t.hourly_rate_min,
  t.hourly_rate_max,
  t.currency,
  t.session_duration_minutes,
  'اعتماد تلقائي للمعلمين المنشورين مسبقاً'
FROM public.tutors t
WHERE t.is_published = TRUE
ON CONFLICT (tutor_id) DO NOTHING;

-- ============================================================================
-- 2. RPC: public.admin_save_tutor_quality_review
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_save_tutor_quality_review(
  p_tutor_id TEXT,
  p_avatar_quality_approved BOOLEAN,
  p_approved_avatar_url TEXT,
  p_price_quality_approved BOOLEAN,
  p_approved_price_amount INTEGER,
  p_approved_currency TEXT,
  p_approved_duration_minutes INTEGER,
  p_review_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_tutor_id TEXT := LOWER(BTRIM(COALESCE(p_tutor_id, '')));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  IF v_clean_tutor_id = '' THEN
    RAISE EXCEPTION 'معرف المعلم مطلوب لحفظ مراجعة الجودة.';
  END IF;

  INSERT INTO public.tutor_quality_reviews (
    tutor_id,
    avatar_quality_approved,
    approved_avatar_url,
    price_quality_approved,
    approved_price_amount,
    approved_price_min,
    approved_price_max,
    approved_currency,
    approved_duration_minutes,
    review_notes,
    reviewed_by,
    reviewed_at,
    updated_at
  )
  VALUES (
    v_clean_tutor_id,
    COALESCE(p_avatar_quality_approved, FALSE),
    CASE WHEN COALESCE(p_avatar_quality_approved, FALSE) THEN BTRIM(COALESCE(p_approved_avatar_url, '')) ELSE NULL END,
    COALESCE(p_price_quality_approved, FALSE),
    p_approved_price_amount,
    p_approved_price_amount,
    p_approved_price_amount,
    BTRIM(COALESCE(p_approved_currency, '')),
    p_approved_duration_minutes,
    NULLIF(BTRIM(COALESCE(p_review_notes, '')), ''),
    auth.uid(),
    NOW(),
    NOW()
  )
  ON CONFLICT (tutor_id) DO UPDATE SET
    avatar_quality_approved = EXCLUDED.avatar_quality_approved,
    approved_avatar_url = EXCLUDED.approved_avatar_url,
    price_quality_approved = EXCLUDED.price_quality_approved,
    approved_price_amount = EXCLUDED.approved_price_amount,
    approved_price_min = EXCLUDED.approved_price_min,
    approved_price_max = EXCLUDED.approved_price_max,
    approved_currency = EXCLUDED.approved_currency,
    approved_duration_minutes = EXCLUDED.approved_duration_minutes,
    review_notes = EXCLUDED.review_notes,
    reviewed_by = EXCLUDED.reviewed_by,
    reviewed_at = NOW(),
    updated_at = NOW();

  RETURN jsonb_build_object(
    'success', TRUE,
    'tutor_id', v_clean_tutor_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_tutor_quality_review(TEXT, BOOLEAN, TEXT, BOOLEAN, INTEGER, TEXT, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_tutor_quality_review(TEXT, BOOLEAN, TEXT, BOOLEAN, INTEGER, TEXT, INTEGER, TEXT) TO authenticated;

-- ============================================================================
-- 3. RPC: public.admin_add_private_slot (Admin helper to add paid 1:1 slot)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_add_private_slot(
  p_tutor_id TEXT,
  p_slot_date DATE,
  p_start_time TIME,
  p_end_time TIME,
  p_duration_minutes INTEGER,
  p_price_amount INTEGER,
  p_currency TEXT DEFAULT 'ج.م',
  p_timezone TEXT DEFAULT 'Africa/Cairo',
  p_specialization_label TEXT DEFAULT 'حصة خاصة',
  p_offering_course_option_id UUID DEFAULT NULL,
  p_quran_age_group_id TEXT DEFAULT NULL,
  p_quran_level_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id UUID;
  v_clean_tutor_id TEXT := LOWER(BTRIM(COALESCE(p_tutor_id, '')));
  v_clean_currency TEXT := BTRIM(COALESCE(p_currency, 'ج.م'));
  v_clean_tz TEXT := COALESCE(NULLIF(BTRIM(p_timezone), ''), 'Africa/Cairo');
  v_clean_label TEXT := COALESCE(NULLIF(BTRIM(p_specialization_label), ''), 'حصة خاصة');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  IF p_duration_minutes IS NULL OR p_duration_minutes < 30 OR p_duration_minutes > 120 THEN
    RAISE EXCEPTION 'مدة الحصة الخاصة يجب أن تكون بين 30 و120 دقيقة.';
  END IF;

  IF p_price_amount IS NULL OR p_price_amount < 1 OR p_price_amount > 100000 THEN
    RAISE EXCEPTION 'سعر الحصة الخاصة المدفوعة يجب أن يكون رقماً صحيحاً بين 1 و100,000.';
  END IF;

  IF v_clean_currency NOT IN ('ج.م', 'ر.س', 'د.إ', '$') THEN
    RAISE EXCEPTION 'العملة المختارة غير مدعومة.';
  END IF;

  INSERT INTO public.tutor_private_slots (
    tutor_id,
    slot_date,
    start_time,
    end_time,
    timezone,
    duration_minutes,
    price_amount,
    currency,
    is_available,
    is_booked,
    admin_suspended,
    specialization_label,
    offering_course_option_id,
    quran_age_group_id,
    quran_level_id
  )
  VALUES (
    v_clean_tutor_id,
    p_slot_date,
    p_start_time,
    p_end_time,
    v_clean_tz,
    p_duration_minutes,
    p_price_amount,
    v_clean_currency,
    TRUE,
    FALSE,
    FALSE,
    v_clean_label,
    p_offering_course_option_id,
    NULLIF(BTRIM(COALESCE(p_quran_age_group_id, '')), ''),
    NULLIF(BTRIM(COALESCE(p_quran_level_id, '')), '')
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_add_private_slot(TEXT, DATE, TIME, TIME, INTEGER, INTEGER, TEXT, TEXT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_private_slot(TEXT, DATE, TIME, TIME, INTEGER, INTEGER, TEXT, TEXT, TEXT, UUID, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- 4. Unified Readiness Evaluator Function:
--    public.evaluate_tutor_publish_readiness_json(p_tutor_id TEXT)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.evaluate_tutor_publish_readiness_json(
  p_tutor_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tutor RECORD;
  v_avatar_url TEXT;
  v_avatar_ok BOOLEAN := FALSE;
  v_headline TEXT;
  v_quote TEXT;
  v_summary TEXT;
  v_bio_ok BOOLEAN := FALSE;
  v_pricing_ok BOOLEAN := FALSE;
  v_school_offerings_count INTEGER := 0;
  v_quran_offerings_count INTEGER := 0;
  v_spec_ok BOOLEAN := FALSE;
  v_future_paid_private_count INTEGER := 0;
  v_paid_slot_ok BOOLEAN := FALSE;
  v_future_trial_count INTEGER := 0;
  v_trial_slot_ok BOOLEAN := FALSE;
  v_missing_reasons TEXT[] := ARRAY[]::TEXT[];
  v_completed_count INTEGER := 0;
BEGIN
  SELECT * INTO v_tutor
  FROM public.tutors
  WHERE id = LOWER(BTRIM(COALESCE(p_tutor_id, '')));

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'found', FALSE,
      'is_data_complete', FALSE,
      'completed_count', 0,
      'total_count', 6,
      'missing_reasons', jsonb_build_array('لم يتم العثور على سجل المعلم.')
    );
  END IF;

  -- (أ) Valid Personal Photo (avatar)
  v_avatar_url := BTRIM(COALESCE(v_tutor.avatar_url, ''));
  IF v_avatar_url <> ''
     AND LOWER(v_avatar_url) NOT IN ('null', 'undefined', 'none', 'about:blank', '#')
     AND v_avatar_url !~* '(ui-avatars\.com|dicebear\.com|robohash\.org|gravatar\.com/avatar/00000000|placeholder|default[-_]?avatar|no[-_]?avatar|anonymous[-_]?avatar|blank[-_]?profile|/shatir-logo|logo\.svg)'
  THEN
    v_avatar_ok := TRUE;
    v_completed_count := v_completed_count + 1;
  ELSE
    v_missing_reasons := array_append(v_missing_reasons, 'الصورة الشخصية: يجب رفع صورة شخصية حقيقية وصالحة للمعلم.');
  END IF;

  -- (ب) Headline & Bio (bio)
  v_headline := BTRIM(COALESCE(v_tutor.headline, ''));
  v_quote := BTRIM(COALESCE(v_tutor.help_child_quote, ''));
  v_summary := BTRIM(COALESCE(v_tutor.help_child_summary, ''));

  IF CHAR_LENGTH(v_headline) BETWEEN 10 AND 250
     AND (
       (v_summary <> '' AND CHAR_LENGTH(v_summary) BETWEEN 20 AND 2500)
       OR (v_quote <> '' AND CHAR_LENGTH(v_quote) BETWEEN 5 AND 350)
     )
     AND (v_summary = '' OR CHAR_LENGTH(v_summary) BETWEEN 20 AND 2500)
     AND (v_quote = '' OR CHAR_LENGTH(v_quote) BETWEEN 5 AND 350)
     AND NOT public.contains_contact_or_url_leak(v_headline)
     AND NOT public.contains_contact_or_url_leak(v_quote)
     AND NOT public.contains_contact_or_url_leak(v_summary)
  THEN
    v_bio_ok := TRUE;
    v_completed_count := v_completed_count + 1;
  ELSE
    v_missing_reasons := array_append(v_missing_reasons, 'العنوان والنبذة التعريفية: يجب كتابة عنوان قصير (10–250 حرفًا) ونبذة تعريفية (20–2500 حرف) أو اقتباس (5–350 حرفًا) دون أرقام هواتف أو روابط.');
  END IF;

  -- (ج) Valid Pricing & Session Duration (pricing)
  IF v_tutor.hourly_rate_min IS NOT NULL
     AND v_tutor.hourly_rate_max IS NOT NULL
     AND v_tutor.hourly_rate_min >= 1
     AND v_tutor.hourly_rate_min <= 100000
     AND v_tutor.hourly_rate_max >= v_tutor.hourly_rate_min
     AND v_tutor.hourly_rate_max <= 100000
     AND BTRIM(COALESCE(v_tutor.currency, '')) IN ('ج.م', 'ر.س', 'د.إ', '$')
     AND v_tutor.session_duration_minutes IS NOT NULL
     AND v_tutor.session_duration_minutes BETWEEN 30 AND 120
  THEN
    v_pricing_ok := TRUE;
    v_completed_count := v_completed_count + 1;
  ELSE
    v_missing_reasons := array_append(v_missing_reasons, 'السعر ومدة الحصة: يجب تحديد سعر صحيح أكبر من صفر (1–100,000) وعملة مدعومة ومدة حصة بين 30 و120 دقيقة.');
  END IF;

  -- (د) Active Approved Specializations (specializations)
  SELECT COUNT(*) INTO v_school_offerings_count
  FROM public.tutor_school_offerings tso
  JOIN public.school_course_options sco ON sco.id = tso.school_course_option_id AND sco.is_active = TRUE
  JOIN public.subjects s ON s.id = sco.subject_id AND s.is_active = TRUE
  JOIN public.educational_grades g ON g.id = sco.grade_id AND g.is_active = TRUE
  JOIN public.educational_stages st ON st.id = g.stage_id AND st.is_active = TRUE
  JOIN public.curriculum_types c ON c.id = sco.curriculum_id AND c.is_active = TRUE
  WHERE tso.tutor_id = v_tutor.id
    AND tso.is_active = TRUE;

  SELECT COUNT(*) INTO v_quran_offerings_count
  FROM public.tutor_quran_offerings tqo
  JOIN public.quran_age_groups qag ON qag.id = tqo.age_group_id AND qag.is_active = TRUE
  JOIN public.quran_levels ql ON ql.id = tqo.level_id AND ql.is_active = TRUE
  WHERE tqo.tutor_id = v_tutor.id
    AND tqo.is_active = TRUE;

  IF (v_school_offerings_count + v_quran_offerings_count) > 0 THEN
    v_spec_ok := TRUE;
    v_completed_count := v_completed_count + 1;
  ELSE
    v_missing_reasons := array_append(v_missing_reasons, 'التخصصات المعتمدة: يجب ربط تخصص دراسي أو مسار قرآني معتمد ومفعل واحد على الأقل.');
  END IF;

  -- (هـ) Future Available Paid Private 1:1 Slot (paidPrivateSlot)
  SELECT COUNT(*) INTO v_future_paid_private_count
  FROM public.tutor_private_slots ps
  WHERE ps.tutor_id = v_tutor.id
    AND ps.is_available = TRUE
    AND COALESCE(ps.is_booked, FALSE) = FALSE
    AND COALESCE(ps.admin_suspended, FALSE) = FALSE
    AND ps.price_amount IS NOT NULL
    AND ps.price_amount >= 1
    AND ps.price_amount <= 100000
    AND BTRIM(COALESCE(ps.currency, '')) IN ('ج.م', 'ر.س', 'د.إ', '$')
    AND ps.duration_minutes BETWEEN 30 AND 120
    AND (
      NULLIF(BTRIM(COALESCE(ps.specialization_label, '')), '') IS NOT NULL
      OR ps.offering_course_option_id IS NOT NULL
      OR (
        NULLIF(BTRIM(COALESCE(ps.quran_age_group_id, '')), '') IS NOT NULL
        AND NULLIF(BTRIM(COALESCE(ps.quran_level_id, '')), '') IS NOT NULL
      )
    )
    AND (
      ((ps.slot_date::text || ' ' || ps.start_time::text)::timestamp
        AT TIME ZONE COALESCE(NULLIF(BTRIM(ps.timezone), ''), 'Africa/Cairo')) > NOW()
    );

  IF v_future_paid_private_count > 0 THEN
    v_paid_slot_ok := TRUE;
    v_completed_count := v_completed_count + 1;
  ELSE
    v_missing_reasons := array_append(v_missing_reasons, 'موعد حصة خاصة مدفوعة متاح: لا يوجد موعد مستقبلي متاح وغير محجوز وغير موقوف لحصة خاصة مدفوعة (بسعر أكبر من صفر ومدة 30–120 دقيقة).');
  END IF;

  -- (و) Future Available 20-Minute Trial Slot (trialSlot)
  SELECT COUNT(*) INTO v_future_trial_count
  FROM public.tutor_available_slots ts
  WHERE ts.tutor_id = v_tutor.id
    AND ts.is_available = TRUE
    AND COALESCE(ts.is_booked, FALSE) = FALSE
    AND COALESCE(ts.admin_suspended, FALSE) = FALSE
    AND EXTRACT(EPOCH FROM (ts.end_time - ts.start_time)) / 60 = 20
    AND (
      ((ts.slot_date::text || ' ' || ts.start_time::text)::timestamp
        AT TIME ZONE COALESCE(NULLIF(BTRIM(ts.timezone), ''), 'Africa/Cairo')) > NOW()
    );

  IF v_future_trial_count > 0 THEN
    v_trial_slot_ok := TRUE;
    v_completed_count := v_completed_count + 1;
  ELSE
    v_missing_reasons := array_append(v_missing_reasons, 'موعد حصة تجريبية متاح (20 دقيقة): لا يوجد موعد مستقبلي متاح وغير محجوز وغير موقوف لحصة تجريبية مدتها 20 دقيقة.');
  END IF;

  RETURN jsonb_build_object(
    'found', TRUE,
    'tutor_id', v_tutor.id,
    'is_published', COALESCE(v_tutor.is_published, FALSE),
    'is_data_complete', (v_completed_count = 6),
    'completed_count', v_completed_count,
    'total_count', 6,
    'avatar_ok', v_avatar_ok,
    'bio_ok', v_bio_ok,
    'pricing_ok', v_pricing_ok,
    'specializations_ok', v_spec_ok,
    'paid_private_slot_ok', v_paid_slot_ok,
    'trial_slot_ok', v_trial_slot_ok,
    'future_paid_private_count', v_future_paid_private_count,
    'future_trial_count', v_future_trial_count,
    'missing_reasons', to_jsonb(v_missing_reasons)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_tutor_publish_readiness_json(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_tutor_publish_readiness_json(TEXT) TO authenticated;

-- ============================================================================
-- 5. Update Trigger Function: public.check_tutor_publish_readiness()
--    - Enforces all 6 requirements ONLY on unpublished -> published transition
--      (or INSERT with is_published = TRUE).
--    - Never auto-unpublishes or blocks already-published tutors when their
--      slots expire or when they update their bio/pricing/photo.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_tutor_publish_readiness()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_transitioning_to_published BOOLEAN := FALSE;
  v_eval JSONB;
  v_missing_list TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_is_transitioning_to_published := COALESCE(NEW.is_published, FALSE);
  ELSIF TG_OP = 'UPDATE' THEN
    v_is_transitioning_to_published := (NOT COALESCE(OLD.is_published, FALSE)) AND COALESCE(NEW.is_published, FALSE);
  END IF;

  -- If the tutor is already published and stays published, only guard against wiping out avatar_url completely
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.is_published, FALSE) AND COALESCE(NEW.is_published, FALSE) THEN
    IF NEW.avatar_url IS NULL OR BTRIM(NEW.avatar_url) = '' THEN
      RAISE EXCEPTION 'لا يمكن إزالة الصورة الشخصية لمعلم منشور حالياً.';
    END IF;
    RETURN NEW;
  END IF;

  -- If not transitioning to published, allow freely (e.g. preparing profile while unpublished, or unpublishing)
  IF NOT v_is_transitioning_to_published THEN
    RETURN NEW;
  END IF;

  -- Basic check on NEW row columns first (in case BEFORE INSERT/UPDATE changed avatar/bio/pricing)
  IF NEW.avatar_url IS NULL OR BTRIM(NEW.avatar_url) = ''
     OR LOWER(BTRIM(NEW.avatar_url)) IN ('null', 'undefined', 'none', 'about:blank', '#')
     OR NEW.avatar_url ~* '(ui-avatars\.com|dicebear\.com|robohash\.org|gravatar\.com/avatar/00000000|placeholder|default[-_]?avatar|no[-_]?avatar|anonymous[-_]?avatar|blank[-_]?profile|/shatir-logo|logo\.svg)'
  THEN
    RAISE EXCEPTION 'لا يمكن نشر ملف المعلم بدون صورة شخصية حقيقية وصالحة.';
  END IF;

  IF CHAR_LENGTH(BTRIM(COALESCE(NEW.headline, ''))) NOT BETWEEN 10 AND 250
     OR (
       CHAR_LENGTH(BTRIM(COALESCE(NEW.help_child_summary, ''))) < 20
       AND CHAR_LENGTH(BTRIM(COALESCE(NEW.help_child_quote, ''))) < 5
     )
  THEN
    RAISE EXCEPTION 'لا يمكن نشر ملف المعلم قبل استكمال العنوان التعريفي (10–250 حرفًا) والنبذة التعريفية.';
  END IF;

  IF NEW.hourly_rate_min IS NULL OR NEW.hourly_rate_min < 1 OR NEW.hourly_rate_min > 100000
     OR NEW.hourly_rate_max IS NULL OR NEW.hourly_rate_max < NEW.hourly_rate_min OR NEW.hourly_rate_max > 100000
     OR BTRIM(COALESCE(NEW.currency, '')) NOT IN ('ج.م', 'ر.س', 'د.إ', '$')
     OR NEW.session_duration_minutes IS NULL OR NEW.session_duration_minutes NOT BETWEEN 30 AND 120
  THEN
    RAISE EXCEPTION 'لا يمكن نشر ملف المعلم قبل ضبط سعر صحيح للحصة (1–100,000) وعملة مدعومة ومدة حصة بين 30 و120 دقيقة.';
  END IF;

  -- Evaluate relational offerings & future slots (for existing tutor rows transitioning false -> true)
  IF TG_OP = 'UPDATE' THEN
    v_eval := public.evaluate_tutor_publish_readiness_json(NEW.id);
    IF NOT COALESCE((v_eval->>'specializations_ok')::BOOLEAN, FALSE)
       OR NOT COALESCE((v_eval->>'paid_private_slot_ok')::BOOLEAN, FALSE)
       OR NOT COALESCE((v_eval->>'trial_slot_ok')::BOOLEAN, FALSE)
    THEN
      SELECT string_agg('• ' || elem, E'\n')
      INTO v_missing_list
      FROM jsonb_array_elements_text(COALESCE(v_eval->'missing_reasons', '[]'::jsonb)) AS elem;

      RAISE EXCEPTION 'لا يمكن نشر ملف المعلم قبل استكمال جميع متطلبات الجاهزية (6/6):%', E'\n' || COALESCE(v_missing_list, '');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 6. Update Slot Counts RPCs for Admin Tutors List
--    - Fixes old admin_get_tutors_slot_counts so it only counts FUTURE,
--      available, unbooked, non-suspended 20-minute trial slots in their timezone.
--    - Adds admin_get_tutors_detailed_slot_counts for separate trial & paid private counts.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.admin_get_tutors_slot_counts(
  p_tutor_ids TEXT[]
)
RETURNS TABLE(tutor_id TEXT, available_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN QUERY
  SELECT
    ts.tutor_id,
    COUNT(*)::BIGINT AS available_count
  FROM public.tutor_available_slots ts
  WHERE ts.tutor_id = ANY(p_tutor_ids)
    AND ts.is_available = TRUE
    AND COALESCE(ts.is_booked, FALSE) = FALSE
    AND COALESCE(ts.admin_suspended, FALSE) = FALSE
    AND EXTRACT(EPOCH FROM (ts.end_time - ts.start_time)) / 60 = 20
    AND (
      ((ts.slot_date::text || ' ' || ts.start_time::text)::timestamp
        AT TIME ZONE COALESCE(NULLIF(BTRIM(ts.timezone), ''), 'Africa/Cairo')) > NOW()
    )
  GROUP BY ts.tutor_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_tutors_detailed_slot_counts(
  p_tutor_ids TEXT[]
)
RETURNS TABLE(
  tutor_id TEXT,
  future_trial_count BIGINT,
  future_paid_private_count BIGINT,
  distinct_upcoming_days_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  RETURN QUERY
  WITH tutor_list AS (
    SELECT UNNEST(p_tutor_ids) AS tid
  ),
  valid_trials AS (
    SELECT
      ts.tutor_id,
      ts.slot_date
    FROM public.tutor_available_slots ts
    WHERE ts.tutor_id = ANY(p_tutor_ids)
      AND ts.is_available = TRUE
      AND COALESCE(ts.is_booked, FALSE) = FALSE
      AND COALESCE(ts.admin_suspended, FALSE) = FALSE
      AND EXTRACT(EPOCH FROM (ts.end_time - ts.start_time)) / 60 = 20
      AND (
        ((ts.slot_date::text || ' ' || ts.start_time::text)::timestamp
          AT TIME ZONE COALESCE(NULLIF(BTRIM(ts.timezone), ''), 'Africa/Cairo')) > NOW()
      )
  ),
  valid_privates AS (
    SELECT
      ps.tutor_id,
      ps.slot_date
    FROM public.tutor_private_slots ps
    WHERE ps.tutor_id = ANY(p_tutor_ids)
      AND ps.is_available = TRUE
      AND COALESCE(ps.is_booked, FALSE) = FALSE
      AND COALESCE(ps.admin_suspended, FALSE) = FALSE
      AND ps.price_amount IS NOT NULL
      AND ps.price_amount >= 1
      AND ps.price_amount <= 100000
      AND BTRIM(COALESCE(ps.currency, '')) IN ('ج.م', 'ر.س', 'د.إ', '$')
      AND ps.duration_minutes BETWEEN 30 AND 120
      AND (
        NULLIF(BTRIM(COALESCE(ps.specialization_label, '')), '') IS NOT NULL
        OR ps.offering_course_option_id IS NOT NULL
        OR (
          NULLIF(BTRIM(COALESCE(ps.quran_age_group_id, '')), '') IS NOT NULL
          AND NULLIF(BTRIM(COALESCE(ps.quran_level_id, '')), '') IS NOT NULL
        )
      )
      AND (
        ((ps.slot_date::text || ' ' || ps.start_time::text)::timestamp
          AT TIME ZONE COALESCE(NULLIF(BTRIM(ps.timezone), ''), 'Africa/Cairo')) > NOW()
      )
  ),
  combined_days AS (
    SELECT vt.tutor_id, vt.slot_date FROM valid_trials vt
    UNION
    SELECT vp.tutor_id, vp.slot_date FROM valid_privates vp
  )
  SELECT
    tl.tid AS tutor_id,
    COALESCE((SELECT COUNT(*) FROM valid_trials vt WHERE vt.tutor_id = tl.tid), 0)::BIGINT AS future_trial_count,
    COALESCE((SELECT COUNT(*) FROM valid_privates vp WHERE vp.tutor_id = tl.tid), 0)::BIGINT AS future_paid_private_count,
    COALESCE((SELECT COUNT(DISTINCT cd.slot_date) FROM combined_days cd WHERE cd.tutor_id = tl.tid), 0)::BIGINT AS distinct_upcoming_days_count
  FROM tutor_list tl;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_tutors_detailed_slot_counts(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_tutors_detailed_slot_counts(TEXT[]) TO authenticated;

-- ============================================================================
-- 7. Read-Only Diagnostic View/Query for Existing Published Tutors
--    (Does NOT modify or auto-unpublish any published tutor; reports status)
-- ============================================================================
/*
-- استعلام فحص للقراءة فقط للمعلمين المنشورين حالياً:
SELECT
  t.id AS tutor_id,
  t.name AS tutor_name,
  t.is_published,
  r.eval->>'completed_count' AS completed_requirements,
  r.eval->>'is_data_complete' AS is_data_complete_6_6,
  r.eval->>'future_trial_count' AS future_trial_slots,
  r.eval->>'future_paid_private_count' AS future_paid_private_slots,
  r.eval->'missing_reasons' AS missing_reasons
FROM public.tutors t
CROSS JOIN LATERAL (
  SELECT public.evaluate_tutor_publish_readiness_json(t.id) AS eval
) r
WHERE t.is_published = TRUE
ORDER BY (r.eval->>'completed_count')::INT ASC, t.name ASC;
*/

COMMIT;
