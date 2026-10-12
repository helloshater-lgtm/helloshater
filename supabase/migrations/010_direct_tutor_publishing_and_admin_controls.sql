-- ==============================================================================
-- Shatir Classes (شاطر كلاسيز) - Supabase Unified Migration 010 (Corrected)
-- File: supabase/migrations/010_direct_tutor_publishing_and_admin_controls.sql
-- Description:
--   تمكين النشر المباشر للمجموعات التعليمية والمواعيد الخاصة والتجريبية للمعلم المعتمد مع ضوابط الإيقاف الإداري:
--   1. إنشاء المجموعات الجديدة معتمدة ومنشورة مباشرة (review_status = 'approved', is_published = TRUE, status = 'open')
--      دون إرسالها لقائمة مراجعة الإدارة المسبقة، بشرط ملف المعلم المعتمد وتطابق التخصصات والمواعيد.
--   2. التحقق الصارم من جدول لقاءات المجموعة p_sessions في الإنشاء والتعديل:
--      رفض NULL أو غير المصفوفة أو المصفوفة الفارغة، والتحقق من الحقول الإلزامية وتطابق العدد والمدد والتواريخ.
--   3. حماية تحديث حالة المجموعة بواسطة المعلم tutor_update_group_status:
--      إعادة حماية 009 لمنع إنهاء مجموعة بها طلاب مؤكدون ولقاءات لم تنتهِ بعد.
--      عند الاكتمال completed أو الإلغاء cancelled ضبط is_published = FALSE وليس TRUE.
--      الحفاظ على مواعيد الطلاب المؤكدين دون تحريرها أو المساس بها.
--   4. ضوابط الإيقاف الإداري admin_suspended للمجموعات والمواعيد الخاصة والتجريبية:
--      منع المعلم من تعديل أو حذف أو تفعيل أي موعد أو مجموعة موقوفة إدارياً.
--   5. تحديث admin_cancel_private_booking ليحترم admin_suspended:
--      إلغاء الحجز لا يرفع الإيقاف الإداري، ولا يعيد is_available = TRUE إذا كان الموعد موقوفاً.
--   6. فحص admin_suspended صراحةً في إنشاء وتأكيد حجوزات الخاص واشتراكات المجموعات.
--   7. تصحيح استئناف عرض المجموعة في admin_suspend_group:
--      التحقق من صلاحية حالة المجموعة ووجود لقاءات لم تنتهِ بعد، وفحص التعارض للقاءات المتبقية فقط،
--      مع السماح باستئناف مجموعة بدأت بالفعل ما دامت هناك لقاءات صالحة متبقية.
--   8. توفير أعمدة admin_suspended وسبب الإيقاف عبر RPCs مخصصة للوحات المعلم والإدارة
--      مع معالجة تغيير توقيعات RETURNS TABLE صراحةً عبر DROP FUNCTION مسبق، وحجب الملاحظات الداخلية عن الجمهور.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. إضافة أعمدة الإيقاف الإداري (Administrative Suspension Columns)
-- ------------------------------------------------------------------------------

-- 1.1 المجموعات التعليمية
ALTER TABLE public.tutor_groups
    ADD COLUMN IF NOT EXISTS admin_suspended BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS admin_suspension_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_tutor_groups_admin_suspended 
ON public.tutor_groups(admin_suspended, is_published);

-- 1.2 مواعيد الحصص الخاصة
ALTER TABLE public.tutor_private_slots
    ADD COLUMN IF NOT EXISTS admin_suspended BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS admin_suspension_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_private_slots_admin_suspended 
ON public.tutor_private_slots(admin_suspended, is_available);

-- 1.3 المواعيد التجريبية
ALTER TABLE public.tutor_available_slots
    ADD COLUMN IF NOT EXISTS admin_suspended BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_available_slots_admin_suspended 
ON public.tutor_available_slots(admin_suspended, is_available);

