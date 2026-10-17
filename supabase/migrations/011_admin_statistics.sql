-- ==============================================================================
-- Shatir Classes (شاطر كلاسيز) - Supabase Migration 011
-- File: supabase/migrations/011_admin_statistics.sql
-- Description:
--   دعم نظام الإحصائيات التفصيلية للمشرفين (Admin Platform Statistics):
--   1. دالة إدارية آمنة (admin_get_classes_specialization_metadata) لجلب كافة
--      المعرفات المرجعية لتخصصات المواعيد الخاصة والمجموعات التعليمية
--      (offering_course_option_id, quran_age_group_id, quran_level_id)
--      وملخص المواعيد التجريبية، مع التحقق الصارم من صلاحية المشرف public.is_admin().
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. دالة جلب البيانات المرجعية لتخصصات الحصص الخاصة والمجموعات للإحصائيات الإدارية
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

COMMIT;
