-- =============================================================================
-- SHATIR CLASSES - MIGRATION 015
-- Fix Tutor Application Concurrency & Final Submission, Explicit Specialization
-- Reference Validation, Strict Admin Review/Approval Gates, and Safe Offering Sync
-- =============================================================================

BEGIN;

-- =============================================================================
-- 0. Ensure tutor_applications summary columns & unified status check constraint
-- Canonical statuses: 'draft', 'submitted', 'needs_info', 'approved', 'rejected'
-- Legacy read-compatible under-review statuses: 'pending_review', 'interview_scheduled'
-- =============================================================================
ALTER TABLE public.tutor_applications
  ADD COLUMN IF NOT EXISTS subjects TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS stages TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS curricula TEXT[] DEFAULT '{}'::TEXT[];

ALTER TABLE public.tutor_applications
  DROP CONSTRAINT IF EXISTS tutor_applications_status_check;

ALTER TABLE public.tutor_applications
  ADD CONSTRAINT tutor_applications_status_check
  CHECK (
    status IN (
      'draft',
      'submitted',
      'needs_info',
      'approved',
      'rejected',
      'pending_review',
      'interview_scheduled'
    )
  );

-- =============================================================================
-- 1. Helper: Safe Experience Years Parser
-- - Never uses range midpoints/averages (e.g. 'من سنة إلى ٣ سنوات' -> 1,
--   'من ٣ إلى ٥ سنوات' -> 3, 'من ٥ إلى ١٠ سنوات' -> 5, 'أكثر من ٦ سنوات' -> 6).
-- - Never rounds 'أقل من سنة' ('less_than_1', '0-1') or 'أقل من سنتين' up to 1;
--   uses the reliable minimum (0 completed years), while keeping the original
--   label in experience_badge_text for display.
-- - Handles unknown/empty values safely as 0 to satisfy tutors.years_of_experience
--   (INTEGER NOT NULL DEFAULT 0 CHECK (years_of_experience >= 0)).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.parse_tutor_experience_years(
  p_experience_text TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_clean TEXT := BTRIM(COALESCE(p_experience_text, ''));
  v_western TEXT;
  v_first_num TEXT;
BEGIN
  IF v_clean = '' THEN
    RETURN 0;
  END IF;

  CASE v_clean
    WHEN 'أقل من سنة' THEN RETURN 0;
    WHEN 'أقل من سنتين' THEN RETURN 0;
    WHEN 'less_than_1' THEN RETURN 0;
    WHEN 'less_than_2' THEN RETURN 0;
    WHEN '0-1' THEN RETURN 0;
    WHEN '0-2' THEN RETURN 0;
    WHEN 'سنة واحدة' THEN RETURN 1;
    WHEN 'من سنة إلى سنتين' THEN RETURN 1;
    WHEN 'من سنة إلى ٣ سنوات' THEN RETURN 1;
    WHEN 'من سنة إلى 3 سنوات' THEN RETURN 1;
    WHEN '1-2' THEN RETURN 1;
    WHEN '1-3' THEN RETURN 1;
    WHEN '1+' THEN RETURN 1;
    WHEN 'سنتان' THEN RETURN 2;
    WHEN 'سنتين' THEN RETURN 2;
    WHEN 'من سنتين إلى ٣ سنوات' THEN RETURN 2;
    WHEN 'من سنتين إلى 3 سنوات' THEN RETURN 2;
    WHEN 'من سنتين إلى ٤ سنوات' THEN RETURN 2;
    WHEN 'من سنتين إلى 4 سنوات' THEN RETURN 2;
    WHEN '2-3' THEN RETURN 2;
    WHEN '2-4' THEN RETURN 2;
    WHEN '2+' THEN RETURN 2;
    WHEN 'من ٣ إلى ٥ سنوات' THEN RETURN 3;
    WHEN 'من 3 إلى 5 سنوات' THEN RETURN 3;
    WHEN '3-5' THEN RETURN 3;
    WHEN '3+' THEN RETURN 3;
    WHEN 'من ٤ إلى ٦ سنوات' THEN RETURN 4;
    WHEN 'من 4 إلى 6 سنوات' THEN RETURN 4;
    WHEN '4-6' THEN RETURN 4;
    WHEN '4+' THEN RETURN 4;
    WHEN 'من ٥ إلى ٧ سنوات' THEN RETURN 5;
    WHEN 'من 5 إلى 7 سنوات' THEN RETURN 5;
    WHEN 'من ٥ إلى ١٠ سنوات' THEN RETURN 5;
    WHEN 'من 5 إلى 10 سنوات' THEN RETURN 5;
    WHEN '5-7' THEN RETURN 5;
    WHEN '5-10' THEN RETURN 5;
    WHEN '5+' THEN RETURN 5;
    WHEN 'أكثر من ٦ سنوات' THEN RETURN 6;
    WHEN 'أكثر من 6 سنوات' THEN RETURN 6;
    WHEN '6+' THEN RETURN 6;
    WHEN 'من ٧ إلى ١٠ سنوات' THEN RETURN 7;
    WHEN 'من 7 إلى 10 سنوات' THEN RETURN 7;
    WHEN '7-10' THEN RETURN 7;
    WHEN '7+' THEN RETURN 7;
    WHEN 'أكثر من ١٠ سنوات' THEN RETURN 10;
    WHEN 'أكثر من 10 سنوات' THEN RETURN 10;
    WHEN '10+' THEN RETURN 10;
    ELSE
      IF v_clean LIKE 'أقل من%' OR LOWER(v_clean) LIKE 'less_than%' OR LOWER(v_clean) LIKE 'less than%' THEN
        RETURN 0;
      END IF;

      -- Convert Eastern Arabic digits (٠-٩) to Western (0-9) and extract ONLY the leading integer (lower bound)
      v_western := TRANSLATE(v_clean, '٠١٢٣٤٥٦٧٨٩', '0123456789');
      v_first_num := SUBSTRING(v_western FROM '^[0-9]+');
      IF v_first_num IS NOT NULL AND v_first_num <> '' THEN
        RETURN GREATEST(v_first_num::INTEGER, 0);
      END IF;
      RETURN 0;
  END CASE;
END;
$$;

-- =============================================================================
-- 2. Helper: Explicit School Specialization Resolver & Validator
-- - Matches against actual reference rows in subjects, educational_stages,
--   educational_grades, curriculum_types, and school_course_options.
-- - Never strips '_en' or merges 'math_en' (Math) into 'math' (الرياضيات).
-- - Resolves explicit Arabic form keys ('math_ar' -> 'math', 'science_ar' -> 'science',
--   'physics_ar' -> 'physics', 'chemistry_ar' -> 'chemistry', 'biology_ar' -> 'biology')
--   ONLY if the '_ar' key is not itself a row in public.subjects and teachingLanguage != 'english'.
-- - Verifies subject, grade, stage (eg.stage_id = stageId), curriculum, teachingLanguage,
--   and is_active = TRUE on all reference tables and school_course_options.
-- - Preserves ALL input specialization items in normalized_specs (never drops
--   incomplete or unmatched items from the array) and reports all errors in unmatched_errors.
-- =============================================================================
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

      IF NOT COALESCE(v_subj_rec.is_active, FALSE) THEN
        v_errors := array_append(
          v_errors,
          FORMAT('التخصص الدراسي رقم (%s): المادة (%s) غير مفعّلة حالياً.', v_spec_idx, v_subj_rec.name)
        );
        v_norm_specs := v_norm_specs || jsonb_build_array(v_spec);
        CONTINUE;
      END IF;

      -- Validate stage
      IF v_raw_stage = '' THEN
        v_errors := array_append(
          v_errors,
          FORMAT('التخصص الدراسي رقم (%s) (%s): لم يتم تحديد المرحلة الدراسية.', v_spec_idx, v_subj_rec.name)
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
          FORMAT('التخصص الدراسي رقم (%s) (%s): المرحلة الدراسية (%s) غير موجودة في جدول المراحل المرجعية.', v_spec_idx, v_subj_rec.name, v_raw_stage)
        );
        v_norm_specs := v_norm_specs || jsonb_build_array(v_spec);
        CONTINUE;
      END IF;

      IF NOT COALESCE(v_stage_rec.is_active, FALSE) THEN
        v_errors := array_append(
          v_errors,
          FORMAT('التخصص الدراسي رقم (%s) (%s): المرحلة الدراسية (%s) غير مفعّلة حالياً.', v_spec_idx, v_subj_rec.name, v_stage_rec.name)
        );
        v_norm_specs := v_norm_specs || jsonb_build_array(v_spec);
        CONTINUE;
      END IF;

      -- Validate curriculum
      IF v_raw_curr = '' THEN
        v_errors := array_append(
          v_errors,
          FORMAT('التخصص الدراسي رقم (%s) (%s): لم يتم تحديد نوع المنهج الدراسي.', v_spec_idx, v_subj_rec.name)
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
          FORMAT('التخصص الدراسي رقم (%s) (%s): نوع المنهج (%s) غير موجود في جدول المناهج المرجعية.', v_spec_idx, v_subj_rec.name, v_raw_curr)
        );
        v_norm_specs := v_norm_specs || jsonb_build_array(v_spec);
        CONTINUE;
      END IF;

      IF NOT COALESCE(v_curr_rec.is_active, FALSE) THEN
        v_errors := array_append(
          v_errors,
          FORMAT('التخصص الدراسي رقم (%s) (%s): نوع المنهج (%s) غير مفعّل حالياً.', v_spec_idx, v_subj_rec.name, v_curr_rec.name)
        );
        v_norm_specs := v_norm_specs || jsonb_build_array(v_spec);
        CONTINUE;
      END IF;

      -- Validate grades list
      IF NOT (v_spec ? 'gradeIds') OR jsonb_typeof(v_spec->'gradeIds') <> 'array' OR jsonb_array_length(v_spec->'gradeIds') = 0 THEN
        v_errors := array_append(
          v_errors,
          FORMAT('التخصص الدراسي رقم (%s) (%s): يجب اختيار صف دراسي واحد على الأقل.', v_spec_idx, v_subj_rec.name)
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
            FORMAT('التخصص الدراسي رقم (%s) (%s): يحتوي على معرف صف دراسي فارغ.', v_spec_idx, v_subj_rec.name)
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
            FORMAT('التخصص الدراسي رقم (%s) (%s): الصف الدراسي (%s) غير موجود في جدول الصفوف المرجعية.', v_spec_idx, v_subj_rec.name, v_grade_id)
          );
          v_item_has_error := TRUE;
          CONTINUE;
        END IF;

        IF NOT COALESCE(v_grade_rec.is_active, FALSE) THEN
          v_errors := array_append(
            v_errors,
            FORMAT('التخصص الدراسي رقم (%s) (%s): الصف الدراسي (%s) غير مفعّل حالياً.', v_spec_idx, v_subj_rec.name, v_grade_rec.name)
          );
          v_item_has_error := TRUE;
          CONTINUE;
        END IF;

        IF v_grade_rec.stage_id <> v_stage_rec.id THEN
          v_errors := array_append(
            v_errors,
            FORMAT('التخصص الدراسي رقم (%s) (%s): الصف الدراسي (%s) لا يتبع المرحلة المختارة (%s).', v_spec_idx, v_subj_rec.name, v_grade_rec.name, v_stage_rec.name)
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
            FORMAT('التخصص الدراسي رقم (%s): لا يوجد خيار مقرر معتمد للتركيبة (المادة: %s، الصف: %s، المنهج: %s).', v_spec_idx, v_subj_rec.name, v_grade_rec.name, v_curr_rec.name)
          );
          v_item_has_error := TRUE;
          CONTINUE;
        END IF;

        IF NOT COALESCE(v_opt_rec.is_active, FALSE) THEN
          v_errors := array_append(
            v_errors,
            FORMAT('التخصص الدراسي رقم (%s): خيار المقرر (المادة: %s، الصف: %s، المنهج: %s) غير مفعّل حالياً.', v_spec_idx, v_subj_rec.name, v_grade_rec.name, v_curr_rec.name)
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

-- =============================================================================
-- 3. Helper: Explicit Quran Specialization Resolver & Validator
-- - Validates every ageGroupId against public.quran_age_groups (is_active = TRUE)
--   and every levelId against public.quran_levels (is_active = TRUE).
-- - Preserves explicit (ageGroupId, levelId) pairs in quran_offerings when present,
--   validating each pair individually.
-- - Never silently drops invalid or inactive Quran specializations.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.resolve_and_validate_quran_specializations(
  p_age_groups TEXT[],
  p_levels TEXT[],
  p_offerings JSONB DEFAULT '[]'::JSONB
)
RETURNS TABLE (
  is_valid BOOLEAN,
  age_groups TEXT[],
  levels TEXT[],
  quran_offerings JSONB,
  unmatched_errors TEXT[]
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_age_id TEXT;
  v_lvl_id TEXT;
  v_age_rec RECORD;
  v_lvl_rec RECORD;
  v_pair JSONB;
  v_pair_idx INTEGER := 0;
  v_valid_ages TEXT[] := '{}'::TEXT[];
  v_valid_lvls TEXT[] := '{}'::TEXT[];
  v_valid_offerings JSONB := '[]'::JSONB;
  v_seen_pairs TEXT[] := '{}'::TEXT[];
  v_pair_key TEXT;
  v_errors TEXT[] := '{}'::TEXT[];
BEGIN
  -- 1. Validate p_age_groups array
  IF p_age_groups IS NOT NULL AND cardinality(p_age_groups) > 0 THEN
    FOREACH v_age_id IN ARRAY p_age_groups
    LOOP
      v_age_id := BTRIM(COALESCE(v_age_id, ''));
      IF v_age_id = '' THEN
        CONTINUE;
      END IF;

      SELECT id, name, is_active INTO v_age_rec
      FROM public.quran_age_groups
      WHERE id = v_age_id;

      IF v_age_rec.id IS NULL THEN
        v_errors := array_append(
          v_errors,
          FORMAT('الفئة العمرية (%s) غير موجودة في جدول الفئات العمرية المعتمدة.', v_age_id)
        );
      ELSIF NOT COALESCE(v_age_rec.is_active, FALSE) THEN
        v_errors := array_append(
          v_errors,
          FORMAT('الفئة العمرية (%s) غير مفعّلة حالياً.', v_age_rec.name)
        );
      ELSE
        IF NOT (v_age_rec.id = ANY(v_valid_ages)) THEN
          v_valid_ages := array_append(v_valid_ages, v_age_rec.id);
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 2. Validate p_levels array
  IF p_levels IS NOT NULL AND cardinality(p_levels) > 0 THEN
    FOREACH v_lvl_id IN ARRAY p_levels
    LOOP
      v_lvl_id := BTRIM(COALESCE(v_lvl_id, ''));
      IF v_lvl_id = '' THEN
        CONTINUE;
      END IF;

      SELECT id, name, is_active INTO v_lvl_rec
      FROM public.quran_levels
      WHERE id = v_lvl_id;

      IF v_lvl_rec.id IS NULL THEN
        v_errors := array_append(
          v_errors,
          FORMAT('برنامج القرآن والتأسيس (%s) غير موجود في جدول البرامج المعتمدة.', v_lvl_id)
        );
      ELSIF NOT COALESCE(v_lvl_rec.is_active, FALSE) THEN
        v_errors := array_append(
          v_errors,
          FORMAT('برنامج القرآن والتأسيس (%s) غير مفعّل حالياً.', v_lvl_rec.name)
        );
      ELSE
        IF NOT (v_lvl_rec.id = ANY(v_valid_lvls)) THEN
          v_valid_lvls := array_append(v_valid_lvls, v_lvl_rec.id);
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 3. Preserve and validate explicit (ageGroupId, levelId) pairs if provided in p_offerings
  IF p_offerings IS NOT NULL AND jsonb_typeof(p_offerings) = 'array' AND jsonb_array_length(p_offerings) > 0 THEN
    FOR v_pair IN SELECT value FROM jsonb_array_elements(p_offerings)
    LOOP
      v_pair_idx := v_pair_idx + 1;
      IF v_pair IS NULL OR jsonb_typeof(v_pair) <> 'object' THEN
        v_errors := array_append(
          v_errors,
          FORMAT('تخصص القرآن رقم (%s): بنية الزوج غير صالحة.', v_pair_idx)
        );
        CONTINUE;
      END IF;

      v_age_id := BTRIM(COALESCE(v_pair->>'ageGroupId', v_pair->>'age_group_id', ''));
      v_lvl_id := BTRIM(COALESCE(v_pair->>'levelId', v_pair->>'level_id', ''));

      IF v_age_id = '' OR v_lvl_id = '' THEN
        v_errors := array_append(
          v_errors,
          FORMAT('تخصص القرآن رقم (%s): يجب تحديد الفئة العمرية والبرنامج معاً.', v_pair_idx)
        );
        CONTINUE;
      END IF;

      SELECT id, name, is_active INTO v_age_rec
      FROM public.quran_age_groups
      WHERE id = v_age_id;

      IF v_age_rec.id IS NULL THEN
        v_errors := array_append(
          v_errors,
          FORMAT('تخصص القرآن رقم (%s): الفئة العمرية (%s) غير موجودة في الجداول المرجعية.', v_pair_idx, v_age_id)
        );
        CONTINUE;
      ELSIF NOT COALESCE(v_age_rec.is_active, FALSE) THEN
        v_errors := array_append(
          v_errors,
          FORMAT('تخصص القرآن رقم (%s): الفئة العمرية (%s) غير مفعّلة حالياً.', v_pair_idx, v_age_rec.name)
        );
        CONTINUE;
      END IF;

      SELECT id, name, is_active INTO v_lvl_rec
      FROM public.quran_levels
      WHERE id = v_lvl_id;

      IF v_lvl_rec.id IS NULL THEN
        v_errors := array_append(
          v_errors,
          FORMAT('تخصص القرآن رقم (%s): البرنامج (%s) غير موجود في الجداول المرجعية.', v_pair_idx, v_lvl_id)
        );
        CONTINUE;
      ELSIF NOT COALESCE(v_lvl_rec.is_active, FALSE) THEN
        v_errors := array_append(
          v_errors,
          FORMAT('تخصص القرآن رقم (%s): البرنامج (%s) غير مفعّل حالياً.', v_pair_idx, v_lvl_rec.name)
        );
        CONTINUE;
      END IF;

      v_pair_key := v_age_rec.id || '|' || v_lvl_rec.id;
      IF NOT (v_pair_key = ANY(v_seen_pairs)) THEN
        v_seen_pairs := array_append(v_seen_pairs, v_pair_key);
        v_valid_offerings := v_valid_offerings || jsonb_build_array(
          jsonb_build_object('ageGroupId', v_age_rec.id, 'levelId', v_lvl_rec.id)
        );
      END IF;

      IF NOT (v_age_rec.id = ANY(v_valid_ages)) THEN
        v_valid_ages := array_append(v_valid_ages, v_age_rec.id);
      END IF;
      IF NOT (v_lvl_rec.id = ANY(v_valid_lvls)) THEN
        v_valid_lvls := array_append(v_valid_lvls, v_lvl_rec.id);
      END IF;
    END LOOP;
  ELSE
    -- Construct offerings pairs from validated age_groups and levels when explicit pairs were not provided
    IF cardinality(v_valid_ages) > 0 AND cardinality(v_valid_lvls) > 0 THEN
      FOREACH v_age_id IN ARRAY v_valid_ages
      LOOP
        FOREACH v_lvl_id IN ARRAY v_valid_lvls
        LOOP
          v_pair_key := v_age_id || '|' || v_lvl_id;
          IF NOT (v_pair_key = ANY(v_seen_pairs)) THEN
            v_seen_pairs := array_append(v_seen_pairs, v_pair_key);
            v_valid_offerings := v_valid_offerings || jsonb_build_array(
              jsonb_build_object('ageGroupId', v_age_id, 'levelId', v_lvl_id)
            );
          END IF;
        END LOOP;
      END LOOP;
    END IF;
  END IF;

  IF (cardinality(v_valid_ages) = 0 OR cardinality(v_valid_lvls) = 0 OR jsonb_array_length(v_valid_offerings) = 0)
     AND cardinality(v_errors) = 0 THEN
    v_errors := array_append(
      v_errors,
      'يجب اختيار فئة عمرية صالحة واحدة وبرنامج قرآني أو تأسيسي صالح واحد على الأقل.'
    );
  END IF;

  RETURN QUERY SELECT
    (cardinality(v_errors) = 0 AND jsonb_array_length(v_valid_offerings) > 0) AS is_valid,
    v_valid_ages AS age_groups,
    v_valid_lvls AS levels,
    v_valid_offerings AS quran_offerings,
    v_errors AS unmatched_errors;
END;
$$;

-- =============================================================================
-- 4. RPC: tutor_save_application
-- - Exact signature & JSONB return contract matching migrations 005 & 006.
-- - Uses pg_advisory_xact_lock per user_id + SELECT ... FOR UPDATE to serialize
--   concurrent saves/submits, prevent duplicate initial row creation, and block
--   delayed draft saves from reverting 'submitted' back to 'draft' or mutating
--   locked applications.
-- - Preserves ALL draft selections (even incomplete or unmatched school specs,
--   Quran age groups, Quran levels, and Quran offering pairs) when saving a draft,
--   so nothing is lost before final submission.
-- - Distinguishes between omitted fields vs. explicitly sent invalid values for
--   suggestedHourlyRate and sessionDurationMinutes, rejecting invalid values
--   instead of coercing them to previous values or 120 / 50.
-- =============================================================================
DROP FUNCTION IF EXISTS public.tutor_save_application(JSONB, BOOLEAN);

CREATE OR REPLACE FUNCTION public.tutor_save_application(
  p_payload JSONB,
  p_is_submit BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_existing public.tutor_applications;
  v_result public.tutor_applications;
  v_is_submit BOOLEAN := COALESCE(p_is_submit, FALSE);
  v_target_status TEXT;
  v_ref_code TEXT;
  v_track TEXT;
  v_specs JSONB;
  v_direct_opt_ids UUID[] := '{}'::UUID[];
  v_course_option_ids UUID[] := '{}'::UUID[];
  v_subjects TEXT[] := '{}'::TEXT[];
  v_stages TEXT[] := '{}'::TEXT[];
  v_curricula TEXT[] := '{}'::TEXT[];
  v_quran_ages TEXT[] := '{}'::TEXT[];
  v_quran_levels TEXT[] := '{}'::TEXT[];
  v_quran_offerings JSONB := '[]'::JSONB;
  v_raw_quran_offerings JSONB := '[]'::JSONB;
  v_days TEXT[] := '{}'::TEXT[];
  v_times TEXT[] := '{}'::TEXT[];
  v_terms_accepted BOOLEAN;
  v_policy_version TEXT;
  v_policy_accepted_at TIMESTAMPTZ;
  v_avatar_path TEXT;
  v_remove_avatar BOOLEAN;
  v_full_name TEXT;
  v_country_code TEXT;
  v_phone TEXT;
  v_whatsapp_number TEXT;
  v_email TEXT;
  v_academic_degree TEXT;
  v_institution TEXT;
  v_experience_years TEXT;
  v_has_online_experience TEXT;
  v_online_experience_details TEXT;
  v_bio TEXT;
  v_portfolio_url TEXT;
  v_rate INTEGER;
  v_raw_rate_text TEXT;
  v_currency TEXT;
  v_session_duration INTEGER;
  v_raw_duration_text TEXT;
  v_timezone TEXT;
  v_val_is_valid BOOLEAN := FALSE;
  v_val_course_option_ids UUID[] := '{}'::UUID[];
  v_val_normalized_specs JSONB := '[]'::JSONB;
  v_val_subjects TEXT[] := '{}'::TEXT[];
  v_val_stages TEXT[] := '{}'::TEXT[];
  v_val_curricula TEXT[] := '{}'::TEXT[];
  v_val_age_groups TEXT[] := '{}'::TEXT[];
  v_val_levels TEXT[] := '{}'::TEXT[];
  v_val_quran_offerings JSONB := '[]'::JSONB;
  v_val_errors TEXT[] := '{}'::TEXT[];
  v_raw_uuid_text TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول بحساب المعلم لحفظ أو إرسال طلب الانضمام.';
  END IF;

  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'بيانات الطلب غير صالحة.';
  END IF;

  -- Serialize all concurrent save/submit requests for this user_id within the transaction
  PERFORM pg_advisory_xact_lock(hashtext('tutor_save_application:' || v_user_id::TEXT));

  -- Lock the user's application record if it already exists
  SELECT * INTO v_existing
  FROM public.tutor_applications
  WHERE user_id = v_user_id
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  -- Concurrency & status transition guard inside the locked transaction
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.status IN ('approved', 'rejected') THEN
      RAISE EXCEPTION 'لا يمكن تعديل الطلب بعد صدور قرار نهائي (%).', v_existing.status;
    END IF;

    IF v_existing.status IN ('submitted', 'pending_review', 'interview_scheduled') THEN
      IF NOT v_is_submit THEN
        -- Prevent a delayed draft save from reverting 'submitted' to 'draft' or overwriting submitted data
        RAISE EXCEPTION 'الطلب مُرسل للمراجعة بالفعل ولا يمكن إعادته إلى مسودة أو تعديل بياناته أثناء المراجعة.';
      ELSE
        -- Idempotent duplicate submit retry: return the already-submitted row without mutating or duplicating it
        RETURN to_jsonb(v_existing);
      END IF;
    END IF;
  END IF;

  v_track := COALESCE(NULLIF(BTRIM(p_payload->>'track'), ''), v_existing.track, 'school');
  IF v_track NOT IN ('school', 'quran') THEN
    RAISE EXCEPTION 'المسار التدريسي المحدد (%) غير صالح.', v_track;
  END IF;

  v_full_name := BTRIM(COALESCE(p_payload->>'fullName', v_existing.full_name, ''));
  v_country_code := BTRIM(COALESCE(NULLIF(BTRIM(p_payload->>'countryCode'), ''), v_existing.country_code, '+20'));
  v_phone := BTRIM(COALESCE(p_payload->>'phone', v_existing.phone, ''));
  v_whatsapp_number := BTRIM(COALESCE(
    NULLIF(BTRIM(p_payload->>'whatsappNumber'), ''),
    NULLIF(BTRIM(p_payload->>'phone'), ''),
    v_existing.whatsapp_number,
    v_phone
  ));
  v_email := NULLIF(BTRIM(COALESCE(p_payload->>'email', v_existing.email, '')), '');
  v_academic_degree := BTRIM(COALESCE(p_payload->>'academicDegree', v_existing.academic_degree, ''));
  v_institution := NULLIF(BTRIM(COALESCE(p_payload->>'institution', v_existing.institution, '')), '');
  v_experience_years := BTRIM(COALESCE(p_payload->>'experienceYears', v_existing.experience_years, ''));

  v_has_online_experience := CASE
    WHEN p_payload ? 'hasOnlineExperience' THEN
      CASE LOWER(BTRIM(COALESCE(p_payload->>'hasOnlineExperience', '')))
        WHEN 'yes' THEN 'yes'
        WHEN 'true' THEN 'yes'
        WHEN 'no' THEN 'no'
        WHEN 'false' THEN 'no'
        ELSE ''
      END
    ELSE COALESCE(v_existing.has_online_experience, 'yes')
  END;

  v_online_experience_details := NULLIF(BTRIM(COALESCE(p_payload->>'onlineExperienceDetails', v_existing.online_experience_details, '')), '');
  v_bio := BTRIM(COALESCE(p_payload->>'bioAndMethodology', v_existing.bio_and_methodology, ''));
  v_portfolio_url := NULLIF(BTRIM(COALESCE(p_payload->>'portfolioUrl', v_existing.portfolio_url, '')), '');

  -- Strictly validate suggestedHourlyRate:
  -- Distinguish between key absence vs. explicitly sent invalid/non-numeric/non-positive values
  IF p_payload ? 'suggestedHourlyRate' THEN
    IF jsonb_typeof(p_payload->'suggestedHourlyRate') = 'null'
       OR BTRIM(COALESCE(p_payload->>'suggestedHourlyRate', '')) = '' THEN
      IF v_is_submit THEN
        RAISE EXCEPTION 'يرجى إدخال سعر مقترح صحيح للحصة قبل إرسال الطلب.';
      ELSE
        v_rate := COALESCE(v_existing.suggested_hourly_rate, 120);
      END IF;
    ELSIF jsonb_typeof(p_payload->'suggestedHourlyRate') NOT IN ('number', 'string') THEN
      RAISE EXCEPTION 'سعر الحصة المقترح المرسل غير صالح؛ يرجى إدخال رقم صحيح أكبر من صفر.';
    ELSE
      v_raw_rate_text := TRANSLATE(BTRIM(p_payload->>'suggestedHourlyRate'), '٠١٢٣٤٥٦٧٨٩', '0123456789');
      IF v_raw_rate_text !~ '^-?[0-9]+(\.0+)?$' THEN
        RAISE EXCEPTION 'سعر الحصة المقترح (%) غير صالح؛ يرجى إدخال رقم صحيح أكبر من صفر.', BTRIM(p_payload->>'suggestedHourlyRate');
      END IF;

      BEGIN
        v_rate := (v_raw_rate_text::NUMERIC)::INTEGER;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'سعر الحصة المقترح (%) غير صالح؛ يرجى إدخال رقم صحيح أكبر من صفر.', BTRIM(p_payload->>'suggestedHourlyRate');
      END;

      IF v_rate <= 0 OR v_rate > 100000 THEN
        RAISE EXCEPTION 'سعر الحصة المقترح (%) غير صالح؛ يجب أن يكون رقماً صحيحاً أكبر من صفر.', v_rate;
      END IF;
    END IF;
  ELSE
    IF v_existing.id IS NOT NULL AND v_existing.suggested_hourly_rate IS NOT NULL AND v_existing.suggested_hourly_rate > 0 THEN
      v_rate := v_existing.suggested_hourly_rate;
    ELSIF v_is_submit THEN
      RAISE EXCEPTION 'يرجى إدخال سعر مقترح صحيح للحصة قبل إرسال الطلب.';
    ELSE
      v_rate := 120;
    END IF;
  END IF;

  v_currency := COALESCE(NULLIF(BTRIM(p_payload->>'currency'), ''), v_existing.currency, 'ج.م');

  -- Strictly validate sessionDurationMinutes:
  -- Distinguish between key absence vs. explicitly sent invalid/non-numeric/out-of-range values (approved range: 15..180 minutes)
  IF p_payload ? 'sessionDurationMinutes' THEN
    IF jsonb_typeof(p_payload->'sessionDurationMinutes') = 'null'
       OR BTRIM(COALESCE(p_payload->>'sessionDurationMinutes', '')) = '' THEN
      IF v_is_submit THEN
        RAISE EXCEPTION 'يرجى تحديد مدة الحصة بالدقائق بصورة صحيحة قبل إرسال الطلب.';
      ELSE
        v_session_duration := COALESCE(v_existing.session_duration_minutes, 50);
      END IF;
    ELSIF jsonb_typeof(p_payload->'sessionDurationMinutes') NOT IN ('number', 'string') THEN
      RAISE EXCEPTION 'مدة الحصة المحددة غير صالحة؛ يرجى إدخال عدد دقائق صحيح.';
    ELSE
      v_raw_duration_text := TRANSLATE(BTRIM(p_payload->>'sessionDurationMinutes'), '٠١٢٣٤٥٦٧٨٩', '0123456789');
      IF v_raw_duration_text !~ '^-?[0-9]+(\.0+)?$' THEN
        RAISE EXCEPTION 'مدة الحصة المحددة (%) غير صالحة؛ يرجى إدخال عدد دقائق صحيح.', BTRIM(p_payload->>'sessionDurationMinutes');
      END IF;

      BEGIN
        v_session_duration := (v_raw_duration_text::NUMERIC)::INTEGER;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'مدة الحصة المحددة (%) غير صالحة؛ يرجى إدخال عدد دقائق صحيح.', BTRIM(p_payload->>'sessionDurationMinutes');
      END;

      IF v_session_duration < 15 OR v_session_duration > 180 THEN
        RAISE EXCEPTION 'مدة الحصة المحددة (% دقيقة) خارج النطاق المعتمد (١٥ إلى ١٨٠ دقيقة).', v_session_duration;
      END IF;
    END IF;
  ELSE
    IF v_existing.id IS NOT NULL
       AND v_existing.session_duration_minutes IS NOT NULL
       AND v_existing.session_duration_minutes >= 15
       AND v_existing.session_duration_minutes <= 180 THEN
      v_session_duration := v_existing.session_duration_minutes;
    ELSIF v_is_submit AND v_existing.id IS NOT NULL AND v_existing.session_duration_minutes IS NOT NULL THEN
      RAISE EXCEPTION 'مدة الحصة المسجلة (% دقيقة) خارج النطاق المعتمد (١٥ إلى ١٨٠ دقيقة).', v_existing.session_duration_minutes;
    ELSE
      v_session_duration := 50;
    END IF;
  END IF;

  v_timezone := COALESCE(NULLIF(BTRIM(p_payload->>'timezone'), ''), v_existing.timezone, 'Africa/Cairo');
  v_terms_accepted := COALESCE((p_payload->>'termsAccepted')::BOOLEAN, v_existing.terms_accepted, FALSE);
  v_remove_avatar := COALESCE((p_payload->>'removeAvatar')::BOOLEAN, FALSE);

  -- Avatar path validation (must reside under user's own folder in tutor-application-avatars)
  IF v_remove_avatar THEN
    v_avatar_path := NULL;
  ELSIF p_payload ? 'avatarPath' THEN
    IF p_payload->>'avatarPath' IS NULL OR BTRIM(p_payload->>'avatarPath') = '' THEN
      v_avatar_path := NULL;
    ELSE
      v_avatar_path := BTRIM(p_payload->>'avatarPath');
      IF v_avatar_path LIKE '%..%' OR v_avatar_path LIKE '/%' OR v_avatar_path NOT LIKE (v_user_id::TEXT || '/%') THEN
        RAISE EXCEPTION 'مسار الصورة الشخصية غير صالح أو لا يطابق حساب المعلم الحالي.';
      END IF;
    END IF;
  ELSE
    v_avatar_path := v_existing.avatar_path;
  END IF;

  -- Extract days and preferred times arrays
  IF p_payload ? 'availableDays' AND jsonb_typeof(p_payload->'availableDays') = 'array' THEN
    SELECT COALESCE(ARRAY_AGG(elem), '{}'::TEXT[])
    INTO v_days
    FROM jsonb_array_elements_text(p_payload->'availableDays') AS elem
    WHERE BTRIM(elem) <> '';
  ELSIF v_existing.id IS NOT NULL THEN
    v_days := COALESCE(v_existing.available_days, '{}'::TEXT[]);
  END IF;

  IF p_payload ? 'preferredTimes' AND jsonb_typeof(p_payload->'preferredTimes') = 'array' THEN
    SELECT COALESCE(ARRAY_AGG(elem), '{}'::TEXT[])
    INTO v_times
    FROM jsonb_array_elements_text(p_payload->'preferredTimes') AS elem
    WHERE BTRIM(elem) <> '';
  ELSIF v_existing.id IS NOT NULL THEN
    v_times := COALESCE(v_existing.preferred_times, '{}'::TEXT[]);
  END IF;

  -- Extract and validate track specializations
  IF v_track = 'school' THEN
    v_specs := CASE
      WHEN p_payload ? 'schoolSpecializations' AND jsonb_typeof(p_payload->'schoolSpecializations') = 'array'
        THEN p_payload->'schoolSpecializations'
      WHEN v_existing.id IS NOT NULL AND v_existing.school_specializations IS NOT NULL
        THEN v_existing.school_specializations
      ELSE '[]'::JSONB
    END;

    IF p_payload ? 'schoolCourseOptionIds' AND jsonb_typeof(p_payload->'schoolCourseOptionIds') = 'array' THEN
      FOR v_raw_uuid_text IN SELECT jsonb_array_elements_text(p_payload->'schoolCourseOptionIds')
      LOOP
        v_raw_uuid_text := BTRIM(COALESCE(v_raw_uuid_text, ''));
        IF v_raw_uuid_text <> '' THEN
          BEGIN
            v_direct_opt_ids := array_append(v_direct_opt_ids, v_raw_uuid_text::UUID);
          EXCEPTION WHEN OTHERS THEN
            IF v_is_submit THEN
              RAISE EXCEPTION 'معرف خيار المقرر (%) ليس بصيغة UUID صحيحة.', v_raw_uuid_text;
            END IF;
          END;
        END IF;
      END LOOP;
    ELSIF jsonb_array_length(v_specs) = 0 AND v_existing.id IS NOT NULL THEN
      v_direct_opt_ids := COALESCE(v_existing.school_course_option_ids, '{}'::UUID[]);
    END IF;

    SELECT
      r.is_valid,
      COALESCE(r.course_option_ids, '{}'::UUID[]),
      COALESCE(r.normalized_specs, '[]'::JSONB),
      COALESCE(r.subjects, '{}'::TEXT[]),
      COALESCE(r.stages, '{}'::TEXT[]),
      COALESCE(r.curricula, '{}'::TEXT[]),
      COALESCE(r.unmatched_errors, '{}'::TEXT[])
    INTO
      v_val_is_valid,
      v_val_course_option_ids,
      v_val_normalized_specs,
      v_val_subjects,
      v_val_stages,
      v_val_curricula,
      v_val_errors
    FROM public.resolve_and_validate_school_specializations(v_specs, v_direct_opt_ids) AS r;

    IF v_is_submit AND NOT COALESCE(v_val_is_valid, FALSE) THEN
      RAISE EXCEPTION 'توجد تخصصات مدرسية غير مطابقة أو تحتاج إلى تصحيح قبل إرسال الطلب: %',
        ARRAY_TO_STRING(v_val_errors, ' | ');
    END IF;

    -- Preserve all original draft specialization items when saving a draft or when not 100% valid
    IF v_is_submit AND COALESCE(v_val_is_valid, FALSE) THEN
      v_specs := COALESCE(v_val_normalized_specs, v_specs);
      v_course_option_ids := v_val_course_option_ids;
    ELSE
      -- Keep raw v_specs intact in draft so no incomplete/unmatched selection is ever lost
      v_course_option_ids := CASE
        WHEN COALESCE(v_val_is_valid, FALSE) THEN v_val_course_option_ids
        WHEN cardinality(v_direct_opt_ids) > 0 THEN v_direct_opt_ids
        ELSE v_val_course_option_ids
      END;
    END IF;

    v_subjects := v_val_subjects;
    v_stages := v_val_stages;
    v_curricula := v_val_curricula;
    v_quran_ages := '{}'::TEXT[];
    v_quran_levels := '{}'::TEXT[];
    v_quran_offerings := '[]'::JSONB;
  ELSE
    -- Quran track
    IF p_payload ? 'quranAgeGroups' AND jsonb_typeof(p_payload->'quranAgeGroups') = 'array' THEN
      SELECT COALESCE(ARRAY_AGG(elem), '{}'::TEXT[])
      INTO v_quran_ages
      FROM jsonb_array_elements_text(p_payload->'quranAgeGroups') AS elem
      WHERE BTRIM(elem) <> '';
    ELSIF v_existing.id IS NOT NULL THEN
      v_quran_ages := COALESCE(v_existing.quran_age_groups, '{}'::TEXT[]);
    END IF;

    IF p_payload ? 'quranLevels' AND jsonb_typeof(p_payload->'quranLevels') = 'array' THEN
      SELECT COALESCE(ARRAY_AGG(elem), '{}'::TEXT[])
      INTO v_quran_levels
      FROM jsonb_array_elements_text(p_payload->'quranLevels') AS elem
      WHERE BTRIM(elem) <> '';
    ELSIF v_existing.id IS NOT NULL THEN
      v_quran_levels := COALESCE(v_existing.quran_levels, '{}'::TEXT[]);
    END IF;

    IF p_payload ? 'quranOfferings' AND jsonb_typeof(p_payload->'quranOfferings') = 'array'
       AND jsonb_array_length(p_payload->'quranOfferings') > 0 THEN
      v_raw_quran_offerings := p_payload->'quranOfferings';
    ELSIF v_existing.id IS NOT NULL AND v_existing.quran_offerings IS NOT NULL
          AND jsonb_typeof(v_existing.quran_offerings) = 'array'
          AND jsonb_array_length(v_existing.quran_offerings) > 0
          AND NOT (p_payload ? 'quranAgeGroups' OR p_payload ? 'quranLevels') THEN
      v_raw_quran_offerings := v_existing.quran_offerings;
    ELSE
      v_raw_quran_offerings := '[]'::JSONB;
    END IF;

    SELECT
      r.is_valid,
      COALESCE(r.age_groups, '{}'::TEXT[]),
      COALESCE(r.levels, '{}'::TEXT[]),
      COALESCE(r.quran_offerings, '[]'::JSONB),
      COALESCE(r.unmatched_errors, '{}'::TEXT[])
    INTO
      v_val_is_valid,
      v_val_age_groups,
      v_val_levels,
      v_val_quran_offerings,
      v_val_errors
    FROM public.resolve_and_validate_quran_specializations(v_quran_ages, v_quran_levels, v_raw_quran_offerings) AS r;

    IF v_is_submit AND NOT COALESCE(v_val_is_valid, FALSE) THEN
      RAISE EXCEPTION 'توجد تخصصات في مسار القرآن والتأسيس غير مطابقة أو تحتاج إلى تصحيح قبل إرسال الطلب: %',
        ARRAY_TO_STRING(v_val_errors, ' | ');
    END IF;

    -- Preserve all original draft Quran selections (age groups, levels, and explicit offering pairs)
    -- when saving a draft or when validation is not 100% valid; never replace with only the valid subset!
    IF v_is_submit AND COALESCE(v_val_is_valid, FALSE) THEN
      v_quran_ages := v_val_age_groups;
      v_quran_levels := v_val_levels;
      v_quran_offerings := v_val_quran_offerings;
    ELSE
      IF jsonb_array_length(v_raw_quran_offerings) > 0 THEN
        v_quran_offerings := v_raw_quran_offerings;
      ELSIF cardinality(v_quran_ages) > 0 AND cardinality(v_quran_levels) > 0 THEN
        SELECT COALESCE(
          jsonb_agg(jsonb_build_object('ageGroupId', ag.age_group_id, 'levelId', lv.level_id)),
          '[]'::JSONB
        )
        INTO v_quran_offerings
        FROM unnest(v_quran_ages) AS ag(age_group_id)
        CROSS JOIN unnest(v_quran_levels) AS lv(level_id);
      ELSE
        v_quran_offerings := '[]'::JSONB;
      END IF;
    END IF;

    v_course_option_ids := '{}'::UUID[];
    v_specs := '[]'::JSONB;
    v_subjects := '{}'::TEXT[];
    v_stages := '{}'::TEXT[];
    v_curricula := '{}'::TEXT[];
  END IF;

  -- Strict required-field validation on final submission
  IF v_is_submit THEN
    IF v_full_name = '' OR array_length(regexp_split_to_array(v_full_name, '\s+'), 1) < 2 THEN
      RAISE EXCEPTION 'يرجى إدخال الاسم الكامل (ثنائي أو ثلاثي على الأقل) قبل إرسال الطلب للمراجعة.';
    END IF;
    IF v_phone = '' OR char_length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 7 THEN
      RAISE EXCEPTION 'يرجى إدخال رقم هاتف / واتساب صحيح للتواصل قبل إرسال الطلب.';
    END IF;
    IF NOT v_terms_accepted THEN
      RAISE EXCEPTION 'يجب قراءة سياسة التعاون مع شاطر والموافقة عليها قبل إرسال الطلب للمراجعة.';
    END IF;
    IF v_academic_degree = '' THEN
      RAISE EXCEPTION 'يرجى إدخال المؤهل الأكاديمي والجامعة قبل إرسال الطلب.';
    END IF;
    IF v_experience_years = '' THEN
      RAISE EXCEPTION 'يرجى تحديد سنوات الخبرة التدريسية قبل إرسال الطلب.';
    END IF;
    IF char_length(v_bio) < 15 THEN
      RAISE EXCEPTION 'يرجى كتابة نبذة واضحة عن خبرتك وأسلوبك في التدريس (١٥ حرفاً على الأقل).';
    END IF;
    IF v_rate <= 0 THEN
      RAISE EXCEPTION 'يرجى إدخال سعر مقترح صحيح للحصة.';
    END IF;
    IF v_session_duration < 15 OR v_session_duration > 180 THEN
      RAISE EXCEPTION 'مدة الحصة المحددة (% دقيقة) خارج النطاق المعتمد (١٥ إلى ١٨٠ دقيقة).', v_session_duration;
    END IF;
    IF cardinality(v_days) = 0 OR cardinality(v_times) = 0 THEN
      RAISE EXCEPTION 'يرجى تحديد أيام التفرغ والفترات المفضلة قبل إرسال الطلب.';
    END IF;

    v_target_status := 'submitted';
  ELSE
    v_target_status := COALESCE(v_existing.status, 'draft');
  END IF;

  -- Policy version & timestamp handling
  v_policy_version := COALESCE(
    NULLIF(BTRIM(p_payload->>'termsPolicyVersion'), ''),
    NULLIF(BTRIM(p_payload->>'policyVersion'), ''),
    v_existing.policy_version,
    CASE WHEN v_terms_accepted THEN 'v1.0' ELSE NULL END
  );

  IF v_terms_accepted THEN
    v_policy_accepted_at := COALESCE(v_existing.policy_accepted_at, NOW());
  ELSE
    v_policy_accepted_at := NULL;
  END IF;

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.tutor_applications
    SET
      full_name = NULLIF(v_full_name, ''),
      country_code = v_country_code,
      phone = NULLIF(v_phone, ''),
      whatsapp_number = NULLIF(v_whatsapp_number, ''),
      email = v_email,
      track = v_track,
      subjects = v_subjects,
      stages = v_stages,
      curricula = v_curricula,
      school_course_option_ids = v_course_option_ids,
      school_specializations = v_specs,
      quran_offerings = v_quran_offerings,
      quran_age_groups = v_quran_ages,
      quran_levels = v_quran_levels,
      quran_notes = NULLIF(BTRIM(COALESCE(p_payload->>'quranNotes', v_existing.quran_notes, '')), ''),
      academic_degree = NULLIF(v_academic_degree, ''),
      institution = v_institution,
      experience_years = NULLIF(v_experience_years, ''),
      has_online_experience = v_has_online_experience,
      online_experience_details = v_online_experience_details,
      bio_and_methodology = NULLIF(v_bio, ''),
      portfolio_url = v_portfolio_url,
      avatar_path = v_avatar_path,
      suggested_hourly_rate = v_rate,
      currency = v_currency,
      session_duration_minutes = v_session_duration,
      available_days = v_days,
      preferred_times = v_times,
      timezone = v_timezone,
      terms_accepted = v_terms_accepted,
      policy_version = v_policy_version,
      policy_accepted_at = v_policy_accepted_at,
      status = v_target_status,
      updated_at = NOW()
    WHERE id = v_existing.id
    RETURNING * INTO v_result;
  ELSE
    v_ref_code := 'SH-' || LPAD(FLOOR(100000 + RANDOM() * 900000)::TEXT, 6, '0');

    INSERT INTO public.tutor_applications (
      user_id,
      reference_code,
      full_name,
      country_code,
      phone,
      whatsapp_number,
      email,
      track,
      subjects,
      stages,
      curricula,
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
      status
    ) VALUES (
      v_user_id,
      v_ref_code,
      NULLIF(v_full_name, ''),
      v_country_code,
      NULLIF(v_phone, ''),
      NULLIF(v_whatsapp_number, ''),
      v_email,
      v_track,
      v_subjects,
      v_stages,
      v_curricula,
      v_course_option_ids,
      v_specs,
      v_quran_offerings,
      v_quran_ages,
      v_quran_levels,
      NULLIF(BTRIM(COALESCE(p_payload->>'quranNotes', '')), ''),
      NULLIF(v_academic_degree, ''),
      v_institution,
      NULLIF(v_experience_years, ''),
      v_has_online_experience,
      v_online_experience_details,
      NULLIF(v_bio, ''),
      v_portfolio_url,
      v_avatar_path,
      v_rate,
      v_currency,
      v_session_duration,
      v_days,
      v_times,
      v_timezone,
      v_terms_accepted,
      v_policy_version,
      v_policy_accepted_at,
      v_target_status
    )
    RETURNING * INTO v_result;
  END IF;

  RETURN to_jsonb(v_result);
END;
$$;

REVOKE ALL ON FUNCTION public.tutor_save_application(JSONB, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_save_application(JSONB, BOOLEAN) TO authenticated, service_role;

-- =============================================================================
-- 5. RPC: admin_review_tutor_application
-- - Preserves exact parameter names (p_application_id, p_status, p_admin_notes)
--   and JSONB return contract used by AdminService.reviewApplication.
-- - Only allows transitioning reviewable applications ('submitted', 'needs_info',
--   'pending_review', 'interview_scheduled') to 'needs_info' or 'rejected'.
-- - Blocks reviewing 'draft', 'approved', or 'rejected' applications.
-- =============================================================================
DROP FUNCTION IF EXISTS public.admin_review_tutor_application(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_review_tutor_application(
  p_application_id UUID,
  p_status TEXT,
  p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.tutor_applications;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'غير مصرح: هذه العملية متاحة للمشرفين المعتمدين فقط.';
  END IF;

  IF p_status NOT IN ('needs_info', 'rejected') THEN
    RAISE EXCEPTION 'الحالة المحددة غير صالحة لهذه العملية (المسموح: needs_info أو rejected).';
  END IF;

  IF p_admin_notes IS NULL OR BTRIM(p_admin_notes) = '' THEN
    RAISE EXCEPTION 'يرجى تدوين الملاحظات الإدارية للمعلم قبل حفظ القرار.';
  END IF;

  SELECT * INTO v_app
  FROM public.tutor_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'طلب الانضمام المحدد غير موجود.';
  END IF;

  IF v_app.status = 'draft' THEN
    RAISE EXCEPTION 'لا يمكن مراجعة هذا الطلب أو رفضه لأنه ما زال «مسودة» ولم يقم المعلم بإرساله للمراجعة بعد.';
  END IF;

  IF v_app.status NOT IN ('submitted', 'needs_info', 'pending_review', 'interview_scheduled') THEN
    RAISE EXCEPTION 'لا يمكن مراجعة الطلب في حالته الحالية (%).', v_app.status;
  END IF;

  UPDATE public.tutor_applications
  SET
    status = p_status,
    admin_notes = BTRIM(p_admin_notes),
    reviewed_at = NOW(),
    reviewed_by = auth.uid(),
    updated_at = NOW()
  WHERE id = p_application_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'applicationId', p_application_id,
    'status', p_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_tutor_application(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_tutor_application(UUID, TEXT, TEXT) TO authenticated, service_role;

-- =============================================================================
-- 6. RPC: admin_approve_tutor_application
-- - Uses explicitly typed and initialized variables (NO unassigned RECORD fields
--   referenced in any SQL statement or CASE expression).
-- - Matches exact columns & types of public.tutors, public.tutor_qualifications,
--   public.tutor_private_info, public.tutor_school_offerings,
--   public.tutor_quran_offerings, and public.tutor_account_links.
-- - Does NOT fabricate rating (rating = NULL, reviews_count = 0), does NOT
--   fabricate credential verification (verified_credentials = FALSE,
--   tutor_qualifications.verified = FALSE), and parses experience years safely
--   via public.parse_tutor_experience_years while preserving the original text
--   in experience_badge_text.
-- - Keeps avatar_url = NULL (private avatar_path stays in tutor-application-avatars
--   until explicit publication) and creates tutor with is_published = FALSE.
-- =============================================================================
DROP FUNCTION IF EXISTS public.admin_approve_tutor_application(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_approve_tutor_application(
  p_application_id UUID,
  p_tutor_slug TEXT,
  p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.tutor_applications;
  v_slug TEXT;
  v_exp_years INTEGER;
  v_rate INTEGER;
  v_duration INTEGER;
  v_headline TEXT;
  v_val_is_valid BOOLEAN := FALSE;
  v_val_course_option_ids UUID[] := '{}'::UUID[];
  v_val_normalized_specs JSONB := '[]'::JSONB;
  v_val_subjects TEXT[] := '{}'::TEXT[];
  v_val_stages TEXT[] := '{}'::TEXT[];
  v_val_curricula TEXT[] := '{}'::TEXT[];
  v_val_age_groups TEXT[] := '{}'::TEXT[];
  v_val_levels TEXT[] := '{}'::TEXT[];
  v_val_quran_offerings JSONB := '[]'::JSONB;
  v_val_errors TEXT[] := '{}'::TEXT[];
  v_curriculum_tags TEXT[] := '{}'::TEXT[];
  v_opt_id UUID;
  v_pair JSONB;
  v_school_count INTEGER := 0;
  v_quran_count INTEGER := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'غير مصرح: هذه العملية متاحة للمشرفين المعتمدين فقط.';
  END IF;

  v_slug := LOWER(BTRIM(COALESCE(p_tutor_slug, '')));
  IF v_slug = '' OR v_slug !~ '^[a-z0-9-]+$' THEN
    RAISE EXCEPTION 'يرجى تحديد معرف صالح للمعلم (Slug) بالأحرف الإنجليزية والأرقام والشرطات فقط.';
  END IF;

  SELECT * INTO v_app
  FROM public.tutor_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'طلب الانضمام غير موجود.';
  END IF;

  IF v_app.status = 'draft' THEN
    RAISE EXCEPTION 'لا يمكن قبول واعتماد هذا الطلب لأنه ما زال «مسودة» ولم يقم المعلم بإرساله للمراجعة بعد.';
  END IF;

  IF v_app.status = 'approved' THEN
    RAISE EXCEPTION 'تم قبول هذا الطلب مسبقاً (معرف المعلم: %).', COALESCE(v_app.applicant_tutor_id, v_slug);
  END IF;

  IF v_app.status NOT IN ('submitted', 'needs_info', 'pending_review', 'interview_scheduled') THEN
    RAISE EXCEPTION 'حالة الطلب الحالية (%) لا تسمح بالاعتماد.', v_app.status;
  END IF;

  IF EXISTS (SELECT 1 FROM public.tutors WHERE id = v_slug) THEN
    RAISE EXCEPTION 'المعرف (%) مستخدم بالفعل لمعلم آخر. يرجى اختيار معرف مختلف.', v_slug;
  END IF;

  IF COALESCE(BTRIM(v_app.full_name), '') = '' THEN
    RAISE EXCEPTION 'لا يمكن اعتماد طلب بدون الاسم الكامل للمعلم.';
  END IF;

  IF COALESCE(BTRIM(v_app.phone), '') = '' THEN
    RAISE EXCEPTION 'لا يمكن اعتماد طلب بدون رقم هاتف التواصل.';
  END IF;

  -- Strictly validate specializations by track using explicitly typed variables
  IF v_app.track = 'school' THEN
    SELECT
      r.is_valid,
      COALESCE(r.course_option_ids, '{}'::UUID[]),
      COALESCE(r.normalized_specs, '[]'::JSONB),
      COALESCE(r.subjects, '{}'::TEXT[]),
      COALESCE(r.stages, '{}'::TEXT[]),
      COALESCE(r.curricula, '{}'::TEXT[]),
      COALESCE(r.unmatched_errors, '{}'::TEXT[])
    INTO
      v_val_is_valid,
      v_val_course_option_ids,
      v_val_normalized_specs,
      v_val_subjects,
      v_val_stages,
      v_val_curricula,
      v_val_errors
    FROM public.resolve_and_validate_school_specializations(
      COALESCE(v_app.school_specializations, '[]'::JSONB),
      COALESCE(v_app.school_course_option_ids, '{}'::UUID[])
    ) AS r;

    IF NOT COALESCE(v_val_is_valid, FALSE) THEN
      RAISE EXCEPTION 'لا يمكن اعتماد طلب المسار المدرسي لوجود تخصصات غير مطابقة أو تحتاج إلى تصحيح: %',
        ARRAY_TO_STRING(v_val_errors, ' | ');
    END IF;

    v_curriculum_tags := CASE
      WHEN cardinality(v_val_curricula) > 0 THEN v_val_curricula
      ELSE COALESCE(v_app.curricula, '{}'::TEXT[])
    END;

  ELSIF v_app.track = 'quran' THEN
    SELECT
      r.is_valid,
      COALESCE(r.age_groups, '{}'::TEXT[]),
      COALESCE(r.levels, '{}'::TEXT[]),
      COALESCE(r.quran_offerings, '[]'::JSONB),
      COALESCE(r.unmatched_errors, '{}'::TEXT[])
    INTO
      v_val_is_valid,
      v_val_age_groups,
      v_val_levels,
      v_val_quran_offerings,
      v_val_errors
    FROM public.resolve_and_validate_quran_specializations(
      COALESCE(v_app.quran_age_groups, '{}'::TEXT[]),
      COALESCE(v_app.quran_levels, '{}'::TEXT[]),
      COALESCE(v_app.quran_offerings, '[]'::JSONB)
    ) AS r;

    IF NOT COALESCE(v_val_is_valid, FALSE) THEN
      RAISE EXCEPTION 'لا يمكن اعتماد طلب مسار القرآن والتأسيس لوجود تخصصات غير مطابقة أو تحتاج إلى تصحيح: %',
        ARRAY_TO_STRING(v_val_errors, ' | ');
    END IF;

    v_curriculum_tags := '{}'::TEXT[];
  ELSE
    RAISE EXCEPTION 'مسار الطلب (%) غير مدعوم.', v_app.track;
  END IF;

  -- Parse experience years safely using reliable minimum, keeping original text in experience_badge_text
  v_exp_years := public.parse_tutor_experience_years(v_app.experience_years);
  v_rate := GREATEST(COALESCE(v_app.suggested_hourly_rate, 120), 0);
  v_duration := COALESCE(v_app.session_duration_minutes, 50);
  IF v_duration <= 0 THEN
    v_duration := 50;
  END IF;

  v_headline := COALESCE(
    NULLIF(BTRIM(v_app.academic_degree), ''),
    CASE
      WHEN v_app.track = 'quran' THEN 'معلم قرآن كريم وتأسيس'
      ELSE 'معلم مناهج مدرسية'
    END
  );

  -- 1. Create tutor profile as unpublished draft (is_published = FALSE)
  --    Policy: rating = NULL, reviews_count = 0, verified_credentials = FALSE, avatar_url = NULL
  INSERT INTO public.tutors (
    id,
    name,
    honorific,
    headline,
    avatar_url,
    verified_credentials,
    years_of_experience,
    experience_badge_text,
    curriculum_tags,
    hourly_rate_min,
    hourly_rate_max,
    currency,
    session_duration_minutes,
    trial_duration_minutes,
    rating,
    reviews_count,
    total_students_taught,
    help_child_quote,
    help_child_summary,
    target_student_cases,
    is_published,
    created_at,
    updated_at
  ) VALUES (
    v_slug,
    BTRIM(v_app.full_name),
    'أ.',
    v_headline,
    NULL,
    FALSE,
    v_exp_years,
    v_app.experience_years,
    v_curriculum_tags,
    v_rate,
    v_rate,
    COALESCE(NULLIF(BTRIM(v_app.currency), ''), 'ج.م'),
    v_duration,
    20,
    NULL,
    0,
    0,
    NULL,
    v_app.bio_and_methodology,
    '{}'::TEXT[],
    FALSE,
    NOW(),
    NOW()
  );

  -- 2. Save qualification record in public.tutor_qualifications with verified = FALSE
  IF COALESCE(BTRIM(v_app.academic_degree), '') <> '' THEN
    INSERT INTO public.tutor_qualifications (
      tutor_id,
      title,
      institution,
      verified,
      notes,
      display_order
    ) VALUES (
      v_slug,
      BTRIM(v_app.academic_degree),
      NULLIF(BTRIM(COALESCE(v_app.institution, '')), ''),
      FALSE,
      'تم تسجيله عبر طلب الانضمام ويحتاج مراجعة الشهادة',
      1
    );
  END IF;

  -- 3. Save private contact info in public.tutor_private_info (exact schema from 001 & 005)
  INSERT INTO public.tutor_private_info (
    tutor_id,
    full_legal_name,
    country_code,
    phone_number,
    whatsapp_number,
    email,
    internal_notes,
    created_at,
    updated_at
  ) VALUES (
    v_slug,
    BTRIM(v_app.full_name),
    COALESCE(NULLIF(BTRIM(v_app.country_code), ''), '+20'),
    BTRIM(v_app.phone),
    COALESCE(NULLIF(BTRIM(v_app.whatsapp_number), ''), BTRIM(v_app.phone)),
    v_app.email,
    CONCAT(
      'معتمد من طلب الانضمام: ',
      v_app.reference_code,
      CASE WHEN NULLIF(BTRIM(COALESCE(p_admin_notes, '')), '') IS NOT NULL THEN CONCAT(' | ملاحظات: ', BTRIM(p_admin_notes)) ELSE '' END
    ),
    NOW(),
    NOW()
  )
  ON CONFLICT (tutor_id) DO UPDATE SET
    full_legal_name = EXCLUDED.full_legal_name,
    country_code = EXCLUDED.country_code,
    phone_number = EXCLUDED.phone_number,
    whatsapp_number = EXCLUDED.whatsapp_number,
    email = EXCLUDED.email,
    internal_notes = EXCLUDED.internal_notes,
    updated_at = NOW();

  -- 4. Insert verified offerings and update application per track (completely separated)
  IF v_app.track = 'school' THEN
    FOREACH v_opt_id IN ARRAY v_val_course_option_ids
    LOOP
      INSERT INTO public.tutor_school_offerings (
        tutor_id,
        course_option_id
      ) VALUES (
        v_slug,
        v_opt_id
      )
      ON CONFLICT (tutor_id, course_option_id) DO NOTHING;
      v_school_count := v_school_count + 1;
    END LOOP;

    UPDATE public.tutor_applications
    SET
      status = 'approved',
      applicant_tutor_id = v_slug,
      subjects = v_val_subjects,
      stages = v_val_stages,
      curricula = v_val_curricula,
      school_course_option_ids = v_val_course_option_ids,
      school_specializations = v_val_normalized_specs,
      admin_notes = COALESCE(NULLIF(BTRIM(p_admin_notes), ''), admin_notes),
      reviewed_at = NOW(),
      reviewed_by = auth.uid(),
      updated_at = NOW()
    WHERE id = p_application_id;

  ELSIF v_app.track = 'quran' THEN
    FOR v_pair IN SELECT value FROM jsonb_array_elements(v_val_quran_offerings)
    LOOP
      INSERT INTO public.tutor_quran_offerings (
        tutor_id,
        age_group_id,
        level_id
      ) VALUES (
        v_slug,
        v_pair->>'ageGroupId',
        v_pair->>'levelId'
      )
      ON CONFLICT (tutor_id, age_group_id, level_id) DO NOTHING;
      v_quran_count := v_quran_count + 1;
    END LOOP;

    UPDATE public.tutor_applications
    SET
      status = 'approved',
      applicant_tutor_id = v_slug,
      quran_age_groups = v_val_age_groups,
      quran_levels = v_val_levels,
      quran_offerings = v_val_quran_offerings,
      admin_notes = COALESCE(NULLIF(BTRIM(p_admin_notes), ''), admin_notes),
      reviewed_at = NOW(),
      reviewed_by = auth.uid(),
      updated_at = NOW()
    WHERE id = p_application_id;
  END IF;

  -- 5. Link tutor account in public.tutor_account_links if user_id is present
  IF v_app.user_id IS NOT NULL THEN
    INSERT INTO public.tutor_account_links (
      user_id,
      tutor_id,
      is_active,
      must_change_password
    ) VALUES (
      v_app.user_id,
      v_slug,
      TRUE,
      FALSE
    )
    ON CONFLICT (user_id) DO UPDATE SET
      tutor_id = EXCLUDED.tutor_id,
      is_active = TRUE,
      updated_at = NOW();
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'tutorId', v_slug,
    'applicationId', p_application_id,
    'status', 'approved',
    'isPublished', FALSE,
    'schoolOfferingsCount', v_school_count,
    'quranOfferingsCount', v_quran_count,
    'message', 'تم قبول المعلم وإنشاء مسودة ملفه وربط حسابه بنجاح (بانتظار النشر).'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_tutor_application(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_tutor_application(UUID, TEXT, TEXT) TO authenticated, service_role;

-- =============================================================================
-- 7. RPC: admin_sync_approved_application_offerings
-- - Dedicated, reviewable synchronization function for already-approved applications.
-- - Validates specializations strictly without merging 'math_en' with 'math' and
--   without silent dropping.
-- - ONLY inserts missing offerings (ON CONFLICT DO NOTHING).
-- - NEVER re-enables disabled offerings, NEVER modifies tutor prices, durations,
--   ratings, verification, or publication status, and NEVER modifies draft applications.
-- =============================================================================
DROP FUNCTION IF EXISTS public.admin_sync_approved_application_offerings(UUID);

CREATE OR REPLACE FUNCTION public.admin_sync_approved_application_offerings(
  p_application_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.tutor_applications;
  v_tutor_id TEXT;
  v_val_is_valid BOOLEAN := FALSE;
  v_val_course_option_ids UUID[] := '{}'::UUID[];
  v_val_normalized_specs JSONB := '[]'::JSONB;
  v_val_subjects TEXT[] := '{}'::TEXT[];
  v_val_stages TEXT[] := '{}'::TEXT[];
  v_val_curricula TEXT[] := '{}'::TEXT[];
  v_val_age_groups TEXT[] := '{}'::TEXT[];
  v_val_levels TEXT[] := '{}'::TEXT[];
  v_val_quran_offerings JSONB := '[]'::JSONB;
  v_val_errors TEXT[] := '{}'::TEXT[];
  v_opt_id UUID;
  v_pair JSONB;
  v_inserted_school INTEGER := 0;
  v_inserted_quran INTEGER := 0;
  v_total_school INTEGER := 0;
  v_total_quran INTEGER := 0;
  v_row_count INTEGER := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'غير مصرح: هذه العملية متاحة للمشرفين المعتمدين فقط.';
  END IF;

  SELECT * INTO v_app
  FROM public.tutor_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF v_app.id IS NULL THEN
    RAISE EXCEPTION 'طلب الانضمام غير موجود.';
  END IF;

  IF v_app.status <> 'approved' OR COALESCE(BTRIM(v_app.applicant_tutor_id), '') = '' THEN
    RAISE EXCEPTION 'لا يمكن مزامنة العروض إلا لطلب معتمد ومرتبط بملف معلم.';
  END IF;

  v_tutor_id := BTRIM(v_app.applicant_tutor_id);

  IF NOT EXISTS (SELECT 1 FROM public.tutors WHERE id = v_tutor_id) THEN
    RAISE EXCEPTION 'ملف المعلم المرتبط بالطلب (%) غير موجود.', v_tutor_id;
  END IF;

  IF v_app.track = 'school' THEN
    SELECT
      r.is_valid,
      COALESCE(r.course_option_ids, '{}'::UUID[]),
      COALESCE(r.normalized_specs, '[]'::JSONB),
      COALESCE(r.subjects, '{}'::TEXT[]),
      COALESCE(r.stages, '{}'::TEXT[]),
      COALESCE(r.curricula, '{}'::TEXT[]),
      COALESCE(r.unmatched_errors, '{}'::TEXT[])
    INTO
      v_val_is_valid,
      v_val_course_option_ids,
      v_val_normalized_specs,
      v_val_subjects,
      v_val_stages,
      v_val_curricula,
      v_val_errors
    FROM public.resolve_and_validate_school_specializations(
      COALESCE(v_app.school_specializations, '[]'::JSONB),
      COALESCE(v_app.school_course_option_ids, '{}'::UUID[])
    ) AS r;

    IF NOT COALESCE(v_val_is_valid, FALSE) THEN
      RAISE EXCEPTION 'تعذر مزامنة تخصصات المعلم لوجود عناصر غير مطابقة تحتاج إلى تصحيح: %',
        ARRAY_TO_STRING(v_val_errors, ' | ');
    END IF;

    FOREACH v_opt_id IN ARRAY v_val_course_option_ids
    LOOP
      INSERT INTO public.tutor_school_offerings (
        tutor_id,
        course_option_id
      ) VALUES (
        v_tutor_id,
        v_opt_id
      )
      ON CONFLICT (tutor_id, course_option_id) DO NOTHING;

      GET DIAGNOSTICS v_row_count = ROW_COUNT;
      v_inserted_school := v_inserted_school + v_row_count;
    END LOOP;

    IF COALESCE(cardinality(v_app.school_course_option_ids), 0) = 0 THEN
      UPDATE public.tutor_applications
      SET
        school_course_option_ids = v_val_course_option_ids,
        updated_at = NOW()
      WHERE id = v_app.id;
    END IF;

  ELSIF v_app.track = 'quran' THEN
    SELECT
      r.is_valid,
      COALESCE(r.age_groups, '{}'::TEXT[]),
      COALESCE(r.levels, '{}'::TEXT[]),
      COALESCE(r.quran_offerings, '[]'::JSONB),
      COALESCE(r.unmatched_errors, '{}'::TEXT[])
    INTO
      v_val_is_valid,
      v_val_age_groups,
      v_val_levels,
      v_val_quran_offerings,
      v_val_errors
    FROM public.resolve_and_validate_quran_specializations(
      COALESCE(v_app.quran_age_groups, '{}'::TEXT[]),
      COALESCE(v_app.quran_levels, '{}'::TEXT[]),
      COALESCE(v_app.quran_offerings, '[]'::JSONB)
    ) AS r;

    IF NOT COALESCE(v_val_is_valid, FALSE) THEN
      RAISE EXCEPTION 'تعذر مزامنة تخصصات القرآن للمعلم لوجود عناصر غير مطابقة تحتاج إلى تصحيح: %',
        ARRAY_TO_STRING(v_val_errors, ' | ');
    END IF;

    FOR v_pair IN SELECT value FROM jsonb_array_elements(v_val_quran_offerings)
    LOOP
      INSERT INTO public.tutor_quran_offerings (
        tutor_id,
        age_group_id,
        level_id
      ) VALUES (
        v_tutor_id,
        v_pair->>'ageGroupId',
        v_pair->>'levelId'
      )
      ON CONFLICT (tutor_id, age_group_id, level_id) DO NOTHING;

      GET DIAGNOSTICS v_row_count = ROW_COUNT;
      v_inserted_quran := v_inserted_quran + v_row_count;
    END LOOP;

    IF v_app.quran_offerings IS NULL
       OR jsonb_typeof(v_app.quran_offerings) <> 'array'
       OR jsonb_array_length(v_app.quran_offerings) = 0 THEN
      UPDATE public.tutor_applications
      SET
        quran_offerings = v_val_quran_offerings,
        updated_at = NOW()
      WHERE id = v_app.id;
    END IF;
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_total_school
  FROM public.tutor_school_offerings
  WHERE tutor_id = v_tutor_id;

  SELECT COUNT(*)::INTEGER INTO v_total_quran
  FROM public.tutor_quran_offerings
  WHERE tutor_id = v_tutor_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'applicationId', p_application_id,
    'tutorId', v_tutor_id,
    'insertedSchoolOfferingsCount', v_inserted_school,
    'insertedQuranOfferingsCount', v_inserted_quran,
    'schoolOfferingsCount', v_total_school,
    'quranOfferingsCount', v_total_quran
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_sync_approved_application_offerings(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_sync_approved_application_offerings(UUID) TO authenticated, service_role;

-- =============================================================================
-- 8. SEPARATE REVIEWABLE DATA REPAIR SECTION (Existing Approved Tutors Only)
-- - Only populates missing school_course_option_ids / tutor_school_offerings /
--   tutor_quran_offerings when 100% of the application's specialization items
--   pass strict validation (v_val_is_valid = TRUE, zero unmatched items).
-- - Uses ON CONFLICT DO NOTHING: never re-enables disabled offerings and never
--   modifies prices, session durations, or tutor publication states.
-- - Never converts 'draft' applications to 'submitted' or any other status.
-- =============================================================================
DO $$
DECLARE
  r RECORD;
  v_val_is_valid BOOLEAN := FALSE;
  v_val_course_option_ids UUID[] := '{}'::UUID[];
  v_val_normalized_specs JSONB := '[]'::JSONB;
  v_val_subjects TEXT[] := '{}'::TEXT[];
  v_val_stages TEXT[] := '{}'::TEXT[];
  v_val_curricula TEXT[] := '{}'::TEXT[];
  v_val_age_groups TEXT[] := '{}'::TEXT[];
  v_val_levels TEXT[] := '{}'::TEXT[];
  v_val_quran_offerings JSONB := '[]'::JSONB;
  v_val_errors TEXT[] := '{}'::TEXT[];
  v_opt_id UUID;
  v_pair JSONB;
BEGIN
  FOR r IN
    SELECT
      a.id,
      a.status,
      a.track,
      a.school_specializations,
      a.school_course_option_ids,
      a.quran_age_groups,
      a.quran_levels,
      a.quran_offerings,
      a.applicant_tutor_id
    FROM public.tutor_applications a
    WHERE a.status IN ('submitted', 'needs_info', 'approved', 'pending_review', 'interview_scheduled')
  LOOP
    IF r.track = 'school'
       AND r.school_specializations IS NOT NULL
       AND jsonb_typeof(r.school_specializations) = 'array'
       AND jsonb_array_length(r.school_specializations) > 0 THEN

      SELECT
        res.is_valid,
        COALESCE(res.course_option_ids, '{}'::UUID[]),
        COALESCE(res.normalized_specs, '[]'::JSONB),
        COALESCE(res.subjects, '{}'::TEXT[]),
        COALESCE(res.stages, '{}'::TEXT[]),
        COALESCE(res.curricula, '{}'::TEXT[]),
        COALESCE(res.unmatched_errors, '{}'::TEXT[])
      INTO
        v_val_is_valid,
        v_val_course_option_ids,
        v_val_normalized_specs,
        v_val_subjects,
        v_val_stages,
        v_val_curricula,
        v_val_errors
      FROM public.resolve_and_validate_school_specializations(
        r.school_specializations,
        COALESCE(r.school_course_option_ids, '{}'::UUID[])
      ) AS res;

      -- Only backfill when 100% of specialization items and grades are valid (no silent dropping)
      IF COALESCE(v_val_is_valid, FALSE) THEN
        IF COALESCE(cardinality(r.school_course_option_ids), 0) = 0 THEN
          UPDATE public.tutor_applications
          SET school_course_option_ids = v_val_course_option_ids
          WHERE id = r.id;
        END IF;

        IF r.status = 'approved'
           AND r.applicant_tutor_id IS NOT NULL
           AND EXISTS (SELECT 1 FROM public.tutors t WHERE t.id = r.applicant_tutor_id) THEN
          FOREACH v_opt_id IN ARRAY v_val_course_option_ids
          LOOP
            INSERT INTO public.tutor_school_offerings (
              tutor_id,
              course_option_id
            ) VALUES (
              r.applicant_tutor_id,
              v_opt_id
            )
            ON CONFLICT (tutor_id, course_option_id) DO NOTHING;
          END LOOP;
        END IF;
      END IF;

    ELSIF r.track = 'quran' THEN
      SELECT
        res.is_valid,
        COALESCE(res.age_groups, '{}'::TEXT[]),
        COALESCE(res.levels, '{}'::TEXT[]),
        COALESCE(res.quran_offerings, '[]'::JSONB),
        COALESCE(res.unmatched_errors, '{}'::TEXT[])
      INTO
        v_val_is_valid,
        v_val_age_groups,
        v_val_levels,
        v_val_quran_offerings,
        v_val_errors
      FROM public.resolve_and_validate_quran_specializations(
        COALESCE(r.quran_age_groups, '{}'::TEXT[]),
        COALESCE(r.quran_levels, '{}'::TEXT[]),
        COALESCE(r.quran_offerings, '[]'::JSONB)
      ) AS res;

      IF COALESCE(v_val_is_valid, FALSE) THEN
        IF r.status = 'approved'
           AND r.applicant_tutor_id IS NOT NULL
           AND EXISTS (SELECT 1 FROM public.tutors t WHERE t.id = r.applicant_tutor_id) THEN
          FOR v_pair IN SELECT value FROM jsonb_array_elements(v_val_quran_offerings)
          LOOP
            INSERT INTO public.tutor_quran_offerings (
              tutor_id,
              age_group_id,
              level_id
            ) VALUES (
              r.applicant_tutor_id,
              v_pair->>'ageGroupId',
              v_pair->>'levelId'
            )
            ON CONFLICT (tutor_id, age_group_id, level_id) DO NOTHING;
          END LOOP;
        END IF;
      END IF;
    END IF;
  END LOOP;
END;
$$;

COMMIT;
