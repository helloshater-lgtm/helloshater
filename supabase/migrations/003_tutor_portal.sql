-- ==============================================================================
-- Shatir Classes (شاطر كلاسيز) - Supabase Migration: 003_tutor_portal.sql
-- Description: بوابة المعلمين المعتمدين (ملفي في شاطر) - النسخة المصححة والمحصنة بالكامل
-- 
-- التحصينات والإصلاحات الأمنية المطبقة وفق متطلبات شاطر:
--   1. سحب صريح لـ EXECUTE من PUBLIC وanon وauthenticated لجميع الدوال وحصر الدوال الإدارية بـ service_role
--   2. سحب صريح لـ SELECT على tutor_available_slots ومنح صلاحيات أعمدة مخصصة تحجب notes تماماً
--   3. حصر رفع إلزامات كلمة المرور بالخادم الموثوق (service_role) مع تطبيق الحظر على رفع الصور والمسودات والمواعيد
--   4. فصل صور المسودات الخاصة في دلو tutor-avatars-pending عن الصور المنشورة المعتمدة tutor-avatars
--   5. حساب التوقيتات بدقة TIMESTAMPTZ ومقارنتها بـ now() مباشرة ومنع التداخل بقيد GiST وقفل استشاري
--   6. حماية الحجز المؤكد وتحديث الموعد إدارياً بشكل ذري مع قفل الصف لمنع حالات السباق
--   7. منع تعدد المسودات المفتوحة عبر Partial Unique Index وتحقق صارم من أطوال النصوص
--   8. قابلية إعادة التشغيل (Idempotency) دون أخطاء ودون المساس بالبيانات القائمة
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 0. Required Extensions (لتوفير قيد الاستبعاد GiST على النصوص والتواريخ)
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ------------------------------------------------------------------------------
-- 1. Table: tutor_account_links (الربط الإداري بين auth.users و public.tutors)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tutor_account_links (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tutor_id TEXT NOT NULL UNIQUE REFERENCES public.tutors(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
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

COMMENT ON TABLE public.tutor_account_links IS 'ربط إداري حصري بين حساب الدخول auth.users وملف المعلم العام public.tutors';

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
-- 2. Table: tutor_profile_drafts (مسودات تعديل الملف والمراجعة الإدارية)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tutor_profile_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tutor_id TEXT NOT NULL REFERENCES public.tutors(id) ON UPDATE CASCADE ON DELETE CASCADE,
    headline TEXT NOT NULL,
    avatar_url TEXT,
    help_child_quote TEXT,
    help_child_summary TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'needs_revision')),
    admin_notes TEXT,
    submitted_at TIMESTAMPTZ,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- قيود التحقق من أطوال النصوص والحقول من جهة قاعدة البيانات
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_draft_headline_length'
    ) THEN
        ALTER TABLE public.tutor_profile_drafts
        ADD CONSTRAINT chk_draft_headline_length
        CHECK (char_length(TRIM(headline)) >= 10 AND char_length(TRIM(headline)) <= 250);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_draft_quote_length'
    ) THEN
        ALTER TABLE public.tutor_profile_drafts
        ADD CONSTRAINT chk_draft_quote_length
        CHECK (help_child_quote IS NULL OR (char_length(TRIM(help_child_quote)) >= 5 AND char_length(TRIM(help_child_quote)) <= 350));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_draft_summary_length'
    ) THEN
        ALTER TABLE public.tutor_profile_drafts
        ADD CONSTRAINT chk_draft_summary_length
        CHECK (help_child_summary IS NULL OR (char_length(TRIM(help_child_summary)) >= 20 AND char_length(TRIM(help_child_summary)) <= 2500));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_draft_avatar_url'
    ) THEN
        ALTER TABLE public.tutor_profile_drafts
        ADD CONSTRAINT chk_draft_avatar_url
        CHECK (avatar_url IS NULL OR (char_length(avatar_url) <= 1000 AND (avatar_url LIKE 'https://%' OR avatar_url LIKE 'http://%')));
    END IF;
END $$;

-- منع تعدد المسودات المفتوحة لنفس المعلم بشكل حاسم في قاعدة البيانات
CREATE UNIQUE INDEX IF NOT EXISTS uq_tutor_open_draft
ON public.tutor_profile_drafts (tutor_id)
WHERE (status IN ('draft', 'pending_review', 'needs_revision'));

