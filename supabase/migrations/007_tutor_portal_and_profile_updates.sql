-- ==============================================================================
-- Shatir Classes (شاطر كلاسيز) - Supabase Migration: 007_tutor_portal_and_profile_updates.sql
-- Description: بوابة المعلم المعتمد وإدارة الملف والمواعيد وحماية الصلاحيات
-- Note: هذا الملف مُعد للمراجعة والتشغيل اليدوي من قِبل المشرف عبر Supabase SQL Editor (لا يُنفذ تلقائياً)
-- 
-- الضوابط والتحصينات المطبقة:
--   1. ربط الحساب بالملف عبر auth.uid() والتحقق الصارم من حالة الطلب approved واستخراج applicant_tutor_id في الخادم
--   2. دعم المعلمين المعتمدين مسبقاً وتحديث جدول الربط tutor_account_links تلقائياً دون تكرار ملفاتهم
--   3. حظر أي تعديل مباشر على جدول tutors من قِبل المعلم (منع تغيير النشر أو التوثيق أو السعر أو التقييمات)
--   4. حفظ مقترحات تعديل الملف كمسودة مراجعة مستقلة tutor_profile_drafts تخضع لموافقة الإدارة مع بقاء الملف المعتمد ظاهراً للجمهور
--   5. حجز صور المسودات في دلو تخزين خاص ومحمي tutor-avatars-pending
--   6. حصر إدارة المواعيد في المواعيد المستقبلية المتاحة فقط، ومنع تعديل أو حذف المواعيد المحجوزة أو المغلقة إدارياً
--   7. حجب عمود notes في المواعيد تماماً عن المعلم لمنع كشف أي ملاحظات إدارية أو بيانات لأولياء الأمور
--   8. التحقق من التعارض الزمني وقيد GiST في الخادم
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 0. Extensions
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ------------------------------------------------------------------------------
-- 1. Table: tutor_account_links (الربط الآمن بين auth.users و public.tutors)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tutor_account_links (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tutor_id TEXT NOT NULL REFERENCES public.tutors(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    password_changed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tutor_account_links_tutor ON public.tutor_account_links(tutor_id);
CREATE INDEX IF NOT EXISTS idx_tutor_account_links_active ON public.tutor_account_links(is_active);

DROP TRIGGER IF EXISTS trg_tutor_account_links_updated_at ON public.tutor_account_links;
CREATE TRIGGER trg_tutor_account_links_updated_at
BEFORE UPDATE ON public.tutor_account_links
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.tutor_account_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tutor can view own account link" ON public.tutor_account_links;
CREATE POLICY "Tutor can view own account link"
ON public.tutor_account_links
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admin service_role can manage all account links" ON public.tutor_account_links;
CREATE POLICY "Admin service_role can manage all account links"
ON public.tutor_account_links
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 2. Table: tutor_profile_drafts (مقترحات تعديل الملف قيد المراجعة الإدارية)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tutor_profile_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tutor_id TEXT NOT NULL REFERENCES public.tutors(id) ON UPDATE CASCADE ON DELETE CASCADE,
    headline TEXT NOT NULL,
    avatar_url TEXT,
    help_child_quote TEXT,
    help_child_summary TEXT,
    status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected', 'needs_revision')),
    admin_notes TEXT,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- قيود الأطوال
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tutor_draft_headline_length') THEN
        ALTER TABLE public.tutor_profile_drafts
        ADD CONSTRAINT chk_tutor_draft_headline_length
        CHECK (char_length(TRIM(headline)) >= 10 AND char_length(TRIM(headline)) <= 250);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tutor_draft_quote_length') THEN
        ALTER TABLE public.tutor_profile_drafts
        ADD CONSTRAINT chk_tutor_draft_quote_length
        CHECK (help_child_quote IS NULL OR (char_length(TRIM(help_child_quote)) >= 5 AND char_length(TRIM(help_child_quote)) <= 350));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tutor_draft_summary_length') THEN
        ALTER TABLE public.tutor_profile_drafts
        ADD CONSTRAINT chk_tutor_draft_summary_length
        CHECK (help_child_summary IS NULL OR (char_length(TRIM(help_child_summary)) >= 20 AND char_length(TRIM(help_child_summary)) <= 2500));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tutor_profile_drafts_lookup ON public.tutor_profile_drafts(tutor_id, status);

DROP TRIGGER IF EXISTS trg_tutor_profile_drafts_updated_at ON public.tutor_profile_drafts;
CREATE TRIGGER trg_tutor_profile_drafts_updated_at
BEFORE UPDATE ON public.tutor_profile_drafts
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.tutor_profile_drafts ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 3. Storage Bucket: tutor-avatars-pending (لتخزين الصور المقترحة الخاصة قيد المراجعة)
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'tutor-avatars-pending',
    'tutor-avatars-pending',
    FALSE,
    2097152, -- 2MB
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = FALSE,
    file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Storage Policies for tutor-avatars-pending
DROP POLICY IF EXISTS "Authenticated tutors can upload own pending avatar" ON storage.objects;
CREATE POLICY "Authenticated tutors can upload own pending avatar"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'tutor-avatars-pending'
    AND (storage.foldername(name))[1] = 'pending'
);

DROP POLICY IF EXISTS "Authenticated users can view own pending avatar" ON storage.objects;
CREATE POLICY "Authenticated users can view own pending avatar"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'tutor-avatars-pending'
    AND (
        public.is_admin()
        OR owner = auth.uid()
        OR name LIKE CONCAT('pending/', auth.uid(), '%')
    )
);

