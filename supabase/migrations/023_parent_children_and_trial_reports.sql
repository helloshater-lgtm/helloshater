-- =============================================================================
-- 023 — Parent dashboard: children, «الحصة لمين؟», and the tutor's report
--        after each trial session.
--
-- Builds on 022_direct_trial_booking.sql (direct_trial_bookings,
-- internal_direct_trial_json, get_current_tutor_id, acquire_tutor_lock).
--
-- Access model (same as 022): tables have RLS enabled and NO policies, so the
-- Data API cannot read or write them directly. Everything goes through the
-- SECURITY DEFINER functions below, which check auth.uid() / the linked tutor.
-- Safe to run more than once.
-- =============================================================================

-- 1. Children of a guardian ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.parent_children (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 60),
  grade_label TEXT CHECK (grade_label IS NULL OR char_length(grade_label) <= 80),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS parent_children_guardian_idx ON public.parent_children (guardian_user_id);
ALTER TABLE public.parent_children ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.parent_children FROM anon, authenticated;

-- 2. Which child a trial booking is for (optional) ------------------------------
ALTER TABLE public.direct_trial_bookings
  ADD COLUMN IF NOT EXISTS child_id UUID REFERENCES public.parent_children(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS direct_trial_bookings_child_idx ON public.direct_trial_bookings (child_id);

-- 3. Tutor's report after a trial session --------------------------------------
CREATE TABLE IF NOT EXISTS public.direct_trial_reports (
  booking_id UUID PRIMARY KEY REFERENCES public.direct_trial_bookings(id) ON DELETE CASCADE,
  tutor_id TEXT NOT NULL,
  attended BOOLEAN NOT NULL,
  level_summary TEXT CHECK (level_summary IS NULL OR char_length(level_summary) <= 1000),
  covered TEXT CHECK (covered IS NULL OR char_length(covered) <= 1000),
  recommendation TEXT CHECK (recommendation IS NULL OR char_length(recommendation) <= 1000),
  homework TEXT CHECK (homework IS NULL OR char_length(homework) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS direct_trial_reports_tutor_idx ON public.direct_trial_reports (tutor_id);
ALTER TABLE public.direct_trial_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.direct_trial_reports FROM anon, authenticated;

-- Helpers -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.internal_parent_child_json(p_child public.parent_children)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', p_child.id, 'name', p_child.name,
    'gradeLabel', p_child.grade_label, 'notes', p_child.notes,
    'createdAt', p_child.created_at
  );
$$;

CREATE OR REPLACE FUNCTION public.internal_trial_report_json(p_report public.direct_trial_reports)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN p_report.booking_id IS NULL THEN NULL ELSE jsonb_build_object(
    'bookingId', p_report.booking_id, 'attended', p_report.attended,
    'levelSummary', p_report.level_summary, 'covered', p_report.covered,
    'recommendation', p_report.recommendation, 'homework', p_report.homework,
    'updatedAt', p_report.updated_at
  ) END;
$$;

CREATE OR REPLACE FUNCTION public.internal_clean_text(p_value TEXT, p_max INT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(left(btrim(COALESCE(p_value, '')), p_max), '');
$$;

-- 4. Guardian: add or edit a child ---------------------------------------------
CREATE OR REPLACE FUNCTION public.parent_upsert_child(
  p_child_id UUID,
  p_name TEXT,
  p_grade_label TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_name TEXT := btrim(COALESCE(p_name, ''));
  v_child public.parent_children%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'PARENT_AUTH_REQUIRED'; END IF;
  IF char_length(v_name) < 2 OR char_length(v_name) > 60 THEN RAISE EXCEPTION 'CHILD_NAME_INVALID'; END IF;

  IF p_child_id IS NULL THEN
    IF (SELECT count(*) FROM public.parent_children WHERE guardian_user_id = v_uid) >= 10 THEN
      RAISE EXCEPTION 'CHILD_LIMIT_REACHED';
    END IF;
    INSERT INTO public.parent_children (guardian_user_id, name, grade_label, notes)
    VALUES (v_uid, v_name, public.internal_clean_text(p_grade_label, 80), public.internal_clean_text(p_notes, 500))
    RETURNING * INTO v_child;
  ELSE
    UPDATE public.parent_children
       SET name = v_name,
           grade_label = public.internal_clean_text(p_grade_label, 80),
           notes = public.internal_clean_text(p_notes, 500),
           updated_at = NOW()
     WHERE id = p_child_id AND guardian_user_id = v_uid
    RETURNING * INTO v_child;
    IF NOT FOUND THEN RAISE EXCEPTION 'CHILD_NOT_FOUND'; END IF;
  END IF;

  RETURN public.internal_parent_child_json(v_child);
END;
$$;

-- 5. Guardian: delete a child (bookings keep existing, child_id becomes NULL) ----
CREATE OR REPLACE FUNCTION public.parent_delete_child(p_child_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'PARENT_AUTH_REQUIRED'; END IF;
  DELETE FROM public.parent_children WHERE id = p_child_id AND guardian_user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'CHILD_NOT_FOUND'; END IF;
  RETURN jsonb_build_object('success', TRUE);
END;
$$;

-- 6. Guardian: «الحصة لمين؟» — link a booking to one of their children ----------
CREATE OR REPLACE FUNCTION public.parent_set_trial_child(p_booking_id UUID, p_child_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'PARENT_AUTH_REQUIRED'; END IF;
  IF p_child_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.parent_children WHERE id = p_child_id AND guardian_user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'CHILD_NOT_FOUND';
  END IF;
  UPDATE public.direct_trial_bookings
     SET child_id = p_child_id, updated_at = NOW()
   WHERE id = p_booking_id AND guardian_user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRIAL_NOT_FOUND'; END IF;
  RETURN jsonb_build_object('success', TRUE);
END;
$$;

-- 7. Guardian dashboard: children + bookings (with child and tutor report) -------
CREATE OR REPLACE FUNCTION public.parent_get_my_dashboard()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'PARENT_AUTH_REQUIRED'; END IF;
  RETURN jsonb_build_object(
    'children', (
      SELECT COALESCE(jsonb_agg(public.internal_parent_child_json(c) ORDER BY c.created_at), '[]'::JSONB)
      FROM public.parent_children c WHERE c.guardian_user_id = v_uid
    ),
    'bookings', (
      SELECT COALESCE(jsonb_agg(
        public.internal_direct_trial_json(b)
        || jsonb_build_object(
             'childId', b.child_id,
             'childName', c.name,
             'report', CASE WHEN b.status = 'cancelled' THEN NULL ELSE public.internal_trial_report_json(r) END
           )
        ORDER BY b.starts_at DESC), '[]'::JSONB)
      FROM public.direct_trial_bookings b
      LEFT JOIN public.parent_children c ON c.id = b.child_id
      LEFT JOIN public.direct_trial_reports r ON r.booking_id = b.id
      WHERE b.guardian_user_id = v_uid
    )
  );
END;
$$;

-- 8. Tutor: child name/grade and reports for their own trial bookings -----------
CREATE OR REPLACE FUNCTION public.tutor_get_my_trial_extras()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE v_tutor_id TEXT := public.get_current_tutor_id();
BEGIN
  IF v_tutor_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.tutor_account_links
    WHERE tutor_id = v_tutor_id AND user_id = auth.uid() AND is_active IS TRUE) THEN
    RAISE EXCEPTION 'TRIAL_FORBIDDEN';
  END IF;
  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'bookingId', b.id,
      'childName', c.name,
      'childGrade', c.grade_label,
      'report', public.internal_trial_report_json(r)
    )), '[]'::JSONB)
    FROM public.direct_trial_bookings b
    LEFT JOIN public.parent_children c ON c.id = b.child_id
    LEFT JOIN public.direct_trial_reports r ON r.booking_id = b.id
    WHERE b.tutor_id = v_tutor_id
  );
END;
$$;

-- 9. Tutor: write / update the report after the session ended -------------------
--    Also marks a confirmed booking as completed (same rule as
--    tutor_mark_direct_trial_completed: only after ends_at).
CREATE OR REPLACE FUNCTION public.tutor_submit_trial_report(
  p_booking_id UUID,
  p_attended BOOLEAN,
  p_level_summary TEXT DEFAULT NULL,
  p_covered TEXT DEFAULT NULL,
  p_recommendation TEXT DEFAULT NULL,
  p_homework TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_tutor_id TEXT := public.get_current_tutor_id();
  v_booking public.direct_trial_bookings%ROWTYPE;
  v_report public.direct_trial_reports%ROWTYPE;
BEGIN
  IF v_tutor_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.tutor_account_links
    WHERE tutor_id = v_tutor_id AND user_id = auth.uid() AND is_active IS TRUE) THEN
    RAISE EXCEPTION 'TRIAL_FORBIDDEN';
  END IF;
  IF p_attended IS NULL THEN RAISE EXCEPTION 'REPORT_ATTENDANCE_REQUIRED'; END IF;

  PERFORM public.acquire_tutor_lock(v_tutor_id);
  SELECT * INTO v_booking FROM public.direct_trial_bookings
   WHERE id = p_booking_id AND tutor_id = v_tutor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRIAL_NOT_FOUND'; END IF;
  IF v_booking.status = 'cancelled' THEN RAISE EXCEPTION 'TRIAL_FORBIDDEN'; END IF;
  IF v_booking.ends_at > NOW() THEN RAISE EXCEPTION 'TRIAL_NOT_FINISHED'; END IF;

  INSERT INTO public.direct_trial_reports AS r
    (booking_id, tutor_id, attended, level_summary, covered, recommendation, homework)
  VALUES (
    p_booking_id, v_tutor_id, p_attended,
    public.internal_clean_text(p_level_summary, 1000),
    public.internal_clean_text(p_covered, 1000),
    public.internal_clean_text(p_recommendation, 1000),
    public.internal_clean_text(p_homework, 1000)
  )
  ON CONFLICT (booking_id) DO UPDATE SET
    attended = EXCLUDED.attended,
    level_summary = EXCLUDED.level_summary,
    covered = EXCLUDED.covered,
    recommendation = EXCLUDED.recommendation,
    homework = EXCLUDED.homework,
    updated_at = NOW()
  RETURNING * INTO v_report;

  IF v_booking.status = 'confirmed' THEN
    UPDATE public.direct_trial_bookings
       SET status = 'completed', completed_at = NOW(), updated_at = NOW()
     WHERE id = p_booking_id;
  END IF;

  RETURN jsonb_build_object('success', TRUE, 'report', public.internal_trial_report_json(v_report));
END;
$$;

-- Permissions: signed-in users only (each function checks ownership itself) ------
REVOKE ALL ON FUNCTION public.internal_parent_child_json(public.parent_children) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.internal_trial_report_json(public.direct_trial_reports) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.internal_clean_text(TEXT, INT) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.parent_upsert_child(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.parent_delete_child(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.parent_set_trial_child(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.parent_get_my_dashboard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tutor_get_my_trial_extras() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tutor_submit_trial_report(UUID, BOOLEAN, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.parent_upsert_child(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.parent_delete_child(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.parent_set_trial_child(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.parent_get_my_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tutor_get_my_trial_extras() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tutor_submit_trial_report(UUID, BOOLEAN, TEXT, TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
