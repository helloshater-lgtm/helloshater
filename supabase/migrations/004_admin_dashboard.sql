-- ==============================================================================
-- Shatir Classes (شاطر كلاسيز) - Supabase Migration: 004_admin_dashboard.sql
-- Description: لوحة تحكم المشرفين وإدارة المعلمين والتخصصات والمواعيد
-- Security & Enhancements:
--   1. ترتيب الحفظ والنشر الذري: تُحفظ البيانات والتخصصات أولاً ثم تُطبق حالة النشر المستهدفة ليعمل فحص الجاهزية على البيانات النهائية.
--   2. توحيد ترتيب الأقفال: قفل صف المعلم أولاً FOR UPDATE ثم صف الموعد ثانياً لمنع التعارضات الميتة deadlocks والتضارب في المواعيد المتزامنة.
--   3. فحص تأكيد الحجز الصارم: رفض الحجز إذا كان محجوزاً أو مغلقاً إدارياً أو انقضى وقت بدايته وفق المنطقة الزمنية المخزنة.
--   4. إضافة حالتي is_booked و booked_at صراحة في جدول tutor_available_slots دون الاعتماد على migration 003.
--   5. حظر إعادة فتح أو حذف المواعيد المحجوزة المؤكدة للحفاظ على سجلات الطلاب.
--   6. حماية notes عبر حصر SELECT العام على الأعمدة العامة واستخدام RPC للمشرفين.
--   7. مدة الحصة التجريبية الافتراضية 20 دقيقة.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Table: admin_users (جدول حسابات الإدارة المعتمدة)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_users (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_users_active ON public.admin_users(is_active);

DROP TRIGGER IF EXISTS trg_admin_users_updated_at ON public.admin_users;
CREATE TRIGGER trg_admin_users_updated_at
BEFORE UPDATE ON public.admin_users
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.admin_users IS 'حسابات إدارة منصة شاطر المعتمدة والمرتبطة بـ auth.users';

-- سحب صريح لكافة الصلاحيات من الجميع على جدول المشرفين
REVOKE ALL ON public.admin_users FROM PUBLIC, anon, authenticated;
-- السماح فقط بالقراءة للمستخدمين المسجلين (مقيّدة بالـ RLS أدناه لرؤية سجله المفعل فقط)
GRANT SELECT ON public.admin_users TO authenticated;
GRANT ALL ON public.admin_users TO service_role;

-- ------------------------------------------------------------------------------
-- 2. Columns: Explicit Booking State in tutor_available_slots
-- ------------------------------------------------------------------------------
ALTER TABLE public.tutor_available_slots 
    ADD COLUMN IF NOT EXISTS is_booked BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.tutor_available_slots 
    ADD COLUMN IF NOT EXISTS booked_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_slots_booked 
    ON public.tutor_available_slots(is_booked);

-- ------------------------------------------------------------------------------
-- 3. Security Helper Function: is_admin()
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE user_id = auth.uid()
          AND is_active = TRUE
    );
$$;

COMMENT ON FUNCTION public.is_admin() IS 'التحقق البرمجي من أن المستخدم الحالي مسجل ومفعل في جدول admin_users';

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4. Explicit Enable of Row Level Security (RLS) on ALL Tables
-- ------------------------------------------------------------------------------
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_private_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_school_offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_quran_offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_methodology_pillars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_trial_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_subjects_taught_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_available_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_course_options ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 5. RLS Policy on admin_users: read own active record only
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view own admin profile" ON public.admin_users;
CREATE POLICY "Admins can view own admin profile"
ON public.admin_users FOR SELECT TO authenticated
USING (user_id = auth.uid() AND is_active = TRUE);

DROP POLICY IF EXISTS "Service role full control on admin_users" ON public.admin_users;
CREATE POLICY "Service role full control on admin_users"
ON public.admin_users FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 6. RLS Policies on Tutors and Sub-tables (Only is_admin() can write)
-- ------------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tutors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tutor_private_info TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tutor_qualifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tutor_school_offerings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tutor_quran_offerings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tutor_methodology_pillars TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tutor_trial_steps TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tutor_subjects_taught_summary TO authenticated;

-- school_course_options: قراءة فقط؛ لا منح للكتابة للمستخدمين
GRANT SELECT ON public.school_course_options TO authenticated;

-- A. tutors
DROP POLICY IF EXISTS "Admins can view all tutors" ON public.tutors;
CREATE POLICY "Admins can view all tutors"
ON public.tutors FOR SELECT TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert tutors" ON public.tutors;
CREATE POLICY "Admins can insert tutors"
ON public.tutors FOR INSERT TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update tutors" ON public.tutors;
CREATE POLICY "Admins can update tutors"
ON public.tutors FOR UPDATE TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete tutors" ON public.tutors;
CREATE POLICY "Admins can delete tutors"
ON public.tutors FOR DELETE TO authenticated
USING (public.is_admin());

