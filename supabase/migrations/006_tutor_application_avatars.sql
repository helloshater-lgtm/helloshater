-- ==============================================================================
-- Shatir Classes (شاطر كلاسيز) - Supabase Migration: 006_tutor_application_avatars.sql
-- Description: دعم رفع وتخزين ومراجعة الصورة الشخصية الاختيارية لطلبات المعلمين
-- Notes:
--  1. إنشاء دلو تخزين خاص (Private Bucket) باسم 'tutor-application-avatars' بحجم أقصى 2MB
--     وامتدادات مسموحة (image/jpeg, image/png, image/webp) مخصص لصور طلبات التقديم الخاصة.
--  2. عزل صور المتقدمين: المعلم الموثق يرفع ويقرأ ويحذف صوره في مجلده فقط (user_id)،
--     والمديرون (public.is_admin()) يراجعون كافة الصور عبر Signed URLs الخاصة، بينما الزوار والعموم ليس لديهم أي صلاحية وصول مباشرة أو عامة.
--  3. إضافة عمود avatar_path في public.tutor_applications لحفظ المسار النسبي في الدلو الخاص.
--  4. معالجة التوافق الصريح مع قيود NOT NULL في 005 عند حفظ المسودة الجزئية بإسقاط NOT NULL عن
--     الحقول غير المكتملة تدريجياً (full_name, phone, academic_degree, experience_years, bio_and_methodology)،
--     وحفظها كقيم فارغة حقيقية أو NULL بدلاً من أي نصوص مصطنعة («معلم (مسودة)» أو «0000000000»).
--  5. مطابقة الجداول المرجعية الفعلية (school_course_options و educational_grades) بدقة متناهية.
--  6. التحقق الأمني داخل RPC tutor_save_application من ملكية avatar_path للمستخدم الحالي auth.uid()
--     ووجود الملف فعلياً في storage.objects داخل الدلو الخاص tutor-application-avatars، ورفض أي مسار خارجي أو لمستخدم آخر.
--  7. الحفاظ على الصورة السابقة إذا لم يُرسل avatarPath عند التحديث، واشتراط إزالة صريحة عبر removeAvatar.
--  8. الحفاظ على خصوصية الصورة قبل النشر: اعتماد وقبول الطلب ينشئ ملف المعلم دائماً بحالة غير منشورة
--     مع إبقاء الصورة خاصة ومعاينتها للإدارة حصراً عبر Signed URLs. ولا تُنقل الصورة إلى الدلو العام tutor-avatars
--     ولا يُحفظ رابط avatar_url العام إلا ضمن مسار النشر الصريح.
--  9. تعزيز حماية النشر: اشتراط وجود صورة معتمدة (avatar_url غير فارغ) للنشر عبر admin_set_tutor_publish_status
--     وعبر تريجر جاهزية النشر check_tutor_publish_readiness لحماية مسار admin_save_tutor أيضاً.
-- 10. إزالة أي محاولة وهمية لنسخ الكائنات الوصفية metadata في storage.objects من داخل دالة قاعدة البيانات؛
--     وتجهيز دالة إدارية موثوقة admin_get_approved_application_avatar_transfer_info للتحقق الصارم من حالة
--     الطلب (approved) ومطابقة المعلم المستهدف مع اشتراط عدم الخلو، بينما تتولى خدمة الواجهة التنفيذ الفعلي عبر Storage API.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Schema Upgrade: إضافة عمود avatar_path في public.tutor_applications
-- وإتاحة حفظ المسودة الجزئية بإسقاط NOT NULL عن حقول التقديم تدريجياً مع فرضها عند الإرسال
-- دون الحاجة لأي قيم مصطنعة مثل «معلم (مسودة)» أو «0000000000»
-- ------------------------------------------------------------------------------
ALTER TABLE public.tutor_applications 
    ADD COLUMN IF NOT EXISTS avatar_path TEXT DEFAULT NULL;

COMMENT ON COLUMN public.tutor_applications.avatar_path IS 'المسار النسبي للصورة الشخصية للمتقدم داخل دلو tutor-application-avatars الخاص';

-- إتاحة حفظ المسودات الجزئية الخالية دون تعارض مع قيود NOT NULL السابقة في 005
ALTER TABLE public.tutor_applications
    ALTER COLUMN full_name DROP NOT NULL,
    ALTER COLUMN phone DROP NOT NULL,
    ALTER COLUMN academic_degree DROP NOT NULL,
    ALTER COLUMN experience_years DROP NOT NULL,
    ALTER COLUMN bio_and_methodology DROP NOT NULL;

