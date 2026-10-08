-- ==============================================================================
-- Shatir Classes (شاطر كلاسيز) - Supabase Unified Migration 009 (Production Ready)
-- File: supabase/migrations/009_tutor_private_and_group_classes.sql
-- Description:
--   تنفيذ منظومة الحصص الخاصة المدفوعة (1:1) والمجموعات التعليمية (Small Groups) كاملة:
--   1. جداول المواعيد الخاصة، المجموعات التعليمية، لقاءات المجموعات المجدولة.
--   2. جداول حجوزات الحصص الخاصة واشتراكات المجموعات وتوثيق دورة حياة الحجز والإلغاء والتأكيد.
--   3. حماية الخصوصية: عزل SELECT المباشر عن جداول المجموعات والحجوزات وحصر القراءة في RPCs آمنة.
--   4. قفل تزامن موحد للمعلم (acquire_tutor_lock) بترتيب صارم: استخراج المعرف أولاً دون قفل،
--      ثم قفل المعلم، ثم أقفال السجلات FOR UPDATE وإعادة التحقق من حالتها.
--   5. منع التعارض الزمني الشامل ثنائي الاتجاه وتحديث دوال 008 لتستخدم القفل والتعارض الشامل.
--   6. التحقق الصارم من التخصص من قاعدة البيانات دون الوثوق بنص المتصفح ومنع خلط المسارات.
--   7. حماية المواعيد والأسعار التي لها حجوزات قائمة من تعديل المعلم، وضبط مسارات الإلغاء وإعادة المحاولة.
--   8. دوال الإدارة والتحكم الكاملة لإنشاء وقراءة وتأكيد وإلغاء الحجوزات والاشتراكات ومراجعة المجموعات.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 0. الامتدادات والدوال المساعدة الأساسية
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- دالة تحديث updated_at إن لم تكن متوفرة
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- قفل تزامن موحد للمعلم على مستوى المعاملة (Advisory Transaction Lock + Row Lock)
CREATE OR REPLACE FUNCTION public.acquire_tutor_lock(p_tutor_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    IF p_tutor_id IS NULL OR TRIM(p_tutor_id) = '' THEN
        RAISE EXCEPTION 'معرف المعلم غير صالح للحصول على قفل التزامن.';
    END IF;
    -- 1. قفل استشاري للمعاملة مبني على هاش المعرف الموحد
    PERFORM pg_advisory_xact_lock(hashtext('tutor_unified_lock_' || p_tutor_id));
    -- 2. قفل صف المعلم نفسه لمنع التحديثات المتزامنة المتنافسة
    PERFORM 1 FROM public.tutors WHERE id = p_tutor_id FOR UPDATE;
END;
$$;

-- سحب الصلاحيات العامة عن دالة القفل الداخلي
REVOKE ALL ON FUNCTION public.acquire_tutor_lock(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_tutor_lock(TEXT) TO service_role;

-- ------------------------------------------------------------------------------
-- 1. جدول مواعيد الحصص الخاصة المدفوعة الفردية (1:1)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tutor_private_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tutor_id TEXT NOT NULL REFERENCES public.tutors(id) ON UPDATE CASCADE ON DELETE CASCADE,
    offering_course_option_id UUID REFERENCES public.school_course_options(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    quran_age_group_id TEXT REFERENCES public.quran_age_groups(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    quran_level_id TEXT REFERENCES public.quran_levels(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    specialization_label TEXT NOT NULL,
    slot_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'Africa/Cairo',
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes >= 30 AND duration_minutes <= 120),
    price_amount INTEGER NOT NULL CHECK (price_amount >= 0),
    currency TEXT NOT NULL DEFAULT 'ج.م',
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    is_booked BOOLEAN NOT NULL DEFAULT FALSE,
    booked_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_private_slot_times CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_private_slots_tutor_lookup 
ON public.tutor_private_slots(tutor_id, slot_date, is_available);

CREATE INDEX IF NOT EXISTS idx_private_slots_booking 
ON public.tutor_private_slots(tutor_id, is_booked);

DROP TRIGGER IF EXISTS trg_tutor_private_slots_updated_at ON public.tutor_private_slots;
CREATE TRIGGER trg_tutor_private_slots_updated_at
BEFORE UPDATE ON public.tutor_private_slots
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.tutor_private_slots IS 'مواعيد الحصص الخاصة المدفوعة 1:1 المرتبطة بتخصص معتمد وسعر ومدة محددة';

-- ------------------------------------------------------------------------------
-- 2. جدول المجموعات التعليمية (Educational Groups)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tutor_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tutor_id TEXT NOT NULL REFERENCES public.tutors(id) ON UPDATE CASCADE ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    offering_course_option_id UUID REFERENCES public.school_course_options(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    quran_age_group_id TEXT REFERENCES public.quran_age_groups(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    quran_level_id TEXT REFERENCES public.quran_levels(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    specialization_label TEXT NOT NULL,
    max_students INTEGER NOT NULL DEFAULT 5 CHECK (max_students >= 2 AND max_students <= 20),
    price_per_student INTEGER NOT NULL CHECK (price_per_student >= 0),
    price_type TEXT NOT NULL DEFAULT 'full_package' CHECK (price_type IN ('per_session', 'full_package')),
    currency TEXT NOT NULL DEFAULT 'ج.م',
    sessions_count INTEGER NOT NULL DEFAULT 4 CHECK (sessions_count >= 1),
    session_duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (session_duration_minutes >= 30),
    start_date DATE NOT NULL,
    end_date DATE,
    weekly_schedule_summary TEXT NOT NULL,
    review_status TEXT NOT NULL DEFAULT 'pending_review' CHECK (review_status IN ('draft', 'pending_review', 'approved', 'rejected', 'needs_revision')),
    admin_review_notes TEXT,
    reviewed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tutor_groups_tutor_status 
ON public.tutor_groups(tutor_id, status);

CREATE INDEX IF NOT EXISTS idx_tutor_groups_published 
ON public.tutor_groups(is_published, review_status);

DROP TRIGGER IF EXISTS trg_tutor_groups_updated_at ON public.tutor_groups;
CREATE TRIGGER trg_tutor_groups_updated_at
BEFORE UPDATE ON public.tutor_groups
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.tutor_groups IS 'المجموعات التعليمية ذات المقاعد المحدودة والسعر للطالب وحالة المراجعة الإدارية';

-- ------------------------------------------------------------------------------
-- 3. جدول لقاءات ومواعيد المجموعة (Group Sessions Schedule)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tutor_group_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.tutor_groups(id) ON UPDATE CASCADE ON DELETE CASCADE,
    session_number INTEGER NOT NULL CHECK (session_number >= 1),
    session_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'Africa/Cairo',
    title TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_group_session_times CHECK (end_time > start_time),
    CONSTRAINT uq_group_session_number UNIQUE (group_id, session_number)
);

CREATE INDEX IF NOT EXISTS idx_group_sessions_group_date 
ON public.tutor_group_sessions(group_id, session_date, start_time);

COMMENT ON TABLE public.tutor_group_sessions IS 'الجدول الزمني المفصل لكل لقاء من لقاءات المجموعة';

-- ------------------------------------------------------------------------------
-- 4. جداول حجوزات الحصص الخاصة واشتراكات المجموعات
-- ------------------------------------------------------------------------------

-- 4.1 حجوزات الحصص الخاصة (1:1 Bookings)
CREATE TABLE IF NOT EXISTS public.tutor_private_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_id UUID NOT NULL REFERENCES public.tutor_private_slots(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    tutor_id TEXT NOT NULL REFERENCES public.tutors(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    student_name TEXT NOT NULL,
    guardian_name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    agreed_price INTEGER NOT NULL CHECK (agreed_price >= 0),
    currency TEXT NOT NULL DEFAULT 'ج.م',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
    notes TEXT,
    cancellation_reason TEXT,
    cancelled_by TEXT, -- 'admin' | 'tutor' | 'client'
    cancelled_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_private_bookings_slot 
ON public.tutor_private_bookings(slot_id, status);

CREATE INDEX IF NOT EXISTS idx_private_bookings_tutor 
ON public.tutor_private_bookings(tutor_id, status);

DROP TRIGGER IF EXISTS trg_tutor_private_bookings_updated_at ON public.tutor_private_bookings;
CREATE TRIGGER trg_tutor_private_bookings_updated_at
BEFORE UPDATE ON public.tutor_private_bookings
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- 4.2 اشتراكات المجموعات التعليمية (Group Enrollments)
CREATE TABLE IF NOT EXISTS public.tutor_group_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.tutor_groups(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    tutor_id TEXT NOT NULL REFERENCES public.tutors(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    student_name TEXT NOT NULL,
    guardian_name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    agreed_price INTEGER NOT NULL CHECK (agreed_price >= 0),
    price_type TEXT NOT NULL DEFAULT 'full_package' CHECK (price_type IN ('per_session', 'full_package')),
    currency TEXT NOT NULL DEFAULT 'ج.م',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
    notes TEXT,
    cancellation_reason TEXT,
    cancelled_by TEXT, -- 'admin' | 'tutor' | 'client'
    cancelled_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_enrollments_group 
ON public.tutor_group_enrollments(group_id, status);

CREATE INDEX IF NOT EXISTS idx_group_enrollments_tutor 
ON public.tutor_group_enrollments(tutor_id, status);

DROP TRIGGER IF EXISTS trg_tutor_group_enrollments_updated_at ON public.tutor_group_enrollments;
CREATE TRIGGER trg_tutor_group_enrollments_updated_at
BEFORE UPDATE ON public.tutor_group_enrollments
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- ------------------------------------------------------------------------------
-- 5. الأمان والخصوصية الصارمة وسياسات RLS
-- ------------------------------------------------------------------------------
-- سحب كافة الصلاحيات المباشرة لحماية الملاحظات الداخلية والخصوصية
REVOKE ALL ON public.tutor_private_slots FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tutor_private_slots TO service_role;
ALTER TABLE public.tutor_private_slots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tutor_groups FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tutor_groups TO service_role;
ALTER TABLE public.tutor_groups ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tutor_group_sessions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tutor_group_sessions TO service_role;
ALTER TABLE public.tutor_group_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tutor_private_bookings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tutor_private_bookings TO service_role;
ALTER TABLE public.tutor_private_bookings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tutor_group_enrollments FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tutor_group_enrollments TO service_role;
ALTER TABLE public.tutor_group_enrollments ENABLE ROW LEVEL SECURITY;

-- قصر استعلام RLS المباشر على المعلمين المصرحين والمشرفين
DROP POLICY IF EXISTS "Tutors can view own groups" ON public.tutor_groups;
CREATE POLICY "Tutors can view own groups"
ON public.tutor_groups
FOR SELECT
TO authenticated
USING (
    tutor_id = public.get_current_tutor_id()
    OR public.is_admin()
);

DROP POLICY IF EXISTS "Tutors and admins view group sessions" ON public.tutor_group_sessions;
CREATE POLICY "Tutors and admins view group sessions"
ON public.tutor_group_sessions
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.tutor_groups g
        WHERE g.id = tutor_group_sessions.group_id
          AND (g.tutor_id = public.get_current_tutor_id() OR public.is_admin())
    )
);

DROP POLICY IF EXISTS "Tutors and admins can view private bookings" ON public.tutor_private_bookings;
CREATE POLICY "Tutors and admins can view private bookings"
ON public.tutor_private_bookings
FOR SELECT
TO authenticated
USING (
    tutor_id = public.get_current_tutor_id()
    OR public.is_admin()
);

DROP POLICY IF EXISTS "Tutors and admins can view group enrollments" ON public.tutor_group_enrollments;
CREATE POLICY "Tutors and admins can view group enrollments"
ON public.tutor_group_enrollments
FOR SELECT
TO authenticated
USING (
    tutor_id = public.get_current_tutor_id()
    OR public.is_admin()
);

-- ------------------------------------------------------------------------------
-- 6. دالة التحقق الداخلي من التخصص المعتمد واستخراج اسمه الرسمي من قاعدة البيانات
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_and_get_tutor_specialization(
    p_tutor_id TEXT,
    p_course_option_id UUID,
    p_quran_age_group_id TEXT,
    p_quran_level_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
STABLE
AS $$
DECLARE
    v_label TEXT;
BEGIN
    -- 1. رفض غياب التخصص أو خلط المسارين
    IF (p_course_option_id IS NULL AND (p_quran_age_group_id IS NULL OR p_quran_level_id IS NULL)) THEN
        RAISE EXCEPTION 'يرجى اختيار تخصص تدريسي معتمد واحد (مدرسي أو قرآني).';
    END IF;

    IF (p_course_option_id IS NOT NULL AND (p_quran_age_group_id IS NOT NULL OR p_quran_level_id IS NOT NULL)) THEN
        RAISE EXCEPTION 'لا يمكن خلط تخصص مدرسي مع تخصص قرآني في نفس الحصة أو المجموعة.';
    END IF;

    -- 2. التحقق من المسار المدرسي
    IF p_course_option_id IS NOT NULL THEN
        SELECT (sub.name || ' - ' || eg.name || ' (' || ct.name || ')')
        INTO v_label
        FROM public.tutor_school_offerings tso
        JOIN public.school_course_options sco ON sco.id = tso.course_option_id
        JOIN public.educational_grades eg ON eg.id = sco.grade_id
        JOIN public.educational_stages es ON es.id = eg.stage_id
        JOIN public.subjects sub ON sub.id = sco.subject_id
        JOIN public.curriculum_types ct ON ct.id = sco.curriculum_id
        WHERE tso.tutor_id = p_tutor_id
          AND sco.id = p_course_option_id
          AND sco.is_active = TRUE
          AND eg.is_active = TRUE
          AND es.is_active = TRUE
          AND sub.is_active = TRUE
          AND ct.is_active = TRUE;

        IF v_label IS NULL THEN
            RAISE EXCEPTION 'التخصص المدرسي المختار غير معتمد في ملف المعلم أو غير مفعل في المنظومة.';
        END IF;

        RETURN v_label;
    END IF;

    -- 3. التحقق من مسار القرآن والتأسيس
    IF p_quran_age_group_id IS NOT NULL AND p_quran_level_id IS NOT NULL THEN
        SELECT ('قرآن وتأسيس: ' || ql.name || ' (' || qag.name || ')')
        INTO v_label
        FROM public.tutor_quran_offerings tqo
        JOIN public.quran_age_groups qag ON qag.id = tqo.age_group_id
        JOIN public.quran_levels ql ON ql.id = tqo.level_id
        WHERE tqo.tutor_id = p_tutor_id
          AND tqo.age_group_id = p_quran_age_group_id
          AND tqo.level_id = p_quran_level_id
          AND qag.is_active = TRUE
          AND ql.is_active = TRUE;

        IF v_label IS NULL THEN
            RAISE EXCEPTION 'مسار القرآن والتأسيس المختار غير معتمد في ملف المعلم أو غير مفعل.';
        END IF;

        RETURN v_label;
    END IF;

    RAISE EXCEPTION 'بيانات التخصص غير صالحة.';
END;
$$;

-- حماية دالة التحقق من التخصص: دالة داخلية للخدمات فقط
REVOKE ALL ON FUNCTION public.validate_and_get_tutor_specialization(TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_and_get_tutor_specialization(TEXT, UUID, TEXT, TEXT) TO service_role;

-- ------------------------------------------------------------------------------
-- 7. فحص التعارض الزمني الداخلي الموحد (Internal Conflict Detector)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.internal_check_tutor_time_conflict(
    p_tutor_id TEXT,
    p_start_at TIMESTAMPTZ,
    p_end_at TIMESTAMPTZ,
    p_exclude_trial_id UUID DEFAULT NULL,
    p_exclude_private_id UUID DEFAULT NULL,
    p_exclude_group_session_id UUID DEFAULT NULL
)
RETURNS TABLE (
    has_conflict BOOLEAN,
    conflict_type TEXT,
    conflict_details TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
STABLE
AS $$
DECLARE
    v_rec RECORD;
BEGIN
    -- 1. فحص التعارض مع المواعيد التجريبية القائمة
    SELECT 
        s.id, s.slot_date, s.start_time, s.end_time, s.timezone
    INTO v_rec
    FROM public.tutor_available_slots s
    WHERE s.tutor_id = p_tutor_id
      AND (s.is_available = TRUE OR s.is_booked = TRUE)
      AND (p_exclude_trial_id IS NULL OR s.id <> p_exclude_trial_id)
      AND tstzrange(
            (s.slot_date + s.start_time) AT TIME ZONE COALESCE(NULLIF(TRIM(s.timezone), ''), 'Africa/Cairo'),
            (s.slot_date + s.end_time) AT TIME ZONE COALESCE(NULLIF(TRIM(s.timezone), ''), 'Africa/Cairo')
          ) && tstzrange(p_start_at, p_end_at)
    LIMIT 1;

    IF FOUND THEN
        RETURN QUERY SELECT TRUE, 'trial', 'يتعارض مع موعد تجريبي قائم في تاريخ ' || v_rec.slot_date || ' (' || v_rec.start_time || ' - ' || v_rec.end_time || ')';
        RETURN;
    END IF;

    -- 2. فحص التعارض مع المواعيد الخاصة القائمة
    SELECT 
        ps.id, ps.slot_date, ps.start_time, ps.end_time, ps.timezone, ps.specialization_label
    INTO v_rec
    FROM public.tutor_private_slots ps
    WHERE ps.tutor_id = p_tutor_id
      AND (ps.is_available = TRUE OR ps.is_booked = TRUE)
      AND (p_exclude_private_id IS NULL OR ps.id <> p_exclude_private_id)
      AND tstzrange(
            (ps.slot_date + ps.start_time) AT TIME ZONE COALESCE(NULLIF(TRIM(ps.timezone), ''), 'Africa/Cairo'),
            (ps.slot_date + ps.end_time) AT TIME ZONE COALESCE(NULLIF(TRIM(ps.timezone), ''), 'Africa/Cairo')
          ) && tstzrange(p_start_at, p_end_at)
    LIMIT 1;

    IF FOUND THEN
        RETURN QUERY SELECT TRUE, 'private', 'يتعارض مع موعد حصة خاصة (' || v_rec.specialization_label || ') في تاريخ ' || v_rec.slot_date || ' (' || v_rec.start_time || ' - ' || v_rec.end_time || ')';
        RETURN;
    END IF;

    -- 3. فحص التعارض مع لقاءات المجموعات القائمة:
    -- - المجموعات قيد المراجعة (pending_review) تحجز الوقت لمنع التعارض أثناء دراسة الطلب
    -- - المجموعات المعتمدة (approved) تحجز الوقت طالما أنها نشطة (open أو in_progress)
    -- - أي مجموعة بها اشتراكات مؤكدة نشطة (confirmed) تظل لقاءاتها محمية ولا تُحرر أوقاتها بمجرد تغيير review_status
    --   حتى تُسوّى الاشتراكات أو تُلغى المجموعة بإجراء إداري صحيح
    SELECT 
        gs.id, gs.session_date, gs.start_time, gs.end_time, gs.timezone, g.title
    INTO v_rec
    FROM public.tutor_group_sessions gs
    JOIN public.tutor_groups g ON g.id = gs.group_id
    WHERE g.tutor_id = p_tutor_id
      AND g.status IN ('open', 'in_progress')
      AND (
          g.review_status IN ('approved', 'pending_review')
          OR EXISTS (
              SELECT 1 
              FROM public.tutor_group_enrollments e 
              WHERE e.group_id = g.id AND e.status = 'confirmed'
          )
      )
      AND (p_exclude_group_session_id IS NULL OR gs.id <> p_exclude_group_session_id)
      AND tstzrange(
            (gs.session_date + gs.start_time) AT TIME ZONE COALESCE(NULLIF(TRIM(gs.timezone), ''), 'Africa/Cairo'),
            (gs.session_date + gs.end_time) AT TIME ZONE COALESCE(NULLIF(TRIM(gs.timezone), ''), 'Africa/Cairo')
          ) && tstzrange(p_start_at, p_end_at)
    LIMIT 1;

    IF FOUND THEN
        RETURN QUERY SELECT TRUE, 'group', 'يتعارض مع لقاء مجموعة (' || v_rec.title || ') في تاريخ ' || v_rec.session_date || ' (' || v_rec.start_time || ' - ' || v_rec.end_time || ')';
        RETURN;
    END IF;

    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::TEXT;
END;
$$;

-- حماية دالة فحص التعارض: دالة داخلية لا يستطيع المستخدم العادي استدعاءها لاكتشاف جدول مواعيد معلمين آخرين
REVOKE ALL ON FUNCTION public.internal_check_tutor_time_conflict(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_check_tutor_time_conflict(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, UUID) TO service_role;

-- ------------------------------------------------------------------------------
-- 8. تحديث وتوحيد دوال المواعيد التجريبية من 008 (القفل الموحد وفحص التعارض الشامل)
--    الحفاظ التام على التوقيعات وأنواع الإرجاع الأصلية
-- ------------------------------------------------------------------------------

-- 8.1 إنشاء موعد تجريبي للمعلم: public.tutor_create_slot
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
    v_duration INTERVAL;
    v_conflict RECORD;
BEGIN
    v_tutor_id := public.get_current_tutor_id();
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: حسابك غير مرتبط بملف معلم معتمد.';
    END IF;

    -- قفل حماية موحد للمعلم
    PERFORM public.acquire_tutor_lock(v_tutor_id);

    v_tz := COALESCE(NULLIF(TRIM(p_timezone), ''), 'Africa/Cairo');

    IF p_end_time <= p_start_time THEN
        RAISE EXCEPTION 'وقت نهاية الموعد يجب أن يكون بعد وقت البداية.';
    END IF;

    v_start_at := (p_slot_date + p_start_time) AT TIME ZONE v_tz;
    v_end_at := (p_slot_date + p_end_time) AT TIME ZONE v_tz;

    IF v_start_at <= NOW() THEN
        RAISE EXCEPTION 'لا يمكن إضافة موعد في الماضي أو في وقت انقضى اليوم وفق توقيت %.', v_tz;
    END IF;

    -- التحقق الصارم من مدة الحصة التجريبية: 20 دقيقة بالضبط
    v_duration := v_end_at - v_start_at;
    IF v_duration != INTERVAL '20 minutes' THEN
        RAISE EXCEPTION 'مدة الموعد التجريبي المعتمدة هي 20 دقيقة بالضبط.';
    END IF;

    -- فحص التعارض الشامل عبر الدالة الداخلية
    SELECT * INTO v_conflict FROM public.internal_check_tutor_time_conflict(v_tutor_id, v_start_at, v_end_at);
    IF v_conflict.has_conflict THEN
        RAISE EXCEPTION '%', v_conflict.conflict_details;
    END IF;

    INSERT INTO public.tutor_available_slots (
        tutor_id,
        slot_date,
        start_time,
        end_time,
        timezone,
        is_available,
        is_booked,
        notes,
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
        NULL,
        NOW(),
        NOW()
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'slotId', v_new_id,
        'message', 'تمت إضافة الموعد التجريبي بنجاح.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_create_slot(DATE, TIME, TIME, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_create_slot(DATE, TIME, TIME, TEXT) TO authenticated, service_role;

-- 8.2 حذف موعد تجريبي للمعلم: public.tutor_delete_slot
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

    -- ترتيب الأقفال: قفل المعلم أولاً
    PERFORM public.acquire_tutor_lock(v_tutor_id);

    -- ثم قفل السجل والتحقق منه
    SELECT * INTO v_slot
    FROM public.tutor_available_slots
    WHERE id = p_slot_id AND tutor_id = v_tutor_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'الموعد المطلوب حذفه غير موجود أو لا ينتمي إلى حسابك.';
    END IF;

    IF v_slot.is_booked = TRUE THEN
        RAISE EXCEPTION 'لا يمكن حذف موعد تم حجزه بالفعل من قبل طالب.';
    END IF;

    IF v_slot.is_available = FALSE THEN
        RAISE EXCEPTION 'لا يمكن للمعلم حذف موعد مغلق إدارياً.';
    END IF;

    v_tz := COALESCE(NULLIF(TRIM(v_slot.timezone), ''), 'Africa/Cairo');
    v_start_at := (v_slot.slot_date + v_slot.start_time) AT TIME ZONE v_tz;

    IF v_start_at <= NOW() THEN
        RAISE EXCEPTION 'لا يمكن حذف موعد في الماضي أو انقضى وقته بتوقيت %.', v_tz;
    END IF;

    DELETE FROM public.tutor_available_slots
    WHERE id = p_slot_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'تم حذف الموعد المتاح بنجاح.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_delete_slot(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_delete_slot(UUID) TO authenticated, service_role;

-- 8.3 إضافة موعد تجريبي عبر الإدارة: public.admin_add_slot
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
    v_tz TEXT;
    v_start_at TIMESTAMPTZ;
    v_end_at TIMESTAMPTZ;
    v_duration INTERVAL;
    v_conflict RECORD;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية مخصصة لمديري النظام فقط.';
    END IF;

    IF p_tutor_id IS NULL OR TRIM(p_tutor_id) = '' THEN
        RAISE EXCEPTION 'معرف المعلم مطلوب.';
    END IF;

    -- قفل حماية موحد للمعلم
    PERFORM public.acquire_tutor_lock(p_tutor_id);

    v_tz := COALESCE(NULLIF(TRIM(p_timezone), ''), 'Africa/Cairo');

    IF p_end_time <= p_start_time THEN
        RAISE EXCEPTION 'وقت نهاية الموعد يجب أن يكون بعد وقت البداية.';
    END IF;

    v_start_at := (p_slot_date + p_start_time) AT TIME ZONE v_tz;
    v_end_at := (p_slot_date + p_end_time) AT TIME ZONE v_tz;

    IF v_start_at <= NOW() THEN
        RAISE EXCEPTION 'لا يمكن إضافة موعد في الماضي أو في وقت انقضى اليوم وفق توقيت %.', v_tz;
    END IF;

    -- التحقق من مدة الحصة التجريبية: 20 دقيقة بالضبط
    v_duration := v_end_at - v_start_at;
    IF v_duration != INTERVAL '20 minutes' THEN
        RAISE EXCEPTION 'مدة الموعد التجريبي المعتمدة هي 20 دقيقة بالضبط.';
    END IF;

    -- فحص التعارض الشامل عبر الدالة الموحدة
    SELECT * INTO v_conflict FROM public.internal_check_tutor_time_conflict(p_tutor_id, v_start_at, v_end_at);
    IF v_conflict.has_conflict THEN
        RAISE EXCEPTION '%', v_conflict.conflict_details;
    END IF;

    INSERT INTO public.tutor_available_slots (
        tutor_id, slot_date, start_time, end_time, timezone, is_available, is_booked, notes, created_at, updated_at
    ) VALUES (
        p_tutor_id, p_slot_date, p_start_time, p_end_time,
        v_tz,
        TRUE,
        FALSE,
        NULLIF(TRIM(p_notes), ''),
        NOW(),
        NOW()
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_add_slot(TEXT, DATE, TIME, TIME, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_slot(TEXT, DATE, TIME, TIME, TEXT, TEXT) TO authenticated, service_role;

-- 8.4 تأكيد حجز موعد تجريبي لطالب عبر الإدارة: public.admin_confirm_slot_booking
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
    v_tz TEXT;
    v_start_at TIMESTAMPTZ;
    v_end_at TIMESTAMPTZ;
    v_conflict RECORD;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية مخصصة لمديري النظام فقط.';
    END IF;

    -- استخراج معرف المعلم أولاً دون قفل
    SELECT tutor_id INTO v_tutor_id FROM public.tutor_available_slots WHERE id = p_slot_id;
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'الموعد المحدد غير موجود.';
    END IF;

    -- قفل حماية المعلم الموحد
    PERFORM public.acquire_tutor_lock(v_tutor_id);

    -- قفل صف الموعد والتحقق الصارم من حالته
    SELECT * INTO v_slot FROM public.tutor_available_slots WHERE id = p_slot_id FOR UPDATE;
    IF v_slot.id IS NULL THEN
        RAISE EXCEPTION 'الموعد المحدد غير موجود.';
    END IF;

    IF v_slot.is_booked = TRUE THEN
        RAISE EXCEPTION 'لا يمكن تأكيد الحجز: الموعد محجوز ومؤكد بالفعل مسبقاً.';
    END IF;

    IF v_slot.is_available = FALSE THEN
        RAISE EXCEPTION 'لا يمكن تأكيد الحجز: الموعد مغلق إدارياً وغير متاح للحجز.';
    END IF;

    v_tz := COALESCE(NULLIF(TRIM(v_slot.timezone), ''), 'Africa/Cairo');
    v_start_at := (v_slot.slot_date + v_slot.start_time) AT TIME ZONE v_tz;
    v_end_at := (v_slot.slot_date + v_slot.end_time) AT TIME ZONE v_tz;

    IF v_start_at <= NOW() THEN
        RAISE EXCEPTION 'لا يمكن تأكيد الحجز: انقضى وقت بداية الموعد بتوقيت %.', v_tz;
    END IF;

    -- فحص التعارض مع استثناء الموعد نفسه
    SELECT * INTO v_conflict FROM public.internal_check_tutor_time_conflict(v_tutor_id, v_start_at, v_end_at, p_slot_id, NULL, NULL);
    IF v_conflict.has_conflict THEN
        RAISE EXCEPTION 'لا يمكن تأكيد الحجز لوجود تعارض زمني: %', v_conflict.conflict_details;
    END IF;

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

-- 8.5 إغلاق / إعادة فتح موعد تجريبي عبر الإدارة: public.admin_toggle_slot_availability
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

    -- استخراج معرف المعلم أولاً دون قفل
    SELECT tutor_id INTO v_tutor_id FROM public.tutor_available_slots WHERE id = p_slot_id;
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'الموعد المحدد غير موجود.';
    END IF;

    -- قفل حماية المعلم الموحد
    PERFORM public.acquire_tutor_lock(v_tutor_id);

    -- قفل صف الموعد والتحقق
    SELECT * INTO v_slot FROM public.tutor_available_slots WHERE id = p_slot_id FOR UPDATE;
    IF v_slot.id IS NULL THEN
        RAISE EXCEPTION 'الموعد المحدد غير موجود.';
    END IF;

    IF v_slot.is_booked = TRUE THEN
        RAISE EXCEPTION 'لا يمكن تعديل موعد مؤكد الحجز عبر الإغلاق العادي. الحجز مؤكد لطالب ومحمي بالسجلات.';
    END IF;

    IF p_is_available = TRUE THEN
        v_tz := COALESCE(NULLIF(TRIM(v_slot.timezone), ''), 'Africa/Cairo');
        v_start_at := (v_slot.slot_date + v_slot.start_time) AT TIME ZONE v_tz;
        v_end_at := (v_slot.slot_date + v_slot.end_time) AT TIME ZONE v_tz;

        IF v_start_at <= NOW() THEN
            RAISE EXCEPTION 'لا يمكن إعادة فتح موعد في الماضي أو انقضى وقته اليوم بتوقيت %.', v_tz;
        END IF;

        -- فحص التعارض الشامل ضد كافة المواعيد واللقاءات
        SELECT * INTO v_conflict FROM public.internal_check_tutor_time_conflict(v_tutor_id, v_start_at, v_end_at, p_slot_id, NULL, NULL);
        IF v_conflict.has_conflict THEN
            RAISE EXCEPTION 'لا يمكن إعادة فتح الموعد لوجود تعارض زمني: %', v_conflict.conflict_details;
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

-- 8.6 حذف موعد تجريبي عبر الإدارة: public.admin_delete_slot
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

    -- استخراج معرف المعلم أولاً دون قفل
    SELECT tutor_id INTO v_tutor_id FROM public.tutor_available_slots WHERE id = p_slot_id;
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'الموعد المطلوب حذفه غير موجود.';
    END IF;

    -- قفل حماية المعلم الموحد
    PERFORM public.acquire_tutor_lock(v_tutor_id);

    -- قفل صف الموعد
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
-- 9. دوال التخصصات المعتمدة للمعلم
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tutor_get_my_specializations()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
STABLE
AS $$
DECLARE
    v_tutor_id TEXT;
    v_school_list JSONB;
    v_quran_list JSONB;
BEGIN
    v_tutor_id := public.get_current_tutor_id();
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: حسابك غير مرتبط بملف معلم معتمد.';
    END IF;

    -- تخصصات المسار المدرسي
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'courseOptionId', sco.id,
            'stageId', eg.stage_id,
            'stageName', es.name,
            'gradeId', sco.grade_id,
            'gradeName', eg.name,
            'subjectId', sco.subject_id,
            'subjectName', sub.name,
            'curriculumId', sco.curriculum_id,
            'curriculumName', ct.name,
            'label', sub.name || ' - ' || eg.name || ' (' || ct.name || ')'
        )
    ), '[]'::jsonb)
    INTO v_school_list
    FROM public.tutor_school_offerings tso
    JOIN public.school_course_options sco ON sco.id = tso.course_option_id
    JOIN public.educational_grades eg ON eg.id = sco.grade_id
    JOIN public.educational_stages es ON es.id = eg.stage_id
    JOIN public.subjects sub ON sub.id = sco.subject_id
    JOIN public.curriculum_types ct ON ct.id = sco.curriculum_id
    WHERE tso.tutor_id = v_tutor_id
      AND sco.is_active = TRUE
      AND eg.is_active = TRUE
      AND es.is_active = TRUE
      AND sub.is_active = TRUE
      AND ct.is_active = TRUE;

    -- تخصصات مسار القرآن والتأسيس
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'ageGroupId', tqo.age_group_id,
            'ageGroupName', qag.name,
            'levelId', tqo.level_id,
            'levelName', ql.name,
            'label', 'قرآن وتأسيس: ' || ql.name || ' (' || qag.name || ')'
        )
    ), '[]'::jsonb)
    INTO v_quran_list
    FROM public.tutor_quran_offerings tqo
    JOIN public.quran_age_groups qag ON qag.id = tqo.age_group_id
    JOIN public.quran_levels ql ON ql.id = tqo.level_id
    WHERE tqo.tutor_id = v_tutor_id
      AND qag.is_active = TRUE
      AND ql.is_active = TRUE;

    RETURN jsonb_build_object(
        'tutorId', v_tutor_id,
        'schoolSpecializations', v_school_list,
        'quranSpecializations', v_quran_list
    );
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_get_my_specializations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_get_my_specializations() TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 10. إدارة الحصص الخاصة المدفوعة (1:1 Private Slots)
-- ------------------------------------------------------------------------------

-- أ. استعلام مواعيد الحصص الخاصة للمعلم الحالي
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
        s.created_at
    FROM public.tutor_private_slots s
    WHERE s.tutor_id = v_tutor_id
    ORDER BY s.slot_date ASC, s.start_time ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_get_my_private_slots() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_get_my_private_slots() TO authenticated, service_role;

-- إحصائيات المواعيد الخاصة المستقبلية للمعلم
CREATE OR REPLACE FUNCTION public.tutor_get_private_slots_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
STABLE
AS $$
DECLARE
    v_tutor_id TEXT;
    v_available_count INTEGER := 0;
    v_booked_count INTEGER := 0;
BEGIN
    v_tutor_id := public.get_current_tutor_id();
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: حسابك غير مرتبط بملف معلم معتمد.';
    END IF;

    SELECT
        COUNT(*) FILTER (WHERE is_available = TRUE AND is_booked = FALSE),
        COUNT(*) FILTER (WHERE is_booked = TRUE)
    INTO v_available_count, v_booked_count
    FROM public.tutor_private_slots
    WHERE tutor_id = v_tutor_id
      AND ((slot_date + start_time) AT TIME ZONE COALESCE(NULLIF(TRIM(timezone), ''), 'Africa/Cairo') > NOW());

    RETURN jsonb_build_object(
        'futureAvailableCount', v_available_count,
        'futureBookedCount', v_booked_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_get_private_slots_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_get_private_slots_stats() TO authenticated, service_role;

-- ب. إضافة مواعيد الحصص الخاصة (مع قفل التزامن وفحص دقة التخصص وتطابق المدة والتعارض الشامل)
CREATE OR REPLACE FUNCTION public.tutor_create_private_slots(
    p_specialization_label TEXT,
    p_duration_minutes INTEGER,
    p_price_amount INTEGER,
    p_currency TEXT,
    p_slots JSONB,
    p_offering_course_option_id UUID DEFAULT NULL,
    p_quran_age_group_id TEXT DEFAULT NULL,
    p_quran_level_id TEXT DEFAULT NULL,
    p_timezone TEXT DEFAULT 'Africa/Cairo'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
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
    v_duration INTERVAL;
    v_conflict RECORD;
    v_validated_label TEXT;
    v_inserted_count INTEGER := 0;
BEGIN
    v_tutor_id := public.get_current_tutor_id();
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: حسابك غير مرتبط بملف معلم معتمد.';
    END IF;

    IF p_duration_minutes < 30 OR p_duration_minutes > 120 THEN
        RAISE EXCEPTION 'مدة الحصة الخاصة يجب أن تكون بين 30 و 120 دقيقة.';
    END IF;

    IF p_price_amount < 0 THEN
        RAISE EXCEPTION 'سعر الحصة يجب أن يكون قيمة موجبة صالحة.';
    END IF;

    IF jsonb_array_length(p_slots) = 0 THEN
        RAISE EXCEPTION 'يرجى تقديم موعد واحد على الأقل للإضافة.';
    END IF;

    -- استخراج اسم التخصص من قاعدة البيانات والتحقق الصارم
    v_validated_label := public.validate_and_get_tutor_specialization(
        v_tutor_id,
        p_offering_course_option_id,
        p_quran_age_group_id,
        p_quran_level_id
    );

    v_tz := COALESCE(NULLIF(TRIM(p_timezone), ''), 'Africa/Cairo');

    -- قفل التزامن الموحد للمعلم
    PERFORM public.acquire_tutor_lock(v_tutor_id);

    FOR v_slot IN SELECT * FROM jsonb_array_elements(p_slots)
    LOOP
        v_date := (v_slot->>'date')::DATE;
        v_start := (v_slot->>'startTime')::TIME;
        v_end := (v_slot->>'endTime')::TIME;

        IF v_end <= v_start THEN
            RAISE EXCEPTION 'وقت نهاية الحصة يجب أن يكون بعد وقت البداية في تاريخ %.', v_date;
        END IF;

        v_start_at := (v_date + v_start) AT TIME ZONE v_tz;
        v_end_at := (v_date + v_end) AT TIME ZONE v_tz;

        IF v_start_at <= NOW() THEN
            RAISE EXCEPTION 'لا يمكن جدولة موعد في الماضي أو في وقت انقضى اليوم (% % بتوقيت %).', v_date, v_start, v_tz;
        END IF;

        -- التحقق من تطابق وقت النهاية ناقص البداية مع مدة الحصة المحددة
        v_duration := v_end_at - v_start_at;
        IF EXTRACT(EPOCH FROM v_duration) / 60 != p_duration_minutes THEN
            RAISE EXCEPTION 'فارق التوقيت في تاريخ % (% دقيقة) لا يطابق مدة الحصة المحددة (% دقيقة).', v_date, (EXTRACT(EPOCH FROM v_duration) / 60)::INTEGER, p_duration_minutes;
        END IF;

        -- فحص التعارض الشامل
        SELECT * INTO v_conflict FROM public.internal_check_tutor_time_conflict(v_tutor_id, v_start_at, v_end_at);
        IF v_conflict.has_conflict THEN
            RAISE EXCEPTION '%', v_conflict.conflict_details;
        END IF;

        INSERT INTO public.tutor_private_slots (
            tutor_id,
            offering_course_option_id,
            quran_age_group_id,
            quran_level_id,
            specialization_label,
            slot_date,
            start_time,
            end_time,
            timezone,
            duration_minutes,
            price_amount,
            currency,
            is_available,
            is_booked,
            notes,
            created_at,
            updated_at
        ) VALUES (
            v_tutor_id,
            p_offering_course_option_id,
            p_quran_age_group_id,
            p_quran_level_id,
            v_validated_label,
            v_date,
            v_start,
            v_end,
            v_tz,
            p_duration_minutes,
            p_price_amount,
            COALESCE(NULLIF(TRIM(p_currency), ''), 'ج.م'),
            TRUE,
            FALSE,
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

REVOKE ALL ON FUNCTION public.tutor_create_private_slots(TEXT, INTEGER, INTEGER, TEXT, JSONB, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_create_private_slots(TEXT, INTEGER, INTEGER, TEXT, JSONB, UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ج. تعديل موعد خاص غير محجوز للمعلم
CREATE OR REPLACE FUNCTION public.tutor_update_private_slot(
    p_slot_id UUID,
    p_slot_date DATE,
    p_start_time TIME,
    p_end_time TIME,
    p_duration_minutes INTEGER,
    p_price_amount INTEGER,
    p_offering_course_option_id UUID DEFAULT NULL,
    p_quran_age_group_id TEXT DEFAULT NULL,
    p_quran_level_id TEXT DEFAULT NULL,
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
    v_duration INTERVAL;
    v_conflict RECORD;
    v_validated_label TEXT;
BEGIN
    v_tutor_id := public.get_current_tutor_id();
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: حسابك غير مرتبط بملف معلم معتمد.';
    END IF;

    -- ترتيب الأقفال: قفل المعلم أولاً
    PERFORM public.acquire_tutor_lock(v_tutor_id);

    -- قفل صف الموعد الخاص
    SELECT * INTO v_slot
    FROM public.tutor_private_slots
    WHERE id = p_slot_id AND tutor_id = v_tutor_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'الموعد الخاص غير موجود أو لا ينتمي إلى حسابك.';
    END IF;

    IF v_slot.is_booked = TRUE THEN
        RAISE EXCEPTION 'لا يمكن تعديل موعد خاص تم حجزه بالفعل من قبل طالب إلا بإجراء إداري.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.tutor_private_bookings
        WHERE slot_id = p_slot_id AND status IN ('pending', 'confirmed')
    ) THEN
        RAISE EXCEPTION 'لا يمكن تعديل الموعد لوجود طلب حجز قيد المراجعة أو مؤكد.';
    END IF;

    v_tz := COALESCE(NULLIF(TRIM(p_timezone), ''), v_slot.timezone, 'Africa/Cairo');

    IF p_end_time <= p_start_time THEN
        RAISE EXCEPTION 'وقت نهاية الحصة يجب أن يكون بعد وقت البداية.';
    END IF;

    v_start_at := (p_slot_date + p_start_time) AT TIME ZONE v_tz;
    v_end_at := (p_slot_date + p_end_time) AT TIME ZONE v_tz;

    IF v_start_at <= NOW() THEN
        RAISE EXCEPTION 'لا يمكن تعديل الموعد إلى وقت في الماضي.';
    END IF;

    v_duration := v_end_at - v_start_at;
    IF EXTRACT(EPOCH FROM v_duration) / 60 != p_duration_minutes THEN
        RAISE EXCEPTION 'فارق التوقيت (% دقيقة) لا يطابق مدة الحصة المحددة (% دقيقة).', (EXTRACT(EPOCH FROM v_duration) / 60)::INTEGER, p_duration_minutes;
    END IF;

    v_validated_label := public.validate_and_get_tutor_specialization(
        v_tutor_id,
        p_offering_course_option_id,
        p_quran_age_group_id,
        p_quran_level_id
    );

    -- فحص التعارض مع استثناء الموعد الحالي نفسه
    SELECT * INTO v_conflict FROM public.internal_check_tutor_time_conflict(
        v_tutor_id,
        v_start_at,
        v_end_at,
        NULL,
        p_slot_id,
        NULL
    );

    IF v_conflict.has_conflict THEN
        RAISE EXCEPTION '%', v_conflict.conflict_details;
    END IF;

    UPDATE public.tutor_private_slots
    SET slot_date = p_slot_date,
        start_time = p_start_time,
        end_time = p_end_time,
        duration_minutes = p_duration_minutes,
        price_amount = p_price_amount,
        specialization_label = v_validated_label,
        offering_course_option_id = p_offering_course_option_id,
        quran_age_group_id = p_quran_age_group_id,
        quran_level_id = p_quran_level_id,
        timezone = v_tz,
        updated_at = NOW()
    WHERE id = p_slot_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'تم تعديل الموعد الخاص بنجاح.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_update_private_slot(UUID, DATE, TIME, TIME, INTEGER, INTEGER, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_update_private_slot(UUID, DATE, TIME, TIME, INTEGER, INTEGER, UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- د. حذف موعد خاص للمعلم (محمي ضد المواعيد المحجوزة والماضية والحجوزات المعلقة)
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

    -- قفل المعلم الموحد أولاً
    PERFORM public.acquire_tutor_lock(v_tutor_id);

    -- قفل الموعد الخاص والتحقق
    SELECT * INTO v_slot
    FROM public.tutor_private_slots
    WHERE id = p_slot_id AND tutor_id = v_tutor_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'الموعد الخاص غير موجود أو لا ينتمي إلى حسابك.';
    END IF;

    IF v_slot.is_booked = TRUE THEN
        RAISE EXCEPTION 'لا يمكن تعديل أو حذف موعد خاص تم حجزه بالفعل من قبل طالب إلا بإجراء إداري.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.tutor_private_bookings
        WHERE slot_id = p_slot_id AND status IN ('pending', 'confirmed')
    ) THEN
        RAISE EXCEPTION 'لا يمكن حذف الموعد لوجود طلب حجز قيد المعالجة أو مؤكد.';
    END IF;

    v_tz := COALESCE(NULLIF(TRIM(v_slot.timezone), ''), 'Africa/Cairo');
    v_start_at := (v_slot.slot_date + v_slot.start_time) AT TIME ZONE v_tz;

    IF v_start_at <= NOW() THEN
        RAISE EXCEPTION 'لا يمكن حذف موعد في الماضي أو انقضى وقته بتوقيت %.', v_tz;
    END IF;

    DELETE FROM public.tutor_private_slots
    WHERE id = p_slot_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'تم حذف الموعد الخاص بنجاح.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_delete_private_slot(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_delete_private_slot(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 11. إدارة المجموعات التعليمية وجداول اللقاءات
-- ------------------------------------------------------------------------------

-- أ. استعلام مجموعات المعلم الحالي مع المقاعد المحسوبة ديناميكياً
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
        g.created_at
    FROM public.tutor_groups g
    LEFT JOIN (
        SELECT ge.group_id AS grp_id, COUNT(*)::BIGINT AS confirmed_count
        FROM public.tutor_group_enrollments ge
        WHERE ge.status = 'confirmed'
        GROUP BY ge.group_id
    ) enr ON enr.grp_id = g.id
    WHERE g.tutor_id = v_tutor_id
    ORDER BY g.start_date DESC, g.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_get_my_groups() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_get_my_groups() TO authenticated, service_role;

-- ب. استعلام اللقاءات المجدولة لمجموعة محددة
CREATE OR REPLACE FUNCTION public.tutor_get_group_sessions(p_group_id UUID)
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
DECLARE
    v_tutor_id TEXT;
BEGIN
    v_tutor_id := public.get_current_tutor_id();
    IF v_tutor_id IS NULL AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول كمعلم أو مشرف.';
    END IF;

    IF NOT public.is_admin() AND NOT EXISTS (
        SELECT 1 FROM public.tutor_groups WHERE id = p_group_id AND tutor_id = v_tutor_id
    ) THEN
        RAISE EXCEPTION 'غير مصرح: المجموعة غير موجودة أو لا تتبع ملفك التدريسي.';
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

REVOKE ALL ON FUNCTION public.tutor_get_group_sessions(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_get_group_sessions(UUID) TO authenticated, service_role;

-- ج. إنشاء مجموعة تعليمية جديدة مع مصفوفة اللقاءات التفصيلية وفحص التعارض الذاتي والخارجي
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

    v_sess_count_provided := jsonb_array_length(p_sessions);
    IF v_sess_count_provided <> p_sessions_count THEN
        RAISE EXCEPTION 'عدد اللقاءات المحددة في الجدول (% لقاء) لا يطابق عدد الحصص المطلوب (%).', v_sess_count_provided, p_sessions_count;
    END IF;

    -- التحقق واستخراج اسم التخصص من قاعدة البيانات
    v_validated_label := public.validate_and_get_tutor_specialization(
        v_tutor_id,
        p_offering_course_option_id,
        p_quran_age_group_id,
        p_quran_level_id
    );

    -- قفل التزامن الموحد للمعلم
    PERFORM public.acquire_tutor_lock(v_tutor_id);

    -- 1. فحص التعارض الذاتي بين لقاءات نفس الدفعة بالتوقيت الفعلي الدقيق عبر المناطق الزمنية
    v_idx1 := 0;
    WHILE v_idx1 < v_sess_count_provided LOOP
        v_sess := p_sessions->v_idx1;
        v_start_at := ((v_sess->>'sessionDate')::DATE + (v_sess->>'startTime')::TIME) AT TIME ZONE COALESCE(NULLIF(TRIM(v_sess->>'timezone'), ''), 'Africa/Cairo');
        v_end_at := ((v_sess->>'sessionDate')::DATE + (v_sess->>'endTime')::TIME) AT TIME ZONE COALESCE(NULLIF(TRIM(v_sess->>'timezone'), ''), 'Africa/Cairo');

        v_idx2 := v_idx1 + 1;
        WHILE v_idx2 < v_sess_count_provided LOOP
            v_sess2 := p_sessions->v_idx2;
            v_start_at2 := ((v_sess2->>'sessionDate')::DATE + (v_sess2->>'startTime')::TIME) AT TIME ZONE COALESCE(NULLIF(TRIM(v_sess2->>'timezone'), ''), 'Africa/Cairo');
            v_end_at2 := ((v_sess2->>'sessionDate')::DATE + (v_sess2->>'endTime')::TIME) AT TIME ZONE COALESCE(NULLIF(TRIM(v_sess2->>'timezone'), ''), 'Africa/Cairo');

            IF tstzrange(v_start_at, v_end_at) && tstzrange(v_start_at2, v_end_at2) THEN
                RAISE EXCEPTION 'يوجد تداخل زمني بين اللقاء % واللقاء % في نفس الدفعة المقدمة.', (v_sess->>'sessionNumber')::INTEGER, (v_sess2->>'sessionNumber')::INTEGER;
            END IF;
            v_idx2 := v_idx2 + 1;
        END LOOP;
        v_idx1 := v_idx1 + 1;
    END LOOP;

    -- 2. فحص اللقاءات ضد المواعيد القائمة وضمان تطابق المدة والمستقبل
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
            RAISE EXCEPTION 'اللقاء رقم % مجدول في وقت انقضى في الماضي (% % بتوقيت %).', v_sess_num, v_sess_date, v_sess_start, v_sess_tz;
        END IF;

        IF v_sess_date < p_start_date THEN
            RAISE EXCEPTION 'اللقاء % بتاريخ % يسبق تاريخ بدء المجموعة.', v_sess_num, v_sess_date;
        END IF;

        IF p_end_date IS NOT NULL AND v_sess_date > p_end_date THEN
            RAISE EXCEPTION 'اللقاء % بتاريخ % يتجاوز تاريخ نهاية المجموعة.', v_sess_num, v_sess_date;
        END IF;

        v_duration := v_end_at - v_start_at;
        IF EXTRACT(EPOCH FROM v_duration) / 60 != p_session_duration_minutes THEN
            RAISE EXCEPTION 'مدة اللقاء % (% دقيقة) لا تطابق مدة الحصة المحددة للمجموعة (% دقيقة).', v_sess_num, (EXTRACT(EPOCH FROM v_duration) / 60)::INTEGER, p_session_duration_minutes;
        END IF;

        SELECT * INTO v_conflict FROM public.internal_check_tutor_time_conflict(v_tutor_id, v_start_at, v_end_at);
        IF v_conflict.has_conflict THEN
            RAISE EXCEPTION 'تعارض في اللقاء %: %', v_sess_num, v_conflict.conflict_details;
        END IF;
    END LOOP;

    -- إنشاء المجموعة بحالة pending_review وبدون نشر عام
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
        'pending_review',
        NULL,
        NULL,
        'open',
        FALSE,
        NULL,
        NOW(),
        NOW()
    )
    RETURNING id INTO v_group_id;

    -- إدراج تفاصيل اللقاءات في tutor_group_sessions
    FOR v_sess IN SELECT * FROM jsonb_array_elements(p_sessions)
    LOOP
        INSERT INTO public.tutor_group_sessions (
            group_id,
            session_number,
            session_date,
            start_time,
            end_time,
            timezone,
            title,
            created_at
        ) VALUES (
            v_group_id,
            (v_sess->>'sessionNumber')::INTEGER,
            (v_sess->>'sessionDate')::DATE,
            (v_sess->>'startTime')::TIME,
            (v_sess->>'endTime')::TIME,
            COALESCE(NULLIF(TRIM(v_sess->>'timezone'), ''), 'Africa/Cairo'),
            TRIM(v_sess->>'title'),
            NOW()
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'groupId', v_group_id,
        'message', 'تم إنشاء المجموعة التعليمية بنجاح ورفعها لمراجعة الإدارة والاعتماد قبل النشر للجمهور.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_create_group(TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT, INTEGER, INTEGER, DATE, DATE, TEXT, JSONB, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_create_group(TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT, INTEGER, INTEGER, DATE, DATE, TEXT, JSONB, UUID, TEXT, TEXT) TO authenticated, service_role;

-- د. تعديل المجموعة (متاح لحالات draft أو needs_revision أو pending_review ومجموعات بدون حجوزات مؤكدة)
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

    -- ترتيب الأقفال: قفل المعلم أولاً
    PERFORM public.acquire_tutor_lock(v_tutor_id);

    -- قفل صف المجموعة والتحقق
    SELECT * INTO v_group
    FROM public.tutor_groups
    WHERE id = p_group_id AND tutor_id = v_tutor_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'المجموعة التعليمية غير موجودة أو لا تملك صلاحية تعديلها.';
    END IF;

    -- قصر التعديل على الحالات المسموح بها صراحةً
    IF v_group.review_status = 'rejected' THEN
        RAISE EXCEPTION 'لا يمكن تعديل مجموعة تم رفضها نهائياً من الإدارة.';
    END IF;

    IF v_group.status IN ('completed', 'cancelled') THEN
        RAISE EXCEPTION 'لا يمكن تعديل مجموعة منتهية أو ملغاة.';
    END IF;

    -- التحقق من عدم وجود حجوزات مؤكدة
    SELECT COUNT(*) INTO v_confirmed_count
    FROM public.tutor_group_enrollments
    WHERE group_id = p_group_id AND status = 'confirmed';

    IF v_confirmed_count > 0 THEN
        RAISE EXCEPTION 'لا يمكن تعديل شروط ومواعيد المجموعة لوجود (% طلاب) مؤكدين؛ يتطلب ذلك مراجعة الإدارة.', v_confirmed_count;
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

    -- 1. فحص التعارض الذاتي بين لقاءات نفس الدفعة بالتوقيت الفعلي الدقيق
    v_idx1 := 0;
    WHILE v_idx1 < v_sess_count_provided LOOP
        v_sess := p_sessions->v_idx1;
        v_start_at := ((v_sess->>'sessionDate')::DATE + (v_sess->>'startTime')::TIME) AT TIME ZONE COALESCE(NULLIF(TRIM(v_sess->>'timezone'), ''), 'Africa/Cairo');
        v_end_at := ((v_sess->>'sessionDate')::DATE + (v_sess->>'endTime')::TIME) AT TIME ZONE COALESCE(NULLIF(TRIM(v_sess->>'timezone'), ''), 'Africa/Cairo');

        v_idx2 := v_idx1 + 1;
        WHILE v_idx2 < v_sess_count_provided LOOP
            v_sess2 := p_sessions->v_idx2;
            v_start_at2 := ((v_sess2->>'sessionDate')::DATE + (v_sess2->>'startTime')::TIME) AT TIME ZONE COALESCE(NULLIF(TRIM(v_sess2->>'timezone'), ''), 'Africa/Cairo');
            v_end_at2 := ((v_sess2->>'sessionDate')::DATE + (v_sess2->>'endTime')::TIME) AT TIME ZONE COALESCE(NULLIF(TRIM(v_sess2->>'timezone'), ''), 'Africa/Cairo');

            IF tstzrange(v_start_at, v_end_at) && tstzrange(v_start_at2, v_end_at2) THEN
                RAISE EXCEPTION 'يوجد تداخل زمني بين اللقاء % واللقاء % في نفس الدفعة الجديدة.', (v_sess->>'sessionNumber')::INTEGER, (v_sess2->>'sessionNumber')::INTEGER;
            END IF;
            v_idx2 := v_idx2 + 1;
        END LOOP;
        v_idx1 := v_idx1 + 1;
    END LOOP;

    -- 2. إزالة اللقاءات القديمة لهذه المجموعة قبل فحص وإدراج اللقاءات الجديدة لمنع تداخل المجموعة مع نفسها
    DELETE FROM public.tutor_group_sessions WHERE group_id = p_group_id;

    -- 3. فحص اللقاءات الجديدة وإدراجها
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
            RAISE EXCEPTION 'اللقاء رقم % مجدول في وقت انقضى في الماضي (% % بتوقيت %).', v_sess_num, v_sess_date, v_sess_start, v_sess_tz;
        END IF;

        IF v_sess_date < p_start_date THEN
            RAISE EXCEPTION 'اللقاء % بتاريخ % يسبق تاريخ بدء المجموعة.', v_sess_num, v_sess_date;
        END IF;

        IF p_end_date IS NOT NULL AND v_sess_date > p_end_date THEN
            RAISE EXCEPTION 'اللقاء % بتاريخ % يتجاوز تاريخ نهاية المجموعة.', v_sess_num, v_sess_date;
        END IF;

        v_duration := v_end_at - v_start_at;
        IF EXTRACT(EPOCH FROM v_duration) / 60 != p_session_duration_minutes THEN
            RAISE EXCEPTION 'مدة اللقاء % (% دقيقة) لا تطابق مدة الحصة المحددة (% دقيقة).', v_sess_num, (EXTRACT(EPOCH FROM v_duration) / 60)::INTEGER, p_session_duration_minutes;
        END IF;

        SELECT * INTO v_conflict FROM public.internal_check_tutor_time_conflict(v_tutor_id, v_start_at, v_end_at);
        IF v_conflict.has_conflict THEN
            RAISE EXCEPTION 'تعارض في اللقاء %: %', v_sess_num, v_conflict.conflict_details;
        END IF;

        INSERT INTO public.tutor_group_sessions (
            group_id, session_number, session_date, start_time, end_time, timezone, title, created_at
        ) VALUES (
            p_group_id, v_sess_num, v_sess_date, v_sess_start, v_sess_end, v_sess_tz, TRIM(v_sess->>'title'), NOW()
        );
    END LOOP;

    -- إعادة المجموعة للمراجعة وإلغاء النشر حتى يعتمدها المشرف مجدداً
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
        review_status = 'pending_review',
        is_published = FALSE,
        updated_at = NOW()
    WHERE id = p_group_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'message', 'تم تحديث بيانات المجموعة بنجاح وإعادة تقديمها لمراجعة الإدارة.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_update_group(UUID, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT, INTEGER, INTEGER, DATE, DATE, TEXT, JSONB, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_update_group(UUID, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT, INTEGER, INTEGER, DATE, DATE, TEXT, JSONB, UUID, TEXT, TEXT) TO authenticated, service_role;

-- هـ. تحديث حالة المجموعة بواسطة المعلم (انتقالات حالات محددة وصارمة مع فحص التعارض والطلاب المؤكدين)
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
    v_sess RECORD;
    v_start_at TIMESTAMPTZ;
    v_end_at TIMESTAMPTZ;
    v_conflict RECORD;
BEGIN
    v_tutor_id := public.get_current_tutor_id();
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: حسابك غير مرتبط بملف معلم معتمد.';
    END IF;

    IF p_status NOT IN ('open', 'in_progress', 'completed', 'cancelled') THEN
        RAISE EXCEPTION 'حالة المجموعة غير صالحة.';
    END IF;

    -- ترتيب الأقفال: قفل المعلم أولاً
    PERFORM public.acquire_tutor_lock(v_tutor_id);

    -- قفل صف المجموعة والتحقق
    SELECT * INTO v_group
    FROM public.tutor_groups
    WHERE id = p_group_id AND tutor_id = v_tutor_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'المجموعة التعليمية غير موجودة أو لا تملك صلاحية تعديلها.';
    END IF;

    -- منع إعادة فتح مجموعة مكتملة أو ملغاة بواسطة المعلم
    IF v_group.status IN ('completed', 'cancelled') THEN
        RAISE EXCEPTION 'لا يمكن للمعلم إعادة فتح مجموعة مكتملة أو ملغاة.';
    END IF;

    -- منع إلغاء مجموعة بها طلاب مؤكدون دون الرجوع للإدارة
    IF p_status = 'cancelled' THEN
        SELECT COUNT(*) INTO v_confirmed_count
        FROM public.tutor_group_enrollments
        WHERE group_id = p_group_id AND status = 'confirmed';

        IF v_confirmed_count > 0 THEN
            RAISE EXCEPTION 'لا يمكن للمعلم إلغاء مجموعة بها طلاب مؤكدون (% طالب)؛ يتطلب ذلك مراجعة الإدارة.', v_confirmed_count;
        END IF;

        -- إلغاء المجموعة يسحب نشرها العام
        UPDATE public.tutor_groups
        SET status = 'cancelled',
            is_published = FALSE,
            updated_at = NOW()
        WHERE id = p_group_id;

        RETURN jsonb_build_object('success', TRUE, 'message', 'تم إلغاء المجموعة التعليمية بنجاح.');
    END IF;

    -- منع إنهاء المجموعة مبكراً إذا كان هناك لقاءات مستقبلية لطلاب مؤكدين
    IF p_status = 'completed' THEN
        IF EXISTS (
            SELECT 1 FROM public.tutor_group_enrollments ge
            WHERE ge.group_id = p_group_id AND ge.status = 'confirmed'
        ) AND EXISTS (
            SELECT 1 FROM public.tutor_group_sessions gs
            WHERE gs.group_id = p_group_id
              AND (gs.session_date + gs.start_time) AT TIME ZONE COALESCE(NULLIF(TRIM(gs.timezone), ''), 'Africa/Cairo') > NOW()
        ) THEN
            RAISE EXCEPTION 'لا يمكن إنهاء المجموعة مبكراً لوجود لقاءات مستقبلية مجدولة لطلاب مؤكدين.';
        END IF;

        UPDATE public.tutor_groups
        SET status = 'completed',
            is_published = FALSE,
            updated_at = NOW()
        WHERE id = p_group_id;

        RETURN jsonb_build_object('success', TRUE, 'message', 'تم إنهاء المجموعة التعليمية بنجاح.');
    END IF;

    -- الانتقال إلى open: لا يجوز إلا لمجموعة معتمدة إدارياً
    IF p_status = 'open' THEN
        IF v_group.review_status <> 'approved' THEN
            RAISE EXCEPTION 'لا يمكن عرض المجموعة للحجز قبل اعتمادها إدارياً من المشرف.';
        END IF;
    END IF;

    UPDATE public.tutor_groups
    SET status = p_status,
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
-- 12. دوال الإدارة والتحكم (Admin Operations & Booking Management)
-- ------------------------------------------------------------------------------

-- أ. إنشاء طلب حجز موعد خاص من بيانات طلب واتساب أو اتصال الإدارة
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

    -- 1. استخراج معرف المعلم أولاً دون قفل
    SELECT tutor_id INTO v_tutor_id
    FROM public.tutor_private_slots
    WHERE id = p_slot_id;

    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'الموعد الخاص المحدد غير موجود.';
    END IF;

    -- 2. قفل المعلم الموحد
    PERFORM public.acquire_tutor_lock(v_tutor_id);

    -- 3. فحص الطلب الموجود أولاً: إعادة محاولة طلب مؤكد أو قيد المراجعة يجب ألا تفشل بسبب is_booked
    SELECT id INTO v_booking_id
    FROM public.tutor_private_bookings
    WHERE slot_id = p_slot_id
      AND phone_number = TRIM(p_phone_number)
      AND status IN ('pending', 'confirmed');

    IF v_booking_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'bookingId', v_booking_id,
            'alreadyExists', TRUE,
            'message', 'يوجد طلب حجز مسجل بالفعل لهذا الموعد ورقم الهاتف.'
        );
    END IF;

    -- 4. قفل صف الموعد والتحقق من صلاحيته
    SELECT * INTO v_slot
    FROM public.tutor_private_slots
    WHERE id = p_slot_id
    FOR UPDATE;

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
        'message', 'تم تسجيل طلب حجز الحصة الخاصة بنجاح بحالة قيد المراجعة.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_private_booking(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_private_booking(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT) TO authenticated, service_role;

-- ب. إنشاء طلب اشتراك في مجموعة من بيانات واتساب الإدارة
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

    -- 1. استخراج معرف المعلم أولاً دون قفل
    SELECT tutor_id INTO v_tutor_id
    FROM public.tutor_groups
    WHERE id = p_group_id;

    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'المجموعة التعليمية غير موجودة.';
    END IF;

    -- 2. قفل المعلم الموحد
    PERFORM public.acquire_tutor_lock(v_tutor_id);

    -- 3. فحص الطلب الموجود أولاً: إعادة محاولة طلب مسجل يجب ألا تفشل بسبب اكتمال السعة
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

    -- 4. قفل صف المجموعة والتحقق
    SELECT * INTO v_group
    FROM public.tutor_groups
    WHERE id = p_group_id
    FOR UPDATE;

    IF v_group.review_status <> 'approved' THEN
        RAISE EXCEPTION 'المجموعة لم يتم اعتمادها إدارياً بعد (حالتها: %).', v_group.review_status;
    END IF;

    IF v_group.is_published <> TRUE THEN
        RAISE EXCEPTION 'المجموعة غير معروضة للنشر العام حالياً.';
    END IF;

    IF v_group.status NOT IN ('open', 'in_progress') THEN
        RAISE EXCEPTION 'حالة المجموعة (%) لا تسمح بقبول اشتراكات جديدة.', v_group.status;
    END IF;

    -- التحقق من أن جدول لقاءات المجموعة لم ينتهِ بالكامل
    IF NOT EXISTS (
        SELECT 1 FROM public.tutor_group_sessions gs
        WHERE gs.group_id = p_group_id
          AND (gs.session_date + gs.start_time) AT TIME ZONE COALESCE(NULLIF(TRIM(gs.timezone), ''), 'Africa/Cairo') > NOW()
    ) THEN
        RAISE EXCEPTION 'انتهى جدول لقاءات هذه المجموعة بالكامل ولا يمكن قبول اشتراكات جديدة.';
    END IF;

    -- فحص السعة الحالية
    SELECT COUNT(*) INTO v_confirmed_count
    FROM public.tutor_group_enrollments
    WHERE group_id = p_group_id AND status = 'confirmed';

    IF v_confirmed_count >= v_group.max_students THEN
        RAISE EXCEPTION 'سعة المجموعة مكتملة بالكامل (% من % مقعد).', v_confirmed_count, v_group.max_students;
    END IF;

    -- تحديد نوع التسعير بذكاء دون افتراض خاطئ يغير تسعير per_session
    v_resolved_price_type := COALESCE(NULLIF(TRIM(p_price_type), ''), v_group.price_type);

    INSERT INTO public.tutor_group_enrollments (
        group_id,
        tutor_id,
        student_name,
        guardian_name,
        phone_number,
        agreed_price,
        price_type,
        currency,
        status,
        notes
    ) VALUES (
        p_group_id,
        v_group.tutor_id,
        TRIM(p_student_name),
        TRIM(p_guardian_name),
        TRIM(p_phone_number),
        p_agreed_price,
        v_resolved_price_type,
        v_group.currency,
        'pending',
        TRIM(p_notes)
    )
    RETURNING id INTO v_enrollment_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'enrollmentId', v_enrollment_id,
        'message', 'تم تسجيل طلب الاشتراك في المجموعة بنجاح بحالة قيد المراجعة.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_group_enrollment(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_group_enrollment(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT) TO authenticated, service_role;

-- ج. تأكيد حجز موعد خاص بواسطة الإدارة (مسموح من pending فقط مع إعادة الطلب المؤكد دون تكرار)
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

    -- 1. استخراج معرف المعلم أولاً دون قفل
    SELECT tutor_id INTO v_booking_tutor_id
    FROM public.tutor_private_bookings
    WHERE id = p_booking_id;

    IF v_booking_tutor_id IS NULL THEN
        RAISE EXCEPTION 'طلب حجز الحصة الخاصة غير موجود.';
    END IF;

    -- 2. قفل المعلم الموحد
    PERFORM public.acquire_tutor_lock(v_booking_tutor_id);

    -- 3. قفل سجل الحجز
    SELECT * INTO v_booking
    FROM public.tutor_private_bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    -- منع التأكيد إلا من حالة pending؛ إعادة الطلب المؤكد دون تكرار
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

    -- 4. قفل الموعد الخاص والتحقق الصارم من شروطه
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

    -- فحص التعارض الشامل مع استثناء الموعد نفسه
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
        'message', 'تم تأكيد حجز الحصة الخاصة بنجاح وقفل الموعد.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_confirm_private_booking(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_confirm_private_booking(UUID) TO authenticated, service_role;

-- د. إلغاء حجز موعد خاص بواسطة الإدارة مع ضبط is_available صراحةً
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
    v_booking_tutor_id TEXT;
    v_booking RECORD;
    v_slot RECORD;
    v_start_at TIMESTAMPTZ;
    v_tz TEXT;
    v_conflict RECORD;
    v_should_reopen BOOLEAN := FALSE;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذا الإجراء مخصص لمشرفي المنصة فقط.';
    END IF;

    -- 1. استخراج معرف المعلم أولاً دون قفل
    SELECT tutor_id INTO v_booking_tutor_id
    FROM public.tutor_private_bookings
    WHERE id = p_booking_id;

    IF v_booking_tutor_id IS NULL THEN
        RAISE EXCEPTION 'طلب الحجز غير موجود.';
    END IF;

    -- 2. قفل المعلم الموحد
    PERFORM public.acquire_tutor_lock(v_booking_tutor_id);

    -- 3. قفل سجل الحجز
    SELECT * INTO v_booking
    FROM public.tutor_private_bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF v_booking.status = 'cancelled' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'bookingId', p_booking_id,
            'alreadyCancelled', TRUE,
            'message', 'الحجز ملغى بالفعل مسبقاً.'
        );
    END IF;

    IF v_booking.status = 'completed' THEN
        RAISE EXCEPTION 'لا يمكن إلغاء حجز مكتمل انتهت حصته بالفعل.';
    END IF;

    -- 4. قفل صف الموعد
    SELECT * INTO v_slot
    FROM public.tutor_private_slots
    WHERE id = v_booking.slot_id
    FOR UPDATE;

    -- توثيق الإلغاء مع الحفاظ الكامل على السجل
    UPDATE public.tutor_private_bookings
    SET status = 'cancelled',
        cancellation_reason = p_cancellation_reason,
        cancelled_by = 'admin',
        cancelled_at = NOW(),
        updated_at = NOW()
    WHERE id = p_booking_id;

    -- إعادة الإتاحة قرار صريح يعتمد على طلب المشرف وصلاحية الوقت وعدم التعارض
    IF p_reopen_slot = TRUE THEN
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

    -- ضبط حقول الموعد صراحةً
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
        'message', 'تم إلغاء الحجز وتوثيق السجل بنجاح.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_cancel_private_booking(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_private_booking(UUID, TEXT, BOOLEAN) TO authenticated, service_role;

-- هـ. تأكيد اشتراك في مجموعة بواسطة الإدارة (مسموح من pending فقط) مع قفل السعة والتحقق
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

    -- 1. استخراج معرف المعلم أولاً دون قفل
    SELECT tutor_id INTO v_enrollment_tutor_id
    FROM public.tutor_group_enrollments
    WHERE id = p_enrollment_id;

    IF v_enrollment_tutor_id IS NULL THEN
        RAISE EXCEPTION 'طلب الاشتراك في المجموعة غير موجود.';
    END IF;

    -- 2. قفل المعلم الموحد
    PERFORM public.acquire_tutor_lock(v_enrollment_tutor_id);

    -- 3. قفل سجل الاشتراك
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

    -- 4. قفل صف المجموعة والتحقق
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

    IF v_group.review_status <> 'approved' THEN
        RAISE EXCEPTION 'لا يمكن تأكيد اشتراك في مجموعة غير معتمدة إدارياً.';
    END IF;

    IF v_group.is_published <> TRUE THEN
        RAISE EXCEPTION 'المجموعة غير معروضة للنشر العام.';
    END IF;

    IF v_group.status NOT IN ('open', 'in_progress') THEN
        RAISE EXCEPTION 'حالة المجموعة (%) لا تسمح بتأكيد طلاب جدد.', v_group.status;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.tutor_group_sessions gs
        WHERE gs.group_id = v_enrollment.group_id
          AND (gs.session_date + gs.start_time) AT TIME ZONE COALESCE(NULLIF(TRIM(gs.timezone), ''), 'Africa/Cairo') > NOW()
    ) THEN
        RAISE EXCEPTION 'انتهت كافة لقاءات المجموعة في الماضي ولا يمكن تأكيد اشتراك متأخر.';
    END IF;

    -- حساب المقاعد المشغولة من الاشتراكات المؤكدة النشطة مع قفل التزامن
    SELECT COUNT(*) INTO v_active_confirmed_count
    FROM public.tutor_group_enrollments
    WHERE group_id = v_enrollment.group_id
      AND status = 'confirmed';

    IF v_active_confirmed_count >= v_group.max_students THEN
        RAISE EXCEPTION 'لا يمكن تأكيد الاشتراك: اكتملت سعة المجموعة بالكامل (% من % مقعد).', v_active_confirmed_count, v_group.max_students;
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

-- و. إلغاء اشتراك في مجموعة بواسطة الإدارة (يعيد المقعد ديناميكياً)
CREATE OR REPLACE FUNCTION public.admin_cancel_group_enrollment(
    p_enrollment_id UUID,
    p_cancellation_reason TEXT DEFAULT NULL
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

    -- 1. استخراج معرف المعلم أولاً دون قفل
    SELECT tutor_id INTO v_enrollment_tutor_id
    FROM public.tutor_group_enrollments
    WHERE id = p_enrollment_id;

    IF v_enrollment_tutor_id IS NULL THEN
        RAISE EXCEPTION 'طلب الاشتراك غير موجود.';
    END IF;

    -- 2. قفل المعلم الموحد
    PERFORM public.acquire_tutor_lock(v_enrollment_tutor_id);

    -- 3. قفل سجل الاشتراك
    SELECT * INTO v_enrollment
    FROM public.tutor_group_enrollments
    WHERE id = p_enrollment_id
    FOR UPDATE;

    IF v_enrollment.status = 'cancelled' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'enrollmentId', p_enrollment_id,
            'alreadyCancelled', TRUE,
            'message', 'الاشتراك ملغى بالفعل مسبقاً.'
        );
    END IF;

    IF v_enrollment.status = 'completed' THEN
        RAISE EXCEPTION 'لا يمكن إلغاء اشتراك مكتمل انتهت مجموعته بالفعل.';
    END IF;

    -- 4. قفل صف المجموعة
    SELECT * INTO v_group
    FROM public.tutor_groups
    WHERE id = v_enrollment.group_id
    FOR UPDATE;

    UPDATE public.tutor_group_enrollments
    SET status = 'cancelled',
        cancellation_reason = p_cancellation_reason,
        cancelled_by = 'admin',
        cancelled_at = NOW(),
        updated_at = NOW()
    WHERE id = p_enrollment_id;

    SELECT COUNT(*) INTO v_active_confirmed_count
    FROM public.tutor_group_enrollments
    WHERE group_id = v_enrollment.group_id
      AND status = 'confirmed';

    RETURN jsonb_build_object(
        'success', TRUE,
        'enrollmentId', p_enrollment_id,
        'remainingSeats', v_group.max_students - v_active_confirmed_count,
        'message', 'تم إلغاء الاشتراك وتوثيق السجل وإعادة المقعد المتاح بنجاح.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_cancel_group_enrollment(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_group_enrollment(UUID, TEXT) TO authenticated, service_role;

-- ز. مراجعة واعتماد المجموعات بواسطة الإدارة مع إعادة فحص التخصص والمستقبل والتعارض الزمني
CREATE OR REPLACE FUNCTION public.admin_review_group(
    p_group_id UUID,
    p_action TEXT,
    p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_tutor_id TEXT;
    v_group RECORD;
    v_sess RECORD;
    v_new_review_status TEXT;
    v_is_published BOOLEAN;
    v_start_at TIMESTAMPTZ;
    v_end_at TIMESTAMPTZ;
    v_tz TEXT;
    v_duration INTERVAL;
    v_conflict RECORD;
    v_confirmed_count INTEGER;
    v_actual_sess_count INTEGER;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذا الإجراء مخصص لمشرفي النظام فقط.';
    END IF;

    -- 1. استخراج معرف المعلم أولاً دون قفل
    SELECT tutor_id INTO v_tutor_id
    FROM public.tutor_groups
    WHERE id = p_group_id;

    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'المجموعة التعليمية غير موجودة.';
    END IF;

    -- 2. قفل المعلم الموحد
    PERFORM public.acquire_tutor_lock(v_tutor_id);

    -- 3. قفل صف المجموعة والتحقق
    SELECT * INTO v_group
    FROM public.tutor_groups
    WHERE id = p_group_id
    FOR UPDATE;

    -- التحقق من حالة المجموعة: لا يمكن مراجعة أو اعتماد مجموعة ملغاة أو مكتملة
    IF v_group.status = 'cancelled' THEN
        RAISE EXCEPTION 'لا يمكن مراجعة أو اعتماد مجموعة ملغاة.';
    END IF;

    IF v_group.status = 'completed' THEN
        RAISE EXCEPTION 'لا يمكن مراجعة أو اعتماد مجموعة مكتملة.';
    END IF;

    IF p_action = 'approve' THEN
        -- فحص حالة المراجعة الحالية: الاعتماد متاح فقط للمجموعات المعروضة للمراجعة
        IF v_group.review_status NOT IN ('pending_review', 'needs_revision') THEN
            RAISE EXCEPTION 'المجموعة ليست قيد المراجعة حالياً (حالتها: %).', v_group.review_status;
        END IF;

        -- التحقق من سريان التخصص المعتمد
        PERFORM public.validate_and_get_tutor_specialization(
            v_group.tutor_id,
            v_group.offering_course_option_id,
            v_group.quran_age_group_id,
            v_group.quran_level_id
        );

        -- التحقق من مطابقة عدد اللقاءات المجدولة لعدد حصص المجموعة
        SELECT COUNT(*) INTO v_actual_sess_count
        FROM public.tutor_group_sessions
        WHERE group_id = p_group_id;

        IF v_actual_sess_count <> v_group.sessions_count THEN
            RAISE EXCEPTION 'عدد لقاءات المجموعة المجدولة (% لقاء) لا يطابق عدد الحصص المحدد للمجموعة (%).', v_actual_sess_count, v_group.sessions_count;
        END IF;

        -- التحقق الصارم من جميع اللقاءات: كل لقاء مستقبلي، مدته صحيحة، تاريخه ضمن النطاق، وبلا تعارض
        FOR v_sess IN 
            SELECT * FROM public.tutor_group_sessions
            WHERE group_id = p_group_id
            ORDER BY session_number ASC
        LOOP
            v_tz := COALESCE(NULLIF(TRIM(v_sess.timezone), ''), 'Africa/Cairo');
            v_start_at := (v_sess.session_date + v_sess.start_time) AT TIME ZONE v_tz;
            v_end_at := (v_sess.session_date + v_sess.end_time) AT TIME ZONE v_tz;

            -- تحقق صريح أن كل لقاء مستقبلي؛ لا يجوز اعتماد المجموعة إذا انقضى أي لقاء في الماضي
            IF v_start_at <= NOW() THEN
                RAISE EXCEPTION 'لا يمكن اعتماد المجموعة لأن موعد اللقاء رقم % قد انقضى في الماضي (% % بتوقيت %). يرجى طلب تحديث الجدول من المعلم أولاً.',
                    v_sess.session_number, v_sess.session_date, v_sess.start_time, v_tz;
            END IF;

            IF v_end_at <= v_start_at THEN
                RAISE EXCEPTION 'وقت نهاية اللقاء رقم % يجب أن يكون بعد وقت البداية.', v_sess.session_number;
            END IF;

            IF v_sess.session_date < v_group.start_date THEN
                RAISE EXCEPTION 'اللقاء رقم % بتاريخ % يسبق تاريخ بدء المجموعة (%).', v_sess.session_number, v_sess.session_date, v_group.start_date;
            END IF;

            IF v_group.end_date IS NOT NULL AND v_sess.session_date > v_group.end_date THEN
                RAISE EXCEPTION 'اللقاء رقم % بتاريخ % يتجاوز تاريخ نهاية المجموعة (%).', v_sess.session_number, v_sess.session_date, v_group.end_date;
            END IF;

            v_duration := v_end_at - v_start_at;
            IF EXTRACT(EPOCH FROM v_duration) / 60 != v_group.session_duration_minutes THEN
                RAISE EXCEPTION 'مدة اللقاء رقم % (% دقيقة) لا تطابق مدة الحصة المحددة للمجموعة (% دقيقة).',
                    v_sess.session_number, (EXTRACT(EPOCH FROM v_duration) / 60)::INTEGER, v_group.session_duration_minutes;
            END IF;

            -- إعادة فحص التعارض الزمني الشامل مع استثناء اللقاء نفسه
            SELECT * INTO v_conflict FROM public.internal_check_tutor_time_conflict(
                v_group.tutor_id,
                v_start_at,
                v_end_at,
                NULL,
                NULL,
                v_sess.id
            );

            IF v_conflict.has_conflict THEN
                RAISE EXCEPTION 'لا يمكن اعتماد المجموعة لوجود تعارض في اللقاء %: %', v_sess.session_number, v_conflict.conflict_details;
            END IF;
        END LOOP;

        v_new_review_status := 'approved';
        v_is_published := TRUE;

    ELSIF p_action = 'reject' THEN
        -- فحص حالة المراجعة: الرفض متاح فقط للمجموعات المعروضة للمراجعة أو المعتمدة
        IF v_group.review_status NOT IN ('pending_review', 'needs_revision', 'approved') THEN
            RAISE EXCEPTION 'لا يمكن رفض المجموعة: حالة المراجعة الحالية هي (%).', v_group.review_status;
        END IF;

        -- منع رفض مجموعة بها طلاب مؤكدون عبر مسار المراجعة العادي
        SELECT COUNT(*) INTO v_confirmed_count
        FROM public.tutor_group_enrollments
        WHERE group_id = p_group_id AND status = 'confirmed';

        IF v_confirmed_count > 0 THEN
            RAISE EXCEPTION 'لا يمكن رفض مجموعة بها طلاب مؤكدون (% طالب) عبر إجراء المراجعة العادي؛ يلزم مسار إداري منفصل يحافظ على التزامات الطلاب.', v_confirmed_count;
        END IF;

        v_new_review_status := 'rejected';
        v_is_published := FALSE;

    ELSIF p_action = 'needs_revision' THEN
        -- فحص حالة المراجعة: طلب التعديل متاح للمجموعات المعروضة للمراجعة أو المعتمدة
        IF v_group.review_status NOT IN ('pending_review', 'approved') THEN
            RAISE EXCEPTION 'لا يمكن طلب تعديل المجموعة: حالة المراجعة الحالية هي (%).', v_group.review_status;
        END IF;

        -- منع تحويل مجموعة معتمدة بها طلاب مؤكدون إلى طلب تعديل
        SELECT COUNT(*) INTO v_confirmed_count
        FROM public.tutor_group_enrollments
        WHERE group_id = p_group_id AND status = 'confirmed';

        IF v_confirmed_count > 0 THEN
            RAISE EXCEPTION 'لا يمكن تحويل مجموعة معتمدة بها طلاب مؤكدون (% طالب) إلى طلب استكمال (needs_revision) عبر إجراء المراجعة العادي؛ يلزم مسار إداري منفصل يحافظ على التزامات الطلاب.', v_confirmed_count;
        END IF;

        v_new_review_status := 'needs_revision';
        v_is_published := FALSE;

    ELSE
        RAISE EXCEPTION 'إجراء المراجعة غير صالح. الخيارات المتاحة: approve, reject, needs_revision.';
    END IF;

    UPDATE public.tutor_groups
    SET review_status = v_new_review_status,
        is_published = v_is_published,
        admin_review_notes = p_admin_notes,
        reviewed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_group_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'groupId', p_group_id,
        'reviewStatus', v_new_review_status,
        'isPublished', v_is_published,
        'message', 'تم تحديث حالة اعتماد المجموعة بنجاح.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_group(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_group(UUID, TEXT, TEXT) TO authenticated, service_role;

-- ح. استعلام كافة المجموعات للإدارة بما فيها المراجعة والتدقيق
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

-- ط. استعلام كافة حجوزات الحصص الخاصة للإدارة
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
        ps.specialization_label,
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

-- ي. استعلام كافة اشتراكات المجموعات للإدارة
CREATE OR REPLACE FUNCTION public.admin_get_group_enrollments(
    p_status TEXT DEFAULT NULL,
    p_group_id UUID DEFAULT NULL,
    p_tutor_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    group_id UUID,
    group_title TEXT,
    tutor_id TEXT,
    tutor_name TEXT,
    specialization_label TEXT,
    student_name TEXT,
    guardian_name TEXT,
    phone_number TEXT,
    agreed_price INTEGER,
    price_type TEXT,
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
        ge.id,
        ge.group_id,
        g.title AS group_title,
        ge.tutor_id,
        t.name AS tutor_name,
        g.specialization_label,
        ge.student_name,
        ge.guardian_name,
        ge.phone_number,
        ge.agreed_price,
        ge.price_type,
        ge.currency,
        ge.status,
        ge.notes,
        ge.cancellation_reason,
        ge.cancelled_by,
        ge.cancelled_at,
        ge.confirmed_at,
        ge.created_at
    FROM public.tutor_group_enrollments ge
    JOIN public.tutor_groups g ON g.id = ge.group_id
    JOIN public.tutors t ON t.id = ge.tutor_id
    WHERE (p_status IS NULL OR ge.status = p_status)
      AND (p_group_id IS NULL OR ge.group_id = p_group_id)
      AND (p_tutor_id IS NULL OR ge.tutor_id = p_tutor_id)
    ORDER BY ge.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_group_enrollments(TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_group_enrollments(TEXT, UUID, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 13. دوال المعلم لقراءة طلابه المؤكدين للتدريس دون الملاحظات الإدارية
-- ------------------------------------------------------------------------------

-- أ. استعلام حجوزات المعلم المؤكدة للحصص الخاصة (بيانات الطالب والتدريس فقط)
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
        ps.specialization_label,
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

-- ب. استعلام اشتراكات الطلاب المؤكدة في مجموعات المعلم
CREATE OR REPLACE FUNCTION public.tutor_get_my_confirmed_group_students(p_group_id UUID)
RETURNS TABLE (
    enrollment_id UUID,
    group_id UUID,
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

    -- التحقق من ملكية المجموعة
    IF NOT EXISTS (
        SELECT 1 FROM public.tutor_groups WHERE id = p_group_id AND tutor_id = v_tutor_id
    ) THEN
        RAISE EXCEPTION 'غير مصرح: المجموعة غير موجودة أو لا تتبع حسابك.';
    END IF;

    RETURN QUERY
    SELECT
        ge.id AS enrollment_id,
        ge.group_id,
        ge.student_name,
        ge.guardian_name,
        ge.phone_number,
        ge.confirmed_at
    FROM public.tutor_group_enrollments ge
    WHERE ge.group_id = p_group_id
      AND ge.tutor_id = v_tutor_id
      AND ge.status = 'confirmed'
    ORDER BY ge.confirmed_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_get_my_confirmed_group_students(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_get_my_confirmed_group_students(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 14. دوال العرض العام للزوار وأولياء الأمور (Public Queries)
-- ------------------------------------------------------------------------------

-- أ. إرجاع المجموعات المعتمدة والمنشورة للجمهور بأعمدة عامة محددة فقط ودون كشف ملاحظات الإدارة
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
      AND g.review_status = 'approved'
      AND g.status IN ('open', 'in_progress')
    ORDER BY g.start_date ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_tutor_groups(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_tutor_groups(TEXT) TO anon, authenticated, service_role;

-- ب. إرجاع اللقاءات العامة لمجموعة معتمدة ومنشورة
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

-- ج. إرجاع المواعيد الخاصة المتاحة لملف المعلم العام (غير المحجوزة والمستقبلية)
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
      AND COALESCE(s.is_booked, FALSE) = FALSE
      AND (s.slot_date + s.start_time) AT TIME ZONE COALESCE(NULLIF(TRIM(s.timezone), ''), 'Africa/Cairo') > NOW()
    ORDER BY s.slot_date ASC, s.start_time ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_tutor_private_slots(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_tutor_private_slots(TEXT) TO anon, authenticated, service_role;

COMMIT;
