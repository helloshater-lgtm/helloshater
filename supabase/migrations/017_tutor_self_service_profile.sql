-- ============================================================================
-- Migration 017: Tutor Self-Service Profile, Pricing, Avatar & Trial Slot Edit
-- Shatir Classes (شاطر كلاسيز)
-- ============================================================================
-- Goals:
-- 1. Enable approved tutors to directly manage their session price, currency,
--    and duration via `tutor_update_profile_pricing` without changing `is_published`
--    or altering existing slots/confirmed bookings.
-- 2. Enable approved tutors to upload and publish their avatar directly to the
--    public `tutor-avatars` bucket under `self-service/<auth.uid()>/<filename>`
--    and commit via `tutor_update_profile_avatar` (verifying storage object ownership).
-- 3. Formally define `tutor_profile_edit_history`, `tutor_update_profile_text`,
--    `admin_get_recent_tutor_profile_edits`, and `admin_revert_tutor_profile_edit`.
-- 4. Add `tutor_update_trial_slot` (enforcing 20-minute trial duration, unbooked &
--    non-suspended protections, and cross-schedule conflict detection) and support
--    IANA timezones (`Africa/Cairo`, `Asia/Riyadh`, `Asia/Dubai`).
-- ============================================================================

-- ============================================================================
-- 1. Configure `tutor-avatars` Storage Bucket & Self-Service RLS Policies
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tutor-avatars',
  'tutor-avatars',
  TRUE,
  2097152, -- 2MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = TRUE,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS "Public read access for tutor-avatars" ON storage.objects;
CREATE POLICY "Public read access for tutor-avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'tutor-avatars');

DROP POLICY IF EXISTS "Approved tutors upload own self-service avatar" ON storage.objects;
CREATE POLICY "Approved tutors upload own self-service avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'tutor-avatars'
    AND auth.role() = 'authenticated'
    AND public.get_current_tutor_id() IS NOT NULL
    AND (storage.foldername(name))[1] = 'self-service'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Approved tutors update own self-service avatar" ON storage.objects;
CREATE POLICY "Approved tutors update own self-service avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'tutor-avatars'
    AND auth.role() = 'authenticated'
    AND public.get_current_tutor_id() IS NOT NULL
    AND (storage.foldername(name))[1] = 'self-service'
    AND (storage.foldername(name))[2] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'tutor-avatars'
    AND auth.role() = 'authenticated'
    AND public.get_current_tutor_id() IS NOT NULL
    AND (storage.foldername(name))[1] = 'self-service'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Approved tutors delete own self-service avatar" ON storage.objects;
CREATE POLICY "Approved tutors delete own self-service avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'tutor-avatars'
    AND auth.role() = 'authenticated'
    AND public.get_current_tutor_id() IS NOT NULL
    AND (storage.foldername(name))[1] = 'self-service'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- ============================================================================
-- 2. Tutor Profile Edit History & Direct Text Editing (`tutor_update_profile_text`)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tutor_profile_edit_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id TEXT NOT NULL REFERENCES public.tutors(id) ON DELETE CASCADE,
  edited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'tutor_portal',
  old_headline TEXT,
  new_headline TEXT,
  old_help_child_quote TEXT,
  new_help_child_quote TEXT,
  old_help_child_summary TEXT,
  new_help_child_summary TEXT,
  changed_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  reverted_at TIMESTAMPTZ,
  reverted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tutor_profile_edit_history_tutor_created
  ON public.tutor_profile_edit_history (tutor_id, created_at DESC);