-- ------------------------------------------------------------------------------
-- 2. Storage Bucket: إنشاء أو تحديث دلو tutor-application-avatars كدلو خاص (Private)
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'tutor-application-avatars',
    'tutor-application-avatars',
    FALSE, -- دلو خاص لحماية خصوصية صور المتقدمين
    2097152, -- الحد الأقصى 2MB
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
    public = FALSE,
    file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

-- ------------------------------------------------------------------------------
-- 3. Storage Security Policies: سياسات الوصول لدلو صور الطلبات
-- ------------------------------------------------------------------------------

-- 3.1 حذف السياسات القديمة إن وجدت لضمان إعادة التشغيل الآمنة (Idempotent)
DROP POLICY IF EXISTS "Tutor applicants can upload avatar to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Tutor applicants can view own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Tutor applicants can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Tutor applicants can delete own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view all tutor application avatars" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage all tutor application avatars" ON storage.objects;

-- 3.2 سياسة رفع الصور: المتقدم يرفع في مجلده فقط (storage.foldername(name)[1] = auth.uid()::text)
-- ويُسمح بالرفع فقط إذا كان حساب المعلم موثقاً وحالة طلبه إما جديدة أو مسودة أو needs_info
CREATE POLICY "Tutor applicants can upload avatar to own folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'tutor-application-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (
        NOT EXISTS (
            SELECT 1 FROM public.tutor_applications
            WHERE user_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.tutor_applications
            WHERE user_id = auth.uid()
              AND status IN ('draft', 'needs_info')
        )
        OR public.is_admin()
    )
);

-- 3.3 سياسة قراءة الصور: المتقدم يقرأ صوره الخاصة فقط في مجلده
CREATE POLICY "Tutor applicants can view own avatar"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'tutor-application-avatars'
    AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR public.is_admin()
    )
);

-- 3.4 سياسة استبدال وتحديث الصور: المتقدم يعدل صوره الخاصة فقط في حالتي draft و needs_info
CREATE POLICY "Tutor applicants can update own avatar"
ON storage.objects FOR UPDATE TO authenticated
USING (
    bucket_id = 'tutor-application-avatars'
    AND (
        ((storage.foldername(name))[1] = auth.uid()::text AND EXISTS (
            SELECT 1 FROM public.tutor_applications
            WHERE user_id = auth.uid() AND status IN ('draft', 'needs_info')
        ))
        OR public.is_admin()
    )
)
WITH CHECK (
    bucket_id = 'tutor-application-avatars'
    AND (
        ((storage.foldername(name))[1] = auth.uid()::text AND EXISTS (
            SELECT 1 FROM public.tutor_applications
            WHERE user_id = auth.uid() AND status IN ('draft', 'needs_info')
        ))
        OR public.is_admin()
    )
);

-- 3.5 سياسة حذف الصور: المتقدم يحذف صوره القديمة في مجلده أثناء المسودة أو استكمال البيانات
CREATE POLICY "Tutor applicants can delete own avatar"
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'tutor-application-avatars'
    AND (
        ((storage.foldername(name))[1] = auth.uid()::text AND EXISTS (
            SELECT 1 FROM public.tutor_applications
            WHERE user_id = auth.uid() AND status IN ('draft', 'needs_info')
        ))
        OR public.is_admin()
    )
);

-- 3.6 وصول الإدارة الكامل للقراءة وإدارة كافة صور الطلبات
CREATE POLICY "Admins can view all tutor application avatars"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'tutor-application-avatars'
    AND public.is_admin()
);

CREATE POLICY "Admins can manage all tutor application avatars"
ON storage.objects FOR ALL TO authenticated
USING (
    bucket_id = 'tutor-application-avatars'
    AND public.is_admin()
)
WITH CHECK (
    bucket_id = 'tutor-application-avatars'
    AND public.is_admin()
);

