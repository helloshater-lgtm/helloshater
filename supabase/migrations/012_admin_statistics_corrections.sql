-- ==============================================================================
-- Shatir Classes (شاطر كلاسيز) - Supabase Migration 012
-- File: supabase/migrations/012_admin_statistics_corrections.sql
-- Description:
--   تصحيح شامل لإحصائيات لوحة الإدارة (قراءة فقط للمشرفين المعتمدين public.is_admin()):
--   1. إيقاف استنتاج هوية الطالب من الاسم أو الهاتف؛ إرجاع uniqueConfirmedStudents = NULL
--      مع سبب عدم التوفر لحين وجود معرف طالب مستقل.
--   2. فصل حالات الحجوزات والاشتراكات بدقة: confirmed, completed, pending, cancelled
--      دون دمج completed داخل confirmed أو جمع المؤكد والمعلق تحت مسمى "نشط".
--   3. إزالة حسابات وعروض الإيرادات المالية من الإحصائيات.
--   4. الاعتماد الحصري على المعرفات المرجعية والعلاقات الفعلية (offering_course_option_id,
--      quran_age_group_id, quran_level_id, slot_id, group_id) مع ربط احتياطي صارم فقط
--      بالتطابق النصي الكامل مع تخصص وحيد غير غامض لنفس المعلم، وحذف كل تخمين نصي.
--   5. تضمين العناصر المرجعية غير النشطة (is_active = FALSE) مع راية isActive لمنع إسقاط
--      البيانات التاريخية بصمت.
--   6. تجميع كافة الإحصائيات داخل قاعدة البيانات وإرجاع ملخصات جاهزة، مع توفير دالة
--      مستقلة مقسمة بـ Pagination (admin_get_statistics_drilldown) لجلب تفاصيل أي رقم
--      أو قائمة السجلات غير المصنفة عند الطلب.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 0. دالة جلب البيانات المرجعية لتخصصات الحصص الخاصة والمجموعات للإحصائيات الإدارية
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_get_classes_specialization_metadata();
CREATE OR REPLACE FUNCTION public.admin_get_classes_specialization_metadata()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
STABLE
AS $$
DECLARE
    v_private_slots JSONB;
    v_groups JSONB;
    v_trial_summary JSONB;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذا الإجراء مخصص لمشرفي النظام فقط.';
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', ps.id,
                'tutor_id', ps.tutor_id,
                'offering_course_option_id', ps.offering_course_option_id,
                'quran_age_group_id', ps.quran_age_group_id,
                'quran_level_id', ps.quran_level_id,
                'specialization_label', ps.specialization_label,
                'slot_date', ps.slot_date,
                'start_time', ps.start_time,
                'end_time', ps.end_time,
                'timezone', ps.timezone,
                'price_amount', ps.price_amount,
                'currency', ps.currency,
                'is_available', ps.is_available,
                'is_booked', ps.is_booked,
                'admin_suspended', COALESCE(ps.admin_suspended, FALSE),
                'is_future', (
                    (ps.slot_date + ps.start_time) AT TIME ZONE COALESCE(NULLIF(TRIM(ps.timezone), ''), 'Africa/Cairo') > NOW()
                )
            )
        ),
        '[]'::jsonb
    )
    INTO v_private_slots
    FROM public.tutor_private_slots ps;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', g.id,
                'tutor_id', g.tutor_id,
                'title', g.title,
                'offering_course_option_id', g.offering_course_option_id,
                'quran_age_group_id', g.quran_age_group_id,
                'quran_level_id', g.quran_level_id,
                'specialization_label', g.specialization_label,
                'max_students', g.max_students,
                'price_per_student', g.price_per_student,
                'price_type', g.price_type,
                'currency', g.currency,
                'review_status', g.review_status,
                'status', g.status,
                'is_published', g.is_published,
                'admin_suspended', COALESCE(g.admin_suspended, FALSE)
            )
        ),
        '[]'::jsonb
    )
    INTO v_groups
    FROM public.tutor_groups g;

    SELECT jsonb_build_object(
        'total_slots', COUNT(*)::INTEGER,
        'available_future_slots', COUNT(*) FILTER (
            WHERE s.is_available = TRUE
              AND COALESCE(s.admin_suspended, FALSE) = FALSE
              AND COALESCE(s.is_booked, FALSE) = FALSE
              AND (s.slot_date + s.start_time) AT TIME ZONE COALESCE(NULLIF(TRIM(s.timezone), ''), 'Africa/Cairo') > NOW()
        )::INTEGER,
        'booked_slots', COUNT(*) FILTER (WHERE COALESCE(s.is_booked, FALSE) = TRUE)::INTEGER,
        'suspended_slots', COUNT(*) FILTER (WHERE COALESCE(s.admin_suspended, FALSE) = TRUE)::INTEGER
    )
    INTO v_trial_summary
    FROM public.tutor_available_slots s;

    RETURN jsonb_build_object(
        'private_slots', v_private_slots,
        'groups', v_groups,
        'trial_summary', COALESCE(
            v_trial_summary,
            jsonb_build_object(
                'total_slots', 0,
                'available_future_slots', 0,
                'booked_slots', 0,
                'suspended_slots', 0
            )
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_classes_specialization_metadata() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_classes_specialization_metadata() TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 1. دالة التجميع الشامل لإحصائيات المنصة داخل قاعدة البيانات
--    public.admin_get_platform_statistics()
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_get_platform_statistics();
CREATE OR REPLACE FUNCTION public.admin_get_platform_statistics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
STABLE
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذا الإجراء مخصص لمشرفي النظام فقط.';
    END IF;

    WITH
    -- 1. الجداول المرجعية الكاملة (بما فيها غير النشطة لحفظ السجلات التاريخية)
    ref_stages AS (
        SELECT
            es.id,
            es.name,
            es.grades_desc,
            es.display_order,
            es.is_active
        FROM public.educational_stages es
    ),
    ref_grades AS (
        SELECT
            eg.id,
            eg.stage_id,
            eg.name,
            eg.display_order,
            eg.is_active,
            es.name AS stage_name,
            es.is_active AS stage_is_active
        FROM public.educational_grades eg
        JOIN ref_stages es ON es.id = eg.stage_id
    ),
    ref_curricula AS (
        SELECT
            ct.id,
            ct.name,
            ct.description,
            ct.display_order,
            ct.is_active
        FROM public.curriculum_types ct
    ),
    ref_subjects AS (
        SELECT
            s.id,
            s.name,
            s.english_name,
            s.category,
            s.display_order,
            s.is_active
        FROM public.subjects s
    ),
    ref_course_options AS (
        SELECT
            sco.id,
            sco.grade_id,
            rg.name AS grade_name,
            rg.stage_id,
            rg.stage_name,
            sco.subject_id,
            rs.name AS subject_name,
            sco.curriculum_id,
            rc.name AS curriculum_name,
            (rs.name || ' - ' || rg.name || ' (' || rc.name || ')') AS canonical_label,
            (sco.is_active AND rg.is_active AND rg.stage_is_active AND rs.is_active AND rc.is_active) AS is_active,
            rs.display_order AS subject_order,
            rg.display_order AS grade_order,
            rc.display_order AS curriculum_order
        FROM public.school_course_options sco
        JOIN ref_grades rg ON rg.id = sco.grade_id
        JOIN ref_subjects rs ON rs.id = sco.subject_id
        JOIN ref_curricula rc ON rc.id = sco.curriculum_id
    ),
    ref_quran_levels AS (
        SELECT
            ql.id,
            ql.name,
            ql.description,
            ql.display_order,
            ql.is_active
        FROM public.quran_levels ql
    ),
    ref_quran_age_groups AS (
        SELECT
            qag.id,
            qag.name,
            qag.age_range,
            qag.display_order,
            qag.is_active
        FROM public.quran_age_groups qag
    ),
    ref_quran_pairs AS (
        SELECT
            ('quran:' || ql.id || ':' || qag.id) AS pair_id,
            (ql.id || '|' || qag.id) AS pair_key,
            ql.id AS level_id,
            ql.name AS level_name,
            qag.id AS age_group_id,
            qag.name AS age_group_name,
            ('قرآن وتأسيس: ' || ql.name || ' (' || qag.name || ')') AS canonical_label,
            (ql.is_active AND qag.is_active) AS is_active,
            ql.display_order AS level_order,
            qag.display_order AS age_order
        FROM ref_quran_levels ql
        CROSS JOIN ref_quran_age_groups qag
    ),

    -- 2. المعلمون وتخصصاتهم المرجعية
    valid_tutors AS (
        SELECT
            t.id,
            t.name,
            t.honorific,
            t.is_published,
            t.created_at
        FROM public.tutors t
    ),
    resolved_tutor_school AS (
        SELECT
            tso.id AS offering_id,
            tso.tutor_id,
            vt.is_published,
            rco.id AS course_option_id,
            rco.subject_id,
            rco.grade_id,
            rco.stage_id,
            rco.curriculum_id,
            rco.canonical_label,
            CASE
                WHEN vt.id IS NULL THEN 'unclassified'
                WHEN rco.id IS NULL THEN 'unclassified'
                ELSE 'school'
            END AS res_status
        FROM public.tutor_school_offerings tso
        LEFT JOIN valid_tutors vt ON vt.id = tso.tutor_id
        LEFT JOIN ref_course_options rco ON rco.id = tso.course_option_id
    ),
    resolved_tutor_quran AS (
        SELECT
            tqo.id AS offering_id,
            tqo.tutor_id,
            vt.is_published,
            rqp.pair_key,
            rqp.level_id,
            rqp.age_group_id,
            rqp.canonical_label,
            CASE
                WHEN vt.id IS NULL THEN 'unclassified'
                WHEN rqp.pair_key IS NULL THEN 'unclassified'
                ELSE 'quran'
            END AS res_status
        FROM public.tutor_quran_offerings tqo
        LEFT JOIN valid_tutors vt ON vt.id = tqo.tutor_id
        LEFT JOIN ref_quran_pairs rqp
            ON rqp.level_id = tqo.level_id
           AND rqp.age_group_id = tqo.age_group_id
    ),
    -- خريطة التسميات الرسمية المعتمدة لكل معلم لاستخدامها فقط عند غياب المعرف المرجعي بشرط عدم الغموض
    tutor_unambiguous_labels AS (
        SELECT
            tutor_id,
            TRIM(canonical_label) AS exact_label,
            COUNT(*) AS matches_count,
            MIN(res_track) AS res_track,
            MIN(course_option_id::TEXT) AS course_option_id_text,
            MIN(subject_id) AS subject_id,
            MIN(grade_id) AS grade_id,
            MIN(stage_id) AS stage_id,
            MIN(curriculum_id) AS curriculum_id,
            MIN(pair_key) AS pair_key,
            MIN(level_id) AS level_id,
            MIN(age_group_id) AS age_group_id
        FROM (
            SELECT
                rts.tutor_id,
                rts.canonical_label,
                'school'::TEXT AS res_track,
                rts.course_option_id,
                rts.subject_id,
                rts.grade_id,
                rts.stage_id,
                rts.curriculum_id,
                NULL::TEXT AS pair_key,
                NULL::TEXT AS level_id,
                NULL::TEXT AS age_group_id
            FROM resolved_tutor_school rts
            WHERE rts.res_status = 'school'
            UNION ALL
            SELECT
                rtq.tutor_id,
                rtq.canonical_label,
                'quran'::TEXT AS res_track,
                NULL::UUID AS course_option_id,
                NULL::TEXT AS subject_id,
                NULL::TEXT AS grade_id,
                NULL::TEXT AS stage_id,
                NULL::TEXT AS curriculum_id,
                rtq.pair_key,
                rtq.level_id,
                rtq.age_group_id
            FROM resolved_tutor_quran rtq
            WHERE rtq.res_status = 'quran'
        ) combined_specs
        GROUP BY tutor_id, TRIM(canonical_label)
    ),

    -- 3. تحليل طلبات انضمام المعلمين بالمعرفات المرجعية فقط
    raw_apps AS (
        SELECT
            a.id,
            a.full_name,
            a.phone,
            a.track,
            COALESCE(a.status, 'submitted') AS status,
            a.school_course_option_ids,
            a.school_specializations,
            a.quran_offerings,
            a.quran_levels,
            a.quran_age_groups,
            a.created_at
        FROM public.tutor_applications a
    ),
    -- 3.أ خيارات المواد المباشرة في school_course_option_ids
    app_opt_ids AS (
        SELECT
            a.id AS app_id,
            a.status,
            opt_id,
            rco.id AS valid_course_option_id,
            rco.subject_id,
            rco.grade_id,
            rco.stage_id,
            rco.curriculum_id
        FROM raw_apps a
        CROSS JOIN LATERAL unnest(COALESCE(a.school_course_option_ids, '{}'::UUID[])) AS opt_id
        LEFT JOIN ref_course_options rco ON rco.id = opt_id
    ),
    -- 3.ب التخصصات المهيكلة في school_specializations JSONB
    app_json_school_items AS (
        SELECT
            a.id AS app_id,
            a.status,
            spec_elem
        FROM raw_apps a
        CROSS JOIN LATERAL jsonb_array_elements(
            CASE
                WHEN a.school_specializations IS NOT NULL AND jsonb_typeof(a.school_specializations) = 'array'
                THEN a.school_specializations
                ELSE '[]'::jsonb
            END
        ) AS spec_elem
    ),
    app_json_school_expanded AS (
        SELECT
            j.app_id,
            j.status,
            NULLIF(TRIM(COALESCE(j.spec_elem->>'courseOptionId', '')), '') AS raw_co_id,
            NULLIF(TRIM(COALESCE(j.spec_elem->>'subjectId', '')), '') AS raw_subj_id,
            NULLIF(TRIM(COALESCE(j.spec_elem->>'stageId', '')), '') AS raw_stage_id,
            NULLIF(TRIM(COALESCE(
                j.spec_elem->>'curriculumId',
                j.spec_elem->>'curriculumTypeId',
                j.spec_elem->>'curriculumType',
                ''
            )), '') AS raw_curr_id,
            g_id AS raw_grade_id,
            CASE
                WHEN j.spec_elem ? 'gradeIds'
                     AND jsonb_typeof(j.spec_elem->'gradeIds') = 'array'
                     AND jsonb_array_length(j.spec_elem->'gradeIds') > 0
                THEN TRUE
                ELSE FALSE
            END AS has_grade_array
        FROM app_json_school_items j
        LEFT JOIN LATERAL jsonb_array_elements_text(
            CASE
                WHEN j.spec_elem ? 'gradeIds'
                     AND jsonb_typeof(j.spec_elem->'gradeIds') = 'array'
                     AND jsonb_array_length(j.spec_elem->'gradeIds') > 0
                THEN j.spec_elem->'gradeIds'
                ELSE '[]'::jsonb
            END
        ) AS g_id ON TRUE
    ),
    app_json_school_resolved AS (
        SELECT
            e.app_id,
            e.status,
            COALESCE(rco_direct.id, rco_triplet.id) AS valid_course_option_id,
            COALESCE(rco_direct.subject_id, rco_triplet.subject_id) AS subject_id,
            COALESCE(rco_direct.grade_id, rco_triplet.grade_id) AS grade_id,
            COALESCE(rco_direct.stage_id, rco_triplet.stage_id) AS stage_id,
            COALESCE(rco_direct.curriculum_id, rco_triplet.curriculum_id) AS curriculum_id,
            CASE
                WHEN e.raw_co_id IS NOT NULL THEN (rco_direct.id IS NOT NULL)
                WHEN e.raw_subj_id IS NOT NULL AND e.raw_curr_id IS NOT NULL AND e.has_grade_array AND e.raw_grade_id IS NOT NULL THEN
                    (rco_triplet.id IS NOT NULL AND (e.raw_stage_id IS NULL OR e.raw_stage_id = rco_triplet.stage_id))
                ELSE FALSE
            END AS is_valid
        FROM app_json_school_expanded e
        LEFT JOIN ref_course_options rco_direct
            ON e.raw_co_id IS NOT NULL
           AND rco_direct.id::TEXT = e.raw_co_id
        LEFT JOIN ref_course_options rco_triplet
            ON e.raw_co_id IS NULL
           AND rco_triplet.subject_id = e.raw_subj_id
           AND rco_triplet.grade_id = e.raw_grade_id
           AND rco_triplet.curriculum_id = e.raw_curr_id
    ),
    app_valid_school_specs AS (
        SELECT DISTINCT
            app_id,
            status,
            valid_course_option_id AS course_option_id,
            subject_id,
            grade_id,
            stage_id,
            curriculum_id
        FROM (
            SELECT app_id, status, valid_course_option_id, subject_id, grade_id, stage_id, curriculum_id
            FROM app_opt_ids
            WHERE valid_course_option_id IS NOT NULL
            UNION ALL
            SELECT app_id, status, valid_course_option_id, subject_id, grade_id, stage_id, curriculum_id
            FROM app_json_school_resolved
            WHERE is_valid = TRUE AND valid_course_option_id IS NOT NULL
        ) s
    ),
    -- 3.ج المسار القرآني في طلبات الانضمام (بدون حاصل ضرب ديكارتي تخميني)
    app_json_quran_items AS (
        SELECT
            a.id AS app_id,
            a.status,
            NULLIF(TRIM(COALESCE(qo_elem->>'levelId', qo_elem->>'level_id', '')), '') AS raw_level_id,
            NULLIF(TRIM(COALESCE(qo_elem->>'ageGroupId', qo_elem->>'age_group_id', '')), '') AS raw_age_group_id
        FROM raw_apps a
        CROSS JOIN LATERAL jsonb_array_elements(
            CASE
                WHEN a.quran_offerings IS NOT NULL
                     AND jsonb_typeof(a.quran_offerings) = 'array'
                     AND jsonb_array_length(a.quran_offerings) > 0
                THEN a.quran_offerings
                -- فقط إذا لم يوجد quran_offerings وكان هناك مستوى واحد بالضبط وفئة عمرية واحدة بالضبط (علاقة 1:1 غير غامضة)
                WHEN COALESCE(array_length(a.quran_levels, 1), 0) = 1
                     AND COALESCE(array_length(a.quran_age_groups, 1), 0) = 1
                THEN jsonb_build_array(
                    jsonb_build_object(
                        'levelId', a.quran_levels[1],
                        'ageGroupId', a.quran_age_groups[1]
                    )
                )
                ELSE '[]'::jsonb
            END
        ) AS qo_elem
    ),
    app_json_quran_resolved AS (
        SELECT
            q.app_id,
            q.status,
            rqp.pair_key,
            rqp.level_id,
            rqp.age_group_id,
            (rqp.pair_key IS NOT NULL) AS is_valid
        FROM app_json_quran_items q
        LEFT JOIN ref_quran_pairs rqp
            ON rqp.level_id = q.raw_level_id
           AND rqp.age_group_id = q.raw_age_group_id
    ),
    app_valid_quran_specs AS (
        SELECT DISTINCT
            app_id,
            status,
            pair_key,
            level_id,
            age_group_id
        FROM app_json_quran_resolved
        WHERE is_valid = TRUE
    ),
    -- تحديد الطلبات التي تحتوي على سجلات غير مصنفة أو غامضة
    unclassified_apps AS (
        SELECT DISTINCT a.id AS app_id
        FROM raw_apps a
        LEFT JOIN app_valid_school_specs vss ON vss.app_id = a.id
        LEFT JOIN app_valid_quran_specs vqs ON vqs.app_id = a.id
        WHERE a.status <> 'draft'
          AND (
              -- لا يملك أي تخصص صالح إطلاقاً
              (vss.app_id IS NULL AND vqs.app_id IS NULL)
              -- أو يحتوي على معرف خيار مادة غير موجود
              OR EXISTS (
                  SELECT 1 FROM app_opt_ids o
                  WHERE o.app_id = a.id AND o.valid_course_option_id IS NULL
              )
              -- أو يحتوي على تخصص مدرسي مهيكل غير صالح
              OR EXISTS (
                  SELECT 1 FROM app_json_school_resolved js
                  WHERE js.app_id = a.id AND js.is_valid = FALSE
              )
              -- أو يحتوي على تخصص قرآني غير صالح
              OR EXISTS (
                  SELECT 1 FROM app_json_quran_resolved jq
                  WHERE jq.app_id = a.id AND jq.is_valid = FALSE
              )
              -- أو يحتوي على مصفوفات قرآنية متعددة المستويات/الأعمار بدون أزواج quran_offerings محددة
              OR (
                  (a.quran_offerings IS NULL OR jsonb_typeof(a.quran_offerings) <> 'array' OR jsonb_array_length(a.quran_offerings) = 0)
                  AND (COALESCE(array_length(a.quran_levels, 1), 0) > 0 OR COALESCE(array_length(a.quran_age_groups, 1), 0) > 0)
                  AND NOT (COALESCE(array_length(a.quran_levels, 1), 0) = 1 AND COALESCE(array_length(a.quran_age_groups, 1), 0) = 1)
              )
          )
    ),

    -- 4. المواعيد الخاصة (tutor_private_slots) وحل ارتباطها المرجعي الصارم
    resolved_private_slots AS (
        SELECT
            ps.id,
            ps.tutor_id,
            ps.specialization_label,
            ps.is_available,
            COALESCE(ps.is_booked, FALSE) AS is_booked,
            COALESCE(ps.admin_suspended, FALSE) AS admin_suspended,
            ((ps.slot_date + ps.start_time) AT TIME ZONE COALESCE(NULLIF(TRIM(ps.timezone), ''), 'Africa/Cairo') > NOW()) AS is_future,
            ps.created_at,
            CASE
                -- رفض خلط المسارين
                WHEN ps.offering_course_option_id IS NOT NULL AND (ps.quran_age_group_id IS NOT NULL OR ps.quran_level_id IS NOT NULL)
                    THEN 'unclassified'
                -- مسار مدرسي بمعرف مرجعي مباشر
                WHEN ps.offering_course_option_id IS NOT NULL THEN
                    CASE WHEN rco.id IS NOT NULL THEN 'school' ELSE 'unclassified' END
                -- مسار قرآني بمعرف مرجعي مباشر
                WHEN ps.quran_age_group_id IS NOT NULL OR ps.quran_level_id IS NOT NULL THEN
                    CASE WHEN rqp.pair_key IS NOT NULL THEN 'quran' ELSE 'unclassified' END
                -- ربط احتياطي صارم فقط إذا تطابق المسمى مع تخصص وحيد غير غامض لنفس المعلم
                WHEN tul.matches_count = 1 THEN tul.res_track
                ELSE 'unclassified'
            END AS res_status,
            CASE
                WHEN ps.offering_course_option_id IS NOT NULL AND ps.quran_age_group_id IS NULL AND ps.quran_level_id IS NULL THEN rco.id
                WHEN ps.offering_course_option_id IS NULL AND ps.quran_age_group_id IS NULL AND ps.quran_level_id IS NULL AND tul.matches_count = 1 AND tul.res_track = 'school'
                    THEN tul.course_option_id_text::UUID
                ELSE NULL
            END AS course_option_id,
            CASE
                WHEN ps.offering_course_option_id IS NOT NULL AND ps.quran_age_group_id IS NULL AND ps.quran_level_id IS NULL THEN rco.subject_id
                WHEN ps.offering_course_option_id IS NULL AND ps.quran_age_group_id IS NULL AND ps.quran_level_id IS NULL AND tul.matches_count = 1 AND tul.res_track = 'school'
                    THEN tul.subject_id
                ELSE NULL
            END AS subject_id,
            CASE
                WHEN ps.offering_course_option_id IS NOT NULL AND ps.quran_age_group_id IS NULL AND ps.quran_level_id IS NULL THEN rco.grade_id
                WHEN ps.offering_course_option_id IS NULL AND ps.quran_age_group_id IS NULL AND ps.quran_level_id IS NULL AND tul.matches_count = 1 AND tul.res_track = 'school'
                    THEN tul.grade_id
                ELSE NULL
            END AS grade_id,
            CASE
                WHEN ps.offering_course_option_id IS NOT NULL AND ps.quran_age_group_id IS NULL AND ps.quran_level_id IS NULL THEN rco.stage_id
                WHEN ps.offering_course_option_id IS NULL AND ps.quran_age_group_id IS NULL AND ps.quran_level_id IS NULL AND tul.matches_count = 1 AND tul.res_track = 'school'
                    THEN tul.stage_id
                ELSE NULL
            END AS stage_id,
            CASE
                WHEN ps.offering_course_option_id IS NOT NULL AND ps.quran_age_group_id IS NULL AND ps.quran_level_id IS NULL THEN rco.curriculum_id
                WHEN ps.offering_course_option_id IS NULL AND ps.quran_age_group_id IS NULL AND ps.quran_level_id IS NULL AND tul.matches_count = 1 AND tul.res_track = 'school'
                    THEN tul.curriculum_id
                ELSE NULL
            END AS curriculum_id,
            CASE
                WHEN ps.offering_course_option_id IS NULL AND (ps.quran_age_group_id IS NOT NULL OR ps.quran_level_id IS NOT NULL) THEN rqp.pair_key
                WHEN ps.offering_course_option_id IS NULL AND ps.quran_age_group_id IS NULL AND ps.quran_level_id IS NULL AND tul.matches_count = 1 AND tul.res_track = 'quran'
                    THEN tul.pair_key
                ELSE NULL
            END AS pair_key,
            CASE
                WHEN ps.offering_course_option_id IS NULL AND (ps.quran_age_group_id IS NOT NULL OR ps.quran_level_id IS NOT NULL) THEN rqp.level_id
                WHEN ps.offering_course_option_id IS NULL AND ps.quran_age_group_id IS NULL AND ps.quran_level_id IS NULL AND tul.matches_count = 1 AND tul.res_track = 'quran'
                    THEN tul.level_id
                ELSE NULL
            END AS level_id,
            CASE
                WHEN ps.offering_course_option_id IS NULL AND (ps.quran_age_group_id IS NOT NULL OR ps.quran_level_id IS NOT NULL) THEN rqp.age_group_id
                WHEN ps.offering_course_option_id IS NULL AND ps.quran_age_group_id IS NULL AND ps.quran_level_id IS NULL AND tul.matches_count = 1 AND tul.res_track = 'quran'
                    THEN tul.age_group_id
                ELSE NULL
            END AS age_group_id
        FROM public.tutor_private_slots ps
        LEFT JOIN ref_course_options rco ON rco.id = ps.offering_course_option_id
        LEFT JOIN ref_quran_pairs rqp
            ON rqp.age_group_id = ps.quran_age_group_id
           AND rqp.level_id = ps.quran_level_id
        LEFT JOIN tutor_unambiguous_labels tul
            ON tul.tutor_id = ps.tutor_id
           AND tul.exact_label = TRIM(ps.specialization_label)
    ),

    -- 5. المجموعات التعليمية (tutor_groups) وحل ارتباطها المرجعي الصارم
    resolved_groups AS (
        SELECT
            g.id,
            g.tutor_id,
            g.title,
            g.specialization_label,
            g.review_status,
            g.status,
            g.is_published,
            COALESCE(g.admin_suspended, FALSE) AS admin_suspended,
            (
                g.is_published = TRUE
                AND COALESCE(g.admin_suspended, FALSE) = FALSE
                AND g.review_status = 'approved'
                AND g.status IN ('open', 'in_progress')
            ) AS is_active_published_group,
            g.created_at,
            CASE
                WHEN g.offering_course_option_id IS NOT NULL AND (g.quran_age_group_id IS NOT NULL OR g.quran_level_id IS NOT NULL)
                    THEN 'unclassified'
                WHEN g.offering_course_option_id IS NOT NULL THEN
                    CASE WHEN rco.id IS NOT NULL THEN 'school' ELSE 'unclassified' END
                WHEN g.quran_age_group_id IS NOT NULL OR g.quran_level_id IS NOT NULL THEN
                    CASE WHEN rqp.pair_key IS NOT NULL THEN 'quran' ELSE 'unclassified' END
                WHEN tul.matches_count = 1 THEN tul.res_track
                ELSE 'unclassified'
            END AS res_status,
            CASE
                WHEN g.offering_course_option_id IS NOT NULL AND g.quran_age_group_id IS NULL AND g.quran_level_id IS NULL THEN rco.id
                WHEN g.offering_course_option_id IS NULL AND g.quran_age_group_id IS NULL AND g.quran_level_id IS NULL AND tul.matches_count = 1 AND tul.res_track = 'school'
                    THEN tul.course_option_id_text::UUID
                ELSE NULL
            END AS course_option_id,
            CASE
                WHEN g.offering_course_option_id IS NOT NULL AND g.quran_age_group_id IS NULL AND g.quran_level_id IS NULL THEN rco.subject_id
                WHEN g.offering_course_option_id IS NULL AND g.quran_age_group_id IS NULL AND g.quran_level_id IS NULL AND tul.matches_count = 1 AND tul.res_track = 'school'
                    THEN tul.subject_id
                ELSE NULL
            END AS subject_id,
            CASE
                WHEN g.offering_course_option_id IS NOT NULL AND g.quran_age_group_id IS NULL AND g.quran_level_id IS NULL THEN rco.grade_id
                WHEN g.offering_course_option_id IS NULL AND g.quran_age_group_id IS NULL AND g.quran_level_id IS NULL AND tul.matches_count = 1 AND tul.res_track = 'school'
                    THEN tul.grade_id
                ELSE NULL
            END AS grade_id,
            CASE
                WHEN g.offering_course_option_id IS NOT NULL AND g.quran_age_group_id IS NULL AND g.quran_level_id IS NULL THEN rco.stage_id
                WHEN g.offering_course_option_id IS NULL AND g.quran_age_group_id IS NULL AND g.quran_level_id IS NULL AND tul.matches_count = 1 AND tul.res_track = 'school'
                    THEN tul.stage_id
                ELSE NULL
            END AS stage_id,
            CASE
                WHEN g.offering_course_option_id IS NOT NULL AND g.quran_age_group_id IS NULL AND g.quran_level_id IS NULL THEN rco.curriculum_id
                WHEN g.offering_course_option_id IS NULL AND g.quran_age_group_id IS NULL AND g.quran_level_id IS NULL AND tul.matches_count = 1 AND tul.res_track = 'school'
                    THEN tul.curriculum_id
                ELSE NULL
            END AS curriculum_id,
            CASE
                WHEN g.offering_course_option_id IS NULL AND (g.quran_age_group_id IS NOT NULL OR g.quran_level_id IS NOT NULL) THEN rqp.pair_key
                WHEN g.offering_course_option_id IS NULL AND g.quran_age_group_id IS NULL AND g.quran_level_id IS NULL AND tul.matches_count = 1 AND tul.res_track = 'quran'
                    THEN tul.pair_key
                ELSE NULL
            END AS pair_key,
            CASE
                WHEN g.offering_course_option_id IS NULL AND (g.quran_age_group_id IS NOT NULL OR g.quran_level_id IS NOT NULL) THEN rqp.level_id
                WHEN g.offering_course_option_id IS NULL AND g.quran_age_group_id IS NULL AND g.quran_level_id IS NULL AND tul.matches_count = 1 AND tul.res_track = 'quran'
                    THEN tul.level_id
                ELSE NULL
            END AS level_id,
            CASE
                WHEN g.offering_course_option_id IS NULL AND (g.quran_age_group_id IS NOT NULL OR g.quran_level_id IS NOT NULL) THEN rqp.age_group_id
                WHEN g.offering_course_option_id IS NULL AND g.quran_age_group_id IS NULL AND g.quran_level_id IS NULL AND tul.matches_count = 1 AND tul.res_track = 'quran'
                    THEN tul.age_group_id
                ELSE NULL
            END AS age_group_id
        FROM public.tutor_groups g
        LEFT JOIN ref_course_options rco ON rco.id = g.offering_course_option_id
        LEFT JOIN ref_quran_pairs rqp
            ON rqp.age_group_id = g.quran_age_group_id
           AND rqp.level_id = g.quran_level_id
        LEFT JOIN tutor_unambiguous_labels tul
            ON tul.tutor_id = g.tutor_id
           AND tul.exact_label = TRIM(g.specialization_label)
    ),

    -- 6. حجوزات الحصص الخاصة (tutor_private_bookings) عبر علاقة slot_id المرجعية
    resolved_private_bookings AS (
        SELECT
            pb.id,
            pb.slot_id,
            pb.tutor_id,
            pb.student_name,
            pb.status,
            pb.created_at,
            CASE
                WHEN rps.id IS NULL OR rps.tutor_id <> pb.tutor_id THEN 'unclassified'
                ELSE rps.res_status
            END AS res_status,
            CASE WHEN rps.id IS NOT NULL AND rps.tutor_id = pb.tutor_id THEN rps.course_option_id ELSE NULL END AS course_option_id,
            CASE WHEN rps.id IS NOT NULL AND rps.tutor_id = pb.tutor_id THEN rps.subject_id ELSE NULL END AS subject_id,
            CASE WHEN rps.id IS NOT NULL AND rps.tutor_id = pb.tutor_id THEN rps.grade_id ELSE NULL END AS grade_id,
            CASE WHEN rps.id IS NOT NULL AND rps.tutor_id = pb.tutor_id THEN rps.stage_id ELSE NULL END AS stage_id,
            CASE WHEN rps.id IS NOT NULL AND rps.tutor_id = pb.tutor_id THEN rps.curriculum_id ELSE NULL END AS curriculum_id,
            CASE WHEN rps.id IS NOT NULL AND rps.tutor_id = pb.tutor_id THEN rps.pair_key ELSE NULL END AS pair_key,
            CASE WHEN rps.id IS NOT NULL AND rps.tutor_id = pb.tutor_id THEN rps.level_id ELSE NULL END AS level_id,
            CASE WHEN rps.id IS NOT NULL AND rps.tutor_id = pb.tutor_id THEN rps.age_group_id ELSE NULL END AS age_group_id
        FROM public.tutor_private_bookings pb
        LEFT JOIN resolved_private_slots rps ON rps.id = pb.slot_id
    ),

    -- 7. اشتراكات المجموعات (tutor_group_enrollments) عبر علاقة group_id المرجعية
    resolved_group_enrollments AS (
        SELECT
            ge.id,
            ge.group_id,
            ge.tutor_id,
            ge.student_name,
            ge.status,
            ge.created_at,
            CASE
                WHEN rg.id IS NULL OR rg.tutor_id <> ge.tutor_id THEN 'unclassified'
                ELSE rg.res_status
            END AS res_status,
            CASE WHEN rg.id IS NOT NULL AND rg.tutor_id = ge.tutor_id THEN rg.course_option_id ELSE NULL END AS course_option_id,
            CASE WHEN rg.id IS NOT NULL AND rg.tutor_id = ge.tutor_id THEN rg.subject_id ELSE NULL END AS subject_id,
            CASE WHEN rg.id IS NOT NULL AND rg.tutor_id = ge.tutor_id THEN rg.grade_id ELSE NULL END AS grade_id,
            CASE WHEN rg.id IS NOT NULL AND rg.tutor_id = ge.tutor_id THEN rg.stage_id ELSE NULL END AS stage_id,
            CASE WHEN rg.id IS NOT NULL AND rg.tutor_id = ge.tutor_id THEN rg.curriculum_id ELSE NULL END AS curriculum_id,
            CASE WHEN rg.id IS NOT NULL AND rg.tutor_id = ge.tutor_id THEN rg.pair_key ELSE NULL END AS pair_key,
            CASE WHEN rg.id IS NOT NULL AND rg.tutor_id = ge.tutor_id THEN rg.level_id ELSE NULL END AS level_id,
            CASE WHEN rg.id IS NOT NULL AND rg.tutor_id = ge.tutor_id THEN rg.age_group_id ELSE NULL END AS age_group_id
        FROM public.tutor_group_enrollments ge
        LEFT JOIN resolved_groups rg ON rg.id = ge.group_id
    ),

    -- 8. تجميع المواد الدراسية (subjectsStats)
    subjects_agg AS (
        SELECT
            rs.id AS subject_id,
            rs.name AS subject_name,
            rs.english_name,
            rs.category,
            rs.display_order,
            rs.is_active,
            COALESCE(t_agg.total_tutors, 0) AS total_tutors,
            COALESCE(t_agg.published_tutors, 0) AS published_tutors,
            COALESCE(t_agg.unpublished_tutors, 0) AS unpublished_tutors,
            COALESCE(t_agg.offerings_count, 0) AS approved_offerings_count,
            COALESCE(t_agg.covered_options, 0) AS covered_course_options_count,
            COALESCE(t_agg.pub_covered_options, 0) AS published_covered_course_options_count,
            COALESCE(co_cnt.total_options, 0) AS total_course_options_count,
            COALESCE(a_agg.submitted_apps, 0) AS submitted_applicants,
            COALESCE(a_agg.needs_info_apps, 0) AS needs_info_applicants,
            COALESCE(a_agg.approved_apps, 0) AS approved_applicants,
            COALESCE(a_agg.rejected_apps, 0) AS rejected_applicants,
            COALESCE(a_agg.draft_apps, 0) AS draft_applicants,
            COALESCE(pb_agg.confirmed_pb, 0) AS confirmed_private_bookings,
            COALESCE(pb_agg.completed_pb, 0) AS completed_private_bookings,
            COALESCE(pb_agg.pending_pb, 0) AS pending_private_bookings,
            COALESCE(pb_agg.cancelled_pb, 0) AS cancelled_private_bookings,
            COALESCE(ge_agg.confirmed_ge, 0) AS confirmed_group_enrollments,
            COALESCE(ge_agg.completed_ge, 0) AS completed_group_enrollments,
            COALESCE(ge_agg.pending_ge, 0) AS pending_group_enrollments,
            COALESCE(ge_agg.cancelled_ge, 0) AS cancelled_group_enrollments,
            COALESCE(g_agg.active_groups, 0) AS active_groups_count,
            COALESCE(g_agg.total_groups, 0) AS total_groups_count,
            COALESCE(ps_agg.avail_slots, 0) AS available_private_slots_count
        FROM ref_subjects rs
        LEFT JOIN (
            SELECT subject_id, COUNT(*)::INTEGER AS total_options
            FROM ref_course_options
            GROUP BY subject_id
        ) co_cnt ON co_cnt.subject_id = rs.id
        LEFT JOIN (
            SELECT
                subject_id,
                COUNT(DISTINCT tutor_id)::INTEGER AS total_tutors,
                COUNT(DISTINCT tutor_id) FILTER (WHERE is_published = TRUE)::INTEGER AS published_tutors,
                COUNT(DISTINCT tutor_id) FILTER (WHERE is_published = FALSE)::INTEGER AS unpublished_tutors,
                COUNT(*)::INTEGER AS offerings_count,
                COUNT(DISTINCT course_option_id)::INTEGER AS covered_options,
                COUNT(DISTINCT course_option_id) FILTER (WHERE is_published = TRUE)::INTEGER AS pub_covered_options
            FROM resolved_tutor_school
            WHERE res_status = 'school'
            GROUP BY subject_id
        ) t_agg ON t_agg.subject_id = rs.id
        LEFT JOIN (
            SELECT
                subject_id,
                COUNT(DISTINCT app_id) FILTER (WHERE status NOT IN ('draft', 'needs_info', 'approved', 'rejected'))::INTEGER AS submitted_apps,
                COUNT(DISTINCT app_id) FILTER (WHERE status = 'needs_info')::INTEGER AS needs_info_apps,
                COUNT(DISTINCT app_id) FILTER (WHERE status = 'approved')::INTEGER AS approved_apps,
                COUNT(DISTINCT app_id) FILTER (WHERE status = 'rejected')::INTEGER AS rejected_apps,
                COUNT(DISTINCT app_id) FILTER (WHERE status = 'draft')::INTEGER AS draft_apps
            FROM app_valid_school_specs
            GROUP BY subject_id
        ) a_agg ON a_agg.subject_id = rs.id
        LEFT JOIN (
            SELECT
                subject_id,
                COUNT(*) FILTER (WHERE status = 'confirmed')::INTEGER AS confirmed_pb,
                COUNT(*) FILTER (WHERE status = 'completed')::INTEGER AS completed_pb,
                COUNT(*) FILTER (WHERE status = 'pending')::INTEGER AS pending_pb,
                COUNT(*) FILTER (WHERE status = 'cancelled')::INTEGER AS cancelled_pb
            FROM resolved_private_bookings
            WHERE res_status = 'school'
            GROUP BY subject_id
        ) pb_agg ON pb_agg.subject_id = rs.id
        LEFT JOIN (
            SELECT
                subject_id,
                COUNT(*) FILTER (WHERE status = 'confirmed')::INTEGER AS confirmed_ge,
                COUNT(*) FILTER (WHERE status = 'completed')::INTEGER AS completed_ge,
                COUNT(*) FILTER (WHERE status = 'pending')::INTEGER AS pending_ge,
                COUNT(*) FILTER (WHERE status = 'cancelled')::INTEGER AS cancelled_ge
            FROM resolved_group_enrollments
            WHERE res_status = 'school'
            GROUP BY subject_id
        ) ge_agg ON ge_agg.subject_id = rs.id
        LEFT JOIN (
            SELECT
                subject_id,
                COUNT(*) FILTER (WHERE is_active_published_group = TRUE)::INTEGER AS active_groups,
                COUNT(*)::INTEGER AS total_groups
            FROM resolved_groups
            WHERE res_status = 'school'
            GROUP BY subject_id
        ) g_agg ON g_agg.subject_id = rs.id
        LEFT JOIN (
            SELECT
                subject_id,
                COUNT(*) FILTER (WHERE is_available = TRUE AND is_booked = FALSE AND admin_suspended = FALSE AND is_future = TRUE)::INTEGER AS avail_slots
            FROM resolved_private_slots
            WHERE res_status = 'school'
            GROUP BY subject_id
        ) ps_agg ON ps_agg.subject_id = rs.id
    ),

    -- 9. تجميع ملخص مسار القرآن (quranSummary)
    quran_summary_agg AS (
        SELECT
            (SELECT COUNT(*)::INTEGER FROM ref_quran_pairs) AS total_course_options_count,
            COALESCE((SELECT COUNT(DISTINCT tutor_id)::INTEGER FROM resolved_tutor_quran WHERE res_status = 'quran'), 0) AS total_tutors,
            COALESCE((SELECT COUNT(DISTINCT tutor_id)::INTEGER FROM resolved_tutor_quran WHERE res_status = 'quran' AND is_published = TRUE), 0) AS published_tutors,
            COALESCE((SELECT COUNT(DISTINCT tutor_id)::INTEGER FROM resolved_tutor_quran WHERE res_status = 'quran' AND is_published = FALSE), 0) AS unpublished_tutors,
            COALESCE((SELECT COUNT(*)::INTEGER FROM resolved_tutor_quran WHERE res_status = 'quran'), 0) AS approved_offerings_count,
            COALESCE((SELECT COUNT(DISTINCT pair_key)::INTEGER FROM resolved_tutor_quran WHERE res_status = 'quran'), 0) AS covered_course_options_count,
            COALESCE((SELECT COUNT(DISTINCT pair_key)::INTEGER FROM resolved_tutor_quran WHERE res_status = 'quran' AND is_published = TRUE), 0) AS published_covered_course_options_count,
            COALESCE((SELECT COUNT(DISTINCT app_id)::INTEGER FROM app_valid_quran_specs WHERE status NOT IN ('draft', 'needs_info', 'approved', 'rejected')), 0) AS submitted_applicants,
            COALESCE((SELECT COUNT(DISTINCT app_id)::INTEGER FROM app_valid_quran_specs WHERE status = 'needs_info'), 0) AS needs_info_applicants,
            COALESCE((SELECT COUNT(DISTINCT app_id)::INTEGER FROM app_valid_quran_specs WHERE status = 'approved'), 0) AS approved_applicants,
            COALESCE((SELECT COUNT(DISTINCT app_id)::INTEGER FROM app_valid_quran_specs WHERE status = 'rejected'), 0) AS rejected_applicants,
            COALESCE((SELECT COUNT(DISTINCT app_id)::INTEGER FROM app_valid_quran_specs WHERE status = 'draft'), 0) AS draft_applicants,
            COALESCE((SELECT COUNT(*)::INTEGER FROM resolved_private_bookings WHERE res_status = 'quran' AND status = 'confirmed'), 0) AS confirmed_private_bookings,
            COALESCE((SELECT COUNT(*)::INTEGER FROM resolved_private_bookings WHERE res_status = 'quran' AND status = 'completed'), 0) AS completed_private_bookings,
            COALESCE((SELECT COUNT(*)::INTEGER FROM resolved_private_bookings WHERE res_status = 'quran' AND status = 'pending'), 0) AS pending_private_bookings,
            COALESCE((SELECT COUNT(*)::INTEGER FROM resolved_private_bookings WHERE res_status = 'quran' AND status = 'cancelled'), 0) AS cancelled_private_bookings,
            COALESCE((SELECT COUNT(*)::INTEGER FROM resolved_group_enrollments WHERE res_status = 'quran' AND status = 'confirmed'), 0) AS confirmed_group_enrollments,
            COALESCE((SELECT COUNT(*)::INTEGER FROM resolved_group_enrollments WHERE res_status = 'quran' AND status = 'completed'), 0) AS completed_group_enrollments,
            COALESCE((SELECT COUNT(*)::INTEGER FROM resolved_group_enrollments WHERE res_status = 'quran' AND status = 'pending'), 0) AS pending_group_enrollments,
            COALESCE((SELECT COUNT(*)::INTEGER FROM resolved_group_enrollments WHERE res_status = 'quran' AND status = 'cancelled'), 0) AS cancelled_group_enrollments,
            COALESCE((SELECT COUNT(*)::INTEGER FROM resolved_groups WHERE res_status = 'quran' AND is_active_published_group = TRUE), 0) AS active_groups_count,
            COALESCE((SELECT COUNT(*)::INTEGER FROM resolved_groups WHERE res_status = 'quran'), 0) AS total_groups_count,
            COALESCE((SELECT COUNT(*)::INTEGER FROM resolved_private_slots WHERE res_status = 'quran' AND is_available = TRUE AND is_booked = FALSE AND admin_suspended = FALSE AND is_future = TRUE), 0) AS available_private_slots_count
    ),

    -- 10. تجميع مستويات القرآن (quranLevelsStats)
    quran_levels_agg AS (
        SELECT
            ql.id AS level_id,
            ql.name AS level_name,
            ql.description,
            ql.display_order,
            ql.is_active,
            COALESCE(t_agg.total_tutors, 0) AS total_tutors,
            COALESCE(t_agg.published_tutors, 0) AS published_tutors,
            COALESCE(t_agg.unpublished_tutors, 0) AS unpublished_tutors,
            COALESCE(a_agg.submitted_apps, 0) AS submitted_applicants,
            COALESCE(a_agg.needs_info_apps, 0) AS needs_info_applicants,
            COALESCE(a_agg.approved_apps, 0) AS approved_applicants,
            COALESCE(a_agg.rejected_apps, 0) AS rejected_applicants,
            COALESCE(a_agg.draft_apps, 0) AS draft_applicants,
            COALESCE(pb_agg.confirmed_pb, 0) AS confirmed_private_bookings,
            COALESCE(pb_agg.completed_pb, 0) AS completed_private_bookings,
            COALESCE(pb_agg.pending_pb, 0) AS pending_private_bookings,
            COALESCE(pb_agg.cancelled_pb, 0) AS cancelled_private_bookings,
            COALESCE(ge_agg.confirmed_ge, 0) AS confirmed_group_enrollments,
            COALESCE(ge_agg.completed_ge, 0) AS completed_group_enrollments,
            COALESCE(ge_agg.pending_ge, 0) AS pending_group_enrollments,
            COALESCE(ge_agg.cancelled_ge, 0) AS cancelled_group_enrollments,
            COALESCE(g_agg.active_groups, 0) AS active_groups_count,
            COALESCE(ps_agg.avail_slots, 0) AS available_private_slots_count
        FROM ref_quran_levels ql
        LEFT JOIN (
            SELECT
                level_id,
                COUNT(DISTINCT tutor_id)::INTEGER AS total_tutors,
                COUNT(DISTINCT tutor_id) FILTER (WHERE is_published = TRUE)::INTEGER AS published_tutors,
                COUNT(DISTINCT tutor_id) FILTER (WHERE is_published = FALSE)::INTEGER AS unpublished_tutors
            FROM resolved_tutor_quran
            WHERE res_status = 'quran'
            GROUP BY level_id
        ) t_agg ON t_agg.level_id = ql.id
        LEFT JOIN (
            SELECT
                level_id,
                COUNT(DISTINCT app_id) FILTER (WHERE status NOT IN ('draft', 'needs_info', 'approved', 'rejected'))::INTEGER AS submitted_apps,
                COUNT(DISTINCT app_id) FILTER (WHERE status = 'needs_info')::INTEGER AS needs_info_apps,
                COUNT(DISTINCT app_id) FILTER (WHERE status = 'approved')::INTEGER AS approved_apps,
                COUNT(DISTINCT app_id) FILTER (WHERE status = 'rejected')::INTEGER AS rejected_apps,
                COUNT(DISTINCT app_id) FILTER (WHERE status = 'draft')::INTEGER AS draft_apps
            FROM app_valid_quran_specs
            GROUP BY level_id
        ) a_agg ON a_agg.level_id = ql.id
        LEFT JOIN (
            SELECT
                level_id,
                COUNT(*) FILTER (WHERE status = 'confirmed')::INTEGER AS confirmed_pb,
                COUNT(*) FILTER (WHERE status = 'completed')::INTEGER AS completed_pb,
                COUNT(*) FILTER (WHERE status = 'pending')::INTEGER AS pending_pb,
                COUNT(*) FILTER (WHERE status = 'cancelled')::INTEGER AS cancelled_pb
            FROM resolved_private_bookings
            WHERE res_status = 'quran'
            GROUP BY level_id
        ) pb_agg ON pb_agg.level_id = ql.id
        LEFT JOIN (
            SELECT
                level_id,
                COUNT(*) FILTER (WHERE status = 'confirmed')::INTEGER AS confirmed_ge,
                COUNT(*) FILTER (WHERE status = 'completed')::INTEGER AS completed_ge,
                COUNT(*) FILTER (WHERE status = 'pending')::INTEGER AS pending_ge,
                COUNT(*) FILTER (WHERE status = 'cancelled')::INTEGER AS cancelled_ge
            FROM resolved_group_enrollments
            WHERE res_status = 'quran'
            GROUP BY level_id
        ) ge_agg ON ge_agg.level_id = ql.id
        LEFT JOIN (
            SELECT
                level_id,
                COUNT(*) FILTER (WHERE is_active_published_group = TRUE)::INTEGER AS active_groups
            FROM resolved_groups
            WHERE res_status = 'quran'
            GROUP BY level_id
        ) g_agg ON g_agg.level_id = ql.id
        LEFT JOIN (
            SELECT
                level_id,
                COUNT(*) FILTER (WHERE is_available = TRUE AND is_booked = FALSE AND admin_suspended = FALSE AND is_future = TRUE)::INTEGER AS avail_slots
            FROM resolved_private_slots
            WHERE res_status = 'quran'
            GROUP BY level_id
        ) ps_agg ON ps_agg.level_id = ql.id
    ),

    -- 11. تجميع الفئات العمرية للقرآن (quranAgeGroupsStats)
    quran_ages_agg AS (
        SELECT
            qag.id AS age_group_id,
            qag.name AS age_group_name,
            qag.age_range,
            qag.display_order,
            qag.is_active,
            COALESCE(t_agg.total_tutors, 0) AS total_tutors,
            COALESCE(t_agg.published_tutors, 0) AS published_tutors,
            COALESCE(t_agg.unpublished_tutors, 0) AS unpublished_tutors,
            COALESCE(a_agg.submitted_apps, 0) AS submitted_applicants,
            COALESCE(a_agg.needs_info_apps, 0) AS needs_info_applicants,
            COALESCE(a_agg.approved_apps, 0) AS approved_applicants,
            COALESCE(a_agg.rejected_apps, 0) AS rejected_applicants,
            COALESCE(pb_agg.confirmed_pb, 0) + COALESCE(ge_agg.confirmed_ge, 0) AS confirmed_subscriptions,
            COALESCE(pb_agg.completed_pb, 0) + COALESCE(ge_agg.completed_ge, 0) AS completed_subscriptions,
            COALESCE(pb_agg.pending_pb, 0) + COALESCE(ge_agg.pending_ge, 0) AS pending_subscriptions,
            COALESCE(pb_agg.cancelled_pb, 0) + COALESCE(ge_agg.cancelled_ge, 0) AS cancelled_subscriptions
        FROM ref_quran_age_groups qag
        LEFT JOIN (
            SELECT
                age_group_id,
                COUNT(DISTINCT tutor_id)::INTEGER AS total_tutors,
                COUNT(DISTINCT tutor_id) FILTER (WHERE is_published = TRUE)::INTEGER AS published_tutors,
                COUNT(DISTINCT tutor_id) FILTER (WHERE is_published = FALSE)::INTEGER AS unpublished_tutors
            FROM resolved_tutor_quran
            WHERE res_status = 'quran'
            GROUP BY age_group_id
        ) t_agg ON t_agg.age_group_id = qag.id
        LEFT JOIN (
            SELECT
                age_group_id,
                COUNT(DISTINCT app_id) FILTER (WHERE status NOT IN ('draft', 'needs_info', 'approved', 'rejected'))::INTEGER AS submitted_apps,
                COUNT(DISTINCT app_id) FILTER (WHERE status = 'needs_info')::INTEGER AS needs_info_apps,
                COUNT(DISTINCT app_id) FILTER (WHERE status = 'approved')::INTEGER AS approved_apps,
                COUNT(DISTINCT app_id) FILTER (WHERE status = 'rejected')::INTEGER AS rejected_apps
            FROM app_valid_quran_specs
            GROUP BY age_group_id
        ) a_agg ON a_agg.age_group_id = qag.id
        LEFT JOIN (
            SELECT
                age_group_id,
                COUNT(*) FILTER (WHERE status = 'confirmed')::INTEGER AS confirmed_pb,
                COUNT(*) FILTER (WHERE status = 'completed')::INTEGER AS completed_pb,
                COUNT(*) FILTER (WHERE status = 'pending')::INTEGER AS pending_pb,
                COUNT(*) FILTER (WHERE status = 'cancelled')::INTEGER AS cancelled_pb
            FROM resolved_private_bookings
            WHERE res_status = 'quran'
            GROUP BY age_group_id
        ) pb_agg ON pb_agg.age_group_id = qag.id
        LEFT JOIN (
            SELECT
                age_group_id,
                COUNT(*) FILTER (WHERE status = 'confirmed')::INTEGER AS confirmed_ge,
                COUNT(*) FILTER (WHERE status = 'completed')::INTEGER AS completed_ge,
                COUNT(*) FILTER (WHERE status = 'pending')::INTEGER AS pending_ge,
                COUNT(*) FILTER (WHERE status = 'cancelled')::INTEGER AS cancelled_ge
            FROM resolved_group_enrollments
            WHERE res_status = 'quran'
            GROUP BY age_group_id
        ) ge_agg ON ge_agg.age_group_id = qag.id
    ),

    -- 12. تجميع المراحل الدراسية (stagesStats)
    stages_agg AS (
        SELECT
            es.id AS stage_id,
            es.name AS stage_name,
            es.grades_desc,
            es.display_order,
            es.is_active,
            COALESCE(t_agg.total_tutors, 0) AS total_tutors,
            COALESCE(t_agg.published_tutors, 0) AS published_tutors,
            COALESCE(t_agg.unpublished_tutors, 0) AS unpublished_tutors,
            COALESCE(a_agg.submitted_apps, 0) AS submitted_applicants,
            COALESCE(a_agg.needs_info_apps, 0) AS needs_info_applicants,
            COALESCE(a_agg.approved_apps, 0) AS approved_applicants,
            COALESCE(a_agg.rejected_apps, 0) AS rejected_applicants,
            COALESCE(pb_agg.confirmed_pb, 0) + COALESCE(ge_agg.confirmed_ge, 0) AS confirmed_subscriptions,
            COALESCE(pb_agg.completed_pb, 0) + COALESCE(ge_agg.completed_ge, 0) AS completed_subscriptions,
            COALESCE(pb_agg.pending_pb, 0) + COALESCE(ge_agg.pending_ge, 0) AS pending_subscriptions,
            COALESCE(pb_agg.cancelled_pb, 0) + COALESCE(ge_agg.cancelled_ge, 0) AS cancelled_subscriptions,
            COALESCE(g_agg.active_groups, 0) AS active_groups_count,
            COALESCE(ps_agg.avail_slots, 0) AS available_private_slots_count
        FROM ref_stages es
        LEFT JOIN (
            SELECT
                stage_id,
                COUNT(DISTINCT tutor_id)::INTEGER AS total_tutors,
                COUNT(DISTINCT tutor_id) FILTER (WHERE is_published = TRUE)::INTEGER AS published_tutors,
                COUNT(DISTINCT tutor_id) FILTER (WHERE is_published = FALSE)::INTEGER AS unpublished_tutors
            FROM resolved_tutor_school
            WHERE res_status = 'school'
            GROUP BY stage_id
        ) t_agg ON t_agg.stage_id = es.id
        LEFT JOIN (
            SELECT
                stage_id,
                COUNT(DISTINCT app_id) FILTER (WHERE status NOT IN ('draft', 'needs_info', 'approved', 'rejected'))::INTEGER AS submitted_apps,
                COUNT(DISTINCT app_id) FILTER (WHERE status = 'needs_info')::INTEGER AS needs_info_apps,
                COUNT(DISTINCT app_id) FILTER (WHERE status = 'approved')::INTEGER AS approved_apps,
                COUNT(DISTINCT app_id) FILTER (WHERE status = 'rejected')::INTEGER AS rejected_apps
            FROM app_valid_school_specs
            GROUP BY stage_id
        ) a_agg ON a_agg.stage_id = es.id
        LEFT JOIN (
            SELECT
                stage_id,
                COUNT(*) FILTER (WHERE status = 'confirmed')::INTEGER AS confirmed_pb,
                COUNT(*) FILTER (WHERE status = 'completed')::INTEGER AS completed_pb,
                COUNT(*) FILTER (WHERE status = 'pending')::INTEGER AS pending_pb,
                COUNT(*) FILTER (WHERE status = 'cancelled')::INTEGER AS cancelled_pb
            FROM resolved_private_bookings
            WHERE res_status = 'school'
            GROUP BY stage_id
        ) pb_agg ON pb_agg.stage_id = es.id
        LEFT JOIN (
            SELECT
                stage_id,
                COUNT(*) FILTER (WHERE status = 'confirmed')::INTEGER AS confirmed_ge,
                COUNT(*) FILTER (WHERE status = 'completed')::INTEGER AS completed_ge,
                COUNT(*) FILTER (WHERE status = 'pending')::INTEGER AS pending_ge,
                COUNT(*) FILTER (WHERE status = 'cancelled')::INTEGER AS cancelled_ge
            FROM resolved_group_enrollments
            WHERE res_status = 'school'
            GROUP BY stage_id
        ) ge_agg ON ge_agg.stage_id = es.id
        LEFT JOIN (
            SELECT
                stage_id,
                COUNT(*) FILTER (WHERE is_active_published_group = TRUE)::INTEGER AS active_groups
            FROM resolved_groups
            WHERE res_status = 'school'
            GROUP BY stage_id
        ) g_agg ON g_agg.stage_id = es.id
        LEFT JOIN (
            SELECT
                stage_id,
                COUNT(*) FILTER (WHERE is_available = TRUE AND is_booked = FALSE AND admin_suspended = FALSE AND is_future = TRUE)::INTEGER AS avail_slots
            FROM resolved_private_slots
            WHERE res_status = 'school'
            GROUP BY stage_id
        ) ps_agg ON ps_agg.stage_id = es.id
    ),

    -- 13. تجميع الأنظمة والمناهج (curriculaStats)
    curricula_agg AS (
        SELECT
            rc.id AS curriculum_id,
            rc.name AS curriculum_name,
            rc.display_order,
            rc.is_active,
            COALESCE(t_agg.total_tutors, 0) AS total_tutors,
            COALESCE(t_agg.published_tutors, 0) AS published_tutors,
            COALESCE(t_agg.unpublished_tutors, 0) AS unpublished_tutors,
            COALESCE(a_agg.submitted_apps, 0) AS submitted_applicants,
            COALESCE(a_agg.needs_info_apps, 0) AS needs_info_applicants,
            COALESCE(a_agg.approved_apps, 0) AS approved_applicants,
            COALESCE(a_agg.rejected_apps, 0) AS rejected_applicants,
            COALESCE(pb_agg.confirmed_pb, 0) + COALESCE(ge_agg.confirmed_ge, 0) AS confirmed_subscriptions,
            COALESCE(pb_agg.completed_pb, 0) + COALESCE(ge_agg.completed_ge, 0) AS completed_subscriptions,
            COALESCE(pb_agg.pending_pb, 0) + COALESCE(ge_agg.pending_ge, 0) AS pending_subscriptions,
            COALESCE(pb_agg.cancelled_pb, 0) + COALESCE(ge_agg.cancelled_ge, 0) AS cancelled_subscriptions
        FROM ref_curricula rc
        LEFT JOIN (
            SELECT
                curriculum_id,
                COUNT(DISTINCT tutor_id)::INTEGER AS total_tutors,
                COUNT(DISTINCT tutor_id) FILTER (WHERE is_published = TRUE)::INTEGER AS published_tutors,
                COUNT(DISTINCT tutor_id) FILTER (WHERE is_published = FALSE)::INTEGER AS unpublished_tutors
            FROM resolved_tutor_school
            WHERE res_status = 'school'
            GROUP BY curriculum_id
        ) t_agg ON t_agg.curriculum_id = rc.id
        LEFT JOIN (
            SELECT
                curriculum_id,
                COUNT(DISTINCT app_id) FILTER (WHERE status NOT IN ('draft', 'needs_info', 'approved', 'rejected'))::INTEGER AS submitted_apps,
                COUNT(DISTINCT app_id) FILTER (WHERE status = 'needs_info')::INTEGER AS needs_info_apps,
                COUNT(DISTINCT app_id) FILTER (WHERE status = 'approved')::INTEGER AS approved_apps,
                COUNT(DISTINCT app_id) FILTER (WHERE status = 'rejected')::INTEGER AS rejected_apps
            FROM app_valid_school_specs
            GROUP BY curriculum_id
        ) a_agg ON a_agg.curriculum_id = rc.id
        LEFT JOIN (
            SELECT
                curriculum_id,
                COUNT(*) FILTER (WHERE status = 'confirmed')::INTEGER AS confirmed_pb,
                COUNT(*) FILTER (WHERE status = 'completed')::INTEGER AS completed_pb,
                COUNT(*) FILTER (WHERE status = 'pending')::INTEGER AS pending_pb,
                COUNT(*) FILTER (WHERE status = 'cancelled')::INTEGER AS cancelled_pb
            FROM resolved_private_bookings
            WHERE res_status = 'school'
            GROUP BY curriculum_id
        ) pb_agg ON pb_agg.curriculum_id = rc.id
        LEFT JOIN (
            SELECT
                curriculum_id,
                COUNT(*) FILTER (WHERE status = 'confirmed')::INTEGER AS confirmed_ge,
                COUNT(*) FILTER (WHERE status = 'completed')::INTEGER AS completed_ge,
                COUNT(*) FILTER (WHERE status = 'pending')::INTEGER AS pending_ge,
                COUNT(*) FILTER (WHERE status = 'cancelled')::INTEGER AS cancelled_ge
            FROM resolved_group_enrollments
            WHERE res_status = 'school'
            GROUP BY curriculum_id
        ) ge_agg ON ge_agg.curriculum_id = rc.id
    ),

    -- 14. تجميع التخصصات الفرعية الدقيقة (School Course Options + Quran Pairs)
    detailed_school_agg AS (
        SELECT
            rco.id::TEXT AS id,
            'school'::TEXT AS track,
            rco.canonical_label AS label,
            rco.stage_id,
            rco.stage_name,
            rco.grade_id,
            rco.grade_name,
            rco.subject_id,
            rco.subject_name,
            rco.curriculum_id,
            rco.curriculum_name,
            NULL::TEXT AS level_id,
            NULL::TEXT AS level_name,
            NULL::TEXT AS age_group_id,
            NULL::TEXT AS age_group_name,
            rco.is_active,
            rco.subject_order AS sort_1,
            rco.grade_order AS sort_2,
            rco.curriculum_order AS sort_3,
            COALESCE(t_agg.total_tutors, 0) AS total_tutors,
            COALESCE(t_agg.published_tutors, 0) AS published_tutors,
            COALESCE(t_agg.unpublished_tutors, 0) AS unpublished_tutors,
            COALESCE(a_agg.submitted_apps, 0) AS submitted_applicants,
            COALESCE(a_agg.needs_info_apps, 0) AS needs_info_applicants,
            COALESCE(a_agg.approved_apps, 0) AS approved_applicants,
            COALESCE(a_agg.rejected_apps, 0) AS rejected_applicants,
            COALESCE(a_agg.draft_apps, 0) AS draft_applicants,
            COALESCE(pb_agg.confirmed_pb, 0) AS confirmed_private_bookings,
            COALESCE(pb_agg.completed_pb, 0) AS completed_private_bookings,
            COALESCE(pb_agg.pending_pb, 0) AS pending_private_bookings,
            COALESCE(pb_agg.cancelled_pb, 0) AS cancelled_private_bookings,
            COALESCE(ge_agg.confirmed_ge, 0) AS confirmed_group_enrollments,
            COALESCE(ge_agg.completed_ge, 0) AS completed_group_enrollments,
            COALESCE(ge_agg.pending_ge, 0) AS pending_group_enrollments,
            COALESCE(ge_agg.cancelled_ge, 0) AS cancelled_group_enrollments,
            COALESCE(g_agg.active_groups, 0) AS active_groups_count,
            COALESCE(ps_agg.avail_slots, 0) AS available_private_slots_count
        FROM ref_course_options rco
        LEFT JOIN (
            SELECT
                course_option_id,
                COUNT(DISTINCT tutor_id)::INTEGER AS total_tutors,
                COUNT(DISTINCT tutor_id) FILTER (WHERE is_published = TRUE)::INTEGER AS published_tutors,
                COUNT(DISTINCT tutor_id) FILTER (WHERE is_published = FALSE)::INTEGER AS unpublished_tutors
            FROM resolved_tutor_school
            WHERE res_status = 'school'
            GROUP BY course_option_id
        ) t_agg ON t_agg.course_option_id = rco.id
        LEFT JOIN (
            SELECT
                course_option_id,
                COUNT(DISTINCT app_id) FILTER (WHERE status NOT IN ('draft', 'needs_info', 'approved', 'rejected'))::INTEGER AS submitted_apps,
                COUNT(DISTINCT app_id) FILTER (WHERE status = 'needs_info')::INTEGER AS needs_info_apps,
                COUNT(DISTINCT app_id) FILTER (WHERE status = 'approved')::INTEGER AS approved_apps,
                COUNT(DISTINCT app_id) FILTER (WHERE status = 'rejected')::INTEGER AS rejected_apps,
                COUNT(DISTINCT app_id) FILTER (WHERE status = 'draft')::INTEGER AS draft_apps
            FROM app_valid_school_specs
            GROUP BY course_option_id
        ) a_agg ON a_agg.course_option_id = rco.id
        LEFT JOIN (
            SELECT
                course_option_id,
                COUNT(*) FILTER (WHERE status = 'confirmed')::INTEGER AS confirmed_pb,
                COUNT(*) FILTER (WHERE status = 'completed')::INTEGER AS completed_pb,
                COUNT(*) FILTER (WHERE status = 'pending')::INTEGER AS pending_pb,
                COUNT(*) FILTER (WHERE status = 'cancelled')::INTEGER AS cancelled_pb
            FROM resolved_private_bookings
            WHERE res_status = 'school'
            GROUP BY course_option_id
        ) pb_agg ON pb_agg.course_option_id = rco.id
        LEFT JOIN (
            SELECT
                course_option_id,
                COUNT(*) FILTER (WHERE status = 'confirmed')::INTEGER AS confirmed_ge,
                COUNT(*) FILTER (WHERE status = 'completed')::INTEGER AS completed_ge,
                COUNT(*) FILTER (WHERE status = 'pending')::INTEGER AS pending_ge,
                COUNT(*) FILTER (WHERE status = 'cancelled')::INTEGER AS cancelled_ge
            FROM resolved_group_enrollments
            WHERE res_status = 'school'
            GROUP BY course_option_id
        ) ge_agg ON ge_agg.course_option_id = rco.id
        LEFT JOIN (
            SELECT
                course_option_id,
                COUNT(*) FILTER (WHERE is_active_published_group = TRUE)::INTEGER AS active_groups
            FROM resolved_groups
            WHERE res_status = 'school'
            GROUP BY course_option_id
        ) g_agg ON g_agg.course_option_id = rco.id
        LEFT JOIN (
            SELECT
                course_option_id,
                COUNT(*) FILTER (WHERE is_available = TRUE AND is_booked = FALSE AND admin_suspended = FALSE AND is_future = TRUE)::INTEGER AS avail_slots
            FROM resolved_private_slots
            WHERE res_status = 'school'
            GROUP BY course_option_id
        ) ps_agg ON ps_agg.course_option_id = rco.id
    ),
    detailed_quran_agg AS (
        SELECT
            rqp.pair_id AS id,
            'quran'::TEXT AS track,
            rqp.canonical_label AS label,
            NULL::TEXT AS stage_id,
            NULL::TEXT AS stage_name,
            NULL::TEXT AS grade_id,
            NULL::TEXT AS grade_name,
            NULL::TEXT AS subject_id,
            NULL::TEXT AS subject_name,
            NULL::TEXT AS curriculum_id,
            NULL::TEXT AS curriculum_name,
            rqp.level_id,
            rqp.level_name,
            rqp.age_group_id,
            rqp.age_group_name,
            rqp.is_active,
            1000 + rqp.level_order AS sort_1,
            rqp.age_order AS sort_2,
            0 AS sort_3,
            COALESCE(t_agg.total_tutors, 0) AS total_tutors,
            COALESCE(t_agg.published_tutors, 0) AS published_tutors,
            COALESCE(t_agg.unpublished_tutors, 0) AS unpublished_tutors,
            COALESCE(a_agg.submitted_apps, 0) AS submitted_applicants,
            COALESCE(a_agg.needs_info_apps, 0) AS needs_info_applicants,
            COALESCE(a_agg.approved_apps, 0) AS approved_applicants,
            COALESCE(a_agg.rejected_apps, 0) AS rejected_applicants,
            COALESCE(a_agg.draft_apps, 0) AS draft_applicants,
            COALESCE(pb_agg.confirmed_pb, 0) AS confirmed_private_bookings,
            COALESCE(pb_agg.completed_pb, 0) AS completed_private_bookings,
            COALESCE(pb_agg.pending_pb, 0) AS pending_private_bookings,
            COALESCE(pb_agg.cancelled_pb, 0) AS cancelled_private_bookings,
            COALESCE(ge_agg.confirmed_ge, 0) AS confirmed_group_enrollments,
            COALESCE(ge_agg.completed_ge, 0) AS completed_group_enrollments,
            COALESCE(ge_agg.pending_ge, 0) AS pending_group_enrollments,
            COALESCE(ge_agg.cancelled_ge, 0) AS cancelled_group_enrollments,
            COALESCE(g_agg.active_groups, 0) AS active_groups_count,
            COALESCE(ps_agg.avail_slots, 0) AS available_private_slots_count
        FROM ref_quran_pairs rqp
        LEFT JOIN (
            SELECT
                pair_key,
                COUNT(DISTINCT tutor_id)::INTEGER AS total_tutors,
                COUNT(DISTINCT tutor_id) FILTER (WHERE is_published = TRUE)::INTEGER AS published_tutors,
                COUNT(DISTINCT tutor_id) FILTER (WHERE is_published = FALSE)::INTEGER AS unpublished_tutors
            FROM resolved_tutor_quran
            WHERE res_status = 'quran'
            GROUP BY pair_key
        ) t_agg ON t_agg.pair_key = rqp.pair_key
        LEFT JOIN (
            SELECT
                pair_key,
                COUNT(DISTINCT app_id) FILTER (WHERE status NOT IN ('draft', 'needs_info', 'approved', 'rejected'))::INTEGER AS submitted_apps,
                COUNT(DISTINCT app_id) FILTER (WHERE status = 'needs_info')::INTEGER AS needs_info_apps,
                COUNT(DISTINCT app_id) FILTER (WHERE status = 'approved')::INTEGER AS approved_apps,
                COUNT(DISTINCT app_id) FILTER (WHERE status = 'rejected')::INTEGER AS rejected_apps,
                COUNT(DISTINCT app_id) FILTER (WHERE status = 'draft')::INTEGER AS draft_apps
            FROM app_valid_quran_specs
            GROUP BY pair_key
        ) a_agg ON a_agg.pair_key = rqp.pair_key
        LEFT JOIN (
            SELECT
                pair_key,
                COUNT(*) FILTER (WHERE status = 'confirmed')::INTEGER AS confirmed_pb,
                COUNT(*) FILTER (WHERE status = 'completed')::INTEGER AS completed_pb,
                COUNT(*) FILTER (WHERE status = 'pending')::INTEGER AS pending_pb,
                COUNT(*) FILTER (WHERE status = 'cancelled')::INTEGER AS cancelled_pb
            FROM resolved_private_bookings
            WHERE res_status = 'quran'
            GROUP BY pair_key
        ) pb_agg ON pb_agg.pair_key = rqp.pair_key
        LEFT JOIN (
            SELECT
                pair_key,
                COUNT(*) FILTER (WHERE status = 'confirmed')::INTEGER AS confirmed_ge,
                COUNT(*) FILTER (WHERE status = 'completed')::INTEGER AS completed_ge,
                COUNT(*) FILTER (WHERE status = 'pending')::INTEGER AS pending_ge,
                COUNT(*) FILTER (WHERE status = 'cancelled')::INTEGER AS cancelled_ge
            FROM resolved_group_enrollments
            WHERE res_status = 'quran'
            GROUP BY pair_key
        ) ge_agg ON ge_agg.pair_key = rqp.pair_key
        LEFT JOIN (
            SELECT
                pair_key,
                COUNT(*) FILTER (WHERE is_active_published_group = TRUE)::INTEGER AS active_groups
            FROM resolved_groups
            WHERE res_status = 'quran'
            GROUP BY pair_key
        ) g_agg ON g_agg.pair_key = rqp.pair_key
        LEFT JOIN (
            SELECT
                pair_key,
                COUNT(*) FILTER (WHERE is_available = TRUE AND is_booked = FALSE AND admin_suspended = FALSE AND is_future = TRUE)::INTEGER AS avail_slots
            FROM resolved_private_slots
            WHERE res_status = 'quran'
            GROUP BY pair_key
        ) ps_agg ON ps_agg.pair_key = rqp.pair_key
    ),
    detailed_all_agg AS (
        SELECT * FROM detailed_school_agg
        UNION ALL
        SELECT * FROM detailed_quran_agg
    ),

    -- 15. إحصائيات السجلات غير المصنفة (unclassifiedSummary)
    unclassified_counts AS (
        SELECT
            (
                SELECT COUNT(*)::INTEGER
                FROM valid_tutors vt
                WHERE NOT EXISTS (
                    SELECT 1 FROM resolved_tutor_school rts
                    WHERE rts.tutor_id = vt.id AND rts.res_status = 'school'
                )
                AND NOT EXISTS (
                    SELECT 1 FROM resolved_tutor_quran rtq
                    WHERE rtq.tutor_id = vt.id AND rtq.res_status = 'quran'
                )
            ) AS unassigned_tutors_count,
            (
                (SELECT COUNT(*)::INTEGER FROM resolved_tutor_school WHERE res_status = 'unclassified')
                + (SELECT COUNT(*)::INTEGER FROM resolved_tutor_quran WHERE res_status = 'unclassified')
            ) AS unclassified_tutor_offerings_count,
            (SELECT COUNT(*)::INTEGER FROM unclassified_apps) AS unclassified_applications_count,
            (SELECT COUNT(*)::INTEGER FROM resolved_groups WHERE res_status = 'unclassified') AS unclassified_groups_count,
            (SELECT COUNT(*)::INTEGER FROM resolved_private_slots WHERE res_status = 'unclassified') AS unclassified_private_slots_count,
            (SELECT COUNT(*)::INTEGER FROM resolved_private_bookings WHERE res_status = 'unclassified') AS unclassified_private_bookings_count,
            (SELECT COUNT(*)::INTEGER FROM resolved_group_enrollments WHERE res_status = 'unclassified') AS unclassified_group_enrollments_count
    )

    SELECT jsonb_build_object(
        'generatedAt', NOW(),
        'overview', jsonb_build_object(
            'totalTutors', (SELECT COUNT(*)::INTEGER FROM valid_tutors),
            'publishedTutors', (SELECT COUNT(*)::INTEGER FROM valid_tutors WHERE is_published = TRUE),
            'unpublishedTutors', (SELECT COUNT(*)::INTEGER FROM valid_tutors WHERE is_published = FALSE),
            'schoolTutorsCount', (SELECT COUNT(DISTINCT tutor_id)::INTEGER FROM resolved_tutor_school WHERE res_status = 'school'),
            'quranTutorsCount', (SELECT COUNT(DISTINCT tutor_id)::INTEGER FROM resolved_tutor_quran WHERE res_status = 'quran'),
            'unassignedTutorsCount', (SELECT unassigned_tutors_count FROM unclassified_counts),
            'totalSubmittedApplications', (SELECT COUNT(*)::INTEGER FROM raw_apps WHERE status <> 'draft'),
            'totalAllApplications', (SELECT COUNT(*)::INTEGER FROM raw_apps),
            'pendingApplications', (SELECT COUNT(*)::INTEGER FROM raw_apps WHERE status NOT IN ('draft', 'approved', 'rejected')),
            'submittedOnlyApplications', (SELECT COUNT(*)::INTEGER FROM raw_apps WHERE status NOT IN ('draft', 'needs_info', 'approved', 'rejected')),
            'needsInfoApplications', (SELECT COUNT(*)::INTEGER FROM raw_apps WHERE status = 'needs_info'),
            'approvedApplications', (SELECT COUNT(*)::INTEGER FROM raw_apps WHERE status = 'approved'),
            'rejectedApplications', (SELECT COUNT(*)::INTEGER FROM raw_apps WHERE status = 'rejected'),
            'draftApplications', (SELECT COUNT(*)::INTEGER FROM raw_apps WHERE status = 'draft'),
            'schoolSubmittedApplications', (SELECT COUNT(*)::INTEGER FROM raw_apps WHERE status <> 'draft' AND track <> 'quran'),
            'quranSubmittedApplications', (SELECT COUNT(*)::INTEGER FROM raw_apps WHERE status <> 'draft' AND track = 'quran'),
            'confirmedPrivateBookings', (SELECT COUNT(*)::INTEGER FROM resolved_private_bookings WHERE status = 'confirmed'),
            'completedPrivateBookings', (SELECT COUNT(*)::INTEGER FROM resolved_private_bookings WHERE status = 'completed'),
            'pendingPrivateBookings', (SELECT COUNT(*)::INTEGER FROM resolved_private_bookings WHERE status = 'pending'),
            'cancelledPrivateBookings', (SELECT COUNT(*)::INTEGER FROM resolved_private_bookings WHERE status = 'cancelled'),
            'confirmedGroupEnrollments', (SELECT COUNT(*)::INTEGER FROM resolved_group_enrollments WHERE status = 'confirmed'),
            'completedGroupEnrollments', (SELECT COUNT(*)::INTEGER FROM resolved_group_enrollments WHERE status = 'completed'),
            'pendingGroupEnrollments', (SELECT COUNT(*)::INTEGER FROM resolved_group_enrollments WHERE status = 'pending'),
            'cancelledGroupEnrollments', (SELECT COUNT(*)::INTEGER FROM resolved_group_enrollments WHERE status = 'cancelled'),
            'confirmedSubscriptions', (
                (SELECT COUNT(*)::INTEGER FROM resolved_private_bookings WHERE status = 'confirmed')
                + (SELECT COUNT(*)::INTEGER FROM resolved_group_enrollments WHERE status = 'confirmed')
            ),
            'completedSubscriptions', (
                (SELECT COUNT(*)::INTEGER FROM resolved_private_bookings WHERE status = 'completed')
                + (SELECT COUNT(*)::INTEGER FROM resolved_group_enrollments WHERE status = 'completed')
            ),
            'pendingSubscriptions', (
                (SELECT COUNT(*)::INTEGER FROM resolved_private_bookings WHERE status = 'pending')
                + (SELECT COUNT(*)::INTEGER FROM resolved_group_enrollments WHERE status = 'pending')
            ),
            'cancelledSubscriptions', (
                (SELECT COUNT(*)::INTEGER FROM resolved_private_bookings WHERE status = 'cancelled')
                + (SELECT COUNT(*)::INTEGER FROM resolved_group_enrollments WHERE status = 'cancelled')
            ),
            'uniqueConfirmedStudents', NULL,
            'uniqueStudentsAvailable', FALSE,
            'uniqueStudentsUnavailableReason', 'غير متاح حاليًا لعدم وجود معرف هوية طالب ثابت وموثوق مرتبط بالسجلات',
            'activeGroupsCount', (SELECT COUNT(*)::INTEGER FROM resolved_groups WHERE is_active_published_group = TRUE),
            'totalGroupsCount', (SELECT COUNT(*)::INTEGER FROM resolved_groups),
            'availablePrivateSlotsCount', (SELECT COUNT(*)::INTEGER FROM resolved_private_slots WHERE is_available = TRUE AND is_booked = FALSE AND admin_suspended = FALSE AND is_future = TRUE),
            'availableTrialSlotsCount', (
                SELECT COUNT(*)::INTEGER
                FROM public.tutor_available_slots s
                WHERE s.is_available = TRUE
                  AND COALESCE(s.is_booked, FALSE) = FALSE
                  AND COALESCE(s.admin_suspended, FALSE) = FALSE
                  AND (s.slot_date + s.start_time) AT TIME ZONE COALESCE(NULLIF(TRIM(s.timezone), ''), 'Africa/Cairo') > NOW()
            ),
            'bookedTrialSlotsCount', (
                SELECT COUNT(*)::INTEGER
                FROM public.tutor_available_slots s
                WHERE COALESCE(s.is_booked, FALSE) = TRUE
            ),
            'subjectsWithoutPublishedTutors', (
                (SELECT COUNT(*)::INTEGER FROM subjects_agg WHERE published_tutors = 0)
                + (SELECT CASE WHEN published_tutors = 0 THEN 1 ELSE 0 END FROM quran_summary_agg)
            ),
            'specializationsWithoutPublishedTutors', (
                SELECT COUNT(*)::INTEGER FROM detailed_all_agg WHERE published_tutors = 0
            ),
            'subjectsWithPendingApplicants', (
                (SELECT COUNT(*)::INTEGER FROM subjects_agg WHERE (submitted_applicants + needs_info_applicants) > 0)
                + (SELECT CASE WHEN (submitted_applicants + needs_info_applicants) > 0 THEN 1 ELSE 0 END FROM quran_summary_agg)
            ),
            'unmappedBookingsCount', (
                (SELECT unclassified_private_bookings_count + unclassified_group_enrollments_count FROM unclassified_counts)
            ),
            'unclassifiedSummary', (
                SELECT jsonb_build_object(
                    'unassignedTutorsCount', uc.unassigned_tutors_count,
                    'unclassifiedTutorOfferingsCount', uc.unclassified_tutor_offerings_count,
                    'unclassifiedApplicationsCount', uc.unclassified_applications_count,
                    'unclassifiedGroupsCount', uc.unclassified_groups_count,
                    'unclassifiedPrivateSlotsCount', uc.unclassified_private_slots_count,
                    'unclassifiedPrivateBookingsCount', uc.unclassified_private_bookings_count,
                    'unclassifiedGroupEnrollmentsCount', uc.unclassified_group_enrollments_count,
                    'totalUnclassifiedCount', (
                        uc.unassigned_tutors_count
                        + uc.unclassified_tutor_offerings_count
                        + uc.unclassified_applications_count
                        + uc.unclassified_groups_count
                        + uc.unclassified_private_slots_count
                        + uc.unclassified_private_bookings_count
                        + uc.unclassified_group_enrollments_count
                    )
                )
                FROM unclassified_counts uc
            )
        ),
        'subjectsStats', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'subjectId', sa.subject_id,
                    'subjectName', sa.subject_name,
                    'englishName', sa.english_name,
                    'category', sa.category,
                    'track', 'school',
                    'isActive', sa.is_active,
                    'totalTutors', sa.total_tutors,
                    'publishedTutors', sa.published_tutors,
                    'unpublishedTutors', sa.unpublished_tutors,
                    'approvedOfferingsCount', sa.approved_offerings_count,
                    'coveredCourseOptionsCount', sa.covered_course_options_count,
                    'publishedCoveredCourseOptionsCount', sa.published_covered_course_options_count,
                    'totalCourseOptionsCount', sa.total_course_options_count,
                    'totalApplicants', sa.submitted_applicants + sa.needs_info_applicants + sa.approved_applicants + sa.rejected_applicants,
                    'pendingApplicants', sa.submitted_applicants + sa.needs_info_applicants,
                    'submittedApplicants', sa.submitted_applicants,
                    'needsInfoApplicants', sa.needs_info_applicants,
                    'approvedApplicants', sa.approved_applicants,
                    'rejectedApplicants', sa.rejected_applicants,
                    'draftApplicants', sa.draft_applicants,
                    'confirmedPrivateBookings', sa.confirmed_private_bookings,
                    'completedPrivateBookings', sa.completed_private_bookings,
                    'pendingPrivateBookings', sa.pending_private_bookings,
                    'cancelledPrivateBookings', sa.cancelled_private_bookings,
                    'totalPrivateBookings', sa.confirmed_private_bookings + sa.completed_private_bookings + sa.pending_private_bookings + sa.cancelled_private_bookings,
                    'confirmedGroupEnrollments', sa.confirmed_group_enrollments,
                    'completedGroupEnrollments', sa.completed_group_enrollments,
                    'pendingGroupEnrollments', sa.pending_group_enrollments,
                    'cancelledGroupEnrollments', sa.cancelled_group_enrollments,
                    'totalGroupEnrollments', sa.confirmed_group_enrollments + sa.completed_group_enrollments + sa.pending_group_enrollments + sa.cancelled_group_enrollments,
                    'confirmedSubscriptions', sa.confirmed_private_bookings + sa.confirmed_group_enrollments,
                    'completedSubscriptions', sa.completed_private_bookings + sa.completed_group_enrollments,
                    'pendingSubscriptions', sa.pending_private_bookings + sa.pending_group_enrollments,
                    'cancelledSubscriptions', sa.cancelled_private_bookings + sa.cancelled_group_enrollments,
                    'uniqueConfirmedStudents', NULL,
                    'activeGroupsCount', sa.active_groups_count,
                    'totalGroupsCount', sa.total_groups_count,
                    'availablePrivateSlotsCount', sa.available_private_slots_count
                )
                ORDER BY sa.display_order ASC, sa.subject_id ASC
            )
            FROM subjects_agg sa
        ), '[]'::jsonb),
        'quranSummary', (
            SELECT jsonb_build_object(
                'subjectId', 'quran_track',
                'subjectName', 'القرآن الكريم والتأسيس (نور البيان والتجويد)',
                'englishName', 'Quran & Foundation',
                'category', 'quran',
                'track', 'quran',
                'isActive', TRUE,
                'totalTutors', qsa.total_tutors,
                'publishedTutors', qsa.published_tutors,
                'unpublishedTutors', qsa.unpublished_tutors,
                'approvedOfferingsCount', qsa.approved_offerings_count,
                'coveredCourseOptionsCount', qsa.covered_course_options_count,
                'publishedCoveredCourseOptionsCount', qsa.published_covered_course_options_count,
                'totalCourseOptionsCount', qsa.total_course_options_count,
                'totalApplicants', qsa.submitted_applicants + qsa.needs_info_applicants + qsa.approved_applicants + qsa.rejected_applicants,
                'pendingApplicants', qsa.submitted_applicants + qsa.needs_info_applicants,
                'submittedApplicants', qsa.submitted_applicants,
                'needsInfoApplicants', qsa.needs_info_applicants,
                'approvedApplicants', qsa.approved_applicants,
                'rejectedApplicants', qsa.rejected_applicants,
                'draftApplicants', qsa.draft_applicants,
                'confirmedPrivateBookings', qsa.confirmed_private_bookings,
                'completedPrivateBookings', qsa.completed_private_bookings,
                'pendingPrivateBookings', qsa.pending_private_bookings,
                'cancelledPrivateBookings', qsa.cancelled_private_bookings,
                'totalPrivateBookings', qsa.confirmed_private_bookings + qsa.completed_private_bookings + qsa.pending_private_bookings + qsa.cancelled_private_bookings,
                'confirmedGroupEnrollments', qsa.confirmed_group_enrollments,
                'completedGroupEnrollments', qsa.completed_group_enrollments,
                'pendingGroupEnrollments', qsa.pending_group_enrollments,
                'cancelledGroupEnrollments', qsa.cancelled_group_enrollments,
                'totalGroupEnrollments', qsa.confirmed_group_enrollments + qsa.completed_group_enrollments + qsa.pending_group_enrollments + qsa.cancelled_group_enrollments,
                'confirmedSubscriptions', qsa.confirmed_private_bookings + qsa.confirmed_group_enrollments,
                'completedSubscriptions', qsa.completed_private_bookings + qsa.completed_group_enrollments,
                'pendingSubscriptions', qsa.pending_private_bookings + qsa.pending_group_enrollments,
                'cancelledSubscriptions', qsa.cancelled_private_bookings + qsa.cancelled_group_enrollments,
                'uniqueConfirmedStudents', NULL,
                'activeGroupsCount', qsa.active_groups_count,
                'totalGroupsCount', qsa.total_groups_count,
                'availablePrivateSlotsCount', qsa.available_private_slots_count
            )
            FROM quran_summary_agg qsa
        ),
        'quranLevelsStats', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'levelId', qla.level_id,
                    'levelName', qla.level_name,
                    'description', qla.description,
                    'isActive', qla.is_active,
                    'totalTutors', qla.total_tutors,
                    'publishedTutors', qla.published_tutors,
                    'unpublishedTutors', qla.unpublished_tutors,
                    'totalApplicants', qla.submitted_applicants + qla.needs_info_applicants + qla.approved_applicants + qla.rejected_applicants,
                    'pendingApplicants', qla.submitted_applicants + qla.needs_info_applicants,
                    'submittedApplicants', qla.submitted_applicants,
                    'needsInfoApplicants', qla.needs_info_applicants,
                    'approvedApplicants', qla.approved_applicants,
                    'rejectedApplicants', qla.rejected_applicants,
                    'draftApplicants', qla.draft_applicants,
                    'confirmedPrivateBookings', qla.confirmed_private_bookings,
                    'completedPrivateBookings', qla.completed_private_bookings,
                    'pendingPrivateBookings', qla.pending_private_bookings,
                    'cancelledPrivateBookings', qla.cancelled_private_bookings,
                    'confirmedGroupEnrollments', qla.confirmed_group_enrollments,
                    'completedGroupEnrollments', qla.completed_group_enrollments,
                    'pendingGroupEnrollments', qla.pending_group_enrollments,
                    'cancelledGroupEnrollments', qla.cancelled_group_enrollments,
                    'confirmedSubscriptions', qla.confirmed_private_bookings + qla.confirmed_group_enrollments,
                    'completedSubscriptions', qla.completed_private_bookings + qla.completed_group_enrollments,
                    'pendingSubscriptions', qla.pending_private_bookings + qla.pending_group_enrollments,
                    'cancelledSubscriptions', qla.cancelled_private_bookings + qla.cancelled_group_enrollments,
                    'uniqueConfirmedStudents', NULL,
                    'activeGroupsCount', qla.active_groups_count,
                    'availablePrivateSlotsCount', qla.available_private_slots_count
                )
                ORDER BY qla.display_order ASC, qla.level_id ASC
            )
            FROM quran_levels_agg qla
        ), '[]'::jsonb),
        'quranAgeGroupsStats', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'ageGroupId', qaa.age_group_id,
                    'ageGroupName', qaa.age_group_name,
                    'ageRange', qaa.age_range,
                    'isActive', qaa.is_active,
                    'totalTutors', qaa.total_tutors,
                    'publishedTutors', qaa.published_tutors,
                    'unpublishedTutors', qaa.unpublished_tutors,
                    'totalApplicants', qaa.submitted_applicants + qaa.needs_info_applicants + qaa.approved_applicants + qaa.rejected_applicants,
                    'pendingApplicants', qaa.submitted_applicants + qaa.needs_info_applicants,
                    'approvedApplicants', qaa.approved_applicants,
                    'rejectedApplicants', qaa.rejected_applicants,
                    'confirmedSubscriptions', qaa.confirmed_subscriptions,
                    'completedSubscriptions', qaa.completed_subscriptions,
                    'pendingSubscriptions', qaa.pending_subscriptions,
                    'cancelledSubscriptions', qaa.cancelled_subscriptions,
                    'uniqueConfirmedStudents', NULL
                )
                ORDER BY qaa.display_order ASC, qaa.age_group_id ASC
            )
            FROM quran_ages_agg qaa
        ), '[]'::jsonb),
        'stagesStats', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'stageId', sta.stage_id,
                    'stageName', sta.stage_name,
                    'gradesDesc', sta.grades_desc,
                    'isActive', sta.is_active,
                    'totalTutors', sta.total_tutors,
                    'publishedTutors', sta.published_tutors,
                    'unpublishedTutors', sta.unpublished_tutors,
                    'totalApplicants', sta.submitted_applicants + sta.needs_info_applicants + sta.approved_applicants + sta.rejected_applicants,
                    'pendingApplicants', sta.submitted_applicants + sta.needs_info_applicants,
                    'approvedApplicants', sta.approved_applicants,
                    'rejectedApplicants', sta.rejected_applicants,
                    'confirmedSubscriptions', sta.confirmed_subscriptions,
                    'completedSubscriptions', sta.completed_subscriptions,
                    'pendingSubscriptions', sta.pending_subscriptions,
                    'cancelledSubscriptions', sta.cancelled_subscriptions,
                    'uniqueConfirmedStudents', NULL,
                    'activeGroupsCount', sta.active_groups_count,
                    'availablePrivateSlotsCount', sta.available_private_slots_count
                )
                ORDER BY sta.display_order ASC, sta.stage_id ASC
            )
            FROM stages_agg sta
        ), '[]'::jsonb),
        'curriculaStats', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'curriculumId', cra.curriculum_id,
                    'curriculumName', cra.curriculum_name,
                    'isActive', cra.is_active,
                    'totalTutors', cra.total_tutors,
                    'publishedTutors', cra.published_tutors,
                    'unpublishedTutors', cra.unpublished_tutors,
                    'totalApplicants', cra.submitted_applicants + cra.needs_info_applicants + cra.approved_applicants + cra.rejected_applicants,
                    'pendingApplicants', cra.submitted_applicants + cra.needs_info_applicants,
                    'approvedApplicants', cra.approved_applicants,
                    'rejectedApplicants', cra.rejected_applicants,
                    'confirmedSubscriptions', cra.confirmed_subscriptions,
                    'completedSubscriptions', cra.completed_subscriptions,
                    'pendingSubscriptions', cra.pending_subscriptions,
                    'cancelledSubscriptions', cra.cancelled_subscriptions,
                    'uniqueConfirmedStudents', NULL
                )
                ORDER BY cra.display_order ASC, cra.curriculum_id ASC
            )
            FROM curricula_agg cra
        ), '[]'::jsonb),
        'detailedSpecializations', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', da.id,
                    'track', da.track,
                    'label', da.label,
                    'stageId', da.stage_id,
                    'stageName', da.stage_name,
                    'gradeId', da.grade_id,
                    'gradeName', da.grade_name,
                    'subjectId', da.subject_id,
                    'subjectName', da.subject_name,
                    'curriculumId', da.curriculum_id,
                    'curriculumName', da.curriculum_name,
                    'levelId', da.level_id,
                    'levelName', da.level_name,
                    'ageGroupId', da.age_group_id,
                    'ageGroupName', da.age_group_name,
                    'isActive', da.is_active,
                    'totalTutors', da.total_tutors,
                    'publishedTutors', da.published_tutors,
                    'unpublishedTutors', da.unpublished_tutors,
                    'totalApplicants', da.submitted_applicants + da.needs_info_applicants + da.approved_applicants + da.rejected_applicants,
                    'pendingApplicants', da.submitted_applicants + da.needs_info_applicants,
                    'submittedApplicants', da.submitted_applicants,
                    'needsInfoApplicants', da.needs_info_applicants,
                    'approvedApplicants', da.approved_applicants,
                    'rejectedApplicants', da.rejected_applicants,
                    'draftApplicants', da.draft_applicants,
                    'confirmedPrivateBookings', da.confirmed_private_bookings,
                    'completedPrivateBookings', da.completed_private_bookings,
                    'pendingPrivateBookings', da.pending_private_bookings,
                    'cancelledPrivateBookings', da.cancelled_private_bookings,
                    'confirmedGroupEnrollments', da.confirmed_group_enrollments,
                    'completedGroupEnrollments', da.completed_group_enrollments,
                    'pendingGroupEnrollments', da.pending_group_enrollments,
                    'cancelledGroupEnrollments', da.cancelled_group_enrollments,
                    'confirmedSubscriptions', da.confirmed_private_bookings + da.confirmed_group_enrollments,
                    'completedSubscriptions', da.completed_private_bookings + da.completed_group_enrollments,
                    'pendingSubscriptions', da.pending_private_bookings + da.pending_group_enrollments,
                    'cancelledSubscriptions', da.cancelled_private_bookings + da.cancelled_group_enrollments,
                    'uniqueConfirmedStudents', NULL,
                    'activeGroupsCount', da.active_groups_count,
                    'availablePrivateSlotsCount', da.available_private_slots_count
                )
                ORDER BY da.sort_1 ASC, da.sort_2 ASC, da.sort_3 ASC, da.id ASC
            )
            FROM detailed_all_agg da
        ), '[]'::jsonb)
    )
    INTO v_result;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_platform_statistics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_platform_statistics() TO authenticated, service_role;