ALTER TABLE public.tutor_profile_edit_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view tutor profile edit history" ON public.tutor_profile_edit_history;
CREATE POLICY "Admins view tutor profile edit history"
  ON public.tutor_profile_edit_history FOR SELECT
  USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.tutor_update_profile_text(
  p_headline TEXT,
  p_help_child_quote TEXT DEFAULT NULL,
  p_help_child_summary TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_tutor_id TEXT;
  v_tutor RECORD;
  v_headline TEXT;
  v_quote TEXT;
  v_summary TEXT;
  v_combined TEXT;
  v_changed_fields JSONB := '[]'::jsonb;
  v_changed BOOLEAN := FALSE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'يرجى تسجيل الدخول لتعديل بيانات الملف.';
  END IF;

  v_tutor_id := public.get_current_tutor_id();
  IF v_tutor_id IS NULL THEN
    RAISE EXCEPTION 'حسابك غير مرتبط بملف معلم معتمد في منصة شاطر.';
  END IF;

  PERFORM public.acquire_tutor_lock(v_tutor_id);

  SELECT * INTO v_tutor
  FROM public.tutors
  WHERE id = v_tutor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ملف المعلم غير موجود.';
  END IF;

  v_headline := NULLIF(BTRIM(COALESCE(p_headline, '')), '');
  v_quote := NULLIF(BTRIM(COALESCE(p_help_child_quote, '')), '');
  v_summary := NULLIF(BTRIM(COALESCE(p_help_child_summary, '')), '');

  IF v_headline IS NULL OR char_length(v_headline) < 10 OR char_length(v_headline) > 250 THEN
    RAISE EXCEPTION 'الجملة القصيرة عنك مطلوبة، ويجب أن تكون بين 10 و 250 حرفًا.';
  END IF;

  IF v_quote IS NOT NULL AND (char_length(v_quote) < 5 OR char_length(v_quote) > 350) THEN
    RAISE EXCEPTION 'جملة مساعدة الطفل يجب أن تكون بين 5 و 350 حرفًا عند كتابتها.';
  END IF;

  IF v_summary IS NOT NULL AND (char_length(v_summary) < 20 OR char_length(v_summary) > 2500) THEN
    RAISE EXCEPTION 'النبذة عنك لولي الأمر يجب أن تكون بين 20 و 2500 حرفًا عند كتابتها.';
  END IF;

  v_combined := COALESCE(v_headline, '') || ' ' || COALESCE(v_quote, '') || ' ' || COALESCE(v_summary, '');
  IF v_combined ~* '(https?://|www\.|t\.me/|wa\.me/|@[a-z0-9_]{3,})'
     OR v_combined ~ '[0-9٠-٩]{8,}' THEN
    RAISE EXCEPTION 'ممنوع كتابة أرقام هاتف أو روابط أو حسابات تواصل داخل النصوص التعريفية.';
  END IF;

  IF COALESCE(v_tutor.headline, '') IS DISTINCT FROM COALESCE(v_headline, '') THEN
    v_changed_fields := v_changed_fields || jsonb_build_array('headline');
    v_changed := TRUE;
  END IF;

  IF COALESCE(v_tutor.help_child_quote, '') IS DISTINCT FROM COALESCE(v_quote, '') THEN
    v_changed_fields := v_changed_fields || jsonb_build_array('help_child_quote');
    v_changed := TRUE;
  END IF;

  IF COALESCE(v_tutor.help_child_summary, '') IS DISTINCT FROM COALESCE(v_summary, '') THEN
    v_changed_fields := v_changed_fields || jsonb_build_array('help_child_summary');
    v_changed := TRUE;
  END IF;

  IF v_changed THEN
    UPDATE public.tutors
    SET
      headline = v_headline,
      help_child_quote = COALESCE(v_quote, ''),
      help_child_summary = COALESCE(v_summary, ''),
      updated_at = NOW()
    WHERE id = v_tutor_id;

    INSERT INTO public.tutor_profile_edit_history (
      tutor_id,
      edited_by,
      source,
      old_headline,
      new_headline,
      old_help_child_quote,
      new_help_child_quote,
      old_help_child_summary,
      new_help_child_summary,
      changed_fields
    ) VALUES (
      v_tutor_id,
      v_user_id,
      'tutor_portal',
      v_tutor.headline,
      v_headline,
      v_tutor.help_child_quote,
      COALESCE(v_quote, ''),
      v_tutor.help_child_summary,
      COALESCE(v_summary, ''),
      v_changed_fields
    );
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'changed', v_changed,
    'tutor', jsonb_build_object(
      'id', v_tutor_id,
      'headline', v_headline,
      'helpChildQuote', COALESCE(v_quote, ''),
      'helpChildSummary', COALESCE(v_summary, '')
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_recent_tutor_profile_edits(
  p_limit INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'غير مصرح لك بعرض سجل تعديلات ملفات المعلمين.';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', h.id,
        'tutor_id', h.tutor_id,
        'tutor_name', COALESCE(t.name, h.tutor_id),
        'source', h.source,
        'old_headline', h.old_headline,
        'new_headline', h.new_headline,
        'old_help_child_quote', h.old_help_child_quote,
        'new_help_child_quote', h.new_help_child_quote,
        'old_help_child_summary', h.old_help_child_summary,
        'new_help_child_summary', h.new_help_child_summary,
        'changed_fields', h.changed_fields,
        'reverted_at', h.reverted_at,
        'reverted_by', h.reverted_by,
        'created_at', h.created_at
      )
      ORDER BY h.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT *
    FROM public.tutor_profile_edit_history
    ORDER BY created_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
  ) h
  LEFT JOIN public.tutors t ON t.id = h.tutor_id;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revert_tutor_profile_edit(
  p_history_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hist RECORD;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'غير مصرح لك باسترجاع تعديلات ملفات المعلمين.';
  END IF;

  SELECT * INTO v_hist
  FROM public.tutor_profile_edit_history
  WHERE id = p_history_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'سجل التعديل غير موجود.';
  END IF;

  IF v_hist.reverted_at IS NOT NULL THEN
    RAISE EXCEPTION 'تم استرجاع هذا التعديل مسبقاً.';
  END IF;

  UPDATE public.tutors
  SET
    headline = COALESCE(v_hist.old_headline, headline),
    help_child_quote = COALESCE(v_hist.old_help_child_quote, ''),
    help_child_summary = COALESCE(v_hist.old_help_child_summary, ''),
    updated_at = NOW()
  WHERE id = v_hist.tutor_id;

  UPDATE public.tutor_profile_edit_history
  SET
    reverted_at = NOW(),
    reverted_by = auth.uid()
  WHERE id = p_history_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'historyId', p_history_id,
    'tutorId', v_hist.tutor_id
  );
END;
$$;

-- ============================================================================
-- 3. Direct Self-Service Pricing (`tutor_update_profile_pricing`)
-- ============================================================================
-- Updates the tutor's single-session base price (`hourly_rate_min` & `hourly_rate_max`
-- unified to the single session price), `currency`, and `session_duration_minutes`.
-- Strictly preserves `is_published`, `verified_credentials`, `rating`, `reviews_count`,
-- and never modifies existing private slots or confirmed bookings.
CREATE OR REPLACE FUNCTION public.tutor_update_profile_pricing(
  p_session_price INTEGER,
  p_currency TEXT DEFAULT 'ج.م',
  p_session_duration_minutes INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_tutor_id TEXT;
  v_clean_currency TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'يرجى تسجيل الدخول لتعديل السعر ومدة الحصة.';
  END IF;

  v_tutor_id := public.get_current_tutor_id();
  IF v_tutor_id IS NULL THEN
    RAISE EXCEPTION 'حسابك غير مرتبط بملف معلم معتمد في منصة شاطر.';
  END IF;

  IF p_session_price IS NULL OR p_session_price <= 0 OR p_session_price > 100000 THEN
    RAISE EXCEPTION 'سعر الحصة الواحدة يجب أن يكون رقماً صحيحاً أكبر من صفر.';
  END IF;

  IF p_session_duration_minutes IS NULL OR p_session_duration_minutes < 30 OR p_session_duration_minutes > 120 THEN
    RAISE EXCEPTION 'مدة الحصة يجب أن تكون بين 30 و 120 دقيقة.';
  END IF;

  v_clean_currency := BTRIM(COALESCE(p_currency, 'ج.م'));
  IF v_clean_currency NOT IN ('ج.م', 'ر.س', 'د.إ', '$') THEN
    RAISE EXCEPTION 'العملة المختارة غير مدعومة حالياً.';
  END IF;

  PERFORM public.acquire_tutor_lock(v_tutor_id);

  UPDATE public.tutors
  SET
    hourly_rate_min = p_session_price,
    hourly_rate_max = p_session_price,
    currency = v_clean_currency,
    session_duration_minutes = p_session_duration_minutes,
    updated_at = NOW()
  WHERE id = v_tutor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ملف المعلم غير موجود.';
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'tutor', jsonb_build_object(
      'id', v_tutor_id,
      'hourlyRateMin', p_session_price,
      'hourlyRateMax', p_session_price,
      'currency', v_clean_currency,
      'sessionDurationMinutes', p_session_duration_minutes
    )
  );
END;
$$;