-- ------------------------------------------------------------------------------
-- 4. Atomic RPC Update: public.tutor_save_application
-- مطابقة بنية 005 (school_course_options + educational_grades)
-- والتحقق الأمني من ملكية ووجود الصورة في الدلو الخاص، ودعم الحذف الصريح،
-- وإزالة البيانات المصطنعة للمسودة تماماً
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
    v_avatar_path TEXT;
    v_remove_avatar BOOLEAN := FALSE;
    v_valid_offerings_count INTEGER := 0;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول بحساب المعلم أولاً.';
    END IF;

    -- التحقق من وجود طلب سابق للمستخدم وقفل الصف لمنع التضارب
    SELECT * INTO v_existing FROM public.tutor_applications
    WHERE user_id = v_user_id
    LIMIT 1
    FOR UPDATE;

    IF v_existing.id IS NOT NULL THEN
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

    -- استخراج الحقول الأساسية دون فرض قيم مصطنعة
    v_full_name := NULLIF(TRIM(COALESCE(p_payload->>'fullName', '')), '');
    v_country_code := COALESCE(NULLIF(TRIM(p_payload->>'countryCode'), ''), '+20');
    v_phone := NULLIF(TRIM(COALESCE(p_payload->>'phone', '')), '');
    v_track := TRIM(COALESCE(p_payload->>'track', 'school'));
    v_academic_degree := NULLIF(TRIM(COALESCE(p_payload->>'academicDegree', '')), '');
    v_institution := NULLIF(TRIM(COALESCE(p_payload->>'institution', '')), '');
    v_experience_years := NULLIF(TRIM(COALESCE(p_payload->>'experienceYears', '')), '');
    v_bio := NULLIF(TRIM(COALESCE(p_payload->>'bioAndMethodology', '')), '');

    -- التحقق من مسار التدريس
    IF v_track NOT IN ('school', 'quran') THEN
        RAISE EXCEPTION 'مسار التدريس غير صالح (يجب أن يكون school أو quran).';
    END IF;

    -- السعر ومدة الحصة
    v_rate := COALESCE((p_payload->>'suggestedHourlyRate')::INTEGER, 120);
    IF v_rate <= 0 THEN v_rate := 120; END IF;

    v_duration := COALESCE((p_payload->>'sessionDurationMinutes')::INTEGER, 50);
    IF v_duration <= 0 THEN v_duration := 50; END IF;

    v_terms_accepted := COALESCE((p_payload->>'termsAccepted')::BOOLEAN, FALSE);

    -- معالجة الصورة الشخصية (avatarPath) والتحقق الأمني الدقيق
    v_remove_avatar := COALESCE((p_payload->>'removeAvatar')::BOOLEAN, FALSE);

    IF v_existing.id IS NOT NULL THEN
        IF v_remove_avatar THEN
            v_avatar_path := NULL;
        ELSIF p_payload ? 'avatarPath' THEN
            v_avatar_path := NULLIF(TRIM(COALESCE(p_payload->>'avatarPath', '')), '');
            IF v_avatar_path IS NULL THEN
                v_avatar_path := NULL;
            END IF;
        ELSE
            -- إذا لم يُرسل المفتاح عند التحديث، احتفظ بالصورة السابقة
            v_avatar_path := v_existing.avatar_path;
        END IF;
    ELSE
        -- طلب جديد لأول مرة
        IF v_remove_avatar THEN
            v_avatar_path := NULL;
        ELSE
            v_avatar_path := NULLIF(TRIM(COALESCE(p_payload->>'avatarPath', '')), '');
        END IF;
    END IF;

    -- التحقق الأمني من مسار الصورة إن وجد
    IF v_avatar_path IS NOT NULL THEN
        -- 1. التأكد أن المسار يبدأ بمجلد صاحب الحساب حصراً (auth.uid()/)
        IF NOT (v_avatar_path LIKE v_user_id::text || '/%') THEN
            RAISE EXCEPTION 'غير مصرح: مسار الصورة غير صالح أو لا ينتمي لمجلد حسابك الخاص.';
        END IF;

        -- 2. رفض أي روابط خارجية أو أسماء تلاعب بالمسارات
        IF v_avatar_path LIKE 'http://%' OR v_avatar_path LIKE 'https://%' OR v_avatar_path LIKE '%..%' THEN
            RAISE EXCEPTION 'غير مصرح: صيغة مسار الصورة غير مقبولة ولا يمكن استخدام روابط خارجية.';
        END IF;

        -- 3. التحقق من وجود الملف فعلياً في جدول كائنات التخزين داخل الدلو الخاص
        IF NOT EXISTS (
            SELECT 1 FROM storage.objects
            WHERE bucket_id = 'tutor-application-avatars'
              AND name = v_avatar_path
        ) THEN
            RAISE EXCEPTION 'الصورة المحددة غير موجودة في مجلد التخزين الخاص بالطلبات.';
        END IF;
    END IF;

    -- استخراج التخصصات المدرسية بـ aliases صريحة وفق البنية المعتمدة في 005
    IF p_payload ? 'schoolCourseOptionIds' AND jsonb_typeof(p_payload->'schoolCourseOptionIds') = 'array' THEN
        SELECT COALESCE(ARRAY_AGG(arr.opt_id::UUID), '{}'::UUID[]) INTO v_course_option_ids
        FROM jsonb_array_elements_text(p_payload->'schoolCourseOptionIds') AS arr(opt_id)
        WHERE arr.opt_id IS NOT NULL AND arr.opt_id ~ '^[0-9a-fA-F-]{36}$';
    END IF;

    -- إذا كانت فارغة ولكن تم إرسال schoolSpecializations، نستخرج الخيارات النشطة المطابقة وفق 005
    IF (v_course_option_ids IS NULL OR cardinality(v_course_option_ids) = 0)
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

    -- تكوين quranOfferings عند إرسال الفئات والمستويات
    IF (v_quran_offerings IS NULL OR jsonb_typeof(v_quran_offerings) != 'array' OR jsonb_array_length(v_quran_offerings) = 0)
       AND cardinality(v_q_age_groups) > 0 AND cardinality(v_q_levels) > 0 THEN
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

    -- التدقيق الصارم: فرض الحقول الإلزامية فقط عند الإرسال النهائي p_is_submit
    IF p_is_submit THEN
        IF v_full_name IS NULL THEN RAISE EXCEPTION 'الاسم الكامل مطلوب لإرسال الطلب.'; END IF;
        IF v_phone IS NULL THEN RAISE EXCEPTION 'رقم الهاتف مطلوب لإرسال الطلب.'; END IF;
        IF v_academic_degree IS NULL THEN RAISE EXCEPTION 'المؤهل الأكاديمي مطلوب لإرسال الطلب.'; END IF;
        IF v_experience_years IS NULL THEN RAISE EXCEPTION 'سنوات الخبرة مطلوبة لإرسال الطلب.'; END IF;
        IF v_bio IS NULL THEN RAISE EXCEPTION 'نبذة أسلوب التدريس مطلوبة لإرسال الطلب.'; END IF;

        IF NOT v_terms_accepted THEN
            RAISE EXCEPTION 'يجب الموافقة على وثيقة سياسة التعاون لإرسال الطلب للمراجعة.';
        END IF;

        -- التحقق من التخصصات المدرسية بالبنية الفعلية
        IF v_track = 'school' THEN
            IF cardinality(v_course_option_ids) = 0 THEN
                RAISE EXCEPTION 'يجب اختيار مادة دراسية وصف ومرحلة واحدة على الأقل في مسار المناهج المدرسية.';
            END IF;

            SELECT COUNT(*) INTO v_valid_offerings_count
            FROM public.school_course_options sco
            JOIN public.educational_grades eg ON eg.id = sco.grade_id AND eg.is_active = TRUE
            JOIN public.educational_stages es ON es.id = eg.stage_id AND es.is_active = TRUE
            JOIN public.subjects s ON s.id = sco.subject_id AND s.is_active = TRUE
            JOIN public.curriculum_types ct ON ct.id = sco.curriculum_id AND ct.is_active = TRUE
            WHERE sco.id = ANY(v_course_option_ids)
              AND sco.is_active = TRUE;

            IF v_valid_offerings_count < cardinality(v_course_option_ids) THEN
                RAISE EXCEPTION 'بعض خيارات المواد المدرسية المختارة غير صالحة أو غير نشطة (% من % صالحة فقط).',
                    v_valid_offerings_count, cardinality(v_course_option_ids);
            END IF;
        END IF;

        -- التحقق من مسار القرآن
        IF v_track = 'quran' THEN
            IF cardinality(v_q_age_groups) = 0 OR cardinality(v_q_levels) = 0 THEN
                RAISE EXCEPTION 'يجب اختيار الفئات العمرية ومستويات التأسيس للقرآن الكريم.';
            END IF;
        END IF;

        v_target_status := 'submitted';
        v_policy_accepted_at := NOW();
        v_policy_version := 'v1.0';
    ELSE
        -- حفظ كمسودة؛ يُسمح بمسودة جزئية دون إيقاف على الحقول الناقصة ودون اشتراط الصورة
        -- وبدون أي بيانات مصطنعة
        IF v_existing.status = 'needs_info' THEN
            v_target_status := 'needs_info';
        ELSE
            v_target_status := 'draft';
        END IF;

        IF v_terms_accepted THEN
            v_policy_accepted_at := COALESCE(v_existing.policy_accepted_at, NOW());
            v_policy_version := 'v1.0';
        ELSE
            v_policy_accepted_at := NULL;
            v_policy_version := NULL;
        END IF;
    END IF;

    -- الإدخال أو التحديث
    IF v_existing.id IS NOT NULL THEN
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
            avatar_path = v_avatar_path,
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
            avatar_path,
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
            v_avatar_path,
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
            NULL, -- admin_notes
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
-- 5. Business Rule: الحفاظ على شروط النشر السابقة وإضافة شرط الصورة الشخصية المناسبة
-- تحديث تريجر check_tutor_publish_readiness لحماية جميع مسارات النشر (بما فيها admin_save_tutor)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_tutor_publish_readiness()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    IF NEW.is_published = TRUE THEN
        IF NULLIF(TRIM(NEW.name), '') IS NULL THEN
            RAISE EXCEPTION 'لا يمكن نشر المعلم: اسم المعلم مطلوب.';
        END IF;
        IF NULLIF(TRIM(NEW.headline), '') IS NULL THEN
            RAISE EXCEPTION 'لا يمكن نشر المعلم: العنوان التعريفي مطلوب.';
        END IF;
        IF NEW.session_duration_minutes IS NULL OR NEW.session_duration_minutes <= 0 THEN
            RAISE EXCEPTION 'لا يمكن نشر المعلم: يجب تحديد مدة الحصة بالدقائق.';
        END IF;

        -- الشرط الإلزامي الجديد: وجود صورة شخصية مناسبة ومعتمدة للنشر (وليس للقبول المبدئي)
        IF NEW.avatar_url IS NULL OR TRIM(NEW.avatar_url) = '' THEN
            RAISE EXCEPTION 'لا يمكن نشر ملف المعلم لأولياء الأمور دون إضافة صورة شخصية مناسبة ومعتمدة.';
        END IF;

        -- التحقق من وجود تركيبة مدرسية معتمدة ومفعلة مع تفعيل صفها ومادتها ومنهجها ومرحلتها
        -- أو وجود مسار قرآني معتمد ومفعل مع فئته العمرية ومستواه
        IF NOT EXISTS (
            SELECT 1
            FROM public.tutor_school_offerings tso
            JOIN public.school_course_options sco ON sco.id = tso.course_option_id
            JOIN public.educational_grades eg ON eg.id = sco.grade_id
            JOIN public.educational_stages es ON es.id = eg.stage_id
            JOIN public.subjects s ON s.id = sco.subject_id
            JOIN public.curriculum_types ct ON ct.id = sco.curriculum_id
            WHERE tso.tutor_id = NEW.id
              AND sco.is_active = TRUE
              AND eg.is_active = TRUE
              AND es.is_active = TRUE
              AND s.is_active = TRUE
              AND ct.is_active = TRUE
        ) AND NOT EXISTS (
            SELECT 1
            FROM public.tutor_quran_offerings tqo
            JOIN public.quran_age_groups qag ON qag.id = tqo.age_group_id
            JOIN public.quran_levels ql ON ql.id = tqo.level_id
            WHERE tqo.tutor_id = NEW.id
              AND qag.is_active = TRUE
              AND ql.is_active = TRUE
        ) THEN
            RAISE EXCEPTION 'لا يمكن نشر المعلم: يجب ربط تخصص تدريسي واحد على الأقل مفعّل بالكامل في الجداول المرجعية (أكاديمي مدرسي أو قرآني).';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- تحديث دالة admin_set_tutor_publish_status لتطبيق التحقق نفسه بدقة