-- ------------------------------------------------------------------------------
-- 4. Helper Function: public.get_current_tutor_id()
-- يتحقق من جهة قاعدة البيانات فقط من هوية المعلم المرتبط بـ auth.uid()
-- دون الاعتماد على أي معرف يرسله المتصفح
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_current_tutor_id()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
STABLE
AS $$
DECLARE
    v_tutor_id TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NULL;
    END IF;

    -- أ. الفحص الأول: البحث عن طلب انضمام معتمد يخص المستخدم الحالي
    SELECT applicant_tutor_id INTO v_tutor_id
    FROM public.tutor_applications
    WHERE user_id = auth.uid()
      AND status = 'approved'
      AND applicant_tutor_id IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT 1;

    IF v_tutor_id IS NOT NULL THEN
        RETURN v_tutor_id;
    END IF;

    -- ب. الفحص الثاني: جدول الربط المباشر tutor_account_links
    SELECT tutor_id INTO v_tutor_id
    FROM public.tutor_account_links
    WHERE user_id = auth.uid()
      AND is_active = TRUE
    LIMIT 1;

    RETURN v_tutor_id;
END;
$$;

COMMENT ON FUNCTION public.get_current_tutor_id() IS 'يحدد معرف المعلم المعتمد المرتبط بحساب المستخدم المسجل حالياً auth.uid() بشكل آمن ومغلق';

-- ------------------------------------------------------------------------------
-- 5. RLS Policies on tutors & tutor_profile_drafts
-- ------------------------------------------------------------------------------
-- السماح للمعلم بقراءة ملفه الشخصي حتى لو كان غير منشور
DROP POLICY IF EXISTS "Tutor can view own tutor record even if unpublished" ON public.tutors;
CREATE POLICY "Tutor can view own tutor record even if unpublished"
ON public.tutors
FOR SELECT
TO authenticated
USING (
    id = public.get_current_tutor_id()
);

-- سحب التعديل والحذف المباشر لجدول tutors من authenticated لمنع التلاعب بالسعر أو النشر أو التوثيق
REVOKE UPDATE, INSERT, DELETE ON public.tutors FROM authenticated, anon;
GRANT SELECT ON public.tutors TO authenticated, anon;

