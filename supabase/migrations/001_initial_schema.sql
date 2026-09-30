-- ==============================================================================
-- Shatir Classes (شاطر كلاسيز) - Supabase Initial Database Schema
-- Migration: 001_initial_schema.sql
-- Description: Core schema for taxonomy, course options, tutors, offerings, reviews, and applications
-- Security: Strict Row Level Security (RLS) and explicit GRANT / REVOKE configuration
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Helper Functions & Extensions
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Reusable timestamp updater function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 2. Educational Stages (المراحل الدراسية)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.educational_stages (
    id TEXT PRIMARY KEY, -- 'elementary', 'preparatory', 'secondary'
    name TEXT NOT NULL,
    grades_desc TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.educational_stages IS 'المراحل الدراسية: الابتدائية، الإعدادية، الثانوية';

-- ------------------------------------------------------------------------------
-- 3. Educational Grades (الصفوف الدراسية)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.educational_grades (
    id TEXT PRIMARY KEY, -- 'elem_1' ... 'sec_3'
    stage_id TEXT NOT NULL REFERENCES public.educational_stages(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    name TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grades_stage_id ON public.educational_grades(stage_id);
COMMENT ON TABLE public.educational_grades IS 'الصفوف الدراسية وتبعيتها للمرحلة المحددة';

-- ------------------------------------------------------------------------------
-- 4. Curriculum Types (أنظمة ومناهج الدراسة)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.curriculum_types (
    id TEXT PRIMARY KEY, -- 'national_arabic', 'languages_experimental', 'international'
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.curriculum_types IS 'أنظمة ومناهج التعليم: عربي عام، لغات وتجريبي، دولي';

-- ------------------------------------------------------------------------------
-- 5. Academic Subjects (المواد الدراسية)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subjects (
    id TEXT PRIMARY KEY, -- 'math', 'science', 'physics', ...
    name TEXT NOT NULL,
    english_name TEXT,
    category TEXT NOT NULL CHECK (category IN ('core', 'languages', 'sciences', 'social')),
    display_order INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.subjects IS 'المواد الدراسية وتصنيفها العام';

-- ------------------------------------------------------------------------------
-- 6. Quran & Foundation Age Groups (الفئات العمرية لمسار القرآن والتأسيس)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quran_age_groups (
    id TEXT PRIMARY KEY, -- 'age_4_7', 'age_8_12', 'age_13_18', 'age_adults'
    name TEXT NOT NULL,
    age_range TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.quran_age_groups IS 'الفئات العمرية المستقلة لمسار القرآن ونور البيان';

-- ------------------------------------------------------------------------------
-- 7. Quran & Foundation Levels (برامج ومستويات القرآن ونور البيان)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quran_levels (
    id TEXT PRIMARY KEY, -- 'noor_bayan', 'hifz_tilawa', 'tajweed_rules', 'khatt_imlaa'
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.quran_levels IS 'مستويات وبرامج مسار القرآن والقراءة العربية والتجويد';

-- ------------------------------------------------------------------------------
-- 8. School Course Options (التركيبات الأكاديمية المعتمدة: الصف + المادة + المنهج)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.school_course_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grade_id TEXT NOT NULL REFERENCES public.educational_grades(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    subject_id TEXT NOT NULL REFERENCES public.subjects(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    curriculum_id TEXT NOT NULL REFERENCES public.curriculum_types(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_school_course_option UNIQUE (grade_id, subject_id, curriculum_id)
);

CREATE INDEX IF NOT EXISTS idx_course_options_lookup ON public.school_course_options(grade_id, subject_id, curriculum_id);
CREATE INDEX IF NOT EXISTS idx_course_options_active ON public.school_course_options(is_active);

COMMENT ON TABLE public.school_course_options IS 'التركيبات التدريسية المعتمدة رسميًا والمسموح بتقديمها للطلاب، وتتحكم الإدارة بتفعيلها';

-- ------------------------------------------------------------------------------
-- 9. Public Tutor Profiles (ملفات المعلمين العامة)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tutors (
    id TEXT PRIMARY KEY, -- المعرف الفريد للمعلم، مثل: 'nada-elminshawy'
    name TEXT NOT NULL,
    honorific TEXT NOT NULL DEFAULT 'أ.',
    headline TEXT NOT NULL,
    avatar_url TEXT,
    verified_credentials BOOLEAN NOT NULL DEFAULT FALSE,
    years_of_experience INTEGER NOT NULL DEFAULT 0 CHECK (years_of_experience >= 0),
    experience_badge_text TEXT,
    curriculum_tags TEXT[] NOT NULL DEFAULT '{}',
    hourly_rate_min INTEGER NOT NULL CHECK (hourly_rate_min >= 0),
    hourly_rate_max INTEGER NOT NULL CHECK (hourly_rate_max >= hourly_rate_min),
    currency TEXT NOT NULL DEFAULT 'ج.م',
    session_duration_minutes INTEGER CHECK (session_duration_minutes > 0),
    trial_duration_minutes INTEGER CHECK (trial_duration_minutes > 0),
    rating NUMERIC(3, 2) CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5.00)),
    reviews_count INTEGER NOT NULL DEFAULT 0 CHECK (reviews_count >= 0),
    total_students_taught INTEGER NOT NULL DEFAULT 0 CHECK (total_students_taught >= 0),
    video_available BOOLEAN NOT NULL DEFAULT FALSE,
    video_title TEXT,
    video_duration_text TEXT,
    video_description TEXT,
    video_url TEXT,
    video_thumbnail_url TEXT,
    help_child_quote TEXT,
    help_child_summary TEXT,
    target_student_cases TEXT[] NOT NULL DEFAULT '{}',
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tutors_is_published ON public.tutors(is_published);

CREATE TRIGGER trg_tutors_updated_at
BEFORE UPDATE ON public.tutors
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.tutors IS 'البيانات العامة لملفات المعلمين؛ التقييم فارغ افتراضياً ومدة الحصة والتجربة يحددها المشرف عند الاعتماد';

-- ------------------------------------------------------------------------------
-- 10. Private Tutor Info (بيانات المعلمين الخاصة والتواصل - معزولة تماماً)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tutor_private_info (
    tutor_id TEXT PRIMARY KEY REFERENCES public.tutors(id) ON UPDATE CASCADE ON DELETE CASCADE,
    full_legal_name TEXT,
    national_id_number TEXT,
    country_code TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    whatsapp_number TEXT,
    email TEXT,
    payout_method TEXT,
    payout_details TEXT,
    internal_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_tutor_private_info_updated_at
BEFORE UPDATE ON public.tutor_private_info
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.tutor_private_info IS 'بيانات التواصل والأوراق الرسمية والحسابات البنكية الخاصة بالمعلم، معزولة تماماً عن الواجهة العامة';

-- ------------------------------------------------------------------------------
-- 11. Tutor Methodology Pillars (ركائز أسلوب التدريس)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tutor_methodology_pillars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tutor_id TEXT NOT NULL REFERENCES public.tutors(id) ON UPDATE CASCADE ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    icon_name TEXT NOT NULL DEFAULT 'smile',
    display_order INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_methodology_tutor_id ON public.tutor_methodology_pillars(tutor_id);

-- ------------------------------------------------------------------------------
-- 12. Tutor Qualifications (المؤهلات والشهادات الأكاديمية)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tutor_qualifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tutor_id TEXT NOT NULL REFERENCES public.tutors(id) ON UPDATE CASCADE ON DELETE CASCADE,
    title TEXT NOT NULL,
    institution TEXT NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,
    display_order INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qualifications_tutor_id ON public.tutor_qualifications(tutor_id);

-- ------------------------------------------------------------------------------
-- 13. Tutor Trial Steps (خطوات ما يحدث في الحصة التجريبية)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tutor_trial_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tutor_id TEXT NOT NULL REFERENCES public.tutors(id) ON UPDATE CASCADE ON DELETE CASCADE,
    step_number INTEGER NOT NULL CHECK (step_number > 0),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tutor_trial_step UNIQUE (tutor_id, step_number)
);

CREATE INDEX IF NOT EXISTS idx_trial_steps_tutor_id ON public.tutor_trial_steps(tutor_id);

-- ------------------------------------------------------------------------------
-- 14. Tutor Subjects Taught Summary (ملخص تخصصات المعلم)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tutor_subjects_taught_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tutor_id TEXT NOT NULL REFERENCES public.tutors(id) ON UPDATE CASCADE ON DELETE CASCADE,
    title TEXT NOT NULL,
    grades_range TEXT NOT NULL,
    curriculum_note TEXT,
    icon TEXT NOT NULL DEFAULT 'book',
    display_order INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subjects_summary_tutor_id ON public.tutor_subjects_taught_summary(tutor_id);

-- ------------------------------------------------------------------------------
-- 15. School Offerings (ارتباط المعلم بتركيبة التدريس المعتمدة)
-- ------------------------------------------------------------------------------
-- يرتبط المعلم بتركيبة معتمدة من school_course_options وتُستنتج المرحلة تلقائياً من الصف
CREATE TABLE IF NOT EXISTS public.tutor_school_offerings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tutor_id TEXT NOT NULL REFERENCES public.tutors(id) ON UPDATE CASCADE ON DELETE CASCADE,
    course_option_id UUID NOT NULL REFERENCES public.school_course_options(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tutor_school_offering UNIQUE (tutor_id, course_option_id)
);

CREATE INDEX IF NOT EXISTS idx_school_offerings_course_option ON public.tutor_school_offerings(course_option_id);
CREATE INDEX IF NOT EXISTS idx_school_offerings_tutor_id ON public.tutor_school_offerings(tutor_id);

COMMENT ON TABLE public.tutor_school_offerings IS 'ربط تدريس المعلم بتركيبة صف ومادة ومنهج معتمدة، وتُستنتج المرحلة من الصف عبر الجدول المرجعي';

-- واجهة مساعدة لاستنتاج المرحلة تلقائياً من الصف وتسهيل الاستعلام
CREATE OR REPLACE VIEW public.v_tutor_school_offerings AS
SELECT 
    tso.id AS offering_id,
    tso.tutor_id,
    eg.stage_id,
    sco.grade_id,
    sco.subject_id,
    sco.curriculum_id,
    sco.is_active AS course_is_active,
    tso.created_at
FROM public.tutor_school_offerings tso
JOIN public.school_course_options sco ON sco.id = tso.course_option_id
JOIN public.educational_grades eg ON eg.id = sco.grade_id;

-- ------------------------------------------------------------------------------
-- 16. Quran & Foundation Offerings (مسار القرآن والتأسيس: الفئة العمرية + المستوى)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tutor_quran_offerings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tutor_id TEXT NOT NULL REFERENCES public.tutors(id) ON UPDATE CASCADE ON DELETE CASCADE,
    age_group_id TEXT NOT NULL REFERENCES public.quran_age_groups(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    level_id TEXT NOT NULL REFERENCES public.quran_levels(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_tutor_quran_offering UNIQUE (tutor_id, age_group_id, level_id)
);

CREATE INDEX IF NOT EXISTS idx_quran_offerings_lookup ON public.tutor_quran_offerings(age_group_id, level_id);
CREATE INDEX IF NOT EXISTS idx_quran_offerings_tutor_id ON public.tutor_quran_offerings(tutor_id);

COMMENT ON TABLE public.tutor_quran_offerings IS 'ربط تدريس المعلم لمسار القرآن والتأسيس بالفئة العمرية والمستوى دون قيود مدرسية';

-- ------------------------------------------------------------------------------
-- 17. Tutor Reviews (تقييمات الطلاب وأولياء الأمور المعتمدة)
-- ------------------------------------------------------------------------------
-- لا تحتوي هذه الجداول على أي ملاحظات داخلية، وتظهر التقييمات المعتمدة فقط
CREATE TABLE IF NOT EXISTS public.tutor_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tutor_id TEXT NOT NULL REFERENCES public.tutors(id) ON UPDATE CASCADE ON DELETE CASCADE,
    reviewer_name TEXT NOT NULL,
    student_grade_or_level TEXT,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    status TEXT NOT NULL DEFAULT 'pending_review' 
        CHECK (status IN ('pending_review', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reviews_tutor_status ON public.tutor_reviews(tutor_id, status);
COMMENT ON TABLE public.tutor_reviews IS 'التقييمات المعتمدة المعروضة للمستخدمين بعد مراجعة الإدارة (خالية تماماً من الملاحظات الداخلية)';

-- ------------------------------------------------------------------------------
-- 18. Tutor Review Admin Notes (ملاحظات الإدارة الداخلية على التقييمات - معزولة)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tutor_review_admin_notes (
    review_id UUID PRIMARY KEY REFERENCES public.tutor_reviews(id) ON UPDATE CASCADE ON DELETE CASCADE,
    admin_notes TEXT NOT NULL,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.tutor_review_admin_notes IS 'ملاحظات الإدارة الداخلية حول تدقيق التقييمات، معزولة تماماً ولا يراها أي زائر';

-- ------------------------------------------------------------------------------
-- 19. Sync Tutor Rating & Review Stats Function & Trigger
-- ------------------------------------------------------------------------------
-- تحسب الدالة المعدل بدقة: إن لم تكن هناك تقييمات معتمدة تعيد rating = NULL و reviews_count = 0
-- وعند تعديل tutor_id في أي مراجعة تعيد الحساب للمعلم القديم والمعلم الجديد معاً
CREATE OR REPLACE FUNCTION public.recalculate_tutor_stats(target_tutor_id TEXT)
RETURNS VOID AS $$
DECLARE
    new_avg NUMERIC(3, 2);
    new_count INTEGER;
BEGIN
    IF target_tutor_id IS NULL THEN
        RETURN;
    END IF;

    SELECT 
        CASE 
            WHEN COUNT(*) = 0 THEN NULL 
            ELSE ROUND(AVG(rating)::numeric, 2) 
        END,
        COUNT(*)
    INTO new_avg, new_count
    FROM public.tutor_reviews
    WHERE tutor_id = target_tutor_id AND status = 'approved';

    UPDATE public.tutors
    SET rating = new_avg,
        reviews_count = new_count
    WHERE id = target_tutor_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.sync_tutor_review_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.recalculate_tutor_stats(OLD.tutor_id);
    ELSIF TG_OP = 'INSERT' THEN
        PERFORM public.recalculate_tutor_stats(NEW.tutor_id);
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.tutor_id IS DISTINCT FROM NEW.tutor_id THEN
            PERFORM public.recalculate_tutor_stats(OLD.tutor_id);
            PERFORM public.recalculate_tutor_stats(NEW.tutor_id);
        ELSE
            PERFORM public.recalculate_tutor_stats(NEW.tutor_id);
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_tutor_reviews
AFTER INSERT OR UPDATE OR DELETE ON public.tutor_reviews
FOR EACH ROW
EXECUTE FUNCTION public.sync_tutor_review_stats();

-- ------------------------------------------------------------------------------
-- 20. Tutor Application Requests (طلبات انضمام المعلمين - مغلقة أمام المتصفح)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tutor_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_code TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    country_code TEXT NOT NULL,
    phone TEXT NOT NULL,
    track TEXT NOT NULL CHECK (track IN ('school', 'quran')),
    subjects TEXT[] NOT NULL DEFAULT '{}',
    stages TEXT[] NOT NULL DEFAULT '{}',
    curricula TEXT[] NOT NULL DEFAULT '{}',
    quran_age_groups TEXT[] NOT NULL DEFAULT '{}',
    quran_levels TEXT[] NOT NULL DEFAULT '{}',
    experience_years TEXT NOT NULL,
    academic_degree TEXT NOT NULL,
    portfolio_url TEXT,
    terms_accepted BOOLEAN NOT NULL DEFAULT FALSE CHECK (terms_accepted = TRUE),
    status TEXT NOT NULL DEFAULT 'pending_review' 
        CHECK (status IN ('pending_review', 'interview_scheduled', 'approved', 'rejected')),
    admin_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_applications_status ON public.tutor_applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_created ON public.tutor_applications(created_at DESC);

CREATE TRIGGER trg_tutor_applications_updated_at
BEFORE UPDATE ON public.tutor_applications
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

COMMENT ON TABLE public.tutor_applications IS 'سجل طلبات انضمام المعلمين الجدد، معزول ومغلق تماماً أمام استعلامات المتصفح المباشرة';

-- ==============================================================================
-- 21. Enable Row Level Security (RLS) on ALL Tables
-- ==============================================================================
ALTER TABLE public.educational_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.educational_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quran_age_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quran_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_course_options ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tutors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_private_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_methodology_pillars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_trial_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_subjects_taught_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_school_offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_quran_offerings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tutor_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_review_admin_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_applications ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 22. Define RLS Policies
-- ==============================================================================

-- A. Taxonomy Tables & Course Options: Read active records only
CREATE POLICY "Public can view active educational stages"
    ON public.educational_stages FOR SELECT
    TO anon, authenticated
    USING (is_active = true);

CREATE POLICY "Public can view active educational grades"
    ON public.educational_grades FOR SELECT
    TO anon, authenticated
    USING (is_active = true);

CREATE POLICY "Public can view active curriculum types"
    ON public.curriculum_types FOR SELECT
    TO anon, authenticated
    USING (is_active = true);

CREATE POLICY "Public can view active subjects"
    ON public.subjects FOR SELECT
    TO anon, authenticated
    USING (is_active = true);

CREATE POLICY "Public can view active quran age groups"
    ON public.quran_age_groups FOR SELECT
    TO anon, authenticated
    USING (is_active = true);

CREATE POLICY "Public can view active quran levels"
    ON public.quran_levels FOR SELECT
    TO anon, authenticated
    USING (is_active = true);

CREATE POLICY "Public can view active school course options"
    ON public.school_course_options FOR SELECT
    TO anon, authenticated
    USING (is_active = true);

-- B. Public Tutors: Visitors can read ONLY published tutor profiles
CREATE POLICY "Public can view published tutors only"
    ON public.tutors FOR SELECT
    TO anon, authenticated
    USING (is_published = true);

-- C. Tutor Sub-details: Public can read sub-details ONLY for published tutors
CREATE POLICY "Public can view pillars of published tutors"
    ON public.tutor_methodology_pillars FOR SELECT
    TO anon, authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tutors 
            WHERE tutors.id = tutor_methodology_pillars.tutor_id 
              AND tutors.is_published = true
        )
    );

CREATE POLICY "Public can view qualifications of published tutors"
    ON public.tutor_qualifications FOR SELECT
    TO anon, authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tutors 
            WHERE tutors.id = tutor_qualifications.tutor_id 
              AND tutors.is_published = true
        )
    );

CREATE POLICY "Public can view trial steps of published tutors"
    ON public.tutor_trial_steps FOR SELECT
    TO anon, authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tutors 
            WHERE tutors.id = tutor_trial_steps.tutor_id 
              AND tutors.is_published = true
        )
    );

CREATE POLICY "Public can view subjects summary of published tutors"
    ON public.tutor_subjects_taught_summary FOR SELECT
    TO anon, authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tutors 
            WHERE tutors.id = tutor_subjects_taught_summary.tutor_id 
              AND tutors.is_published = true
        )
    );

CREATE POLICY "Public can view school offerings of published tutors"
    ON public.tutor_school_offerings FOR SELECT
    TO anon, authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tutors 
            WHERE tutors.id = tutor_school_offerings.tutor_id 
              AND tutors.is_published = true
        )
    );

CREATE POLICY "Public can view quran offerings of published tutors"
    ON public.tutor_quran_offerings FOR SELECT
    TO anon, authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.tutors 
            WHERE tutors.id = tutor_quran_offerings.tutor_id 
              AND tutors.is_published = true
        )
    );