-- ============================================================================
-- 4. Direct Self-Service Avatar (`tutor_update_profile_avatar`)
-- ============================================================================
-- Verifies that the uploaded file exists in `storage.objects` under
-- `bucket_id = 'tutor-avatars'` and path `self-service/<auth.uid()>/<filename>`,
-- updates `tutors.avatar_url` directly without altering `is_published`, and
-- supersedes any old pending avatar drafts for this tutor.
CREATE OR REPLACE FUNCTION public.tutor_update_profile_avatar(
  p_storage_path TEXT,
  p_public_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_user_id UUID;
  v_tutor_id TEXT;
  v_clean_path TEXT;
  v_clean_url TEXT;
  v_expected_prefix TEXT;
  v_obj_exists BOOLEAN := FALSE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'يرجى تسجيل الدخول لتحديث الصورة الشخصية.';
  END IF;

  v_tutor_id := public.get_current_tutor_id();
  IF v_tutor_id IS NULL THEN
    RAISE EXCEPTION 'حسابك غير مرتبط بملف معلم معتمد في منصة شاطر.';
  END IF;

  v_clean_path := BTRIM(COALESCE(p_storage_path, ''));
  v_expected_prefix := 'self-service/' || v_user_id::text || '/';

  IF v_clean_path = ''
     OR strpos(v_clean_path, '..') > 0
     OR strpos(v_clean_path, v_expected_prefix) <> 1
     OR v_clean_path !~* ('^self-service/' || v_user_id::text || '/[a-z0-9._-]+\.(jpg|jpeg|png|webp)$') THEN
    RAISE EXCEPTION 'مسار ملف الصورة غير صالح أو لا يخص حسابك.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = 'tutor-avatars'
      AND o.name = v_clean_path
  ) INTO v_obj_exists;

  IF NOT v_obj_exists THEN
    RAISE EXCEPTION 'لم يتم العثور على ملف الصورة المرفوعة في وحدة التخزين. يرجى إعادة رفع الصورة والمحاولة مرة أخرى.';
  END IF;

  v_clean_url := BTRIM(COALESCE(p_public_url, ''));
  IF v_clean_url = ''
     OR v_clean_url !~* '^https?://'
     OR strpos(v_clean_url, '/storage/v1/object/public/tutor-avatars/' || v_clean_path) = 0 THEN
    RAISE EXCEPTION 'الرابط العام للصورة غير صالح أو لا يطابق المسار المرفوع.';
  END IF;

  PERFORM public.acquire_tutor_lock(v_tutor_id);

  UPDATE public.tutors
  SET
    avatar_url = v_clean_url,
    updated_at = NOW()
  WHERE id = v_tutor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ملف المعلم غير موجود.';
  END IF;

  -- Mark any old pending avatar drafts as approved/superseded so they never block future edits
  UPDATE public.tutor_profile_drafts
  SET
    status = 'approved',
    reviewed_at = NOW(),
    updated_at = NOW()
  WHERE tutor_id = v_tutor_id
    AND status IN ('pending_review', 'needs_revision', 'draft');

  RETURN jsonb_build_object(
    'success', TRUE,
    'avatarUrl', v_clean_url,
    'storagePath', v_clean_path
  );
END;
$$;

