-- ==============================================================================
-- Shatir Classes (شاطر كلاسيز) - Supabase Unified Migration
-- File: supabase/migrations/008_tutor_portal_security_and_fixes.sql
-- Description: ملف SQL موحد وشامل وقابل لإعادة التشغيل (Idempotent):
--   1. إنشاء وضمان كافة المتطلبات الناقصة من Migration 007 والجداول المرتبطة
--      (tutor_account_links, tutor_profile_drafts, tutor_available_slots, admin_users).
--   2. تطبيق كافة تحصينات وإصلاحات 008 الأمنية والنهائية قبل أي عمليات تشغيل.
--   3. حماية البيانات والحسابات القائمة دون مساس ودون استخدام CASCADE أو حذف بيانات.
--   4. عزل صلاحيات tutor_available_slots وحظر الكتابة والقراءة المباشرة وحصرها في RPCs آمنة.
--   5. اعتماد مدة 20 دقيقة بالضبط للمواعيد التجريبية مع أقفال التزامن (Advisory Locks).
--   6. التحقق الصارم من ملكية ومسارات وتخزين الصور ونطاق Supabase الثابت للمشروع.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 0. الامتدادات والدوال المساعدة الأساسية
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- دالة تحديث updated_at التلقائي
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 1. المتطلبات الهيكلية الناقصة والجداول الأساسية (Prerequisites from 007 & earlier)
-- ------------------------------------------------------------------------------

-- 1.1 جدول مشرفي النظام (admin_users) ودالة التحقق is_admin()
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

-- 1.2 ترقية جدول المعلمين (public.tutors) بالحقول التكميلية إن لم تكن موجودة
ALTER TABLE public.tutors 
    ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS help_child_quote TEXT,
    ADD COLUMN IF NOT EXISTS help_child_summary TEXT;

-- 1.3 ترقية جدول المواعيد (public.tutor_available_slots) بالحقول التكميلية
ALTER TABLE public.tutor_available_slots 
    ADD COLUMN IF NOT EXISTS is_booked BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS booked_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_slots_booked 
    ON public.tutor_available_slots(is_booked);

-- 1.4 جدول الربط بين حساب المعلم وملفه (public.tutor_account_links)
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

-- 1.5 جدول مسودات تعديل ملف المعلم (public.tutor_profile_drafts)
CREATE TABLE IF NOT EXISTS public.tutor_profile_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tutor_id TEXT NOT NULL REFERENCES public.tutors(id) ON UPDATE CASCADE ON DELETE CASCADE,
    headline TEXT NOT NULL,
    avatar_url TEXT,
    help_child_quote TEXT,
    help_child_summary TEXT,
    status TEXT NOT NULL DEFAULT 'pending_review',
    admin_notes TEXT,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- قيود التحقق من أطوال النصوص والحالات لجدول المسودات
DO $$
DECLARE
    r RECORD;
BEGIN
    -- قيد طول العنوان التعريفي
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tutor_draft_headline_length') THEN
        ALTER TABLE public.tutor_profile_drafts
        ADD CONSTRAINT chk_tutor_draft_headline_length
        CHECK (char_length(TRIM(headline)) >= 10 AND char_length(TRIM(headline)) <= 250);
    END IF;

    -- قيد طول الاقتباس
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tutor_draft_quote_length') THEN
        ALTER TABLE public.tutor_profile_drafts
        ADD CONSTRAINT chk_tutor_draft_quote_length
        CHECK (help_child_quote IS NULL OR (char_length(TRIM(help_child_quote)) >= 5 AND char_length(TRIM(help_child_quote)) <= 350));
    END IF;

    -- قيد طول النبذة
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tutor_draft_summary_length') THEN
        ALTER TABLE public.tutor_profile_drafts
        ADD CONSTRAINT chk_tutor_draft_summary_length
        CHECK (help_child_summary IS NULL OR (char_length(TRIM(help_child_summary)) >= 20 AND char_length(TRIM(help_child_summary)) <= 2500));
    END IF;

    -- قيد الحالات: التأكد من شموله لـ 'rejected' بجانب بقية الحالات
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tutor_draft_status_allowed') THEN
        -- إسقاط أي قيد تحقق قديم للحالة لا يشمل rejected دون التأثير على بقية القيود
        FOR r IN (
            SELECT conname FROM pg_constraint 
            WHERE conrelid = 'public.tutor_profile_drafts'::regclass 
              AND contype = 'c' 
              AND pg_get_constraintdef(oid) LIKE '%status%'
              AND pg_get_constraintdef(oid) NOT LIKE '%rejected%'
        ) LOOP
            EXECUTE format('ALTER TABLE public.tutor_profile_drafts DROP CONSTRAINT %I', r.conname);
        END LOOP;

        ALTER TABLE public.tutor_profile_drafts
        ADD CONSTRAINT chk_tutor_draft_status_allowed
        CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected', 'needs_revision'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tutor_profile_drafts_lookup ON public.tutor_profile_drafts(tutor_id, status);