-- D. Tutor Reviews: Public can ONLY read approved reviews of published tutors
CREATE POLICY "Public can view approved reviews of published tutors"
    ON public.tutor_reviews FOR SELECT
    TO anon, authenticated
    USING (
        status = 'approved' AND EXISTS (
            SELECT 1 FROM public.tutors 
            WHERE tutors.id = tutor_reviews.tutor_id 
              AND tutors.is_published = true
        )
    );

-- E. Private Tables: tutor_private_info, tutor_review_admin_notes, tutor_applications
-- Strictly NO policies for anon / authenticated. Completely locked from direct client query.

-- ==============================================================================
-- 23. Explicit GRANT & REVOKE Security Directives
-- ==============================================================================
-- 1. Revoke default public permissions on all created tables
REVOKE ALL ON public.educational_stages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.educational_grades FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.curriculum_types FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.subjects FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.quran_age_groups FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.quran_levels FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.school_course_options FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.tutors FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.tutor_methodology_pillars FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.tutor_qualifications FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.tutor_trial_steps FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.tutor_subjects_taught_summary FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.tutor_school_offerings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.tutor_quran_offerings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.tutor_reviews FROM PUBLIC, anon, authenticated;

-- Private tables
REVOKE ALL ON public.tutor_private_info FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.tutor_review_admin_notes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.tutor_applications FROM PUBLIC, anon, authenticated;

