BEGIN;

-- إضافة الحقول المتغيرة للجدول الموجود بالفعل.
ALTER TABLE public.tutor_profile_edit_history
  ADD COLUMN IF NOT EXISTS changed_fields
    JSONB NOT NULL DEFAULT '[]'::jsonb;

-- استنتاج الحقول المتغيرة للسجلات القديمة.
UPDATE public.tutor_profile_edit_history
SET changed_fields =
  CASE
    WHEN COALESCE(old_headline, '')
      IS DISTINCT FROM COALESCE(new_headline, '')
    THEN jsonb_build_array('headline')
    ELSE '[]'::jsonb
  END
  ||
  CASE
    WHEN COALESCE(old_help_child_quote, '')
      IS DISTINCT FROM COALESCE(new_help_child_quote, '')
    THEN jsonb_build_array('help_child_quote')
    ELSE '[]'::jsonb
  END
  ||
  CASE
    WHEN COALESCE(old_help_child_summary, '')
      IS DISTINCT FROM COALESCE(new_help_child_summary, '')
    THEN jsonb_build_array('help_child_summary')
    ELSE '[]'::jsonb
  END
WHERE changed_fields IS NULL
   OR changed_fields = '[]'::jsonb;

-- تصحيح دالة النصوص مع الحفاظ على توقيعها والتحقق الموجود بها.
DO $repair$
DECLARE
  v_oid REGPROCEDURE;
  v_original TEXT;
  v_fixed TEXT;
BEGIN
  v_oid := to_regprocedure(
    'public.tutor_update_profile_text(text,text,text)'
  );

  IF v_oid IS NULL THEN
    RAISE EXCEPTION
      'دالة حفظ النصوص غير موجودة. لم يتم تطبيق الإصلاح.';
  END IF;

  SELECT pg_get_functiondef(v_oid)
  INTO v_original;

  v_fixed := regexp_replace(
    v_original,
    '(INSERT\s+INTO\s+(public\.)?tutor_profile_edit_history\s*\([^)]*)\medited_by\M',
    '\1changed_by',
    'i'
  );

  IF v_original ~ '\medited_by\M'
     AND v_fixed = v_original THEN
    RAISE EXCEPTION
      'تعريف دالة حفظ النصوص مختلف عن النسخة المراجعة. لم يتم تطبيق الإصلاح.';
  END IF;

  v_fixed := replace(
    v_fixed,
    quote_literal('tutor_portal'),
    quote_literal('tutor')
  );

  IF v_fixed IS DISTINCT FROM v_original THEN
    EXECUTE v_fixed;
  END IF;
END;
$repair$;

-- حفظ الصورة مستقل تماماً عن مسودات النص وسجل تعديلات النصوص.
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

REVOKE ALL ON FUNCTION
  public.tutor_update_profile_avatar(TEXT, TEXT)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.tutor_update_profile_avatar(TEXT, TEXT)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
