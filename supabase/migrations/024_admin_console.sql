-- =============================================================================
-- 024 — Admin console: team roles, activity log, parents (CRM), «النهارده»
--        overview, unified search, quality and funnel reports.
--
-- Builds on 004 (admin_users, is_admin), 022 (direct_trial_bookings) and
-- 023 (parent_children, direct_trial_reports).
--
-- Roles:
--   super_admin  everything + team management + activity log
--   admin        everything except team management
--   support      NEW: read-only staff (النهارده، أولياء الأمور + ملاحظات، الجودة)
--                is_admin() is now FALSE for support, so every existing admin
--                policy / RPC keeps refusing support users (no write access).
--
-- Access model: new tables have RLS enabled and NO policies; everything goes
-- through the SECURITY DEFINER functions below. Safe to run more than once.
-- =============================================================================

-- 1. Roles ----------------------------------------------------------------------
ALTER TABLE public.admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
ALTER TABLE public.admin_users
  ADD CONSTRAINT admin_users_role_check CHECK (role IN ('super_admin', 'admin', 'support'));

-- Full admin (used by all existing policies and admin_* RPCs): support excluded.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid() AND is_active = TRUE AND role IN ('super_admin', 'admin')
  );
$$;

-- Any active staff member (admin or support).
CREATE OR REPLACE FUNCTION public.is_admin_staff()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND is_active = TRUE);
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND is_active = TRUE AND role = 'super_admin'
  );
$$;

-- 2. Activity log ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id UUID,
  actor_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  tutor_id TEXT,
  summary TEXT,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_entity_idx ON public.admin_audit_log (entity_type, created_at DESC);
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_audit_log FROM anon, authenticated;

-- Row trigger: records changes made by staff only (tutors / parents are not logged).
-- Stores which columns changed, and old → new values only for safe status columns
-- (never phone numbers, IDs, notes or payout details).
CREATE OR REPLACE FUNCTION public.internal_audit_row_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_old JSONB;
  v_new JSONB;
  v_row JSONB;
  v_changed TEXT[];
  v_details JSONB := '{}'::JSONB;
  v_safe TEXT[] := ARRAY['status', 'is_published', 'role', 'is_active', 'admin_suspended',
                         'review_status', 'avatar_quality_approved', 'price_quality_approved', 'attended'];
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  SELECT email INTO v_email FROM public.admin_users WHERE user_id = v_uid AND is_active = TRUE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;
  v_row := COALESCE(v_new, v_old);

  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(k ORDER BY k) INTO v_changed
      FROM jsonb_object_keys(v_new) AS k
     WHERE k NOT IN ('updated_at') AND (v_new -> k) IS DISTINCT FROM (v_old -> k);
    IF v_changed IS NULL THEN RETURN NULL; END IF;
    v_details := jsonb_build_object(
      'changed', to_jsonb(v_changed),
      'values', COALESCE((
        SELECT jsonb_object_agg(k, jsonb_build_object('from', v_old -> k, 'to', v_new -> k))
          FROM unnest(v_changed) AS k WHERE k = ANY (v_safe)
      ), '{}'::JSONB)
    );
  ELSE
    v_details := jsonb_build_object(
      'values', COALESCE((
        SELECT jsonb_object_agg(k, v_row -> k) FROM unnest(v_safe) AS k WHERE v_row ? k
      ), '{}'::JSONB)
    );
  END IF;

  INSERT INTO public.admin_audit_log (actor_user_id, actor_email, action, entity_type, entity_id, tutor_id, details)
  VALUES (
    v_uid, v_email, lower(TG_OP), TG_TABLE_NAME,
    COALESCE(v_row ->> 'id', v_row ->> 'booking_id', v_row ->> 'user_id', v_row ->> 'tutor_id', v_row ->> 'email'),
    CASE WHEN TG_TABLE_NAME = 'tutors' THEN v_row ->> 'id' ELSE v_row ->> 'tutor_id' END,
    v_details
  );
  RETURN NULL;
END;
$$;