-- سياسات مسودات المعلم
DROP POLICY IF EXISTS "Tutors can view own profile drafts" ON public.tutor_profile_drafts;
CREATE POLICY "Tutors can view own profile drafts"
ON public.tutor_profile_drafts
FOR SELECT
TO authenticated
USING (
    tutor_id = public.get_current_tutor_id()
    OR public.is_admin()
);

DROP POLICY IF EXISTS "Admin service_role can manage all profile drafts" ON public.tutor_profile_drafts;
CREATE POLICY "Admin service_role can manage all profile drafts"
ON public.tutor_profile_drafts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 6. RPC: public.tutor_get_portal_context()
-- يجلب سياق لوحة المعلم كاملاً بعد التحقق من auth.uid() والطلب المعتمد وحالة النشر الفعلية
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tutor_get_portal_context()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_app RECORD;
    v_tutor RECORD;
    v_draft RECORD;
    v_tutor_id TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول للوصول إلى لوحة المعلم.';
    END IF;

    -- 1. استخراج طلب الانضمام المعتمد
    SELECT * INTO v_app
    FROM public.tutor_applications
    WHERE user_id = v_user_id
      AND status = 'approved'
      AND applicant_tutor_id IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT 1;

    -- إذا لم يوجد طلب معتمد، فحص جدول الربط tutor_account_links
    IF NOT FOUND THEN
        SELECT tal.tutor_id INTO v_tutor_id
        FROM public.tutor_account_links tal
        WHERE tal.user_id = v_user_id
          AND tal.is_active = TRUE
        LIMIT 1;

        IF v_tutor_id IS NULL THEN
            RAISE EXCEPTION 'حسابك لا يحتوي على طلب معتمد أو ملف معلم مفعل في منصة شاطر.';
        END IF;
    ELSE
        v_tutor_id := v_app.applicant_tutor_id;
        -- دعم المعلمين المعتمدين بالفعل وتحديث الربط تلقائياً دون تكرار
        INSERT INTO public.tutor_account_links (user_id, tutor_id, is_active, must_change_password)
        VALUES (v_user_id, v_tutor_id, TRUE, FALSE)
        ON CONFLICT (user_id) DO UPDATE SET tutor_id = EXCLUDED.tutor_id, is_active = TRUE;
    END IF;

    -- 2. جلب بيانات ملف المعلم الفعلية من public.tutors
    SELECT * INTO v_tutor
    FROM public.tutors
    WHERE id = v_tutor_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ملف المعلم المعتمد غير موجود.';
    END IF;

    -- 3. جلب آخر مسودة تعديل معلقة إن وجدت
    SELECT * INTO v_draft
    FROM public.tutor_profile_drafts
    WHERE tutor_id = v_tutor_id
      AND status IN ('pending_review', 'needs_revision', 'draft')
    ORDER BY created_at DESC
    LIMIT 1;

    RETURN jsonb_build_object(
        'tutor', jsonb_build_object(
            'id', v_tutor.id,
            'name', v_tutor.name,
            'honorific', v_tutor.honorific,
            'headline', v_tutor.headline,
            'avatarUrl', v_tutor.avatar_url,
            'helpChildQuote', v_tutor.help_child_quote,
            'helpChildSummary', v_tutor.help_child_summary,
            'isPublished', v_tutor.is_published,
            'yearsOfExperience', v_tutor.years_of_experience,
            'experienceBadgeText', v_tutor.experience_badge_text,
            'verifiedCredentials', v_tutor.verified_credentials,
            'hourlyRateMin', v_tutor.hourly_rate_min,
            'hourlyRateMax', v_tutor.hourly_rate_max,
            'currency', v_tutor.currency,
            'sessionDurationMinutes', v_tutor.session_duration_minutes,
            'trialDurationMinutes', v_tutor.trial_duration_minutes,
            'rating', v_tutor.rating,
            'reviewsCount', v_tutor.reviews_count,
            'curriculumTags', v_tutor.curriculum_tags
        ),
        'pendingDraft', CASE WHEN v_draft.id IS NOT NULL THEN jsonb_build_object(
            'id', v_draft.id,
            'tutorId', v_draft.tutor_id,
            'headline', v_draft.headline,
            'avatarUrl', v_draft.avatar_url,
            'helpChildQuote', v_draft.help_child_quote,
            'helpChildSummary', v_draft.help_child_summary,
            'status', v_draft.status,
            'adminNotes', v_draft.admin_notes,
            'submittedAt', v_draft.submitted_at
        ) ELSE NULL END,
        'application', CASE WHEN v_app.id IS NOT NULL THEN jsonb_build_object(
            'id', v_app.id,
            'referenceCode', v_app.reference_code,
            'status', v_app.status,
            'adminNotes', v_app.admin_notes,
            'approvedAt', v_app.reviewed_at
        ) ELSE NULL END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_get_portal_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_get_portal_context() TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 7. RPC: public.tutor_get_my_slots()
-- يعرض مواعيد المعلم الخاصة مع حجب عمود notes تماماً لحماية خصوصية أولياء الأمور وتوجيهات الإدارة
-- ------------------------------------------------------------------------------
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
        COALESCE(s.is_booked, FALSE) AS is_booked,
        s.booked_at,
        s.created_at
    FROM public.tutor_available_slots s
    WHERE s.tutor_id = v_tutor_id
    ORDER BY s.slot_date ASC, s.start_time ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_get_my_slots() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_get_my_slots() TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 8. RPC: public.tutor_create_slot
-- إضافة موعد تجريبي متاح للمستقبل فقط مع فحص التعارض الزمني وقفل الخادم
-- ------------------------------------------------------------------------------
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
    v_tz TEXT;
    v_start_at TIMESTAMPTZ;
    v_end_at TIMESTAMPTZ;
    v_new_id UUID;
BEGIN
    v_tutor_id := public.get_current_tutor_id();
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: حسابك غير مرتبط بملف معلم معتمد.';
    END IF;

    v_tz := COALESCE(NULLIF(TRIM(p_timezone), ''), 'Africa/Cairo');

    -- التحقق من ترتيب الأوقات
    IF p_end_time <= p_start_time THEN
        RAISE EXCEPTION 'وقت نهاية الموعد يجب أن يكون بعد وقت البداية.';
    END IF;

    -- حساب التوقيت العالمي الدقيق
    v_start_at := (p_slot_date + p_start_time) AT TIME ZONE v_tz;
    v_end_at := (p_slot_date + p_end_time) AT TIME ZONE v_tz;

    -- اشتراط أن يكون الموعد في المستقبل
    IF v_start_at <= NOW() THEN
        RAISE EXCEPTION 'لا يمكن إضافة مواعيد في الماضي؛ يجب اختيار تاريخ ووقت مستقبلي.';
    END IF;

    -- التحقق من مدة الموعد (بين 15 دقيقة و 180 دقيقة)
    IF (v_end_at - v_start_at) < INTERVAL '15 minutes' THEN
        RAISE EXCEPTION 'مدة الموعد يجب ألا تقل عن 15 دقيقة.';
    END IF;

    IF (v_end_at - v_start_at) > INTERVAL '3 hours' THEN
        RAISE EXCEPTION 'مدة الموعد لا يمكن أن تتجاوز 3 ساعات.';
    END IF;

    -- التحقق من عدم التعارض مع موعد قائم للمعلم (متاح أو محجوز)
    IF EXISTS (
        SELECT 1 FROM public.tutor_available_slots
        WHERE tutor_id = v_tutor_id
          AND (is_available = TRUE OR is_booked = TRUE)
          AND tstzrange(
                (slot_date + start_time) AT TIME ZONE timezone,
                (slot_date + end_time) AT TIME ZONE timezone
              ) && tstzrange(v_start_at, v_end_at)
    ) THEN
        RAISE EXCEPTION 'يوجد تعارض مع موعد آخر مسجل في نفس الوقت أو يتداخل معه.';
    END IF;

    -- إدراج الموعد (notes فارغ، غير محجوز، متاح)
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
        'message', 'تمت إضافة الموعد المتاح بنجاح.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_create_slot(DATE, TIME, TIME, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_create_slot(DATE, TIME, TIME, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 9. RPC: public.tutor_delete_slot
-- حذف موعد متاح للمعلم، مع منع قطعي لحذف المواعيد المحجوزة أو المغلقة إدارياً
-- ------------------------------------------------------------------------------
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
BEGIN
    v_tutor_id := public.get_current_tutor_id();
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: حسابك غير مرتبط بملف معلم معتمد.';
    END IF;

    SELECT * INTO v_slot
    FROM public.tutor_available_slots
    WHERE id = p_slot_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'الموعد المطلوب غير موجود.';
    END IF;

    -- التحقق من ملكية الموعد
    IF v_slot.tutor_id != v_tutor_id THEN
        RAISE EXCEPTION 'غير مصرح: لا يمكنك حذف مواعيد معلمين آخرين.';
    END IF;

    -- منع حذف المواعيد المحجوزة
    IF v_slot.is_booked = TRUE THEN
        RAISE EXCEPTION 'لا يمكن حذف موعد محجوز لطالب؛ يرجى التنسيق مع إدارة شاطر أولاً.';
    END IF;

    -- منع تعديل أو حذف المواعيد غير المتاحة (التي أغلقتها الإدارة)
    IF v_slot.is_available = FALSE THEN
        RAISE EXCEPTION 'لا يمكن تعديل أو حذف موعد أغلقته الإدارة.';
    END IF;

    -- منع حذف المواعيد التي انقضى وقتها
    v_start_at := (v_slot.slot_date + v_slot.start_time) AT TIME ZONE v_slot.timezone;
    IF v_start_at <= NOW() THEN
        RAISE EXCEPTION 'لا يمكن حذف موعد انقضى وقته بالفعل.';
    END IF;

    DELETE FROM public.tutor_available_slots
    WHERE id = p_slot_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'slotId', p_slot_id,
        'message', 'تم حذف الموعد المتاح بنجاح.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_delete_slot(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_delete_slot(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 10. RPC: public.tutor_submit_profile_draft
-- حفظ مقترح تعديل الملف (العنوان، الصورة، النبذة، الأسلوب) كطلب مراجعة مستقل
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tutor_submit_profile_draft(
    p_headline TEXT,
    p_avatar_url TEXT DEFAULT NULL,
    p_help_child_quote TEXT DEFAULT NULL,
    p_help_child_summary TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_tutor_id TEXT;
    v_existing_draft_id UUID;
    v_draft_id UUID;
BEGIN
    v_tutor_id := public.get_current_tutor_id();
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: حسابك غير مرتبط بملف معلم معتمد.';
    END IF;

    -- تحقق من البيانات
    IF p_headline IS NULL OR char_length(TRIM(p_headline)) < 10 OR char_length(TRIM(p_headline)) > 250 THEN
        RAISE EXCEPTION 'العنوان التعريفي مطلوب ويجب أن يكون بين 10 و 250 حرفاً.';
    END IF;

    IF p_help_child_quote IS NOT NULL AND (char_length(TRIM(p_help_child_quote)) < 5 OR char_length(TRIM(p_help_child_quote)) > 350) THEN
        RAISE EXCEPTION 'اقتباس تبسيط المنهج يجب أن يكون بين 5 و 350 حرفاً.';
    END IF;

    IF p_help_child_summary IS NOT NULL AND (char_length(TRIM(p_help_child_summary)) < 20 OR char_length(TRIM(p_help_child_summary)) > 2500) THEN
        RAISE EXCEPTION 'نبذة أسلوب التدريس يجب أن تكون بين 20 و 2500 حرفاً.';
    END IF;

    -- التحقق من وجود مسودة معلقة حالياً لنفس المعلم لتحديثها بدلاً من تراكم مسودات مفتوحة
    SELECT id INTO v_existing_draft_id
    FROM public.tutor_profile_drafts
    WHERE tutor_id = v_tutor_id
      AND status IN ('pending_review', 'needs_revision', 'draft')
    LIMIT 1;

    IF v_existing_draft_id IS NOT NULL THEN
        UPDATE public.tutor_profile_drafts
        SET headline = TRIM(p_headline),
            avatar_url = NULLIF(TRIM(p_avatar_url), ''),
            help_child_quote = NULLIF(TRIM(p_help_child_quote), ''),
            help_child_summary = NULLIF(TRIM(p_help_child_summary), ''),
            status = 'pending_review',
            admin_notes = NULL,
            submitted_at = NOW(),
            updated_at = NOW()
        WHERE id = v_existing_draft_id
        RETURNING id INTO v_draft_id;
    ELSE
        INSERT INTO public.tutor_profile_drafts (
            tutor_id,
            headline,
            avatar_url,
            help_child_quote,
            help_child_summary,
            status,
            submitted_at,
            created_at,
            updated_at
        ) VALUES (
            v_tutor_id,
            TRIM(p_headline),
            NULLIF(TRIM(p_avatar_url), ''),
            NULLIF(TRIM(p_help_child_quote), ''),
            NULLIF(TRIM(p_help_child_summary), ''),
            'pending_review',
            NOW(),
            NOW(),
            NOW()
        )
        RETURNING id INTO v_draft_id;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'draftId', v_draft_id,
        'tutorId', v_tutor_id,
        'message', 'تم حفظ مقترحات التعديل وإرسالها لإدارة شاطر للمراجعة والاعتماد. يظل ملفك المنشور كما هو دون تغيير حتى موافقة الإدارة.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_submit_profile_draft(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_submit_profile_draft(TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 11. RPC: public.admin_review_tutor_profile_draft
-- مراجعة المشرف لمقترح التعديل، وعند القبول يتم تطبيق التعديلات ذرياً على ملف المعلم
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_review_tutor_profile_draft(
    p_draft_id UUID,
    p_action TEXT, -- 'approve', 'reject', 'needs_revision'
    p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_draft RECORD;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذا الإجراء مخصص لمديري منصة شاطر فقط.';
    END IF;

    SELECT * INTO v_draft
    FROM public.tutor_profile_drafts
    WHERE id = p_draft_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'مسودة التعديل المطلوبة غير موجودة.';
    END IF;

    IF p_action = 'approve' THEN
        -- تطبيق التعديلات على ملف المعلم المعتمد
        UPDATE public.tutors
        SET headline = v_draft.headline,
            avatar_url = COALESCE(v_draft.avatar_url, avatar_url),
            help_child_quote = COALESCE(v_draft.help_child_quote, help_child_quote),
            help_child_summary = COALESCE(v_draft.help_child_summary, help_child_summary),
            updated_at = NOW()
        WHERE id = v_draft.tutor_id;

        -- تحديث حالة المسودة
        UPDATE public.tutor_profile_drafts
        SET status = 'approved',
            admin_notes = p_admin_notes,
            reviewed_at = NOW(),
            updated_at = NOW()
        WHERE id = p_draft_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'message', 'تم اعتماد التعديلات وتطبيقها بنجاح على ملف المعلم المنشور.'
        );

    ELSIF p_action IN ('reject', 'needs_revision') THEN
        UPDATE public.tutor_profile_drafts
        SET status = p_action,
            admin_notes = p_admin_notes,
            reviewed_at = NOW(),
            updated_at = NOW()
        WHERE id = p_draft_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'message', 'تم تحديث حالة طلب تعديل الملف وتسجيل الملاحظات للمعلم.'
        );
    ELSE
        RAISE EXCEPTION 'إجراء غير صالح: يجب أن يكون approve أو reject أو needs_revision.';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_tutor_profile_draft(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_tutor_profile_draft(UUID, TEXT, TEXT) TO authenticated, service_role;

COMMIT;