-- 2. Grant SELECT ONLY to anon and authenticated on public-facing tables (guarded by RLS)
GRANT SELECT ON public.educational_stages TO anon, authenticated;
GRANT SELECT ON public.educational_grades TO anon, authenticated;
GRANT SELECT ON public.curriculum_types TO anon, authenticated;
GRANT SELECT ON public.subjects TO anon, authenticated;
GRANT SELECT ON public.quran_age_groups TO anon, authenticated;
GRANT SELECT ON public.quran_levels TO anon, authenticated;
GRANT SELECT ON public.school_course_options TO anon, authenticated;
GRANT SELECT ON public.tutors TO anon, authenticated;
GRANT SELECT ON public.tutor_methodology_pillars TO anon, authenticated;
GRANT SELECT ON public.tutor_qualifications TO anon, authenticated;
GRANT SELECT ON public.tutor_trial_steps TO anon, authenticated;
GRANT SELECT ON public.tutor_subjects_taught_summary TO anon, authenticated;
GRANT SELECT ON public.tutor_school_offerings TO anon, authenticated;
GRANT SELECT ON public.tutor_quran_offerings TO anon, authenticated;
GRANT SELECT ON public.tutor_reviews TO anon, authenticated;
GRANT SELECT ON public.v_tutor_school_offerings TO anon, authenticated;

