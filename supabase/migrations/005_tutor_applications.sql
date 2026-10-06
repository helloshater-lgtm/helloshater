-- ==============================================================================
-- Shatir Classes (شاطر كلاسيز) - Supabase Migration: 005_tutor_applications.sql
-- Description: نظام تقديم وانضمام المعلمين المعتمد على Supabase Auth و RLS
-- Security & Safeguards:
--   1. ربط الطلبات بـ auth.users(id) دون منح المعلم أي صلاحيات إدارية (لا إضافة لـ admin_users).
--   2. قيد فريد uq_tutor_applications_user_id لمنع إنشاء أكثر من طلب لنفس الحساب (مع فحص التكرارات مسبقاً دون حذف تلقائي).
--   3. حقل policy_accepted_at يقبل NULL؛ تسجيل وقت القبول فقط عند terms_accepted = true (خصوصاً عند الإرسال النهائي).
--   4. إمكانية حفظ المسودة بـ terms_accepted = false، واقتصار فحص قبول السياسة على الإرسال النهائي داخل tutor_save_application.
--   5. تحويل سنوات الخبرة صراحة للفئات المعتمدة دون اختزال الأرقام (تجنب تحويل 4-6 إلى 46).
--   6. عند الاعتماد: التأكد من أن جميع تخصصات المدرسة صالحة ونشطة (المادة والصف والمرحلة والمنهج)، وكذلك برامج القرآن.
--   7. ضبط aliases وأسماء الأعمدة صراحة في جميع استعلامات JSONB و unnest.
--   8. حفظ السعر المقترح متطابقاً في الحد الأدنى والأعلى (hourly_rate_min = hourly_rate_max) دون إضافة تلقائية.
--   9. عدم توليد ركائز تدريس أو خطوات تجربة أو حالات طلاب نصوص ثابتة مصطنعة؛ استخدام ما قدمه المعلم فقط.
--  10. دالة آمنة tutor_save_application مع التحقق من auth.uid() ومنع المعلم قطعياً من تعديل الأعمدة الإدارية.
--  11. حماية إضافية عبر Trigger (protect_tutor_application_admin_columns) لمنع التعديل على الحقول الإدارية.
--  12. منع وضع verified_credentials أو tutor_qualifications.verified بـ TRUE تلقائياً، والتقييم rating = NULL.
--  13. ترك institution في المؤهلات NULL إن لم يذكرها المتقدم، وإسقاط NOT NULL عنها في tutor_qualifications.
--  14. بقاء المعلم الجديد غير منشور (is_published = FALSE) كإجراء إداري منفصل.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 0. Schema Adjustment: إتاحة خلو المؤسسة في المؤهلات إن لم يذكرها المعلم
-- ------------------------------------------------------------------------------
ALTER TABLE public.tutor_qualifications 
    ALTER COLUMN institution DROP NOT NULL;

-- ------------------------------------------------------------------------------
-- 1. Table Schema Upgrade: public.tutor_applications
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tutor_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    reference_code TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    country_code TEXT NOT NULL DEFAULT '+20',
    phone TEXT NOT NULL,
    whatsapp_number TEXT,
    email TEXT,
    track TEXT NOT NULL CHECK (track IN ('school', 'quran')),
    school_course_option_ids UUID[] DEFAULT '{}',
    school_specializations JSONB DEFAULT '[]'::jsonb,
    quran_offerings JSONB DEFAULT '[]'::jsonb,
    quran_age_groups TEXT[] DEFAULT '{}',
    quran_levels TEXT[] DEFAULT '{}',
    quran_notes TEXT,
    academic_degree TEXT NOT NULL,
    institution TEXT,
    experience_years TEXT NOT NULL,
    has_online_experience TEXT CHECK (has_online_experience IN ('yes', 'no', '')),
    online_experience_details TEXT,
    bio_and_methodology TEXT NOT NULL,
    portfolio_url TEXT,
    suggested_hourly_rate INTEGER NOT NULL DEFAULT 120,
    currency TEXT NOT NULL DEFAULT 'ج.م',
    session_duration_minutes INTEGER NOT NULL DEFAULT 50,
    available_days TEXT[] DEFAULT '{}',
    preferred_times TEXT[] DEFAULT '{}',
    timezone TEXT DEFAULT 'Africa/Cairo',
    terms_accepted BOOLEAN NOT NULL DEFAULT FALSE,
    policy_version TEXT DEFAULT NULL,
    policy_accepted_at TIMESTAMPTZ DEFAULT NULL,
    status TEXT NOT NULL DEFAULT 'draft' 
        CHECK (status IN ('draft', 'submitted', 'needs_info', 'approved', 'rejected')),
    admin_notes TEXT,
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id),
    applicant_tutor_id TEXT REFERENCES public.tutors(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- إزالة أي قيد فريد سابق باسم مؤقت لتوحيد اسم القيد
ALTER TABLE public.tutor_applications 
    DROP CONSTRAINT IF EXISTS uq_tutor_applications_user_id_init;

-- حذف أي قيود سابقة كانت تمنع حفظ terms_accepted = false في المسودة
ALTER TABLE public.tutor_applications 
    DROP CONSTRAINT IF EXISTS tutor_applications_terms_accepted_check;
ALTER TABLE public.tutor_applications 
    DROP CONSTRAINT IF EXISTS tutor_applications_terms_accepted_check1;

-- ترقية الأعمدة بصيغة IF NOT EXISTS
ALTER TABLE public.tutor_applications 
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.tutor_applications 
    ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;

ALTER TABLE public.tutor_applications 
    ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE public.tutor_applications 
    ADD COLUMN IF NOT EXISTS school_course_option_ids UUID[] DEFAULT '{}';

ALTER TABLE public.tutor_applications 
    ADD COLUMN IF NOT EXISTS school_specializations JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.tutor_applications 
    ADD COLUMN IF NOT EXISTS quran_offerings JSONB DEFAULT '[]'::jsonb;

ALTER TABLE public.tutor_applications 
    ADD COLUMN IF NOT EXISTS quran_notes TEXT;

ALTER TABLE public.tutor_applications 
    ADD COLUMN IF NOT EXISTS institution TEXT;

ALTER TABLE public.tutor_applications 
    ADD COLUMN IF NOT EXISTS has_online_experience TEXT;

ALTER TABLE public.tutor_applications 
    ADD COLUMN IF NOT EXISTS online_experience_details TEXT;

ALTER TABLE public.tutor_applications 
    ADD COLUMN IF NOT EXISTS bio_and_methodology TEXT;

ALTER TABLE public.tutor_applications 
    ADD COLUMN IF NOT EXISTS suggested_hourly_rate INTEGER DEFAULT 120;

ALTER TABLE public.tutor_applications 
    ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'ج.م';

ALTER TABLE public.tutor_applications 
    ADD COLUMN IF NOT EXISTS session_duration_minutes INTEGER DEFAULT 50;

ALTER TABLE public.tutor_applications 
    ADD COLUMN IF NOT EXISTS available_days TEXT[] DEFAULT '{}';

ALTER TABLE public.tutor_applications 
    ADD COLUMN IF NOT EXISTS preferred_times TEXT[] DEFAULT '{}';

ALTER TABLE public.tutor_applications 
    ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'Africa/Cairo';

ALTER TABLE public.tutor_applications 
    ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT FALSE;

ALTER TABLE public.tutor_applications 
    ADD COLUMN IF NOT EXISTS policy_version TEXT DEFAULT NULL;

ALTER TABLE public.tutor_applications 
    ADD COLUMN IF NOT EXISTS policy_accepted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.tutor_applications 
    ADD COLUMN IF NOT EXISTS admin_notes TEXT;

ALTER TABLE public.tutor_applications 
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

ALTER TABLE public.tutor_applications 
    ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id);

