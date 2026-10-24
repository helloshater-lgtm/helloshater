-- ==============================================================================
-- Shatir Classes (شاطر كلاسيز) - Supabase Migration 013 (Corrected & Verified)
-- File: supabase/migrations/013_tutor_private_slot_multi_specializations.sql
-- Description:
--   دعم إتاحة الموعد الخاص المدفوع (1:1) لأكثر من تخصص معتمد كبدائل لنفس الوقت
--   (سعة واحدة 1:1 تُقفل بالكامل عند تأكيد الحجز لأي بديل)، مع الحفاظ الكامل على:
--   1. ضوابط وحمايات Migration 010 (admin_suspended, admin_suspension_notes، حجب
--      الملاحظات الداخلية عن الجمهور، ومنع المعلم من تعديل أو حذف الموعد الموقوف).
--   2. إكمال دورة حياة التخصصات البديلة حتى الحجز والتأكيد الإداري: حفظ التخصص الذي
--      اختاره الطالب داخل tutor_private_bookings والتحقق في الخادم أنه ضمن بدائل
--      الموعد ومعتمد للمعلم، مع الحفاظ على توافق الحجوزات القديمة دون اختراع بيانات لها.
--   3. تحديث tutor_update_private_slot لدعم تعديل البدائل وإعادة التحقق منها، وضمان
--      عضوية التخصص الأساسي في قائمة البدائل، ومنع التكرار أو تناقض المسار والمعرفات،
--      ومعالجة المواعيد القديمة ذات allowed_specializations الفارغة عبر تخصصها الأساسي.
--   4. التحقق الصريح من كافة المدخلات (رفض NULL وأنواع JSON غير الصالحة، وفحص نشاط
--      المرحلة الدراسية educational_stages مع بقية الجداول المرجعية).
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. تحديث بنية الجداول (tutor_private_slots و tutor_private_bookings)
-- ------------------------------------------------------------------------------

-- 1.أ عمود قائمة التخصصات المعتمدة المسموح بحجز الموعد الخاص تحت أي منها
ALTER TABLE public.tutor_private_slots
    ADD COLUMN IF NOT EXISTS allowed_specializations JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.tutor_private_slots.allowed_specializations IS
    'قائمة التخصصات البديلة المعتمدة لنفس وقت الحصة الخاصة (سعة 1:1 موحدة؛ يُقفل الموعد بالكامل عند تأكيد حجز أي تخصص منها)';