-- B. tutor_private_info
DROP POLICY IF EXISTS "Admins can manage tutor private info" ON public.tutor_private_info;
CREATE POLICY "Admins can manage tutor private info"
ON public.tutor_private_info FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- C. tutor_qualifications
DROP POLICY IF EXISTS "Admins can manage tutor qualifications" ON public.tutor_qualifications;
CREATE POLICY "Admins can manage tutor qualifications"
ON public.tutor_qualifications FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- D. tutor_school_offerings
DROP POLICY IF EXISTS "Admins can manage tutor school offerings" ON public.tutor_school_offerings;
CREATE POLICY "Admins can manage tutor school offerings"
ON public.tutor_school_offerings FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- E. tutor_quran_offerings
DROP POLICY IF EXISTS "Admins can manage tutor quran offerings" ON public.tutor_quran_offerings;
CREATE POLICY "Admins can manage tutor quran offerings"
ON public.tutor_quran_offerings FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- F. Sub-entities
DROP POLICY IF EXISTS "Admins can manage tutor methodology pillars" ON public.tutor_methodology_pillars;
CREATE POLICY "Admins can manage tutor methodology pillars"
ON public.tutor_methodology_pillars FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage tutor trial steps" ON public.tutor_trial_steps;
CREATE POLICY "Admins can manage tutor trial steps"
ON public.tutor_trial_steps FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage tutor subjects summary" ON public.tutor_subjects_taught_summary;
CREATE POLICY "Admins can manage tutor subjects summary"
ON public.tutor_subjects_taught_summary FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- 7. Column-level Security on tutor_available_slots (Protecting 'notes')
-- ------------------------------------------------------------------------------
REVOKE ALL ON public.tutor_available_slots FROM PUBLIC, anon, authenticated;

-- منح قراءة الأعمدة العامة فقط (بدون notes) للزائر والمستخدم العادي
GRANT SELECT (id, tutor_id, slot_date, start_time, end_time, timezone, is_available, is_booked, booked_at, created_at, updated_at)
    ON public.tutor_available_slots TO anon, authenticated;

GRANT ALL ON public.tutor_available_slots TO service_role;

-- ------------------------------------------------------------------------------
-- 8. Trigger & Check Function: Comprehensive Verification Before Publishing
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

DROP TRIGGER IF EXISTS trg_check_tutor_publish ON public.tutors;
CREATE TRIGGER trg_check_tutor_publish
BEFORE INSERT OR UPDATE OF is_published ON public.tutors
FOR EACH ROW
EXECUTE FUNCTION public.check_tutor_publish_readiness();