CREATE INDEX IF NOT EXISTS idx_profile_drafts_tutor ON public.tutor_profile_drafts(tutor_id, status);

DROP TRIGGER IF EXISTS trg_tutor_profile_drafts_updated_at ON public.tutor_profile_drafts;
CREATE TRIGGER trg_tutor_profile_drafts_updated_at
BEFORE UPDATE ON public.tutor_profile_drafts
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.tutor_profile_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tutors can view own profile drafts" ON public.tutor_profile_drafts;
CREATE POLICY "Tutors can view own profile drafts"
ON public.tutor_profile_drafts
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.tutor_account_links tal
        WHERE tal.tutor_id = public.tutor_profile_drafts.tutor_id
          AND tal.user_id = auth.uid()
          AND tal.is_active = TRUE
    )
);

DROP POLICY IF EXISTS "Admin service_role can manage all profile drafts" ON public.tutor_profile_drafts;
CREATE POLICY "Admin service_role can manage all profile drafts"
ON public.tutor_profile_drafts
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 3. Enhance Table: tutor_available_slots (التوقيت العالمي والحجز المؤكد وحماية الملاحظات)
-- ------------------------------------------------------------------------------
ALTER TABLE public.tutor_available_slots 
ADD COLUMN IF NOT EXISTS is_booked BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS booked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ;

-- قيد تكاملي: لا يمكن أن يكون الموعد متاحاً ومحجوزاً في آنٍ واحد
ALTER TABLE public.tutor_available_slots 
DROP CONSTRAINT IF EXISTS chk_booked_availability;

ALTER TABLE public.tutor_available_slots 
ADD CONSTRAINT chk_booked_availability 
CHECK (NOT (is_booked = TRUE AND is_available = TRUE));

-- مزامنة الأعمدة الزمنية start_at و end_at بالـ UTC تلقائياً
CREATE OR REPLACE FUNCTION public.sync_slot_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.start_at := (NEW.slot_date + NEW.start_time) AT TIME ZONE NEW.timezone;
    NEW.end_at := (NEW.slot_date + NEW.end_time) AT TIME ZONE NEW.timezone;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_slot_timestamps ON public.tutor_available_slots;
CREATE TRIGGER trg_sync_slot_timestamps
BEFORE INSERT OR UPDATE ON public.tutor_available_slots
FOR EACH ROW
EXECUTE FUNCTION public.sync_slot_timestamps();

-- تحديث السجلات القائمة إن وجدت
UPDATE public.tutor_available_slots
SET start_at = (slot_date + start_time) AT TIME ZONE timezone,
    end_at = (slot_date + end_time) AT TIME ZONE timezone
WHERE start_at IS NULL OR end_at IS NULL;

-- فرض عدم القابلية للقيم الفارغة على الأعمدة المحسوبة
ALTER TABLE public.tutor_available_slots
ALTER COLUMN start_at SET NOT NULL,
ALTER COLUMN end_at SET NOT NULL;

-- قيد منع التداخل على مستوى قاعدة البيانات باستخدام GiST (للمواعيد المتاحة أو المؤكدة)
ALTER TABLE public.tutor_available_slots
DROP CONSTRAINT IF EXISTS uq_no_slot_overlap;

ALTER TABLE public.tutor_available_slots
ADD CONSTRAINT uq_no_slot_overlap
EXCLUDE USING gist (
    tutor_id WITH =,
    tstzrange(start_at, end_at) WITH &&
) WHERE (is_available = TRUE OR is_booked = TRUE);

CREATE INDEX IF NOT EXISTS idx_slots_is_booked ON public.tutor_available_slots(is_booked);
CREATE INDEX IF NOT EXISTS idx_slots_active_range 
ON public.tutor_available_slots(tutor_id, start_at, end_at) 
WHERE (is_available = TRUE OR is_booked = TRUE);

-- RLS: قراءة المعلم لجميع مواعيده الخاصة
DROP POLICY IF EXISTS "Tutor can view all own slots" ON public.tutor_available_slots;
CREATE POLICY "Tutor can view all own slots"
ON public.tutor_available_slots
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.tutor_account_links tal
        WHERE tal.tutor_id = public.tutor_available_slots.tutor_id
          AND tal.user_id = auth.uid()
          AND tal.is_active = TRUE
    )
);