DROP TRIGGER IF EXISTS trg_tutor_profile_drafts_updated_at ON public.tutor_profile_drafts;
CREATE TRIGGER trg_tutor_profile_drafts_updated_at
BEFORE UPDATE ON public.tutor_profile_drafts
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- ------------------------------------------------------------------------------
-- 2. تأمين الجداول والصلاحيات وسياسات RLS (إصلاحات 008 النهائية)
-- ------------------------------------------------------------------------------

-- 2.1 حماية وعزل جدول المواعيد (tutor_available_slots):
-- سحب أي وصول مباشر بالـ SELECT أو التعديل من المستخدمين والزوار، والاعتماد التام على RPCs الموثوقة
REVOKE ALL ON public.tutor_available_slots FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tutor_available_slots TO service_role;
ALTER TABLE public.tutor_available_slots ENABLE ROW LEVEL SECURITY;

-- 2.2 جدول المعلمين (public.tutors):
REVOKE ALL ON public.tutors FROM PUBLIC;
GRANT SELECT ON public.tutors TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tutors TO authenticated, service_role;
GRANT ALL ON public.tutors TO service_role;
ALTER TABLE public.tutors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view published tutors" ON public.tutors;
CREATE POLICY "Public can view published tutors"
ON public.tutors
FOR SELECT
TO anon, authenticated
USING (is_published = TRUE);

DROP POLICY IF EXISTS "Admins can view all tutors" ON public.tutors;
CREATE POLICY "Admins can view all tutors"
ON public.tutors
FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert tutors" ON public.tutors;
CREATE POLICY "Admins can insert tutors"
ON public.tutors
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can update tutors" ON public.tutors;
CREATE POLICY "Admins can update tutors"
ON public.tutors
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete tutors" ON public.tutors;
CREATE POLICY "Admins can delete tutors"
ON public.tutors
FOR DELETE
TO authenticated
USING (public.is_admin());

-- 2.3 جدول مسودات المعلمين (public.tutor_profile_drafts):
REVOKE ALL ON public.tutor_profile_drafts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tutor_profile_drafts TO authenticated, service_role;
ALTER TABLE public.tutor_profile_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin service_role can manage all profile drafts" ON public.tutor_profile_drafts;
CREATE POLICY "Admin service_role can manage all profile drafts"
ON public.tutor_profile_drafts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 2.4 جدول ربط الحسابات (public.tutor_account_links):
REVOKE ALL ON public.tutor_account_links FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tutor_account_links TO authenticated, service_role;
ALTER TABLE public.tutor_account_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tutor can view own account link" ON public.tutor_account_links;
CREATE POLICY "Tutor can view own account link"
ON public.tutor_account_links
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Admin service_role can manage all account links" ON public.tutor_account_links;
CREATE POLICY "Admin service_role can manage all account links"
ON public.tutor_account_links
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 3. إعداد وتأمين وعاء التخزين الخاص: tutor-avatars-pending مع سياسة المسار المحمي
--    المسار المحمي الصارم: pending/<auth.uid()>/<file>
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

-- سياسات التخزين مع فحص المجلد الفرعي المطابق لمعرف المستخدم auth.uid()
DROP POLICY IF EXISTS "Authenticated tutors can upload own pending avatar" ON storage.objects;
CREATE POLICY "Authenticated tutors can upload own pending avatar"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'tutor-avatars-pending'
    AND (storage.foldername(name))[1] = 'pending'
    AND (storage.foldername(name))[2] = auth.uid()::text
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
        OR (
            (storage.foldername(name))[1] = 'pending'
            AND (storage.foldername(name))[2] = auth.uid()::text
        )
    )
);

DROP POLICY IF EXISTS "Authenticated users can delete own pending avatar" ON storage.objects;
CREATE POLICY "Authenticated users can delete own pending avatar"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'tutor-avatars-pending'
    AND (
        public.is_admin()
        OR (
            (storage.foldername(name))[1] = 'pending'
            AND (storage.foldername(name))[2] = auth.uid()::text
        )
    )
);

-- ------------------------------------------------------------------------------
-- 4. الدالة المساعدة: public.get_current_tutor_id()
-- تحدد هوية المعلم المعتمد المرتبط بحساب auth.uid() الحالي بدقة وأمان
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

REVOKE ALL ON FUNCTION public.get_current_tutor_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_tutor_id() TO authenticated, service_role;