ALTER TABLE public.tutor_applications 
    ADD COLUMN IF NOT EXISTS applicant_tutor_id TEXT REFERENCES public.tutors(id);

-- جعل policy_accepted_at يقبل NULL صراحة وإلغاء أي DEFAULT إجباري سابق
ALTER TABLE public.tutor_applications 
    ALTER COLUMN policy_accepted_at DROP NOT NULL;
ALTER TABLE public.tutor_applications 
    ALTER COLUMN policy_accepted_at DROP DEFAULT;

-- تحديث قيد الحالة لدعم الحالات الخمس الصريحة
ALTER TABLE public.tutor_applications DROP CONSTRAINT IF EXISTS tutor_applications_status_check;
ALTER TABLE public.tutor_applications 
    ADD CONSTRAINT tutor_applications_status_check 
    CHECK (status IN ('draft', 'submitted', 'needs_info', 'approved', 'rejected'));

-- ------------------------------------------------------------------------------
-- 1.1 فحص الطلبات المكررة وإضافة القيد الفريد uq_tutor_applications_user_id مرة واحدة فقط
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_dup_users_count INTEGER := 0;
    v_total_dup_records INTEGER := 0;
BEGIN
    -- إذا كان القيد الفريد موجوداً بالفعل، لا داعي لإعادة إضافته
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint 
        WHERE conname = 'uq_tutor_applications_user_id'
          AND conrelid = 'public.tutor_applications'::regclass
    ) THEN
        -- فحص وجود طلبات مكررة حسب user_id في السجلات القائمة
        SELECT COUNT(DISTINCT user_id), COALESCE(SUM(cnt), 0)
        INTO v_dup_users_count, v_total_dup_records
        FROM (
            SELECT user_id, COUNT(*) AS cnt
            FROM public.tutor_applications
            WHERE user_id IS NOT NULL
            GROUP BY user_id
            HAVING COUNT(*) > 1
        ) dups;

        -- إذا وُجدت تكرارات، أوقف الـ Migration بخطأ استثنائي صريح دون حذف أي سجل ومنع الإكمال بدون القيد
        IF v_dup_users_count > 0 THEN
            RAISE EXCEPTION 'فشل تطبيق الـ Migration: تم العثور على % حساب لديهم % طلب مسجل في public.tutor_applications. لم يتم حذف أي سجل تلقائياً للحفاظ على البيانات. يرجى تصفية الطلبات المكررة يدوياً ثم إعادة تشغيل الـ Migration لإضافة القيد الفريد uq_tutor_applications_user_id بأمان.',
                v_dup_users_count, v_total_dup_records;
        END IF;

        -- إذا لم توجد تكرارات، أضف القيد الفريد مرة واحدة فقط باسم uq_tutor_applications_user_id
        ALTER TABLE public.tutor_applications 
            ADD CONSTRAINT uq_tutor_applications_user_id UNIQUE (user_id);
    END IF;
END;
$$;

-- الفهارس
CREATE INDEX IF NOT EXISTS idx_tutor_apps_user_id ON public.tutor_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_tutor_apps_status ON public.tutor_applications(status);
CREATE INDEX IF NOT EXISTS idx_tutor_apps_created ON public.tutor_applications(created_at DESC);

-- Trigger لتحديث updated_at تلقائياً
DROP TRIGGER IF EXISTS trg_tutor_applications_updated_at ON public.tutor_applications;
CREATE TRIGGER trg_tutor_applications_updated_at
BEFORE UPDATE ON public.tutor_applications
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.tutor_applications IS 'سجل طلبات انضمام المعلمين المرتبطة بحساباتهم والمحمية بنظام RLS وRPC آمن وقيد فريد على الحساب';

