-- ============================================================================
-- Migration 020: Standalone Admin Readiness Slot Rows RPC v1
-- ============================================================================
-- Fixes 42501 permission denied on direct SELECT from tutor_available_slots and
-- tutor_private_slots without weakening RLS, granting broad direct table SELECT,
-- modifying existing slot count signatures (42P13), or using DROP ... CASCADE.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_get_readiness_slot_rows_v1(
  p_tutor_ids TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_tutor_ids TEXT[];
  v_evaluated_at TIMESTAMPTZ := NOW();
  v_trial_slots JSONB := '[]'::jsonb;
  v_private_slots JSONB := '[]'::jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Admin access required';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT cleaned_id), ARRAY[]::TEXT[])
  INTO v_tutor_ids
  FROM (
    SELECT BTRIM(tid) AS cleaned_id
    FROM unnest(COALESCE(p_tutor_ids, ARRAY[]::TEXT[])) AS tid
    WHERE tid IS NOT NULL AND BTRIM(tid) <> ''
  ) s;

  IF COALESCE(array_length(v_tutor_ids, 1), 0) > 500 THEN
    RAISE EXCEPTION 'Too many tutor IDs requested (% > 500 max)', array_length(v_tutor_ids, 1);
  END IF;

  IF COALESCE(array_length(v_tutor_ids, 1), 0) = 0 THEN
    RETURN jsonb_build_object(
      'version', 1,
      'evaluated_at', v_evaluated_at,
      'trial_slots', '[]'::jsonb,
      'private_slots', '[]'::jsonb
    );
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', ts.id,
        'tutor_id', ts.tutor_id,
        'slot_date', ts.slot_date,
        'start_time', ts.start_time,
        'end_time', ts.end_time,
        'timezone', COALESCE(NULLIF(BTRIM(ts.timezone), ''), 'Africa/Cairo'),
        'is_available', COALESCE(ts.is_available, FALSE),
        'is_booked', COALESCE(ts.is_booked, FALSE),
        'admin_suspended', COALESCE(ts.admin_suspended, FALSE)
      )
      ORDER BY ts.slot_date ASC, ts.start_time ASC, ts.id ASC
    ),
    '[]'::jsonb
  )
  INTO v_trial_slots
  FROM public.tutor_available_slots ts
  WHERE ts.tutor_id = ANY(v_tutor_ids);

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', ps.id,
        'tutor_id', ps.tutor_id,
        'slot_date', ps.slot_date,
        'start_time', ps.start_time,
        'end_time', ps.end_time,
        'timezone', COALESCE(NULLIF(BTRIM(ps.timezone), ''), 'Africa/Cairo'),
        'is_available', COALESCE(ps.is_available, FALSE),
        'is_booked', COALESCE(ps.is_booked, FALSE),
        'admin_suspended', COALESCE(ps.admin_suspended, FALSE),
        'specialization_label', ps.specialization_label,
        'offering_course_option_id', ps.offering_course_option_id,
        'quran_age_group_id', ps.quran_age_group_id,
        'quran_level_id', ps.quran_level_id,
        'allowed_specializations', COALESCE(ps.allowed_specializations, '[]'::jsonb),
        'duration_minutes', ps.duration_minutes,
        'price_amount', ps.price_amount,
        'currency', ps.currency
      )
      ORDER BY ps.slot_date ASC, ps.start_time ASC, ps.id ASC
    ),
    '[]'::jsonb
  )
  INTO v_private_slots
  FROM public.tutor_private_slots ps
  WHERE ps.tutor_id = ANY(v_tutor_ids);

  RETURN jsonb_build_object(
    'version', 1,
    'evaluated_at', v_evaluated_at,
    'trial_slots', v_trial_slots,
    'private_slots', v_private_slots
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_readiness_slot_rows_v1(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_readiness_slot_rows_v1(TEXT[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
