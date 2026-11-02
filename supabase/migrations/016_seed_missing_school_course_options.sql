-- ============================================================================
-- Shatir Classes (شاطر كلاسيز)
-- Migration 016: Complete Approved School Course Options Catalog & Arabic Validation Names
-- ============================================================================
-- Purpose:
--   1. Ensure distinct English-taught STEM subjects ('math_en', 'science_en',
--      'physics_en', 'chemistry_en', 'biology_en') exist in public.subjects
--      separately from Arabic-taught subjects ('math', 'science', 'physics',
--      'chemistry', 'biology') using ON CONFLICT (id) DO NOTHING.
--   2. Seed missing pedagogically valid school_course_options combinations
--      using an explicit VALUES (...) catalog (120 canonical combinations:
--      60 for 'national_arabic' and 60 for 'languages_experimental'),
--      including Secondary Arabic Math & Physics ('sec_1'..'sec_3' + 'math'/'physics'
--      + 'national_arabic').
--   3. Preserve all existing IDs and records via ON CONFLICT (grade_id, subject_id, curriculum_id) DO NOTHING,
--      and never re-enable any disabled record (is_active = FALSE, such as 'international' or 'age_adults').
--   4. Update resolve_and_validate_school_specializations to format subject names
--      with clear Arabic labels in validation messages without re-executing Migration 015.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Seed Missing English-Taught STEM Subjects in public.subjects
--    Preserves existing rows and never overwrites or re-enables disabled rows.
-- ============================================================================
INSERT INTO public.subjects (id, name, english_name, category, display_order, is_active)
VALUES
  ('math_en', 'Math — الرياضيات باللغة الإنجليزية', 'Math (English)', 'core', 8, TRUE),
  ('science_en', 'Science — العلوم باللغة الإنجليزية', 'Science (English)', 'sciences', 9, TRUE),
  ('physics_en', 'Physics — الفيزياء باللغة الإنجليزية', 'Physics (English)', 'sciences', 10, TRUE),
  ('chemistry_en', 'Chemistry — الكيمياء باللغة الإنجليزية', 'Chemistry (English)', 'sciences', 11, TRUE),
  ('biology_en', 'Biology — الأحياء باللغة الإنجليزية', 'Biology (English)', 'sciences', 12, TRUE)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. Seed Missing Approved Combinations in public.school_course_options
--    Explicitly lists the 120 pedagogically valid combinations supported by Shatir:
--      - Elementary Grades 1–3 (elem_1..3):
--          * national_arabic:        arabic, english, math (9)
--          * languages_experimental: arabic, english, math_en (9)
--      - Elementary Grades 4–6 (elem_4..6):
--          * national_arabic:        arabic, english, math, science, social (15)
--          * languages_experimental: arabic, english, math_en, science_en, social (15)
--      - Preparatory Grades 1–3 (prep_1..3):
--          * national_arabic:        arabic, english, math, science, social (15)
--          * languages_experimental: arabic, english, math_en, science_en, social (15)
--      - Secondary Grades 1–3 (sec_1..3):
--          * national_arabic:        arabic, english, math, physics, chemistry, biology, social (21)
--          * languages_experimental: arabic, english, math_en, physics_en, chemistry_en, biology_en, social (21)
--    Uses ON CONFLICT (grade_id, subject_id, curriculum_id) DO NOTHING so existing
--    UUIDs and any intentionally disabled rows (is_active = FALSE) are never modified.
-- ============================================================================
INSERT INTO public.school_course_options (grade_id, subject_id, curriculum_id, is_active)
SELECT
  v.grade_id,
  v.subject_id,
  v.curriculum_id,
  TRUE