-- ------------------------------------------------------------------------------
-- 2. Trigger: حماية الأعمدة الإدارية من أي تعديل غير مصرح
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_tutor_application_admin_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- إذا لم يكن المستخدم مديراً، يتم فرض القيم القديمة للأعمدة الإدارية والجوهرية
    IF NOT public.is_admin() THEN
        NEW.admin_notes := OLD.admin_notes;
        NEW.reviewed_at := OLD.reviewed_at;
        NEW.reviewed_by := OLD.reviewed_by;
        NEW.applicant_tutor_id := OLD.applicant_tutor_id;
        NEW.reference_code := OLD.reference_code;
        NEW.user_id := OLD.user_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_tutor_app_admin_columns ON public.tutor_applications;
CREATE TRIGGER trg_protect_tutor_app_admin_columns
BEFORE UPDATE ON public.tutor_applications
FOR EACH ROW
EXECUTE FUNCTION public.protect_tutor_application_admin_columns();

-- ------------------------------------------------------------------------------
-- 3. Row Level Security (RLS) Configuration
-- ------------------------------------------------------------------------------
ALTER TABLE public.tutor_applications ENABLE ROW LEVEL SECURITY;

-- سحب الصلاحيات من الجميع وإعادة ضبطها بدقة
REVOKE ALL ON public.tutor_applications FROM PUBLIC, anon;
-- authenticated يحصل فقط على SELECT؛ أي إدخال أو تعديل يتم عبر RPC الآمنة لحماية الأعمدة الإدارية
GRANT SELECT ON public.tutor_applications TO authenticated;
GRANT ALL ON public.tutor_applications TO service_role;

-- سياسة 1: المعلم يقرأ طلبه الخاص فقط، والمشرف المعتمد يقرأ كافة الطلبات
DROP POLICY IF EXISTS "Users can read own application or admins all" ON public.tutor_applications;
DROP POLICY IF EXISTS "Applicants can view own application" ON public.tutor_applications;
CREATE POLICY "Applicants can view own application"
ON public.tutor_applications FOR SELECT TO authenticated
USING (
    user_id = auth.uid() 
    OR public.is_admin()
);

