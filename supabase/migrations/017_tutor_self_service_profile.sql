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
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'tutor',
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
      changed_by,
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
      'tutor',
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
-- and updates `tutors.avatar_url` directly and independently of `tutor_profile_drafts`.
CREATE OR REPLACE FUNCTION public.tutor_update_profile_avatar(
  p_storage_path TEXT,
  p_public_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, storage, pg_temp
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
    RAISE EXCEPTION
      'يرجى تسجيل الدخول لتحديث الصورة الشخصية.';
  END IF;

  v_tutor_id := public.get_current_tutor_id();

  IF v_tutor_id IS NULL THEN
    RAISE EXCEPTION
      'حسابك غير مرتبط بملف معلم معتمد في منصة شاطر.';
  END IF;

  v_clean_path := BTRIM(
    COALESCE(p_storage_path, '')
  );

  v_expected_prefix :=
    'self-service/' || v_user_id::text || '/';

  IF v_clean_path = ''
     OR strpos(v_clean_path, '..') > 0
     OR strpos(v_clean_path, v_expected_prefix) <> 1
     OR v_clean_path !~* (
       '^self-service/' || v_user_id::text ||
       '/[a-z0-9._-]+\.(jpg|jpeg|png|webp)$'
     ) THEN
    RAISE EXCEPTION
      'مسار ملف الصورة غير صالح أو لا يخص حسابك.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM storage.objects o
    WHERE o.bucket_id = 'tutor-avatars'
      AND o.name = v_clean_path
      AND o.metadata->>'mimetype' IN (
        'image/jpeg', 'image/png', 'image/webp'
      )
      AND (o.metadata->>'size')::BIGINT
        BETWEEN 1 AND 2097152
  )
  INTO v_obj_exists;

  IF NOT v_obj_exists THEN
    RAISE EXCEPTION
      'لم يتم العثور على صورة صالحة في وحدة التخزين. أعد رفع الصورة والمحاولة.';
  END IF;

  v_clean_url := BTRIM(
    COALESCE(p_public_url, '')
  );

  IF v_clean_url = ''
     OR char_length(v_clean_url) > 1000
     OR v_clean_url !~*
       '^https://[a-z0-9.-]+(:[0-9]+)?/storage/v1/object/public/tutor-avatars/'
     OR RIGHT(
       v_clean_url,
       LENGTH(
         '/storage/v1/object/public/tutor-avatars/' ||
         v_clean_path
       )
     ) <> (
       '/storage/v1/object/public/tutor-avatars/' ||
       v_clean_path
     ) THEN
    RAISE EXCEPTION
      'الرابط العام للصورة غير صالح أو لا يطابق المسار المرفوع.';
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
DROP FUNCTION IF EXISTS public.tutor_create_slot(DATE, TIME, TIME, TEXT);
CREATE OR REPLACE FUNCTION public.tutor_create_slot(
  p_slot_date DATE,
  p_start_time TIME,
  p_end_time TIME,
  p_timezone TEXT DEFAULT 'Africa/Cairo'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_tutor_id TEXT;
  v_new_id UUID;
  v_tz TEXT;
  v_start_at TIMESTAMPTZ;
  v_end_at TIMESTAMPTZ;
  v_conflict RECORD;
BEGIN
  v_tutor_id := public.get_current_tutor_id();
  IF v_tutor_id IS NULL THEN
    RAISE EXCEPTION 'غير مصرح: حسابك غير مرتبط بملف معلم معتمد.';
  END IF;

  PERFORM public.acquire_tutor_lock(v_tutor_id);

  v_tz := COALESCE(NULLIF(BTRIM(p_timezone), ''), 'Africa/Cairo');
  IF v_tz NOT IN ('Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai') THEN
    RAISE EXCEPTION 'المنطقة الزمنية غير مدعومة. يرجى اختيار توقيت القاهرة أو الرياض أو دبي.';
  END IF;

  IF p_end_time <= p_start_time THEN
    RAISE EXCEPTION 'وقت النهاية يجب أن يكون بعد وقت البداية.';
  END IF;

  v_start_at := (p_slot_date + p_start_time) AT TIME ZONE v_tz;
  v_end_at := (p_slot_date + p_end_time) AT TIME ZONE v_tz;

  IF v_start_at <= NOW() THEN
    RAISE EXCEPTION 'لا يمكن إضافة موعد في وقت سابق من الآن.';
  END IF;

  IF (v_end_at - v_start_at) <> INTERVAL '20 minutes' THEN
    RAISE EXCEPTION 'مدة الحصة التجريبية في نظام شاطر هي 20 دقيقة بالضبط.';
  END IF;

  SELECT * INTO v_conflict
  FROM public.internal_check_tutor_time_conflict(
    v_tutor_id,
    v_start_at,
    v_end_at,
    NULL,
    NULL,
    NULL
  );

  IF v_conflict.has_conflict THEN
    RAISE EXCEPTION 'تعارض زمني: %', v_conflict.conflict_details;
  END IF;

  INSERT INTO public.tutor_available_slots (
    tutor_id,
    slot_date,
    start_time,
    end_time,
    timezone,
    is_available,
    is_booked,
    admin_suspended,
    created_at,
    updated_at
  ) VALUES (
    v_tutor_id,
    p_slot_date,
    p_start_time,
    p_end_time,
    v_tz,
    TRUE,
    FALSE,
    FALSE,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'slotId', v_new_id,
    'insertedCount', 1,
    'message', 'تمت إضافة الموعد التجريبي بنجاح.'
  );
END;
$$;

DROP FUNCTION IF EXISTS public.tutor_update_trial_slot(UUID, DATE, TIME, TIME, TEXT);
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
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_tutor_id TEXT;
  v_slot RECORD;
  v_tz TEXT;
  v_start_at TIMESTAMPTZ;
  v_end_at TIMESTAMPTZ;
  v_conflict RECORD;
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

  v_tz := COALESCE(NULLIF(BTRIM(p_timezone), ''), COALESCE(v_slot.timezone, 'Africa/Cairo'));
  IF v_tz NOT IN ('Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai') THEN
    RAISE EXCEPTION 'المنطقة الزمنية غير مدعومة. يرجى اختيار توقيت القاهرة أو الرياض أو دبي.';
  END IF;

  IF p_end_time <= p_start_time THEN
    RAISE EXCEPTION 'وقت النهاية يجب أن يكون بعد وقت البداية.';
  END IF;

  v_start_at := (p_slot_date + p_start_time) AT TIME ZONE v_tz;
  v_end_at := (p_slot_date + p_end_time) AT TIME ZONE v_tz;

  IF v_start_at <= NOW() THEN
    RAISE EXCEPTION 'لا يمكن نقل الموعد التجريبي إلى وقت سابق من الآن.';
  END IF;

  IF (v_end_at - v_start_at) <> INTERVAL '20 minutes' THEN
    RAISE EXCEPTION 'مدة الحصة التجريبية المعتمدة هي 20 دقيقة بالضبط.';
  END IF;

  SELECT * INTO v_conflict
  FROM public.internal_check_tutor_time_conflict(
    v_tutor_id,
    v_start_at,
    v_end_at,
    p_slot_id,
    NULL,
    NULL
  );

  IF v_conflict.has_conflict THEN
    RAISE EXCEPTION 'تعارض زمني: %', v_conflict.conflict_details;
  END IF;

  UPDATE public.tutor_available_slots
  SET
    slot_date = p_slot_date,
    start_time = p_start_time,
    end_time = p_end_time,
    timezone = v_tz,
    updated_at = NOW()
  WHERE id = p_slot_id AND tutor_id = v_tutor_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'slotId', p_slot_id,
    'message', 'تم تعديل الموعد التجريبي بنجاح.'
  );
END;
$$;

-- ============================================================================
-- 6. Remove Accidental Duplicate TEXT Overloads & Keep Canonical UUID Signatures
--    from Migrations 010 & 013 (Supporting Africa/Cairo, Asia/Riyadh, Asia/Dubai)
-- ============================================================================
DROP FUNCTION IF EXISTS public.tutor_create_private_slots(TEXT, INTEGER, INTEGER, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.tutor_update_private_slot(UUID, DATE, TIME, TIME, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.tutor_create_group(TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT, INTEGER, INTEGER, DATE, DATE, TEXT, JSONB, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.tutor_update_group(UUID, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT, INTEGER, INTEGER, DATE, DATE, TEXT, JSONB, TEXT, TEXT, TEXT);

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

REVOKE ALL ON FUNCTION public.tutor_update_profile_avatar(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_update_profile_avatar(TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.tutor_create_slot(DATE, TIME, TIME, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_create_slot(DATE, TIME, TIME, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.tutor_update_trial_slot(UUID, DATE, TIME, TIME, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_update_trial_slot(UUID, DATE, TIME, TIME, TEXT) TO authenticated, service_role;