-- ------------------------------------------------------------------------------
-- 4. Un-published Tutor Private Preview Policies (معاينة المعلم لملفه غير المنشور)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Tutors can view own profile even if unpublished" ON public.tutors;
CREATE POLICY "Tutors can view own profile even if unpublished"
ON public.tutors
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.tutor_account_links tal
        WHERE tal.tutor_id = public.tutors.id
          AND tal.user_id = auth.uid()
          AND tal.is_active = TRUE
    )
);

DROP POLICY IF EXISTS "Tutors can view own methodology pillars if unpublished" ON public.tutor_methodology_pillars;
CREATE POLICY "Tutors can view own methodology pillars if unpublished"
ON public.tutor_methodology_pillars FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.tutor_account_links tal
        WHERE tal.tutor_id = public.tutor_methodology_pillars.tutor_id
          AND tal.user_id = auth.uid()
          AND tal.is_active = TRUE
    )
);

DROP POLICY IF EXISTS "Tutors can view own qualifications if unpublished" ON public.tutor_qualifications;
CREATE POLICY "Tutors can view own qualifications if unpublished"
ON public.tutor_qualifications FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.tutor_account_links tal
        WHERE tal.tutor_id = public.tutor_qualifications.tutor_id
          AND tal.user_id = auth.uid()
          AND tal.is_active = TRUE
    )
);

DROP POLICY IF EXISTS "Tutors can view own trial steps if unpublished" ON public.tutor_trial_steps;
CREATE POLICY "Tutors can view own trial steps if unpublished"
ON public.tutor_trial_steps FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.tutor_account_links tal
        WHERE tal.tutor_id = public.tutor_trial_steps.tutor_id
          AND tal.user_id = auth.uid()
          AND tal.is_active = TRUE
    )
);

DROP POLICY IF EXISTS "Tutors can view own subjects summary if unpublished" ON public.tutor_subjects_taught_summary;
CREATE POLICY "Tutors can view own subjects summary if unpublished"
ON public.tutor_subjects_taught_summary FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.tutor_account_links tal
        WHERE tal.tutor_id = public.tutor_subjects_taught_summary.tutor_id
          AND tal.user_id = auth.uid()
          AND tal.is_active = TRUE
    )
);

DROP POLICY IF EXISTS "Tutors can view own school offerings if unpublished" ON public.tutor_school_offerings;
CREATE POLICY "Tutors can view own school offerings if unpublished"
ON public.tutor_school_offerings FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.tutor_account_links tal
        WHERE tal.tutor_id = public.tutor_school_offerings.tutor_id
          AND tal.user_id = auth.uid()
          AND tal.is_active = TRUE
    )
);

DROP POLICY IF EXISTS "Tutors can view own quran offerings if unpublished" ON public.tutor_quran_offerings;
CREATE POLICY "Tutors can view own quran offerings if unpublished"
ON public.tutor_quran_offerings FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.tutor_account_links tal
        WHERE tal.tutor_id = public.tutor_quran_offerings.tutor_id
          AND tal.user_id = auth.uid()
          AND tal.is_active = TRUE
    )
);

-- ------------------------------------------------------------------------------
-- 5. Stored Functions (SECURITY DEFINER with strict search_path & Concurrency Locks)
-- ------------------------------------------------------------------------------

-- حذف أي دوال غير آمنة قديمة تتيح للمتصفح رفع الإلزام ذاتياً
DROP FUNCTION IF EXISTS public.complete_tutor_password_change();
DROP FUNCTION IF EXISTS public.complete_tutor_password_change(UUID);
DROP FUNCTION IF EXISTS public.admin_approve_profile_draft(UUID, TEXT);
DROP FUNCTION IF EXISTS public.admin_approve_profile_draft(UUID, TEXT, TEXT);