-- Client-side events (CSV export, sign-in) — staff only.
CREATE OR REPLACE FUNCTION public.admin_log_event(p_action TEXT, p_summary TEXT DEFAULT NULL, p_details JSONB DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin_staff() THEN RAISE EXCEPTION 'ADMIN_FORBIDDEN'; END IF;
  IF p_action IS NULL OR p_action !~ '^[a-z_]{2,40}$' THEN RAISE EXCEPTION 'ADMIN_INVALID_INPUT'; END IF;
  INSERT INTO public.admin_audit_log (actor_user_id, actor_email, action, entity_type, summary, details)
  SELECT auth.uid(), a.email, p_action, 'console', left(p_summary, 300),
         CASE WHEN p_details IS NULL OR length(p_details::TEXT) > 2000 THEN '{}'::JSONB ELSE p_details END
    FROM public.admin_users a WHERE a.user_id = auth.uid();
  RETURN jsonb_build_object('success', TRUE);
END;
$$;

-- 3. Team invites (staff members who have never signed in yet) --------------------
CREATE TABLE IF NOT EXISTS public.admin_team_invites (
  email TEXT PRIMARY KEY CHECK (email = lower(email) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'support')),
  invited_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.admin_team_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_team_invites FROM anon, authenticated;

-- 4. Internal notes on a guardian (CRM) -------------------------------------------
CREATE TABLE IF NOT EXISTS public.parent_admin_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_user_id UUID,
  author_email TEXT,
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS parent_admin_notes_guardian_idx ON public.parent_admin_notes (guardian_user_id, created_at DESC);
ALTER TABLE public.parent_admin_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.parent_admin_notes FROM anon, authenticated;

-- Attach the activity-log trigger to the tables staff manage.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tutors', 'tutor_private_info', 'tutor_applications', 'tutor_profile_drafts', 'tutor_quality_reviews',
    'tutor_reviews', 'tutor_groups', 'tutor_private_bookings', 'tutor_group_enrollments', 'parent_leads',
    'direct_trial_bookings', 'direct_trial_booking_policy', 'direct_trial_reports', 'tutor_account_links',
    'admin_users', 'admin_team_invites', 'parent_admin_notes'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_admin_audit ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER trg_admin_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I '
        'FOR EACH ROW EXECUTE FUNCTION public.internal_audit_row_change()', t);
    END IF;
  END LOOP;
END;
$$;

-- Helper: digits only (for phone search).
CREATE OR REPLACE FUNCTION public.internal_digits(p TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$ SELECT regexp_replace(COALESCE(p, ''), '\D', '', 'g'); $$;

-- 5. «النهارده» overview ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_console_overview()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_day_start TIMESTAMPTZ := (date_trunc('day', NOW() AT TIME ZONE 'Africa/Cairo')) AT TIME ZONE 'Africa/Cairo';
  v_reports INT;
  v_attended INT;
BEGIN
  IF NOT public.is_admin_staff() THEN RAISE EXCEPTION 'ADMIN_FORBIDDEN'; END IF;

  SELECT count(*), count(*) FILTER (WHERE r.attended)
    INTO v_reports, v_attended
    FROM public.direct_trial_reports r
   WHERE r.created_at >= NOW() - INTERVAL '30 days';

  RETURN jsonb_build_object(
    'role', (SELECT role FROM public.admin_users WHERE user_id = auth.uid()),
    'todo', jsonb_build_object(
      'missingLinks', (SELECT count(*) FROM public.direct_trial_bookings b
                        WHERE b.status = 'confirmed' AND COALESCE(btrim(b.meeting_url), '') = '' AND b.ends_at > NOW()),
      'missingReports', (SELECT count(*) FROM public.direct_trial_bookings b
                          WHERE b.status IN ('confirmed', 'completed') AND b.ends_at < NOW()
                            AND b.ends_at > NOW() - INTERVAL '30 days'
                            AND NOT EXISTS (SELECT 1 FROM public.direct_trial_reports r WHERE r.booking_id = b.id)),
      'pendingApplications', (SELECT count(*) FROM public.tutor_applications
                               WHERE status IN ('submitted', 'pending_review', 'interview_scheduled')),
      'pendingDrafts', (SELECT count(*) FROM public.tutor_profile_drafts WHERE status = 'pending_review'),
      'newLeads', (SELECT count(*) FROM public.parent_leads WHERE status = 'new'),
      'pendingReviews', (SELECT count(*) FROM public.tutor_reviews WHERE status = 'pending_review'),
      'pendingGroups', (SELECT count(*) FROM public.tutor_groups WHERE review_status = 'pending_review')
    ),
    'sessions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', b.id, 'startsAt', b.starts_at, 'endsAt', b.ends_at,
        'tutorId', b.tutor_id, 'tutorName', t.name,
        'guardianUserId', b.guardian_user_id, 'guardianName', b.guardian_name,
        'guardianWhatsapp', b.guardian_whatsapp, 'childName', c.name,
        'hasLink', COALESCE(btrim(b.meeting_url), '') <> ''
      ) ORDER BY b.starts_at), '[]'::JSONB)
      FROM public.direct_trial_bookings b
      LEFT JOIN public.tutors t ON t.id = b.tutor_id
      LEFT JOIN public.parent_children c ON c.id = b.child_id
      WHERE b.status = 'confirmed' AND b.ends_at > NOW() - INTERVAL '1 hour'
        AND b.starts_at < v_day_start + INTERVAL '2 days'
    ),
    'kpis', jsonb_build_object(
      'newBookings7d', (SELECT count(*) FROM public.direct_trial_bookings WHERE created_at >= NOW() - INTERVAL '7 days'),
      'newBookingsPrev7d', (SELECT count(*) FROM public.direct_trial_bookings
                             WHERE created_at >= NOW() - INTERVAL '14 days' AND created_at < NOW() - INTERVAL '7 days'),
      'completed7d', (SELECT count(*) FROM public.direct_trial_bookings
                       WHERE status = 'completed' AND ends_at >= NOW() - INTERVAL '7 days'),
      'newLeads7d', (SELECT count(*) FROM public.parent_leads WHERE created_at >= NOW() - INTERVAL '7 days'),
      'newParents7d', (SELECT count(*) FROM (
                         SELECT guardian_user_id FROM public.direct_trial_bookings
                          GROUP BY guardian_user_id HAVING min(created_at) >= NOW() - INTERVAL '7 days') x),
      'publishedTutors', (SELECT count(*) FROM public.tutors WHERE is_published IS TRUE),
      'reports30d', v_reports,
      'attendanceRate30d', CASE WHEN v_reports > 0 THEN round(100.0 * v_attended / v_reports) ELSE NULL END
    )
  );