-- 1.ب أعمدة التخصص المختار فعلياً للطالب في سجل حجز الحصة الخاصة (يبقى NULL للحجوزات القديمة دون اختراع تخصصات)
ALTER TABLE public.tutor_private_bookings
    ADD COLUMN IF NOT EXISTS offering_course_option_id UUID REFERENCES public.school_course_options(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS quran_age_group_id TEXT REFERENCES public.quran_age_groups(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS quran_level_id TEXT REFERENCES public.quran_levels(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS specialization_label TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_private_booking_specialization_track'
          AND conrelid = 'public.tutor_private_bookings'::regclass
    ) THEN
        ALTER TABLE public.tutor_private_bookings
            ADD CONSTRAINT chk_private_booking_specialization_track CHECK (
                NOT (
                    offering_course_option_id IS NOT NULL
                    AND (quran_age_group_id IS NOT NULL OR quran_level_id IS NOT NULL)
                )
                AND (
                    (quran_age_group_id IS NULL AND quran_level_id IS NULL)
                    OR (quran_age_group_id IS NOT NULL AND quran_level_id IS NOT NULL)
                )
            );
    END IF;
END $$;

COMMENT ON COLUMN public.tutor_private_bookings.specialization_label IS
    'مسمى التخصص الذي اختاره الطالب عند حجز الموعد الخاص (NULL في الحجوزات التاريخية السابقة لـ Migration 013)';

-- ------------------------------------------------------------------------------
-- 2. دالة مساعدة لحل بدائل الموعد شاملةً المواعيد القديمة ذات allowed_specializations الفارغة
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.internal_resolve_slot_allowed_specializations(
    p_allowed_specializations JSONB,
    p_offering_course_option_id UUID,
    p_quran_age_group_id TEXT,
    p_quran_level_id TEXT,
    p_specialization_label TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_allowed_specializations IS NOT NULL
       AND jsonb_typeof(p_allowed_specializations) = 'array'
       AND jsonb_array_length(p_allowed_specializations) > 0 THEN
        RETURN p_allowed_specializations;
    END IF;

    -- معالجة المواعيد القديمة باستخدام تخصصها الأساسي الفعلي دون اختراع بيانات متناقضة
    IF p_offering_course_option_id IS NOT NULL
       AND p_quran_age_group_id IS NULL
       AND p_quran_level_id IS NULL THEN
        RETURN jsonb_build_array(
            jsonb_build_object(
                'track', 'school',
                'courseOptionId', p_offering_course_option_id::TEXT,
                'ageGroupId', NULL,
                'levelId', NULL,
                'label', COALESCE(NULLIF(TRIM(p_specialization_label), ''), 'تخصص مدرسي')
            )
        );
    ELSIF p_offering_course_option_id IS NULL
          AND p_quran_age_group_id IS NOT NULL
          AND p_quran_level_id IS NOT NULL THEN
        RETURN jsonb_build_array(
            jsonb_build_object(
                'track', 'quran',
                'courseOptionId', NULL,
                'ageGroupId', p_quran_age_group_id,
                'levelId', p_quran_level_id,
                'label', COALESCE(NULLIF(TRIM(p_specialization_label), ''), 'قرآن وتأسيس')
            )
        );
    END IF;

    RETURN '[]'::jsonb;
END;
$$;

REVOKE ALL ON FUNCTION public.internal_resolve_slot_allowed_specializations(JSONB, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.internal_resolve_slot_allowed_specializations(JSONB, UUID, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- تعبئة allowed_specializations للمواعيد القديمة التي تملك تخصصاً أساسياً صالحاً ومصفوفة فارغة
UPDATE public.tutor_private_slots s
SET allowed_specializations = public.internal_resolve_slot_allowed_specializations(
    s.allowed_specializations,
    s.offering_course_option_id,
    s.quran_age_group_id,
    s.quran_level_id,
    s.specialization_label
)
WHERE (
    s.allowed_specializations IS NULL
    OR jsonb_typeof(s.allowed_specializations) <> 'array'
    OR jsonb_array_length(s.allowed_specializations) = 0
)
AND (
    (s.offering_course_option_id IS NOT NULL AND s.quran_age_group_id IS NULL AND s.quran_level_id IS NULL)
    OR (s.offering_course_option_id IS NULL AND s.quran_age_group_id IS NOT NULL AND s.quran_level_id IS NOT NULL)
);

-- ------------------------------------------------------------------------------
-- 3. دالة داخلية للتحقق الصارم من مصفوفة التخصصات البديلة للمعلم
--    - تفحص نوع مصفوفة البدائل وعناصرها قبل تفكيكها
--    - تمنع تناقض المسار والمعرفات وتمنع تكرار نفس البديل
--    - تتحقق من نشاط المرحلة الدراسية educational_stages مع بقية المراجع
--    - تضمن أن التخصص الأساسي عضو في قائمة البدائل
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.internal_validate_tutor_specializations_array(TEXT, JSONB, UUID, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.internal_validate_tutor_specializations_array(
    p_tutor_id TEXT,
    p_specializations JSONB,
    p_primary_course_option_id UUID DEFAULT NULL,
    p_primary_quran_age_group_id TEXT DEFAULT NULL,
    p_primary_quran_level_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
STABLE
AS $$
DECLARE
    v_raw_list JSONB;
    v_item JSONB;
    v_track TEXT;
    v_course_id_text TEXT;
    v_course_id UUID;
    v_age_id TEXT;
    v_level_id TEXT;
    v_label TEXT;
    v_key TEXT;
    v_seen_keys TEXT[] := ARRAY[]::TEXT[];
    v_validated JSONB := '[]'::jsonb;
    v_has_explicit_primary BOOLEAN := FALSE;
    v_primary_key TEXT := NULL;
BEGIN
    IF p_tutor_id IS NULL OR TRIM(p_tutor_id) = '' THEN
        RAISE EXCEPTION 'معرف المعلم مطلوب للتحقق من التخصصات.';
    END IF;

    -- 1. التحقق من عدم تناقض معاملات التخصص الأساسي نفسها
    IF p_primary_course_option_id IS NOT NULL
       AND (NULLIF(TRIM(COALESCE(p_primary_quran_age_group_id, '')), '') IS NOT NULL
            OR NULLIF(TRIM(COALESCE(p_primary_quran_level_id, '')), '') IS NOT NULL) THEN
        RAISE EXCEPTION 'تناقض في التخصص الأساسي: لا يمكن الجمع بين تخصص دراسي وتخصص قرآني في نفس البديل.';
    END IF;

    IF (NULLIF(TRIM(COALESCE(p_primary_quran_age_group_id, '')), '') IS NULL)
       <> (NULLIF(TRIM(COALESCE(p_primary_quran_level_id, '')), '') IS NULL) THEN
        RAISE EXCEPTION 'بيانات التخصص القرآني الأساسي ناقصة: يجب تحديد الفئة العمرية والمستوى معاً.';
    END IF;

    IF p_primary_course_option_id IS NOT NULL THEN
        v_has_explicit_primary := TRUE;
        v_primary_key := 'school:' || p_primary_course_option_id::TEXT;
    ELSIF NULLIF(TRIM(COALESCE(p_primary_quran_age_group_id, '')), '') IS NOT NULL THEN
        v_has_explicit_primary := TRUE;
        v_primary_key := 'quran:' || TRIM(p_primary_quran_age_group_id) || ':' || TRIM(p_primary_quran_level_id);
    END IF;

    -- 2. التحقق الصريح من نوع p_specializations قبل تفكيكها
    IF p_specializations IS NOT NULL THEN
        IF jsonb_typeof(p_specializations) <> 'array' THEN
            RAISE EXCEPTION 'صيغة قائمة التخصصات البديلة غير صالحة: يجب أن تكون مصفوفة JSON.';
        END IF;
    END IF;

    IF p_specializations IS NULL OR jsonb_array_length(p_specializations) = 0 THEN
        IF NOT v_has_explicit_primary THEN
            RAISE EXCEPTION 'يجب اختيار تخصص معتمد واحد على الأقل للموعد الخاص.';
        END IF;

        IF p_primary_course_option_id IS NOT NULL THEN
            v_raw_list := jsonb_build_array(
                jsonb_build_object(
                    'track', 'school',
                    'courseOptionId', p_primary_course_option_id::TEXT
                )
            );
        ELSE
            v_raw_list := jsonb_build_array(
                jsonb_build_object(
                    'track', 'quran',
                    'ageGroupId', TRIM(p_primary_quran_age_group_id),
                    'levelId', TRIM(p_primary_quran_level_id)
                )
            );
        END IF;
    ELSE
        v_raw_list := p_specializations;
    END IF;

    -- 3. فحص كل عنصر داخل المصفوفة والتحقق من ملكيته ونشاط كافة الجداول المرجعية
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_raw_list)
    LOOP
        IF v_item IS NULL OR jsonb_typeof(v_item) <> 'object' THEN
            RAISE EXCEPTION 'كل عنصر في قائمة التخصصات البديلة يجب أن يكون كائن JSON صالحاً.';
        END IF;

        v_track := NULLIF(LOWER(TRIM(COALESCE(v_item->>'track', ''))), '');
        v_course_id_text := NULLIF(TRIM(COALESCE(v_item->>'courseOptionId', v_item->>'offeringCourseOptionId', '')), '');
        v_age_id := NULLIF(TRIM(COALESCE(v_item->>'ageGroupId', v_item->>'quranAgeGroupId', '')), '');
        v_level_id := NULLIF(TRIM(COALESCE(v_item->>'levelId', v_item->>'quranLevelId', '')), '');

        -- التحقق من صحة المسار وعدم تناقضه مع المعرفات الممررة
        IF v_track IS NOT NULL AND v_track NOT IN ('school', 'quran') THEN
            RAISE EXCEPTION 'نوع مسار التخصص البديل غير صالح (%): يجب أن يكون school أو quran.', v_track;
        END IF;

        IF v_course_id_text IS NOT NULL AND (v_age_id IS NOT NULL OR v_level_id IS NOT NULL) THEN
            RAISE EXCEPTION 'تناقض في بيانات التخصص البديل: لا يمكن الجمع بين معرف مادة دراسية ومعرفات المسار القرآني في نفس البديل.';
        END IF;

        IF (v_age_id IS NULL) <> (v_level_id IS NULL) THEN
            RAISE EXCEPTION 'بيانات التخصص القرآني البديل ناقصة: يجب تحديد الفئة العمرية والمستوى معاً.';
        END IF;

        IF v_track = 'school' AND (v_course_id_text IS NULL OR v_age_id IS NOT NULL OR v_level_id IS NOT NULL) THEN
            RAISE EXCEPTION 'تناقض في بيانات التخصص المدرسي: يجب تحديد معرف المادة الدراسية فقط دون معرفات قرآنية.';
        END IF;

        IF v_track = 'quran' AND (v_course_id_text IS NOT NULL OR v_age_id IS NULL OR v_level_id IS NULL) THEN
            RAISE EXCEPTION 'تناقض في بيانات التخصص القرآني: يجب تحديد الفئة العمرية والمستوى معاً دون معرف مادة دراسية.';
        END IF;

        IF v_track IS NULL THEN
            IF v_course_id_text IS NOT NULL THEN
                v_track := 'school';
            ELSIF v_age_id IS NOT NULL AND v_level_id IS NOT NULL THEN
                v_track := 'quran';
            ELSE
                RAISE EXCEPTION 'بيانات التخصص البديل فارغة أو ناقصة.';
            END IF;
        END IF;

        IF v_track = 'school' THEN
            BEGIN
                v_course_id := v_course_id_text::UUID;
            EXCEPTION WHEN invalid_text_representation THEN
                RAISE EXCEPTION 'معرف خيار المادة الدراسية غير صالح (يجب أن يكون UUID).';
            END;

            v_key := 'school:' || v_course_id::TEXT;
            IF v_key = ANY(v_seen_keys) THEN
                RAISE EXCEPTION 'لا يمكن تكرار نفس التخصص البديل أكثر من مرة داخل الموعد الواحد.';
            END IF;
            v_seen_keys := array_append(v_seen_keys, v_key);

            -- التحقق من اعتماد التخصص للمعلم ونشاط المادة والصف والمرحلة الدراسية والمنهج
            SELECT (sub.name || ' - ' || eg.name || ' (' || ct.name || ')')
            INTO v_label
            FROM public.tutor_school_offerings tso
            JOIN public.school_course_options sco ON sco.id = tso.course_option_id
            JOIN public.educational_grades eg ON eg.id = sco.grade_id
            JOIN public.educational_stages es ON es.id = eg.stage_id
            JOIN public.subjects sub ON sub.id = sco.subject_id
            JOIN public.curriculum_types ct ON ct.id = sco.curriculum_id
            WHERE tso.tutor_id = p_tutor_id
              AND tso.course_option_id = v_course_id
              AND sco.is_active = TRUE
              AND eg.is_active = TRUE
              AND es.is_active = TRUE
              AND sub.is_active = TRUE
              AND ct.is_active = TRUE;

            IF v_label IS NULL THEN
                RAISE EXCEPTION 'التخصص الدراسي المختار غير معتمد في ملفك الحالي أو أن مرحلته/مادته غير نشطة.';
            END IF;

            v_validated := v_validated || jsonb_build_array(
                jsonb_build_object(
                    'track', 'school',
                    'courseOptionId', v_course_id::TEXT,
                    'ageGroupId', NULL,
                    'levelId', NULL,
                    'label', v_label
                )
            );
        ELSE
            v_key := 'quran:' || v_age_id || ':' || v_level_id;
            IF v_key = ANY(v_seen_keys) THEN
                RAISE EXCEPTION 'لا يمكن تكرار نفس التخصص القرآني أكثر من مرة داخل الموعد الواحد.';
            END IF;
            v_seen_keys := array_append(v_seen_keys, v_key);

            SELECT ('قرآن وتأسيس: ' || ql.name || ' (' || qag.name || ')')
            INTO v_label
            FROM public.tutor_quran_offerings tqo
            JOIN public.quran_age_groups qag ON qag.id = tqo.age_group_id
            JOIN public.quran_levels ql ON ql.id = tqo.level_id
            WHERE tqo.tutor_id = p_tutor_id
              AND tqo.age_group_id = v_age_id
              AND tqo.level_id = v_level_id
              AND qag.is_active = TRUE
              AND ql.is_active = TRUE;

            IF v_label IS NULL THEN
                RAISE EXCEPTION 'تخصص القرآن والتأسيس المختار غير معتمد في ملفك الحالي أو غير نشط.';
            END IF;

            v_validated := v_validated || jsonb_build_array(
                jsonb_build_object(
                    'track', 'quran',
                    'courseOptionId', NULL,
                    'ageGroupId', v_age_id,
                    'levelId', v_level_id,
                    'label', v_label
                )
            );
        END IF;
    END LOOP;

    IF jsonb_array_length(v_validated) = 0 THEN
        RAISE EXCEPTION 'يجب اختيار تخصص معتمد واحد على الأقل للموعد الخاص.';
    END IF;

    -- 4. إذا تم تمرير تخصص أساسي صريح مع قائمة بدائل، يجب أن يكون التخصص الأساسي عضواً في القائمة
    IF v_has_explicit_primary AND NOT (v_primary_key = ANY(v_seen_keys)) THEN
        RAISE EXCEPTION 'يجب أن يكون التخصص الأساسي للموعد عضواً ضمن قائمة التخصصات البديلة المختارة.';
    END IF;

    RETURN v_validated;
END;
$$;

REVOKE ALL ON FUNCTION public.internal_validate_tutor_specializations_array(TEXT, JSONB, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_validate_tutor_specializations_array(TEXT, JSONB, UUID, TEXT, TEXT) TO service_role;

-- ------------------------------------------------------------------------------
-- 4. دالة داخلية للتحقق من تخصص الحجز المختار للطالب ضمن بدائل الموعد واعتماده للمعلم
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.internal_resolve_and_validate_booking_specialization(public.tutor_private_slots, UUID, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.internal_resolve_and_validate_booking_specialization(
    p_slot public.tutor_private_slots,
    p_offering_course_option_id UUID DEFAULT NULL,
    p_quran_age_group_id TEXT DEFAULT NULL,
    p_quran_level_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
STABLE
AS $$
DECLARE
    v_allowed JSONB;
    v_age_id TEXT := NULLIF(TRIM(COALESCE(p_quran_age_group_id, '')), '');
    v_level_id TEXT := NULLIF(TRIM(COALESCE(p_quran_level_id, '')), '');
    v_target_course_id UUID := p_offering_course_option_id;
    v_target_age_id TEXT := v_age_id;
    v_target_level_id TEXT := v_level_id;
    v_matched BOOLEAN := FALSE;
    v_elem JSONB;
    v_validated_arr JSONB;
BEGIN
    -- فحص عدم خلط المسارين في مدخلات الحجز
    IF v_target_course_id IS NOT NULL AND (v_target_age_id IS NOT NULL OR v_target_level_id IS NOT NULL) THEN
        RAISE EXCEPTION 'تناقض في تخصص الحجز: لا يمكن الجمع بين تخصص دراسي وتخصص قرآني في نفس الحجز.';
    END IF;

    IF (v_target_age_id IS NULL) <> (v_target_level_id IS NULL) THEN
        RAISE EXCEPTION 'بيانات التخصص القرآني للحجز ناقصة: يجب تحديد الفئة العمرية والمستوى معاً.';
    END IF;

    -- استرجاع بدائل الموعد الفعلية (مع معالجة المواعيد القديمة الفارغة)
    v_allowed := public.internal_resolve_slot_allowed_specializations(
        p_slot.allowed_specializations,
        p_slot.offering_course_option_id,
        p_slot.quran_age_group_id,
        p_slot.quran_level_id,
        p_slot.specialization_label
    );

    -- حالة عدم تمرير تخصص صريح في طلب الحجز
    IF v_target_course_id IS NULL AND v_target_age_id IS NULL THEN
        IF jsonb_array_length(v_allowed) > 1 THEN
            RAISE EXCEPTION 'هذا الموعد متاح لأكثر من تخصص بديل؛ يرجى تحديد التخصص الذي اختاره الطالب عند تسجيل أو تأكيد الحجز.';
        ELSIF jsonb_array_length(v_allowed) = 1 THEN
            v_elem := v_allowed->0;
            IF (v_elem->>'track') = 'school' OR NULLIF(TRIM(COALESCE(v_elem->>'courseOptionId', '')), '') IS NOT NULL THEN
                v_target_course_id := (v_elem->>'courseOptionId')::UUID;
            ELSIF (v_elem->>'track') = 'quran' OR NULLIF(TRIM(COALESCE(v_elem->>'ageGroupId', '')), '') IS NOT NULL THEN
                v_target_age_id := NULLIF(TRIM(COALESCE(v_elem->>'ageGroupId', '')), '');
                v_target_level_id := NULLIF(TRIM(COALESCE(v_elem->>'levelId', '')), '');
            END IF;
        ELSE
            -- موعد قديم جداً بدون معرفات مرجعية أصلاً: نحافظ على التوافق دون اختراع معرفات
            RETURN jsonb_build_object(
                'track', NULL,
                'courseOptionId', NULL,
                'ageGroupId', NULL,
                'levelId', NULL,
                'label', p_slot.specialization_label
            );
        END IF;
    END IF;

    -- التحقق من أن التخصص المختار هو أحد بدائل هذا الموعد تحديداً
    FOR v_elem IN SELECT * FROM jsonb_array_elements(v_allowed)
    LOOP
        IF v_target_course_id IS NOT NULL THEN
            IF COALESCE(v_elem->>'track', 'school') = 'school'
               AND NULLIF(TRIM(COALESCE(v_elem->>'courseOptionId', '')), '') = v_target_course_id::TEXT THEN
                v_matched := TRUE;
                EXIT;
            END IF;
        ELSIF v_target_age_id IS NOT NULL AND v_target_level_id IS NOT NULL THEN
            IF COALESCE(v_elem->>'track', 'quran') = 'quran'
               AND NULLIF(TRIM(COALESCE(v_elem->>'ageGroupId', '')), '') = v_target_age_id
               AND NULLIF(TRIM(COALESCE(v_elem->>'levelId', '')), '') = v_target_level_id THEN
                v_matched := TRUE;
                EXIT;
            END IF;
        END IF;
    END LOOP;

    IF NOT v_matched THEN
        RAISE EXCEPTION 'التخصص المختار للحجز ليس من ضمن التخصصات البديلة المتاحة لهذا الموعد.';
    END IF;

    -- التحقق في الخادم من أن التخصص المختار معتمد للمعلم ونشط في الجداول المرجعية (شاملاً المرحلة الدراسية)
    v_validated_arr := public.internal_validate_tutor_specializations_array(
        p_slot.tutor_id,
        NULL,
        v_target_course_id,
        v_target_age_id,
        v_target_level_id
    );

    RETURN v_validated_arr->0;
END;
$$;

REVOKE ALL ON FUNCTION public.internal_resolve_and_validate_booking_specialization(public.tutor_private_slots, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_resolve_and_validate_booking_specialization(public.tutor_private_slots, UUID, TEXT, TEXT) TO service_role;

-- ------------------------------------------------------------------------------
-- 5. تحديث دالة إنشاء مواعيد الحصص الخاصة (tutor_create_private_slots)
--    - التحقق الصريح من p_slots و p_duration_minutes و p_price_amount
--    - ضمان عضوية التخصص الأساسي في allowed_specializations
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.tutor_create_private_slots(TEXT, INTEGER, INTEGER, TEXT, JSONB, UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.tutor_create_private_slots(TEXT, INTEGER, NUMERIC, TEXT, JSONB, UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.tutor_create_private_slots(TEXT, INTEGER, INTEGER, TEXT, JSONB, UUID, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.tutor_create_private_slots(TEXT, INTEGER, NUMERIC, TEXT, JSONB, UUID, TEXT, TEXT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.tutor_create_private_slots(
    p_specialization_label TEXT,
    p_duration_minutes INTEGER,
    p_price_amount INTEGER,
    p_currency TEXT,
    p_slots JSONB,
    p_offering_course_option_id UUID DEFAULT NULL,
    p_quran_age_group_id TEXT DEFAULT NULL,
    p_quran_level_id TEXT DEFAULT NULL,
    p_timezone TEXT DEFAULT 'Africa/Cairo',
    p_allowed_specializations JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_tutor_id TEXT;
    v_is_published BOOLEAN;
    v_tz TEXT;
    v_currency TEXT;
    v_validated_specs JSONB;
    v_primary_spec JSONB;
    v_primary_course_id UUID := NULL;
    v_primary_age_id TEXT := NULL;
    v_primary_level_id TEXT := NULL;
    v_primary_label TEXT;
    v_slot_item JSONB;
    v_raw_date TEXT;
    v_raw_start TEXT;
    v_raw_end TEXT;
    v_date DATE;
    v_start TIME;
    v_end TIME;
    v_start_at TIMESTAMPTZ;
    v_end_at TIMESTAMPTZ;
    v_conflict RECORD;
    v_inserted_count INTEGER := 0;
BEGIN
    v_tutor_id := public.get_current_tutor_id();
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: حسابك غير مرتبط بملف معلم معتمد.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.tutors t
        WHERE t.id = v_tutor_id
    ) THEN
        RAISE EXCEPTION 'غير مصرح: ملف المعلم غير موجود في سجلات المنصة.';
    END IF;

    -- التحقق الصريح من p_slots و p_duration_minutes و p_price_amount
    IF p_slots IS NULL OR jsonb_typeof(p_slots) <> 'array' OR jsonb_array_length(p_slots) = 0 THEN
        RAISE EXCEPTION 'يرجى تمرير مصفوفة غير فارغة من المواعيد (p_slots).';
    END IF;

    IF p_duration_minutes IS NULL OR p_duration_minutes < 30 OR p_duration_minutes > 120 THEN
        RAISE EXCEPTION 'مدة الحصة الخاصة مطلوبة ويجب أن تكون بين 30 و 120 دقيقة.';
    END IF;

    IF p_price_amount IS NULL OR p_price_amount < 0 THEN
        RAISE EXCEPTION 'سعر الحصة الخاصة مطلوب ويجب أن يكون قيمة موجبة أو صفراً.';
    END IF;

    v_tz := COALESCE(NULLIF(TRIM(p_timezone), ''), 'Africa/Cairo');
    v_currency := COALESCE(NULLIF(TRIM(p_currency), ''), 'ج.م');

    -- التحقق الصارم من التخصصات البديلة والتخصص الأساسي
    v_validated_specs := public.internal_validate_tutor_specializations_array(
        v_tutor_id,
        p_allowed_specializations,
        p_offering_course_option_id,
        p_quran_age_group_id,
        p_quran_level_id
    );

    -- التخصص الأساسي هو العنصر الأول المعتمد في القائمة (أو المطابق للمعرف الأساسي الممرر)
    v_primary_spec := v_validated_specs->0;
    IF p_offering_course_option_id IS NOT NULL THEN
        SELECT elem INTO v_primary_spec
        FROM jsonb_array_elements(v_validated_specs) elem
        WHERE elem->>'track' = 'school' AND elem->>'courseOptionId' = p_offering_course_option_id::TEXT
        LIMIT 1;
    ELSIF NULLIF(TRIM(COALESCE(p_quran_age_group_id, '')), '') IS NOT NULL THEN
        SELECT elem INTO v_primary_spec
        FROM jsonb_array_elements(v_validated_specs) elem
        WHERE elem->>'track' = 'quran'
          AND elem->>'ageGroupId' = TRIM(p_quran_age_group_id)
          AND elem->>'levelId' = TRIM(p_quran_level_id)
        LIMIT 1;
    END IF;

    v_primary_label := v_primary_spec->>'label';
    IF (v_primary_spec->>'track') = 'school' THEN
        v_primary_course_id := (v_primary_spec->>'courseOptionId')::UUID;
        v_primary_age_id := NULL;
        v_primary_level_id := NULL;
    ELSE
        v_primary_course_id := NULL;
        v_primary_age_id := v_primary_spec->>'ageGroupId';
        v_primary_level_id := v_primary_spec->>'levelId';
    END IF;

    -- قفل التزامن الموحد للمعلم
    PERFORM public.acquire_tutor_lock(v_tutor_id);

    FOR v_slot_item IN SELECT * FROM jsonb_array_elements(p_slots)
    LOOP
        IF v_slot_item IS NULL OR jsonb_typeof(v_slot_item) <> 'object' THEN
            RAISE EXCEPTION 'كل عنصر داخل مصفوفة المواعيد (p_slots) يجب أن يكون كائن JSON صالحاً.';
        END IF;

        v_raw_date := NULLIF(TRIM(COALESCE(v_slot_item->>'date', '')), '');
        v_raw_start := NULLIF(TRIM(COALESCE(v_slot_item->>'startTime', '')), '');
        v_raw_end := NULLIF(TRIM(COALESCE(v_slot_item->>'endTime', '')), '');

        IF v_raw_date IS NULL OR v_raw_start IS NULL OR v_raw_end IS NULL THEN
            RAISE EXCEPTION 'بيانات الموعد ناقصة: يجب تحديد التاريخ (date) ووقت البداية (startTime) ووقت النهاية (endTime) لكل موعد.';
        END IF;

        BEGIN
            v_date := v_raw_date::DATE;
            v_start := v_raw_start::TIME;
            v_end := v_raw_end::TIME;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'صيغة التاريخ أو الوقت غير صالحة في الموعد (% / % - %).', v_raw_date, v_raw_start, v_raw_end;
        END;

        IF v_end <= v_start THEN
            RAISE EXCEPTION 'وقت نهاية الحصة يجب أن يكون بعد وقت البداية في تاريخ %.', v_date;
        END IF;

        v_start_at := (v_date + v_start) AT TIME ZONE v_tz;
        v_end_at := (v_date + v_end) AT TIME ZONE v_tz;

        IF v_start_at <= NOW() THEN
            RAISE EXCEPTION 'لا يمكن جدولة موعد في الماضي أو في وقت انقضى اليوم (% % بتوقيت %).', v_date, v_start, v_tz;
        END IF;

        IF (v_end_at - v_start_at) <> make_interval(mins => p_duration_minutes) THEN
            RAISE EXCEPTION 'فارق التوقيت في تاريخ % لا يطابق مدة الحصة المحددة (% دقيقة).',
                v_date, p_duration_minutes;
        END IF;

        -- فحص التعارض الزمني الشامل (يكتشف أيضاً أي تداخل بين مواعيد نفس الدفعة)
        SELECT * INTO v_conflict
        FROM public.internal_check_tutor_time_conflict(v_tutor_id, v_start_at, v_end_at, NULL, NULL, NULL);

        IF v_conflict.has_conflict THEN
            RAISE EXCEPTION '%', v_conflict.conflict_details;
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
            duration_minutes,
            price_amount,
            currency,
            is_available,
            is_booked,
            admin_suspended,
            admin_suspension_notes,
            notes,
            created_at,
            updated_at
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
            p_duration_minutes,
            p_price_amount,
            v_currency,
            TRUE,
            FALSE,
            FALSE,
            NULL,
            NULL,
            NOW(),
            NOW()
        );

        v_inserted_count := v_inserted_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'insertedCount', v_inserted_count,
        'message', 'تمت إضافة ' || v_inserted_count || ' من المواعيد الخاصة بنجاح.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_create_private_slots(TEXT, INTEGER, INTEGER, TEXT, JSONB, UUID, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_create_private_slots(TEXT, INTEGER, INTEGER, TEXT, JSONB, UUID, TEXT, TEXT, TEXT, JSONB) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 6. تحديث دالة تعديل موعد خاص للمعلم (tutor_update_private_slot)
--    - دعم تعديل البدائل وإعادة التحقق منها
--    - حماية الموعد الموقوف إدارياً (admin_suspended) والمحجوز والمرتبط بحجز معلق/مؤكد
--    - معالجة المواعيد القديمة ذات allowed_specializations الفارغة
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.tutor_update_private_slot(UUID, DATE, TIME, TIME, INTEGER, INTEGER, UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.tutor_update_private_slot(UUID, DATE, TIME, TIME, INTEGER, INTEGER, TEXT, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.tutor_update_private_slot(UUID, DATE, TIME, TIME, INTEGER, NUMERIC, TEXT, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.tutor_update_private_slot(UUID, DATE, TIME, TIME, INTEGER, INTEGER, TEXT, UUID, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.tutor_update_private_slot(UUID, DATE, TIME, TIME, INTEGER, NUMERIC, TEXT, UUID, TEXT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.tutor_update_private_slot(
    p_slot_id UUID,
    p_slot_date DATE,
    p_start_time TIME,
    p_end_time TIME,
    p_duration_minutes INTEGER,
    p_price_amount INTEGER,
    p_timezone TEXT DEFAULT 'Africa/Cairo',
    p_offering_course_option_id UUID DEFAULT NULL,
    p_quran_age_group_id TEXT DEFAULT NULL,
    p_quran_level_id TEXT DEFAULT NULL,
    p_allowed_specializations JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_tutor_id TEXT;
    v_slot public.tutor_private_slots%ROWTYPE;
    v_tz TEXT;
    v_start_at TIMESTAMPTZ;
    v_end_at TIMESTAMPTZ;
    v_conflict RECORD;
    v_fallback_specs JSONB;
    v_validated_specs JSONB;
    v_primary_spec JSONB;
    v_primary_course_id UUID := NULL;
    v_primary_age_id TEXT := NULL;
    v_primary_level_id TEXT := NULL;
    v_primary_label TEXT;
BEGIN
    v_tutor_id := public.get_current_tutor_id();
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: حسابك غير مرتبط بملف معلم معتمد.';
    END IF;

    IF p_slot_id IS NULL THEN
        RAISE EXCEPTION 'معرف الموعد الخاص مطلوب.';
    END IF;

    IF p_slot_date IS NULL OR p_start_time IS NULL OR p_end_time IS NULL THEN
        RAISE EXCEPTION 'يجب تحديد تاريخ الموعد ووقت البداية ووقت النهاية.';
    END IF;

    IF p_duration_minutes IS NULL OR p_duration_minutes < 30 OR p_duration_minutes > 120 THEN
        RAISE EXCEPTION 'مدة الحصة الخاصة مطلوبة ويجب أن تكون بين 30 و 120 دقيقة.';
    END IF;

    IF p_price_amount IS NULL OR p_price_amount < 0 THEN
        RAISE EXCEPTION 'سعر الحصة الخاصة مطلوب ويجب أن يكون قيمة موجبة أو صفراً.';
    END IF;

    PERFORM public.acquire_tutor_lock(v_tutor_id);

    SELECT * INTO v_slot
    FROM public.tutor_private_slots
    WHERE id = p_slot_id AND tutor_id = v_tutor_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'الموعد الخاص غير موجود أو لا تملك صلاحية تعديله.';
    END IF;

    -- الحفاظ الصارم على حماية Migration 010 و 009
    IF COALESCE(v_slot.admin_suspended, FALSE) = TRUE THEN
        RAISE EXCEPTION 'الموعد موقوف إدارياً من قبل الإدارة ولا يمكن تعديله.';
    END IF;

    IF COALESCE(v_slot.is_booked, FALSE) = TRUE THEN
        RAISE EXCEPTION 'لا يمكن تعديل موعد خاص محجوز بالفعل لطالب.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.tutor_private_bookings
        WHERE slot_id = p_slot_id AND status IN ('pending', 'confirmed')
    ) THEN
        RAISE EXCEPTION 'لا يمكن تعديل الموعد لوجود طلب حجز قيد المراجعة أو مؤكد مرتبط به.';
    END IF;

    IF p_end_time <= p_start_time THEN
        RAISE EXCEPTION 'وقت نهاية الحصة يجب أن يكون بعد وقت البداية.';
    END IF;

    v_tz := COALESCE(NULLIF(TRIM(p_timezone), ''), NULLIF(TRIM(v_slot.timezone), ''), 'Africa/Cairo');
    v_start_at := (p_slot_date + p_start_time) AT TIME ZONE v_tz;
    v_end_at := (p_slot_date + p_end_time) AT TIME ZONE v_tz;

    IF v_start_at <= NOW() THEN
        RAISE EXCEPTION 'لا يمكن تعديل الموعد إلى وقت في الماضي.';
    END IF;

    IF (v_end_at - v_start_at) <> make_interval(mins => p_duration_minutes) THEN
        RAISE EXCEPTION 'فارق التوقيت لا يطابق مدة الحصة المحددة (% دقيقة).', p_duration_minutes;
    END IF;

    -- إذا لم يمرر المستدعي تخصصات جديدة، نسترجع تخصصات الموعد الحالية (مع معالجة المواعيد القديمة الفارغة)
    IF p_allowed_specializations IS NULL
       AND p_offering_course_option_id IS NULL
       AND NULLIF(TRIM(COALESCE(p_quran_age_group_id, '')), '') IS NULL
       AND NULLIF(TRIM(COALESCE(p_quran_level_id, '')), '') IS NULL THEN
        v_fallback_specs := public.internal_resolve_slot_allowed_specializations(
            v_slot.allowed_specializations,
            v_slot.offering_course_option_id,
            v_slot.quran_age_group_id,
            v_slot.quran_level_id,
            v_slot.specialization_label
        );
        v_validated_specs := public.internal_validate_tutor_specializations_array(
            v_tutor_id,
            v_fallback_specs,
            v_slot.offering_course_option_id,
            v_slot.quran_age_group_id,
            v_slot.quran_level_id
        );
    ELSE
        v_validated_specs := public.internal_validate_tutor_specializations_array(
            v_tutor_id,
            p_allowed_specializations,
            p_offering_course_option_id,
            p_quran_age_group_id,
            p_quran_level_id
        );
    END IF;

    -- استخراج التخصص الأساسي وضمان عضويته في القائمة المعتمدة
    v_primary_spec := v_validated_specs->0;
    IF p_offering_course_option_id IS NOT NULL THEN
        SELECT elem INTO v_primary_spec
        FROM jsonb_array_elements(v_validated_specs) elem
        WHERE elem->>'track' = 'school' AND elem->>'courseOptionId' = p_offering_course_option_id::TEXT
        LIMIT 1;
    ELSIF NULLIF(TRIM(COALESCE(p_quran_age_group_id, '')), '') IS NOT NULL THEN
        SELECT elem INTO v_primary_spec
        FROM jsonb_array_elements(v_validated_specs) elem
        WHERE elem->>'track' = 'quran'
          AND elem->>'ageGroupId' = TRIM(p_quran_age_group_id)
          AND elem->>'levelId' = TRIM(p_quran_level_id)
        LIMIT 1;
    END IF;

    v_primary_label := v_primary_spec->>'label';
    IF (v_primary_spec->>'track') = 'school' THEN
        v_primary_course_id := (v_primary_spec->>'courseOptionId')::UUID;
        v_primary_age_id := NULL;
        v_primary_level_id := NULL;
    ELSE
        v_primary_course_id := NULL;
        v_primary_age_id := v_primary_spec->>'ageGroupId';
        v_primary_level_id := v_primary_spec->>'levelId';
    END IF;

    -- فحص التعارض مع استثناء الموعد الحالي نفسه
    SELECT * INTO v_conflict
    FROM public.internal_check_tutor_time_conflict(
        v_tutor_id,
        v_start_at,
        v_end_at,
        NULL,
        p_slot_id,
        NULL
    );

    IF v_conflict.has_conflict THEN
        RAISE EXCEPTION 'تعارض زمني: %', v_conflict.conflict_details;
    END IF;

    UPDATE public.tutor_private_slots
    SET slot_date = p_slot_date,
        start_time = p_start_time,
        end_time = p_end_time,
        duration_minutes = p_duration_minutes,
        price_amount = p_price_amount,
        timezone = v_tz,
        specialization_label = v_primary_label,
        offering_course_option_id = v_primary_course_id,
        quran_age_group_id = v_primary_age_id,
        quran_level_id = v_primary_level_id,
        allowed_specializations = v_validated_specs,
        is_available = TRUE,
        updated_at = NOW()
    WHERE id = p_slot_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'تم تحديث الموعد الخاص بنجاح.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_update_private_slot(UUID, DATE, TIME, TIME, INTEGER, INTEGER, TEXT, UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_update_private_slot(UUID, DATE, TIME, TIME, INTEGER, INTEGER, TEXT, UUID, TEXT, TEXT, JSONB) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 7. تحديث دوال قراءة المواعيد الخاصة (للمعلم وللعرض العام) مع الحفاظ على Migration 010
-- ------------------------------------------------------------------------------

-- 7.أ مواعيد الحصص الخاصة للمعلم (الاحتفاظ بجميع أعمدة 010 شاملةً admin_suspended و admin_suspension_notes + البدائل)
DROP FUNCTION IF EXISTS public.tutor_get_my_private_slots();
CREATE OR REPLACE FUNCTION public.tutor_get_my_private_slots()
RETURNS TABLE (
    id UUID,
    specialization_label TEXT,
    offering_course_option_id UUID,
    quran_age_group_id TEXT,
    quran_level_id TEXT,
    allowed_specializations JSONB,
    slot_date DATE,
    start_time TIME,
    end_time TIME,
    timezone TEXT,
    duration_minutes INTEGER,
    price_amount INTEGER,
    currency TEXT,
    is_available BOOLEAN,
    is_booked BOOLEAN,
    booked_at TIMESTAMPTZ,
    admin_suspended BOOLEAN,
    admin_suspension_notes TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
STABLE
AS $$
DECLARE
    v_tutor_id TEXT;
BEGIN
    v_tutor_id := public.get_current_tutor_id();
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: حسابك غير مرتبط بملف معلم معتمد.';
    END IF;

    RETURN QUERY
    SELECT
        s.id,
        s.specialization_label,
        s.offering_course_option_id,
        s.quran_age_group_id,
        s.quran_level_id,
        public.internal_resolve_slot_allowed_specializations(
            s.allowed_specializations,
            s.offering_course_option_id,
            s.quran_age_group_id,
            s.quran_level_id,
            s.specialization_label
        ) AS allowed_specializations,
        s.slot_date,
        s.start_time,
        s.end_time,
        s.timezone,
        s.duration_minutes,
        s.price_amount,
        s.currency,
        s.is_available,
        s.is_booked,
        s.booked_at,
        COALESCE(s.admin_suspended, FALSE) AS admin_suspended,
        s.admin_suspension_notes,
        s.created_at
    FROM public.tutor_private_slots s
    WHERE s.tutor_id = v_tutor_id
    ORDER BY s.slot_date ASC, s.start_time ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_get_my_private_slots() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_get_my_private_slots() TO authenticated, service_role;

-- 7.ب مواعيد الحصص الخاصة العامة للزوار (استبعاد admin_suspended وحجب الملاحظات الداخلية)
DROP FUNCTION IF EXISTS public.get_public_tutor_private_slots(TEXT);
CREATE OR REPLACE FUNCTION public.get_public_tutor_private_slots(p_tutor_id TEXT)
RETURNS TABLE (
    id UUID,
    specialization_label TEXT,
    allowed_specializations JSONB,
    slot_date DATE,
    start_time TIME,
    end_time TIME,
    timezone TEXT,
    duration_minutes INTEGER,
    price_amount INTEGER,
    currency TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
STABLE
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.tutors t
        WHERE t.id = p_tutor_id AND t.is_published = TRUE
    ) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        s.id,
        s.specialization_label,
        public.internal_resolve_slot_allowed_specializations(
            s.allowed_specializations,
            s.offering_course_option_id,
            s.quran_age_group_id,
            s.quran_level_id,
            s.specialization_label
        ) AS allowed_specializations,
        s.slot_date,
        s.start_time,
        s.end_time,
        s.timezone,
        s.duration_minutes,
        s.price_amount,
        s.currency
    FROM public.tutor_private_slots s
    WHERE s.tutor_id = p_tutor_id
      AND s.is_available = TRUE
      AND COALESCE(s.admin_suspended, FALSE) = FALSE
      AND COALESCE(s.is_booked, FALSE) = FALSE
      AND (
          (s.slot_date + s.start_time)
          AT TIME ZONE COALESCE(NULLIF(TRIM(s.timezone), ''), 'Africa/Cairo')
      ) > NOW()
    ORDER BY s.slot_date ASC, s.start_time ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_tutor_private_slots(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_tutor_private_slots(TEXT) TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 8. تحديث دورة حياة حجز الحصة الخاصة والتأكيد الإداري مع حفظ التخصص المختار
-- ------------------------------------------------------------------------------

-- 8.أ دالة إدارية لجلب تفاصيل موعد خاص بمعرفه (لتسهيل اختيار التخصص البديل عند تسجيل الحجز من واتساب)
DROP FUNCTION IF EXISTS public.admin_get_private_slot_by_id(UUID);
CREATE OR REPLACE FUNCTION public.admin_get_private_slot_by_id(p_slot_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
STABLE
AS $$
DECLARE
    v_slot public.tutor_private_slots%ROWTYPE;
    v_tutor_name TEXT;
    v_allowed JSONB;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذا الإجراء مخصص لمشرفي النظام فقط.';
    END IF;

    SELECT * INTO v_slot
    FROM public.tutor_private_slots
    WHERE id = p_slot_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT t.name INTO v_tutor_name
    FROM public.tutors t
    WHERE t.id = v_slot.tutor_id;

    v_allowed := public.internal_resolve_slot_allowed_specializations(
        v_slot.allowed_specializations,
        v_slot.offering_course_option_id,
        v_slot.quran_age_group_id,
        v_slot.quran_level_id,
        v_slot.specialization_label
    );

    RETURN jsonb_build_object(
        'id', v_slot.id,
        'tutorId', v_slot.tutor_id,
        'tutorName', v_tutor_name,
        'specializationLabel', v_slot.specialization_label,
        'offeringCourseOptionId', v_slot.offering_course_option_id,
        'quranAgeGroupId', v_slot.quran_age_group_id,
        'quranLevelId', v_slot.quran_level_id,
        'allowedSpecializations', v_allowed,
        'slotDate', v_slot.slot_date,
        'startTime', v_slot.start_time,
        'endTime', v_slot.end_time,
        'timezone', v_slot.timezone,
        'durationMinutes', v_slot.duration_minutes,
        'priceAmount', v_slot.price_amount,
        'currency', v_slot.currency,
        'isAvailable', v_slot.is_available,
        'isBooked', v_slot.is_booked,
        'adminSuspended', COALESCE(v_slot.admin_suspended, FALSE)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_private_slot_by_id(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_private_slot_by_id(UUID) TO authenticated, service_role;

-- 8.ب إنشاء حجز حصة خاصة من الإدارة (مع التحقق من التخصص المختار وحفظه في سجل الحجز)
DROP FUNCTION IF EXISTS public.admin_create_private_booking(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.admin_create_private_booking(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_create_private_booking(
    p_slot_id UUID,
    p_student_name TEXT,
    p_guardian_name TEXT,
    p_phone_number TEXT,
    p_agreed_price INTEGER,
    p_notes TEXT DEFAULT NULL,
    p_offering_course_option_id UUID DEFAULT NULL,
    p_quran_age_group_id TEXT DEFAULT NULL,
    p_quran_level_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_tutor_id TEXT;
    v_slot public.tutor_private_slots%ROWTYPE;
    v_existing_booking RECORD;
    v_booking_id UUID;
    v_chosen_spec JSONB;
    v_chosen_course_id UUID := NULL;
    v_chosen_age_id TEXT := NULL;
    v_chosen_level_id TEXT := NULL;
    v_chosen_label TEXT := NULL;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذا الإجراء مخصص لمشرفي النظام فقط.';
    END IF;

    IF p_slot_id IS NULL THEN
        RAISE EXCEPTION 'معرف الموعد الخاص مطلوب.';
    END IF;

    IF NULLIF(TRIM(COALESCE(p_student_name, '')), '') IS NULL
       OR NULLIF(TRIM(COALESCE(p_guardian_name, '')), '') IS NULL
       OR NULLIF(TRIM(COALESCE(p_phone_number, '')), '') IS NULL THEN
        RAISE EXCEPTION 'بيانات الطالب وولي الأمر ورقم الهاتف مطلوبة.';
    END IF;

    IF p_agreed_price IS NULL OR p_agreed_price < 0 THEN
        RAISE EXCEPTION 'السعر المتفق عليه مطلوب ويجب أن يكون صفراً أو قيمة موجبة.';
    END IF;

    SELECT tutor_id INTO v_tutor_id
    FROM public.tutor_private_slots
    WHERE id = p_slot_id;

    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'الموعد الخاص المحدد غير موجود.';
    END IF;

    PERFORM public.acquire_tutor_lock(v_tutor_id);

    SELECT * INTO v_slot
    FROM public.tutor_private_slots
    WHERE id = p_slot_id
    FOR UPDATE;

    IF COALESCE(v_slot.admin_suspended, FALSE) = TRUE THEN
        RAISE EXCEPTION 'الموعد الخاص موقوف إدارياً ولا يمكن حجز موعد موقوف.';
    END IF;

    -- البحث عن الحجز المطابق الموجود لنفس الطالب ورقم الهاتف على هذا الموعد
    -- (يتم فحصه قبل رفض الطلب بسبب is_booked أو انقضاء الموعد)
    SELECT id, status, offering_course_option_id, quran_age_group_id, quran_level_id, specialization_label
    INTO v_existing_booking
    FROM public.tutor_private_bookings
    WHERE slot_id = p_slot_id
      AND phone_number = TRIM(p_phone_number)
      AND student_name = TRIM(p_student_name)
      AND status IN ('pending', 'confirmed');

    IF v_existing_booking.id IS NOT NULL THEN
        -- إذا كان نفس الحجز مؤكداً بالفعل، يُعاد دون أي تعديل
        IF v_existing_booking.status = 'confirmed' THEN
            RETURN jsonb_build_object(
                'success', TRUE,
                'bookingId', v_existing_booking.id,
                'alreadyConfirmed', TRUE,
                'alreadyExists', TRUE,
                'specializationLabel', COALESCE(v_existing_booking.specialization_label, v_slot.specialization_label),
                'message', 'يوجد حجز مؤكد بالفعل لهذا الموعد ورقم الهاتف والطالب.'
            );
        END IF;

        -- إذا كان الحجز pending: إعادة السجل المحفوظ مباشرةً دون أي UPDATE للسعر أو ولي الأمر أو الملاحظات أو التخصص
        RETURN jsonb_build_object(
            'success', TRUE,
            'bookingId', v_existing_booking.id,
            'alreadyExists', TRUE,
            'specializationLabel', COALESCE(v_existing_booking.specialization_label, v_slot.specialization_label),
            'message', 'يوجد طلب حجز مسجل بالفعل لهذا الموعد ورقم الهاتف.'
        );
    END IF;

    -- إذا لم يكن هناك حجز مسبق لنفس الطالب: نتحقق من جاهزية الموعد لإنشاء حجز جديد
    IF COALESCE(v_slot.is_booked, FALSE) = TRUE THEN
        RAISE EXCEPTION 'الموعد الخاص محجوز ومؤكد بالفعل لطالب آخر.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.tutor_private_bookings
        WHERE slot_id = p_slot_id
          AND status = 'confirmed'
    ) THEN
        RAISE EXCEPTION 'الموعد الخاص محجوز ومؤكد بالفعل لطالب آخر.';
    END IF;

    IF v_slot.is_available = FALSE THEN
        RAISE EXCEPTION 'الموعد الخاص مغلق إدارياً وغير متاح للحجز.';
    END IF;

    IF (v_slot.slot_date + v_slot.start_time) AT TIME ZONE COALESCE(NULLIF(TRIM(v_slot.timezone), ''), 'Africa/Cairo') <= NOW() THEN
        RAISE EXCEPTION 'الموعد الخاص في الماضي أو انقضى وقته اليوم.';
    END IF;

    -- التحقق من التخصص الذي اختاره الطالب وأنه ضمن بدائل الموعد ومعتمد للمعلم
    v_chosen_spec := public.internal_resolve_and_validate_booking_specialization(
        v_slot,
        p_offering_course_option_id,
        p_quran_age_group_id,
        p_quran_level_id
    );

    v_chosen_label := v_chosen_spec->>'label';
    IF (v_chosen_spec->>'track') = 'school' THEN
        v_chosen_course_id := (v_chosen_spec->>'courseOptionId')::UUID;
        v_chosen_age_id := NULL;
        v_chosen_level_id := NULL;
    ELSIF (v_chosen_spec->>'track') = 'quran' THEN
        v_chosen_course_id := NULL;
        v_chosen_age_id := v_chosen_spec->>'ageGroupId';
        v_chosen_level_id := v_chosen_spec->>'levelId';
    END IF;

    INSERT INTO public.tutor_private_bookings (
        slot_id,
        tutor_id,
        offering_course_option_id,
        quran_age_group_id,
        quran_level_id,
        specialization_label,
        student_name,
        guardian_name,
        phone_number,
        agreed_price,
        currency,
        status,
        notes
    ) VALUES (
        p_slot_id,
        v_slot.tutor_id,
        v_chosen_course_id,
        v_chosen_age_id,
        v_chosen_level_id,
        v_chosen_label,
        TRIM(p_student_name),
        TRIM(p_guardian_name),
        TRIM(p_phone_number),
        p_agreed_price,
        v_slot.currency,
        'pending',
        NULLIF(TRIM(COALESCE(p_notes, '')), '')
    )
    RETURNING id INTO v_booking_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'bookingId', v_booking_id,
        'specializationLabel', v_chosen_label,
        'message', 'تم تسجيل طلب حجز الحصة الخاصة بنجاح (قيد التأكيد الإداري).'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_private_booking(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_private_booking(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, UUID, TEXT, TEXT) TO authenticated, service_role;

-- 8.ج تأكيد حجز حصة خاصة من الإدارة (قفل الموعد بالكامل كسعة واحدة والتحقق من التخصص المختار)
DROP FUNCTION IF EXISTS public.admin_confirm_private_booking(UUID);
DROP FUNCTION IF EXISTS public.admin_confirm_private_booking(UUID, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_confirm_private_booking(
    p_booking_id UUID,
    p_offering_course_option_id UUID DEFAULT NULL,
    p_quran_age_group_id TEXT DEFAULT NULL,
    p_quran_level_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_booking_tutor_id TEXT;
    v_booking public.tutor_private_bookings%ROWTYPE;
    v_slot public.tutor_private_slots%ROWTYPE;
    v_tz TEXT;
    v_start_at TIMESTAMPTZ;
    v_end_at TIMESTAMPTZ;
    v_conflict RECORD;
    v_allowed JSONB;
    v_chosen_spec JSONB;
    v_effective_course_id UUID;
    v_effective_age_id TEXT;
    v_effective_level_id TEXT;
    v_effective_label TEXT;
    v_has_explicit_input BOOLEAN;
    v_has_stored_spec BOOLEAN;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذا الإجراء مخصص لمشرفي المنصة فقط.';
    END IF;

    SELECT tutor_id INTO v_booking_tutor_id
    FROM public.tutor_private_bookings
    WHERE id = p_booking_id;

    IF v_booking_tutor_id IS NULL THEN
        RAISE EXCEPTION 'طلب الحجز غير موجود.';
    END IF;

    PERFORM public.acquire_tutor_lock(v_booking_tutor_id);

    SELECT * INTO v_booking
    FROM public.tutor_private_bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF v_booking.status = 'confirmed' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'bookingId', p_booking_id,
            'alreadyConfirmed', TRUE,
            'message', 'الحجز مؤكد بالفعل مسبقاً.'
        );
    END IF;

    IF v_booking.status IN ('cancelled', 'completed') THEN
        RAISE EXCEPTION 'لا يمكن تأكيد حجز ملغى أو مكتمل.';
    END IF;

    IF v_booking.status <> 'pending' THEN
        RAISE EXCEPTION 'لا يمكن تأكيد الحجز إلا من حالة قيد المراجعة.';
    END IF;

    SELECT * INTO v_slot
    FROM public.tutor_private_slots
    WHERE id = v_booking.slot_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'الموعد الخاص المرتبط بالحجز غير موجود.';
    END IF;

    IF v_slot.tutor_id <> v_booking.tutor_id THEN
        RAISE EXCEPTION 'تضارب في بيانات المعلم المرتبط بالموعد والحجز.';
    END IF;

    IF COALESCE(v_slot.admin_suspended, FALSE) = TRUE THEN
        RAISE EXCEPTION 'الموعد الخاص موقوف إدارياً؛ لا يمكن تأكيد حجز موعد موقوف.';
    END IF;

    -- حماية السعة الواحدة (1:1): منع تأكيد حجزين لنفس الموعد تحت أي بديل
    IF COALESCE(v_slot.is_booked, FALSE) = TRUE THEN
        RAISE EXCEPTION 'الموعد الخاص محجوز ومؤكد بالفعل لطالب آخر.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.tutor_private_bookings
        WHERE slot_id = v_booking.slot_id
          AND id <> p_booking_id
          AND status = 'confirmed'
    ) THEN
        RAISE EXCEPTION 'يوجد حجز آخر مؤكد بالفعل لنفس الموعد الخاص ولا يمكن تأكيد حجز مزدوج.';
    END IF;

    IF v_slot.is_available = FALSE THEN
        RAISE EXCEPTION 'الموعد الخاص مغلق إدارياً وغير متاح.';
    END IF;

    v_tz := COALESCE(NULLIF(TRIM(v_slot.timezone), ''), 'Africa/Cairo');
    v_start_at := (v_slot.slot_date + v_slot.start_time) AT TIME ZONE v_tz;
    v_end_at := (v_slot.slot_date + v_slot.end_time) AT TIME ZONE v_tz;

    IF v_start_at <= NOW() THEN
        RAISE EXCEPTION 'لا يمكن تأكيد الحجز: انقضى وقت بداية الموعد بتوقيت %.', v_tz;
    END IF;

    -- التحقق من التخصص المختار للحجز مع الحفاظ على توافق الحجوزات القديمة دون اختراع تخصصات لها
    v_has_explicit_input := (
        p_offering_course_option_id IS NOT NULL
        OR NULLIF(TRIM(COALESCE(p_quran_age_group_id, '')), '') IS NOT NULL
        OR NULLIF(TRIM(COALESCE(p_quran_level_id, '')), '') IS NOT NULL
    );

    v_has_stored_spec := (
        v_booking.offering_course_option_id IS NOT NULL
        OR v_booking.quran_age_group_id IS NOT NULL
        OR v_booking.quran_level_id IS NOT NULL
    );

    v_allowed := public.internal_resolve_slot_allowed_specializations(
        v_slot.allowed_specializations,
        v_slot.offering_course_option_id,
        v_slot.quran_age_group_id,
        v_slot.quran_level_id,
        v_slot.specialization_label
    );

    IF v_has_explicit_input THEN
        v_chosen_spec := public.internal_resolve_and_validate_booking_specialization(
            v_slot,
            p_offering_course_option_id,
            p_quran_age_group_id,
            p_quran_level_id
        );
        v_effective_label := v_chosen_spec->>'label';
        IF (v_chosen_spec->>'track') = 'school' THEN
            v_effective_course_id := (v_chosen_spec->>'courseOptionId')::UUID;
            v_effective_age_id := NULL;
            v_effective_level_id := NULL;
        ELSIF (v_chosen_spec->>'track') = 'quran' THEN
            v_effective_course_id := NULL;
            v_effective_age_id := v_chosen_spec->>'ageGroupId';
            v_effective_level_id := v_chosen_spec->>'levelId';
        END IF;
    ELSIF v_has_stored_spec THEN
        v_chosen_spec := public.internal_resolve_and_validate_booking_specialization(
            v_slot,
            v_booking.offering_course_option_id,
            v_booking.quran_age_group_id,
            v_booking.quran_level_id
        );
        v_effective_label := v_chosen_spec->>'label';
        IF (v_chosen_spec->>'track') = 'school' THEN
            v_effective_course_id := (v_chosen_spec->>'courseOptionId')::UUID;
            v_effective_age_id := NULL;
            v_effective_level_id := NULL;
        ELSIF (v_chosen_spec->>'track') = 'quran' THEN
            v_effective_course_id := NULL;
            v_effective_age_id := v_chosen_spec->>'ageGroupId';
            v_effective_level_id := v_chosen_spec->>'levelId';
        END IF;
    ELSE
        -- حجز قديم لم يُخزَّن فيه تخصص صريح:
        -- إذا كان الموعد متعدد البدائل يجب تحديد البديل المختار قبل التأكيد،
        -- أما إذا كان موعداً قديماً بتخصص واحد فلا نخترع معرفات جديدة على سجل الحجز القديم.
        IF jsonb_array_length(v_allowed) > 1 THEN
            RAISE EXCEPTION 'هذا الموعد متعدد التخصصات؛ يرجى تحديد التخصص الذي اختاره الطالب قبل تأكيد الحجز.';
        END IF;
        v_effective_course_id := v_booking.offering_course_option_id;
        v_effective_age_id := v_booking.quran_age_group_id;
        v_effective_level_id := v_booking.quran_level_id;
        v_effective_label := v_booking.specialization_label;
    END IF;

    SELECT * INTO v_conflict
    FROM public.internal_check_tutor_time_conflict(
        v_slot.tutor_id,
        v_start_at,
        v_end_at,
        NULL,
        v_slot.id,
        NULL
    );

    IF v_conflict.has_conflict THEN
        RAISE EXCEPTION 'لا يمكن تأكيد الحجز لوجود تعارض زمني: %', v_conflict.conflict_details;
    END IF;

    UPDATE public.tutor_private_bookings
    SET status = 'confirmed',
        offering_course_option_id = v_effective_course_id,
        quran_age_group_id = v_effective_age_id,
        quran_level_id = v_effective_level_id,
        specialization_label = v_effective_label,
        confirmed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_booking_id;

    -- قفل الموعد بالكامل كسعة واحدة بحيث لا يبقى متاحاً تحت أي تخصص بديل آخر
    UPDATE public.tutor_private_slots
    SET is_booked = TRUE,
        is_available = FALSE,
        booked_at = NOW(),
        updated_at = NOW()
    WHERE id = v_booking.slot_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'bookingId', p_booking_id,
        'specializationLabel', COALESCE(v_effective_label, v_slot.specialization_label),
        'message', 'تم تأكيد حجز الحصة الخاصة وحجز الموعد بالكامل بنجاح.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_confirm_private_booking(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_confirm_private_booking(UUID, UUID, TEXT, TEXT) TO authenticated, service_role;

-- 8.د تحديث استعلام حجوزات الحصص الخاصة للإدارة (إرجاع التخصص المختار وبدائل الموعد)
DROP FUNCTION IF EXISTS public.admin_get_private_bookings(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.admin_get_private_bookings(
    p_status TEXT DEFAULT NULL,
    p_tutor_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    slot_id UUID,
    tutor_id TEXT,
    tutor_name TEXT,
    specialization_label TEXT,
    offering_course_option_id UUID,
    quran_age_group_id TEXT,
    quran_level_id TEXT,
    slot_allowed_specializations JSONB,
    slot_date DATE,
    start_time TIME,
    end_time TIME,
    timezone TEXT,
    student_name TEXT,
    guardian_name TEXT,
    phone_number TEXT,
    agreed_price INTEGER,
    currency TEXT,
    status TEXT,
    notes TEXT,
    cancellation_reason TEXT,
    cancelled_by TEXT,
    cancelled_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
STABLE
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذا الإجراء مخصص لمشرفي النظام فقط.';
    END IF;

    RETURN QUERY
    SELECT
        b.id,
        b.slot_id,
        b.tutor_id,
        t.name AS tutor_name,
        COALESCE(b.specialization_label, ps.specialization_label) AS specialization_label,
        b.offering_course_option_id,
        b.quran_age_group_id,
        b.quran_level_id,
        public.internal_resolve_slot_allowed_specializations(
            ps.allowed_specializations,
            ps.offering_course_option_id,
            ps.quran_age_group_id,
            ps.quran_level_id,
            ps.specialization_label
        ) AS slot_allowed_specializations,
        ps.slot_date,
        ps.start_time,
        ps.end_time,
        ps.timezone,
        b.student_name,
        b.guardian_name,
        b.phone_number,
        b.agreed_price,
        b.currency,
        b.status,
        b.notes,
        b.cancellation_reason,
        b.cancelled_by,
        b.cancelled_at,
        b.confirmed_at,
        b.created_at
    FROM public.tutor_private_bookings b
    JOIN public.tutor_private_slots ps ON ps.id = b.slot_id
    JOIN public.tutors t ON t.id = b.tutor_id
    WHERE (p_status IS NULL OR b.status = p_status)
      AND (p_tutor_id IS NULL OR b.tutor_id = p_tutor_id)
    ORDER BY b.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_private_bookings(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_private_bookings(TEXT, TEXT) TO authenticated, service_role;

-- 8.هـ تحديث استعلام الحجوزات الخاصة المؤكدة للمعلم لعرض التخصص الفعلي المختار للطالب
DROP FUNCTION IF EXISTS public.tutor_get_my_confirmed_private_bookings();
CREATE OR REPLACE FUNCTION public.tutor_get_my_confirmed_private_bookings()
RETURNS TABLE (
    booking_id UUID,
    slot_id UUID,
    slot_date DATE,
    start_time TIME,
    end_time TIME,
    timezone TEXT,
    specialization_label TEXT,
    student_name TEXT,
    guardian_name TEXT,
    phone_number TEXT,
    confirmed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
STABLE
AS $$
DECLARE
    v_tutor_id TEXT;
BEGIN
    v_tutor_id := public.get_current_tutor_id();
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: حسابك غير مرتبط بملف معلم معتمد.';
    END IF;

    RETURN QUERY
    SELECT
        b.id AS booking_id,
        b.slot_id,
        ps.slot_date,
        ps.start_time,
        ps.end_time,
        ps.timezone,
        COALESCE(b.specialization_label, ps.specialization_label) AS specialization_label,
        b.student_name,
        b.guardian_name,
        b.phone_number,
        b.confirmed_at
    FROM public.tutor_private_bookings b
    JOIN public.tutor_private_slots ps ON ps.id = b.slot_id
    WHERE b.tutor_id = v_tutor_id
      AND b.status = 'confirmed'
    ORDER BY ps.slot_date ASC, ps.start_time ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_get_my_confirmed_private_bookings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_get_my_confirmed_private_bookings() TO authenticated, service_role;

COMMIT;