-- ------------------------------------------------------------------------------
-- 2. دالة جلب قوائم التفاصيل المقسمة بـ Pagination عند النقر على أي رقم إحصائي
--    public.admin_get_statistics_drilldown(...)
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_get_statistics_drilldown(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION public.admin_get_statistics_drilldown(
    p_entity_type TEXT,                      -- 'tutors' | 'applicants' | 'subscriptions' | 'unclassified'
    p_track TEXT DEFAULT 'all',              -- 'all' | 'school' | 'quran'
    p_subject_id TEXT DEFAULT NULL,
    p_stage_id TEXT DEFAULT NULL,
    p_grade_id TEXT DEFAULT NULL,
    p_curriculum_id TEXT DEFAULT NULL,
    p_course_option_id TEXT DEFAULT NULL,
    p_quran_level_id TEXT DEFAULT NULL,
    p_quran_age_group_id TEXT DEFAULT NULL,
    p_status_filter TEXT DEFAULT 'all',      -- 'all' | 'published' | 'unpublished' | 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'approved' | 'rejected'
    p_page INTEGER DEFAULT 1,
    p_page_size INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
STABLE
AS $$
DECLARE
    v_page INTEGER := GREATEST(1, COALESCE(p_page, 1));
    v_page_size INTEGER := LEAST(100, GREATEST(1, COALESCE(p_page_size, 20)));
    v_offset INTEGER := (v_page - 1) * v_page_size;
    v_total_count INTEGER := 0;
    v_items JSONB := '[]'::jsonb;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'غير مصرح: هذا الإجراء مخصص لمشرفي النظام فقط.';
    END IF;

    -- 1. تفاصيل المعلمين (tutors)
    IF p_entity_type = 'tutors' THEN
        WITH
        ref_course_options AS (
            SELECT
                sco.id,
                sco.grade_id,
                eg.stage_id,
                sco.subject_id,
                sco.curriculum_id
            FROM public.school_course_options sco
            JOIN public.educational_grades eg ON eg.id = sco.grade_id
            JOIN public.educational_stages es ON es.id = eg.stage_id
            JOIN public.subjects s ON s.id = sco.subject_id
            JOIN public.curriculum_types ct ON ct.id = sco.curriculum_id
        ),
        ref_quran_pairs AS (
            SELECT
                ql.id AS level_id,
                qag.id AS age_group_id
            FROM public.quran_levels ql
            CROSS JOIN public.quran_age_groups qag
        ),
        matched_tutors AS (
            SELECT DISTINCT
                t.id,
                t.name,
                t.honorific,
                t.headline,
                t.is_published,
                t.created_at
            FROM public.tutors t
            LEFT JOIN (
                SELECT tso.tutor_id, rco.id AS course_option_id, rco.subject_id, rco.grade_id, rco.stage_id, rco.curriculum_id
                FROM public.tutor_school_offerings tso
                JOIN ref_course_options rco ON rco.id = tso.course_option_id
            ) rts ON rts.tutor_id = t.id
            LEFT JOIN (
                SELECT tqo.tutor_id, rqp.level_id, rqp.age_group_id
                FROM public.tutor_quran_offerings tqo
                JOIN ref_quran_pairs rqp ON rqp.level_id = tqo.level_id AND rqp.age_group_id = tqo.age_group_id
            ) rtq ON rtq.tutor_id = t.id
            WHERE (
                p_status_filter IS NULL OR p_status_filter = 'all'
                OR (p_status_filter = 'published' AND t.is_published = TRUE)
                OR (p_status_filter = 'unpublished' AND t.is_published = FALSE)
            )
            AND (
                (
                    COALESCE(p_track, 'all') = 'all'
                    AND p_subject_id IS NULL
                    AND p_stage_id IS NULL
                    AND p_grade_id IS NULL
                    AND p_curriculum_id IS NULL
                    AND p_course_option_id IS NULL
                    AND p_quran_level_id IS NULL
                    AND p_quran_age_group_id IS NULL
                )
                OR (
                    COALESCE(p_track, 'all') IN ('all', 'school')
                    AND (p_subject_id IS NULL OR p_subject_id <> 'quran_track')
                    AND p_quran_level_id IS NULL
                    AND p_quran_age_group_id IS NULL
                    AND rts.course_option_id IS NOT NULL
                    AND (p_course_option_id IS NULL OR rts.course_option_id::TEXT = p_course_option_id)
                    AND (p_subject_id IS NULL OR rts.subject_id = p_subject_id)
                    AND (p_stage_id IS NULL OR rts.stage_id = p_stage_id)
                    AND (p_grade_id IS NULL OR rts.grade_id = p_grade_id)
                    AND (p_curriculum_id IS NULL OR rts.curriculum_id = p_curriculum_id)
                )
                OR (
                    (COALESCE(p_track, 'all') = 'quran' OR p_subject_id = 'quran_track' OR p_quran_level_id IS NOT NULL OR p_quran_age_group_id IS NOT NULL)
                    AND rtq.level_id IS NOT NULL
                    AND (p_quran_level_id IS NULL OR rtq.level_id = p_quran_level_id)
                    AND (p_quran_age_group_id IS NULL OR rtq.age_group_id = p_quran_age_group_id)
                )
            )
        )
        SELECT
            COUNT(*)::INTEGER,
            COALESCE((
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', mt.id,
                        'name', mt.name,
                        'honorific', mt.honorific,
                        'headline', mt.headline,
                        'isPublished', mt.is_published,
                        'createdAt', mt.created_at
                    )
                )
                FROM (
                    SELECT * FROM matched_tutors
                    ORDER BY is_published DESC, name ASC
                    LIMIT v_page_size OFFSET v_offset
                ) mt
            ), '[]'::jsonb)
        INTO v_total_count, v_items
        FROM matched_tutors;

        RETURN jsonb_build_object(
            'entityType', 'tutors',
            'totalCount', v_total_count,
            'page', v_page,
            'pageSize', v_page_size,
            'tutors', v_items
        );
    END IF;

    -- 2. تفاصيل المتقدمين (applicants)
    IF p_entity_type = 'applicants' THEN
        WITH
        ref_co AS (
            SELECT
                sco.id,
                sco.subject_id,
                sco.grade_id,
                eg.stage_id,
                sco.curriculum_id
            FROM public.school_course_options sco
            JOIN public.educational_grades eg ON eg.id = sco.grade_id
            JOIN public.educational_stages es ON es.id = eg.stage_id
            JOIN public.subjects s ON s.id = sco.subject_id
            JOIN public.curriculum_types ct ON ct.id = sco.curriculum_id
        ),
        app_json_school_expanded AS (
            SELECT
                a.id AS app_id,
                NULLIF(TRIM(COALESCE(spec_elem->>'courseOptionId', '')), '') AS raw_co_id,
                NULLIF(TRIM(COALESCE(spec_elem->>'subjectId', '')), '') AS raw_subj_id,
                NULLIF(TRIM(COALESCE(spec_elem->>'stageId', '')), '') AS raw_stage_id,
                NULLIF(TRIM(COALESCE(
                    spec_elem->>'curriculumId',
                    spec_elem->>'curriculumTypeId',
                    spec_elem->>'curriculumType',
                    ''
                )), '') AS raw_curr_id,
                g_id AS raw_grade_id
            FROM public.tutor_applications a
            CROSS JOIN LATERAL jsonb_array_elements(
                CASE WHEN a.school_specializations IS NOT NULL AND jsonb_typeof(a.school_specializations) = 'array'
                THEN a.school_specializations ELSE '[]'::jsonb END
            ) AS spec_elem
            LEFT JOIN LATERAL jsonb_array_elements_text(
                CASE WHEN spec_elem ? 'gradeIds' AND jsonb_typeof(spec_elem->'gradeIds') = 'array' AND jsonb_array_length(spec_elem->'gradeIds') > 0
                THEN spec_elem->'gradeIds' ELSE '[]'::jsonb END
            ) AS g_id ON TRUE
        ),
        app_school AS (
            SELECT DISTINCT
                a.id AS app_id,
                rco.id AS course_option_id,
                rco.subject_id,
                rco.grade_id,
                rco.stage_id,
                rco.curriculum_id
            FROM public.tutor_applications a
            CROSS JOIN LATERAL unnest(COALESCE(a.school_course_option_ids, '{}'::UUID[])) AS opt_id
            JOIN ref_co rco ON rco.id = opt_id
            UNION
            SELECT DISTINCT
                e.app_id,
                COALESCE(rco_direct.id, rco_triplet.id) AS course_option_id,
                COALESCE(rco_direct.subject_id, rco_triplet.subject_id) AS subject_id,
                COALESCE(rco_direct.grade_id, rco_triplet.grade_id) AS grade_id,
                COALESCE(rco_direct.stage_id, rco_triplet.stage_id) AS stage_id,
                COALESCE(rco_direct.curriculum_id, rco_triplet.curriculum_id) AS curriculum_id
            FROM app_json_school_expanded e
            LEFT JOIN ref_co rco_direct
                ON e.raw_co_id IS NOT NULL AND rco_direct.id::TEXT = e.raw_co_id
            LEFT JOIN ref_co rco_triplet
                ON e.raw_co_id IS NULL
               AND rco_triplet.subject_id = e.raw_subj_id
               AND rco_triplet.grade_id = e.raw_grade_id
               AND rco_triplet.curriculum_id = e.raw_curr_id
               AND (e.raw_stage_id IS NULL OR e.raw_stage_id = rco_triplet.stage_id)
            WHERE COALESCE(rco_direct.id, rco_triplet.id) IS NOT NULL
        ),
        app_quran AS (
            SELECT DISTINCT
                a.id AS app_id,
                ql.id AS level_id,
                qag.id AS age_group_id
            FROM public.tutor_applications a
            CROSS JOIN LATERAL jsonb_array_elements(
                CASE
                    WHEN a.quran_offerings IS NOT NULL AND jsonb_typeof(a.quran_offerings) = 'array' AND jsonb_array_length(a.quran_offerings) > 0
                    THEN a.quran_offerings
                    WHEN COALESCE(array_length(a.quran_levels, 1), 0) = 1 AND COALESCE(array_length(a.quran_age_groups, 1), 0) = 1
                    THEN jsonb_build_array(jsonb_build_object('levelId', a.quran_levels[1], 'ageGroupId', a.quran_age_groups[1]))
                    ELSE '[]'::jsonb
                END
            ) AS qo_elem
            JOIN public.quran_levels ql ON ql.id = NULLIF(TRIM(COALESCE(qo_elem->>'levelId', qo_elem->>'level_id', '')), '')
            JOIN public.quran_age_groups qag ON qag.id = NULLIF(TRIM(COALESCE(qo_elem->>'ageGroupId', qo_elem->>'age_group_id', '')), '')
        ),
        matched_apps AS (
            SELECT DISTINCT
                a.id,
                a.reference_code,
                a.full_name,
                a.phone,
                a.track,
                COALESCE(a.status, 'submitted') AS status,
                a.created_at
            FROM public.tutor_applications a
            LEFT JOIN app_school aps ON aps.app_id = a.id
            LEFT JOIN app_quran apq ON apq.app_id = a.id
            WHERE COALESCE(a.status, 'submitted') <> 'draft'
              AND (
                  p_status_filter IS NULL OR p_status_filter = 'all'
                  OR (p_status_filter = 'pending' AND COALESCE(a.status, 'submitted') NOT IN ('draft', 'approved', 'rejected'))
                  OR COALESCE(a.status, 'submitted') = p_status_filter
              )
              AND (
                  (
                      COALESCE(p_track, 'all') = 'all'
                      AND p_subject_id IS NULL
                      AND p_stage_id IS NULL
                      AND p_grade_id IS NULL
                      AND p_curriculum_id IS NULL
                      AND p_course_option_id IS NULL
                      AND p_quran_level_id IS NULL
                      AND p_quran_age_group_id IS NULL
                  )
                  OR (
                      COALESCE(p_track, 'all') IN ('all', 'school')
                      AND (p_subject_id IS NULL OR p_subject_id <> 'quran_track')
                      AND p_quran_level_id IS NULL
                      AND p_quran_age_group_id IS NULL
                      AND aps.app_id IS NOT NULL
                      AND (p_course_option_id IS NULL OR aps.course_option_id::TEXT = p_course_option_id)
                      AND (p_subject_id IS NULL OR aps.subject_id = p_subject_id)
                      AND (p_stage_id IS NULL OR aps.stage_id = p_stage_id)
                      AND (p_grade_id IS NULL OR aps.grade_id = p_grade_id)
                      AND (p_curriculum_id IS NULL OR aps.curriculum_id = p_curriculum_id)
                  )
                  OR (
                      (COALESCE(p_track, 'all') = 'quran' OR p_subject_id = 'quran_track' OR p_quran_level_id IS NOT NULL OR p_quran_age_group_id IS NOT NULL)
                      AND apq.app_id IS NOT NULL
                      AND (p_quran_level_id IS NULL OR apq.level_id = p_quran_level_id)
                      AND (p_quran_age_group_id IS NULL OR apq.age_group_id = p_quran_age_group_id)
                  )
              )
        )
        SELECT
            COUNT(*)::INTEGER,
            COALESCE((
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', ma.id,
                        'referenceCode', ma.reference_code,
                        'fullName', ma.full_name,
                        'phone', ma.phone,
                        'track', ma.track,
                        'status', ma.status,
                        'createdAt', ma.created_at
                    )
                )
                FROM (
                    SELECT * FROM matched_apps
                    ORDER BY created_at DESC
                    LIMIT v_page_size OFFSET v_offset
                ) ma
            ), '[]'::jsonb)
        INTO v_total_count, v_items
        FROM matched_apps;

        RETURN jsonb_build_object(
            'entityType', 'applicants',
            'totalCount', v_total_count,
            'page', v_page,
            'pageSize', v_page_size,
            'applicants', v_items
        );
    END IF;

    -- 3. تفاصيل الاشتراكات والحجوزات (subscriptions)
    IF p_entity_type = 'subscriptions' THEN
        WITH
        ref_course_options AS (
            SELECT
                sco.id,
                sco.grade_id,
                eg.stage_id,
                sco.subject_id,
                sco.curriculum_id,
                (s.name || ' - ' || eg.name || ' (' || ct.name || ')') AS canonical_label
            FROM public.school_course_options sco
            JOIN public.educational_grades eg ON eg.id = sco.grade_id
            JOIN public.educational_stages es ON es.id = eg.stage_id
            JOIN public.subjects s ON s.id = sco.subject_id
            JOIN public.curriculum_types ct ON ct.id = sco.curriculum_id
        ),
        ref_quran_pairs AS (
            SELECT
                (ql.id || '|' || qag.id) AS pair_key,
                ql.id AS level_id,
                qag.id AS age_group_id,
                ('قرآن وتأسيس: ' || ql.name || ' (' || qag.name || ')') AS canonical_label
            FROM public.quran_levels ql
            CROSS JOIN public.quran_age_groups qag
        ),
        tutor_unambiguous_labels AS (
            SELECT
                tutor_id,
                TRIM(canonical_label) AS exact_label,
                COUNT(*) AS matches_count,
                MIN(res_track) AS res_track,
                MIN(course_option_id::TEXT) AS course_option_id_text,
                MIN(subject_id) AS subject_id,
                MIN(grade_id) AS grade_id,
                MIN(stage_id) AS stage_id,
                MIN(curriculum_id) AS curriculum_id,
                MIN(level_id) AS level_id,
                MIN(age_group_id) AS age_group_id
            FROM (
                SELECT
                    tso.tutor_id,
                    rco.canonical_label,
                    'school'::TEXT AS res_track,
                    rco.id AS course_option_id,
                    rco.subject_id,
                    rco.grade_id,
                    rco.stage_id,
                    rco.curriculum_id,
                    NULL::TEXT AS level_id,
                    NULL::TEXT AS age_group_id
                FROM public.tutor_school_offerings tso
                JOIN public.tutors vt ON vt.id = tso.tutor_id
                JOIN ref_course_options rco ON rco.id = tso.course_option_id
                UNION ALL
                SELECT
                    tqo.tutor_id,
                    rqp.canonical_label,
                    'quran'::TEXT AS res_track,
                    NULL::UUID AS course_option_id,
                    NULL::TEXT AS subject_id,
                    NULL::TEXT AS grade_id,
                    NULL::TEXT AS stage_id,
                    NULL::TEXT AS curriculum_id,
                    rqp.level_id,
                    rqp.age_group_id
                FROM public.tutor_quran_offerings tqo
                JOIN public.tutors vt ON vt.id = tqo.tutor_id
                JOIN ref_quran_pairs rqp ON rqp.level_id = tqo.level_id AND rqp.age_group_id = tqo.age_group_id
            ) combined_specs
            GROUP BY tutor_id, TRIM(canonical_label)
        ),
        resolved_private_slots AS (
            SELECT
                ps.id,
                ps.tutor_id,
                ps.specialization_label,
                CASE
                    WHEN ps.offering_course_option_id IS NOT NULL AND (ps.quran_age_group_id IS NOT NULL OR ps.quran_level_id IS NOT NULL) THEN 'unclassified'
                    WHEN ps.offering_course_option_id IS NOT NULL THEN CASE WHEN rco.id IS NOT NULL THEN 'school' ELSE 'unclassified' END
                    WHEN ps.quran_age_group_id IS NOT NULL OR ps.quran_level_id IS NOT NULL THEN CASE WHEN rqp.pair_key IS NOT NULL THEN 'quran' ELSE 'unclassified' END
                    WHEN tul.matches_count = 1 THEN tul.res_track
                    ELSE 'unclassified'
                END AS res_status,
                CASE
                    WHEN ps.offering_course_option_id IS NOT NULL AND ps.quran_age_group_id IS NULL AND ps.quran_level_id IS NULL THEN rco.id
                    WHEN ps.offering_course_option_id IS NULL AND ps.quran_age_group_id IS NULL AND ps.quran_level_id IS NULL AND tul.matches_count = 1 AND tul.res_track = 'school' THEN tul.course_option_id_text::UUID
                    ELSE NULL
                END AS course_option_id,
                CASE
                    WHEN ps.offering_course_option_id IS NOT NULL AND ps.quran_age_group_id IS NULL AND ps.quran_level_id IS NULL THEN rco.subject_id
                    WHEN ps.offering_course_option_id IS NULL AND ps.quran_age_group_id IS NULL AND ps.quran_level_id IS NULL AND tul.matches_count = 1 AND tul.res_track = 'school' THEN tul.subject_id
                    ELSE NULL
                END AS subject_id,
                CASE
                    WHEN ps.offering_course_option_id IS NOT NULL AND ps.quran_age_group_id IS NULL AND ps.quran_level_id IS NULL THEN rco.grade_id
                    WHEN ps.offering_course_option_id IS NULL AND ps.quran_age_group_id IS NULL AND ps.quran_level_id IS NULL AND tul.matches_count = 1 AND tul.res_track = 'school' THEN tul.grade_id
                    ELSE NULL
                END AS grade_id,
                CASE
                    WHEN ps.offering_course_option_id IS NOT NULL AND ps.quran_age_group_id IS NULL AND ps.quran_level_id IS NULL THEN rco.stage_id
                    WHEN ps.offering_course_option_id IS NULL AND ps.quran_age_group_id IS NULL AND ps.quran_level_id IS NULL AND tul.matches_count = 1 AND tul.res_track = 'school' THEN tul.stage_id
                    ELSE NULL
                END AS stage_id,
                CASE
                    WHEN ps.offering_course_option_id IS NOT NULL AND ps.quran_age_group_id IS NULL AND ps.quran_level_id IS NULL THEN rco.curriculum_id
                    WHEN ps.offering_course_option_id IS NULL AND ps.quran_age_group_id IS NULL AND ps.quran_level_id IS NULL AND tul.matches_count = 1 AND tul.res_track = 'school' THEN tul.curriculum_id
                    ELSE NULL
                END AS curriculum_id,
                CASE
                    WHEN ps.offering_course_option_id IS NULL AND (ps.quran_age_group_id IS NOT NULL OR ps.quran_level_id IS NOT NULL) THEN rqp.level_id
                    WHEN ps.offering_course_option_id IS NULL AND ps.quran_age_group_id IS NULL AND ps.quran_level_id IS NULL AND tul.matches_count = 1 AND tul.res_track = 'quran' THEN tul.level_id
                    ELSE NULL
                END AS level_id,
                CASE
                    WHEN ps.offering_course_option_id IS NULL AND (ps.quran_age_group_id IS NOT NULL OR ps.quran_level_id IS NOT NULL) THEN rqp.age_group_id
                    WHEN ps.offering_course_option_id IS NULL AND ps.quran_age_group_id IS NULL AND ps.quran_level_id IS NULL AND tul.matches_count = 1 AND tul.res_track = 'quran' THEN tul.age_group_id
                    ELSE NULL
                END AS age_group_id
            FROM public.tutor_private_slots ps
            LEFT JOIN ref_course_options rco ON rco.id = ps.offering_course_option_id
            LEFT JOIN ref_quran_pairs rqp ON rqp.age_group_id = ps.quran_age_group_id AND rqp.level_id = ps.quran_level_id
            LEFT JOIN tutor_unambiguous_labels tul ON tul.tutor_id = ps.tutor_id AND tul.exact_label = TRIM(ps.specialization_label)
        ),
        resolved_groups AS (
            SELECT
                g.id,
                g.tutor_id,
                g.title,
                g.specialization_label,
                CASE
                    WHEN g.offering_course_option_id IS NOT NULL AND (g.quran_age_group_id IS NOT NULL OR g.quran_level_id IS NOT NULL) THEN 'unclassified'
                    WHEN g.offering_course_option_id IS NOT NULL THEN CASE WHEN rco.id IS NOT NULL THEN 'school' ELSE 'unclassified' END
                    WHEN g.quran_age_group_id IS NOT NULL OR g.quran_level_id IS NOT NULL THEN CASE WHEN rqp.pair_key IS NOT NULL THEN 'quran' ELSE 'unclassified' END
                    WHEN tul.matches_count = 1 THEN tul.res_track
                    ELSE 'unclassified'
                END AS res_status,
                CASE
                    WHEN g.offering_course_option_id IS NOT NULL AND g.quran_age_group_id IS NULL AND g.quran_level_id IS NULL THEN rco.id
                    WHEN g.offering_course_option_id IS NULL AND g.quran_age_group_id IS NULL AND g.quran_level_id IS NULL AND tul.matches_count = 1 AND tul.res_track = 'school' THEN tul.course_option_id_text::UUID
                    ELSE NULL
                END AS course_option_id,
                CASE
                    WHEN g.offering_course_option_id IS NOT NULL AND g.quran_age_group_id IS NULL AND g.quran_level_id IS NULL THEN rco.subject_id
                    WHEN g.offering_course_option_id IS NULL AND g.quran_age_group_id IS NULL AND g.quran_level_id IS NULL AND tul.matches_count = 1 AND tul.res_track = 'school' THEN tul.subject_id
                    ELSE NULL
                END AS subject_id,
                CASE
                    WHEN g.offering_course_option_id IS NOT NULL AND g.quran_age_group_id IS NULL AND g.quran_level_id IS NULL THEN rco.grade_id
                    WHEN g.offering_course_option_id IS NULL AND g.quran_age_group_id IS NULL AND g.quran_level_id IS NULL AND tul.matches_count = 1 AND tul.res_track = 'school' THEN tul.grade_id
                    ELSE NULL
                END AS grade_id,
                CASE
                    WHEN g.offering_course_option_id IS NOT NULL AND g.quran_age_group_id IS NULL AND g.quran_level_id IS NULL THEN rco.stage_id
                    WHEN g.offering_course_option_id IS NULL AND g.quran_age_group_id IS NULL AND g.quran_level_id IS NULL AND tul.matches_count = 1 AND tul.res_track = 'school' THEN tul.stage_id
                    ELSE NULL
                END AS stage_id,
                CASE
                    WHEN g.offering_course_option_id IS NOT NULL AND g.quran_age_group_id IS NULL AND g.quran_level_id IS NULL THEN rco.curriculum_id
                    WHEN g.offering_course_option_id IS NULL AND g.quran_age_group_id IS NULL AND g.quran_level_id IS NULL AND tul.matches_count = 1 AND tul.res_track = 'school' THEN tul.curriculum_id
                    ELSE NULL
                END AS curriculum_id,
                CASE
                    WHEN g.offering_course_option_id IS NULL AND (g.quran_age_group_id IS NOT NULL OR g.quran_level_id IS NOT NULL) THEN rqp.level_id
                    WHEN g.offering_course_option_id IS NULL AND g.quran_age_group_id IS NULL AND g.quran_level_id IS NULL AND tul.matches_count = 1 AND tul.res_track = 'quran' THEN tul.level_id
                    ELSE NULL
                END AS level_id,
                CASE
                    WHEN g.offering_course_option_id IS NULL AND (g.quran_age_group_id IS NOT NULL OR g.quran_level_id IS NOT NULL) THEN rqp.age_group_id
                    WHEN g.offering_course_option_id IS NULL AND g.quran_age_group_id IS NULL AND g.quran_level_id IS NULL AND tul.matches_count = 1 AND tul.res_track = 'quran' THEN tul.age_group_id
                    ELSE NULL
                END AS age_group_id
            FROM public.tutor_groups g
            LEFT JOIN ref_course_options rco ON rco.id = g.offering_course_option_id
            LEFT JOIN ref_quran_pairs rqp ON rqp.age_group_id = g.quran_age_group_id AND rqp.level_id = g.quran_level_id
            LEFT JOIN tutor_unambiguous_labels tul ON tul.tutor_id = g.tutor_id AND tul.exact_label = TRIM(g.specialization_label)
        ),
        all_subs AS (
            SELECT
                pb.id,
                'private'::TEXT AS kind,
                pb.student_name,
                pb.tutor_id,
                CASE WHEN t.id IS NOT NULL THEN (COALESCE(t.honorific, 'أ.') || ' ' || t.name) ELSE pb.tutor_id END AS tutor_name,
                COALESCE(rps.specialization_label, '') AS specialization_label,
                NULL::TEXT AS group_title,
                pb.status,
                pb.created_at,
                CASE WHEN rps.id IS NULL OR rps.tutor_id <> pb.tutor_id THEN 'unclassified' ELSE rps.res_status END AS res_status,
                CASE WHEN rps.id IS NOT NULL AND rps.tutor_id = pb.tutor_id THEN rps.course_option_id ELSE NULL END AS course_option_id,
                CASE WHEN rps.id IS NOT NULL AND rps.tutor_id = pb.tutor_id THEN rps.subject_id ELSE NULL END AS subject_id,
                CASE WHEN rps.id IS NOT NULL AND rps.tutor_id = pb.tutor_id THEN rps.grade_id ELSE NULL END AS grade_id,
                CASE WHEN rps.id IS NOT NULL AND rps.tutor_id = pb.tutor_id THEN rps.stage_id ELSE NULL END AS stage_id,
                CASE WHEN rps.id IS NOT NULL AND rps.tutor_id = pb.tutor_id THEN rps.curriculum_id ELSE NULL END AS curriculum_id,
                CASE WHEN rps.id IS NOT NULL AND rps.tutor_id = pb.tutor_id THEN rps.level_id ELSE NULL END AS level_id,
                CASE WHEN rps.id IS NOT NULL AND rps.tutor_id = pb.tutor_id THEN rps.age_group_id ELSE NULL END AS age_group_id
            FROM public.tutor_private_bookings pb
            LEFT JOIN resolved_private_slots rps ON rps.id = pb.slot_id
            LEFT JOIN public.tutors t ON t.id = pb.tutor_id
            UNION ALL
            SELECT
                ge.id,
                'group'::TEXT AS kind,
                ge.student_name,
                ge.tutor_id,
                CASE WHEN t.id IS NOT NULL THEN (COALESCE(t.honorific, 'أ.') || ' ' || t.name) ELSE ge.tutor_id END AS tutor_name,
                COALESCE(rg.specialization_label, '') AS specialization_label,
                rg.title AS group_title,
                ge.status,
                ge.created_at,
                CASE WHEN rg.id IS NULL OR rg.tutor_id <> ge.tutor_id THEN 'unclassified' ELSE rg.res_status END AS res_status,
                CASE WHEN rg.id IS NOT NULL AND rg.tutor_id = ge.tutor_id THEN rg.course_option_id ELSE NULL END AS course_option_id,
                CASE WHEN rg.id IS NOT NULL AND rg.tutor_id = ge.tutor_id THEN rg.subject_id ELSE NULL END AS subject_id,
                CASE WHEN rg.id IS NOT NULL AND rg.tutor_id = ge.tutor_id THEN rg.grade_id ELSE NULL END AS grade_id,
                CASE WHEN rg.id IS NOT NULL AND rg.tutor_id = ge.tutor_id THEN rg.stage_id ELSE NULL END AS stage_id,
                CASE WHEN rg.id IS NOT NULL AND rg.tutor_id = ge.tutor_id THEN rg.curriculum_id ELSE NULL END AS curriculum_id,
                CASE WHEN rg.id IS NOT NULL AND rg.tutor_id = ge.tutor_id THEN rg.level_id ELSE NULL END AS level_id,
                CASE WHEN rg.id IS NOT NULL AND rg.tutor_id = ge.tutor_id THEN rg.age_group_id ELSE NULL END AS age_group_id
            FROM public.tutor_group_enrollments ge
            LEFT JOIN resolved_groups rg ON rg.id = ge.group_id
            LEFT JOIN public.tutors t ON t.id = ge.tutor_id
        ),
        matched_subs AS (
            SELECT *
            FROM all_subs s
            WHERE (p_status_filter IS NULL OR p_status_filter = 'all' OR s.status = p_status_filter)
              AND (
                  (
                      COALESCE(p_track, 'all') = 'all'
                      AND p_subject_id IS NULL
                      AND p_stage_id IS NULL
                      AND p_grade_id IS NULL
                      AND p_curriculum_id IS NULL
                      AND p_course_option_id IS NULL
                      AND p_quran_level_id IS NULL
                      AND p_quran_age_group_id IS NULL
                  )
                  OR (
                      COALESCE(p_track, 'all') IN ('all', 'school')
                      AND (p_subject_id IS NULL OR p_subject_id <> 'quran_track')
                      AND p_quran_level_id IS NULL
                      AND p_quran_age_group_id IS NULL
                      AND s.res_status = 'school'
                      AND (p_course_option_id IS NULL OR s.course_option_id::TEXT = p_course_option_id)
                      AND (p_subject_id IS NULL OR s.subject_id = p_subject_id)
                      AND (p_stage_id IS NULL OR s.stage_id = p_stage_id)
                      AND (p_grade_id IS NULL OR s.grade_id = p_grade_id)
                      AND (p_curriculum_id IS NULL OR s.curriculum_id = p_curriculum_id)
                  )
                  OR (
                      (COALESCE(p_track, 'all') = 'quran' OR p_subject_id = 'quran_track' OR p_quran_level_id IS NOT NULL OR p_quran_age_group_id IS NOT NULL)
                      AND s.res_status = 'quran'
                      AND (p_quran_level_id IS NULL OR s.level_id = p_quran_level_id)
                      AND (p_quran_age_group_id IS NULL OR s.age_group_id = p_quran_age_group_id)
                  )
              )
        )
        SELECT
            COUNT(*)::INTEGER,
            COALESCE((
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', ms.id,
                        'kind', ms.kind,
                        'studentName', ms.student_name,
                        'tutorId', ms.tutor_id,
                        'tutorName', ms.tutor_name,
                        'specializationLabel', ms.specialization_label,
                        'groupTitle', ms.group_title,
                        'status', ms.status,
                        'createdAt', ms.created_at
                    )
                )
                FROM (
                    SELECT * FROM matched_subs
                    ORDER BY created_at DESC
                    LIMIT v_page_size OFFSET v_offset
                ) ms
            ), '[]'::jsonb)
        INTO v_total_count, v_items
        FROM matched_subs;

        RETURN jsonb_build_object(
            'entityType', 'subscriptions',
            'totalCount', v_total_count,
            'page', v_page,
            'pageSize', v_page_size,
            'subscriptions', v_items
        );
    END IF;

    -- 4. تفاصيل السجلات غير المصنفة (unclassified)
    IF p_entity_type = 'unclassified' THEN
        WITH
        ref_course_options AS (
            SELECT
                sco.id,
                sco.grade_id,
                eg.stage_id,
                sco.subject_id,
                sco.curriculum_id,
                (s.name || ' - ' || eg.name || ' (' || ct.name || ')') AS canonical_label
            FROM public.school_course_options sco
            JOIN public.educational_grades eg ON eg.id = sco.grade_id
            JOIN public.educational_stages es ON es.id = eg.stage_id
            JOIN public.subjects s ON s.id = sco.subject_id
            JOIN public.curriculum_types ct ON ct.id = sco.curriculum_id
        ),
        ref_quran_pairs AS (
            SELECT
                (ql.id || '|' || qag.id) AS pair_key,
                ql.id AS level_id,
                qag.id AS age_group_id,
                ('قرآن وتأسيس: ' || ql.name || ' (' || qag.name || ')') AS canonical_label
            FROM public.quran_levels ql
            CROSS JOIN public.quran_age_groups qag
        ),
        resolved_tutor_school AS (
            SELECT
                tso.id AS offering_id,
                tso.tutor_id,
                tso.course_option_id,
                vt.name AS tutor_name,
                vt.honorific AS tutor_honorific,
                rco.canonical_label,
                CASE
                    WHEN vt.id IS NULL THEN 'unclassified'
                    WHEN rco.id IS NULL THEN 'unclassified'
                    ELSE 'school'
                END AS res_status
            FROM public.tutor_school_offerings tso
            LEFT JOIN public.tutors vt ON vt.id = tso.tutor_id
            LEFT JOIN ref_course_options rco ON rco.id = tso.course_option_id
        ),
        resolved_tutor_quran AS (
            SELECT
                tqo.id AS offering_id,
                tqo.tutor_id,
                tqo.level_id,
                tqo.age_group_id,
                vt.name AS tutor_name,
                vt.honorific AS tutor_honorific,
                rqp.canonical_label,
                CASE
                    WHEN vt.id IS NULL THEN 'unclassified'
                    WHEN rqp.pair_key IS NULL THEN 'unclassified'
                    ELSE 'quran'
                END AS res_status
            FROM public.tutor_quran_offerings tqo
            LEFT JOIN public.tutors vt ON vt.id = tqo.tutor_id
            LEFT JOIN ref_quran_pairs rqp ON rqp.level_id = tqo.level_id AND rqp.age_group_id = tqo.age_group_id
        ),
        tutor_unambiguous_labels AS (
            SELECT
                tutor_id,
                TRIM(canonical_label) AS exact_label,
                COUNT(*) AS matches_count,
                MIN(res_track) AS res_track
            FROM (
                SELECT tutor_id, canonical_label, 'school'::TEXT AS res_track
                FROM resolved_tutor_school WHERE res_status = 'school'
                UNION ALL
                SELECT tutor_id, canonical_label, 'quran'::TEXT AS res_track
                FROM resolved_tutor_quran WHERE res_status = 'quran'
            ) cs
            GROUP BY tutor_id, TRIM(canonical_label)
        ),
        app_opt_ids AS (
            SELECT
                a.id AS app_id,
                opt_id,
                rco.id AS valid_course_option_id
            FROM public.tutor_applications a
            CROSS JOIN LATERAL unnest(COALESCE(a.school_course_option_ids, '{}'::UUID[])) AS opt_id
            LEFT JOIN ref_course_options rco ON rco.id = opt_id
        ),
        app_json_school_expanded AS (
            SELECT
                a.id AS app_id,
                NULLIF(TRIM(COALESCE(spec_elem->>'courseOptionId', '')), '') AS raw_co_id,
                NULLIF(TRIM(COALESCE(spec_elem->>'subjectId', '')), '') AS raw_subj_id,
                NULLIF(TRIM(COALESCE(spec_elem->>'stageId', '')), '') AS raw_stage_id,
                NULLIF(TRIM(COALESCE(
                    spec_elem->>'curriculumId',
                    spec_elem->>'curriculumTypeId',
                    spec_elem->>'curriculumType',
                    ''
                )), '') AS raw_curr_id,
                g_id AS raw_grade_id,
                (spec_elem ? 'gradeIds' AND jsonb_typeof(spec_elem->'gradeIds') = 'array' AND jsonb_array_length(spec_elem->'gradeIds') > 0) AS has_grade_array
            FROM public.tutor_applications a
            CROSS JOIN LATERAL jsonb_array_elements(
                CASE WHEN a.school_specializations IS NOT NULL AND jsonb_typeof(a.school_specializations) = 'array'
                THEN a.school_specializations ELSE '[]'::jsonb END
            ) AS spec_elem
            LEFT JOIN LATERAL jsonb_array_elements_text(
                CASE WHEN spec_elem ? 'gradeIds' AND jsonb_typeof(spec_elem->'gradeIds') = 'array' AND jsonb_array_length(spec_elem->'gradeIds') > 0
                THEN spec_elem->'gradeIds' ELSE '[]'::jsonb END
            ) AS g_id ON TRUE
        ),
        app_json_school_resolved AS (
            SELECT
                e.app_id,
                COALESCE(rco_direct.id, rco_triplet.id) AS valid_course_option_id,
                CASE
                    WHEN e.raw_co_id IS NOT NULL THEN (rco_direct.id IS NOT NULL)
                    WHEN e.raw_subj_id IS NOT NULL AND e.raw_curr_id IS NOT NULL AND e.has_grade_array AND e.raw_grade_id IS NOT NULL THEN
                        (rco_triplet.id IS NOT NULL AND (e.raw_stage_id IS NULL OR e.raw_stage_id = rco_triplet.stage_id))
                    ELSE FALSE
                END AS is_valid
            FROM app_json_school_expanded e
            LEFT JOIN ref_course_options rco_direct ON e.raw_co_id IS NOT NULL AND rco_direct.id::TEXT = e.raw_co_id
            LEFT JOIN ref_course_options rco_triplet
                ON e.raw_co_id IS NULL
               AND rco_triplet.subject_id = e.raw_subj_id
               AND rco_triplet.grade_id = e.raw_grade_id
               AND rco_triplet.curriculum_id = e.raw_curr_id
        ),
        app_valid_school_specs AS (
            SELECT DISTINCT app_id, valid_course_option_id
            FROM (
                SELECT app_id, valid_course_option_id FROM app_opt_ids WHERE valid_course_option_id IS NOT NULL
                UNION ALL
                SELECT app_id, valid_course_option_id FROM app_json_school_resolved WHERE is_valid = TRUE AND valid_course_option_id IS NOT NULL
            ) s
        ),
        app_json_quran_resolved AS (
            SELECT
                a.id AS app_id,
                rqp.pair_key,
                (rqp.pair_key IS NOT NULL) AS is_valid
            FROM public.tutor_applications a
            CROSS JOIN LATERAL jsonb_array_elements(
                CASE
                    WHEN a.quran_offerings IS NOT NULL AND jsonb_typeof(a.quran_offerings) = 'array' AND jsonb_array_length(a.quran_offerings) > 0
                    THEN a.quran_offerings
                    WHEN COALESCE(array_length(a.quran_levels, 1), 0) = 1 AND COALESCE(array_length(a.quran_age_groups, 1), 0) = 1
                    THEN jsonb_build_array(jsonb_build_object('levelId', a.quran_levels[1], 'ageGroupId', a.quran_age_groups[1]))
                    ELSE '[]'::jsonb
                END
            ) AS qo_elem
            LEFT JOIN ref_quran_pairs rqp
                ON rqp.level_id = NULLIF(TRIM(COALESCE(qo_elem->>'levelId', qo_elem->>'level_id', '')), '')
               AND rqp.age_group_id = NULLIF(TRIM(COALESCE(qo_elem->>'ageGroupId', qo_elem->>'age_group_id', '')), '')
        ),
        app_valid_quran_specs AS (
            SELECT DISTINCT app_id, pair_key
            FROM app_json_quran_resolved WHERE is_valid = TRUE
        ),
        resolved_private_slots AS (
            SELECT
                ps.id,
                ps.tutor_id,
                ps.specialization_label,
                ps.slot_date,
                ps.start_time,
                ps.created_at,
                CASE
                    WHEN ps.offering_course_option_id IS NOT NULL AND (ps.quran_age_group_id IS NOT NULL OR ps.quran_level_id IS NOT NULL) THEN 'unclassified'
                    WHEN ps.offering_course_option_id IS NOT NULL THEN CASE WHEN rco.id IS NOT NULL THEN 'school' ELSE 'unclassified' END
                    WHEN ps.quran_age_group_id IS NOT NULL OR ps.quran_level_id IS NOT NULL THEN CASE WHEN rqp.pair_key IS NOT NULL THEN 'quran' ELSE 'unclassified' END
                    WHEN tul.matches_count = 1 THEN tul.res_track
                    ELSE 'unclassified'
                END AS res_status
            FROM public.tutor_private_slots ps
            LEFT JOIN ref_course_options rco ON rco.id = ps.offering_course_option_id
            LEFT JOIN ref_quran_pairs rqp ON rqp.age_group_id = ps.quran_age_group_id AND rqp.level_id = ps.quran_level_id
            LEFT JOIN tutor_unambiguous_labels tul ON tul.tutor_id = ps.tutor_id AND tul.exact_label = TRIM(ps.specialization_label)
        ),
        resolved_groups AS (
            SELECT
                g.id,
                g.tutor_id,
                g.title,
                g.specialization_label,
                g.created_at,
                CASE
                    WHEN g.offering_course_option_id IS NOT NULL AND (g.quran_age_group_id IS NOT NULL OR g.quran_level_id IS NOT NULL) THEN 'unclassified'
                    WHEN g.offering_course_option_id IS NOT NULL THEN CASE WHEN rco.id IS NOT NULL THEN 'school' ELSE 'unclassified' END
                    WHEN g.quran_age_group_id IS NOT NULL OR g.quran_level_id IS NOT NULL THEN CASE WHEN rqp.pair_key IS NOT NULL THEN 'quran' ELSE 'unclassified' END
                    WHEN tul.matches_count = 1 THEN tul.res_track
                    ELSE 'unclassified'
                END AS res_status
            FROM public.tutor_groups g
            LEFT JOIN ref_course_options rco ON rco.id = g.offering_course_option_id
            LEFT JOIN ref_quran_pairs rqp ON rqp.age_group_id = g.quran_age_group_id AND rqp.level_id = g.quran_level_id
            LEFT JOIN tutor_unambiguous_labels tul ON tul.tutor_id = g.tutor_id AND tul.exact_label = TRIM(g.specialization_label)
        ),
        unclassified_rows AS (
            -- 4.1 معلمون بلا أي تخصص مرجعي صالح
            SELECT
                t.id::TEXT AS id,
                'unassigned_tutor'::TEXT AS category,
                (COALESCE(t.honorific, 'أ.') || ' ' || t.name) AS title,
                CASE WHEN t.is_published THEN 'معلم منشور' ELSE 'معلم غير منشور' END AS subtitle,
                'حساب معلم لا يمتلك أي تخصص مدرسي أو قرآني مرجعي مسجل'::TEXT AS reason,
                t.created_at,
                t.id::TEXT AS entity_id
            FROM public.tutors t
            WHERE NOT EXISTS (
                SELECT 1 FROM resolved_tutor_school rts
                WHERE rts.tutor_id = t.id AND rts.res_status = 'school'
            )
            AND NOT EXISTS (
                SELECT 1 FROM resolved_tutor_quran rtq
                WHERE rtq.tutor_id = t.id AND rtq.res_status = 'quran'
            )
            UNION ALL
            -- 4.2 عروض تخصصات معلمين غير صالحة مرجعياً
            SELECT
                rts.offering_id::TEXT AS id,
                'tutor_offering'::TEXT AS category,
                CASE WHEN rts.tutor_name IS NOT NULL THEN ('تخصص مدرسي لمعلم: ' || COALESCE(rts.tutor_honorific, 'أ.') || ' ' || rts.tutor_name) ELSE ('تخصص مدرسي (' || rts.tutor_id || ')') END AS title,
                ('course_option_id: ' || COALESCE(rts.course_option_id::TEXT, 'غير محدد')) AS subtitle,
                'عرض مادة مدرسية مرتبط بمعرف معلم أو خيار مادة غير صالح مرجعياً'::TEXT AS reason,
                NOW() AS created_at,
                rts.tutor_id::TEXT AS entity_id
            FROM resolved_tutor_school rts
            WHERE rts.res_status = 'unclassified'
            UNION ALL
            SELECT
                rtq.offering_id::TEXT AS id,
                'tutor_offering'::TEXT AS category,
                CASE WHEN rtq.tutor_name IS NOT NULL THEN ('تخصص قرآني لمعلم: ' || COALESCE(rtq.tutor_honorific, 'أ.') || ' ' || rtq.tutor_name) ELSE ('تخصص قرآني (' || rtq.tutor_id || ')') END AS title,
                (COALESCE(rtq.level_id, '؟') || ' / ' || COALESCE(rtq.age_group_id, '؟')) AS subtitle,
                'عرض قرآني مرتبط بمعرف معلم أو زوج (مستوى/فئة عمرية) غير صالح مرجعياً'::TEXT AS reason,
                NOW() AS created_at,
                rtq.tutor_id::TEXT AS entity_id
            FROM resolved_tutor_quran rtq
            WHERE rtq.res_status = 'unclassified'
            UNION ALL
            -- 4.3 طلبات انضمام غير مصنفة أو ذات تخصصات ناقصة/غامضة
            SELECT DISTINCT
                a.id::TEXT AS id,
                'application'::TEXT AS category,
                a.full_name AS title,
                ('طلب انضمام (' || COALESCE(a.reference_code, '') || ') — ' || COALESCE(a.phone, '')) AS subtitle,
                'طلب انضمام لا يرتبط بتخصصات مرجعية مكتملة أو يحتوي على بيانات تخصص غامضة'::TEXT AS reason,
                a.created_at,
                a.id::TEXT AS entity_id
            FROM public.tutor_applications a
            LEFT JOIN app_valid_school_specs vss ON vss.app_id = a.id
            LEFT JOIN app_valid_quran_specs vqs ON vqs.app_id = a.id
            WHERE COALESCE(a.status, 'submitted') <> 'draft'
              AND (
                  (vss.app_id IS NULL AND vqs.app_id IS NULL)
                  OR EXISTS (SELECT 1 FROM app_opt_ids o WHERE o.app_id = a.id AND o.valid_course_option_id IS NULL)
                  OR EXISTS (SELECT 1 FROM app_json_school_resolved js WHERE js.app_id = a.id AND js.is_valid = FALSE)
                  OR EXISTS (SELECT 1 FROM app_json_quran_resolved jq WHERE jq.app_id = a.id AND jq.is_valid = FALSE)
                  OR (
                      (a.quran_offerings IS NULL OR jsonb_typeof(a.quran_offerings) <> 'array' OR jsonb_array_length(a.quran_offerings) = 0)
                      AND (COALESCE(array_length(a.quran_levels, 1), 0) > 0 OR COALESCE(array_length(a.quran_age_groups, 1), 0) > 0)
                      AND NOT (COALESCE(array_length(a.quran_levels, 1), 0) = 1 AND COALESCE(array_length(a.quran_age_groups, 1), 0) = 1)
                  )
              )
            UNION ALL
            -- 4.4 مجموعات غير مصنفة مرجعياً
            SELECT
                rg.id::TEXT AS id,
                'group'::TEXT AS category,
                rg.title AS title,
                COALESCE(rg.specialization_label, '') AS subtitle,
                'مجموعة تفتقر إلى معرف التخصص المرجعي الصحيح أو تتعارض مع تخصصات المعلم'::TEXT AS reason,
                rg.created_at,
                rg.id::TEXT AS entity_id
            FROM resolved_groups rg
            WHERE rg.res_status = 'unclassified'
            UNION ALL
            -- 4.5 مواعيد خاصة غير مصنفة مرجعياً
            SELECT
                rps.id::TEXT AS id,
                'private_slot'::TEXT AS category,
                COALESCE(rps.specialization_label, 'موعد حصة خاصة') AS title,
                (rps.slot_date::TEXT || ' ' || rps.start_time::TEXT) AS subtitle,
                'موعد خاص يفتقر إلى معرف التخصص المرجعي الصحيح أو يتعارض مع تخصصات المعلم'::TEXT AS reason,
                rps.created_at,
                rps.id::TEXT AS entity_id
            FROM resolved_private_slots rps
            WHERE rps.res_status = 'unclassified'
            UNION ALL
            -- 4.6 حجوزات خاصة مرتبطة بموعد غير مصنف أو متعارض
            SELECT
                pb.id::TEXT AS id,
                'private_booking'::TEXT AS category,
                ('حجز خاص: ' || pb.student_name) AS title,
                COALESCE(rps.specialization_label, '') AS subtitle,
                'حجز خاص مرتبط بموعد يفتقر إلى معرف التخصص المرجعي الصحيح أو متعارض'::TEXT AS reason,
                pb.created_at,
                pb.id::TEXT AS entity_id
            FROM public.tutor_private_bookings pb
            LEFT JOIN resolved_private_slots rps ON rps.id = pb.slot_id
            WHERE rps.id IS NULL
               OR rps.tutor_id <> pb.tutor_id
               OR rps.res_status = 'unclassified'
            UNION ALL
            -- 4.7 اشتراكات مجموعات مرتبطة بمجموعة غير مصنفة أو متعارضة
            SELECT
                ge.id::TEXT AS id,
                'group_enrollment'::TEXT AS category,
                ('اشتراك مجموعة: ' || ge.student_name) AS title,
                COALESCE(rg.title, '') AS subtitle,
                'اشتراك مرتبط بمجموعة تفتقر إلى معرف التخصص المرجعي الصحيح أو متعارضة'::TEXT AS reason,
                ge.created_at,
                ge.id::TEXT AS entity_id
            FROM public.tutor_group_enrollments ge
            LEFT JOIN resolved_groups rg ON rg.id = ge.group_id
            WHERE rg.id IS NULL
               OR rg.tutor_id <> ge.tutor_id
               OR rg.res_status = 'unclassified'
        ),
        filtered_unclassified AS (
            SELECT *
            FROM unclassified_rows u
            WHERE (p_status_filter IS NULL OR p_status_filter = 'all' OR u.category = p_status_filter)
        )
        SELECT
            COUNT(*)::INTEGER,
            COALESCE((
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', fu.id,
                        'category', fu.category,
                        'title', fu.title,
                        'subtitle', fu.subtitle,
                        'reason', fu.reason,
                        'createdAt', fu.created_at,
                        'entityId', fu.entity_id
                    )
                )
                FROM (
                    SELECT * FROM filtered_unclassified
                    ORDER BY created_at DESC NULLS LAST
                    LIMIT v_page_size OFFSET v_offset
                ) fu
            ), '[]'::jsonb)
        INTO v_total_count, v_items
        FROM filtered_unclassified;

        RETURN jsonb_build_object(
            'entityType', 'unclassified',
            'totalCount', v_total_count,
            'page', v_page,
            'pageSize', v_page_size,
            'unclassifiedItems', v_items
        );
    END IF;

    RETURN jsonb_build_object(
        'entityType', p_entity_type,
        'totalCount', 0,
        'page', v_page,
        'pageSize', v_page_size
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_statistics_drilldown(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_statistics_drilldown(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER) TO authenticated, service_role;

COMMIT;