END;
$$;

-- 6. Unified search ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_console_search(p_query TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_q TEXT := lower(btrim(COALESCE(p_query, '')));
  v_d TEXT := public.internal_digits(p_query);
BEGIN
  IF NOT public.is_admin_staff() THEN RAISE EXCEPTION 'ADMIN_FORBIDDEN'; END IF;
  IF char_length(v_q) < 2 THEN
    RETURN jsonb_build_object('tutors', '[]'::JSONB, 'parents', '[]'::JSONB, 'leads', '[]'::JSONB, 'applications', '[]'::JSONB);
  END IF;
  IF char_length(v_d) < 4 THEN v_d := NULL; END IF;

  RETURN jsonb_build_object(
    'tutors', (
      SELECT COALESCE(jsonb_agg(x), '[]'::JSONB) FROM (
        SELECT jsonb_build_object('id', t.id, 'name', t.name, 'isPublished', t.is_published) AS x
          FROM public.tutors t LEFT JOIN public.tutor_private_info pi ON pi.tutor_id = t.id
         WHERE position(v_q IN lower(COALESCE(t.name, ''))) > 0
            OR position(v_q IN lower(t.id)) > 0
            OR position(v_q IN lower(COALESCE(pi.email, ''))) > 0
            OR (v_d IS NOT NULL AND position(v_d IN public.internal_digits(COALESCE(pi.phone_number, '') || ' ' || COALESCE(pi.whatsapp_number, ''))) > 0)
         ORDER BY t.is_published DESC, t.name LIMIT 6) s
    ),
    'parents', (
      SELECT COALESCE(jsonb_agg(x), '[]'::JSONB) FROM (
        SELECT jsonb_build_object('userId', g.uid, 'name', lb.guardian_name, 'email', u.email, 'whatsapp', lb.guardian_whatsapp) AS x
          FROM (SELECT guardian_user_id AS uid FROM public.direct_trial_bookings
                UNION SELECT guardian_user_id FROM public.parent_children) g
          JOIN auth.users u ON u.id = g.uid
          LEFT JOIN LATERAL (SELECT b.guardian_name, b.guardian_whatsapp FROM public.direct_trial_bookings b
                              WHERE b.guardian_user_id = g.uid ORDER BY b.created_at DESC LIMIT 1) lb ON TRUE
         WHERE position(v_q IN lower(COALESCE(lb.guardian_name, ''))) > 0
            OR position(v_q IN lower(COALESCE(u.email, ''))) > 0
            OR (v_d IS NOT NULL AND position(v_d IN public.internal_digits(lb.guardian_whatsapp)) > 0)
            OR EXISTS (SELECT 1 FROM public.parent_children c WHERE c.guardian_user_id = g.uid AND position(v_q IN lower(c.name)) > 0)
         LIMIT 6) s
    ),
    'leads', (
      SELECT COALESCE(jsonb_agg(x), '[]'::JSONB) FROM (
        SELECT jsonb_build_object('id', l.id, 'referenceCode', l.reference_code, 'name', l.guardian_name,
                                  'status', l.status, 'createdAt', l.created_at) AS x
          FROM public.parent_leads l
         WHERE position(v_q IN lower(COALESCE(l.guardian_name, ''))) > 0
            OR position(v_q IN lower(COALESCE(l.reference_code, ''))) > 0
            OR (v_d IS NOT NULL AND position(v_d IN public.internal_digits(COALESCE(l.country_code, '') || COALESCE(l.phone, ''))) > 0)
         ORDER BY l.created_at DESC LIMIT 6) s
    ),
    'applications', (
      SELECT COALESCE(jsonb_agg(x), '[]'::JSONB) FROM (
        SELECT jsonb_build_object('id', a.id, 'referenceCode', a.reference_code, 'name', a.full_name,
                                  'status', a.status, 'createdAt', a.created_at) AS x
          FROM public.tutor_applications a
         WHERE a.status <> 'draft' AND (
               position(v_q IN lower(COALESCE(a.full_name, ''))) > 0
            OR position(v_q IN lower(COALESCE(a.reference_code, ''))) > 0
            OR position(v_q IN lower(COALESCE(a.email, ''))) > 0
            OR (v_d IS NOT NULL AND position(v_d IN public.internal_digits(COALESCE(a.phone, '') || ' ' || COALESCE(a.whatsapp_number, ''))) > 0))
         ORDER BY a.created_at DESC LIMIT 6) s
    )
  );
END;
$$;

-- 7. Parents (CRM) -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_parents(p_search TEXT DEFAULT NULL, p_limit INT DEFAULT 50, p_offset INT DEFAULT 0)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_q TEXT := NULLIF(lower(btrim(COALESCE(p_search, ''))), '');
  v_d TEXT := public.internal_digits(p_search);
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);
  v_offset INT := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF NOT public.is_admin_staff() THEN RAISE EXCEPTION 'ADMIN_FORBIDDEN'; END IF;
  IF char_length(v_d) < 4 THEN v_d := NULL; END IF;

  RETURN (
    WITH g AS (
      SELECT guardian_user_id AS uid FROM public.direct_trial_bookings
      UNION SELECT guardian_user_id FROM public.parent_children
    ), p AS (
      SELECT g.uid, u.email, u.created_at AS joined_at, u.last_sign_in_at,
             lb.guardian_name, lb.guardian_whatsapp,
             (SELECT count(*) FROM public.parent_children c WHERE c.guardian_user_id = g.uid) AS children_count,
             (SELECT count(*) FROM public.direct_trial_bookings b WHERE b.guardian_user_id = g.uid) AS bookings_count,
             (SELECT count(*) FROM public.direct_trial_bookings b WHERE b.guardian_user_id = g.uid AND b.status = 'completed') AS completed_count,
             (SELECT max(b.starts_at) FROM public.direct_trial_bookings b
               WHERE b.guardian_user_id = g.uid AND b.status <> 'cancelled' AND b.starts_at <= NOW()) AS last_session_at,
             (SELECT min(b.starts_at) FROM public.direct_trial_bookings b
               WHERE b.guardian_user_id = g.uid AND b.status = 'confirmed' AND b.starts_at > NOW()) AS next_session_at
        FROM g JOIN auth.users u ON u.id = g.uid
        LEFT JOIN LATERAL (SELECT b.guardian_name, b.guardian_whatsapp FROM public.direct_trial_bookings b
                            WHERE b.guardian_user_id = g.uid ORDER BY b.created_at DESC LIMIT 1) lb ON TRUE
    ), f AS (
      SELECT * FROM p
       WHERE v_q IS NULL
          OR position(v_q IN lower(COALESCE(p.guardian_name, ''))) > 0
          OR position(v_q IN lower(COALESCE(p.email, ''))) > 0
          OR (v_d IS NOT NULL AND position(v_d IN public.internal_digits(p.guardian_whatsapp)) > 0)
          OR EXISTS (SELECT 1 FROM public.parent_children c WHERE c.guardian_user_id = p.uid AND position(v_q IN lower(c.name)) > 0)
    )
    SELECT jsonb_build_object(
      'total', (SELECT count(*) FROM f),
      'items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'userId', s.uid, 'email', s.email, 'name', s.guardian_name, 'whatsapp', s.guardian_whatsapp,
          'joinedAt', s.joined_at, 'lastSignInAt', s.last_sign_in_at,
          'childrenCount', s.children_count, 'bookingsCount', s.bookings_count, 'completedCount', s.completed_count,
          'lastSessionAt', s.last_session_at, 'nextSessionAt', s.next_session_at
        ) ORDER BY s.sort_key DESC)
        FROM (SELECT f.*, COALESCE(f.next_session_at, f.last_session_at, f.joined_at) AS sort_key
                FROM f ORDER BY COALESCE(f.next_session_at, f.last_session_at, f.joined_at) DESC
               LIMIT v_limit OFFSET v_offset) s
      ), '[]'::JSONB)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_parent(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user auth.users%ROWTYPE;
  v_name TEXT;
  v_whatsapp TEXT;
  v_tail TEXT;
BEGIN
  IF NOT public.is_admin_staff() THEN RAISE EXCEPTION 'ADMIN_FORBIDDEN'; END IF;
  SELECT * INTO v_user FROM auth.users WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PARENT_NOT_FOUND'; END IF;

  SELECT b.guardian_name, b.guardian_whatsapp INTO v_name, v_whatsapp
    FROM public.direct_trial_bookings b WHERE b.guardian_user_id = p_user_id
   ORDER BY b.created_at DESC LIMIT 1;
  v_tail := right(public.internal_digits(v_whatsapp), 9);
  IF char_length(v_tail) < 8 THEN v_tail := NULL; END IF;

  RETURN jsonb_build_object(
    'profile', jsonb_build_object(
      'userId', v_user.id, 'email', v_user.email, 'name', v_name, 'whatsapp', v_whatsapp,
      'joinedAt', v_user.created_at, 'lastSignInAt', v_user.last_sign_in_at
    ),
    'children', (
      SELECT COALESCE(jsonb_agg(public.internal_parent_child_json(c) ORDER BY c.created_at), '[]'::JSONB)
        FROM public.parent_children c WHERE c.guardian_user_id = p_user_id
    ),
    'bookings', (
      SELECT COALESCE(jsonb_agg(
        public.internal_direct_trial_json(b)
        || jsonb_build_object('childId', b.child_id, 'childName', c.name,
                              'guardianName', b.guardian_name, 'guardianWhatsapp', b.guardian_whatsapp,
                              'report', public.internal_trial_report_json(r))
        ORDER BY b.starts_at DESC), '[]'::JSONB)
      FROM public.direct_trial_bookings b
      LEFT JOIN public.parent_children c ON c.id = b.child_id
      LEFT JOIN public.direct_trial_reports r ON r.booking_id = b.id
      WHERE b.guardian_user_id = p_user_id
    ),
    'notes', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', n.id, 'body', n.body, 'authorEmail', n.author_email, 'createdAt', n.created_at,
        'canDelete', n.author_user_id = auth.uid() OR public.is_super_admin()
      ) ORDER BY n.created_at DESC), '[]'::JSONB)
      FROM public.parent_admin_notes n WHERE n.guardian_user_id = p_user_id
    ),
    'leads', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', l.id, 'referenceCode', l.reference_code, 'status', l.status, 'name', l.guardian_name,
        'utmSource', l.utm_source, 'createdAt', l.created_at
      ) ORDER BY l.created_at DESC), '[]'::JSONB)
      FROM public.parent_leads l
      WHERE v_tail IS NOT NULL AND right(public.internal_digits(l.phone), 9) = v_tail
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_add_parent_note(p_user_id UUID, p_body TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE v_body TEXT := btrim(COALESCE(p_body, ''));
BEGIN
  IF NOT public.is_admin_staff() THEN RAISE EXCEPTION 'ADMIN_FORBIDDEN'; END IF;
  IF char_length(v_body) < 1 OR char_length(v_body) > 2000 THEN RAISE EXCEPTION 'NOTE_INVALID'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN RAISE EXCEPTION 'PARENT_NOT_FOUND'; END IF;
  INSERT INTO public.parent_admin_notes (guardian_user_id, author_user_id, author_email, body)
  SELECT p_user_id, auth.uid(), a.email, v_body FROM public.admin_users a WHERE a.user_id = auth.uid();
  RETURN jsonb_build_object('success', TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_parent_note(p_note_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin_staff() THEN RAISE EXCEPTION 'ADMIN_FORBIDDEN'; END IF;
  DELETE FROM public.parent_admin_notes
   WHERE id = p_note_id AND (author_user_id = auth.uid() OR public.is_super_admin());
  IF NOT FOUND THEN RAISE EXCEPTION 'NOTE_NOT_FOUND'; END IF;
  RETURN jsonb_build_object('success', TRUE);
END;
$$;

-- 8. Quality per tutor -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_console_quality(p_days INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE v_since TIMESTAMPTZ := NOW() - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 30), 1), 365));
BEGIN
  IF NOT public.is_admin_staff() THEN RAISE EXCEPTION 'ADMIN_FORBIDDEN'; END IF;
  RETURN jsonb_build_object(
    'days', LEAST(GREATEST(COALESCE(p_days, 30), 1), 365),
    'publishedTutors', (SELECT count(*) FROM public.tutors WHERE is_published IS TRUE),
    'tutors', (
      SELECT COALESCE(jsonb_agg(row_json ORDER BY sort_a DESC, sort_b DESC), '[]'::JSONB) FROM (
        SELECT jsonb_build_object(
          'tutorId', t.id, 'tutorName', t.name, 'isPublished', t.is_published,
          'rating', t.rating, 'reviewsCount', t.reviews_count,
          'pendingReviews', (SELECT count(*) FROM public.tutor_reviews rv WHERE rv.tutor_id = t.id AND rv.status = 'pending_review'),
          'bookings', s.bookings, 'completed', s.completed, 'cancelled', s.cancelled,
          'reports', s.reports, 'missingReports', s.missing_reports, 'absences', s.absences,
          'upcomingMissingLink', s.upcoming_missing_link, 'lateLinks', s.late_links
        ) AS row_json,
        (s.missing_reports + s.upcoming_missing_link + s.late_links) AS sort_a,
        s.bookings AS sort_b
        FROM public.tutors t
        JOIN LATERAL (
          SELECT count(*) AS bookings,
                 count(*) FILTER (WHERE b.status = 'completed') AS completed,
                 count(*) FILTER (WHERE b.status = 'cancelled') AS cancelled,
                 count(r.booking_id) AS reports,
                 count(*) FILTER (WHERE b.status IN ('confirmed', 'completed') AND b.ends_at < NOW() AND r.booking_id IS NULL) AS missing_reports,
                 count(*) FILTER (WHERE r.attended IS FALSE) AS absences,
                 count(*) FILTER (WHERE b.status = 'confirmed' AND b.starts_at > NOW() AND b.starts_at < NOW() + INTERVAL '48 hours'
                                    AND COALESCE(btrim(b.meeting_url), '') = '') AS upcoming_missing_link,
                 count(*) FILTER (WHERE b.status <> 'cancelled' AND b.starts_at < NOW()
                                    AND (b.meeting_added_at IS NULL OR b.meeting_added_at > b.starts_at - INTERVAL '1 hour')) AS late_links
            FROM public.direct_trial_bookings b
            LEFT JOIN public.direct_trial_reports r ON r.booking_id = b.id
           WHERE b.tutor_id = t.id AND b.starts_at >= v_since
        ) s ON s.bookings > 0
      ) q
    ),
    'publishedWithoutBookings', (
      SELECT count(*) FROM public.tutors t
       WHERE t.is_published IS TRUE
         AND NOT EXISTS (SELECT 1 FROM public.direct_trial_bookings b WHERE b.tutor_id = t.id AND b.starts_at >= v_since)
    )
  );