FROM (
  VALUES
    -- ========================================================================
    -- A. المنهج العربي (حكومي / أهلي) — national_arabic (60 تركيبة معتمدة)
    -- ========================================================================

    -- المرحلة الابتدائية (الصفوف ١–٣): اللغة العربية، اللغة الإنجليزية، الرياضيات (9 تركيبات)
    ('elem_1', 'arabic', 'national_arabic'),
    ('elem_2', 'arabic', 'national_arabic'),
    ('elem_3', 'arabic', 'national_arabic'),
    ('elem_1', 'english', 'national_arabic'),
    ('elem_2', 'english', 'national_arabic'),
    ('elem_3', 'english', 'national_arabic'),
    ('elem_1', 'math', 'national_arabic'),
    ('elem_2', 'math', 'national_arabic'),
    ('elem_3', 'math', 'national_arabic'),

    -- المرحلة الابتدائية (الصفوف ٤–٦): اللغة العربية، اللغة الإنجليزية، الرياضيات، العلوم، الدراسات الاجتماعية (15 تركيبة)
    ('elem_4', 'arabic', 'national_arabic'),
    ('elem_5', 'arabic', 'national_arabic'),
    ('elem_6', 'arabic', 'national_arabic'),
    ('elem_4', 'english', 'national_arabic'),
    ('elem_5', 'english', 'national_arabic'),
    ('elem_6', 'english', 'national_arabic'),
    ('elem_4', 'math', 'national_arabic'),
    ('elem_5', 'math', 'national_arabic'),
    ('elem_6', 'math', 'national_arabic'),
    ('elem_4', 'science', 'national_arabic'),
    ('elem_5', 'science', 'national_arabic'),
    ('elem_6', 'science', 'national_arabic'),
    ('elem_4', 'social', 'national_arabic'),
    ('elem_5', 'social', 'national_arabic'),
    ('elem_6', 'social', 'national_arabic'),

    -- المرحلة الإعدادية / المتوسطة (الصفوف ١–٣): اللغة العربية، اللغة الإنجليزية، الرياضيات، العلوم، الدراسات الاجتماعية (15 تركيبة)
    ('prep_1', 'arabic', 'national_arabic'),
    ('prep_2', 'arabic', 'national_arabic'),
    ('prep_3', 'arabic', 'national_arabic'),
    ('prep_1', 'english', 'national_arabic'),
    ('prep_2', 'english', 'national_arabic'),
    ('prep_3', 'english', 'national_arabic'),
    ('prep_1', 'math', 'national_arabic'),
    ('prep_2', 'math', 'national_arabic'),
    ('prep_3', 'math', 'national_arabic'),
    ('prep_1', 'science', 'national_arabic'),
    ('prep_2', 'science', 'national_arabic'),
    ('prep_3', 'science', 'national_arabic'),
    ('prep_1', 'social', 'national_arabic'),
    ('prep_2', 'social', 'national_arabic'),
    ('prep_3', 'social', 'national_arabic'),

    -- المرحلة الثانوية (الصفوف ١–٣): اللغة العربية، اللغة الإنجليزية، الرياضيات، الفيزياء، الكيمياء، الأحياء، الدراسات الاجتماعية (21 تركيبة)
    ('sec_1', 'arabic', 'national_arabic'),
    ('sec_2', 'arabic', 'national_arabic'),
    ('sec_3', 'arabic', 'national_arabic'),
    ('sec_1', 'english', 'national_arabic'),
    ('sec_2', 'english', 'national_arabic'),
    ('sec_3', 'english', 'national_arabic'),
    ('sec_1', 'math', 'national_arabic'),
    ('sec_2', 'math', 'national_arabic'),
    ('sec_3', 'math', 'national_arabic'),
    ('sec_1', 'physics', 'national_arabic'),
    ('sec_2', 'physics', 'national_arabic'),
    ('sec_3', 'physics', 'national_arabic'),
    ('sec_1', 'chemistry', 'national_arabic'),
    ('sec_2', 'chemistry', 'national_arabic'),
    ('sec_3', 'chemistry', 'national_arabic'),
    ('sec_1', 'biology', 'national_arabic'),
    ('sec_2', 'biology', 'national_arabic'),
    ('sec_3', 'biology', 'national_arabic'),
    ('sec_1', 'social', 'national_arabic'),
    ('sec_2', 'social', 'national_arabic'),
    ('sec_3', 'social', 'national_arabic'),

    -- ========================================================================
    -- B. منهج اللغات / التجريبي — languages_experimental (60 تركيبة معتمدة)
    -- ========================================================================

    -- المرحلة الابتدائية (الصفوف ١–٣): اللغة العربية، اللغة الإنجليزية، Math بالإنجليزية (9 تركيبات)
    ('elem_1', 'arabic', 'languages_experimental'),
    ('elem_2', 'arabic', 'languages_experimental'),
    ('elem_3', 'arabic', 'languages_experimental'),
    ('elem_1', 'english', 'languages_experimental'),
    ('elem_2', 'english', 'languages_experimental'),
    ('elem_3', 'english', 'languages_experimental'),
    ('elem_1', 'math_en', 'languages_experimental'),
    ('elem_2', 'math_en', 'languages_experimental'),
    ('elem_3', 'math_en', 'languages_experimental'),

    -- المرحلة الابتدائية (الصفوف ٤–٦): اللغة العربية، اللغة الإنجليزية، Math بالإنجليزية، Science بالإنجليزية، الدراسات الاجتماعية (15 تركيبة)
    ('elem_4', 'arabic', 'languages_experimental'),
    ('elem_5', 'arabic', 'languages_experimental'),
    ('elem_6', 'arabic', 'languages_experimental'),
    ('elem_4', 'english', 'languages_experimental'),
    ('elem_5', 'english', 'languages_experimental'),
    ('elem_6', 'english', 'languages_experimental'),
    ('elem_4', 'math_en', 'languages_experimental'),
    ('elem_5', 'math_en', 'languages_experimental'),
    ('elem_6', 'math_en', 'languages_experimental'),
    ('elem_4', 'science_en', 'languages_experimental'),
    ('elem_5', 'science_en', 'languages_experimental'),
    ('elem_6', 'science_en', 'languages_experimental'),
    ('elem_4', 'social', 'languages_experimental'),
    ('elem_5', 'social', 'languages_experimental'),
    ('elem_6', 'social', 'languages_experimental'),

    -- المرحلة الإعدادية / المتوسطة (الصفوف ١–٣): اللغة العربية، اللغة الإنجليزية، Math بالإنجليزية، Science بالإنجليزية، الدراسات الاجتماعية (15 تركيبة)
    ('prep_1', 'arabic', 'languages_experimental'),
    ('prep_2', 'arabic', 'languages_experimental'),
    ('prep_3', 'arabic', 'languages_experimental'),
    ('prep_1', 'english', 'languages_experimental'),
    ('prep_2', 'english', 'languages_experimental'),
    ('prep_3', 'english', 'languages_experimental'),
    ('prep_1', 'math_en', 'languages_experimental'),
    ('prep_2', 'math_en', 'languages_experimental'),
    ('prep_3', 'math_en', 'languages_experimental'),
    ('prep_1', 'science_en', 'languages_experimental'),
    ('prep_2', 'science_en', 'languages_experimental'),
    ('prep_3', 'science_en', 'languages_experimental'),
    ('prep_1', 'social', 'languages_experimental'),
    ('prep_2', 'social', 'languages_experimental'),
    ('prep_3', 'social', 'languages_experimental'),

    -- المرحلة الثانوية (الصفوف ١–٣): اللغة العربية، اللغة الإنجليزية، Math بالإنجليزية، Physics بالإنجليزية، Chemistry بالإنجليزية، Biology بالإنجليزية، الدراسات الاجتماعية (21 تركيبة)
    ('sec_1', 'arabic', 'languages_experimental'),
    ('sec_2', 'arabic', 'languages_experimental'),
    ('sec_3', 'arabic', 'languages_experimental'),
    ('sec_1', 'english', 'languages_experimental'),
    ('sec_2', 'english', 'languages_experimental'),
    ('sec_3', 'english', 'languages_experimental'),
    ('sec_1', 'math_en', 'languages_experimental'),
    ('sec_2', 'math_en', 'languages_experimental'),
    ('sec_3', 'math_en', 'languages_experimental'),
    ('sec_1', 'physics_en', 'languages_experimental'),
    ('sec_2', 'physics_en', 'languages_experimental'),
    ('sec_3', 'physics_en', 'languages_experimental'),
    ('sec_1', 'chemistry_en', 'languages_experimental'),
    ('sec_2', 'chemistry_en', 'languages_experimental'),
    ('sec_3', 'chemistry_en', 'languages_experimental'),
    ('sec_1', 'biology_en', 'languages_experimental'),
    ('sec_2', 'biology_en', 'languages_experimental'),
    ('sec_3', 'biology_en', 'languages_experimental'),
    ('sec_1', 'social', 'languages_experimental'),
    ('sec_2', 'social', 'languages_experimental'),
    ('sec_3', 'social', 'languages_experimental')
) AS v(grade_id, subject_id, curriculum_id)
INNER JOIN public.educational_grades eg
  ON eg.id = v.grade_id AND eg.is_active = TRUE