-- ============================================================================
-- 5. Trial Slot Management (`tutor_create_slot` & `tutor_update_trial_slot`)
--    + Dubai Timezone Support (`Asia/Dubai`) & Cross-Schedule Conflict Checks
-- ============================================================================
CREATE OR REPLACE FUNCTION public.tutor_create_slot(
  p_slot_date DATE,
  p_start_time TIME,
  p_end_time TIME,
  p_timezone TEXT DEFAULT 'Africa/Cairo'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tutor_id TEXT;
  v_new_id UUID;
  v_tz TEXT;
  v_start_at TIMESTAMPTZ;
  v_end_at TIMESTAMPTZ;
  v_conflict TEXT;
BEGIN
  v_tutor_id := public.get_current_tutor_id();
  IF v_tutor_id IS NULL THEN
    RAISE EXCEPTION 'غير مصرح لك بإضافة مواعيد.';
  END IF;

  PERFORM public.acquire_tutor_lock(v_tutor_id);

  v_tz := COALESCE(NULLIF(BTRIM(p_timezone), ''), 'Africa/Cairo');
  IF v_tz NOT IN ('Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai') THEN
    RAISE EXCEPTION 'المنطقة الزمنية غير مدعومة. يرجى اختيار توقيت القاهرة أو الرياض أو دبي.';
  END IF;

  IF p_end_time <= p_start_time THEN
    RAISE EXCEPTION 'وقت النهاية يجب أن يكون بعد وقت البداية.';
  END IF;

  v_start_at := ((p_slot_date::text || ' ' || p_start_time::text)::timestamp) AT TIME ZONE v_tz;
  v_end_at := ((p_slot_date::text || ' ' || p_end_time::text)::timestamp) AT TIME ZONE v_tz;

  IF v_start_at <= NOW() THEN
    RAISE EXCEPTION 'لا يمكن إضافة موعد في وقت سابق من الآن.';
  END IF;

  IF (v_end_at - v_start_at) <> INTERVAL '20 minutes' THEN
    RAISE EXCEPTION 'مدة الحصة التجريبية في نظام شاطر هي 20 دقيقة بالضبط.';
  END IF;

  v_conflict := public.internal_check_tutor_time_conflict(
    v_tutor_id,
    v_start_at,
    v_end_at,
    NULL,
    NULL,
    NULL
  );

  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'يوجد تعارض زمني لهذا الموعد مع %.', v_conflict;
  END IF;

  INSERT INTO public.tutor_available_slots (
    tutor_id,
    slot_date,
    start_time,
    end_time,
    timezone,
    is_available,
    is_booked,
    admin_suspended
  ) VALUES (
    v_tutor_id,
    p_slot_date,
    p_start_time,
    p_end_time,
    v_tz,
    TRUE,
    FALSE,
    FALSE
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tutor_update_trial_slot(
  p_slot_id UUID,
  p_slot_date DATE,
  p_start_time TIME,
  p_end_time TIME,
  p_timezone TEXT DEFAULT 'Africa/Cairo'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tutor_id TEXT;
  v_slot RECORD;
  v_tz TEXT;
  v_start_at TIMESTAMPTZ;
  v_end_at TIMESTAMPTZ;
  v_conflict TEXT;
  v_has_active_booking BOOLEAN := FALSE;
BEGIN
  v_tutor_id := public.get_current_tutor_id();
  IF v_tutor_id IS NULL THEN
    RAISE EXCEPTION 'غير مصرح لك بتعديل المواعيد.';
  END IF;

  PERFORM public.acquire_tutor_lock(v_tutor_id);

  SELECT * INTO v_slot
  FROM public.tutor_available_slots
  WHERE id = p_slot_id AND tutor_id = v_tutor_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الموعد التجريبي غير موجود أو لا يتبع حسابك.';
  END IF;

  IF COALESCE(v_slot.admin_suspended, FALSE) = TRUE THEN
    RAISE EXCEPTION 'لا يمكن تعديل موعد موقوف إدارياً.';
  END IF;

  IF COALESCE(v_slot.is_booked, FALSE) = TRUE THEN
    RAISE EXCEPTION 'لا يمكن تعديل موعد تجريبي محجوز لطالب.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.trial_bookings tb
    WHERE tb.slot_id = p_slot_id
      AND tb.booking_status IN ('pending', 'confirmed', 'completed')
  ) INTO v_has_active_booking;

  IF v_has_active_booking THEN
    RAISE EXCEPTION 'لا يمكن تعديل موعد تجريبي مرتبط بطلب حجز قائم.';
  END IF;

  v_tz := COALESCE(NULLIF(BTRIM(p_timezone), ''), COALESCE(v_slot.timezone, 'Africa/Cairo'));
  IF v_tz NOT IN ('Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai') THEN
    RAISE EXCEPTION 'المنطقة الزمنية غير مدعومة. يرجى اختيار توقيت القاهرة أو الرياض أو دبي.';
  END IF;

  IF p_end_time <= p_start_time THEN
    RAISE EXCEPTION 'وقت النهاية يجب أن يكون بعد وقت البداية.';
  END IF;

  v_start_at := ((p_slot_date::text || ' ' || p_start_time::text)::timestamp) AT TIME ZONE v_tz;
  v_end_at := ((p_slot_date::text || ' ' || p_end_time::text)::timestamp) AT TIME ZONE v_tz;

  IF v_start_at <= NOW() THEN
    RAISE EXCEPTION 'لا يمكن نقل الموعد التجريبي إلى وقت سابق من الآن.';
  END IF;

  IF (v_end_at - v_start_at) <> INTERVAL '20 minutes' THEN
    RAISE EXCEPTION 'مدة الحصة التجريبية المعتمدة هي 20 دقيقة بالضبط.';
  END IF;

  v_conflict := public.internal_check_tutor_time_conflict(
    v_tutor_id,
    v_start_at,
    v_end_at,
    p_slot_id,
    NULL,
    NULL
  );

  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'يوجد تعارض زمني للموعد المعدل مع %.', v_conflict;
  END IF;

  UPDATE public.tutor_available_slots
  SET
    slot_date = p_slot_date,
    start_time = p_start_time,
    end_time = p_end_time,
    timezone = v_tz
  WHERE id = p_slot_id AND tutor_id = v_tutor_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'slotId', p_slot_id
  );
END;
$$;

-- ============================================================================
-- 6. Extend Timezone Validation in Private Slots & Group Sessions to Include
--    `Asia/Dubai` alongside `Africa/Cairo` and `Asia/Riyadh`
-- ============================================================================
CREATE OR REPLACE FUNCTION public.tutor_create_private_slots(
  p_specialization_label TEXT,
  p_duration_minutes INTEGER,
  p_price_amount INTEGER,
  p_currency TEXT DEFAULT 'ج.م',
  p_slots JSONB DEFAULT '[]'::jsonb,
  p_offering_course_option_id TEXT DEFAULT NULL,
  p_quran_age_group_id TEXT DEFAULT NULL,
  p_quran_level_id TEXT DEFAULT NULL,
  p_timezone TEXT DEFAULT 'Africa/Cairo',
  p_allowed_specializations JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tutor_id TEXT;
  v_tz TEXT;
  v_slot JSONB;
  v_date DATE;
  v_start TIME;
  v_end TIME;
  v_start_at TIMESTAMPTZ;
  v_end_at TIMESTAMPTZ;
  v_conflict TEXT;
  v_inserted_count INTEGER := 0;
  v_validated_specs JSONB;
  v_primary_spec JSONB;
  v_primary_label TEXT;
  v_primary_course_id TEXT;
  v_primary_age_id TEXT;
  v_primary_level_id TEXT;
BEGIN
  v_tutor_id := public.get_current_tutor_id();
  IF v_tutor_id IS NULL THEN
    RAISE EXCEPTION 'غير مصرح لك بإضافة مواعيد خاصة.';
  END IF;

  PERFORM public.acquire_tutor_lock(v_tutor_id);

  IF p_duration_minutes IS NULL OR p_duration_minutes < 30 OR p_duration_minutes > 120 THEN
    RAISE EXCEPTION 'مدة الحصة الخاصة يجب أن تكون بين 30 و 120 دقيقة.';
  END IF;

  IF p_price_amount IS NULL OR p_price_amount < 0 THEN
    RAISE EXCEPTION 'سعر الحصة الخاصة يجب أن يكون قيمة موجبة.';
  END IF;

  v_tz := COALESCE(NULLIF(BTRIM(p_timezone), ''), 'Africa/Cairo');
  IF v_tz NOT IN ('Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai') THEN
    RAISE EXCEPTION 'المنطقة الزمنية غير مدعومة. يرجى اختيار توقيت القاهرة أو الرياض أو دبي.';
  END IF;

  IF jsonb_typeof(p_slots) <> 'array' OR jsonb_array_length(p_slots) = 0 THEN
    RAISE EXCEPTION 'يرجى تحديد موعد واحد على الأقل.';
  END IF;

  IF jsonb_array_length(p_slots) > 60 THEN
    RAISE EXCEPTION 'لا يمكن إضافة أكثر من 60 موعداً في المرة الواحدة.';
  END IF;

  v_validated_specs := public.internal_validate_tutor_slot_specializations(
    v_tutor_id,
    p_allowed_specializations,
    p_offering_course_option_id,
    p_quran_age_group_id,
    p_quran_level_id
  );

  v_primary_spec := v_validated_specs -> 0;
  v_primary_label := v_primary_spec ->> 'label';
  v_primary_course_id := NULLIF(BTRIM(COALESCE(v_primary_spec ->> 'courseOptionId', '')), '');
  v_primary_age_id := NULLIF(BTRIM(COALESCE(v_primary_spec ->> 'ageGroupId', '')), '');
  v_primary_level_id := NULLIF(BTRIM(COALESCE(v_primary_spec ->> 'levelId', '')), '');

  FOR v_slot IN SELECT * FROM jsonb_array_elements(p_slots)
  LOOP
    v_date := (v_slot ->> 'date')::DATE;
    v_start := (v_slot ->> 'startTime')::TIME;
    v_end := (v_slot ->> 'endTime')::TIME;

    IF v_end <= v_start THEN
      RAISE EXCEPTION 'وقت النهاية يجب أن يكون بعد وقت البداية في تاريخ %.', v_date;
    END IF;

    v_start_at := ((v_date::text || ' ' || v_start::text)::timestamp) AT TIME ZONE v_tz;
    v_end_at := ((v_date::text || ' ' || v_end::text)::timestamp) AT TIME ZONE v_tz;

    IF v_start_at <= NOW() THEN
      RAISE EXCEPTION 'لا يمكن إضافة موعد خاص في وقت سابق من الآن (% %).', v_date, v_start;
    END IF;

    IF EXTRACT(EPOCH FROM (v_end_at - v_start_at)) / 60 <> p_duration_minutes THEN
      RAISE EXCEPTION 'الفرق بين وقت البداية والنهاية في تاريخ % لا يطابق مدة الحصة (% دقيقة).', v_date, p_duration_minutes;
    END IF;

    v_conflict := public.internal_check_tutor_time_conflict(
      v_tutor_id,
      v_start_at,
      v_end_at,
      NULL,
      NULL,
      NULL
    );

    IF v_conflict IS NOT NULL THEN
      RAISE EXCEPTION 'يوجد تعارض زمني في تاريخ % الساعة % مع %.', v_date, v_start, v_conflict;
    END IF;

    INSERT INTO public.tutor_private_slots (
      tutor_id,
      offering_course_option_id,
      quran_age_group_id,
      quran_level_id,
      specialization_label,
      allowed_specializations,
      slot_date,
      start_time,
      end_time,
      timezone,
      start_at_utc,
      end_at_utc,
      duration_minutes,
      price_amount,
      currency,
      is_available,
      admin_suspended,
      is_booked
    ) VALUES (
      v_tutor_id,
      v_primary_course_id,
      v_primary_age_id,
      v_primary_level_id,
      v_primary_label,
      v_validated_specs,
      v_date,
      v_start,
      v_end,
      v_tz,
      v_start_at,
      v_end_at,
      p_duration_minutes,
      p_price_amount,
      COALESCE(NULLIF(BTRIM(p_currency), ''), 'ج.م'),
      TRUE,
      FALSE,
      FALSE
    );

    v_inserted_count := v_inserted_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', TRUE,
    'insertedCount', v_inserted_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.tutor_update_private_slot(
  p_slot_id UUID,
  p_slot_date DATE,
  p_start_time TIME,
  p_end_time TIME,
  p_duration_minutes INTEGER,
  p_price_amount INTEGER,
  p_timezone TEXT DEFAULT 'Africa/Cairo',
  p_offering_course_option_id TEXT DEFAULT NULL,
  p_quran_age_group_id TEXT DEFAULT NULL,
  p_quran_level_id TEXT DEFAULT NULL,
  p_allowed_specializations JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tutor_id TEXT;
  v_slot RECORD;
  v_tz TEXT;
  v_start_at TIMESTAMPTZ;
  v_end_at TIMESTAMPTZ;
  v_conflict TEXT;
  v_has_active_booking BOOLEAN;
  v_validated_specs JSONB;
  v_primary_spec JSONB;
  v_primary_label TEXT;
  v_primary_course_id TEXT;
  v_primary_age_id TEXT;
  v_primary_level_id TEXT;
BEGIN
  v_tutor_id := public.get_current_tutor_id();
  IF v_tutor_id IS NULL THEN
    RAISE EXCEPTION 'غير مصرح لك بتعديل المواعيد الخاصة.';
  END IF;

  PERFORM public.acquire_tutor_lock(v_tutor_id);

  SELECT * INTO v_slot
  FROM public.tutor_private_slots
  WHERE id = p_slot_id AND tutor_id = v_tutor_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'الموعد غير موجود أو لا يتبع حسابك.';
  END IF;

  IF v_slot.admin_suspended = TRUE THEN
    RAISE EXCEPTION 'لا يمكن تعديل موعد موقوف إدارياً.';
  END IF;

  IF v_slot.is_booked = TRUE THEN
    RAISE EXCEPTION 'لا يمكن تعديل موعد محجوز لطالب.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tutor_private_bookings
    WHERE slot_id = p_slot_id AND booking_status IN ('pending', 'confirmed', 'completed')
  ) INTO v_has_active_booking;

  IF v_has_active_booking THEN
    RAISE EXCEPTION 'لا يمكن تعديل موعد مرتبط بحجز نشط.';
  END IF;

  IF p_duration_minutes IS NULL OR p_duration_minutes < 30 OR p_duration_minutes > 120 THEN
    RAISE EXCEPTION 'مدة الحصة الخاصة يجب أن تكون بين 30 و 120 دقيقة.';
  END IF;

  IF p_price_amount IS NULL OR p_price_amount < 0 THEN
    RAISE EXCEPTION 'سعر الحصة الخاصة يجب أن يكون قيمة موجبة.';
  END IF;

  v_tz := COALESCE(NULLIF(BTRIM(p_timezone), ''), v_slot.timezone, 'Africa/Cairo');
  IF v_tz NOT IN ('Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai') THEN
    RAISE EXCEPTION 'المنطقة الزمنية غير مدعومة. يرجى اختيار توقيت القاهرة أو الرياض أو دبي.';
  END IF;

  IF p_end_time <= p_start_time THEN
    RAISE EXCEPTION 'وقت النهاية يجب أن يكون بعد وقت البداية.';
  END IF;

  v_start_at := ((p_slot_date::text || ' ' || p_start_time::text)::timestamp) AT TIME ZONE v_tz;
  v_end_at := ((p_slot_date::text || ' ' || p_end_time::text)::timestamp) AT TIME ZONE v_tz;

  IF v_start_at <= NOW() THEN
    RAISE EXCEPTION 'لا يمكن نقل الموعد إلى وقت سابق من الآن.';
  END IF;

  IF EXTRACT(EPOCH FROM (v_end_at - v_start_at)) / 60 <> p_duration_minutes THEN
    RAISE EXCEPTION 'الفرق بين وقت البداية والنهاية لا يطابق مدة الحصة (% دقيقة).', p_duration_minutes;
  END IF;

  IF (p_allowed_specializations IS NOT NULL AND jsonb_typeof(p_allowed_specializations) = 'array' AND jsonb_array_length(p_allowed_specializations) > 0)
     OR p_offering_course_option_id IS NOT NULL
     OR p_quran_age_group_id IS NOT NULL
     OR p_quran_level_id IS NOT NULL THEN
    v_validated_specs := public.internal_validate_tutor_slot_specializations(
      v_tutor_id,
      p_allowed_specializations,
      p_offering_course_option_id,
      p_quran_age_group_id,
      p_quran_level_id
    );
  ELSE
    v_validated_specs := public.internal_validate_tutor_slot_specializations(
      v_tutor_id,
      v_slot.allowed_specializations,
      v_slot.offering_course_option_id,
      v_slot.quran_age_group_id,
      v_slot.quran_level_id
    );
  END IF;

  v_primary_spec := v_validated_specs -> 0;
  v_primary_label := v_primary_spec ->> 'label';
  v_primary_course_id := NULLIF(BTRIM(COALESCE(v_primary_spec ->> 'courseOptionId', '')), '');
  v_primary_age_id := NULLIF(BTRIM(COALESCE(v_primary_spec ->> 'ageGroupId', '')), '');
  v_primary_level_id := NULLIF(BTRIM(COALESCE(v_primary_spec ->> 'levelId', '')), '');

  v_conflict := public.internal_check_tutor_time_conflict(
    v_tutor_id,
    v_start_at,
    v_end_at,
    NULL,
    p_slot_id,
    NULL
  );

  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'يوجد تعارض زمني للموعد المعدل مع %.', v_conflict;
  END IF;

  UPDATE public.tutor_private_slots
  SET
    offering_course_option_id = v_primary_course_id,
    quran_age_group_id = v_primary_age_id,
    quran_level_id = v_primary_level_id,
    specialization_label = v_primary_label,
    allowed_specializations = v_validated_specs,
    slot_date = p_slot_date,
    start_time = p_start_time,
    end_time = p_end_time,
    timezone = v_tz,
    start_at_utc = v_start_at,
    end_at_utc = v_end_at,
    duration_minutes = p_duration_minutes,
    price_amount = p_price_amount,
    updated_at = NOW()
  WHERE id = p_slot_id AND tutor_id = v_tutor_id;

  RETURN jsonb_build_object('success', TRUE);
END;
$$;

-- Allow Asia/Dubai in tutor_create_group and tutor_update_group as well
CREATE OR REPLACE FUNCTION public.tutor_create_group(
  p_title TEXT,
  p_description TEXT,
  p_specialization_label TEXT,
  p_max_students INTEGER,
  p_price_per_student INTEGER,
  p_price_type TEXT DEFAULT 'full_package',
  p_currency TEXT DEFAULT 'ج.م',
  p_sessions_count INTEGER DEFAULT 4,
  p_session_duration_minutes INTEGER DEFAULT 60,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_weekly_schedule_summary TEXT DEFAULT '',
  p_sessions JSONB DEFAULT '[]'::jsonb,
  p_offering_course_option_id TEXT DEFAULT NULL,
  p_quran_age_group_id TEXT DEFAULT NULL,
  p_quran_level_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tutor_id TEXT;
  v_new_group_id UUID;
  v_canonical_label TEXT;
  v_sess JSONB;
  v_sess_num INTEGER;
  v_sess_date DATE;
  v_start TIME;
  v_end TIME;
  v_tz TEXT;
  v_start_at TIMESTAMPTZ;
  v_end_at TIMESTAMPTZ;
  v_conflict TEXT;
  v_min_date DATE := NULL;
  v_max_date DATE := NULL;
BEGIN
  v_tutor_id := public.get_current_tutor_id();
  IF v_tutor_id IS NULL THEN
    RAISE EXCEPTION 'غير مصرح لك بإنشاء مجموعة تعليمية.';
  END IF;

  PERFORM public.acquire_tutor_lock(v_tutor_id);

  IF BTRIM(COALESCE(p_title, '')) = '' THEN
    RAISE EXCEPTION 'اسم المجموعة مطلوب.';
  END IF;

  IF p_max_students < 2 OR p_max_students > 20 THEN
    RAISE EXCEPTION 'الحد الأقصى للطلاب في المجموعة يجب أن يكون بين 2 و 20 طالباً.';
  END IF;

  IF p_price_per_student < 0 THEN
    RAISE EXCEPTION 'سعر اشتراك الطالب يجب أن يكون قيمة موجبة.';
  END IF;

  IF p_price_type NOT IN ('per_session', 'full_package') THEN
    RAISE EXCEPTION 'نوع التسعير غير صالح.';
  END IF;

  IF p_sessions_count < 1 OR p_sessions_count > 48 THEN
    RAISE EXCEPTION 'عدد حصص المجموعة يجب أن يكون بين 1 و 48 حصة.';
  END IF;

  IF p_session_duration_minutes < 30 OR p_session_duration_minutes > 120 THEN
    RAISE EXCEPTION 'مدة حصة المجموعة يجب أن تكون بين 30 و 120 دقيقة.';
  END IF;

  IF jsonb_typeof(p_sessions) <> 'array' OR jsonb_array_length(p_sessions) <> p_sessions_count THEN
    RAISE EXCEPTION 'يجب إرسال جدول اللقاءات الفعلي مطابقاً لعدد الحصص المحدد (% حصة).', p_sessions_count;
  END IF;

  v_canonical_label := public.internal_resolve_and_verify_tutor_specialization(
    v_tutor_id,
    p_offering_course_option_id,
    p_quran_age_group_id,
    p_quran_level_id
  );

  INSERT INTO public.tutor_groups (
    tutor_id,
    title,
    description,
    offering_course_option_id,
    quran_age_group_id,
    quran_level_id,
    specialization_label,
    max_students,
    enrolled_students,
    price_per_student,
    price_type,
    currency,
    sessions_count,
    session_duration_minutes,
    start_date,
    end_date,
    weekly_schedule_summary,
    review_status,
    admin_suspended,
    status,
    is_published
  ) VALUES (
    v_tutor_id,
    BTRIM(p_title),
    BTRIM(COALESCE(p_description, '')),
    p_offering_course_option_id,
    p_quran_age_group_id,
    p_quran_level_id,
    v_canonical_label,
    p_max_students,
    0,
    p_price_per_student,
    p_price_type,
    COALESCE(NULLIF(BTRIM(p_currency), ''), 'ج.م'),
    p_sessions_count,
    p_session_duration_minutes,
    COALESCE(p_start_date, CURRENT_DATE + 1),
    p_end_date,
    BTRIM(COALESCE(p_weekly_schedule_summary, '')),
    'approved',
    FALSE,
    'open',
    TRUE
  )
  RETURNING id INTO v_new_group_id;

  v_sess_num := 0;
  FOR v_sess IN SELECT * FROM jsonb_array_elements(p_sessions)
  LOOP
    v_sess_num := v_sess_num + 1;
    v_sess_date := (v_sess ->> 'sessionDate')::DATE;
    v_start := (v_sess ->> 'startTime')::TIME;
    v_end := (v_sess ->> 'endTime')::TIME;
    v_tz := COALESCE(NULLIF(BTRIM(v_sess ->> 'timezone'), ''), 'Africa/Cairo');

    IF v_tz NOT IN ('Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai') THEN
      RAISE EXCEPTION 'المنطقة الزمنية غير مدعومة في اللقاء رقم %.', v_sess_num;
    END IF;

    IF v_end <= v_start THEN
      RAISE EXCEPTION 'وقت النهاية يجب أن يكون بعد وقت البداية في اللقاء رقم %.', v_sess_num;
    END IF;

    v_start_at := ((v_sess_date::text || ' ' || v_start::text)::timestamp) AT TIME ZONE v_tz;
    v_end_at := ((v_sess_date::text || ' ' || v_end::text)::timestamp) AT TIME ZONE v_tz;

    IF v_start_at <= NOW() THEN
      RAISE EXCEPTION 'لا يمكن جدولة اللقاء رقم % في وقت سابق من الآن (% %).', v_sess_num, v_sess_date, v_start;
    END IF;

    IF EXTRACT(EPOCH FROM (v_end_at - v_start_at)) / 60 <> p_session_duration_minutes THEN
      RAISE EXCEPTION 'مدة اللقاء رقم % في تاريخ % لا تطابق مدة حصة المجموعة (% دقيقة).', v_sess_num, v_sess_date, p_session_duration_minutes;
    END IF;

    v_conflict := public.internal_check_tutor_time_conflict(
      v_tutor_id,
      v_start_at,
      v_end_at,
      NULL,
      NULL,
      NULL
    );

    IF v_conflict IS NOT NULL THEN
      RAISE EXCEPTION 'تعارض زمني في اللقاء رقم % بتاريخ % الساعة % مع %.', v_sess_num, v_sess_date, v_start, v_conflict;
    END IF;

    INSERT INTO public.tutor_group_sessions (
      group_id,
      tutor_id,
      session_number,
      session_date,
      start_time,
      end_time,
      timezone,
      start_at_utc,
      end_at_utc,
      title
    ) VALUES (
      v_new_group_id,
      v_tutor_id,
      v_sess_num,
      v_sess_date,
      v_start,
      v_end,
      v_tz,
      v_start_at,
      v_end_at,
      COALESCE(NULLIF(BTRIM(v_sess ->> 'title'), ''), 'اللقاء ' || v_sess_num)
    );

    IF v_min_date IS NULL OR v_sess_date < v_min_date THEN
      v_min_date := v_sess_date;
    END IF;
    IF v_max_date IS NULL OR v_sess_date > v_max_date THEN
      v_max_date := v_sess_date;
    END IF;
  END LOOP;

  UPDATE public.tutor_groups
  SET
    start_date = COALESCE(v_min_date, start_date),
    end_date = COALESCE(v_max_date, end_date)
  WHERE id = v_new_group_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'groupId', v_new_group_id,
    'reviewStatus', 'approved',
    'isPublished', TRUE
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.tutor_update_group(
  p_group_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_max_students INTEGER,
  p_price_per_student INTEGER,
  p_price_type TEXT,
  p_currency TEXT,
  p_sessions_count INTEGER,
  p_session_duration_minutes INTEGER,
  p_start_date DATE,
  p_end_date DATE,
  p_weekly_schedule_summary TEXT,
  p_sessions JSONB,
  p_offering_course_option_id TEXT DEFAULT NULL,
  p_quran_age_group_id TEXT DEFAULT NULL,
  p_quran_level_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tutor_id TEXT;
  v_group RECORD;
  v_canonical_label TEXT;
  v_sess JSONB;
  v_sess_num INTEGER;
  v_sess_date DATE;
  v_start TIME;
  v_end TIME;
  v_tz TEXT;
  v_start_at TIMESTAMPTZ;
  v_end_at TIMESTAMPTZ;
  v_conflict TEXT;
  v_min_date DATE := NULL;
  v_max_date DATE := NULL;
  v_has_enrollments BOOLEAN;
BEGIN
  v_tutor_id := public.get_current_tutor_id();
  IF v_tutor_id IS NULL THEN
    RAISE EXCEPTION 'غير مصرح لك بتعديل المجموعة.';
  END IF;

  PERFORM public.acquire_tutor_lock(v_tutor_id);

  SELECT * INTO v_group
  FROM public.tutor_groups
  WHERE id = p_group_id AND tutor_id = v_tutor_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'المجموعة غير موجودة أو لا تتبع حسابك.';
  END IF;

  IF v_group.admin_suspended = TRUE THEN
    RAISE EXCEPTION 'لا يمكن تعديل مجموعة موقوفة إدارياً. يرجى مراجعة الإدارة.';
  END IF;

  IF v_group.enrolled_students > 0 THEN
    RAISE EXCEPTION 'لا يمكن تعديل جدول أو تسعير مجموعة بها طلاب مشتركين بالفعل.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tutor_group_enrollments
    WHERE group_id = p_group_id AND enrollment_status IN ('pending', 'confirmed', 'completed')
  ) INTO v_has_enrollments;

  IF v_has_enrollments THEN
    RAISE EXCEPTION 'لا يمكن تعديل مجموعة مرتبطة بطلبات اشتراك قائمة.';
  END IF;

  IF BTRIM(COALESCE(p_title, '')) = '' THEN
    RAISE EXCEPTION 'اسم المجموعة مطلوب.';
  END IF;

  IF p_max_students < 2 OR p_max_students > 20 THEN
    RAISE EXCEPTION 'الحد الأقصى للطلاب يجب أن يكون بين 2 و 20 طالباً.';
  END IF;

  IF p_price_per_student < 0 THEN
    RAISE EXCEPTION 'سعر الاشتراك يجب أن يكون قيمة موجبة.';
  END IF;

  IF p_price_type NOT IN ('per_session', 'full_package') THEN
    RAISE EXCEPTION 'نوع التسعير غير صالح.';
  END IF;

  IF p_sessions_count < 1 OR p_sessions_count > 48 THEN
    RAISE EXCEPTION 'عدد الحصص يجب أن يكون بين 1 و 48 حصة.';
  END IF;

  IF p_session_duration_minutes < 30 OR p_session_duration_minutes > 120 THEN
    RAISE EXCEPTION 'مدة الحصة يجب أن تكون بين 30 و 120 دقيقة.';
  END IF;

  IF jsonb_typeof(p_sessions) <> 'array' OR jsonb_array_length(p_sessions) <> p_sessions_count THEN
    RAISE EXCEPTION 'جدول اللقاءات يجب أن يطابق عدد الحصص المحدد (% حصة).', p_sessions_count;
  END IF;

  v_canonical_label := public.internal_resolve_and_verify_tutor_specialization(
    v_tutor_id,
    COALESCE(p_offering_course_option_id, v_group.offering_course_option_id),
    COALESCE(p_quran_age_group_id, v_group.quran_age_group_id),
    COALESCE(p_quran_level_id, v_group.quran_level_id)
  );

  DELETE FROM public.tutor_group_sessions WHERE group_id = p_group_id;

  v_sess_num := 0;
  FOR v_sess IN SELECT * FROM jsonb_array_elements(p_sessions)
  LOOP
    v_sess_num := v_sess_num + 1;
    v_sess_date := (v_sess ->> 'sessionDate')::DATE;
    v_start := (v_sess ->> 'startTime')::TIME;
    v_end := (v_sess ->> 'endTime')::TIME;
    v_tz := COALESCE(NULLIF(BTRIM(v_sess ->> 'timezone'), ''), 'Africa/Cairo');

    IF v_tz NOT IN ('Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai') THEN
      RAISE EXCEPTION 'المنطقة الزمنية غير مدعومة في اللقاء رقم %.', v_sess_num;
    END IF;

    IF v_end <= v_start THEN
      RAISE EXCEPTION 'وقت النهاية يجب أن يكون بعد وقت البداية في اللقاء رقم %.', v_sess_num;
    END IF;

    v_start_at := ((v_sess_date::text || ' ' || v_start::text)::timestamp) AT TIME ZONE v_tz;
    v_end_at := ((v_sess_date::text || ' ' || v_end::text)::timestamp) AT TIME ZONE v_tz;

    IF v_start_at <= NOW() THEN
      RAISE EXCEPTION 'لا يمكن جدولة اللقاء رقم % في وقت سابق من الآن.', v_sess_num;
    END IF;

    IF EXTRACT(EPOCH FROM (v_end_at - v_start_at)) / 60 <> p_session_duration_minutes THEN
      RAISE EXCEPTION 'مدة اللقاء رقم % لا تطابق مدة حصة المجموعة (% دقيقة).', v_sess_num, p_session_duration_minutes;
    END IF;

    v_conflict := public.internal_check_tutor_time_conflict(
      v_tutor_id,
      v_start_at,
      v_end_at,
      NULL,
      NULL,
      p_group_id
    );

    IF v_conflict IS NOT NULL THEN
      RAISE EXCEPTION 'تعارض زمني في اللقاء رقم % بتاريخ % الساعة % مع %.', v_sess_num, v_sess_date, v_start, v_conflict;
    END IF;

    INSERT INTO public.tutor_group_sessions (
      group_id,
      tutor_id,
      session_number,
      session_date,
      start_time,
      end_time,
      timezone,
      start_at_utc,
      end_at_utc,
      title
    ) VALUES (
      p_group_id,
      v_tutor_id,
      v_sess_num,
      v_sess_date,
      v_start,
      v_end,
      v_tz,
      v_start_at,
      v_end_at,
      COALESCE(NULLIF(BTRIM(v_sess ->> 'title'), ''), 'اللقاء ' || v_sess_num)
    );

    IF v_min_date IS NULL OR v_sess_date < v_min_date THEN
      v_min_date := v_sess_date;
    END IF;
    IF v_max_date IS NULL OR v_sess_date > v_max_date THEN
      v_max_date := v_sess_date;
    END IF;
  END LOOP;

  UPDATE public.tutor_groups
  SET
    title = BTRIM(p_title),
    description = BTRIM(COALESCE(p_description, '')),
    offering_course_option_id = COALESCE(p_offering_course_option_id, offering_course_option_id),
    quran_age_group_id = COALESCE(p_quran_age_group_id, quran_age_group_id),
    quran_level_id = COALESCE(p_quran_level_id, quran_level_id),
    specialization_label = v_canonical_label,
    max_students = p_max_students,
    price_per_student = p_price_per_student,
    price_type = p_price_type,
    currency = COALESCE(NULLIF(BTRIM(p_currency), ''), 'ج.م'),
    sessions_count = p_sessions_count,
    session_duration_minutes = p_session_duration_minutes,
    start_date = COALESCE(v_min_date, p_start_date),
    end_date = COALESCE(v_max_date, p_end_date),
    weekly_schedule_summary = BTRIM(COALESCE(p_weekly_schedule_summary, '')),
    review_status = 'approved',
    is_published = CASE WHEN admin_suspended = TRUE THEN FALSE ELSE TRUE END,
    updated_at = NOW()
  WHERE id = p_group_id AND tutor_id = v_tutor_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'groupId', p_group_id,
    'reviewStatus', 'approved',
    'isPublished', TRUE
  );
END;
$$;

-- ============================================================================
-- 7. Grants & Function Access Lockdown
-- ============================================================================
REVOKE ALL ON FUNCTION public.tutor_update_profile_text(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tutor_update_profile_text(TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_get_recent_tutor_profile_edits(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_recent_tutor_profile_edits(INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_revert_tutor_profile_edit(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_revert_tutor_profile_edit(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.tutor_update_profile_pricing(INTEGER, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tutor_update_profile_pricing(INTEGER, TEXT, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.tutor_update_profile_avatar(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tutor_update_profile_avatar(TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.tutor_create_slot(DATE, TIME, TIME, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tutor_create_slot(DATE, TIME, TIME, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.tutor_update_trial_slot(UUID, DATE, TIME, TIME, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tutor_update_trial_slot(UUID, DATE, TIME, TIME, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.tutor_create_private_slots(TEXT, INTEGER, INTEGER, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tutor_create_private_slots(TEXT, INTEGER, INTEGER, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.tutor_update_private_slot(UUID, DATE, TIME, TIME, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tutor_update_private_slot(UUID, DATE, TIME, TIME, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.tutor_create_group(TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT, INTEGER, INTEGER, DATE, DATE, TEXT, JSONB, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tutor_create_group(TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT, INTEGER, INTEGER, DATE, DATE, TEXT, JSONB, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.tutor_update_group(UUID, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT, INTEGER, INTEGER, DATE, DATE, TEXT, JSONB, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tutor_update_group(UUID, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT, INTEGER, INTEGER, DATE, DATE, TEXT, JSONB, TEXT, TEXT, TEXT) TO authenticated;