END;
$$;

-- 9. Funnel ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_console_funnel(p_days INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_days INT := LEAST(GREATEST(COALESCE(p_days, 30), 1), 365);
  v_since TIMESTAMPTZ := NOW() - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 30), 1), 365));
BEGIN
  IF NOT public.is_admin_staff() THEN RAISE EXCEPTION 'ADMIN_FORBIDDEN'; END IF;
  RETURN jsonb_build_object(
    'days', v_days,
    'leads', (
      SELECT jsonb_build_object(
        'total', count(*),
        'contacted', count(*) FILTER (WHERE status IN ('contacted', 'trial', 'subscribed')),
        'trial', count(*) FILTER (WHERE status IN ('trial', 'subscribed')),
        'subscribed', count(*) FILTER (WHERE status = 'subscribed'),
        'lost', count(*) FILTER (WHERE status = 'lost'),
        'new', count(*) FILTER (WHERE status = 'new')
      ) FROM public.parent_leads WHERE created_at >= v_since
    ),
    'direct', (
      SELECT jsonb_build_object(
        'booked', count(*),
        'cancelled', count(*) FILTER (WHERE b.status = 'cancelled'),
        'held', count(*) FILTER (WHERE b.status <> 'cancelled' AND b.ends_at < NOW()),
        'attended', count(*) FILTER (WHERE r.attended IS TRUE),
        'reported', count(r.booking_id),
        'upcoming', count(*) FILTER (WHERE b.status = 'confirmed' AND b.starts_at > NOW())
      )
      FROM public.direct_trial_bookings b
      LEFT JOIN public.direct_trial_reports r ON r.booking_id = b.id
      WHERE b.created_at >= v_since
    ),
    'sources', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('source', src, 'total', total, 'subscribed', subscribed)
                                ORDER BY total DESC), '[]'::JSONB)
      FROM (
        SELECT COALESCE(NULLIF(lower(btrim(utm_source)), ''), 'direct') AS src,
               count(*) AS total, count(*) FILTER (WHERE status = 'subscribed') AS subscribed
          FROM public.parent_leads WHERE created_at >= v_since
         GROUP BY 1 ORDER BY 2 DESC LIMIT 8
      ) s
    ),
    'weeks', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('weekStart', w, 'leads', leads, 'bookings', bookings) ORDER BY w), '[]'::JSONB)
      FROM (
        SELECT w,
               (SELECT count(*) FROM public.parent_leads l WHERE l.created_at >= w AND l.created_at < w + INTERVAL '7 days') AS leads,
               (SELECT count(*) FROM public.direct_trial_bookings b WHERE b.created_at >= w AND b.created_at < w + INTERVAL '7 days') AS bookings
          FROM generate_series(date_trunc('week', NOW()) - INTERVAL '7 weeks', date_trunc('week', NOW()), INTERVAL '1 week') AS w
      ) x
    )
  );