INNER JOIN public.educational_stages es
  ON es.id = eg.stage_id AND es.is_active = TRUE
INNER JOIN public.subjects s
  ON s.id = v.subject_id AND s.is_active = TRUE
INNER JOIN public.curriculum_types ct
  ON ct.id = v.curriculum_id AND ct.is_active = TRUE
ON CONFLICT (grade_id, subject_id, curriculum_id) DO NOTHING;

-- ============================================================================
-- 3. Update resolve_and_validate_school_specializations so validation messages
--    use clear Arabic subject names (e.g. «الرياضيات — تدريس بالعربية» instead of
--    «الرياضيات (Math)») while preserving all draft selections and language rules.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.resolve_and_validate_school_specializations(
  p_specs JSONB,
  p_direct_option_ids UUID[] DEFAULT '{}'::UUID[]
)
RETURNS TABLE (
  is_valid BOOLEAN,
  course_option_ids UUID[],
  normalized_specs JSONB,
  subjects TEXT[],
  stages TEXT[],
  curricula TEXT[],
  unmatched_errors TEXT[]
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_opt_id UUID;
  v_opt_rec RECORD;
  v_spec JSONB;
  v_spec_idx INTEGER := 0;
  v_direct_co_text TEXT;
  v_direct_co_uuid UUID;
  v_raw_subj TEXT;
  v_resolved_subj TEXT;
  v_raw_lang TEXT;
  v_expected_lang TEXT;
  v_raw_stage TEXT;
  v_raw_curr TEXT;
  v_grade_id TEXT;
  v_grade_count INTEGER;
  v_item_has_error BOOLEAN;
  v_subj_rec RECORD;
  v_subj_display_name TEXT;
  v_stage_rec RECORD;
  v_curr_rec RECORD;
  v_grade_rec RECORD;
  v_matched_co_id UUID;
  v_matched_ids UUID[] := '{}'::UUID[];
  v_norm_specs JSONB := '[]'::JSONB;
  v_subjects TEXT[] := '{}'::TEXT[];
  v_stages TEXT[] := '{}'::TEXT[];
  v_curricula TEXT[] := '{}'::TEXT[];
  v_errors TEXT[] := '{}'::TEXT[];
BEGIN
  -- A. Validate any direct school_course_option_ids passed explicitly
  IF p_direct_option_ids IS NOT NULL AND cardinality(p_direct_option_ids) > 0 THEN
    FOREACH v_opt_id IN ARRAY p_direct_option_ids
    LOOP
      IF v_opt_id IS NULL THEN
        CONTINUE;
      END IF;

      SELECT
        sco.id,
        sco.is_active AS sco_active,
        sco.subject_id,
        s.is_active AS subj_active,
        sco.grade_id,
        eg.is_active AS grade_active,
        eg.stage_id,
        es.is_active AS stage_active,
        sco.curriculum_id,
        ct.is_active AS curr_active
      INTO v_opt_rec
      FROM public.school_course_options sco
      LEFT JOIN public.subjects s ON s.id = sco.subject_id
      LEFT JOIN public.educational_grades eg ON eg.id = sco.grade_id
      LEFT JOIN public.educational_stages es ON es.id = eg.stage_id
      LEFT JOIN public.curriculum_types ct ON ct.id = sco.curriculum_id
      WHERE sco.id = v_opt_id;

      IF v_opt_rec.id IS NULL THEN
        v_errors := array_append(
          v_errors,
          FORMAT('معرف خيار المقرر (%s) غير موجود في جدول خيارات المقررات المعتمدة.', v_opt_id::TEXT)
        );
      ELSIF NOT (
        COALESCE(v_opt_rec.sco_active, FALSE)
        AND COALESCE(v_opt_rec.subj_active, FALSE)
        AND COALESCE(v_opt_rec.grade_active, FALSE)
        AND COALESCE(v_opt_rec.stage_active, FALSE)
        AND COALESCE(v_opt_rec.curr_active, FALSE)
      ) THEN
        v_errors := array_append(
          v_errors,
          FORMAT('خيار المقرر (%s) أو أحد عناصره المرجعية غير مفعّل حالياً.', v_opt_id::TEXT)
        );
      ELSE
        IF NOT (v_opt_rec.id = ANY(v_matched_ids)) THEN
          v_matched_ids := array_append(v_matched_ids, v_opt_rec.id);
        END IF;
        IF NOT (v_opt_rec.subject_id = ANY(v_subjects)) THEN
          v_subjects := array_append(v_subjects, v_opt_rec.subject_id);
        END IF;
        IF NOT (v_opt_rec.stage_id = ANY(v_stages)) THEN
          v_stages := array_append(v_stages, v_opt_rec.stage_id);
        END IF;
        IF NOT (v_opt_rec.curriculum_id = ANY(v_curricula)) THEN
          v_curricula := array_append(v_curricula, v_opt_rec.curriculum_id);
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- B. Validate each structured specialization item in p_specs
  --    Every item in p_specs is preserved in v_norm_specs (never silently dropped).
  IF p_specs IS NOT NULL AND jsonb_typeof(p_specs) = 'array' AND jsonb_array_length(p_specs) > 0 THEN
    FOR v_spec IN SELECT value FROM jsonb_array_elements(p_specs)
    LOOP
      v_spec_idx := v_spec_idx + 1;
      v_item_has_error := FALSE;

      IF v_spec IS NULL OR jsonb_typeof(v_spec) <> 'object' THEN
        v_errors := array_append(
          v_errors,
          FORMAT('التخصص الدراسي رقم (%s): بنية بيانات التخصص غير صالحة.', v_spec_idx)
        );
        v_norm_specs := v_norm_specs || jsonb_build_array(v_spec);
        CONTINUE;
      END IF;

      -- Check if item specifies a direct courseOptionId
      v_direct_co_text := NULLIF(BTRIM(COALESCE(v_spec->>'courseOptionId', '')), '');
      IF v_direct_co_text IS NOT NULL THEN
        BEGIN
          v_direct_co_uuid := v_direct_co_text::UUID;
        EXCEPTION WHEN OTHERS THEN
          v_direct_co_uuid := NULL;
        END;

        IF v_direct_co_uuid IS NULL THEN
          v_errors := array_append(
            v_errors,
            FORMAT('التخصص الدراسي رقم (%s): معرف خيار المقرر (%s) ليس بصيغة UUID صحيحة.', v_spec_idx, v_direct_co_text)
          );
          v_norm_specs := v_norm_specs || jsonb_build_array(v_spec);
          CONTINUE;
        END IF;

        SELECT
          sco.id,
          sco.is_active AS sco_active,
          sco.subject_id,
          s.is_active AS subj_active,
          sco.grade_id,
          eg.is_active AS grade_active,
          eg.stage_id,
          es.is_active AS stage_active,
          sco.curriculum_id,
          ct.is_active AS curr_active
        INTO v_opt_rec
        FROM public.school_course_options sco
        LEFT JOIN public.subjects s ON s.id = sco.subject_id
        LEFT JOIN public.educational_grades eg ON eg.id = sco.grade_id
        LEFT JOIN public.educational_stages es ON es.id = eg.stage_id
        LEFT JOIN public.curriculum_types ct ON ct.id = sco.curriculum_id
        WHERE sco.id = v_direct_co_uuid;

        IF v_opt_rec.id IS NULL THEN
          v_errors := array_append(
            v_errors,
            FORMAT('التخصص الدراسي رقم (%s): معرف خيار المقرر (%s) غير موجود في قاعدة البيانات.', v_spec_idx, v_direct_co_text)
          );
        ELSIF NOT (
          COALESCE(v_opt_rec.sco_active, FALSE)
          AND COALESCE(v_opt_rec.subj_active, FALSE)
          AND COALESCE(v_opt_rec.grade_active, FALSE)
          AND COALESCE(v_opt_rec.stage_active, FALSE)
          AND COALESCE(v_opt_rec.curr_active, FALSE)
        ) THEN
          v_errors := array_append(
            v_errors,
            FORMAT('التخصص الدراسي رقم (%s): خيار المقرر (%s) غير مفعّل حالياً.', v_spec_idx, v_direct_co_text)
          );
        ELSE
          IF NOT (v_opt_rec.id = ANY(v_matched_ids)) THEN
            v_matched_ids := array_append(v_matched_ids, v_opt_rec.id);
          END IF;
          IF NOT (v_opt_rec.subject_id = ANY(v_subjects)) THEN
            v_subjects := array_append(v_subjects, v_opt_rec.subject_id);
          END IF;
          IF NOT (v_opt_rec.stage_id = ANY(v_stages)) THEN
            v_stages := array_append(v_stages, v_opt_rec.stage_id);
          END IF;
          IF NOT (v_opt_rec.curriculum_id = ANY(v_curricula)) THEN
            v_curricula := array_append(v_curricula, v_opt_rec.curriculum_id);
          END IF;
        END IF;

        v_norm_specs := v_norm_specs || jsonb_build_array(v_spec);
        CONTINUE;
      END IF;

      -- Structured specialization fields
      v_raw_subj := BTRIM(COALESCE(v_spec->>'subjectId', ''));
      v_raw_lang := LOWER(BTRIM(COALESCE(v_spec->>'teachingLanguage', '')));
      v_raw_stage := BTRIM(COALESCE(v_spec->>'stageId', ''));
      v_raw_curr := BTRIM(COALESCE(
        NULLIF(BTRIM(COALESCE(v_spec->>'curriculumType', '')), ''),
        NULLIF(BTRIM(COALESCE(v_spec->>'curriculumId', '')), ''),
        NULLIF(BTRIM(COALESCE(v_spec->>'curriculumTypeId', '')), ''),
        ''
      ));

      IF v_raw_subj = '' THEN
        v_errors := array_append(
          v_errors,
          FORMAT('التخصص الدراسي رقم (%s): لم يتم تحديد المادة الدراسية.', v_spec_idx)
        );
        v_norm_specs := v_norm_specs || jsonb_build_array(v_spec);
        CONTINUE;
      END IF;

      -- Expected teaching language check (never merge math_en with math!)
      v_expected_lang := CASE
        WHEN v_raw_subj IN ('math_en', 'science_en', 'physics_en', 'chemistry_en', 'biology_en', 'english') THEN 'english'
        WHEN v_raw_subj IN ('math', 'math_ar', 'science', 'science_ar', 'physics', 'physics_ar', 'chemistry', 'chemistry_ar', 'biology', 'biology_ar', 'arabic', 'social') THEN 'arabic'
        ELSE ''
      END;

      IF v_raw_lang <> '' AND v_raw_lang NOT IN ('arabic', 'english') THEN
        v_errors := array_append(
          v_errors,
          FORMAT('التخصص الدراسي رقم (%s): لغة التدريس (%s) غير صالحة للمادة (%s).', v_spec_idx, v_raw_lang, v_raw_subj)
        );
        v_norm_specs := v_norm_specs || jsonb_build_array(v_spec);
        CONTINUE;
      END IF;

      IF v_expected_lang <> '' AND v_raw_lang <> '' AND v_raw_lang <> v_expected_lang THEN
        v_errors := array_append(
          v_errors,
          FORMAT('التخصص الدراسي رقم (%s): تعارض بين المادة المختارة (%s) ولغة التدريس (%s).', v_spec_idx, v_raw_subj, v_raw_lang)
        );
        v_norm_specs := v_norm_specs || jsonb_build_array(v_spec);
        CONTINUE;
      END IF;

      -- Resolve subject against public.subjects:
      -- 1) Direct exact match in public.subjects first
      SELECT id, name, is_active INTO v_subj_rec
      FROM public.subjects
      WHERE id = v_raw_subj;

      -- 2) Explicit Arabic form key mapping ONLY for Arabic-taught form aliases when not directly present in public.subjects
      -- Note: 'math_en', 'science_en', 'physics_en', 'chemistry_en', 'biology_en' are NEVER mapped to 'math', 'science', etc.!
      IF v_subj_rec.id IS NULL AND COALESCE(v_raw_lang, 'arabic') <> 'english' THEN
        v_resolved_subj := CASE v_raw_subj
          WHEN 'math_ar' THEN 'math'
          WHEN 'science_ar' THEN 'science'
          WHEN 'physics_ar' THEN 'physics'
          WHEN 'chemistry_ar' THEN 'chemistry'
          WHEN 'biology_ar' THEN 'biology'
          ELSE NULL
        END;

        IF v_resolved_subj IS NOT NULL THEN
          SELECT id, name, is_active INTO v_subj_rec
          FROM public.subjects
          WHERE id = v_resolved_subj;
        END IF;
      END IF;

      IF v_subj_rec.id IS NULL THEN
        v_errors := array_append(
          v_errors,
          FORMAT('التخصص الدراسي رقم (%s): المادة (%s) غير موجودة في جدول المواد المرجعية المعتمدة.', v_spec_idx, v_raw_subj)
        );
        v_norm_specs := v_norm_specs || jsonb_build_array(v_spec);
        CONTINUE;
      END IF;

      v_subj_display_name := CASE v_subj_rec.id
        WHEN 'math' THEN 'الرياضيات — تدريس بالعربية'
        WHEN 'math_en' THEN 'Math — الرياضيات باللغة الإنجليزية'
        WHEN 'science' THEN 'العلوم — تدريس بالعربية'
        WHEN 'science_en' THEN 'Science — العلوم باللغة الإنجليزية'
        WHEN 'physics' THEN 'الفيزياء — تدريس بالعربية'
        WHEN 'physics_en' THEN 'Physics — الفيزياء باللغة الإنجليزية'
        WHEN 'chemistry' THEN 'الكيمياء — تدريس بالعربية'
        WHEN 'chemistry_en' THEN 'Chemistry — الكيمياء باللغة الإنجليزية'
        WHEN 'biology' THEN 'الأحياء — تدريس بالعربية'
        WHEN 'biology_en' THEN 'Biology — الأحياء باللغة الإنجليزية'
        WHEN 'arabic' THEN 'اللغة العربية'
        WHEN 'english' THEN 'اللغة الإنجليزية (English)'
        WHEN 'social' THEN 'الدراسات الاجتماعية'
        ELSE COALESCE(NULLIF(BTRIM(REGEXP_REPLACE(v_subj_rec.name, '\s*\([A-Za-z\s]+\)\s*$', '')), ''), v_subj_rec.name)
      END;

      IF NOT COALESCE(v_subj_rec.is_active, FALSE) THEN
        v_errors := array_append(
          v_errors,
          FORMAT('التخصص الدراسي رقم (%s): المادة (%s) غير مفعّلة حالياً.', v_spec_idx, v_subj_display_name)
        );
        v_norm_specs := v_norm_specs || jsonb_build_array(v_spec);
        CONTINUE;
      END IF;

      -- Validate stage
      IF v_raw_stage = '' THEN
        v_errors := array_append(
          v_errors,
          FORMAT('التخصص الدراسي رقم (%s) (%s): لم يتم تحديد المرحلة الدراسية.', v_spec_idx, v_subj_display_name)
        );
        v_norm_specs := v_norm_specs || jsonb_build_array(v_spec);
        CONTINUE;
      END IF;

      SELECT id, name, is_active INTO v_stage_rec
      FROM public.educational_stages
      WHERE id = v_raw_stage;

      IF v_stage_rec.id IS NULL THEN
        v_errors := array_append(
          v_errors,
          FORMAT('التخصص الدراسي رقم (%s) (%s): المرحلة الدراسية (%s) غير موجودة في جدول المراحل المرجعية.', v_spec_idx, v_subj_display_name, v_raw_stage)
        );
        v_norm_specs := v_norm_specs || jsonb_build_array(v_spec);
        CONTINUE;
      END IF;

      IF NOT COALESCE(v_stage_rec.is_active, FALSE) THEN
        v_errors := array_append(
          v_errors,
          FORMAT('التخصص الدراسي رقم (%s) (%s): المرحلة الدراسية (%s) غير مفعّلة حالياً.', v_spec_idx, v_subj_display_name, v_stage_rec.name)
        );
        v_norm_specs := v_norm_specs || jsonb_build_array(v_spec);
        CONTINUE;
      END IF;

      -- Validate curriculum
      IF v_raw_curr = '' THEN
        v_errors := array_append(
          v_errors,
          FORMAT('التخصص الدراسي رقم (%s) (%s): لم يتم تحديد نوع المنهج الدراسي.', v_spec_idx, v_subj_display_name)
        );
        v_norm_specs := v_norm_specs || jsonb_build_array(v_spec);
        CONTINUE;
      END IF;

      SELECT id, name, is_active INTO v_curr_rec
      FROM public.curriculum_types
      WHERE id = v_raw_curr;

      IF v_curr_rec.id IS NULL THEN
        v_errors := array_append(
          v_errors,
          FORMAT('التخصص الدراسي رقم (%s) (%s): نوع المنهج (%s) غير موجود في جدول المناهج المرجعية.', v_spec_idx, v_subj_display_name, v_raw_curr)
        );
        v_norm_specs := v_norm_specs || jsonb_build_array(v_spec);
        CONTINUE;
      END IF;

      IF NOT COALESCE(v_curr_rec.is_active, FALSE) THEN
        v_errors := array_append(
          v_errors,
          FORMAT('التخصص الدراسي رقم (%s) (%s): نوع المنهج (%s) غير مفعّل حالياً.', v_spec_idx, v_subj_display_name, v_curr_rec.name)
        );
        v_norm_specs := v_norm_specs || jsonb_build_array(v_spec);
        CONTINUE;
      END IF;

      -- Validate grades list
      IF NOT (v_spec ? 'gradeIds') OR jsonb_typeof(v_spec->'gradeIds') <> 'array' OR jsonb_array_length(v_spec->'gradeIds') = 0 THEN
        v_errors := array_append(
          v_errors,
          FORMAT('التخصص الدراسي رقم (%s) (%s): يجب اختيار صف دراسي واحد على الأقل.', v_spec_idx, v_subj_display_name)
        );
        v_norm_specs := v_norm_specs || jsonb_build_array(v_spec);
        CONTINUE;
      END IF;

      v_grade_count := 0;
      FOR v_grade_id IN SELECT jsonb_array_elements_text(v_spec->'gradeIds')
      LOOP
        v_grade_id := BTRIM(COALESCE(v_grade_id, ''));
        IF v_grade_id = '' THEN
          v_errors := array_append(
            v_errors,
            FORMAT('التخصص الدراسي رقم (%s) (%s): يحتوي على معرف صف دراسي فارغ.', v_spec_idx, v_subj_display_name)
          );
          v_item_has_error := TRUE;
          CONTINUE;
        END IF;

        SELECT id, stage_id, name, is_active INTO v_grade_rec
        FROM public.educational_grades
        WHERE id = v_grade_id;

        IF v_grade_rec.id IS NULL THEN
          v_errors := array_append(
            v_errors,
            FORMAT('التخصص الدراسي رقم (%s) (%s): الصف الدراسي (%s) غير موجود في جدول الصفوف المرجعية.', v_spec_idx, v_subj_display_name, v_grade_id)
          );
          v_item_has_error := TRUE;
          CONTINUE;
        END IF;

        IF NOT COALESCE(v_grade_rec.is_active, FALSE) THEN
          v_errors := array_append(
            v_errors,
            FORMAT('التخصص الدراسي رقم (%s) (%s): الصف الدراسي (%s) غير مفعّل حالياً.', v_spec_idx, v_subj_display_name, v_grade_rec.name)
          );
          v_item_has_error := TRUE;
          CONTINUE;
        END IF;

        IF v_grade_rec.stage_id <> v_stage_rec.id THEN
          v_errors := array_append(
            v_errors,
            FORMAT('التخصص الدراسي رقم (%s) (%s): الصف الدراسي (%s) لا يتبع المرحلة المختارة (%s).', v_spec_idx, v_subj_display_name, v_grade_rec.name, v_stage_rec.name)
          );
          v_item_has_error := TRUE;
          CONTINUE;
        END IF;

        -- Match exact active school_course_options record
        SELECT sco.id, sco.is_active INTO v_opt_rec
        FROM public.school_course_options sco
        WHERE sco.grade_id = v_grade_rec.id
          AND sco.subject_id = v_subj_rec.id
          AND sco.curriculum_id = v_curr_rec.id;

        IF v_opt_rec.id IS NULL THEN
          v_errors := array_append(
            v_errors,
            FORMAT('التخصص الدراسي رقم (%s): لا يوجد خيار مقرر معتمد للتركيبة (المادة: %s، الصف: %s، المنهج: %s).', v_spec_idx, v_subj_display_name, v_grade_rec.name, v_curr_rec.name)
          );
          v_item_has_error := TRUE;
          CONTINUE;
        END IF;

        IF NOT COALESCE(v_opt_rec.is_active, FALSE) THEN
          v_errors := array_append(
            v_errors,
            FORMAT('التخصص الدراسي رقم (%s): خيار المقرر (المادة: %s، الصف: %s، المنهج: %s) غير مفعّل حالياً.', v_spec_idx, v_subj_display_name, v_grade_rec.name, v_curr_rec.name)
          );
          v_item_has_error := TRUE;
          CONTINUE;
        END IF;

        v_matched_co_id := v_opt_rec.id;
        v_grade_count := v_grade_count + 1;

        IF NOT (v_matched_co_id = ANY(v_matched_ids)) THEN
          v_matched_ids := array_append(v_matched_ids, v_matched_co_id);
        END IF;
      END LOOP;

      IF v_grade_count > 0 THEN
        IF NOT (v_subj_rec.id = ANY(v_subjects)) THEN
          v_subjects := array_append(v_subjects, v_subj_rec.id);
        END IF;
        IF NOT (v_stage_rec.id = ANY(v_stages)) THEN
          v_stages := array_append(v_stages, v_stage_rec.id);
        END IF;
        IF NOT (v_curr_rec.id = ANY(v_curricula)) THEN
          v_curricula := array_append(v_curricula, v_curr_rec.id);
        END IF;
      END IF;

      -- If this item had any invalid/unmatched grade, preserve the raw v_spec as-is;
      -- otherwise store the canonical normalized spec object.
      IF v_item_has_error OR v_grade_count = 0 THEN
        v_norm_specs := v_norm_specs || jsonb_build_array(v_spec);
      ELSE
        v_norm_specs := v_norm_specs || jsonb_build_array(
          v_spec || jsonb_build_object(
            'subjectId', v_subj_rec.id,
            'teachingLanguage', COALESCE(NULLIF(v_raw_lang, ''), NULLIF(v_expected_lang, ''), 'arabic'),
            'stageId', v_stage_rec.id,
            'curriculumType', v_curr_rec.id
          )
        );
      END IF;
    END LOOP;
  END IF;

  IF cardinality(v_matched_ids) = 0 AND cardinality(v_errors) = 0 THEN
    v_errors := array_append(
      v_errors,
      'يجب اختيار تخصص مدرسي صالح واحد على الأقل مطابق لجدول خيارات المقررات المعتمدة.'
    );
  END IF;

  RETURN QUERY SELECT
    (cardinality(v_errors) = 0 AND cardinality(v_matched_ids) > 0) AS is_valid,
    v_matched_ids AS course_option_ids,
    CASE WHEN jsonb_array_length(v_norm_specs) > 0 THEN v_norm_specs ELSE COALESCE(p_specs, '[]'::JSONB) END AS normalized_specs,
    v_subjects AS subjects,
    v_stages AS stages,
    v_curricula AS curricula,
    v_errors AS unmatched_errors;
END;
$$;

COMMIT;