-- 3. Grant FULL administrative privileges to service_role for backend server actions
GRANT ALL ON public.educational_stages TO service_role;
GRANT ALL ON public.educational_grades TO service_role;
GRANT ALL ON public.curriculum_types TO service_role;
GRANT ALL ON public.subjects TO service_role;
GRANT ALL ON public.quran_age_groups TO service_role;
GRANT ALL ON public.quran_levels TO service_role;
GRANT ALL ON public.school_course_options TO service_role;
GRANT ALL ON public.tutors TO service_role;
GRANT ALL ON public.tutor_private_info TO service_role;
GRANT ALL ON public.tutor_methodology_pillars TO service_role;
GRANT ALL ON public.tutor_qualifications TO service_role;
GRANT ALL ON public.tutor_trial_steps TO service_role;
GRANT ALL ON public.tutor_subjects_taught_summary TO service_role;
GRANT ALL ON public.tutor_school_offerings TO service_role;
GRANT ALL ON public.tutor_quran_offerings TO service_role;
GRANT ALL ON public.tutor_reviews TO service_role;
GRANT ALL ON public.tutor_review_admin_notes TO service_role;
GRANT ALL ON public.tutor_applications TO service_role;
GRANT ALL ON public.v_tutor_school_offerings TO service_role;

-- ==============================================================================
-- 24. Seed Confirmed Taxonomy Data ONLY (Scope: Arabic & Languages, Youngsters)
-- ==============================================================================