-- ------------------------------------------------------------------------------
-- 2. النشر المباشر للمجموعات التعليمية بواسطة المعلم المعتمد: public.tutor_create_group
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tutor_create_group(
    p_title TEXT,
    p_description TEXT,
    p_specialization_label TEXT,
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
    v_group_id UUID;
    v_sess JSONB;
    v_sess2 JSONB;
    v_idx1 INTEGER;
    v_idx2 INTEGER;
    v_sess_num INTEGER;
    v_sess_date DATE;
    v_sess_start TIME;
    v_sess_end TIME;
    v_sess_tz TEXT;
    v_start_at TIMESTAMPTZ;
    v_end_at TIMESTAMPTZ;
    v_start_at2 TIMESTAMPTZ;
    v_end_at2 TIMESTAMPTZ;
    v_duration INTERVAL;
    v_conflict RECORD;
    v_validated_label TEXT;
    v_sess_count_provided INTEGER;
BEGIN
    v_tutor_id := public.get_current_tutor_id();
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: حسابك غير مرتبط بملف معلم معتمد.';
    END IF;

    IF NULLIF(TRIM(p_title), '') IS NULL THEN
        RAISE EXCEPTION 'اسم المجموعة التعليمية مطلوب.';
    END IF;

    IF p_max_students < 2 OR p_max_students > 20 THEN
        RAISE EXCEPTION 'الحد الأقصى للطلاب في المجموعة يجب أن يكون بين 2 و 20 طالباً.';
    END IF;

    IF p_price_per_student < 0 THEN
        RAISE EXCEPTION 'سعر الاشتراك للطالب يجب ألا يكون سالباً.';
    END IF;

    IF p_price_type NOT IN ('per_session', 'full_package') THEN
        RAISE EXCEPTION 'نوع السعر يجب أن يكون per_session أو full_package.';
    END IF;

    IF p_sessions_count < 1 THEN
        RAISE EXCEPTION 'عدد الحصص يجب أن يكون حصة واحدة على الأقل.';
    END IF;

    IF p_session_duration_minutes < 30 THEN
        RAISE EXCEPTION 'مدة الحصة يجب أن تكون 30 دقيقة على الأقل.';
    END IF;

    IF p_start_date < CURRENT_DATE THEN
        RAISE EXCEPTION 'تاريخ بدء المجموعة لا يجوز أن يكون في الماضي.';
    END IF;

    IF p_end_date IS NOT NULL AND p_end_date < p_start_date THEN
        RAISE EXCEPTION 'تاريخ انتهاء المجموعة يجب أن يكون بعد تاريخ البداية.';
    END IF;

    IF p_sessions IS NULL OR jsonb_typeof(p_sessions) <> 'array' OR jsonb_array_length(p_sessions) = 0 THEN
        RAISE EXCEPTION 'جدول لقاءات المجموعة (p_sessions) مطلوب ويجب أن يكون مصفوفة غير فارغة من اللقاءات.';
    END IF;

    v_sess_count_provided := jsonb_array_length(p_sessions);
    IF v_sess_count_provided <> p_sessions_count THEN
        RAISE EXCEPTION 'عدد اللقاءات المحددة في الجدول (% لقاء) لا يطابق عدد الحصص المطلوب (%).', v_sess_count_provided, p_sessions_count;
    END IF;

    v_validated_label := public.validate_and_get_tutor_specialization(
        v_tutor_id,
        p_offering_course_option_id,
        p_quran_age_group_id,
        p_quran_level_id
    );

    PERFORM public.acquire_tutor_lock(v_tutor_id);

    v_idx1 := 0;
    WHILE v_idx1 < v_sess_count_provided LOOP
        v_sess := p_sessions->v_idx1;

        IF v_sess->>'sessionNumber' IS NULL OR NULLIF(TRIM(v_sess->>'sessionNumber'), '') IS NULL OR
           v_sess->>'sessionDate' IS NULL OR NULLIF(TRIM(v_sess->>'sessionDate'), '') IS NULL OR
           v_sess->>'startTime' IS NULL OR NULLIF(TRIM(v_sess->>'startTime'), '') IS NULL OR
           v_sess->>'endTime' IS NULL OR NULLIF(TRIM(v_sess->>'endTime'), '') IS NULL THEN
            RAISE EXCEPTION 'بيانات اللقاء في الترتيب % غير مكتملة.', v_idx1 + 1;
        END IF;

        v_start_at := ((v_sess->>'sessionDate')::DATE + (v_sess->>'startTime')::TIME) AT TIME ZONE COALESCE(NULLIF(TRIM(v_sess->>'timezone'), ''), 'Africa/Cairo');
        v_end_at := ((v_sess->>'sessionDate')::DATE + (v_sess->>'endTime')::TIME) AT TIME ZONE COALESCE(NULLIF(TRIM(v_sess->>'timezone'), ''), 'Africa/Cairo');

        v_idx2 := v_idx1 + 1;
        WHILE v_idx2 < v_sess_count_provided LOOP
            v_sess2 := p_sessions->v_idx2;

            IF v_sess2->>'sessionNumber' IS NULL OR NULLIF(TRIM(v_sess2->>'sessionNumber'), '') IS NULL OR
               v_sess2->>'sessionDate' IS NULL OR NULLIF(TRIM(v_sess2->>'sessionDate'), '') IS NULL OR
               v_sess2->>'startTime' IS NULL OR NULLIF(TRIM(v_sess2->>'startTime'), '') IS NULL OR
               v_sess2->>'endTime' IS NULL OR NULLIF(TRIM(v_sess2->>'endTime'), '') IS NULL THEN
                RAISE EXCEPTION 'بيانات اللقاء في الترتيب % غير مكتملة.', v_idx2 + 1;
            END IF;

            v_start_at2 := ((v_sess2->>'sessionDate')::DATE + (v_sess2->>'startTime')::TIME) AT TIME ZONE COALESCE(NULLIF(TRIM(v_sess2->>'timezone'), ''), 'Africa/Cairo');
            v_end_at2 := ((v_sess2->>'sessionDate')::DATE + (v_sess2->>'endTime')::TIME) AT TIME ZONE COALESCE(NULLIF(TRIM(v_sess2->>'timezone'), ''), 'Africa/Cairo');

            IF tstzrange(v_start_at, v_end_at) && tstzrange(v_start_at2, v_end_at2) THEN
                RAISE EXCEPTION 'يوجد تداخل زمني بين اللقاء % واللقاء % في نفس الدفعة المقدمة.', (v_sess->>'sessionNumber')::INTEGER, (v_sess2->>'sessionNumber')::INTEGER;
            END IF;
            v_idx2 := v_idx2 + 1;
        END LOOP;
        v_idx1 := v_idx1 + 1;
    END LOOP;

    FOR v_sess IN SELECT * FROM jsonb_array_elements(p_sessions)
    LOOP
        v_sess_num := (v_sess->>'sessionNumber')::INTEGER;
        v_sess_date := (v_sess->>'sessionDate')::DATE;
        v_sess_start := (v_sess->>'startTime')::TIME;
        v_sess_end := (v_sess->>'endTime')::TIME;
        v_sess_tz := COALESCE(NULLIF(TRIM(v_sess->>'timezone'), ''), 'Africa/Cairo');

        IF v_sess_end <= v_sess_start THEN
            RAISE EXCEPTION 'وقت نهاية اللقاء % يجب أن يكون بعد وقت البداية.', v_sess_num;
        END IF;

        v_start_at := (v_sess_date + v_sess_start) AT TIME ZONE v_sess_tz;
        v_end_at := (v_sess_date + v_sess_end) AT TIME ZONE v_sess_tz;

        IF v_start_at <= NOW() THEN
            RAISE EXCEPTION 'اللقاء رقم % مجدول في وقت انقضى في الماضي.', v_sess_num;
        END IF;

        IF v_sess_date < p_start_date THEN
            RAISE EXCEPTION 'اللقاء % يسبق تاريخ بدء المجموعة.', v_sess_num;
        END IF;

        IF p_end_date IS NOT NULL AND v_sess_date > p_end_date THEN
            RAISE EXCEPTION 'اللقاء % يتجاوز تاريخ نهاية المجموعة.', v_sess_num;
        END IF;

        v_duration := v_end_at - v_start_at;
        IF EXTRACT(EPOCH FROM v_duration) / 60 != p_session_duration_minutes THEN
            RAISE EXCEPTION 'مدة اللقاء % لا تطابق مدة الحصة المحددة للمجموعة.', v_sess_num;
        END IF;

        SELECT * INTO v_conflict FROM public.internal_check_tutor_time_conflict(v_tutor_id, v_start_at, v_end_at);
        IF v_conflict.has_conflict THEN
            RAISE EXCEPTION 'تعارض في اللقاء %: %', v_sess_num, v_conflict.conflict_details;
        END IF;
    END LOOP;

    INSERT INTO public.tutor_groups (
        tutor_id,
        title,
        description,
        specialization_label,
        max_students,
        price_per_student,
        price_type,
        currency,
        sessions_count,
        session_duration_minutes,
        start_date,
        end_date,
        weekly_schedule_summary,
        offering_course_option_id,
        quran_age_group_id,
        quran_level_id,
        review_status,
        admin_review_notes,
        reviewed_at,
        status,
        is_published,
        admin_suspended,
        notes,
        created_at,
        updated_at
    ) VALUES (
        v_tutor_id,
        TRIM(p_title),
        TRIM(p_description),
        v_validated_label,
        p_max_students,
        p_price_per_student,
        p_price_type,
        COALESCE(NULLIF(TRIM(p_currency), ''), 'ج.م'),
        p_sessions_count,
        p_session_duration_minutes,
        p_start_date,
        p_end_date,
        TRIM(p_weekly_schedule_summary),
        p_offering_course_option_id,
        p_quran_age_group_id,
        p_quran_level_id,
        'approved',
        NULL,
        NOW(),
        'open',
        TRUE,
        FALSE,
        'تم النشر المباشر للمجموعة بواسطة المعلم المعتمد',
        NOW(),
        NOW()
    )
    RETURNING id INTO v_group_id;

    FOR v_sess IN SELECT * FROM jsonb_array_elements(p_sessions)
    LOOP
        INSERT INTO public.tutor_group_sessions (
            group_id,
            tutor_id,
            session_number,
            session_date,
            start_time,
            end_time,
            timezone,
            title,
            created_at,
            updated_at
        ) VALUES (
            v_group_id,
            v_tutor_id,
            (v_sess->>'sessionNumber')::INTEGER,
            (v_sess->>'sessionDate')::DATE,
            (v_sess->>'startTime')::TIME,
            (v_sess->>'endTime')::TIME,
            COALESCE(NULLIF(TRIM(v_sess->>'timezone'), ''), 'Africa/Cairo'),
            NULLIF(TRIM(v_sess->>'title'), ''),
            NOW(),
            NOW()
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'groupId', v_group_id,
        'message', 'تم إنشاء المجموعة ونشرها مباشرة للجمهور بنجاح.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_create_group(TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT, INTEGER, INTEGER, DATE, DATE, TEXT, JSONB, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_create_group(TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT, INTEGER, INTEGER, DATE, DATE, TEXT, JSONB, UUID, TEXT, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 3. حفظ تعديل المجموعة مباشرة دون سحب النشر: public.tutor_update_group
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.tutor_update_group(UUID, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT, INTEGER, INTEGER, DATE, DATE, TEXT, JSONB, UUID, TEXT, TEXT);
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
    v_group RECORD;
    v_confirmed_count INTEGER;
    v_validated_label TEXT;
    v_sess JSONB;
    v_sess2 JSONB;
    v_idx1 INTEGER;
    v_idx2 INTEGER;
    v_sess_num INTEGER;
    v_sess_date DATE;
    v_sess_start TIME;
    v_sess_end TIME;
    v_sess_tz TEXT;
    v_start_at TIMESTAMPTZ;
    v_end_at TIMESTAMPTZ;
    v_start_at2 TIMESTAMPTZ;
    v_end_at2 TIMESTAMPTZ;
    v_duration INTERVAL;
    v_conflict RECORD;
    v_sess_count_provided INTEGER;
BEGIN
    v_tutor_id := public.get_current_tutor_id();
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: حسابك غير مرتبط بملف معلم معتمد.';
    END IF;

    PERFORM public.acquire_tutor_lock(v_tutor_id);

    SELECT * INTO v_group
    FROM public.tutor_groups
    WHERE id = p_group_id AND tutor_id = v_tutor_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'المجموعة التعليمية غير موجودة أو لا تملك صلاحية تعديلها.';
    END IF;

    IF v_group.admin_suspended = TRUE THEN
        RAISE EXCEPTION 'المجموعة موقوفة إدارياً من قبل الإدارة؛ لا يمكن للمعلم تعديلها إلا بعد رفع الإيقاف الإداري.';
    END IF;

    IF v_group.review_status = 'rejected' THEN
        RAISE EXCEPTION 'لا يمكن تعديل مجموعة تم رفضها نهائياً من الإدارة.';
    END IF;

    IF v_group.status IN ('completed', 'cancelled') THEN
        RAISE EXCEPTION 'لا يمكن تعديل مجموعة منتهية أو ملغاة.';
    END IF;

    SELECT COUNT(*) INTO v_confirmed_count
    FROM public.tutor_group_enrollments
    WHERE group_id = p_group_id AND status = 'confirmed';

    IF v_confirmed_count > 0 THEN
        RAISE EXCEPTION 'لا يمكن تعديل شروط ومواعيد المجموعة لوجود طلاب مؤكدين.';
    END IF;

    IF NULLIF(TRIM(p_title), '') IS NULL THEN
        RAISE EXCEPTION 'اسم المجموعة التعليمية مطلوب.';
    END IF;

    IF p_max_students < 2 OR p_max_students > 20 THEN
        RAISE EXCEPTION 'الحد الأقصى للطلاب في المجموعة يجب أن يكون بين 2 و 20 طالباً.';
    END IF;

    IF p_price_per_student < 0 THEN
        RAISE EXCEPTION 'سعر الاشتراك للطالب يجب ألا يكون سالباً.';
    END IF;

    IF p_price_type NOT IN ('per_session', 'full_package') THEN
        RAISE EXCEPTION 'نوع السعر يجب أن يكون per_session أو full_package.';
    END IF;

    IF p_sessions_count < 1 THEN
        RAISE EXCEPTION 'عدد الحصص يجب أن يكون حصة واحدة على الأقل.';
    END IF;

    IF p_session_duration_minutes < 30 THEN
        RAISE EXCEPTION 'مدة الحصة يجب أن تكون 30 دقيقة على الأقل.';
    END IF;

    IF p_start_date < CURRENT_DATE THEN
        RAISE EXCEPTION 'تاريخ بدء المجموعة لا يجوز أن يكون في الماضي.';
    END IF;

    IF p_end_date IS NOT NULL AND p_end_date < p_start_date THEN
        RAISE EXCEPTION 'تاريخ انتهاء المجموعة يجب أن يكون بعد تاريخ البداية.';
    END IF;

    IF p_sessions IS NULL OR jsonb_typeof(p_sessions) <> 'array' OR jsonb_array_length(p_sessions) = 0 THEN
        RAISE EXCEPTION 'جدول لقاءات المجموعة (p_sessions) مطلوب.';
    END IF;

    v_sess_count_provided := jsonb_array_length(p_sessions);
    IF v_sess_count_provided <> p_sessions_count THEN
        RAISE EXCEPTION 'عدد اللقاءات المحددة لا يطابق عدد الحصص المطلوب.';
    END IF;

    v_validated_label := public.validate_and_get_tutor_specialization(
        v_tutor_id,
        p_offering_course_option_id,
        p_quran_age_group_id,
        p_quran_level_id
    );

    DELETE FROM public.tutor_group_sessions WHERE group_id = p_group_id;

    v_idx1 := 0;
    WHILE v_idx1 < v_sess_count_provided LOOP
        v_sess := p_sessions->v_idx1;

        IF v_sess->>'sessionNumber' IS NULL OR NULLIF(TRIM(v_sess->>'sessionNumber'), '') IS NULL OR
           v_sess->>'sessionDate' IS NULL OR NULLIF(TRIM(v_sess->>'sessionDate'), '') IS NULL OR
           v_sess->>'startTime' IS NULL OR NULLIF(TRIM(v_sess->>'startTime'), '') IS NULL OR
           v_sess->>'endTime' IS NULL OR NULLIF(TRIM(v_sess->>'endTime'), '') IS NULL THEN
            RAISE EXCEPTION 'بيانات اللقاء غير مكتملة.';
        END IF;

        v_start_at := ((v_sess->>'sessionDate')::DATE + (v_sess->>'startTime')::TIME) AT TIME ZONE COALESCE(NULLIF(TRIM(v_sess->>'timezone'), ''), 'Africa/Cairo');
        v_end_at := ((v_sess->>'sessionDate')::DATE + (v_sess->>'endTime')::TIME) AT TIME ZONE COALESCE(NULLIF(TRIM(v_sess->>'timezone'), ''), 'Africa/Cairo');

        v_idx2 := v_idx1 + 1;
        WHILE v_idx2 < v_sess_count_provided LOOP
            v_sess2 := p_sessions->v_idx2;
            v_start_at2 := ((v_sess2->>'sessionDate')::DATE + (v_sess2->>'startTime')::TIME) AT TIME ZONE COALESCE(NULLIF(TRIM(v_sess2->>'timezone'), ''), 'Africa/Cairo');
            v_end_at2 := ((v_sess2->>'sessionDate')::DATE + (v_sess2->>'endTime')::TIME) AT TIME ZONE COALESCE(NULLIF(TRIM(v_sess2->>'timezone'), ''), 'Africa/Cairo');

            IF tstzrange(v_start_at, v_end_at) && tstzrange(v_start_at2, v_end_at2) THEN
                RAISE EXCEPTION 'يوجد تداخل زمني بين اللقاءات في نفس الدفعة.';
            END IF;
            v_idx2 := v_idx2 + 1;
        END LOOP;
        v_idx1 := v_idx1 + 1;
    END LOOP;

    FOR v_sess IN SELECT * FROM jsonb_array_elements(p_sessions)
    LOOP
        v_sess_num := (v_sess->>'sessionNumber')::INTEGER;
        v_sess_date := (v_sess->>'sessionDate')::DATE;
        v_sess_start := (v_sess->>'startTime')::TIME;
        v_sess_end := (v_sess->>'endTime')::TIME;
        v_sess_tz := COALESCE(NULLIF(TRIM(v_sess->>'timezone'), ''), 'Africa/Cairo');

        IF v_sess_end <= v_sess_start THEN
            RAISE EXCEPTION 'وقت نهاية اللقاء يجب أن يكون بعد وقت البداية.';
        END IF;

        v_start_at := (v_sess_date + v_sess_start) AT TIME ZONE v_sess_tz;
        v_end_at := (v_sess_date + v_sess_end) AT TIME ZONE v_sess_tz;

        IF v_start_at <= NOW() THEN
            RAISE EXCEPTION 'وقت اللقاء في الماضي.';
        END IF;

        IF v_sess_date < p_start_date THEN
            RAISE EXCEPTION 'تاريخ اللقاء يسبق تاريخ بدء المجموعة.';
        END IF;

        IF p_end_date IS NOT NULL AND v_sess_date > p_end_date THEN
            RAISE EXCEPTION 'تاريخ اللقاء يتجاوز تاريخ نهاية المجموعة.';
        END IF;

        v_duration := v_end_at - v_start_at;
        IF EXTRACT(EPOCH FROM v_duration) / 60 != p_session_duration_minutes THEN
            RAISE EXCEPTION 'مدة اللقاء لا تطابق مدة الحصة المحددة للمجموعة.';
        END IF;

        SELECT * INTO v_conflict FROM public.internal_check_tutor_time_conflict(
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
    END LOOP;

    FOR v_sess IN SELECT * FROM jsonb_array_elements(p_sessions)
    LOOP
        INSERT INTO public.tutor_group_sessions (
            group_id,
            tutor_id,
            session_number,
            session_date,
            start_time,
            end_time,
            timezone,
            title,
            created_at,
            updated_at
        ) VALUES (
            p_group_id,
            v_tutor_id,
            (v_sess->>'sessionNumber')::INTEGER,
            (v_sess->>'sessionDate')::DATE,
            (v_sess->>'startTime')::TIME,
            (v_sess->>'endTime')::TIME,
            COALESCE(NULLIF(TRIM(v_sess->>'timezone'), ''), 'Africa/Cairo'),
            NULLIF(TRIM(v_sess->>'title'), ''),
            NOW(),
            NOW()
        );
    END LOOP;

    UPDATE public.tutor_groups
    SET title = TRIM(p_title),
        description = TRIM(p_description),
        max_students = p_max_students,
        price_per_student = p_price_per_student,
        price_type = p_price_type,
        currency = COALESCE(NULLIF(TRIM(p_currency), ''), 'ج.م'),
        sessions_count = p_sessions_count,
        session_duration_minutes = p_session_duration_minutes,
        start_date = p_start_date,
        end_date = p_end_date,
        weekly_schedule_summary = TRIM(p_weekly_schedule_summary),
        specialization_label = v_validated_label,
        offering_course_option_id = p_offering_course_option_id,
        quran_age_group_id = p_quran_age_group_id,
        quran_level_id = p_quran_level_id,
        review_status = 'approved',
        is_published = TRUE,
        updated_at = NOW()
    WHERE id = p_group_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'تم تحديث بيانات المجموعة بنجاح وتحديث نشرها المباشر.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_update_group(UUID, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT, INTEGER, INTEGER, DATE, DATE, TEXT, JSONB, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_update_group(UUID, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT, INTEGER, INTEGER, DATE, DATE, TEXT, JSONB, UUID, TEXT, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 4. حماية تحديث حالة المجموعة بواسطة المعلم: public.tutor_update_group_status
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tutor_update_group_status(
    p_group_id UUID,
    p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_tutor_id TEXT;
    v_group RECORD;
    v_confirmed_count INTEGER;
BEGIN
    v_tutor_id := public.get_current_tutor_id();
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: حسابك غير مرتبط بملف معلم معتمد.';
    END IF;

    IF p_status NOT IN ('open', 'in_progress', 'completed', 'cancelled') THEN
        RAISE EXCEPTION 'حالة المجموعة غير صالحة.';
    END IF;

    PERFORM public.acquire_tutor_lock(v_tutor_id);

    SELECT * INTO v_group
    FROM public.tutor_groups
    WHERE id = p_group_id AND tutor_id = v_tutor_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'المجموعة التعليمية غير موجودة.';
    END IF;

    IF v_group.admin_suspended = TRUE THEN
        RAISE EXCEPTION 'المجموعة موقوفة إدارياً من قبل الإدارة.';
    END IF;

    IF v_group.status IN ('completed', 'cancelled') THEN
        RAISE EXCEPTION 'لا يمكن للمعلم إعادة فتح مجموعة مكتملة أو ملغاة.';
    END IF;

    IF p_status = 'completed' THEN
        IF EXISTS (
            SELECT 1 FROM public.tutor_group_enrollments ge
            WHERE ge.group_id = p_group_id AND ge.status = 'confirmed'
        ) AND EXISTS (
            SELECT 1 FROM public.tutor_group_sessions gs
            WHERE gs.group_id = p_group_id
              AND (gs.session_date + gs.end_time) AT TIME ZONE COALESCE(NULLIF(TRIM(gs.timezone), ''), 'Africa/Cairo') > NOW()
        ) THEN
            RAISE EXCEPTION 'لا يمكن إنهاء المجموعة مبكراً لوجود لقاءات لم تنتهِ بعد لطلاب مؤكدين.';
        END IF;

        UPDATE public.tutor_groups
        SET status = 'completed',
            is_published = FALSE,
            updated_at = NOW()
        WHERE id = p_group_id;

        RETURN jsonb_build_object('success', TRUE, 'message', 'تم إنهاء المجموعة التعليمية بنجاح.');
    END IF;

    IF p_status = 'cancelled' THEN
        SELECT COUNT(*) INTO v_confirmed_count
        FROM public.tutor_group_enrollments
        WHERE group_id = p_group_id AND status = 'confirmed';

        IF v_confirmed_count > 0 THEN
            RAISE EXCEPTION 'لا يمكن للمعلم إلغاء مجموعة بها طلاب مؤكدون.';
        END IF;

        UPDATE public.tutor_groups
        SET status = 'cancelled',
            is_published = FALSE,
            updated_at = NOW()
        WHERE id = p_group_id;

        RETURN jsonb_build_object('success', TRUE, 'message', 'تم إلغاء المجموعة التعليمية بنجاح.');
    END IF;

    IF p_status = 'open' THEN
        IF v_group.review_status <> 'approved' THEN
            RAISE EXCEPTION 'لا يمكن فتح التسجيل في المجموعة قبل اعتمادها إدارياً.';
        END IF;
    END IF;

    UPDATE public.tutor_groups
    SET status = p_status,
        is_published = CASE WHEN v_group.admin_suspended = TRUE THEN FALSE ELSE TRUE END,
        updated_at = NOW()
    WHERE id = p_group_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'تم تحديث حالة المجموعة بنجاح.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_update_group_status(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_update_group_status(UUID, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 5. حماية تعديل وحذف المواعيد الخاصة والتجريبية من تجاوز الإيقاف الإداري
-- ------------------------------------------------------------------------------

-- 5.1 تعديل موعد خاص بواسطة المعلم: منع تعديل موعد موقوف إدارياً
DROP FUNCTION IF EXISTS public.tutor_update_private_slot(UUID, DATE, TIME, TIME, INTEGER, INTEGER, UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.tutor_update_private_slot(UUID, DATE, TIME, TIME, INTEGER, INTEGER, TEXT, UUID, TEXT, TEXT);

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
    p_quran_level_id TEXT DEFAULT NULL
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
    v_duration INTERVAL;
    v_conflict RECORD;
    v_validated_label TEXT;
BEGIN
    v_tutor_id := public.get_current_tutor_id();
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: حسابك غير مرتبط بملف معلم معتمد.';
    END IF;

    PERFORM public.acquire_tutor_lock(v_tutor_id);

    SELECT * INTO v_slot
    FROM public.tutor_private_slots
    WHERE id = p_slot_id AND tutor_id = v_tutor_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'الموعد الخاص غير موجود أو لا تملك صلاحية تعديله.';
    END IF;

    IF v_slot.admin_suspended = TRUE THEN
        RAISE EXCEPTION 'الموعد موقوف إدارياً من قبل الإدارة.';
    END IF;

    IF v_slot.is_booked = TRUE THEN
        RAISE EXCEPTION 'لا يمكن تعديل موعد خاص محجوز بالفعل لطالب.';
    END IF;

    IF p_slot_date < CURRENT_DATE THEN
        RAISE EXCEPTION 'لا يمكن جدولة موعد خاص في تاريخ سابق.';
    END IF;

    IF p_end_time <= p_start_time THEN
        RAISE EXCEPTION 'وقت نهاية الحصة يجب أن يكون بعد وقت البداية.';
    END IF;

    IF p_price_amount < 0 THEN
        RAISE EXCEPTION 'سعر الحصة الخاصة لا يمكن أن يكون سالباً.';
    END IF;

    IF p_duration_minutes < 20 THEN
        RAISE EXCEPTION 'مدة الحصة الخاصة يجب أن تكون 20 دقيقة على الأقل.';
    END IF;

    v_tz := COALESCE(NULLIF(TRIM(p_timezone), ''), 'Africa/Cairo');
    v_start_at := (p_slot_date + p_start_time) AT TIME ZONE v_tz;
    v_end_at := (p_slot_date + p_end_time) AT TIME ZONE v_tz;

    IF v_start_at <= NOW() THEN
        RAISE EXCEPTION 'وقت الموعد الخاص انقضى في الماضي.';
    END IF;

    v_duration := v_end_at - v_start_at;
    IF EXTRACT(EPOCH FROM v_duration) / 60 != p_duration_minutes THEN
        RAISE EXCEPTION 'فارق التوقيت لا يطابق مدة الحصة المحددة.';
    END IF;

    v_validated_label := public.validate_and_get_tutor_specialization(
        v_tutor_id,
        p_offering_course_option_id,
        p_quran_age_group_id,
        p_quran_level_id
    );

    SELECT * INTO v_conflict FROM public.internal_check_tutor_time_conflict(
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
        specialization_label = v_validated_label,
        offering_course_option_id = p_offering_course_option_id,
        quran_age_group_id = p_quran_age_group_id,
        quran_level_id = p_quran_level_id,
        is_available = TRUE,
        updated_at = NOW()
    WHERE id = p_slot_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'تم تحديث الموعد الخاص بنجاح.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_update_private_slot(UUID, DATE, TIME, TIME, INTEGER, INTEGER, TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_update_private_slot(UUID, DATE, TIME, TIME, INTEGER, INTEGER, TEXT, UUID, TEXT, TEXT) TO authenticated, service_role;

-- 5.2 حذف موعد خاص بواسطة المعلم: منع حذف موعد موقوف إدارياً أو محجوز أو في الماضي
DROP FUNCTION IF EXISTS public.tutor_delete_private_slot(UUID);

CREATE OR REPLACE FUNCTION public.tutor_delete_private_slot(p_slot_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_tutor_id TEXT;
    v_slot RECORD;
    v_start_at TIMESTAMPTZ;
    v_tz TEXT;
BEGIN
    v_tutor_id := public.get_current_tutor_id();
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: حسابك غير مرتبط بملف معلم معتمد.';
    END IF;

    PERFORM public.acquire_tutor_lock(v_tutor_id);

    SELECT * INTO v_slot
    FROM public.tutor_private_slots
    WHERE id = p_slot_id AND tutor_id = v_tutor_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'الموعد الخاص غير موجود.';
    END IF;

    IF v_slot.admin_suspended = TRUE THEN
        RAISE EXCEPTION 'الموعد موقوف إدارياً من قبل الإدارة.';
    END IF;

    IF v_slot.is_booked = TRUE THEN
        RAISE EXCEPTION 'لا يمكن حذف موعد خاص تم حجزه.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.tutor_private_bookings
        WHERE slot_id = p_slot_id AND status IN ('pending', 'confirmed')
    ) THEN
        RAISE EXCEPTION 'لا يمكن حذف الموعد لوجود طلب حجز.';
    END IF;

    IF v_slot.is_available = FALSE THEN
        RAISE EXCEPTION 'لا يمكن حذف موعد مغلق إدارياً.';
    END IF;

    v_tz := COALESCE(NULLIF(TRIM(v_slot.timezone), ''), 'Africa/Cairo');
    v_start_at := (v_slot.slot_date + v_slot.start_time) AT TIME ZONE v_tz;

    IF v_start_at <= NOW() THEN
        RAISE EXCEPTION 'لا يمكن حذف موعد في الماضي.';
    END IF;

    DELETE FROM public.tutor_private_slots WHERE id = p_slot_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'تم حذف الموعد الخاص بنجاح.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_delete_private_slot(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_delete_private_slot(UUID) TO authenticated, service_role;

-- 5.3 حذف موعد تجريبي بواسطة المعلم: منع حذف موعد موقوف إدارياً أو محجوز أو غير متاح أو انقضى وقته
DROP FUNCTION IF EXISTS public.tutor_delete_slot(UUID);

CREATE OR REPLACE FUNCTION public.tutor_delete_slot(p_slot_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_tutor_id TEXT;
    v_slot RECORD;
    v_start_at TIMESTAMPTZ;
    v_tz TEXT;
BEGIN
    v_tutor_id := public.get_current_tutor_id();
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: حسابك غير مرتبط بملف معلم معتمد.';
    END IF;

    PERFORM public.acquire_tutor_lock(v_tutor_id);

    SELECT * INTO v_slot
    FROM public.tutor_available_slots
    WHERE id = p_slot_id AND tutor_id = v_tutor_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'الموعد المحدد غير موجود.';
    END IF;

    IF v_slot.admin_suspended = TRUE THEN
        RAISE EXCEPTION 'الموعد موقوف إدارياً من قبل الإدارة.';
    END IF;

    IF v_slot.is_booked = TRUE THEN
        RAISE EXCEPTION 'لا يمكن حذف موعد محجوز.';
    END IF;


    IF v_slot.is_available = FALSE THEN
        RAISE EXCEPTION 'لا يمكن حذف موعد غير متاح.';
    END IF;

    v_tz := COALESCE(NULLIF(TRIM(v_slot.timezone), ''), 'Africa/Cairo');
    v_start_at := (v_slot.slot_date + v_slot.start_time) AT TIME ZONE v_tz;

    IF v_start_at <= NOW() THEN
        RAISE EXCEPTION 'لا يمكن حذف موعد في الماضي.';
    END IF;

    DELETE FROM public.tutor_available_slots WHERE id = p_slot_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'تم حذف الموعد التجريبي بنجاح.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_delete_slot(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_delete_slot(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 6. ضوابط الإيقاف الإداري للمعلم والمشرف في المجموعات والمواعيد
-- ------------------------------------------------------------------------------

-- 6.1 استئناف أو تعليق مجموعة من الإدارة: public.admin_suspend_group()
DROP FUNCTION IF EXISTS public.admin_suspend_group(UUID, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.admin_suspend_group(UUID, BOOLEAN);
CREATE OR REPLACE FUNCTION public.admin_suspend_group(
    p_group_id UUID,
    p_is_suspended BOOLEAN,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_group RECORD;
    v_tutor_id TEXT;
    v_sess RECORD;
    v_tz TEXT;
    v_start_at TIMESTAMPTZ;
    v_end_at TIMESTAMPTZ;
    v_conflict RECORD;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذا الإجراء مخصص لمشرفي النظام فقط.';
    END IF;

    SELECT tutor_id INTO v_tutor_id
    FROM public.tutor_groups
    WHERE id = p_group_id;

    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'المجموعة التعليمية غير موجودة.';
    END IF;

    PERFORM public.acquire_tutor_lock(v_tutor_id);

    SELECT * INTO v_group
    FROM public.tutor_groups
    WHERE id = p_group_id
    FOR UPDATE;

    IF p_is_suspended = TRUE THEN
        UPDATE public.tutor_groups
        SET admin_suspended = TRUE,
            admin_suspension_reason = TRIM(p_reason),
            is_published = FALSE,
            updated_at = NOW()
        WHERE id = p_group_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'groupId', p_group_id,
            'isSuspended', TRUE,
            'isPublished', FALSE,
            'message', 'تم تعليق المجموعة إدارياً وإلغاء نشرها بنجاح.'
        );
    ELSE
        IF v_group.status NOT IN ('open', 'in_progress') THEN
            RAISE EXCEPTION 'لا يمكن استئناف عرض مجموعة حالتها (%)؛ الاستئناف متاح فقط للمجموعات المفتوحة أو الجارية.', v_group.status;
        END IF;

        IF v_group.review_status <> 'approved' THEN
            RAISE EXCEPTION 'لا يمكن استئناف عرض مجموعة غير معتمدة إدارياً.';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.tutor_group_sessions gs
            WHERE gs.group_id = p_group_id
              AND (gs.session_date + gs.end_time) AT TIME ZONE COALESCE(NULLIF(TRIM(gs.timezone), ''), 'Africa/Cairo') >= NOW()
        ) THEN
            RAISE EXCEPTION 'لا يمكن استئناف عرض المجموعة لانتهاء كافة لقاءاتها بالفعل.';
        END IF;

        FOR v_sess IN 
            SELECT * FROM public.tutor_group_sessions
            WHERE group_id = p_group_id
            ORDER BY session_number ASC
        LOOP
            v_tz := COALESCE(NULLIF(TRIM(v_sess.timezone), ''), 'Africa/Cairo');
            v_start_at := (v_sess.session_date + v_sess.start_time) AT TIME ZONE v_tz;
            v_end_at := (v_sess.session_date + v_sess.end_time) AT TIME ZONE v_tz;

            IF v_end_at >= NOW() THEN
                SELECT * INTO v_conflict FROM public.internal_check_tutor_time_conflict(
                    v_tutor_id,
                    v_start_at,
                    v_end_at,
                    NULL,
                    NULL,
                    v_sess.id
                );
                IF v_conflict.has_conflict THEN
                    RAISE EXCEPTION 'لا يمكن استئناف نشر المجموعة لوجود تعارض في اللقاء %: %', v_sess.session_number, v_conflict.conflict_details;
                END IF;
            END IF;
        END LOOP;

        UPDATE public.tutor_groups
        SET admin_suspended = FALSE,
            is_published = TRUE,
            admin_suspension_reason = NULL,
            updated_at = NOW()
        WHERE id = p_group_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'groupId', p_group_id,
            'isSuspended', FALSE,
            'isPublished', TRUE,
            'message', 'تم استئناف نشر المجموعة التعليمية للجمهور بنجاح.'
        );
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_suspend_group(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_suspend_group(UUID, BOOLEAN, TEXT) TO authenticated, service_role;

-- 6.2 تعليق أو إتاحة موعد خاص من الإدارة: public.admin_toggle_private_slot_availability()
DROP FUNCTION IF EXISTS public.admin_toggle_private_slot_availability(UUID, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.admin_toggle_private_slot_availability(UUID, BOOLEAN);
CREATE OR REPLACE FUNCTION public.admin_toggle_private_slot_availability(
    p_slot_id UUID,
    p_is_available BOOLEAN,
    p_notes TEXT DEFAULT NULL
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
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذا الإجراء مخصص لمشرفي النظام فقط.';
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

    IF v_slot.is_booked = TRUE AND p_is_available = TRUE THEN
        RAISE EXCEPTION 'لا يمكن تعديل موعد خاص محجوز ومؤكد بالفعل لطالب.';
    END IF;

    IF p_is_available = TRUE THEN
        v_tz := COALESCE(NULLIF(TRIM(v_slot.timezone), ''), 'Africa/Cairo');
        v_start_at := (v_slot.slot_date + v_slot.start_time) AT TIME ZONE v_tz;
        v_end_at := (v_slot.slot_date + v_slot.end_time) AT TIME ZONE v_tz;

        IF v_start_at <= NOW() THEN
            RAISE EXCEPTION 'لا يمكن فتح موعد في الماضي أو انقضى وقته اليوم بتوقيت %.', v_tz;
        END IF;

        SELECT * INTO v_conflict FROM public.internal_check_tutor_time_conflict(
            v_tutor_id,
            v_start_at,
            v_end_at,
            NULL,
            p_slot_id,
            NULL
        );

        IF v_conflict.has_conflict THEN
            RAISE EXCEPTION 'لا يمكن إتاحة الموعد لوجود تعارض زمني: %', v_conflict.conflict_details;
        END IF;

        UPDATE public.tutor_private_slots
        SET is_available = TRUE,
            admin_suspended = FALSE,
            admin_suspension_notes = NULL,
            notes = COALESCE(NULLIF(TRIM(p_notes), ''), notes),
            updated_at = NOW()
        WHERE id = p_slot_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'slotId', p_slot_id,
            'isAvailable', TRUE,
            'adminSuspended', FALSE,
            'message', 'تمت إتاحة الموعد الخاص بنجاح.'
        );
    ELSE
        UPDATE public.tutor_private_slots
        SET is_available = FALSE,
            admin_suspended = TRUE,
            admin_suspension_notes = NULLIF(TRIM(p_notes), ''),
            notes = COALESCE(NULLIF(TRIM(p_notes), ''), notes),
            updated_at = NOW()
        WHERE id = p_slot_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'slotId', p_slot_id,
            'isAvailable', FALSE,
            'adminSuspended', TRUE,
            'message', 'تم إيقاف عرض الموعد الخاص إدارياً بنجاح.'
        );
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_toggle_private_slot_availability(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_toggle_private_slot_availability(UUID, BOOLEAN, TEXT) TO authenticated, service_role;

-- 6.3 تعليق أو إتاحة موعد تجريبي من الإدارة: public.admin_toggle_slot_availability()
DROP FUNCTION IF EXISTS public.admin_toggle_slot_availability(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.admin_toggle_slot_availability(UUID, BOOLEAN, TEXT);
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
    v_tz TEXT;
    v_start_at TIMESTAMPTZ;
    v_end_at TIMESTAMPTZ;
    v_conflict RECORD;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية مخصصة لمديري النظام فقط.';
    END IF;

    SELECT tutor_id INTO v_tutor_id FROM public.tutor_available_slots WHERE id = p_slot_id;
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'الموعد المحدد غير موجود.';
    END IF;

    PERFORM public.acquire_tutor_lock(v_tutor_id);

    SELECT * INTO v_slot FROM public.tutor_available_slots WHERE id = p_slot_id FOR UPDATE;
    IF v_slot.id IS NULL THEN
        RAISE EXCEPTION 'الموعد المحدد غير موجود.';
    END IF;

    IF v_slot.is_booked = TRUE AND p_is_available = TRUE THEN
        RAISE EXCEPTION 'لا يمكن تعديل موعد مؤكد الحجز عبر الإغلاق العادي. الحجز مؤكد لطالب ومحمي بالسجلات.';
    END IF;

    IF p_is_available = TRUE THEN
        v_tz := COALESCE(NULLIF(TRIM(v_slot.timezone), ''), 'Africa/Cairo');
        v_start_at := (v_slot.slot_date + v_slot.start_time) AT TIME ZONE v_tz;
        v_end_at := (v_slot.slot_date + v_slot.end_time) AT TIME ZONE v_tz;

        IF v_start_at <= NOW() THEN
            RAISE EXCEPTION 'لا يمكن إعادة فتح موعد في الماضي أو انقضى وقته اليوم بتوقيت %.', v_tz;
        END IF;

        SELECT * INTO v_conflict FROM public.internal_check_tutor_time_conflict(v_tutor_id, v_start_at, v_end_at, p_slot_id, NULL, NULL);
        IF v_conflict.has_conflict THEN
            RAISE EXCEPTION 'لا يمكن إعادة فتح الموعد لوجود تعارض زمني: %', v_conflict.conflict_details;
        END IF;
    END IF;

    UPDATE public.tutor_available_slots
    SET is_available = p_is_available,
        admin_suspended = (NOT p_is_available),
        notes = COALESCE(NULLIF(TRIM(p_notes), ''), notes),
        updated_at = NOW()
    WHERE id = p_slot_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_toggle_slot_availability(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_toggle_slot_availability(UUID, BOOLEAN, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 7. تحديث عمليات الحجز والاشتراكات الإدارية (مع فحص admin_suspended وحماية التكرار)
-- ------------------------------------------------------------------------------

-- 7.1 إنشاء حجز حصة خاصة من الإدارة
CREATE OR REPLACE FUNCTION public.admin_create_private_booking(
    p_slot_id UUID,
    p_student_name TEXT,
    p_guardian_name TEXT,
    p_phone_number TEXT,
    p_agreed_price INTEGER,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_tutor_id TEXT;
    v_slot RECORD;
    v_booking_id UUID;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذا الإجراء مخصص لمشرفي النظام فقط.';
    END IF;

    IF NULLIF(TRIM(p_student_name), '') IS NULL OR NULLIF(TRIM(p_guardian_name), '') IS NULL OR NULLIF(TRIM(p_phone_number), '') IS NULL THEN
        RAISE EXCEPTION 'بيانات الطالب وولي الأمر ورقم الهاتف مطلوبة.';
    END IF;

    SELECT tutor_id INTO v_tutor_id
    FROM public.tutor_private_slots
    WHERE id = p_slot_id;

    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'الموعد الخاص المحدد غير موجود.';
    END IF;

    PERFORM public.acquire_tutor_lock(v_tutor_id);

    SELECT id INTO v_booking_id
    FROM public.tutor_private_bookings
    WHERE slot_id = p_slot_id
      AND phone_number = TRIM(p_phone_number)
      AND student_name = TRIM(p_student_name)
      AND status IN ('pending', 'confirmed');

    IF v_booking_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'bookingId', v_booking_id,
            'alreadyExists', TRUE,
            'message', 'يوجد طلب حجز مسجل بالفعل لهذا الموعد ورقم الهاتف.'
        );
    END IF;

    SELECT * INTO v_slot
    FROM public.tutor_private_slots
    WHERE id = p_slot_id
    FOR UPDATE;

    IF v_slot.admin_suspended = TRUE THEN
        RAISE EXCEPTION 'الموعد الخاص موقوف إدارياً ولا يمكن حجز موعد موقوف.';
    END IF;

    IF v_slot.is_booked = TRUE THEN
        RAISE EXCEPTION 'الموعد الخاص محجوز بالفعل لطالب آخر.';
    END IF;

    IF v_slot.is_available = FALSE THEN
        RAISE EXCEPTION 'الموعد الخاص مغلق إدارياً وغير متاح للحجز.';
    END IF;

    IF (v_slot.slot_date + v_slot.start_time) AT TIME ZONE COALESCE(NULLIF(TRIM(v_slot.timezone), ''), 'Africa/Cairo') <= NOW() THEN
        RAISE EXCEPTION 'الموعد الخاص في الماضي أو انقضى وقته اليوم.';
    END IF;

    INSERT INTO public.tutor_private_bookings (
        slot_id,
        tutor_id,
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
        TRIM(p_student_name),
        TRIM(p_guardian_name),
        TRIM(p_phone_number),
        p_agreed_price,
        v_slot.currency,
        'pending',
        TRIM(p_notes)
    )
    RETURNING id INTO v_booking_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'bookingId', v_booking_id,
        'message', 'تم تسجيل طلب حجز الحصة الخاصة بنجاح (قيد التأكيد الإداري).'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_private_booking(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_private_booking(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT) TO authenticated, service_role;

-- 7.2 تأكيد حجز حصة خاصة من الإدارة: فحص admin_suspended صراحةً
CREATE OR REPLACE FUNCTION public.admin_confirm_private_booking(
    p_booking_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_booking_tutor_id TEXT;
    v_booking RECORD;
    v_slot RECORD;
    v_tz TEXT;
    v_start_at TIMESTAMPTZ;
    v_end_at TIMESTAMPTZ;
    v_conflict RECORD;
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

    IF v_slot.admin_suspended = TRUE THEN
        RAISE EXCEPTION 'الموعد الخاص موقوف إدارياً؛ لا يمكن تأكيد حجز موعد موقوف.';
    END IF;

    IF v_slot.is_booked = TRUE THEN
        RAISE EXCEPTION 'الموعد الخاص محجوز ومؤكد بالفعل لطالب آخر.';
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

    SELECT * INTO v_conflict FROM public.internal_check_tutor_time_conflict(
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
        confirmed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_booking_id;

    UPDATE public.tutor_private_slots
    SET is_booked = TRUE,
        is_available = FALSE,
        booked_at = NOW(),
        updated_at = NOW()
    WHERE id = v_booking.slot_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'bookingId', p_booking_id,
        'message', 'تم تأكيد حجز الحصة الخاصة وحجز الموعد بنجاح.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_confirm_private_booking(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_confirm_private_booking(UUID) TO authenticated, service_role;

-- 7.3 إلغاء حجز خاص من الإدارة: يحترم admin_suspended ولا يرفع الإيقاف الإداري
DROP FUNCTION IF EXISTS public.admin_cancel_private_booking(UUID, TEXT, BOOLEAN);
CREATE OR REPLACE FUNCTION public.admin_cancel_private_booking(
    p_booking_id UUID,
    p_cancellation_reason TEXT DEFAULT NULL,
    p_reopen_slot BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_booking RECORD;
    v_slot RECORD;
    v_tutor_id TEXT;
    v_tz TEXT;
    v_start_at TIMESTAMPTZ;
    v_conflict RECORD;
    v_should_reopen BOOLEAN := FALSE;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذا الإجراء مخصص لمشرفي النظام فقط.';
    END IF;

    SELECT tutor_id INTO v_tutor_id
    FROM public.tutor_private_bookings
    WHERE id = p_booking_id;

    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'طلب الحجز غير موجود.';
    END IF;

    PERFORM public.acquire_tutor_lock(v_tutor_id);

    SELECT * INTO v_booking
    FROM public.tutor_private_bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF v_booking.status = 'completed' THEN
        RAISE EXCEPTION 'لا يمكن إلغاء حجز مكتمل انتهت حصته بالفعل.';
    END IF;

    IF v_booking.status = 'cancelled' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'bookingId', p_booking_id,
            'alreadyCancelled', TRUE,
            'message', 'الحجز ملغى بالفعل مسبقاً.'
        );
    END IF;

    SELECT * INTO v_slot
    FROM public.tutor_private_slots
    WHERE id = v_booking.slot_id
    FOR UPDATE;

    UPDATE public.tutor_private_bookings
    SET status = 'cancelled',
        cancellation_reason = p_cancellation_reason,
        cancelled_by = 'admin',
        cancelled_at = NOW(),
        updated_at = NOW()
    WHERE id = p_booking_id;

    IF p_reopen_slot = TRUE AND v_slot.admin_suspended IS NOT TRUE THEN
        v_tz := COALESCE(NULLIF(TRIM(v_slot.timezone), ''), 'Africa/Cairo');
        v_start_at := (v_slot.slot_date + v_slot.start_time) AT TIME ZONE v_tz;
        IF v_start_at > NOW() THEN
            SELECT * INTO v_conflict FROM public.internal_check_tutor_time_conflict(
                v_slot.tutor_id,
                v_start_at,
                (v_slot.slot_date + v_slot.end_time) AT TIME ZONE v_tz,
                NULL,
                v_slot.id,
                NULL
            );
            IF NOT v_conflict.has_conflict THEN
                v_should_reopen := TRUE;
            END IF;
        END IF;
    END IF;

    UPDATE public.tutor_private_slots
    SET is_booked = FALSE,
        booked_at = NULL,
        is_available = v_should_reopen,
        updated_at = NOW()
    WHERE id = v_booking.slot_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'bookingId', p_booking_id,
        'reopened', v_should_reopen,
        'adminSuspended', v_slot.admin_suspended,
        'message', 'تم إلغاء الحجز وتوثيق السجل بنجاح مع احترام حالة الإيقاف الإداري للموعد.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_cancel_private_booking(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_private_booking(UUID, TEXT, BOOLEAN) TO authenticated, service_role;

-- 7.4 إنشاء اشتراك في مجموعة من الإدارة: فحص admin_suspended صراحةً
CREATE OR REPLACE FUNCTION public.admin_create_group_enrollment(
    p_group_id UUID,
    p_student_name TEXT,
    p_guardian_name TEXT,
    p_phone_number TEXT,
    p_agreed_price INTEGER,
    p_price_type TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_tutor_id TEXT;
    v_group RECORD;
    v_enrollment_id UUID;
    v_confirmed_count INTEGER;
    v_resolved_price_type TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذا الإجراء مخصص لمشرفي النظام فقط.';
    END IF;

    IF NULLIF(TRIM(p_student_name), '') IS NULL OR NULLIF(TRIM(p_guardian_name), '') IS NULL OR NULLIF(TRIM(p_phone_number), '') IS NULL THEN
        RAISE EXCEPTION 'بيانات الطالب وولي الأمر ورقم الهاتف مطلوبة.';
    END IF;

    SELECT tutor_id INTO v_tutor_id
    FROM public.tutor_groups
    WHERE id = p_group_id;

    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'المجموعة التعليمية غير موجودة.';
    END IF;

    PERFORM public.acquire_tutor_lock(v_tutor_id);

    SELECT id INTO v_enrollment_id
    FROM public.tutor_group_enrollments
    WHERE group_id = p_group_id
      AND phone_number = TRIM(p_phone_number)
      AND student_name = TRIM(p_student_name)
      AND status IN ('pending', 'confirmed');

    IF v_enrollment_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'enrollmentId', v_enrollment_id,
            'alreadyExists', TRUE,
            'message', 'يوجد طلب اشتراك مسجل بالفعل لهذا الطالب في هذه المجموعة.'
        );
    END IF;

    SELECT * INTO v_group
    FROM public.tutor_groups
    WHERE id = p_group_id
    FOR UPDATE;

    IF v_group.admin_suspended = TRUE THEN
        RAISE EXCEPTION 'المجموعة موقوفة إدارياً حالياً ولا يمكن قبول اشتراكات جديدة.';
    END IF;

    IF v_group.review_status <> 'approved' THEN
        RAISE EXCEPTION 'المجموعة لم يتم اعتمادها إدارياً بعد.';
    END IF;

    IF v_group.is_published <> TRUE THEN
        RAISE EXCEPTION 'المجموعة غير معروضة للنشر العام حالياً.';
    END IF;

    IF v_group.status NOT IN ('open', 'in_progress') THEN
        RAISE EXCEPTION 'حالة المجموعة لا تسمح بقبول اشتراكات جديدة.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.tutor_group_sessions gs
        WHERE gs.group_id = p_group_id
          AND (gs.session_date + gs.start_time) AT TIME ZONE COALESCE(NULLIF(TRIM(gs.timezone), ''), 'Africa/Cairo') > NOW()
    ) THEN
        RAISE EXCEPTION 'انتهى جدول لقاءات هذه المجموعة بالكامل ولا يمكن قبول اشتراكات جديدة.';
    END IF;

    SELECT COUNT(*) INTO v_confirmed_count
    FROM public.tutor_group_enrollments
    WHERE group_id = p_group_id
      AND status = 'confirmed';

    IF v_confirmed_count >= v_group.max_students THEN
        RAISE EXCEPTION 'اكتملت سعة المجموعة بالكامل.';
    END IF;

    v_resolved_price_type := COALESCE(p_price_type, v_group.price_type, 'full_package');

    INSERT INTO public.tutor_group_enrollments (
        group_id,
        tutor_id,
        student_name,
        guardian_name,
        phone_number,
        agreed_price,
        currency,
        status,
        notes
    ) VALUES (
        p_group_id,
        v_tutor_id,
        TRIM(p_student_name),
        TRIM(p_guardian_name),
        TRIM(p_phone_number),
        p_agreed_price,
        v_group.currency,
        'pending',
        TRIM(p_notes)
    )
    RETURNING id INTO v_enrollment_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'enrollmentId', v_enrollment_id,
        'message', 'تم تسجيل طلب الاشتراك في المجموعة بنجاح (قيد التأكيد الإداري).'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_group_enrollment(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_group_enrollment(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT) TO authenticated, service_role;

-- 7.5 تأكيد اشتراك في مجموعة من الإدارة: فحص admin_suspended صراحةً
CREATE OR REPLACE FUNCTION public.admin_confirm_group_enrollment(
    p_enrollment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_enrollment_tutor_id TEXT;
    v_enrollment RECORD;
    v_group RECORD;
    v_active_confirmed_count INTEGER;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذا الإجراء مخصص لمشرفي المنصة فقط.';
    END IF;

    SELECT tutor_id INTO v_enrollment_tutor_id
    FROM public.tutor_group_enrollments
    WHERE id = p_enrollment_id;

    IF v_enrollment_tutor_id IS NULL THEN
        RAISE EXCEPTION 'طلب الاشتراك في المجموعة غير موجود.';
    END IF;

    PERFORM public.acquire_tutor_lock(v_enrollment_tutor_id);

    SELECT * INTO v_enrollment
    FROM public.tutor_group_enrollments
    WHERE id = p_enrollment_id
    FOR UPDATE;

    IF v_enrollment.status = 'confirmed' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'enrollmentId', p_enrollment_id,
            'alreadyConfirmed', TRUE,
            'message', 'الاشتراك مؤكد بالفعل مسبقاً.'
        );
    END IF;

    IF v_enrollment.status IN ('cancelled', 'completed') THEN
        RAISE EXCEPTION 'لا يمكن تأكيد اشتراك ملغى أو مكتمل.';
    END IF;

    IF v_enrollment.status <> 'pending' THEN
        RAISE EXCEPTION 'لا يمكن تأكيد الاشتراك إلا من حالة قيد المراجعة.';
    END IF;

    SELECT * INTO v_group
    FROM public.tutor_groups
    WHERE id = v_enrollment.group_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'المجموعة التعليمية المرتبطة بالاشتراك غير موجودة.';
    END IF;

    IF v_group.tutor_id <> v_enrollment.tutor_id THEN
        RAISE EXCEPTION 'تضارب في معرف المعلم بين المجموعة وسجل الاشتراك.';
    END IF;

    IF v_group.admin_suspended = TRUE THEN
        RAISE EXCEPTION 'المجموعة موقوفة إدارياً حالياً؛ لا يمكن تأكيد اشتراكات في مجموعة موقوفة.';
    END IF;

    IF v_group.review_status <> 'approved' THEN
        RAISE EXCEPTION 'لا يمكن تأكيد اشتراك في مجموعة غير معتمدة إدارياً.';
    END IF;

    IF v_group.is_published <> TRUE THEN
        RAISE EXCEPTION 'المجموعة غير معروضة للنشر العام.';
    END IF;

    IF v_group.status NOT IN ('open', 'in_progress') THEN
        RAISE EXCEPTION 'حالة المجموعة لا تسمح بتأكيد طلاب جدد.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.tutor_group_sessions gs
        WHERE gs.group_id = v_enrollment.group_id
          AND (gs.session_date + gs.end_time) AT TIME ZONE COALESCE(NULLIF(TRIM(gs.timezone), ''), 'Africa/Cairo') > NOW()
    ) THEN
        RAISE EXCEPTION 'انتهت كافة لقاءات المجموعة في الماضي ولا يمكن تأكيد اشتراك متأخر.';
    END IF;

    SELECT COUNT(*) INTO v_active_confirmed_count
    FROM public.tutor_group_enrollments
    WHERE group_id = v_enrollment.group_id
      AND status = 'confirmed';

    IF v_active_confirmed_count >= v_group.max_students THEN
        RAISE EXCEPTION 'لا يمكن تأكيد الاشتراك: اكتملت سعة المجموعة بالكامل.';
    END IF;

    UPDATE public.tutor_group_enrollments
    SET status = 'confirmed',
        confirmed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_enrollment_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'enrollmentId', p_enrollment_id,
        'enrolledCount', v_active_confirmed_count + 1,
        'remainingSeats', v_group.max_students - (v_active_confirmed_count + 1),
        'message', 'تم تأكيد اشتراك الطالب في المجموعة بنجاح.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_confirm_group_enrollment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_confirm_group_enrollment(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 8. توفير بيانات الإيقاف الإداري في دوال قراءة لوحة المعلم والإدارة
--    (معالجة تغيير توقيعات RETURNS TABLE صراحةً عبر DROP FUNCTION مسبق)
-- ------------------------------------------------------------------------------

-- 8.1 مجموعات المعلم الحالي: public.tutor_get_my_groups()
DROP FUNCTION IF EXISTS public.tutor_get_my_groups();
CREATE OR REPLACE FUNCTION public.tutor_get_my_groups()
RETURNS TABLE (
    id UUID,
    title TEXT,
    description TEXT,
    specialization_label TEXT,
    max_students INTEGER,
    enrolled_students INTEGER,
    remaining_seats INTEGER,
    price_per_student INTEGER,
    price_type TEXT,
    currency TEXT,
    sessions_count INTEGER,
    session_duration_minutes INTEGER,
    start_date DATE,
    end_date DATE,
    weekly_schedule_summary TEXT,
    review_status TEXT,
    admin_review_notes TEXT,
    status TEXT,
    is_published BOOLEAN,
    admin_suspended BOOLEAN,
    admin_suspension_reason TEXT,
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
        g.id,
        g.title,
        g.description,
        g.specialization_label,
        g.max_students,
        COALESCE(enr.confirmed_count, 0)::INTEGER AS enrolled_students,
        GREATEST(0, g.max_students - COALESCE(enr.confirmed_count, 0))::INTEGER AS remaining_seats,
        g.price_per_student,
        g.price_type,
        g.currency,
        g.sessions_count,
        g.session_duration_minutes,
        g.start_date,
        g.end_date,
        g.weekly_schedule_summary,
        g.review_status,
        g.admin_review_notes,
        g.status,
        g.is_published,
        g.admin_suspended,
        g.admin_suspension_reason,
        g.created_at
    FROM public.tutor_groups g
    LEFT JOIN (
        SELECT ge.group_id AS grp_id, COUNT(*)::BIGINT AS confirmed_count
        FROM public.tutor_group_enrollments ge
        WHERE ge.status = 'confirmed'
        GROUP BY ge.group_id
    ) enr ON enr.grp_id = g.id
    WHERE g.tutor_id = v_tutor_id
    ORDER BY g.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_get_my_groups() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_get_my_groups() TO authenticated, service_role;

-- 8.2 مجموعات لوحة الإدارة: public.admin_get_groups()
DROP FUNCTION IF EXISTS public.admin_get_groups(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.admin_get_groups(
    p_review_status TEXT DEFAULT NULL,
    p_tutor_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    tutor_id TEXT,
    tutor_name TEXT,
    title TEXT,
    description TEXT,
    specialization_label TEXT,
    max_students INTEGER,
    enrolled_students INTEGER,
    remaining_seats INTEGER,
    price_per_student INTEGER,
    price_type TEXT,
    currency TEXT,
    sessions_count INTEGER,
    session_duration_minutes INTEGER,
    start_date DATE,
    end_date DATE,
    weekly_schedule_summary TEXT,
    review_status TEXT,
    admin_review_notes TEXT,
    status TEXT,
    is_published BOOLEAN,
    admin_suspended BOOLEAN,
    admin_suspension_reason TEXT,
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
        g.id,
        g.tutor_id,
        t.name AS tutor_name,
        g.title,
        g.description,
        g.specialization_label,
        g.max_students,
        COALESCE(enr.confirmed_count, 0)::INTEGER AS enrolled_students,
        GREATEST(0, g.max_students - COALESCE(enr.confirmed_count, 0))::INTEGER AS remaining_seats,
        g.price_per_student,
        g.price_type,
        g.currency,
        g.sessions_count,
        g.session_duration_minutes,
        g.start_date,
        g.end_date,
        g.weekly_schedule_summary,
        g.review_status,
        g.admin_review_notes,
        g.status,
        g.is_published,
        g.admin_suspended,
        g.admin_suspension_reason,
        g.created_at
    FROM public.tutor_groups g
    JOIN public.tutors t ON t.id = g.tutor_id
    LEFT JOIN (
        SELECT ge.group_id AS grp_id, COUNT(*)::BIGINT AS confirmed_count
        FROM public.tutor_group_enrollments ge
        WHERE ge.status = 'confirmed'
        GROUP BY ge.group_id
    ) enr ON enr.grp_id = g.id
    WHERE (p_review_status IS NULL OR g.review_status = p_review_status)
      AND (p_tutor_id IS NULL OR g.tutor_id = p_tutor_id)
    ORDER BY g.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_groups(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_groups(TEXT, TEXT) TO authenticated, service_role;

-- 8.3 مواعيد الحصص الخاصة للمعلم: public.tutor_get_my_private_slots()
DROP FUNCTION IF EXISTS public.tutor_get_my_private_slots();
CREATE OR REPLACE FUNCTION public.tutor_get_my_private_slots()
RETURNS TABLE (
    id UUID,
    specialization_label TEXT,
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
        s.admin_suspended,
        s.admin_suspension_notes,
        s.created_at
    FROM public.tutor_private_slots s
    WHERE s.tutor_id = v_tutor_id
    ORDER BY s.slot_date ASC, s.start_time ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_get_my_private_slots() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_get_my_private_slots() TO authenticated, service_role;

-- 8.4 المواعيد التجريبية للمعلم: public.tutor_get_my_slots()
DROP FUNCTION IF EXISTS public.tutor_get_my_slots();
CREATE OR REPLACE FUNCTION public.tutor_get_my_slots()
RETURNS TABLE (
    id UUID,
    slot_date DATE,
    start_time TIME,
    end_time TIME,
    timezone TEXT,
    is_available BOOLEAN,
    is_booked BOOLEAN,
    booked_at TIMESTAMPTZ,
    admin_suspended BOOLEAN,
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
        s.slot_date,
        s.start_time,
        s.end_time,
        s.timezone,
        s.is_available,
        s.is_booked,
        s.booked_at,
        s.admin_suspended,
        s.created_at
    FROM public.tutor_available_slots s
    WHERE s.tutor_id = v_tutor_id
    ORDER BY s.slot_date ASC, s.start_time ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_get_my_slots() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_get_my_slots() TO authenticated, service_role;

-- 8.5 المواعيد التجريبية للإدارة: public.admin_get_tutor_slots()
DROP FUNCTION IF EXISTS public.admin_get_tutor_slots(TEXT);
DROP FUNCTION IF EXISTS public.admin_get_tutor_slots(TEXT, DATE, DATE);
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
    admin_suspended BOOLEAN,
    notes TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
STABLE
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذا الإجراء مخصص لمديري النظام فقط.';
    END IF;

    RETURN QUERY
    SELECT
        s.id,
        s.tutor_id,
        s.slot_date,
        s.start_time,
        s.end_time,
        s.timezone,
        s.is_available,
        s.is_booked,
        s.booked_at,
        s.admin_suspended,
        s.notes,
        s.created_at,
        s.updated_at
    FROM public.tutor_available_slots s
    WHERE s.tutor_id = p_tutor_id
    ORDER BY s.slot_date ASC, s.start_time ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_tutor_slots(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_tutor_slots(TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 9. دوال العرض العام: استثناء الموقوف إدارياً وحجب الملاحظات الداخلية عن الجمهور
-- ------------------------------------------------------------------------------

-- 9.1 المجموعات العامة (تتحقق من نشر المعلم، ونشر المجموعة، وعدم الإيقاف الإداري)
CREATE OR REPLACE FUNCTION public.get_public_tutor_groups(p_tutor_id TEXT)
RETURNS TABLE (
    id UUID,
    title TEXT,
    description TEXT,
    specialization_label TEXT,
    max_students INTEGER,
    enrolled_students INTEGER,
    remaining_seats INTEGER,
    price_per_student INTEGER,
    price_type TEXT,
    currency TEXT,
    sessions_count INTEGER,
    session_duration_minutes INTEGER,
    start_date DATE,
    end_date DATE,
    weekly_schedule_summary TEXT,
    status TEXT
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
        g.id,
        g.title,
        g.description,
        g.specialization_label,
        g.max_students,
        COALESCE(enr.confirmed_count, 0)::INTEGER AS enrolled_students,
        GREATEST(0, g.max_students - COALESCE(enr.confirmed_count, 0))::INTEGER AS remaining_seats,
        g.price_per_student,
        g.price_type,
        g.currency,
        g.sessions_count,
        g.session_duration_minutes,
        g.start_date,
        g.end_date,
        g.weekly_schedule_summary,
        g.status
    FROM public.tutor_groups g
    LEFT JOIN (
        SELECT ge.group_id AS grp_id, COUNT(*)::BIGINT AS confirmed_count
        FROM public.tutor_group_enrollments ge
        WHERE ge.status = 'confirmed'
        GROUP BY ge.group_id
    ) enr ON enr.grp_id = g.id
    WHERE g.tutor_id = p_tutor_id
      AND g.is_published = TRUE
      AND g.admin_suspended = FALSE
      AND g.review_status = 'approved'
      AND g.status IN ('open', 'in_progress')
    ORDER BY g.start_date ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_tutor_groups(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_tutor_groups(TEXT) TO anon, authenticated, service_role;

-- 9.2 لقاءات المجموعة العامة (استثناء المجموعات غير المنشورة أو الموقوفة)
CREATE OR REPLACE FUNCTION public.get_public_group_sessions(p_group_id UUID)
RETURNS TABLE (
    id UUID,
    session_number INTEGER,
    session_date DATE,
    start_time TIME,
    end_time TIME,
    timezone TEXT,
    title TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
STABLE
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.tutor_groups g
        JOIN public.tutors t ON t.id = g.tutor_id
        WHERE g.id = p_group_id
          AND g.is_published = TRUE
          AND g.admin_suspended = FALSE
          AND g.review_status = 'approved'
          AND t.is_published = TRUE
    ) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        s.id,
        s.session_number,
        s.session_date,
        s.start_time,
        s.end_time,
        s.timezone,
        s.title
    FROM public.tutor_group_sessions s
    WHERE s.group_id = p_group_id
    ORDER BY s.session_number ASC, s.session_date ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_group_sessions(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_group_sessions(UUID) TO anon, authenticated, service_role;

-- 9.3 المواعيد الخاصة العامة (استثناء المواعيد غير المتاحة أو الموقوفة إدارياً)
CREATE OR REPLACE FUNCTION public.get_public_tutor_private_slots(p_tutor_id TEXT)
RETURNS TABLE (
    id UUID,
    specialization_label TEXT,
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
      AND s.admin_suspended = FALSE
      AND COALESCE(s.is_booked, FALSE) = FALSE
      AND (s.slot_date + s.start_time) AT TIME ZONE COALESCE(NULLIF(TRIM(s.timezone), ''), 'Africa/Cairo') > NOW()
    ORDER BY s.slot_date ASC, s.start_time ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_tutor_private_slots(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_tutor_private_slots(TEXT) TO anon, authenticated, service_role;

-- 9.4 المواعيد التجريبية العامة (استثناء المواعيد غير المتاحة أو الموقوفة إدارياً)
CREATE OR REPLACE FUNCTION public.get_public_tutor_slots(p_tutor_id TEXT)
RETURNS TABLE (
    id UUID,
    tutor_id TEXT,
    slot_date DATE,
    start_time TIME,
    end_time TIME,
    timezone TEXT,
    is_available BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
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
        s.tutor_id,
        s.slot_date,
        s.start_time,
        s.end_time,
        s.timezone,
        s.is_available,
        s.created_at,
        s.updated_at
    FROM public.tutor_available_slots s
    WHERE s.tutor_id = p_tutor_id
      AND s.is_available = TRUE
      AND s.admin_suspended = FALSE
      AND s.is_booked = FALSE
      AND (
          (s.slot_date + s.start_time) AT TIME ZONE COALESCE(NULLIF(TRIM(s.timezone), ''), 'Africa/Cairo') > NOW()
      )
    ORDER BY s.slot_date ASC, s.start_time ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_tutor_slots(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_tutor_slots(TEXT) TO anon, authenticated, service_role;

COMMIT;
