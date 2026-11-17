-- ============================================================================
-- Migration 021: Clean Additive Quality Review Table & Admin Private Slot RPC
-- ============================================================================
-- Isolates the valid quality-review table/backfill/save RPC and admin private
-- slot creation RPC that were previously rolled back when migration 019 failed.
-- Does NOT touch admin_get_tutors_slot_counts or use DROP ... CASCADE.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Table: public.tutor_quality_reviews (Initial Human Quality Review State)
-- ----------------------------------------------------------------------------
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tutor_quality_reviews TO authenticated, service_role;

-- Backfill quality review records for tutors that are ALREADY published
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

-- ----------------------------------------------------------------------------
-- 2. RPC: public.admin_save_tutor_quality_review
-- ----------------------------------------------------------------------------
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
SET search_path = public, auth, pg_temp
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
GRANT EXECUTE ON FUNCTION public.admin_save_tutor_quality_review(TEXT, BOOLEAN, TEXT, BOOLEAN, INTEGER, TEXT, INTEGER, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. RPC: public.admin_add_private_slot
-- ----------------------------------------------------------------------------
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
SET search_path = public, auth, pg_temp
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
GRANT EXECUTE ON FUNCTION public.admin_add_private_slot(TEXT, DATE, TIME, TIME, INTEGER, INTEGER, TEXT, TEXT, TEXT, UUID, TEXT, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