-- سياسة 2: المشرف المعتمد فقط يملك كامل صلاحيات التعديل والحذف المباشرة
DROP POLICY IF EXISTS "Admins have full access to applications" ON public.tutor_applications;
CREATE POLICY "Admins have full access to applications"
ON public.tutor_applications FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- 4. Secure RPC: tutor_save_application
-- دالة حفظ وتعديل الطلب من طرف المعلم بأمان تام؛ تمنع لمس أي حقول إدارية
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tutor_save_application(
    p_payload JSONB,
    p_is_submit BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_existing RECORD;
    v_target_status TEXT;
    v_full_name TEXT;
    v_country_code TEXT;
    v_phone TEXT;
    v_track TEXT;
    v_academic_degree TEXT;
    v_institution TEXT;
    v_experience_years TEXT;
    v_bio TEXT;
    v_rate INTEGER;
    v_duration INTEGER;
    v_terms_accepted BOOLEAN;
    v_policy_accepted_at TIMESTAMPTZ;
    v_policy_version TEXT;
    v_ref_code TEXT;
    v_result RECORD;
    v_course_option_ids UUID[] := '{}';
    v_quran_offerings JSONB := '[]'::jsonb;
    v_q_age_groups TEXT[] := '{}';
    v_q_levels TEXT[] := '{}';
    v_available_days TEXT[] := '{}';
    v_preferred_times TEXT[] := '{}';
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول بحساب المعلم أولاً.';
    END IF;

    -- التحقق من وجود طلب سابق للمستخدم
    SELECT * INTO v_existing FROM public.tutor_applications
    WHERE user_id = v_user_id
    LIMIT 1;

    -- إذا كان الطلب موجوداً ومقبولاً أو مرفوضاً أو مرسلاً ولم تطلب الإدارة استكماله، نمنع التعديل
    IF FOUND THEN
        IF v_existing.status IN ('approved', 'rejected') THEN
            RAISE EXCEPTION 'لا يمكن تعديل الطلب بعد صدور قرار نهائي بالقبول أو الرفض.';
        END IF;

        IF v_existing.status = 'submitted' AND NOT p_is_submit THEN
            RAISE EXCEPTION 'الطلب قيد المراجعة لدى الإدارة بالفعل ولا يمكن تحويله لمسودة.';
        END IF;

        IF v_existing.status = 'submitted' AND v_existing.status != 'needs_info' AND p_is_submit THEN
            RAISE EXCEPTION 'الطلب مُرسل بالفعل وقيد المراجعة.';
        END IF;
    END IF;

    -- استخراج وتدقيق الحقول المسموح للمعلم بإرسالها
    v_full_name := TRIM(COALESCE(p_payload->>'fullName', ''));
    IF v_full_name = '' THEN
        RAISE EXCEPTION 'الاسم الكامل مطلوب.';
    END IF;

    v_country_code := COALESCE(NULLIF(TRIM(p_payload->>'countryCode'), ''), '+20');
    v_phone := TRIM(COALESCE(p_payload->>'phone', ''));
    IF v_phone = '' THEN
        RAISE EXCEPTION 'رقم الهاتف مطلوب.';
    END IF;

    v_track := TRIM(COALESCE(p_payload->>'track', 'school'));
    IF v_track NOT IN ('school', 'quran') THEN
        RAISE EXCEPTION 'مسار التدريس غير صالح.';
    END IF;

    v_academic_degree := TRIM(COALESCE(p_payload->>'academicDegree', ''));
    IF v_academic_degree = '' THEN
        RAISE EXCEPTION 'المؤهل الأكاديمي مطلوب.';
    END IF;

    -- المؤسسة تترك فارغة (NULL) إذا لم يدخلها المعلم؛ لا نضع قيمة مصطنعة
    v_institution := NULLIF(TRIM(COALESCE(p_payload->>'institution', '')), '');

    v_experience_years := TRIM(COALESCE(p_payload->>'experienceYears', 'من سنتين إلى ٣ سنوات'));
    v_bio := TRIM(COALESCE(p_payload->>'bioAndMethodology', ''));
    IF v_bio = '' THEN
        RAISE EXCEPTION 'نبذة أسلوب التدريس مطلوبة.';
    END IF;

    v_rate := COALESCE((p_payload->>'suggestedHourlyRate')::INTEGER, 120);
    IF v_rate <= 0 THEN
        v_rate := 120;
    END IF;

    v_duration := COALESCE((p_payload->>'sessionDurationMinutes')::INTEGER, 50);
    IF v_duration <= 0 THEN
        v_duration := 50;
    END IF;

    v_terms_accepted := COALESCE((p_payload->>'termsAccepted')::BOOLEAN, FALSE);

    -- استخراج واستنتاج التخصصات والخيارات بـ aliases صريحة
    IF p_payload ? 'schoolCourseOptionIds' AND jsonb_typeof(p_payload->'schoolCourseOptionIds') = 'array' THEN
        SELECT COALESCE(ARRAY_AGG(arr.opt_id::UUID), '{}'::UUID[]) INTO v_course_option_ids
        FROM jsonb_array_elements_text(p_payload->'schoolCourseOptionIds') AS arr(opt_id)
        WHERE arr.opt_id IS NOT NULL AND arr.opt_id != '';
    END IF;

    -- إذا كانت فارغة ولكن تم إرسال schoolSpecializations، نستخرج الخيارات النشطة المطابقة بـ aliases صريحة
    IF (v_course_option_ids IS NULL OR array_length(v_course_option_ids, 1) IS NULL OR array_length(v_course_option_ids, 1) = 0)
       AND p_payload ? 'schoolSpecializations' AND jsonb_typeof(p_payload->'schoolSpecializations') = 'array' THEN
        SELECT COALESCE(ARRAY_AGG(DISTINCT sco.id), '{}'::UUID[]) INTO v_course_option_ids
        FROM jsonb_array_elements(p_payload->'schoolSpecializations') AS sp(spec_json)
        CROSS JOIN LATERAL jsonb_array_elements_text(sp.spec_json->'gradeIds') AS gr(grade_val)
        JOIN public.school_course_options sco 
          ON sco.grade_id = gr.grade_val
         AND sco.subject_id = sp.spec_json->>'subjectId' 
         AND sco.curriculum_id = sp.spec_json->>'curriculumType' 
         AND sco.is_active = TRUE;
    END IF;

    -- استخراج برامج القرآن بـ aliases صريحة
    IF p_payload ? 'quranOfferings' AND jsonb_typeof(p_payload->'quranOfferings') = 'array' THEN
        v_quran_offerings := p_payload->'quranOfferings';
    END IF;

    IF p_payload ? 'quranAgeGroups' AND jsonb_typeof(p_payload->'quranAgeGroups') = 'array' THEN
        SELECT COALESCE(ARRAY_AGG(arr.ag_id::TEXT), '{}'::TEXT[]) INTO v_q_age_groups
        FROM jsonb_array_elements_text(p_payload->'quranAgeGroups') AS arr(ag_id)
        WHERE arr.ag_id IS NOT NULL AND arr.ag_id != '';
    END IF;

    IF p_payload ? 'quranLevels' AND jsonb_typeof(p_payload->'quranLevels') = 'array' THEN
        SELECT COALESCE(ARRAY_AGG(arr.lvl_id::TEXT), '{}'::TEXT[]) INTO v_q_levels
        FROM jsonb_array_elements_text(p_payload->'quranLevels') AS arr(lvl_id)
        WHERE arr.lvl_id IS NOT NULL AND arr.lvl_id != '';
    END IF;

    -- إذا كانت v_quran_offerings فارغة وتم توفير الفئات والمستويات بـ aliases صريحة
    IF (v_quran_offerings IS NULL OR jsonb_typeof(v_quran_offerings) != 'array' OR jsonb_array_length(v_quran_offerings) = 0)
       AND array_length(v_q_age_groups, 1) > 0 AND array_length(v_q_levels, 1) > 0 THEN
        SELECT COALESCE(jsonb_agg(jsonb_build_object('ageGroupId', ag.age_group_id, 'levelId', lv.level_id)), '[]'::jsonb) 
        INTO v_quran_offerings
        FROM unnest(v_q_age_groups) AS ag(age_group_id)
        CROSS JOIN unnest(v_q_levels) AS lv(level_id);
    END IF;

    -- استخراج الأيام والأوقات بـ aliases صريحة
    IF p_payload ? 'availableDays' AND jsonb_typeof(p_payload->'availableDays') = 'array' THEN
        SELECT COALESCE(ARRAY_AGG(arr.d_name::TEXT), '{}'::TEXT[]) INTO v_available_days
        FROM jsonb_array_elements_text(p_payload->'availableDays') AS arr(d_name)
        WHERE arr.d_name IS NOT NULL AND arr.d_name != '';
    END IF;

    IF p_payload ? 'preferredTimes' AND jsonb_typeof(p_payload->'preferredTimes') = 'array' THEN
        SELECT COALESCE(ARRAY_AGG(arr.t_name::TEXT), '{}'::TEXT[]) INTO v_preferred_times
        FROM jsonb_array_elements_text(p_payload->'preferredTimes') AS arr(t_name)
        WHERE arr.t_name IS NOT NULL AND arr.t_name != '';
    END IF;

    -- النقطة 1: فحص وثيقة السياسة عند الإرسال النهائي فقط؛ وضبط وقت وإصدار السياسة بدقة
    IF p_is_submit THEN
        IF NOT v_terms_accepted THEN
            RAISE EXCEPTION 'يجب الموافقة على وثيقة سياسة التعاون لإرسال الطلب للمراجعة.';
        END IF;
        v_target_status := 'submitted';
        v_policy_accepted_at := NOW();
        v_policy_version := 'v1.0';
    ELSE
        -- حفظ كمسودة؛ يُسمح بـ terms_accepted = false ولا يُسجّل وقت موافقة وهمي
        v_target_status := 'draft';
        IF v_terms_accepted THEN
            v_policy_accepted_at := COALESCE(v_existing.policy_accepted_at, NOW());
            v_policy_version := 'v1.0';
        ELSE
            v_policy_accepted_at := NULL;
            v_policy_version := NULL;
        END IF;
    END IF;

    IF v_existing.id IS NOT NULL THEN
        -- تحديث السجل القائم مع حظر لمس الأعمدة الإدارية
        UPDATE public.tutor_applications SET
            full_name = v_full_name,
            country_code = v_country_code,
            phone = v_phone,
            whatsapp_number = COALESCE(NULLIF(TRIM(p_payload->>'whatsappNumber'), ''), v_phone),
            email = COALESCE(NULLIF(TRIM(p_payload->>'email'), ''), auth.email()),
            track = v_track,
            school_course_option_ids = v_course_option_ids,
            school_specializations = COALESCE(p_payload->'schoolSpecializations', '[]'::jsonb),
            quran_offerings = v_quran_offerings,
            quran_age_groups = v_q_age_groups,
            quran_levels = v_q_levels,
            quran_notes = NULLIF(TRIM(COALESCE(p_payload->>'quranNotes', '')), ''),
            academic_degree = v_academic_degree,
            institution = v_institution,
            experience_years = v_experience_years,
            has_online_experience = NULLIF(TRIM(COALESCE(p_payload->>'hasOnlineExperience', '')), ''),
            online_experience_details = NULLIF(TRIM(COALESCE(p_payload->>'onlineExperienceDetails', '')), ''),
            bio_and_methodology = v_bio,
            portfolio_url = NULLIF(TRIM(COALESCE(p_payload->>'portfolioUrl', '')), ''),
            suggested_hourly_rate = v_rate,
            currency = COALESCE(NULLIF(TRIM(p_payload->>'currency'), ''), 'ج.م'),
            session_duration_minutes = v_duration,
            available_days = v_available_days,
            preferred_times = v_preferred_times,
            timezone = COALESCE(NULLIF(TRIM(p_payload->>'timezone'), ''), 'Africa/Cairo'),
            terms_accepted = v_terms_accepted,
            policy_version = v_policy_version,
            policy_accepted_at = v_policy_accepted_at,
            status = v_target_status,
            updated_at = NOW()
        WHERE id = v_existing.id
        RETURNING * INTO v_result;
    ELSE
        -- إنشاء كود المرجع الفريد
        v_ref_code := 'SH-' || LPAD(FLOOR(RANDOM() * 900000 + 100000)::TEXT, 6, '0');

        INSERT INTO public.tutor_applications (
            user_id,
            reference_code,
            full_name,
            country_code,
            phone,
            whatsapp_number,
            email,
            track,
            school_course_option_ids,
            school_specializations,
            quran_offerings,
            quran_age_groups,
            quran_levels,
            quran_notes,
            academic_degree,
            institution,
            experience_years,
            has_online_experience,
            online_experience_details,
            bio_and_methodology,
            portfolio_url,
            suggested_hourly_rate,
            currency,
            session_duration_minutes,
            available_days,
            preferred_times,
            timezone,
            terms_accepted,
            policy_version,
            policy_accepted_at,
            status,
            admin_notes,
            reviewed_at,
            reviewed_by,
            applicant_tutor_id,
            created_at,
            updated_at
        ) VALUES (
            v_user_id,
            v_ref_code,
            v_full_name,
            v_country_code,
            v_phone,
            COALESCE(NULLIF(TRIM(p_payload->>'whatsappNumber'), ''), v_phone),
            COALESCE(NULLIF(TRIM(p_payload->>'email'), ''), auth.email()),
            v_track,
            v_course_option_ids,
            COALESCE(p_payload->'schoolSpecializations', '[]'::jsonb),
            v_quran_offerings,
            v_q_age_groups,
            v_q_levels,
            NULLIF(TRIM(COALESCE(p_payload->>'quranNotes', '')), ''),
            v_academic_degree,
            v_institution,
            v_experience_years,
            NULLIF(TRIM(COALESCE(p_payload->>'hasOnlineExperience', '')), ''),
            NULLIF(TRIM(COALESCE(p_payload->>'onlineExperienceDetails', '')), ''),
            v_bio,
            NULLIF(TRIM(COALESCE(p_payload->>'portfolioUrl', '')), ''),
            v_rate,
            COALESCE(NULLIF(TRIM(p_payload->>'currency'), ''), 'ج.م'),
            v_duration,
            v_available_days,
            v_preferred_times,
            COALESCE(NULLIF(TRIM(p_payload->>'timezone'), ''), 'Africa/Cairo'),
            v_terms_accepted,
            v_policy_version,
            v_policy_accepted_at,
            v_target_status,
            NULL, -- admin_notes لا يمكن إدخاله من المعلم
            NULL, -- reviewed_at
            NULL, -- reviewed_by
            NULL, -- applicant_tutor_id
            NOW(),
            NOW()
        )
        RETURNING * INTO v_result;
    END IF;

    RETURN to_jsonb(v_result);
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_save_application(JSONB, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_save_application(JSONB, BOOLEAN) TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. Atomic RPC: admin_approve_tutor_application
-- اعتماد الطلب وإنشاء ملف المعلم المصحح بدقة
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_approve_tutor_application(
    p_application_id UUID,
    p_tutor_slug TEXT,
    p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_app RECORD;
    v_slug TEXT;
    v_offering_id UUID;
    v_quran_item JSONB;
    v_valid_offerings_count INTEGER := 0;
    v_exp_years INTEGER;
    v_rate INTEGER;
    v_resolved_options UUID[] := '{}';
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية مخصصة لمديري النظام فقط.';
    END IF;

    -- قفل سجل الطلب أولاً لمنع السباق والتضارب
    SELECT * INTO v_app FROM public.tutor_applications 
    WHERE id = p_application_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'طلب الانضمام المحدد غير موجود.';
    END IF;

    -- التحقق من حالة الطلب الحالية؛ لا نقبل طلباً ما زال مسودة أو تم اتخاذ قرار نهائي به
    IF v_app.status NOT IN ('submitted', 'needs_info') THEN
        IF v_app.status = 'approved' THEN
            RAISE EXCEPTION 'هذا الطلب معتمد ومقبول بالفعل مسبقاً.';
        ELSIF v_app.status = 'rejected' THEN
            RAISE EXCEPTION 'هذا الطلب مرفوض مسبقاً ولا يمكن قبوله مباشرة دون إعادة فتحه من الإدارة.';
        ELSIF v_app.status = 'draft' THEN
            RAISE EXCEPTION 'هذا الطلب ما زال مسودة لدى المعلم ولم يتم إرساله للمراجعة بعد.';
        ELSE
            RAISE EXCEPTION 'حالة الطلب الحالية (%) لا تسمح بالقبول.', v_app.status;
        END IF;
    END IF;

    -- التحقق من المعرف المقترح (Slug)
    v_slug := LOWER(TRIM(p_tutor_slug));
    IF v_slug IS NULL OR v_slug = '' OR NOT (v_slug ~ '^[a-z0-9-]+$') THEN
        RAISE EXCEPTION 'معرف المعلم (Slug) غير صالح: يجب أن يتكون من أحرف إنجليزية صغيرة وأرقام وشرطات فقط.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.tutors WHERE id = v_slug) THEN
        RAISE EXCEPTION 'معرف المعلم (%) مستخدم بالفعل، يرجى اختيار معرف آخر.', v_slug;
    END IF;

    -- التحقق من أن جميع المعرفات المختارة صالحة ونشطة، ونشاط المادة والصف والمرحلة والمنهج
    IF v_app.track = 'school' THEN
        v_resolved_options := v_app.school_course_option_ids;
        IF (v_resolved_options IS NULL OR array_length(v_resolved_options, 1) IS NULL OR array_length(v_resolved_options, 1) = 0)
           AND v_app.school_specializations IS NOT NULL AND jsonb_typeof(v_app.school_specializations) = 'array' AND jsonb_array_length(v_app.school_specializations) > 0 THEN
            SELECT COALESCE(ARRAY_AGG(DISTINCT sco.id), '{}'::UUID[]) INTO v_resolved_options
            FROM jsonb_array_elements(v_app.school_specializations) AS sp(spec_json)
            CROSS JOIN LATERAL jsonb_array_elements_text(sp.spec_json->'gradeIds') AS gr(grade_val)
            JOIN public.school_course_options sco 
              ON sco.grade_id = gr.grade_val
             AND sco.subject_id = sp.spec_json->>'subjectId' 
             AND sco.curriculum_id = sp.spec_json->>'curriculumType' 
             AND sco.is_active = TRUE;
        END IF;

        IF v_resolved_options IS NULL OR array_length(v_resolved_options, 1) IS NULL OR array_length(v_resolved_options, 1) = 0 THEN
            RAISE EXCEPTION 'لا توجد تخصصات مدرسية صالحة أو نشطة في هذا الطلب.';
        END IF;

        -- التحقق الصارم من أن جميع الخيارات المختارة صالحة ونشطة مع نشاط المادة والصف والمرحلة والمنهج
        SELECT COUNT(*) INTO v_valid_offerings_count
        FROM public.school_course_options sco
        JOIN public.educational_grades eg ON eg.id = sco.grade_id AND eg.is_active = TRUE
        JOIN public.educational_stages es ON es.id = eg.stage_id AND es.is_active = TRUE
        JOIN public.subjects s ON s.id = sco.subject_id AND s.is_active = TRUE
        JOIN public.curriculum_types ct ON ct.id = sco.curriculum_id AND ct.is_active = TRUE
        WHERE sco.id = ANY(v_resolved_options)
          AND sco.is_active = TRUE;

        IF v_valid_offerings_count < array_length(v_resolved_options, 1) THEN
            RAISE EXCEPTION 'تعذر الاعتماد: بعض التخصصات المدرسية المحددة في الطلب غير نشطة أو غير صالحة في قاعدة البيانات (تم التحقق من % تخصص نشط من أصل % مطلوب). تأكد من تفعيل المادة والصف والمرحلة والمنهج.', v_valid_offerings_count, array_length(v_resolved_options, 1);
        END IF;
    ELSE
        -- مسار القرآن والتأسيس
        IF (v_app.quran_offerings IS NULL OR jsonb_typeof(v_app.quran_offerings) != 'array' OR jsonb_array_length(v_app.quran_offerings) = 0)
           AND v_app.quran_age_groups IS NOT NULL AND array_length(v_app.quran_age_groups, 1) > 0
           AND v_app.quran_levels IS NOT NULL AND array_length(v_app.quran_levels, 1) > 0 THEN
            SELECT COALESCE(jsonb_agg(jsonb_build_object('ageGroupId', ag.age_group_id, 'levelId', lv.level_id)), '[]'::jsonb) 
            INTO v_app.quran_offerings
            FROM unnest(v_app.quran_age_groups) AS ag(age_group_id)
            CROSS JOIN unnest(v_app.quran_levels) AS lv(level_id);
        END IF;

        IF v_app.quran_offerings IS NULL OR jsonb_typeof(v_app.quran_offerings) != 'array' OR jsonb_array_length(v_app.quran_offerings) = 0 THEN
            RAISE EXCEPTION 'لا توجد برامج قرآنية أو فئات عمرية محددة في هذا الطلب.';
        END IF;

        -- التحقق الصارم من أن جميع البرامج والفئات القرآنية نشطة وصالحة
        SELECT COUNT(*) INTO v_valid_offerings_count
        FROM jsonb_array_elements(v_app.quran_offerings) AS qo(qitem)
        JOIN public.quran_age_groups qag ON qag.id = TRIM(qo.qitem->>'ageGroupId') AND qag.is_active = TRUE
        JOIN public.quran_levels ql ON ql.id = TRIM(qo.qitem->>'levelId') AND ql.is_active = TRUE;

        IF v_valid_offerings_count < jsonb_array_length(v_app.quran_offerings) THEN
            RAISE EXCEPTION 'تعذر الاعتماد: بعض البرامج أو الفئات القرآنية المحددة في الطلب غير نشطة أو غير صحيحة في قاعدة البيانات (تم التحقق من % من أصل %).', v_valid_offerings_count, jsonb_array_length(v_app.quran_offerings);
        END IF;
    END IF;

    -- تحويل صريح لفئات سنوات الخبرة لتجنب دمج الأرقام المتعددة (مثل 4-6 إلى 46)
    IF v_app.experience_years ILIKE '%أكثر%' OR v_app.experience_years ILIKE '%10%' OR v_app.experience_years ILIKE '%١٠%' THEN
        v_exp_years := 10;
    ELSIF v_app.experience_years ILIKE '%٧%' OR v_app.experience_years ILIKE '%7%' THEN
        v_exp_years := 7;
    ELSIF v_app.experience_years ILIKE '%٤%' OR v_app.experience_years ILIKE '%4%' THEN
        v_exp_years := 4;
    ELSIF v_app.experience_years ILIKE '%سنتين%' OR v_app.experience_years ILIKE '%٣%' OR v_app.experience_years ILIKE '%3%' OR v_app.experience_years ILIKE '%2%' OR v_app.experience_years ILIKE '%٢%' THEN
        v_exp_years := 2;
    ELSIF v_app.experience_years ILIKE '%أقل%' THEN
        v_exp_years := 1;
    ELSE
        -- استخراج أول رقم صريح أو تركه 0 للمراجعة الإدارية
        v_exp_years := COALESCE(NULLIF(SUBSTRING(v_app.experience_years FROM '[0-9]+'), '')::INTEGER, 0);
    END IF;

    -- السعر المقترح كما هو في الحدين الأدنى والأعلى دون زيادة تلقائية
    v_rate := COALESCE(v_app.suggested_hourly_rate, 120);

    -- 1. إنشاء ملف المعلم في public.tutors:
    -- verified_credentials = FALSE، rating = NULL، reviews_count = 0
    -- hourly_rate_min = v_rate، hourly_rate_max = v_rate (لا رفع تلقائي للسعر)
    -- لا نصوص ركائز أو خطوات مصطنعة؛ نعتمد فقط على bio_and_methodology
    -- is_published = FALSE (أبقِ المعلم غير منشور؛ النشر إجراء إداري منفصل)
    INSERT INTO public.tutors (
        id,
        name,
        honorific,
        headline,
        avatar_url,
        years_of_experience,
        experience_badge_text,
        verified_credentials,
        hourly_rate_min,
        hourly_rate_max,
        currency,
        session_duration_minutes,
        trial_duration_minutes,
        rating,
        reviews_count,
        total_students_taught,
        help_child_quote,
        help_child_summary,
        target_student_cases,
        curriculum_tags,
        is_published,
        created_at,
        updated_at
    ) VALUES (
        v_slug,
        v_app.full_name,
        'أ.',
        COALESCE(NULLIF(TRIM(v_app.academic_degree), ''), 'معلم في منصة شاطر'),
        NULL,
        v_exp_years,
        v_app.experience_years,
        FALSE, -- لا توثيق تلقائي
        v_rate, -- الحد الأدنى للسعر
        v_rate, -- الحد الأعلى مطابق للحد الأدنى دون زيادة تلقائية
        COALESCE(v_app.currency, 'ج.م'),
        COALESCE(v_app.session_duration_minutes, 50),
        20, -- مدة الحصة التجريبية الافتراضية
        NULL, -- rating فارغ لمعلم جديد بدون تقييمات
        0,    -- reviews_count = 0
        0,
        v_app.bio_and_methodology,
        v_app.bio_and_methodology,
        '{}'::TEXT[], -- مصفوفة فارغة بدلاً من نصوص مصطنعة
        '{}'::TEXT[],
        FALSE, -- غير منشور دائماً حتى يتم تجهيز الملف وفحصه إدارياً
        NOW(),
        NOW()
    );

    -- 2. إدخال المؤهل في جدول tutor_qualifications:
    -- verified = FALSE، institution تترك NULL إذا لم يحددها المعلم
    IF NULLIF(TRIM(v_app.academic_degree), '') IS NOT NULL THEN
        INSERT INTO public.tutor_qualifications (
            tutor_id,
            title,
            institution,
            verified,
            notes,
            display_order
        ) VALUES (
            v_slug,
            TRIM(v_app.academic_degree),
            NULLIF(TRIM(v_app.institution), ''),
            FALSE,
            'تم تسجيله عبر طلب الانضمام ويحتاج مراجعة الشهادة',
            1
        );
    END IF;

    -- 3. إدخال البيانات الحساسة في جدول tutor_private_info
    INSERT INTO public.tutor_private_info (
        tutor_id,
        full_legal_name,
        country_code,
        phone_number,
        whatsapp_number,
        email,
        internal_notes,
        created_at,
        updated_at
    ) VALUES (
        v_slug,
        v_app.full_name,
        COALESCE(v_app.country_code, '+20'),
        v_app.phone,
        COALESCE(v_app.whatsapp_number, v_app.phone),
        v_app.email,
        CONCAT('معتمد من طلب الانضمام: ', v_app.reference_code, CASE WHEN p_admin_notes IS NOT NULL THEN CONCAT(' | ملاحظات: ', p_admin_notes) ELSE '' END),
        NOW(),
        NOW()
    );

    -- 4. ربط التخصصات المدرسية المعتمدة والنشطة فقط
    IF v_app.track = 'school' AND v_resolved_options IS NOT NULL THEN
        FOREACH v_offering_id IN ARRAY v_resolved_options LOOP
            IF EXISTS (
                SELECT 1 FROM public.school_course_options sco
                JOIN public.educational_grades eg ON eg.id = sco.grade_id AND eg.is_active = TRUE
                JOIN public.educational_stages es ON es.id = eg.stage_id AND es.is_active = TRUE
                JOIN public.subjects s ON s.id = sco.subject_id AND s.is_active = TRUE
                JOIN public.curriculum_types ct ON ct.id = sco.curriculum_id AND ct.is_active = TRUE
                WHERE sco.id = v_offering_id AND sco.is_active = TRUE
            ) THEN
                INSERT INTO public.tutor_school_offerings (tutor_id, course_option_id)
                VALUES (v_slug, v_offering_id)
                ON CONFLICT (tutor_id, course_option_id) DO NOTHING;
            END IF;
        END LOOP;
    END IF;

    -- 5. ربط تخصصات القرآن المعتمدة والنشطة فقط
    IF v_app.track = 'quran' AND v_app.quran_offerings IS NOT NULL THEN
        FOR v_quran_item IN SELECT arr.qitem FROM jsonb_array_elements(v_app.quran_offerings) AS arr(qitem) LOOP
            IF EXISTS (
                SELECT 1 FROM public.quran_age_groups WHERE id = TRIM(v_quran_item->>'ageGroupId') AND is_active = TRUE
            ) AND EXISTS (
                SELECT 1 FROM public.quran_levels WHERE id = TRIM(v_quran_item->>'levelId') AND is_active = TRUE
            ) THEN
                INSERT INTO public.tutor_quran_offerings (tutor_id, age_group_id, level_id)
                VALUES (v_slug, TRIM(v_quran_item->>'ageGroupId'), TRIM(v_quran_item->>'levelId'))
                ON CONFLICT (tutor_id, age_group_id, level_id) DO NOTHING;
            END IF;
        END LOOP;
    END IF;

    -- 6. تحديث سجل الطلب وربطه بالمعلم
    UPDATE public.tutor_applications SET
        status = 'approved',
        applicant_tutor_id = v_slug,
        admin_notes = COALESCE(NULLIF(TRIM(p_admin_notes), ''), admin_notes),
        reviewed_at = NOW(),
        reviewed_by = auth.uid(),
        updated_at = NOW()
    WHERE id = p_application_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'tutorId', v_slug,
        'applicationId', p_application_id,
        'message', 'تم اعتماد الطلب بنجاح وإنشاء ملف المعلم بحالة "غير منشور" في انتظار مراجعة الإدارة وتدقيق المؤهلات.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_tutor_application(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_tutor_application(UUID, TEXT, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 6. Atomic RPC: admin_review_tutor_application
-- مراجعة وتحديث حالة الطلب (استكمال بيانات أو رفض) مع حماية الحالات الحالية
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_review_tutor_application(
    p_application_id UUID,
    p_status TEXT,
    p_admin_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_curr_status TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية مخصصة لمديري النظام فقط.';
    END IF;

    IF p_status NOT IN ('needs_info', 'rejected') THEN
        RAISE EXCEPTION 'الحالة المحددة غير صالحة لهذه العملية (يجب أن تكون needs_info أو rejected).';
    END IF;

    IF NULLIF(TRIM(p_admin_notes), '') IS NULL THEN
        RAISE EXCEPTION 'يجب كتابة ملاحظات وتوجيهات واضحة للمعلم عند طلب الاستكمال أو الرفض.';
    END IF;

    -- قفل وفحص السجل
    SELECT status INTO v_curr_status
    FROM public.tutor_applications
    WHERE id = p_application_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'طلب الانضمام المحدد غير موجود.';
    END IF;

    -- منع تغيير طلب مقبول أو مرفوض مسبقاً بشكل غير مقصود
    IF v_curr_status NOT IN ('submitted', 'needs_info') THEN
        IF v_curr_status = 'approved' THEN
            RAISE EXCEPTION 'لا يمكن تعديل حالة طلب معتمد ومقبول بالفعل.';
        ELSIF v_curr_status = 'rejected' THEN
            RAISE EXCEPTION 'هذا الطلب مسجل كمرفوض بالفعل مسبقاً ولا يمكن مراجعته مجدداً دون إعادة فتحه.';
        ELSIF v_curr_status = 'draft' THEN
            RAISE EXCEPTION 'هذا الطلب ما زال مسودة ولم يتم إرساله للمراجعة بعد.';
        ELSE
            RAISE EXCEPTION 'حالة الطلب الحالية (%) لا تسمح بالمراجعة.', v_curr_status;
        END IF;
    END IF;

    UPDATE public.tutor_applications SET
        status = p_status,
        admin_notes = TRIM(p_admin_notes),
        reviewed_at = NOW(),
        reviewed_by = auth.uid(),
        updated_at = NOW()
    WHERE id = p_application_id;

    RETURN jsonb_build_object('success', TRUE, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_tutor_application(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_tutor_application(UUID, TEXT, TEXT) TO authenticated, service_role;

COMMIT;