-- 5.1 دالة إدارية موثوقة لرفع إلزام كلمة المرور (تُستدعى حصرياً من الخادم/service_role بعد نجاح تغيير كلمة المرور)
CREATE OR REPLACE FUNCTION public.admin_complete_tutor_password_change(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_rows_affected INTEGER;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'معرف المستخدم مطلوب';
    END IF;

    UPDATE public.tutor_account_links
    SET must_change_password = FALSE,
        password_changed_at = NOW(),
        updated_at = NOW()
    WHERE user_id = p_user_id
      AND is_active = TRUE;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    IF v_rows_affected = 0 THEN
        RAISE EXCEPTION 'لم يتم العثور على ربط معلم مفعل للمستخدم المحدد';
    END IF;

    RETURN TRUE;
END;
$$;

-- 5.2 إضافة موعد تجريبي جديد للمدرس المرتبط مع قفل التزامن وفحص التوقيت المستقبلي المباشر بـ now()
CREATE OR REPLACE FUNCTION public.tutor_add_slot(
    p_slot_date DATE,
    p_start_time TIME,
    p_end_time TIME,
    p_timezone TEXT DEFAULT 'Africa/Cairo'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_tutor_id TEXT;
    v_must_change_pw BOOLEAN;
    v_slot_id UUID;
    v_slot_start_tz TIMESTAMPTZ;
    v_slot_end_tz TIMESTAMPTZ;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'المستخدم غير مسجل الدخول';
    END IF;

    SELECT tutor_id, must_change_password INTO v_tutor_id, v_must_change_pw
    FROM public.tutor_account_links
    WHERE user_id = v_user_id AND is_active = TRUE;

    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'حسابك لم يُفعّل بعد، تواصل مع إدارة شاطر';
    END IF;

    IF v_must_change_pw THEN
        RAISE EXCEPTION 'يجب تغيير كلمة المرور المؤقتة أولاً قبل إضافة مواعيد تجريبية';
    END IF;

    -- التحقق من ترتيب الأوقات
    IF p_end_time <= p_start_time THEN
        RAISE EXCEPTION 'وقت نهاية الموعد يجب أن يكون بعد وقت البداية';
    END IF;

    -- تحويل بداية ونهاية الموعد إلى TIMESTAMPTZ دقيق بالاعتماد على المنطقة الزمنية
    BEGIN
        v_slot_start_tz := (p_slot_date + p_start_time) AT TIME ZONE p_timezone;
        v_slot_end_tz := (p_slot_date + p_end_time) AT TIME ZONE p_timezone;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'المنطقة الزمنية المحددة غير صالحة';
    END;

    -- مقارنة بداية الموعد المحولة إلى TIMESTAMPTZ بـ now() مباشرة دون تحويل عكسي
    IF v_slot_start_tz <= NOW() THEN
        RAISE EXCEPTION 'لا يمكن إضافة موعد في توقيت سابق أو انقضى بالفعل';
    END IF;

    -- قفل تزامن استشاري خاص بجدول مواعيد هذا المعلم لمنع التضارب عند الطلبات المتزامنة
    PERFORM pg_advisory_xact_lock(hashtext('tutor_slots_' || v_tutor_id));

    -- فحص التداخل بالبداية والنهاية الفعليتين بالتوقيت العالمي شاملاً المتاح والمؤكد
    IF EXISTS (
        SELECT 1 FROM public.tutor_available_slots
        WHERE tutor_id = v_tutor_id
          AND (is_available = TRUE OR is_booked = TRUE)
          AND (v_slot_start_tz < end_at AND v_slot_end_tz > start_at)
    ) THEN
        RAISE EXCEPTION 'يوجد موعد آخر مسجل (متاح أو مؤكد) يتعارض ويتداخل مع هذا التوقيت';
    END IF;

    -- إدراج الموعد بقيم نظيفة وغير محجوزة وخالية من ملاحظات الإدارة
    INSERT INTO public.tutor_available_slots (
        tutor_id,
        slot_date,
        start_time,
        end_time,
        timezone,
        start_at,
        end_at,
        is_available,
        is_booked,
        notes
    ) VALUES (
        v_tutor_id,
        p_slot_date,
        p_start_time,
        p_end_time,
        p_timezone,
        v_slot_start_tz,
        v_slot_end_tz,
        TRUE,
        FALSE,
        NULL
    ) RETURNING id INTO v_slot_id;

    RETURN v_slot_id;
END;
$$;

-- 5.3 إغلاق موعد تجريبي غير محجوز بتحديث مشروط ذري وقفل تنافس
CREATE OR REPLACE FUNCTION public.tutor_close_slot(p_slot_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_tutor_id TEXT;
    v_must_change_pw BOOLEAN;
    v_rows_affected INTEGER;
    v_existing RECORD;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'المستخدم غير مسجل الدخول';
    END IF;

    SELECT tutor_id, must_change_password INTO v_tutor_id, v_must_change_pw
    FROM public.tutor_account_links
    WHERE user_id = v_user_id AND is_active = TRUE;

    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'حسابك لم يُفعّل بعد، تواصل مع إدارة شاطر';
    END IF;

    IF v_must_change_pw THEN
        RAISE EXCEPTION 'يجب تغيير كلمة المرور المؤقتة أولاً قبل تعديل المواعيد';
    END IF;

    -- قفل استشاري يمنع السباق مع أي عملية تأكيد إداري متزامنة لنفس المعلم
    PERFORM pg_advisory_xact_lock(hashtext('tutor_slots_' || v_tutor_id));

    -- قفل الصف فوراً لمنع السباق مع أي عملية أخرى
    SELECT * INTO v_existing
    FROM public.tutor_available_slots
    WHERE id = p_slot_id
    FOR UPDATE;

    IF NOT FOUND OR v_existing.tutor_id != v_tutor_id THEN
        RAISE EXCEPTION 'الموعد غير موجود أو لا يخص حسابك';
    END IF;

    IF v_existing.is_booked THEN
        RAISE EXCEPTION 'لا يمكن إغلاق أو تعديل موعد تم تأكيد حجزه من قِبل إدارة شاطر. يرجى التواصل مع الإدارة للتنسيق.';
    END IF;

    IF NOT v_existing.is_available THEN
        RAISE EXCEPTION 'الموعد مغلق بالفعل';
    END IF;

    -- تحديث مشروط ذري: يتم فقط إذا كان الموعد متاحاً وغير محجوز
    UPDATE public.tutor_available_slots
    SET is_available = FALSE,
        updated_at = NOW()
    WHERE id = p_slot_id
      AND tutor_id = v_tutor_id
      AND is_available = TRUE
      AND is_booked = FALSE;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    IF v_rows_affected > 0 THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;

-- 5.4 حفظ وتقديم مسودة تعديل الملف الشخصي مع قفل التزامن وتحقق أمان رابط الصورة
CREATE OR REPLACE FUNCTION public.tutor_save_profile_draft(
    p_headline TEXT,
    p_avatar_url TEXT,
    p_help_child_quote TEXT,
    p_help_child_summary TEXT,
    p_submit_for_review BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_tutor_id TEXT;
    v_must_change_pw BOOLEAN;
    v_draft_id UUID;
    v_new_status TEXT;
    v_submitted_at TIMESTAMPTZ;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'المستخدم غير مسجل الدخول';
    END IF;

    SELECT tutor_id, must_change_password INTO v_tutor_id, v_must_change_pw
    FROM public.tutor_account_links
    WHERE user_id = v_user_id AND is_active = TRUE;

    IF v_tutor_id IS NULL THEN
        RAISE EXCEPTION 'حسابك لم يُفعّل بعد، تواصل مع إدارة شاطر';
    END IF;

    IF v_must_change_pw THEN
        RAISE EXCEPTION 'يجب تغيير كلمة المرور المؤقتة أولاً قبل تعديل بيانات الملف أو رفع الصور';
    END IF;

    IF p_headline IS NULL OR TRIM(p_headline) = '' THEN
        RAISE EXCEPTION 'العنوان التعريفي مطلوب ولا يمكن تركه فارغاً';
    END IF;

    -- التحقق من أمان رابط الصورة إذا وُجد: يجب أن يشير لمجلد المعلم نفسه
    IF p_avatar_url IS NOT NULL AND TRIM(p_avatar_url) != '' THEN
        IF p_avatar_url NOT LIKE '%/' || v_tutor_id || '/%' 
           AND p_avatar_url NOT LIKE '%' || v_tutor_id || '/%' THEN
            RAISE EXCEPTION 'رابط صورة الملف الشخصي لا يخص مجلد هذا المعلم';
        END IF;
    END IF;

    IF p_submit_for_review THEN
        v_new_status := 'pending_review';
        v_submitted_at := NOW();
    ELSE
        v_new_status := 'draft';
        v_submitted_at := NULL;
    END IF;

    -- قفل تزامن خاص بمسودة المعلم لمنع التضارب عند الحفظ المتزامن
    PERFORM pg_advisory_xact_lock(hashtext('tutor_draft_' || v_tutor_id));

    -- البحث عن المسودة المفتوحة الحالية (draft أو needs_revision أو pending_review)
    SELECT id INTO v_draft_id
    FROM public.tutor_profile_drafts
    WHERE tutor_id = v_tutor_id
      AND status IN ('draft', 'needs_revision', 'pending_review')
    LIMIT 1;

    IF v_draft_id IS NOT NULL THEN
        UPDATE public.tutor_profile_drafts
        SET headline = TRIM(p_headline),
            avatar_url = NULLIF(TRIM(p_avatar_url), ''),
            help_child_quote = NULLIF(TRIM(p_help_child_quote), ''),
            help_child_summary = NULLIF(TRIM(p_help_child_summary), ''),
            status = v_new_status,
            submitted_at = COALESCE(v_submitted_at, submitted_at),
            updated_at = NOW()
        WHERE id = v_draft_id;
    ELSE
        INSERT INTO public.tutor_profile_drafts (
            tutor_id,
            headline,
            avatar_url,
            help_child_quote,
            help_child_summary,
            status,
            submitted_at
        ) VALUES (
            v_tutor_id,
            TRIM(p_headline),
            NULLIF(TRIM(p_avatar_url), ''),
            NULLIF(TRIM(p_help_child_quote), ''),
            NULLIF(TRIM(p_help_child_summary), ''),
            v_new_status,
            v_submitted_at
        ) RETURNING id INTO v_draft_id;
    END IF;

    RETURN v_draft_id;
END;
$$;

-- 5.5 دالة إدارية: اعتماد المسودة مع قفل الصف ونقل الصورة لمساحة النشر (service_role فقط)
CREATE OR REPLACE FUNCTION public.admin_approve_profile_draft(
    p_draft_id UUID,
    p_admin_notes TEXT DEFAULT NULL,
    p_published_avatar_url TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, auth, pg_temp
AS $$
DECLARE
    v_draft RECORD;
    v_published_avatar TEXT;
    v_object_name TEXT;
BEGIN
    -- قفل الصف أثناء الاعتماد لمنع التعديل المتزامن
    SELECT * INTO v_draft
    FROM public.tutor_profile_drafts
    WHERE id = p_draft_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'مسودة التعديل غير موجودة';
    END IF;

    IF v_draft.status != 'pending_review' THEN
        RAISE EXCEPTION 'لا يمكن اعتماد مسودة بحالة غير بانتظار المراجعة (الحالة الحالية: %)', v_draft.status;
    END IF;

    -- التحقق من أمان الصورة وأنها تخص هذا المعلم تحديداً وليست رابطاً لمعلم آخر
    IF v_draft.avatar_url IS NOT NULL AND TRIM(v_draft.avatar_url) != '' THEN
        IF v_draft.avatar_url NOT LIKE '%/' || v_draft.tutor_id || '/%' 
           AND v_draft.avatar_url NOT LIKE '%' || v_draft.tutor_id || '/%' THEN
            RAISE EXCEPTION 'صورة المسودة لا تنتمي لمجلد المعلم صاحب الملف';
        END IF;

        -- إذا كانت الصورة في دلو الصور المعلقة tutor-avatars-pending، يتم نسخها لمساحة النشر
        IF v_draft.avatar_url LIKE '%tutor-avatars-pending%' THEN
            v_object_name := substring(v_draft.avatar_url from 'tutor-avatars-pending/(.+?)(\?|$)');
            IF v_object_name IS NULL THEN
                v_object_name := substring(v_draft.avatar_url from '(' || v_draft.tutor_id || '/.+?)(\?|$)');
            END IF;

            IF v_object_name IS NOT NULL THEN
                BEGIN
                    INSERT INTO storage.objects (id, bucket_id, name, owner, metadata)
                    SELECT gen_random_uuid(), 'tutor-avatars', name, owner, metadata
                    FROM storage.objects
                    WHERE bucket_id = 'tutor-avatars-pending' AND name = v_object_name
                    ON CONFLICT (bucket_id, name) DO UPDATE SET metadata = EXCLUDED.metadata;
                EXCEPTION WHEN OTHERS THEN
                    NULL;
                END;

                v_published_avatar := COALESCE(
                    p_published_avatar_url,
                    regexp_replace(split_part(v_draft.avatar_url, '?', 1), 'tutor-avatars-pending', 'tutor-avatars')
                );
            ELSE
                v_published_avatar := COALESCE(p_published_avatar_url, v_draft.avatar_url);
            END IF;
        ELSE
            v_published_avatar := COALESCE(p_published_avatar_url, v_draft.avatar_url);
        END IF;
    ELSE
        v_published_avatar := NULL;
    END IF;

    -- تطبيق التعديلات المعتمدة فقط على جدول tutors
    UPDATE public.tutors
    SET headline = v_draft.headline,
        avatar_url = COALESCE(v_published_avatar, avatar_url),
        help_child_quote = v_draft.help_child_quote,
        help_child_summary = v_draft.help_child_summary,
        updated_at = NOW()
    WHERE id = v_draft.tutor_id;

    -- تحديث حالة المسودة إلى معتمدة
    UPDATE public.tutor_profile_drafts
    SET status = 'approved',
        admin_notes = p_admin_notes,
        reviewed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_draft_id;

    RETURN TRUE;
END;
$$;

-- 5.6 دالة إدارية: طلب تعديل على المسودة مع قفل الصف (service_role فقط)
CREATE OR REPLACE FUNCTION public.admin_request_revision_profile_draft(
    p_draft_id UUID,
    p_admin_notes TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_draft RECORD;
BEGIN
    SELECT * INTO v_draft
    FROM public.tutor_profile_drafts
    WHERE id = p_draft_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'مسودة التعديل غير موجودة';
    END IF;

    UPDATE public.tutor_profile_drafts
    SET status = 'needs_revision',
        admin_notes = p_admin_notes,
        reviewed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_draft_id;

    RETURN TRUE;
END;
$$;

-- 5.7 دالة إدارية: تأكيد حجز موعد تجريبي ذرياً مع قفل الصف وفحص الصلاحية التوقيتية (service_role فقط)
CREATE OR REPLACE FUNCTION public.admin_confirm_slot_booking(
    p_slot_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_slot RECORD;
    v_rows_affected INTEGER;
    v_effective_start TIMESTAMPTZ;
BEGIN
    IF p_slot_id IS NULL THEN
        RAISE EXCEPTION 'معرف الموعد مطلوب';
    END IF;

    -- قفل الصف فوراً لمنع السباق مع إغلاق الموعد
    SELECT * INTO v_slot
    FROM public.tutor_available_slots
    WHERE id = p_slot_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'الموعد غير موجود';
    END IF;

    -- قفل استشاري لنفس المعلم لمنع التضارب مع عمليات المعلم المتزامنة
    PERFORM pg_advisory_xact_lock(hashtext('tutor_slots_' || v_slot.tutor_id));

    IF v_slot.is_booked THEN
        RAISE EXCEPTION 'الموعد محجوز ومؤكد بالفعل سابقاً';
    END IF;

    IF NOT v_slot.is_available THEN
        RAISE EXCEPTION 'لا يمكن تأكيد حجز موعد مغلق أو ملغي';
    END IF;

    v_effective_start := COALESCE(v_slot.start_at, (v_slot.slot_date + v_slot.start_time) AT TIME ZONE v_slot.timezone);
    IF v_effective_start <= NOW() THEN
        RAISE EXCEPTION 'لا يمكن تأكيد حجز موعد انقضى وقته في الماضي';
    END IF;

    -- تحديث ذري للحقول الثلاثة معاً: is_booked=TRUE, is_available=FALSE, booked_at=NOW()
    UPDATE public.tutor_available_slots
    SET is_booked = TRUE,
        is_available = FALSE,
        booked_at = NOW(),
        notes = COALESCE(p_notes, notes),
        updated_at = NOW()
    WHERE id = p_slot_id
      AND is_booked = FALSE
      AND is_available = TRUE;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    IF v_rows_affected = 0 THEN
        RAISE EXCEPTION 'تعذر تأكيد الحجز بسبب تضارب متزامن في حالة الموعد';
    END IF;

    RETURN TRUE;
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. Storage: فصل الصور المعلقة الخاصة عن المنشورة وحظر التعديل المباشر
-- ------------------------------------------------------------------------------

-- الدلو الأول: tutor-avatars (الصور المنشورة المعتمدة - قراءة عامة، تعديل حصري لـ service_role)
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

-- الدلو الثاني: tutor-avatars-pending (الصور المعلقة الخاصة - غير عامة، رفع ومعاينة خاصة للمعلم فقط)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'tutor-avatars-pending',
    'tutor-avatars-pending',
    FALSE,
    2097152, -- 2MB
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
    public = FALSE,
    file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

-- سياسات tutor-avatars (المنشور):
DROP POLICY IF EXISTS "Public can view published avatar images" ON storage.objects;
CREATE POLICY "Public can view published avatar images"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'tutor-avatars');

DROP POLICY IF EXISTS "Only admin can write to published tutor-avatars" ON storage.objects;
CREATE POLICY "Only admin can write to published tutor-avatars"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'tutor-avatars')
WITH CHECK (bucket_id = 'tutor-avatars');

-- سياسات tutor-avatars-pending (المعلق):
DROP POLICY IF EXISTS "Tutor can upload pending avatar to own folder only" ON storage.objects;
CREATE POLICY "Tutor can upload pending avatar to own folder only"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'tutor-avatars-pending'
    AND (storage.foldername(name))[1] = (
        SELECT tutor_id FROM public.tutor_account_links
        WHERE user_id = auth.uid()
          AND is_active = TRUE
          AND must_change_password = FALSE -- يمنع الرفع قبل تغيير كلمة المرور المؤقتة
    )
);

DROP POLICY IF EXISTS "Tutor can view own pending avatar images" ON storage.objects;
CREATE POLICY "Tutor can view own pending avatar images"
ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'tutor-avatars-pending'
    AND (storage.foldername(name))[1] = (
        SELECT tutor_id FROM public.tutor_account_links
        WHERE user_id = auth.uid()
          AND is_active = TRUE
    )
);

DROP POLICY IF EXISTS "Admin service_role can manage all pending avatars" ON storage.objects;
CREATE POLICY "Admin service_role can manage all pending avatars"
ON storage.objects FOR ALL TO service_role
USING (bucket_id = 'tutor-avatars-pending')
WITH CHECK (bucket_id = 'tutor-avatars-pending');

-- ------------------------------------------------------------------------------
-- 7. Explicit REVOKE & Least-Privilege Grants (سحب كامل ومنح دقيق)
-- ------------------------------------------------------------------------------

-- 7.1 سحب كامل لـ EXECUTE على جميع الدوال من الجميع أولاً
REVOKE ALL ON FUNCTION public.admin_complete_tutor_password_change(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_approve_profile_draft(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_request_revision_profile_draft(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_confirm_slot_booking(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tutor_add_slot(DATE, TIME, TIME, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tutor_close_slot(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tutor_save_profile_draft(TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_slot_timestamps() FROM PUBLIC, anon, authenticated;

-- 7.2 منح تنفيذ الدوال الإدارية حصرياً لـ service_role
GRANT EXECUTE ON FUNCTION public.admin_complete_tutor_password_change(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_approve_profile_draft(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_request_revision_profile_draft(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_confirm_slot_booking(UUID, TEXT) TO service_role;

-- 7.3 منح تنفيذ دوال المعلم لـ authenticated و service_role فقط
GRANT EXECUTE ON FUNCTION public.tutor_add_slot(DATE, TIME, TIME, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tutor_close_slot(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tutor_save_profile_draft(TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated, service_role;

-- 7.4 سحب كامل لصلاحيات الجداول الجديدة وحصر صلاحيات القراءة بالأعمدة المحددة
REVOKE ALL ON TABLE public.tutor_account_links FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tutor_profile_drafts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tutor_available_slots FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON TABLE public.tutor_available_slots FROM PUBLIC, anon, authenticated;

-- جدول الربط: قراءة للمستخدم الموثق، وكامل لـ service_role
GRANT SELECT ON TABLE public.tutor_account_links TO authenticated;
GRANT ALL ON TABLE public.tutor_account_links TO service_role;

-- جدول المسودات: قراءة للمستخدم الموثق، وكامل لـ service_role
GRANT SELECT ON TABLE public.tutor_profile_drafts TO authenticated;
GRANT ALL ON TABLE public.tutor_profile_drafts TO service_role;

-- جدول المواعيد: صلاحيات أعمدة دقيقة تحجب notes تماماً عن anon و authenticated
GRANT SELECT (id, tutor_id, slot_date, start_time, end_time, timezone, is_available)
ON TABLE public.tutor_available_slots TO anon;

GRANT SELECT (id, tutor_id, slot_date, start_time, end_time, timezone, is_available, is_booked, booked_at, created_at, updated_at)
ON TABLE public.tutor_available_slots TO authenticated;

GRANT ALL ON TABLE public.tutor_available_slots TO service_role;

COMMIT;