-- ------------------------------------------------------------------------------
-- 9. RPC: Atomic Tutor Save (معاملة ذرية مع ترتيب الحفظ والنشر الصحيح)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_save_tutor(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_tutor_id TEXT;
    v_is_new BOOLEAN;
    v_existing_id TEXT;
    v_target_publish BOOLEAN;
    v_qual JSONB;
    v_pillar JSONB;
    v_step JSONB;
    v_offering UUID;
    v_quran_offering JSONB;
    v_pinfo JSONB;
    v_idx INTEGER;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية مخصصة لمديري النظام فقط.';
    END IF;

    v_tutor_id := LOWER(TRIM(p_payload->>'id'));
    v_is_new := COALESCE((p_payload->>'isNew')::BOOLEAN, FALSE);

    IF v_tutor_id IS NULL OR v_tutor_id = '' OR NOT (v_tutor_id ~ '^[a-z0-9-]+$') THEN
        RAISE EXCEPTION 'معرف المعلم (Slug) غير صالح: يجب أن يتكون من أحرف إنجليزية وأرقام وشرطات فقط.';
    END IF;

    -- قفل صف المعلم فوراً إذا كان تعديلاً
    IF NOT v_is_new THEN
        SELECT id INTO v_existing_id FROM public.tutors WHERE id = v_tutor_id FOR UPDATE;
        IF v_existing_id IS NULL THEN
            RAISE EXCEPTION 'المعلم المطلوب تعديله (%) غير موجود في قاعدة البيانات.', v_tutor_id;
        END IF;
    ELSE
        SELECT id INTO v_existing_id FROM public.tutors WHERE id = v_tutor_id;
        IF v_existing_id IS NOT NULL THEN
            RAISE EXCEPTION 'معرف المعلم (%) مستخدم بالفعل، يرجى اختيار معرف آخر.', v_tutor_id;
        END IF;
    END IF;

    -- تحديد حالة النشر المستهدفة (المعلم الجديد يُحفظ غير منشور افتراضياً)
    IF p_payload ? 'isPublished' THEN
        v_target_publish := (p_payload->>'isPublished')::BOOLEAN;
    ELSE
        IF v_is_new THEN
            v_target_publish := FALSE;
        ELSE
            SELECT is_published INTO v_target_publish FROM public.tutors WHERE id = v_tutor_id;
        END IF;
    END IF;

    -- 1. حفظ / تحديث السجل الأساسي في tutors
    -- ملاحظة حاسمة: المعلم الجديد يُدرج دائماً مع is_published = FALSE أولاً
    -- حتى لا يعمل تريجر trg_check_tutor_publish مبكراً قبل حفظ التخصصات في الجداول التابعة
    IF v_is_new THEN
        IF NULLIF(TRIM(p_payload->>'name'), '') IS NULL THEN
            RAISE EXCEPTION 'اسم المعلم مطلوب عند إنشاء معلم جديد.';
        END IF;
        IF NULLIF(TRIM(p_payload->>'headline'), '') IS NULL THEN
            RAISE EXCEPTION 'العنوان التعريفي للمعلم مطلوب عند إنشاء معلم جديد.';
        END IF;

        INSERT INTO public.tutors (
            id, name, honorific, headline, avatar_url,
            years_of_experience, experience_badge_text, verified_credentials,
            curriculum_tags, hourly_rate_min, hourly_rate_max, currency,
            session_duration_minutes, trial_duration_minutes,
            help_child_quote, help_child_summary, target_student_cases,
            is_published, created_at, updated_at
        ) VALUES (
            v_tutor_id,
            TRIM(p_payload->>'name'),
            COALESCE(NULLIF(TRIM(p_payload->>'honorific'), ''), 'أ.'),
            TRIM(p_payload->>'headline'),
            NULLIF(TRIM(p_payload->>'avatarUrl'), ''),
            COALESCE((p_payload->>'yearsOfExperience')::INTEGER, 0),
            NULLIF(TRIM(p_payload->>'experienceBadgeText'), ''),
            COALESCE((p_payload->>'verifiedCredentials')::BOOLEAN, FALSE),
            COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'curriculumTags')), '{}'),
            COALESCE((p_payload->>'hourlyRateMin')::INTEGER, 0),
            COALESCE((p_payload->>'hourlyRateMax')::INTEGER, 0),
            COALESCE(NULLIF(TRIM(p_payload->>'currency'), ''), 'ج.م'),
            COALESCE((p_payload->>'sessionDurationMinutes')::INTEGER, 50),
            COALESCE((p_payload->>'trialDurationMinutes')::INTEGER, 20), -- الافتراضي 20 دقيقة
            NULLIF(TRIM(p_payload->>'helpChildQuote'), ''),
            NULLIF(TRIM(p_payload->>'helpChildSummary'), ''),
            COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'targetStudentCases')), '{}'),
            FALSE, -- دائماً غير منشور أولاً
            NOW(), NOW()
        );
    ELSE
        -- تحديث البيانات الأساسية دون تغيير حالة النشر في هذه الخطوة
        UPDATE public.tutors SET
            name = CASE WHEN p_payload ? 'name' THEN TRIM(p_payload->>'name') ELSE name END,
            honorific = CASE WHEN p_payload ? 'honorific' THEN COALESCE(NULLIF(TRIM(p_payload->>'honorific'), ''), 'أ.') ELSE honorific END,
            headline = CASE WHEN p_payload ? 'headline' THEN TRIM(p_payload->>'headline') ELSE headline END,
            avatar_url = CASE WHEN p_payload ? 'avatarUrl' THEN NULLIF(TRIM(p_payload->>'avatarUrl'), '') ELSE avatar_url END,
            years_of_experience = CASE WHEN p_payload ? 'yearsOfExperience' THEN (p_payload->>'yearsOfExperience')::INTEGER ELSE years_of_experience END,
            experience_badge_text = CASE WHEN p_payload ? 'experienceBadgeText' THEN NULLIF(TRIM(p_payload->>'experienceBadgeText'), '') ELSE experience_badge_text END,
            verified_credentials = CASE WHEN p_payload ? 'verifiedCredentials' THEN (p_payload->>'verifiedCredentials')::BOOLEAN ELSE verified_credentials END,
            curriculum_tags = CASE WHEN p_payload ? 'curriculumTags' THEN COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'curriculumTags')), '{}') ELSE curriculum_tags END,
            hourly_rate_min = CASE WHEN p_payload ? 'hourlyRateMin' THEN (p_payload->>'hourlyRateMin')::INTEGER ELSE hourly_rate_min END,
            hourly_rate_max = CASE WHEN p_payload ? 'hourlyRateMax' THEN (p_payload->>'hourlyRateMax')::INTEGER ELSE hourly_rate_max END,
            currency = CASE WHEN p_payload ? 'currency' THEN COALESCE(NULLIF(TRIM(p_payload->>'currency'), ''), 'ج.م') ELSE currency END,
            session_duration_minutes = CASE WHEN p_payload ? 'sessionDurationMinutes' THEN (p_payload->>'sessionDurationMinutes')::INTEGER ELSE session_duration_minutes END,
            trial_duration_minutes = CASE WHEN p_payload ? 'trialDurationMinutes' THEN (p_payload->>'trialDurationMinutes')::INTEGER ELSE trial_duration_minutes END,
            help_child_quote = CASE WHEN p_payload ? 'helpChildQuote' THEN NULLIF(TRIM(p_payload->>'helpChildQuote'), '') ELSE help_child_quote END,
            help_child_summary = CASE WHEN p_payload ? 'helpChildSummary' THEN NULLIF(TRIM(p_payload->>'helpChildSummary'), '') ELSE help_child_summary END,
            target_student_cases = CASE WHEN p_payload ? 'targetStudentCases' THEN COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'targetStudentCases')), '{}') ELSE target_student_cases END,
            updated_at = NOW()
        WHERE id = v_tutor_id;
    END IF;

    -- 2. حفظ بيانات التواصل الخاصة (فقط إذا أُرسل كائن privateInfo)
    IF p_payload ? 'privateInfo' THEN
        v_pinfo := p_payload->'privateInfo';
        IF v_pinfo IS NOT NULL THEN
            INSERT INTO public.tutor_private_info (
                tutor_id, full_legal_name, national_id_number,
                country_code, phone_number, whatsapp_number, email, internal_notes, updated_at
            ) VALUES (
                v_tutor_id,
                NULLIF(TRIM(v_pinfo->>'fullLegalName'), ''),
                NULLIF(TRIM(v_pinfo->>'nationalIdNumber'), ''),
                COALESCE(NULLIF(TRIM(v_pinfo->>'countryCode'), ''), '+20'),
                COALESCE(NULLIF(TRIM(v_pinfo->>'phoneNumber'), ''), ''),
                NULLIF(TRIM(v_pinfo->>'whatsappNumber'), ''),
                NULLIF(TRIM(v_pinfo->>'email'), ''),
                NULLIF(TRIM(v_pinfo->>'internalNotes'), ''),
                NOW()
            )
            ON CONFLICT (tutor_id) DO UPDATE SET
                full_legal_name = EXCLUDED.full_legal_name,
                national_id_number = EXCLUDED.national_id_number,
                country_code = EXCLUDED.country_code,
                phone_number = EXCLUDED.phone_number,
                whatsapp_number = EXCLUDED.whatsapp_number,
                email = EXCLUDED.email,
                internal_notes = EXCLUDED.internal_notes,
                updated_at = NOW();
        END IF;
    END IF;

    -- 3. تحديث المؤهلات (فقط إذا أُرسلت صراحة)
    IF p_payload ? 'qualifications' THEN
        DELETE FROM public.tutor_qualifications WHERE tutor_id = v_tutor_id;
        v_idx := 1;
        FOR v_qual IN SELECT * FROM jsonb_array_elements(p_payload->'qualifications')
        LOOP
            IF NULLIF(TRIM(v_qual->>'title'), '') IS NOT NULL THEN
                INSERT INTO public.tutor_qualifications (
                    tutor_id, title, institution, verified, notes, display_order
                ) VALUES (
                    v_tutor_id,
                    TRIM(v_qual->>'title'),
                    COALESCE(TRIM(v_qual->>'institution'), ''),
                    COALESCE((v_qual->>'verified')::BOOLEAN, FALSE),
                    NULLIF(TRIM(v_qual->>'notes'), ''),
                    v_idx
                );
                v_idx := v_idx + 1;
            END IF;
        END LOOP;
    END IF;

    -- 4. تحديث ركائز الشرح (فقط إذا أُرسلت صراحة)
    IF p_payload ? 'methodologyPillars' THEN
        DELETE FROM public.tutor_methodology_pillars WHERE tutor_id = v_tutor_id;
        v_idx := 1;
        FOR v_pillar IN SELECT * FROM jsonb_array_elements(p_payload->'methodologyPillars')
        LOOP
            IF NULLIF(TRIM(v_pillar->>'title'), '') IS NOT NULL THEN
                INSERT INTO public.tutor_methodology_pillars (
                    tutor_id, title, description, icon_name, display_order
                ) VALUES (
                    v_tutor_id,
                    TRIM(v_pillar->>'title'),
                    COALESCE(TRIM(v_pillar->>'description'), ''),
                    COALESCE(NULLIF(TRIM(v_pillar->>'iconName'), ''), 'smile'),
                    v_idx
                );
                v_idx := v_idx + 1;
            END IF;
        END LOOP;
    END IF;

    -- 5. تحديث خطوات الحصة التجريبية (فقط إذا أُرسلت صراحة)
    IF p_payload ? 'trialSteps' THEN
        DELETE FROM public.tutor_trial_steps WHERE tutor_id = v_tutor_id;
        v_idx := 1;
        FOR v_step IN SELECT * FROM jsonb_array_elements(p_payload->'trialSteps')
        LOOP
            IF NULLIF(TRIM(v_step->>'title'), '') IS NOT NULL THEN
                INSERT INTO public.tutor_trial_steps (
                    tutor_id, step_number, title, description
                ) VALUES (
                    v_tutor_id,
                    v_idx,
                    TRIM(v_step->>'title'),
                    COALESCE(TRIM(v_step->>'description'), '')
                );
                v_idx := v_idx + 1;
            END IF;
        END LOOP;
    END IF;

    -- 6. تحديث التخصصات المدرسية (فقط إذا أُرسلت صراحة)
    IF p_payload ? 'schoolOfferingOptionIds' THEN
        DELETE FROM public.tutor_school_offerings WHERE tutor_id = v_tutor_id;
        FOR v_offering IN SELECT (value#>>'{}')::UUID FROM jsonb_array_elements(p_payload->'schoolOfferingOptionIds')
        LOOP
            IF EXISTS (SELECT 1 FROM public.school_course_options WHERE id = v_offering AND is_active = TRUE) THEN
                INSERT INTO public.tutor_school_offerings (tutor_id, course_option_id)
                VALUES (v_tutor_id, v_offering)
                ON CONFLICT (tutor_id, course_option_id) DO NOTHING;
            ELSE
                RAISE EXCEPTION 'تركيبة التدريس المحددة (%) غير صالحة أو غير مفعلة في جدول خيارات المواد.', v_offering;
            END IF;
        END LOOP;
    END IF;

    -- 7. تحديث تخصصات القرآن (فقط إذا أُرسلت صراحة)
    IF p_payload ? 'quranOfferings' THEN
        DELETE FROM public.tutor_quran_offerings WHERE tutor_id = v_tutor_id;
        FOR v_quran_offering IN SELECT * FROM jsonb_array_elements(p_payload->'quranOfferings')
        LOOP
            INSERT INTO public.tutor_quran_offerings (tutor_id, age_group_id, level_id)
            VALUES (
                v_tutor_id,
                TRIM(v_quran_offering->>'ageGroupId'),
                TRIM(v_quran_offering->>'levelId')
            )
            ON CONFLICT (tutor_id, age_group_id, level_id) DO NOTHING;
        END LOOP;
    END IF;

    -- 8. تطبيق حالة النشر المستهدفة بعد اكتمال حفظ التخصصات والمؤهلات
    -- هنا فقط يُحدّث عمود is_published، فيعمل تريجر trg_check_tutor_publish ويرى التخصصات المحفوظة
    UPDATE public.tutors
    SET is_published = v_target_publish,
        updated_at = NOW()
    WHERE id = v_tutor_id;

    -- فحص تأكيدي إضافي إذا كان المعلم منشوراً
    IF v_target_publish = TRUE THEN
        PERFORM 1 FROM public.tutors t
        WHERE t.id = v_tutor_id
          AND (
            EXISTS (
                SELECT 1
                FROM public.tutor_school_offerings tso
                JOIN public.school_course_options sco ON sco.id = tso.course_option_id
                JOIN public.educational_grades eg ON eg.id = sco.grade_id
                JOIN public.educational_stages es ON es.id = eg.stage_id
                JOIN public.subjects s ON s.id = sco.subject_id
                JOIN public.curriculum_types ct ON ct.id = sco.curriculum_id
                WHERE tso.tutor_id = v_tutor_id
                  AND sco.is_active = TRUE
                  AND eg.is_active = TRUE
                  AND es.is_active = TRUE
                  AND s.is_active = TRUE
                  AND ct.is_active = TRUE
            ) OR EXISTS (
                SELECT 1
                FROM public.tutor_quran_offerings tqo
                JOIN public.quran_age_groups qag ON qag.id = tqo.age_group_id
                JOIN public.quran_levels ql ON ql.id = tqo.level_id
                WHERE tqo.tutor_id = v_tutor_id
                  AND qag.is_active = TRUE
                  AND ql.is_active = TRUE
            )
          );

        IF NOT FOUND THEN
            RAISE EXCEPTION 'لا يمكن حفظ المعلم كمنشور: يجب ربط تخصص تدريسي واحد على الأقل مفعّل بالكامل في الجداول المرجعية (أكاديمي مدرسي أو قرآني).';
        END IF;
    END IF;

    RETURN jsonb_build_object('success', TRUE, 'tutorId', v_tutor_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_tutor(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_tutor(JSONB) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 10. RPC: Set Publish Status
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_tutor_publish_status(
    p_tutor_id TEXT,
    p_publish BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية مخصصة لمديري النظام فقط.';
    END IF;

    -- قفل صف المعلم للتحقق والتحديث
    PERFORM 1 FROM public.tutors WHERE id = p_tutor_id FOR UPDATE;

    UPDATE public.tutors
    SET is_published = p_publish,
        updated_at = NOW()
    WHERE id = p_tutor_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'المعلم المطلوب غير موجود.';
    END IF;

    RETURN p_publish;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_tutor_publish_status(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_tutor_publish_status(TEXT, BOOLEAN) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 11. RPC: Admin Slots Management & Unified Lock Ordering & Validation
-- ------------------------------------------------------------------------------
-- أ. قراءة المواعيد بكافة الحقول للإدارة فقط (بما فيها notes وحالة is_booked)
CREATE OR REPLACE FUNCTION public.admin_get_tutor_slots(p_tutor_id TEXT)
RETURNS TABLE (
    id UUID,
    tutor_id TEXT,
    slot_date DATE,
    start_time TIME,
    end_time TIME,
    timezone TEXT,
    is_available BOOLEAN,
    is_booked BOOLEAN,
    booked_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية مخصصة لمديري النظام فقط.';
    END IF;

    RETURN QUERY
    SELECT 
        s.id, s.tutor_id, s.slot_date, s.start_time, s.end_time,
        s.timezone, s.is_available, s.is_booked, s.booked_at, s.notes, s.created_at, s.updated_at
    FROM public.tutor_available_slots s
    WHERE s.tutor_id = p_tutor_id
    ORDER BY s.slot_date ASC, s.start_time ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_tutor_slots(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_tutor_slots(TEXT) TO authenticated, service_role;

-- ب. إضافة موعد (قفل صف المعلم أولاً لمنع التعارضات المتزامنة بين الطلبات)
CREATE OR REPLACE FUNCTION public.admin_add_slot(
    p_tutor_id TEXT,
    p_slot_date DATE,
    p_start_time TIME,
    p_end_time TIME,
    p_timezone TEXT DEFAULT 'Africa/Cairo',
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_new_id UUID;
    v_now TIMESTAMP;
    v_slot_timestamp TIMESTAMP;
    v_tz TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية مخصصة لمديري النظام فقط.';
    END IF;

    -- 1. قفل صف المعلم أولاً لتوحيد ترتيب الأقفال ومنع إضافة مواعيد متداخلة متزامنة
    PERFORM 1 FROM public.tutors WHERE id = p_tutor_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'المعلم المحدد (%) غير موجود.', p_tutor_id;
    END IF;

    v_tz := COALESCE(NULLIF(TRIM(p_timezone), ''), 'Africa/Cairo');
    IF v_tz != 'Africa/Cairo' THEN
        RAISE EXCEPTION 'المنطقة الزمنية المعتمدة هي Africa/Cairo فقط.';
    END IF;

    IF p_end_time <= p_start_time THEN
        RAISE EXCEPTION 'وقت نهاية الموعد يجب أن يكون بعد وقت البداية.';
    END IF;

    -- حساب التوقيت المستقبلي وفق المنطقة الزمنية
    v_now := NOW() AT TIME ZONE v_tz;
    v_slot_timestamp := (p_slot_date || ' ' || p_start_time)::TIMESTAMP;

    IF v_slot_timestamp <= v_now THEN
        RAISE EXCEPTION 'لا يمكن إضافة موعد في الماضي أو في وقت انقضى اليوم وفق توقيت %.', v_tz;
    END IF;

    -- فحص تعارض الأوقات ضد المواعيد المتاحة أو المواعيد المحجوزة المؤكدة للمعلم نفسه
    IF EXISTS (
        SELECT 1 FROM public.tutor_available_slots
        WHERE tutor_id = p_tutor_id
          AND slot_date = p_slot_date
          AND (is_available = TRUE OR is_booked = TRUE)
          AND (p_start_time < end_time AND p_end_time > start_time)
    ) THEN
        RAISE EXCEPTION 'يوجد موعد آخر (متاح أو مؤكد الحجز) يتعارض زمنياً مع هذا التوقيت.';
    END IF;

    INSERT INTO public.tutor_available_slots (
        tutor_id, slot_date, start_time, end_time, timezone, is_available, is_booked, notes
    ) VALUES (
        p_tutor_id, p_slot_date, p_start_time, p_end_time,
        v_tz,
        TRUE,
        FALSE,
        NULLIF(TRIM(p_notes), '')
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_add_slot(TEXT, DATE, TIME, TIME, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_slot(TEXT, DATE, TIME, TIME, TEXT, TEXT) TO authenticated, service_role;

-- ج. تأكيد حجز الموعد لطالب رسميًا (قفل صف المعلم ثم صف الموعد وفحص دقيق)
CREATE OR REPLACE FUNCTION public.admin_confirm_slot_booking(
    p_slot_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_tutor_id TEXT;
    v_slot RECORD;
    v_now TIMESTAMP;
    v_slot_timestamp TIMESTAMP;
    v_tz TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية مخصصة لمديري النظام فقط.';
    END IF;

    -- معرفة المعلم المرتبط بالموعد
    SELECT tutor_id INTO v_tutor_id FROM public.tutor_available_slots WHERE id = p_slot_id;
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'الموعد المحدد غير موجود.';
    END IF;

    -- 1. قفل صف المعلم أولاً لتوحيد ترتيب الأقفال
    PERFORM 1 FROM public.tutors WHERE id = v_tutor_id FOR UPDATE;

    -- 2. قفل صف الموعد ثانياً وإعادة قراءة حالته بالكامل بعد الحصول على القفل
    SELECT * INTO v_slot FROM public.tutor_available_slots WHERE id = p_slot_id FOR UPDATE;
    IF v_slot.id IS NULL THEN
        RAISE EXCEPTION 'الموعد المحدد غير موجود.';
    END IF;

    -- الشرط 1: رفض الموعد إذا كان محجوزاً بالفعل مسبقاً
    IF v_slot.is_booked = TRUE THEN
        RAISE EXCEPTION 'لا يمكن تأكيد الحجز: الموعد محجوز ومؤكد بالفعل مسبقاً.';
    END IF;

    -- الشرط 2: رفض الموعد إذا كان مغلقاً إدارياً وغير متاح
    IF v_slot.is_available = FALSE THEN
        RAISE EXCEPTION 'لا يمكن تأكيد الحجز: الموعد مغلق إدارياً وغير متاح للحجز.';
    END IF;

    -- الشرط 3: رفض الموعد إذا انتهى وقت بدايته وفق المنطقة الزمنية المخزنة
    v_tz := COALESCE(NULLIF(TRIM(v_slot.timezone), ''), 'Africa/Cairo');
    v_now := NOW() AT TIME ZONE v_tz;
    v_slot_timestamp := (v_slot.slot_date || ' ' || v_slot.start_time)::TIMESTAMP;

    IF v_slot_timestamp <= v_now THEN
        RAISE EXCEPTION 'لا يمكن تأكيد الحجز: انقضى وقت بداية الموعد بتوقيت %.', v_tz;
    END IF;

    -- تأكيد الحجز: ضبط is_booked=TRUE و is_available=FALSE و booked_at=NOW()
    UPDATE public.tutor_available_slots
    SET is_booked = TRUE,
        is_available = FALSE,
        booked_at = NOW(),
        notes = COALESCE(NULLIF(TRIM(p_notes), ''), notes),
        updated_at = NOW()
    WHERE id = p_slot_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_confirm_slot_booking(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_confirm_slot_booking(UUID, TEXT) TO authenticated, service_role;

-- د. إغلاق إداري / إعادة فتح موعد غير محجوز (قفل المعلم أولاً ثم الموعد ثانياً)
CREATE OR REPLACE FUNCTION public.admin_toggle_slot_availability(
    p_slot_id UUID,
    p_is_available BOOLEAN,
    p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_tutor_id TEXT;
    v_slot RECORD;
    v_now TIMESTAMP;
    v_slot_timestamp TIMESTAMP;
    v_tz TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية مخصصة لمديري النظام فقط.';
    END IF;

    -- معرفة المعلم المرتبط بالموعد
    SELECT tutor_id INTO v_tutor_id FROM public.tutor_available_slots WHERE id = p_slot_id;
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'الموعد المحدد غير موجود.';
    END IF;

    -- 1. قفل صف المعلم أولاً لتوحيد ترتيب الأقفال
    PERFORM 1 FROM public.tutors WHERE id = v_tutor_id FOR UPDATE;

    -- 2. قفل صف الموعد ثانياً وإعادة قراءة حالته بعد الحصول على القفل
    SELECT * INTO v_slot FROM public.tutor_available_slots WHERE id = p_slot_id FOR UPDATE;
    IF v_slot.id IS NULL THEN
        RAISE EXCEPTION 'الموعد المحدد غير موجود.';
    END IF;

    -- حظر التعديل عبر الإغلاق العادي إذا كان الموعد مؤكد الحجز
    IF v_slot.is_booked = TRUE THEN
        RAISE EXCEPTION 'لا يمكن تعديل موعد مؤكد الحجز عبر الإغلاق العادي. الحجز مؤكد لطالب ومحمي بالسجلات.';
    END IF;

    -- إذا كان الإجراء هو إعادة فتح الموعد (is_available = TRUE):
    IF p_is_available = TRUE THEN
        v_tz := COALESCE(NULLIF(TRIM(v_slot.timezone), ''), 'Africa/Cairo');
        v_now := NOW() AT TIME ZONE v_tz;
        v_slot_timestamp := (v_slot.slot_date || ' ' || v_slot.start_time)::TIMESTAMP;

        IF v_slot_timestamp <= v_now THEN
            RAISE EXCEPTION 'لا يمكن إعادة فتح موعد في الماضي أو انقضى وقته اليوم بتوقيت %.', v_tz;
        END IF;

        -- فحص التعارض مع المواعيد الأخرى المتاحة أو المحجوزة للمعلم نفسه
        IF EXISTS (
            SELECT 1 FROM public.tutor_available_slots
            WHERE tutor_id = v_tutor_id
              AND slot_date = v_slot.slot_date
              AND id != p_slot_id
              AND (is_available = TRUE OR is_booked = TRUE)
              AND (v_slot.start_time < end_time AND v_slot.end_time > start_time)
        ) THEN
            RAISE EXCEPTION 'لا يمكن إعادة فتح الموعد لوجود موعد آخر (متاح أو مؤكد) يتعارض معه زمنياً.';
        END IF;
    END IF;

    UPDATE public.tutor_available_slots
    SET is_available = p_is_available,
        notes = COALESCE(NULLIF(TRIM(p_notes), ''), notes),
        updated_at = NOW()
    WHERE id = p_slot_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_toggle_slot_availability(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_toggle_slot_availability(UUID, BOOLEAN, TEXT) TO authenticated, service_role;

-- هـ. حذف موعد (قفل المعلم أولاً ثم الموعد ثانياً، ومحظور تماماً على المواعيد المؤكدة)
CREATE OR REPLACE FUNCTION public.admin_delete_slot(p_slot_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_tutor_id TEXT;
    v_is_booked BOOLEAN;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية مخصصة لمديري النظام فقط.';
    END IF;

    -- معرفة المعلم المرتبط بالموعد
    SELECT tutor_id INTO v_tutor_id FROM public.tutor_available_slots WHERE id = p_slot_id;
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'الموعد المطلوب حذفه غير موجود.';
    END IF;

    -- 1. قفل صف المعلم أولاً
    PERFORM 1 FROM public.tutors WHERE id = v_tutor_id FOR UPDATE;

    -- 2. قفل صف الموعد ثانياً والتحقق من حالته
    SELECT is_booked INTO v_is_booked FROM public.tutor_available_slots WHERE id = p_slot_id FOR UPDATE;
    IF v_is_booked IS NULL THEN
        RAISE EXCEPTION 'الموعد المطلوب حذفه غير موجود.';
    END IF;

    IF v_is_booked = TRUE THEN
        RAISE EXCEPTION 'لا يمكن حذف موعد مؤكد الحجز. الحجوزات المؤكدة محمية للحفاظ على سجلات الطلاب.';
    END IF;

    DELETE FROM public.tutor_available_slots WHERE id = p_slot_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_slot(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_slot(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 12. Storage: tutor-avatars Bucket & Policies
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'tutor-avatars',
    'tutor-avatars',
    TRUE,
    2097152, -- 2MB
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
    public = TRUE,
    file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

DROP POLICY IF EXISTS "Public can view published avatar images" ON storage.objects;
CREATE POLICY "Public can view published avatar images"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'tutor-avatars');

DROP POLICY IF EXISTS "Admins can upload tutor avatars" ON storage.objects;
CREATE POLICY "Admins can upload tutor avatars"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'tutor-avatars'
    AND public.is_admin()
);

DROP POLICY IF EXISTS "Admins can update tutor avatars" ON storage.objects;
CREATE POLICY "Admins can update tutor avatars"
ON storage.objects FOR UPDATE TO authenticated
USING (
    bucket_id = 'tutor-avatars'
    AND public.is_admin()
);

DROP POLICY IF EXISTS "Admins can delete tutor avatars" ON storage.objects;
CREATE POLICY "Admins can delete tutor avatars"
ON storage.objects FOR DELETE TO authenticated
USING (
    bucket_id = 'tutor-avatars'
    AND public.is_admin()
);

COMMIT;