-- 1. Educational Stages
INSERT INTO public.educational_stages (id, name, grades_desc, display_order, is_active)
VALUES
    ('elementary', 'المرحلة الابتدائية', 'الصفوف (١ - ٦ ابتدائي)', 1, TRUE),
    ('preparatory', 'المرحلة الإعدادية / المتوسطة', 'الصفوف (١ - ٣ إعدادي)', 2, TRUE),
    ('secondary', 'المرحلة الثانوية', 'الصفوف (١ - ٣ ثانوي)', 3, TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    grades_desc = EXCLUDED.grades_desc,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active;

-- 2. Educational Grades
INSERT INTO public.educational_grades (id, stage_id, name, display_order, is_active)
VALUES
    -- Elementary
    ('elem_1', 'elementary', 'الصف الأول الابتدائي', 1, TRUE),
    ('elem_2', 'elementary', 'الصف الثاني الابتدائي', 2, TRUE),
    ('elem_3', 'elementary', 'الصف الثالث الابتدائي', 3, TRUE),
    ('elem_4', 'elementary', 'الصف الرابع الابتدائي', 4, TRUE),
    ('elem_5', 'elementary', 'الصف الخامس الابتدائي', 5, TRUE),
    ('elem_6', 'elementary', 'الصف السادس الابتدائي', 6, TRUE),
    -- Preparatory
    ('prep_1', 'preparatory', 'الصف الأول الإعدادي', 1, TRUE),
    ('prep_2', 'preparatory', 'الصف الثاني الإعدادي', 2, TRUE),
    ('prep_3', 'preparatory', 'الصف الثالث الإعدادي', 3, TRUE),
    -- Secondary
    ('sec_1', 'secondary', 'الصف الأول الثانوي', 1, TRUE),
    ('sec_2', 'secondary', 'الصف الثاني الثانوي', 2, TRUE),
    ('sec_3', 'secondary', 'الصف الثالث الثانوي', 3, TRUE)
ON CONFLICT (id) DO UPDATE SET 
    stage_id = EXCLUDED.stage_id,
    name = EXCLUDED.name,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active;

-- 3. Curriculum Types (International is inactive by design for launch scope)
INSERT INTO public.curriculum_types (id, name, description, display_order, is_active)
VALUES
    ('national_arabic', 'عربي (حكومي / أهلي)', 'المنهج الوزاري العام والمدارس الحكومية والأهلية باللغة العربية', 1, TRUE),
    ('languages_experimental', 'لغات / تجريبي (Languages)', 'مدارس اللغات والمدارس التجريبية الرسمية والمتميزة', 2, TRUE),
    ('international', 'مناهج دولية (IGCSE / SAT)', 'النظام البريطاني والأمريكي والبرامج الدولية', 3, FALSE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active;

-- 4. Subjects
INSERT INTO public.subjects (id, name, english_name, category, display_order, is_active)
VALUES
    ('math', 'الرياضيات (Math)', 'Mathematics', 'core', 1, TRUE),
    ('science', 'العلوم (Science)', 'General Science', 'sciences', 2, TRUE),
    ('physics', 'الفيزياء (Physics)', 'Physics', 'sciences', 3, TRUE),
    ('chemistry', 'الكيمياء (Chemistry)', 'Chemistry', 'sciences', 4, TRUE),
    ('biology', 'الأحياء (Biology)', 'Biology', 'sciences', 5, TRUE),
    ('english', 'اللغة الإنجليزية', 'English Language', 'languages', 6, TRUE),
    ('arabic', 'اللغة العربية', 'Arabic Language', 'languages', 7, TRUE),
    ('social', 'الدراسات الاجتماعية', 'Social Studies', 'social', 8, TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    english_name = EXCLUDED.english_name,
    category = EXCLUDED.category,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active;

-- 5. Quran Age Groups (Adults track is inactive by design for launch scope)
INSERT INTO public.quran_age_groups (id, name, age_range, display_order, is_active)
VALUES
    ('age_4_7', 'أطفال وبراعم', '٤ - ٧ سنوات', 1, TRUE),
    ('age_8_12', 'ناشئة وطلاب', '٨ - ١٢ سنة', 2, TRUE),
    ('age_13_18', 'يافعون وشباب', '١٣ - ١٨ سنة', 3, TRUE),
    ('age_adults', 'كبار ومحو أمية', '١٩ سنة فما فوق', 4, FALSE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    age_range = EXCLUDED.age_range,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active;

-- 6. Quran Levels
INSERT INTO public.quran_levels (id, name, description, display_order, is_active)
VALUES
    ('noor_bayan', 'تأسيس نور البيان والقراءة العربية', 'تعليم مخارج الحروف والتهجي السليم من الصفر وتحسين نطق الكلمات', 1, TRUE),
    ('hifz_tilawa', 'حفظ وتلقين القرآن الكريم ومراجعته', 'تحفيظ منتظم مع المتابعة المستمرة وتثبيت السور للأطفال والناشئة', 2, TRUE),
    ('tajweed_rules', 'أحكام التجويد والإتقان برواية حفص', 'دراسة وتطبيق أحكام النون والميم والمدود ومخارج وصفات الحروف', 3, TRUE),
    ('khatt_imlaa', 'تحسين الخط العربي وقواعد الإملاء', 'ضبط قواعد الكتابة الصحيحة وتفادي الأخطاء الإملائية الشائعة', 4, TRUE)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active;

COMMIT;