END;
$$;

-- 10. Activity log reader (admin + super_admin) -------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_audit_log(
  p_limit INT DEFAULT 50,
  p_before_id BIGINT DEFAULT NULL,
  p_entity_type TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'ADMIN_FORBIDDEN'; END IF;
  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', l.id, 'actorEmail', l.actor_email, 'action', l.action, 'entityType', l.entity_type,
      'entityId', l.entity_id, 'tutorId', l.tutor_id, 'tutorName', t.name,
      'summary', l.summary, 'details', l.details, 'createdAt', l.created_at
    ) ORDER BY l.id DESC), '[]'::JSONB)
    FROM (
      SELECT * FROM public.admin_audit_log a
       WHERE (p_before_id IS NULL OR a.id < p_before_id)
         AND (p_entity_type IS NULL OR a.entity_type = p_entity_type)
       ORDER BY a.id DESC LIMIT v_limit
    ) l
    LEFT JOIN public.tutors t ON t.id = l.tutor_id
  );
END;
$$;

-- 11. Team management (super_admin only) ------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_team()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'ADMIN_FORBIDDEN'; END IF;
  RETURN jsonb_build_object(
    'members', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'userId', a.user_id, 'email', a.email, 'role', a.role, 'isActive', a.is_active,
        'createdAt', a.created_at, 'lastSignInAt', u.last_sign_in_at, 'isMe', a.user_id = auth.uid()
      ) ORDER BY a.is_active DESC, a.created_at), '[]'::JSONB)
      FROM public.admin_users a LEFT JOIN auth.users u ON u.id = a.user_id
    ),
    'invites', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('email', i.email, 'role', i.role, 'createdAt', i.created_at)
                                ORDER BY i.created_at DESC), '[]'::JSONB)
      FROM public.admin_team_invites i
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_invite_team_member(p_email TEXT, p_role TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_email TEXT := lower(btrim(COALESCE(p_email, '')));
  v_uid UUID;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'ADMIN_FORBIDDEN'; END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'TEAM_EMAIL_INVALID'; END IF;
  IF p_role IS NULL OR p_role NOT IN ('super_admin', 'admin', 'support') THEN RAISE EXCEPTION 'TEAM_ROLE_INVALID'; END IF;

  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = v_email LIMIT 1;
  IF v_uid IS NOT NULL THEN
    IF v_uid = auth.uid() THEN RAISE EXCEPTION 'TEAM_SELF_CHANGE'; END IF;
    INSERT INTO public.admin_users (user_id, email, role, is_active)
    VALUES (v_uid, v_email, p_role, TRUE)
    ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, is_active = TRUE, email = EXCLUDED.email;
    DELETE FROM public.admin_team_invites WHERE email = v_email;
    RETURN jsonb_build_object('status', 'added');
  END IF;

  INSERT INTO public.admin_team_invites (email, role, invited_by)
  VALUES (v_email, p_role, auth.uid())
  ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, invited_by = EXCLUDED.invited_by, created_at = NOW();
  RETURN jsonb_build_object('status', 'invited');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_team_member(p_user_id UUID, p_role TEXT, p_is_active BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'ADMIN_FORBIDDEN'; END IF;
  IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'TEAM_SELF_CHANGE'; END IF;
  IF p_role IS NULL OR p_role NOT IN ('super_admin', 'admin', 'support') THEN RAISE EXCEPTION 'TEAM_ROLE_INVALID'; END IF;
  UPDATE public.admin_users SET role = p_role, is_active = COALESCE(p_is_active, is_active)
   WHERE user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TEAM_MEMBER_NOT_FOUND'; END IF;
  RETURN jsonb_build_object('success', TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cancel_team_invite(p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'ADMIN_FORBIDDEN'; END IF;
  DELETE FROM public.admin_team_invites WHERE email = lower(btrim(COALESCE(p_email, '')));
  RETURN jsonb_build_object('success', TRUE);
END;
$$;

-- A signed-in user whose verified email has a pending invite becomes staff.
CREATE OR REPLACE FUNCTION public.admin_claim_team_invite()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_role TEXT;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('claimed', FALSE); END IF;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_uid AND email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN RETURN jsonb_build_object('claimed', FALSE); END IF;
  SELECT role INTO v_role FROM public.admin_team_invites WHERE email = v_email;
  IF v_role IS NULL THEN RETURN jsonb_build_object('claimed', FALSE); END IF;

  INSERT INTO public.admin_users (user_id, email, role, is_active)
  VALUES (v_uid, v_email, v_role, TRUE)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, is_active = TRUE, email = EXCLUDED.email;
  DELETE FROM public.admin_team_invites WHERE email = v_email;
  RETURN jsonb_build_object('claimed', TRUE, 'role', v_role);
END;
$$;

-- Permissions -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.internal_audit_row_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.internal_digits(TEXT) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin_staff() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_log_event(TEXT, TEXT, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_console_overview() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_console_search(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_parents(TEXT, INT, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_parent(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_add_parent_note(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_parent_note(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_console_quality(INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_console_funnel(INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_audit_log(INT, BIGINT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_team() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_invite_team_member(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_team_member(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_cancel_team_invite(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_claim_team_invite() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_log_event(TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_console_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_console_search(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_parents(TEXT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_parent(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_parent_note(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_parent_note(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_console_quality(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_console_funnel(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_audit_log(INT, BIGINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_team() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_invite_team_member(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_team_member(UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_team_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_claim_team_invite() TO authenticated;

NOTIFY pgrst, 'reload schema';