-- سياسات RLS الإضافية التي تعتمد على public.get_current_tutor_id()
DROP POLICY IF EXISTS "Tutor can view own tutor record even if unpublished" ON public.tutors;
CREATE POLICY "Tutor can view own tutor record even if unpublished"
ON public.tutors
FOR SELECT
TO authenticated
USING (
    id = public.get_current_tutor_id()
);

DROP POLICY IF EXISTS "Tutors can view own profile drafts" ON public.tutor_profile_drafts;
CREATE POLICY "Tutors can view own profile drafts"
ON public.tutor_profile_drafts
FOR SELECT
TO authenticated
USING (
    tutor_id = public.get_current_tutor_id()
    OR public.is_admin()
);

-- ------------------------------------------------------------------------------
-- 5. RPC: public.tutor_get_portal_context()
-- يجلب سياق لوحة المعلم كاملاً بعد التحقق من auth.uid() وحالة الاعتماد
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
        -- دعم المعلمين المعتمدين وتحديث الربط تلقائياً دون تكرار
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
-- 6. دوال قراءة المواعيد الآمنة (RPCs):
-- أ. للزوار والطلاب: public.get_public_tutor_slots(p_tutor_id TEXT)
--    يشترط وجود المعلم في tutors وأن is_published = TRUE
-- ------------------------------------------------------------------------------
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
    -- التحقق من أن المعلم مسجل ومنشور للجمهور
    IF NOT EXISTS (
        SELECT 1 FROM public.tutors t
        WHERE t.id = p_tutor_id AND t.is_published = TRUE
    ) THEN
        RETURN;
    END IF;

    -- إرجاع المواعيد المستقبلية المتاحة فقط وحجب notes وبيانات الحجز الخاصة
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
      AND s.is_booked = FALSE
      AND (
          (s.slot_date + s.start_time) AT TIME ZONE COALESCE(NULLIF(TRIM(s.timezone), ''), 'Africa/Cairo') > NOW()
      )
    ORDER BY s.slot_date ASC, s.start_time ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_tutor_slots(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_tutor_slots(TEXT) TO anon, authenticated, service_role;

-- ب. للمعلم المسجل: public.tutor_get_my_slots()
--    الحفاظ الصارم على التوقيع الأصلي دون updated_at لضمان توافق CREATE OR REPLACE
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
        s.is_booked,
        s.booked_at,
        s.created_at
    FROM public.tutor_available_slots s
    WHERE s.tutor_id = v_tutor_id
    ORDER BY s.slot_date ASC, s.start_time ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_get_my_slots() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_get_my_slots() TO authenticated, service_role;

-- ج. للإدارة: public.admin_get_tutor_slots(p_tutor_id TEXT)
--    يعرض كافة الأعمدة للمشرف فقط بما فيها notes الداخلية
-- ------------------------------------------------------------------------------
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

-- د. للإدارة: public.admin_get_tutors_slot_counts(p_tutor_ids TEXT[])
--    يحسب عدد المواعيد المتاحة لكل معلم لقائمة معلمين دون إتاحة استعلام SELECT المباشر على الجدول
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_tutors_slot_counts(p_tutor_ids TEXT[])
RETURNS TABLE (
    tutor_id TEXT,
    available_slots_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
STABLE
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذا الإجراء مخصص لمشرفي المنصة فقط.';
    END IF;

    RETURN QUERY
    SELECT 
        s.tutor_id,
        COUNT(*)::BIGINT AS available_slots_count
    FROM public.tutor_available_slots s
    WHERE s.tutor_id = ANY(p_tutor_ids)
      AND s.is_available = TRUE
      AND COALESCE(s.is_booked, FALSE) = FALSE
    GROUP BY s.tutor_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_tutors_slot_counts(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_tutors_slot_counts(TEXT[]) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 7. دوال إدارة المواعيد للمعلم (RPCs):
-- أ. إنشاء موعد تجريبي (20 دقيقة بالضبط، قفل تزامن، فحص الماضي والتعارض)
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
    v_new_id UUID;
    v_tz TEXT;
    v_start_at TIMESTAMPTZ;
    v_end_at TIMESTAMPTZ;
    v_duration INTERVAL;
BEGIN
    v_tutor_id := public.get_current_tutor_id();
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: حسابك غير مرتبط بملف معلم معتمد.';
    END IF;

    -- 1. قفل حماية من التزامن المتوازي لنفس المعلم
    PERFORM pg_advisory_xact_lock(hashtext('tutor_slots_' || v_tutor_id));
    PERFORM 1 FROM public.tutors WHERE id = v_tutor_id FOR UPDATE;

    v_tz := COALESCE(NULLIF(TRIM(p_timezone), ''), 'Africa/Cairo');

    IF p_end_time <= p_start_time THEN
        RAISE EXCEPTION 'وقت نهاية الموعد يجب أن يكون بعد وقت البداية.';
    END IF;

    -- حساب التوقيت العالمي الدقيق
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

    -- فحص تعارض الأوقات ضد المواعيد المتاحة أو المحجوزة للمعلم نفسه
    IF EXISTS (
        SELECT 1 FROM public.tutor_available_slots
        WHERE tutor_id = v_tutor_id
          AND (is_available = TRUE OR is_booked = TRUE)
          AND tstzrange(
                (slot_date + start_time) AT TIME ZONE COALESCE(NULLIF(TRIM(timezone), ''), 'Africa/Cairo'),
                (slot_date + end_time) AT TIME ZONE COALESCE(NULLIF(TRIM(timezone), ''), 'Africa/Cairo')
              ) && tstzrange(v_start_at, v_end_at)
    ) THEN
        RAISE EXCEPTION 'يوجد موعد آخر (متاح أو محجوز) يتعارض زمنياً مع هذا التوقيت.';
    END IF;

    -- إدراج الموعد بأمان
    INSERT INTO public.tutor_available_slots (
        tutor_id, slot_date, start_time, end_time, timezone, is_available, is_booked, notes, created_at, updated_at
    ) VALUES (
        v_tutor_id, p_slot_date, p_start_time, p_end_time,
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

-- ب. حذف موعد للمعلم (مع شروط الحماية الكاملة وقفل التزامن)
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

    PERFORM pg_advisory_xact_lock(hashtext('tutor_slots_' || v_tutor_id));

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

-- ------------------------------------------------------------------------------
-- 8. دوال إدارة المواعيد للمشرفين (RPCs):
-- أ. إضافة موعد عبر الإدارة (20 دقيقة بالضبط مع قفل التزامن)
-- ------------------------------------------------------------------------------
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
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية مخصصة لمديري النظام فقط.';
    END IF;

    -- قفل حماية من التزامن المتوازي لنفس المعلم داخل قاعدة البيانات
    PERFORM pg_advisory_xact_lock(hashtext('tutor_slots_' || p_tutor_id));
    PERFORM 1 FROM public.tutors WHERE id = p_tutor_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'المعلم المحدد (%) غير موجود.', p_tutor_id;
    END IF;

    v_tz := COALESCE(NULLIF(TRIM(p_timezone), ''), 'Africa/Cairo');

    IF p_end_time <= p_start_time THEN
        RAISE EXCEPTION 'وقت نهاية الموعد يجب أن يكون بعد وقت البداية.';
    END IF;

    -- حساب التوقيت العالمي الدقيق
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

    -- فحص تعارض الأوقات ضد المواعيد المتاحة أو المحجوزة المؤكدة للمعلم نفسه
    IF EXISTS (
        SELECT 1 FROM public.tutor_available_slots
        WHERE tutor_id = p_tutor_id
          AND (is_available = TRUE OR is_booked = TRUE)
          AND tstzrange(
                (slot_date + start_time) AT TIME ZONE COALESCE(NULLIF(TRIM(timezone), ''), 'Africa/Cairo'),
                (slot_date + end_time) AT TIME ZONE COALESCE(NULLIF(TRIM(timezone), ''), 'Africa/Cairo')
              ) && tstzrange(v_start_at, v_end_at)
    ) THEN
        RAISE EXCEPTION 'يوجد موعد آخر (متاح أو مؤكد الحجز) يتعارض زمنياً مع هذا التوقيت.';
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

-- ب. تأكيد حجز الموعد لطالب رسميًا عبر الإدارة مع قفل التزامن
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
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية مخصصة لمديري النظام فقط.';
    END IF;

    SELECT tutor_id INTO v_tutor_id FROM public.tutor_available_slots WHERE id = p_slot_id;
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'الموعد المحدد غير موجود.';
    END IF;

    -- قفل حماية التزامن
    PERFORM pg_advisory_xact_lock(hashtext('tutor_slots_' || v_tutor_id));
    PERFORM 1 FROM public.tutors WHERE id = v_tutor_id FOR UPDATE;

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

    IF v_start_at <= NOW() THEN
        RAISE EXCEPTION 'لا يمكن تأكيد الحجز: انقضى وقت بداية الموعد بتوقيت %.', v_tz;
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

-- ج. إغلاق / إعادة فتح موعد عبر الإدارة مع قفل التزامن
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
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذه العملية مخصصة لمديري النظام فقط.';
    END IF;

    SELECT tutor_id INTO v_tutor_id FROM public.tutor_available_slots WHERE id = p_slot_id;
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'الموعد المحدد غير موجود.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('tutor_slots_' || v_tutor_id));
    PERFORM 1 FROM public.tutors WHERE id = v_tutor_id FOR UPDATE;

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

        IF v_start_at <= NOW() THEN
            RAISE EXCEPTION 'لا يمكن إعادة فتح موعد في الماضي أو انقضى وقته اليوم بتوقيت %.', v_tz;
        END IF;

        IF EXISTS (
            SELECT 1 FROM public.tutor_available_slots
            WHERE tutor_id = v_tutor_id
              AND id != p_slot_id
              AND (is_available = TRUE OR is_booked = TRUE)
              AND tstzrange(
                    (slot_date + start_time) AT TIME ZONE COALESCE(NULLIF(TRIM(timezone), ''), 'Africa/Cairo'),
                    (slot_date + end_time) AT TIME ZONE COALESCE(NULLIF(TRIM(timezone), ''), 'Africa/Cairo')
                  ) && tstzrange(v_start_at, (v_slot.slot_date + v_slot.end_time) AT TIME ZONE v_tz)
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

-- د. حذف موعد عبر الإدارة مع قفل التزامن
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

    SELECT tutor_id INTO v_tutor_id FROM public.tutor_available_slots WHERE id = p_slot_id;
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'الموعد المطلوب حذفه غير موجود.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('tutor_slots_' || v_tutor_id));
    PERFORM 1 FROM public.tutors WHERE id = v_tutor_id FOR UPDATE;

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
-- 9. دوال مسودات وتعديل الملف الشخصي للمعلم (RPCs):
-- أ. تقديم مسودة تعديل مع قفل التزامن لكل معلم، والتحقق الصارم من مسار ووجود الصورة،
--    ومنع إرسال طلبين متزامنين، ودعم استكمال مسودة needs_revision مع الحفاظ على الملاحظات الإدارية.
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
SET search_path = public, auth, storage, pg_temp
AS $$
DECLARE
    v_tutor_id TEXT;
    v_current_user_id UUID;
    v_existing_draft RECORD;
    v_cleaned_avatar TEXT;
    v_draft_id UUID;
    v_expected_prefix TEXT;
    v_avatar_file_exists BOOLEAN;
BEGIN
    v_current_user_id := auth.uid();
    IF v_current_user_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول لتقديم طلب تعديل الملف.';
    END IF;

    v_tutor_id := public.get_current_tutor_id();
    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: حسابك غير مرتبط بملف معلم معتمد.';
    END IF;

    -- 1. قفل تزامن حصري لكل معلم لمنع إرسال طلبين متزامنين يتجاوزان شرط الطلب الواحد
    PERFORM pg_advisory_xact_lock(hashtext('tutor_draft_' || v_tutor_id));

    -- التحقق من حالة المسودات النشطة للمعلم
    SELECT * INTO v_existing_draft
    FROM public.tutor_profile_drafts
    WHERE tutor_id = v_tutor_id
      AND status IN ('pending_review', 'needs_revision')
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_existing_draft.id IS NOT NULL AND v_existing_draft.status = 'pending_review' THEN
        RAISE EXCEPTION 'لديك طلب تعديل قيد المراجعة بالفعل من قبل الإدارة. يرجى انتظار القرار الإداري قبل إرسال طلب جديد.';
    END IF;

    v_cleaned_avatar := NULLIF(TRIM(p_avatar_url), '');

    -- التحقق الصارم من مسار الصورة المقترحة ووجودها
    IF v_cleaned_avatar IS NOT NULL THEN
        v_expected_prefix := 'pending/' || v_current_user_id::text || '/';
        
        -- رفض الروابط الخارجية أو المسارات التي لا تتبع مجلد المستخدم في التخزين الخاص
        IF NOT (v_cleaned_avatar LIKE v_expected_prefix || '%') THEN
            RAISE EXCEPTION 'مسار الصورة غير صالح: يجب أن تكون الصورة مرفوعة في مجلدك الخاص pending/<user_id>/...';
        END IF;

        -- التحقق من وجود الملف فعلياً في جدول storage.objects داخل الوعاء الخاص
        SELECT EXISTS (
            SELECT 1 FROM storage.objects
            WHERE bucket_id = 'tutor-avatars-pending'
              AND name = v_cleaned_avatar
        ) INTO v_avatar_file_exists;

        IF NOT v_avatar_file_exists THEN
            RAISE EXCEPTION 'لم يتم العثور على ملف الصورة المرفوع في مساحة التخزين الخاصة المؤقتة.';
        END IF;
    END IF;

    -- 2. إذا كانت هناك مسودة سابقة بحالة needs_revision، نقوم بتحديثها وإعادتها للمراجعة مع الحفاظ على admin_notes
    IF v_existing_draft.id IS NOT NULL AND v_existing_draft.status = 'needs_revision' THEN
        UPDATE public.tutor_profile_drafts
        SET headline = NULLIF(TRIM(p_headline), ''),
            avatar_url = COALESCE(v_cleaned_avatar, avatar_url),
            help_child_quote = NULLIF(TRIM(p_help_child_quote), ''),
            help_child_summary = NULLIF(TRIM(p_help_child_summary), ''),
            status = 'pending_review',
            -- الحفاظ على admin_notes دون مسحها لمعرفة سبب طلب التعديل السابق
            updated_at = NOW()
        WHERE id = v_existing_draft.id
        RETURNING id INTO v_draft_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'draftId', v_draft_id,
            'status', 'pending_review',
            'message', 'تم تحديث مسودة تعديل الملف وإعادتها لمراجعة الإدارة بنجاح.'
        );
    END IF;

    -- 3. في حالة عدم وجود مسودة needs_revision، يتم إدراج مسودة جديدة
    INSERT INTO public.tutor_profile_drafts (
        tutor_id,
        headline,
        avatar_url,
        help_child_quote,
        help_child_summary,
        status,
        admin_notes,
        created_at,
        updated_at
    ) VALUES (
        v_tutor_id,
        NULLIF(TRIM(p_headline), ''),
        v_cleaned_avatar,
        NULLIF(TRIM(p_help_child_quote), ''),
        NULLIF(TRIM(p_help_child_summary), ''),
        'pending_review',
        NULL,
        NOW(),
        NOW()
    )
    RETURNING id INTO v_draft_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'draftId', v_draft_id,
        'status', 'pending_review',
        'message', 'تم تقديم مقترح تعديل الملف الشخصي بنجاح وهو الآن قيد مراجعة الإدارة.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_submit_profile_draft(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_submit_profile_draft(TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 10. معالجة النسخة القديمة من مراجعة مسودة المعلم وحظر التعارض:
-- أ. إزالة النسخة القديمة ذات المعاملات الثلاث بأمان ودون CASCADE
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_review_tutor_profile_draft(UUID, TEXT, TEXT);

-- ب. النسخة الموحدة ذات المعاملات الأربعة
-- (حصر المراجعة في pending_review، تصحيح rejected، والتحقق الصارم من أن الصورة المنقولة تابعة لدلو المشروع وموجودة بـ storage.objects)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_review_tutor_profile_draft(
    p_draft_id UUID,
    p_action TEXT, -- 'approve', 'reject' (يتحول إلى 'rejected'), 'needs_revision'
    p_admin_notes TEXT DEFAULT NULL,
    p_approved_avatar_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, storage, pg_temp
AS $$
DECLARE
    v_draft RECORD;
    v_target_status TEXT;
    v_final_avatar TEXT;
    v_storage_path TEXT;
    v_object_exists BOOLEAN;
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

    -- السماح بالمراجعة فقط عندما تكون المسودة قيد المراجعة (pending_review)
    IF v_draft.status != 'pending_review' THEN
        RAISE EXCEPTION 'لا يمكن مراجعة هذه المسودة؛ لأن حالتها الحالية هي (%) وليست قيد المراجعة.', v_draft.status;
    END IF;

    -- معالجة إجراء القبول
    IF p_action = 'approve' THEN
        -- إذا كانت المسودة تحتوي على صورة مقترحة، يجب التحقق من الرابط العام الدائم المنقول
        IF v_draft.avatar_url IS NOT NULL AND TRIM(v_draft.avatar_url) != '' THEN
            v_final_avatar := NULLIF(TRIM(p_approved_avatar_url), '');
            
            IF v_final_avatar IS NULL THEN
                RAISE EXCEPTION 'لا يمكن اعتماد المسودة بصورة مقترحة دون إتمام نقل الصورة وتمرير الرابط المعتمد النهائي.';
            END IF;

            -- 1. رفض المسارات النسبية (مثل avatars/... أو pending/...)
            IF v_final_avatar NOT LIKE 'https://%' AND v_final_avatar NOT LIKE 'http://%' THEN
                RAISE EXCEPTION 'المسارات النسبية غير مقبولة؛ يجب إرسال رابط Supabase عام ومطلق يبدأ بـ https://';
            END IF;

            -- 2. رفض الروابط الموقعة (Signed URLs) والرموز المؤقتة أو المسارات المؤقتة
            IF v_final_avatar LIKE '%/storage/v1/object/sign/%'
               OR v_final_avatar LIKE '%/sign/%'
               OR v_final_avatar LIKE '%?token=%'
               OR v_final_avatar LIKE '%&token=%'
               OR v_final_avatar LIKE '%tutor-avatars-pending%' THEN
                RAISE EXCEPTION 'روابط الصور الموقعة (Signed URLs) أو المؤقتة غير مقبولة؛ يجب توفير رابط عام ودائم من وعاء tutor-avatars.';
            END IF;

            -- 3. اشتراط أن يبدأ رابط الصورة بالبادئة الدقيقة لنطاق مشروع Supabase الخاص بمنصة شاطر
            -- النطاق العام الثابت للمشروع: https://toccnayfrnuqyavhkmce.supabase.co
            IF NOT (v_final_avatar LIKE 'https://toccnayfrnuqyavhkmce.supabase.co/storage/v1/object/public/tutor-avatars/%') THEN
                RAISE EXCEPTION 'رابط الصورة مرفوض: يجب أن يبدأ بالبادئة الدقيقة لنطاق مشروع شاطر (https://toccnayfrnuqyavhkmce.supabase.co/storage/v1/object/public/tutor-avatars/).';
            END IF;

            -- 4. استخراج المسار النسبي داخل وعاء التخزين بعد البادئة الدقيقة
            v_storage_path := SUBSTRING(v_final_avatar FROM '^https://toccnayfrnuqyavhkmce\.supabase\.co/storage/v1/object/public/tutor-avatars/(.+)$');

            -- 5. التحقق من هيكل اسم الملف المطابق: avatars/<uuid>/file أو <uuid>/file
            IF NOT (
                v_storage_path ~ '^avatars/[0-9a-fA-F-]{36}/.+'
                OR v_storage_path ~ '^[0-9a-fA-F-]{36}/.+'
            ) THEN
                RAISE EXCEPTION 'مسار الصورة داخل وعاء tutor-avatars غير مطابق للصيغة المعتمدة (avatars/<uuid>/file أو <uuid>/file). المسار: %', v_storage_path;
            END IF;

            -- 6. التحقق من وجود الملف فعلياً في storage.objects داخل الوعاء العام tutor-avatars
            SELECT EXISTS (
                SELECT 1 FROM storage.objects
                WHERE bucket_id = 'tutor-avatars'
                  AND name = v_storage_path
            ) INTO v_object_exists;

            IF NOT v_object_exists THEN
                RAISE EXCEPTION 'ملف الصورة المعتمد غير موجود في وعاء التخزين العام (tutor-avatars). تأكد من اكتمال النقل عبر Storage API قبل الاعتماد.';
            END IF;
        ELSE
            -- إذا لم يتم اقتراح صورة جديدة، تبقى الصورة كما هي في الملف الأصلي
            v_final_avatar := NULL;
        END IF;

        -- تطبيق التعديلات على ملف المعلم المعتمد بحفظ الرابط العام الصحيح
        UPDATE public.tutors
        SET headline = COALESCE(v_draft.headline, headline),
            avatar_url = COALESCE(v_final_avatar, avatar_url),
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
            'status', 'approved',
            'message', 'تم اعتماد التعديلات وتطبيقها بنجاح على ملف المعلم المنشور.'
        );

    -- معالجة إجراء الرفض أو طلب التعديل (تصحيح reject إلى rejected)
    ELSIF p_action IN ('reject', 'rejected', 'needs_revision') THEN
        v_target_status := CASE WHEN p_action IN ('reject', 'rejected') THEN 'rejected' ELSE 'needs_revision' END;

        UPDATE public.tutor_profile_drafts
        SET status = v_target_status,
            admin_notes = p_admin_notes,
            reviewed_at = NOW(),
            updated_at = NOW()
        WHERE id = p_draft_id;

        RETURN jsonb_build_object(
            'success', TRUE,
            'status', v_target_status,
            'message', 'تم تحديث حالة طلب تعديل الملف وتسجيل الملاحظات للمعلم.'
        );
    ELSE
        RAISE EXCEPTION 'إجراء غير صالح: يجب أن يكون approve أو reject أو needs_revision.';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_tutor_profile_draft(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_tutor_profile_draft(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 11. RPCs لنقل الصور وتحديث المعلم عند النشر
-- أ. تجهيز بيانات نقل الصورة للمسودة:
--    - اشتراط status = 'pending_review'
--    - التحقق الصارم من أن مسار المصدر يخص حساب المعلم المرتبط بالمسودة
--    - التحقق من وجود الملف في tutor-avatars-pending
--    - استخدام gen_random_uuid() لاسم الملف الهدف بصيغة avatars/<uuid>/file
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_draft_avatar_transfer_info(p_draft_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, storage, pg_temp
AS $$
DECLARE
    v_draft RECORD;
    v_user_id UUID;
    v_expected_prefix TEXT;
    v_file_exists BOOLEAN;
    v_ext TEXT;
    v_filename TEXT;
    v_target_path TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذا الإجراء مخصص لمديري منصة شاطر فقط.';
    END IF;

    SELECT * INTO v_draft
    FROM public.tutor_profile_drafts
    WHERE id = p_draft_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'مسودة التعديل غير موجودة.';
    END IF;

    -- 1. اشتراط status = 'pending_review'
    IF v_draft.status != 'pending_review' THEN
        RAISE EXCEPTION 'لا يمكن نقل صورة لمسودة ليست قيد المراجعة (الحالة الحالية: %).', v_draft.status;
    END IF;

    IF v_draft.avatar_url IS NULL OR TRIM(v_draft.avatar_url) = '' THEN
        RAISE EXCEPTION 'المسودة لا تحتوي على صورة مقترحة للنقل.';
    END IF;

    -- 2. استخراج معرف حساب المعلم المرتبط بالمسودة
    SELECT user_id INTO v_user_id
    FROM public.tutor_account_links
    WHERE tutor_id = v_draft.tutor_id AND is_active = TRUE
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_user_id IS NULL THEN
        -- محاولة استخراج المعرف من طلب الانضمام المعتمد
        SELECT user_id INTO v_user_id
        FROM public.tutor_applications
        WHERE applicant_tutor_id = v_draft.tutor_id AND status = 'approved'
        ORDER BY updated_at DESC
        LIMIT 1;
    END IF;

    -- 3. التحقق من وجود حساب مستخدم معتمد وربطه بالمعلم، والتحقق الصارم من أن مسار المصدر يخص هذا الحساب
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'تعذر التحقق من ملكية الصورة: لم يتم العثور على حساب مستخدم معتمد ومرتبط بملف المعلم (%).', v_draft.tutor_id;
    END IF;

    v_expected_prefix := 'pending/' || v_user_id::text || '/';
    IF NOT (v_draft.avatar_url LIKE v_expected_prefix || '%') THEN
        RAISE EXCEPTION 'مسار الصورة المقترحة لا يخص الحساب المعتمد المرتبط بهذا المعلم.';
    END IF;

    -- 4. التحقق من وجود الملف في دلو tutor-avatars-pending
    SELECT EXISTS (
        SELECT 1 FROM storage.objects
        WHERE bucket_id = 'tutor-avatars-pending'
          AND name = v_draft.avatar_url
    ) INTO v_file_exists;

    IF NOT v_file_exists THEN
        RAISE EXCEPTION 'ملف الصورة المقترحة غير موجود في وعاء التخزين الخاص (tutor-avatars-pending).';
    END IF;

    -- 5. استخراج الامتداد واسم الملف واستخدام gen_random_uuid() لاسم المسار الهدف (avatars/<uuid>/file)
    v_ext := COALESCE(SUBSTRING(v_draft.avatar_url FROM '\.([a-zA-Z0-9]+)$'), 'jpg');
    v_filename := COALESCE(NULLIF(SUBSTRING(v_draft.avatar_url FROM '[^/]+$'), ''), 'avatar.' || v_ext);
    v_target_path := CONCAT('avatars/', gen_random_uuid()::text, '/', v_filename);

    RETURN jsonb_build_object(
        'draftId', v_draft.id,
        'tutorId', v_draft.tutor_id,
        'sourceBucket', 'tutor-avatars-pending',
        'sourcePath', v_draft.avatar_url,
        'targetBucket', 'tutor-avatars',
        'targetPath', v_target_path
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_draft_avatar_transfer_info(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_draft_avatar_transfer_info(UUID) TO authenticated, service_role;

-- ب. تحديث ونشر المعلم
CREATE OR REPLACE FUNCTION public.admin_update_tutor_avatar_and_publish(
    p_tutor_id TEXT,
    p_avatar_url TEXT,
    p_publish BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذا الإجراء مخصص لمديري منصة شاطر فقط.';
    END IF;

    UPDATE public.tutors
    SET avatar_url = COALESCE(NULLIF(TRIM(p_avatar_url), ''), avatar_url),
        is_published = CASE WHEN p_publish IS TRUE THEN TRUE ELSE is_published END,
        updated_at = NOW()
    WHERE id = p_tutor_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ملف المعلم المطلوب غير موجود.';
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'tutorId', p_tutor_id,
        'isPublished', (SELECT is_published FROM public.tutors WHERE id = p_tutor_id)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_tutor_avatar_and_publish(TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_tutor_avatar_and_publish(TEXT, TEXT, BOOLEAN) TO authenticated, service_role;

COMMIT;