CREATE OR REPLACE FUNCTION public.admin_set_tutor_publish_status(
    p_tutor_id TEXT,
    p_publish BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_tutor RECORD;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية مخصصة لمديري النظام فقط.';
    END IF;

    -- قفل صف المعلم للتحقق والتحديث
    SELECT * INTO v_tutor
    FROM public.tutors
    WHERE id = p_tutor_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'المعلم المطلوب غير موجود.';
    END IF;

    -- شرط الصورة الشخصية المناسبة للنشر
    IF p_publish AND (v_tutor.avatar_url IS NULL OR TRIM(v_tutor.avatar_url) = '') THEN
        RAISE EXCEPTION 'لا يمكن نشر ملف المعلم لأولياء الأمور دون إضافة صورة شخصية مناسبة ومعتمدة.';
    END IF;

    UPDATE public.tutors
    SET is_published = p_publish,
        updated_at = NOW()
    WHERE id = p_tutor_id;

    RETURN p_publish;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_tutor_publish_status(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_tutor_publish_status(TEXT, BOOLEAN) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 6. RPC: تجهيز بيانات نقل صورة الطلب إلى المعلم (admin_get_approved_application_avatar_transfer_info)
-- يقتصر عمل قاعدة البيانات على التحقق الصارم بأن الطلب بحالة approved، وأن applicant_tutor_id
-- غير فارغ ويطابق المعلم المستهدف تماماً (IS DISTINCT FROM)، وتجهيز المسارات دون إجراء عمليات تخزين وهمية
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_approved_application_avatar_transfer_info(
    p_application_id UUID,
    p_tutor_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_app RECORD;
    v_tutor RECORD;
    v_ext TEXT;
    v_target_name TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: مخصص لمديري النظام فقط.';
    END IF;

    SELECT * INTO v_app FROM public.tutor_applications
    WHERE id = p_application_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'طلب التقديم غير موجود.';
    END IF;

    -- 1. اشتراط حالة approved
    IF v_app.status != 'approved' THEN
        RAISE EXCEPTION 'لا يمكن نقل أو اعتماد صورة الطلب إلا بعد اعتماد وقبول الطلب (حالة approved).';
    END IF;

    -- 2. التحقق الإلزامي من مطابقة المعلم المستهدف (رفض إذا كان فارغاً أو مختلفاً)
    IF v_app.applicant_tutor_id IS NULL OR (v_app.applicant_tutor_id IS DISTINCT FROM p_tutor_id) THEN
        RAISE EXCEPTION 'معرف المعلم المستهدف (%) لا يطابق المعرف المسجل في طلب الاعتماد (%).',
            p_tutor_id, COALESCE(v_app.applicant_tutor_id, 'فارغ');
    END IF;

    -- 3. التحقق من وجود مسار الصورة
    IF v_app.avatar_path IS NULL OR TRIM(v_app.avatar_path) = '' THEN
        RAISE EXCEPTION 'الطلب لا يحتوي على صورة شخصية مرفوعة.';
    END IF;

    SELECT * INTO v_tutor FROM public.tutors
    WHERE id = p_tutor_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ملف المعلم غير موجود.';
    END IF;

    -- استخراج الامتداد وتجهيز المسار المستهدف
    v_ext := split_part(v_app.avatar_path, '.', 2);
    IF v_ext IS NULL OR v_ext = '' THEN
        v_ext := 'jpg';
    END IF;

    v_target_name := 'avatars/' || p_tutor_id || '-' || extract(epoch from now())::bigint || '.' || v_ext;

    -- إرجاع مواصفات النقل فقط للواجهة البرمجية لتنفيذ الرفع والتنزيل الفعلي وتحديث الرابط
    RETURN jsonb_build_object(
        'applicationId', v_app.id,
        'tutorId', v_tutor.id,
        'sourcePath', v_app.avatar_path,
        'sourceBucket', 'tutor-application-avatars',
        'targetPath', v_target_name,
        'targetBucket', 'tutor-avatars',
        'isPublished', v_tutor.is_published
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_approved_application_avatar_transfer_info(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_approved_application_avatar_transfer_info(UUID, TEXT) TO authenticated, service_role;

-- للحفاظ على التوافق مع أي استدعاء قديم لاسم admin_apply_application_avatar_to_tutor
CREATE OR REPLACE FUNCTION public.admin_apply_application_avatar_to_tutor(
    p_application_id UUID,
    p_tutor_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    RETURN public.admin_get_approved_application_avatar_transfer_info(p_application_id, p_tutor_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_apply_application_avatar_to_tutor(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_apply_application_avatar_to_tutor(UUID, TEXT) TO authenticated, service_role;

COMMIT;
