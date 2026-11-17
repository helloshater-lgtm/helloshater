import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import {
  evaluateTutorProfileReadiness,
  assertTutorReadyForInitialPublish,
  buildTutorProfileCompletionWhatsAppDraft,
  fetchAdminReadinessSlotRows,
  parseAdminReadinessSlotRowsResponse,
  READINESS_SLOT_ROWS_RPC_BATCH_SIZE,
  TutorInitialQualityReviewRecord,
} from '../src/utils/tutorReadinessAndContact';
import {
  AdminService,
  __setAdminServiceSupabaseForTests,
} from '../src/services/adminService';
import { AdminTutorSavePayload } from '../src/types';

// ============================================================================
// PART A: Real PostgreSQL (PGlite) Verification of Migrations 020 & 021
// ============================================================================
async function runPostgresMigrationTests() {
  const db = new PGlite();

  try {
    // Minimal Supabase auth & role stubs + pre-existing schema matching 001/002/004/009/010/013
    await db.exec(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role;
        END IF;
      END $$;

      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS public._test_auth_ctx (
        id INTEGER PRIMARY KEY,
        current_uid UUID,
        admin_flag BOOLEAN NOT NULL DEFAULT FALSE
      );
      INSERT INTO public._test_auth_ctx (id, current_uid, admin_flag)
      VALUES (1, '11111111-1111-1111-1111-111111111111', FALSE)
      ON CONFLICT (id) DO NOTHING;

      CREATE OR REPLACE FUNCTION auth.uid()
      RETURNS UUID
      LANGUAGE sql
      STABLE
      AS $$
        SELECT current_uid FROM public._test_auth_ctx WHERE id = 1;
      $$;

      CREATE OR REPLACE FUNCTION public.is_admin()
      RETURNS BOOLEAN
      LANGUAGE sql
      STABLE
      AS $$
        SELECT admin_flag FROM public._test_auth_ctx WHERE id = 1;
      $$;

      -- Pre-existing RPC whose signature MUST NOT be broken (migration 020/021 leave it untouched)
      CREATE OR REPLACE FUNCTION public.admin_get_tutors_slot_counts()
      RETURNS TABLE (tutor_id TEXT, trial_count BIGINT)
      LANGUAGE sql
      STABLE
      AS $$
        SELECT 'legacy'::TEXT, 0::BIGINT;
      $$;

      CREATE TABLE public.tutors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        avatar_url TEXT,
        hourly_rate_min INTEGER,
        hourly_rate_max INTEGER,
        currency TEXT DEFAULT 'ج.م',
        session_duration_minutes INTEGER DEFAULT 50,
        is_published BOOLEAN NOT NULL DEFAULT FALSE
      );

      CREATE TABLE public.tutor_available_slots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tutor_id TEXT NOT NULL REFERENCES public.tutors(id) ON DELETE CASCADE,
        slot_date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        timezone TEXT DEFAULT 'Africa/Cairo',
        is_available BOOLEAN NOT NULL DEFAULT TRUE,
        is_booked BOOLEAN NOT NULL DEFAULT FALSE,
        admin_suspended BOOLEAN NOT NULL DEFAULT FALSE,
        booked_at TIMESTAMPTZ,
        notes TEXT
      );

      CREATE TABLE public.tutor_private_slots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tutor_id TEXT NOT NULL REFERENCES public.tutors(id) ON DELETE CASCADE,
        slot_date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        timezone TEXT DEFAULT 'Africa/Cairo',
        duration_minutes INTEGER NOT NULL,
        price_amount INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'ج.م',
        is_available BOOLEAN NOT NULL DEFAULT TRUE,
        is_booked BOOLEAN NOT NULL DEFAULT FALSE,
        admin_suspended BOOLEAN NOT NULL DEFAULT FALSE,
        admin_suspension_notes TEXT,
        specialization_label TEXT,
        offering_course_option_id UUID,
        quran_age_group_id TEXT,
        quran_level_id TEXT,
        allowed_specializations JSONB DEFAULT '[]'::jsonb,
        booked_at TIMESTAMPTZ,
        notes TEXT
      );

      INSERT INTO public.tutors (id, name, avatar_url, hourly_rate_min, hourly_rate_max, currency, session_duration_minutes, is_published)
      VALUES
        ('tutor-pub', 'معلم منشور', 'https://cdn.example.com/pub.jpg', 150, 150, 'ج.م', 50, TRUE),
        ('tutor-unpub', 'معلم غير منشور', 'https://cdn.example.com/unpub.jpg', 6, 6, '$', 50, FALSE);

      INSERT INTO public.tutor_available_slots (id, tutor_id, slot_date, start_time, end_time, timezone, is_available, is_booked, admin_suspended, booked_at, notes)
      VALUES
        ('aaaaaaaa-0000-0000-0000-000000000001', 'tutor-unpub', '2099-05-10', '16:00', '16:20', 'Africa/Cairo', TRUE, FALSE, FALSE, NULL, 'SECRET_TRIAL_NOTE'),
        ('aaaaaaaa-0000-0000-0000-000000000002', 'tutor-unpub', '2020-01-01', '10:00', '10:20', 'Africa/Cairo', TRUE, FALSE, TRUE, NOW(), 'SUSPENDED_PAST_NOTE');

      INSERT INTO public.tutor_private_slots (id, tutor_id, slot_date, start_time, end_time, timezone, duration_minutes, price_amount, currency, is_available, is_booked, admin_suspended, admin_suspension_notes, specialization_label, booked_at, notes)
      VALUES
        ('bbbbbbbb-0000-0000-0000-000000000001', 'tutor-unpub', '2099-05-11', '18:00', '18:50', 'Africa/Cairo', 50, 6, '$', TRUE, FALSE, FALSE, 'SECRET_SUSP', 'رياضيات - الصف الرابع', NOW(), 'SECRET_PRIVATE_NOTE'),
        ('bbbbbbbb-0000-0000-0000-000000000002', 'tutor-pub', '2099-05-12', '19:00', '19:50', 'Africa/Cairo', 50, 0, 'ج.م', TRUE, FALSE, FALSE, NULL, 'حصة مجانية', NULL, NULL);
    `);

    const sql020 = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/migrations/020_admin_readiness_slot_rows_v1.sql'),
      'utf8'
    );
    const sql021 = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/migrations/021_admin_quality_review_and_private_slot_rpc.sql'),
      'utf8'
    );

    await db.exec(sql020);
    await db.exec(sql021);

    // 1. Legacy admin_get_tutors_slot_counts remains untouched
    const legacyRes = await db.query<{ tutor_id: string; trial_count: string }>(
      `SELECT * FROM public.admin_get_tutors_slot_counts();`
    );
    assert.equal(legacyRes.rows[0].tutor_id, 'legacy');

    // 2. Non-admin access MUST fail cleanly on all admin RPCs
    await db.exec(`UPDATE public._test_auth_ctx SET admin_flag = FALSE WHERE id = 1;`);
    await assert.rejects(
      () => db.query(`SELECT public.admin_get_readiness_slot_rows_v1(ARRAY['tutor-unpub']);`),
      /Unauthorized: Admin access required/
    );
    await assert.rejects(
      () =>
        db.query(
          `SELECT public.admin_save_tutor_quality_review('tutor-unpub', TRUE, 'https://cdn.example.com/unpub.jpg', TRUE, 6, '$', 50, NULL);`
        ),
      /Unauthorized: Admin access required/
    );
    await assert.rejects(
      () =>
        db.query(
          `SELECT public.admin_add_private_slot('tutor-unpub', '2099-06-01'::date, '15:00'::time, '15:50'::time, 50, 6, '$');`
        ),
      /Unauthorized: Admin access required/
    );

    // 3. Switch to admin
    await db.exec(`UPDATE public._test_auth_ctx SET admin_flag = TRUE WHERE id = 1;`);

    // 4. Max 500 IDs guardrail check
    const tooManyIds = Array.from({ length: 501 }, (_, i) => `t-${i}`);
    await assert.rejects(
      () =>
        db.query(`SELECT public.admin_get_readiness_slot_rows_v1($1::text[]);`, [
          tooManyIds,
        ]),
      /Too many tutor IDs requested \(501 > 500 max\)/
    );

    // 5. Empty array returns valid v1 contract
    const emptyRes = await db.query<{ res: any }>(
      `SELECT public.admin_get_readiness_slot_rows_v1(ARRAY['', '   ']) AS res;`
    );
    const parsedEmpty = parseAdminReadinessSlotRowsResponse(emptyRes.rows[0].res);
    assert.equal(parsedEmpty.version, 1);
    assert.equal(parsedEmpty.trialSlots.length, 0);
    assert.equal(parsedEmpty.privateSlots.length, 0);

    // 6. Fetches unpublished + published tutors, deduplicates IDs, preserves $6, and excludes sensitive notes/booked_at
    const adminSlotsRes = await db.query<{ res: any }>(
      `SELECT public.admin_get_readiness_slot_rows_v1(ARRAY['tutor-unpub', 'tutor-unpub', 'tutor-pub']) AS res;`
    );
    const rawPayload = adminSlotsRes.rows[0].res;
    assert.equal(rawPayload.version, 1);
    assert.equal(rawPayload.trial_slots.length, 2);
    assert.equal(rawPayload.private_slots.length, 2);

    for (const row of [...rawPayload.trial_slots, ...rawPayload.private_slots]) {
      assert.equal('notes' in row, false, 'notes column must NOT be exposed by admin_get_readiness_slot_rows_v1');
      assert.equal('booked_at' in row, false, 'booked_at must NOT be exposed by admin_get_readiness_slot_rows_v1');
      assert.equal('admin_suspension_notes' in row, false, 'admin_suspension_notes must NOT be exposed');
    }

    const parsedAdminSlots = parseAdminReadinessSlotRowsResponse(rawPayload);
    const unpubTrial = parsedAdminSlots.trialSlots.find(
      (s) => s.id === 'aaaaaaaa-0000-0000-0000-000000000001'
    );
    const unpubPrivate = parsedAdminSlots.privateSlots.find(
      (s) => s.id === 'bbbbbbbb-0000-0000-0000-000000000001'
    );
    assert.ok(unpubTrial);
    assert.ok(unpubPrivate);
    assert.equal(unpubPrivate.priceAmount, 6);
    assert.equal(unpubPrivate.currency, '$');

    // 7. Verify 021 backfill + exact integer $6 quality review save + admin_add_private_slot
    const qrBackfill = await db.query<{
      tutor_id: string;
      approved_price_amount: number;
    }>(`SELECT tutor_id, approved_price_amount FROM public.tutor_quality_reviews ORDER BY tutor_id;`);
    assert.equal(qrBackfill.rows.length, 1);
    assert.equal(qrBackfill.rows[0].tutor_id, 'tutor-pub');
    assert.equal(qrBackfill.rows[0].approved_price_amount, 150);

    await db.query(
      `SELECT public.admin_save_tutor_quality_review('tutor-unpub', TRUE, 'https://cdn.example.com/unpub.jpg', TRUE, 6, '$', 50, 'تأكيد السعر 6 دولار');`
    );
    const unpubQr = await db.query<{
      approved_price_amount: number;
      approved_currency: string;
      avatar_quality_approved: boolean;
      price_quality_approved: boolean;
    }>(
      `SELECT approved_price_amount, approved_currency, avatar_quality_approved, price_quality_approved FROM public.tutor_quality_reviews WHERE tutor_id = 'tutor-unpub';`
    );
    assert.equal(unpubQr.rows[0].approved_price_amount, 6);
    assert.equal(unpubQr.rows[0].approved_currency, '$');
    assert.equal(unpubQr.rows[0].avatar_quality_approved, true);
    assert.equal(unpubQr.rows[0].price_quality_approved, true);

    const addedPrivateRes = await db.query<{ new_id: string }>(
      `SELECT public.admin_add_private_slot('tutor-unpub', '2099-06-05'::date, '14:00'::time, '14:50'::time, 50, 6, '$', 'Africa/Cairo', 'رياضيات') AS new_id;`
    );
    assert.ok(addedPrivateRes.rows[0].new_id);
  } finally {
    await db.close();
  }
}

// ============================================================================
// PART B: Batching (>500 IDs), Strict Parser & Guardrails Unit Tests
// ============================================================================
async function runBatchingAndParserTests() {
  // 1. Deduplicates and splits 1050 unique IDs into [500, 500, 50] batches
  const calls: number[] = [];
  const rawIds: string[] = [];
  for (let i = 0; i < 1050; i += 1) {
    rawIds.push(`tutor-${i}`);
  }
  rawIds.push('tutor-0', '  ', ''); // duplicates and blanks

  const batchResult = await fetchAdminReadinessSlotRows(rawIds, async (batch) => {
    calls.push(batch.length);
    assert.ok(batch.length <= READINESS_SLOT_ROWS_RPC_BATCH_SIZE);
    return {
      data: {
        version: 1,
        evaluated_at: '2026-11-17T08:00:00.000Z',
        trial_slots: [
          {
            id: `trial-${batch[0]}`,
            tutor_id: batch[0],
            slot_date: '2099-05-01',
            start_time: '10:00:00',
            end_time: '10:20:00',
            timezone: 'Africa/Cairo',
            is_available: true,
            is_booked: false,
            admin_suspended: false,
          },
        ],
        private_slots: [],
      },
      error: null,
    };
  });

  assert.equal(batchResult.success, true);
  assert.deepEqual(calls, [500, 500, 50]);
  assert.equal(batchResult.trialSlots.length, 3);

  // 2. Fails closed on invalid contract payloads
  for (const badPayload of [
    null,
    [],
    { version: 2, evaluated_at: '2026-11-17T08:00:00Z', trial_slots: [], private_slots: [] },
    { version: 1, evaluated_at: '', trial_slots: [], private_slots: [] },
    { version: 1, evaluated_at: 'not-a-date', trial_slots: [], private_slots: [] },
    { version: 1, evaluated_at: '2026-11-17T08:00:00Z', trial_slots: null, private_slots: [] },
  ]) {
    const res = await fetchAdminReadinessSlotRows(['t-1'], async () => ({
      data: badPayload,
      error: null,
    }));
    assert.equal(res.success, false, 'Malformed RPC contract MUST return success=false');
  }

  // 3. Completion WhatsApp draft helper refuses to fabricate missing-items message on evaluationError
  const errorEval = evaluateTutorProfileReadiness({
    tutor: { id: 't-err', name: 'أحمد' },
    evaluationError: true,
    evaluationErrorMessage: 'permission denied for table tutor_available_slots',
  });
  assert.equal(errorEval.evaluationError, true);
  assert.equal(errorEval.completedRequirementsCount, null);
  assert.equal(errorEval.completionPercentage, null);
  assert.equal(errorEval.isReadyForInitialPublish, false);

  assert.throws(
    () =>
      buildTutorProfileCompletionWhatsAppDraft({
        tutorName: 'أحمد',
        evaluation: errorEval,
      }),
    /permission denied|تعذر تجهيز مسودة/
  );
}

// ============================================================================
// PART C: AdminService End-to-End Integration Scenarios (Spy Mock Client)
// ============================================================================
interface MockScenarioConfig {
  tutors: any[];
  schoolOfferings?: any[];
  quranOfferings?: any[];
  courseOptions?: any[];
  grades?: any[];
  stages?: any[];
  subjects?: any[];
  curricula?: any[];
  quranAges?: any[];
  quranLevels?: any[];
  privateInfoContacts?: any[];
  approvedAppsContacts?: any[];
  qualityReviews?: any[];
  rpcHandler: (
    fnName: string,
    args: Record<string, any>
  ) => Promise<{ data: any; error: any }>;
  tableWriteError?: Record<string, any>;
}

function createSpySupabaseClient(config: MockScenarioConfig) {
  const fromCalls: string[] = [];
  const rpcCalls: Array<{ fnName: string; args: Record<string, any> }> = [];

  function resolveTableData(table: string): any[] {
    switch (table) {
      case 'tutors':
        return config.tutors;
      case 'tutor_school_offerings':
        return config.schoolOfferings || [];
      case 'tutor_quran_offerings':
        return config.quranOfferings || [];
      case 'school_course_options':
        return config.courseOptions || [
          {
            id: 'co-math-4',
            grade_id: 'g-4',
            subject_id: 'sub-math',
            curriculum_id: 'cur-eg',
            is_active: true,
          },
        ];
      case 'educational_grades':
        return config.grades || [{ id: 'g-4', stage_id: 'st-prim', name: 'الصف الرابع', is_active: true }];
      case 'educational_stages':
        return config.stages || [{ id: 'st-prim', name: 'الابتدائية', is_active: true }];
      case 'subjects':
        return config.subjects || [{ id: 'sub-math', name: 'الرياضيات', is_active: true }];
      case 'curriculum_types':
        return config.curricula || [{ id: 'cur-eg', name: 'المنهج المصري', is_active: true }];
      case 'quran_age_groups':
        return config.quranAges || [{ id: 'age-1', name: '6-9 سنوات', is_active: true }];
      case 'quran_levels':
        return config.quranLevels || [{ id: 'lvl-1', name: 'تلاوة', is_active: true }];
      case 'tutor_private_info':
        return config.privateInfoContacts || [];
      case 'tutor_applications':
        return config.approvedAppsContacts || [];
      case 'tutor_quality_reviews':
        return config.qualityReviews || [];
      default:
        return [];
    }
  }

  function buildChain(table: string) {
    let rows = [...resolveTableData(table)];
    let isSingle = false;
    let isMaybeSingle = false;
    let writeErr = config.tableWriteError?.[table] || null;
    let writePayload: any = null;

    const execute = async () => {
      if (writePayload !== null) {
        if (writeErr) {
          return { data: null, error: writeErr };
        }
        return { data: writePayload, error: null };
      }
      if (writeErr) {
        return { data: null, error: writeErr };
      }
      if (isSingle || isMaybeSingle) {
        return { data: rows[0] || null, error: null };
      }
      return { data: rows, error: null };
    };

    const chain: any = {
      select() {
        return chain;
      },
      eq(col: string, val: any) {
        rows = rows.filter((r) => r[col] === val);
        return chain;
      },
      in(col: string, vals: any[]) {
        const set = new Set(vals);
        rows = rows.filter((r) => set.has(r[col]));
        return chain;
      },
      or() {
        return chain;
      },
      order() {
        return chain;
      },
      single() {
        isSingle = true;
        return chain;
      },
      maybeSingle() {
        isMaybeSingle = true;
        return chain;
      },
      upsert(payload: any) {
        writePayload = payload;
        return chain;
      },
      insert(payload: any) {
        writePayload = payload;
        return chain;
      },
      then(onFulfilled: any, onRejected: any) {
        return execute().then(onFulfilled, onRejected);
      },
    };

    return chain;
  }

  return {
    fromCalls,
    rpcCalls,
    client: {
      from(table: string) {
        fromCalls.push(table);
        return buildChain(table);
      },
      async rpc(fnName: string, args: Record<string, any>) {
        rpcCalls.push({ fnName, args });
        return config.rpcHandler(fnName, args);
      },
    },
  };
}

function makeCompleteTutorRow(overrides: Record<string, any> = {}) {
  return {
    id: 'tutor-dollar-6',
    name: 'سارة محمود',
    honorific: 'أ.',
    headline: 'معلمة رياضيات متخصصة للمرحلة الابتدائية',
    avatar_url: 'https://cdn.example.com/tutors/sara-mahmoud.jpg',
    help_child_quote: 'أساعد طفلك على فهم الحساب ببساطة وثقة',
    help_child_summary: 'شرح مبسط بأمثلة من الحياة اليومية وتدريبات متدرجة تناسب مستوى كل طفل.',
    hourly_rate_min: 6,
    hourly_rate_max: 6,
    currency: '$',
    session_duration_minutes: 50,
    trial_duration_minutes: 20,
    is_published: false,
    rating: null,
    reviews_count: 0,
    created_at: '2026-11-10T10:00:00Z',
    updated_at: '2026-11-16T10:00:00Z',
    ...overrides,
  };
}

async function runAdminServiceIntegrationTests() {
  try {
    // ------------------------------------------------------------------------
    // Scenario 1: Slot RPC fails with 42501 — ZERO direct slot table selects,
    // explicit evaluationError state, direct WhatsApp preserved, publish blocked
    // ------------------------------------------------------------------------
    {
      const spy = createSpySupabaseClient({
        tutors: [makeCompleteTutorRow()],
        schoolOfferings: [{ tutor_id: 'tutor-dollar-6', course_option_id: 'co-math-4' }],
        privateInfoContacts: [
          {
            tutor_id: 'tutor-dollar-6',
            country_code: '+20',
            whatsapp_number: '01012345678',
            phone_number: null,
          },
        ],
        rpcHandler: async (fnName) => {
          if (fnName === 'admin_get_readiness_slot_rows_v1') {
            return {
              data: null,
              error: { code: '42501', message: 'permission denied for table tutor_available_slots' },
            };
          }
          return { data: true, error: null };
        },
      });
      __setAdminServiceSupabaseForTests(spy.client);

      const list = await AdminService.getTutorsList();
      assert.equal(list.length, 1);
      assert.equal(
        spy.fromCalls.includes('tutor_available_slots'),
        false,
        'AdminService MUST NOT query tutor_available_slots directly'
      );
      assert.equal(
        spy.fromCalls.includes('tutor_private_slots'),
        false,
        'AdminService MUST NOT query tutor_private_slots directly'
      );

      const item = list[0];
      assert.equal(item.readiness.evaluationError, true);
      assert.equal(item.readiness.overallStatus, 'evaluation_error');
      assert.equal(item.readiness.completedRequirementsCount, null);
      assert.equal(item.readiness.completionPercentage, null);
      assert.equal(item.readiness.isReadyForInitialPublish, false);
      assert.equal(item.contact.hasValidContact, true);
      assert.equal(item.contact.directWhatsAppUrl, 'https://wa.me/201012345678');

      await assert.rejects(
        () => AdminService.toggleTutorPublish('tutor-dollar-6', true),
        /42501|permission denied|تعذر تقييم الجاهزية/
      );
      assert.equal(
        spy.rpcCalls.some((c) => c.fnName === 'admin_set_tutor_publish_status'),
        false,
        'Publish RPC must NOT be invoked when readiness evaluation errored'
      );

      await assert.rejects(
        () => AdminService.getTutorPrivateSlotsForAdmin('tutor-dollar-6'),
        /42501|permission denied/
      );
    }

    // ------------------------------------------------------------------------
    // Scenario 2: Photo + $6 price ONLY (missing bio/specs/slots) cannot publish;
    // exact integer $6 preserved in evaluation & quality review
    // ------------------------------------------------------------------------
    {
      const savedQualityPayloads: any[] = [];
      const spy = createSpySupabaseClient({
        tutors: [
          makeCompleteTutorRow({
            id: 'tutor-photo-price-only',
            headline: '',
            help_child_quote: '',
            help_child_summary: '',
            hourly_rate_min: 6,
            hourly_rate_max: 6,
          }),
        ],
        schoolOfferings: [],
        rpcHandler: async (fnName, args) => {
          if (fnName === 'admin_get_readiness_slot_rows_v1') {
            return {
              data: {
                version: 1,
                evaluated_at: '2026-11-17T08:00:00.000Z',
                trial_slots: [],
                private_slots: [],
              },
              error: null,
            };
          }
          if (fnName === 'admin_save_tutor_quality_review') {
            savedQualityPayloads.push(args);
            return { data: { success: true }, error: null };
          }
          return { data: null, error: null };
        },
      });
      __setAdminServiceSupabaseForTests(spy.client);

      const list = await AdminService.getTutorsList();
      assert.equal(list[0].readiness.evaluationError, false);
      assert.equal(list[0].readiness.completedRequirementsCount, 2); // avatar + $6 pricing only
      assert.equal(list[0].readiness.isReadyForInitialPublish, false);

      await assert.rejects(
        () => AdminService.toggleTutorPublish('tutor-photo-price-only', true),
        /لا يمكن نشر ملف المعلم/
      );

      const qr = await AdminService.saveTutorInitialQualityReview({
        tutorId: 'tutor-photo-price-only',
        avatarQualityApproved: true,
        approvedAvatarUrl: 'https://cdn.example.com/tutors/sara-mahmoud.jpg',
        priceQualityApproved: true,
        approvedPriceAmount: 6,
        approvedCurrency: '$',
        approvedDurationMinutes: 50,
      });
      assert.equal(qr.approvedPriceAmount, 6);
      assert.equal(savedQualityPayloads[0].p_approved_price_amount, 6);
    }

    // ------------------------------------------------------------------------
    // Scenario 3: Complete unpublished tutor ($6 + 20m trial + $6 private + specs + bio + avatar)
    // evaluates using authoritative server `evaluated_at`, passes 6/6, publishes cleanly
    // ------------------------------------------------------------------------
    {
      const savedQualityRows: TutorInitialQualityReviewRecord[] = [];
      let publishCalled = false;

      const buildSlots = () => ({
        version: 1,
        // 10:00 AM Cairo -> slot at 12:00 PM Cairo IS future!
        evaluated_at: '2026-11-17T08:00:00.000Z',
        trial_slots: [
          {
            id: 'trial-future-1',
            tutor_id: 'tutor-dollar-6',
            slot_date: '2026-11-17',
            start_time: '12:00:00',
            end_time: '12:20:00',
            timezone: 'Africa/Cairo',
            is_available: true,
            is_booked: false,
            admin_suspended: false,
          },
        ],
        private_slots: [
          {
            id: 'priv-future-1',
            tutor_id: 'tutor-dollar-6',
            slot_date: '2026-11-17',
            start_time: '14:00:00',
            end_time: '14:50:00',
            timezone: 'Africa/Cairo',
            duration_minutes: 50,
            price_amount: 6,
            currency: '$',
            is_available: true,
            is_booked: false,
            admin_suspended: false,
            specialization_label: 'الرياضيات - الصف الرابع',
            offering_course_option_id: 'co-math-4',
          },
        ],
      });

      const spy = createSpySupabaseClient({
        tutors: [makeCompleteTutorRow()],
        schoolOfferings: [{ tutor_id: 'tutor-dollar-6', course_option_id: 'co-math-4' }],
        qualityReviews: [
          {
            tutor_id: 'tutor-dollar-6',
            avatar_quality_approved: true,
            approved_avatar_url: 'https://cdn.example.com/tutors/sara-mahmoud.jpg',
            price_quality_approved: true,
            approved_price_amount: 6,
            approved_currency: '$',
            approved_duration_minutes: 50,
            reviewed_at: '2026-11-17T07:50:00Z',
          },
        ],
        rpcHandler: async (fnName) => {
          if (fnName === 'admin_get_readiness_slot_rows_v1') {
            return { data: buildSlots(), error: null };
          }
          if (fnName === 'admin_set_tutor_publish_status') {
            publishCalled = true;
            return { data: true, error: null };
          }
          return { data: null, error: null };
        },
      });
      __setAdminServiceSupabaseForTests(spy.client);

      const list = await AdminService.getTutorsList();
      assert.equal(list[0].readiness.completedRequirementsCount, 6);
      assert.equal(list[0].readiness.completionPercentage, 100);
      assert.equal(list[0].readiness.isReadyForInitialPublish, true);
      assert.equal(list[0].readiness.validTrialSlotsCount, 1);
      assert.equal(list[0].readiness.validPaidPrivateSlotsCount, 1);

      const published = await AdminService.toggleTutorPublish('tutor-dollar-6', true);
      assert.equal(published, true);
      assert.equal(publishCalled, true);

      // Now verify server `evaluated_at` after slot time marks it expired regardless of browser clock
      const spyLater = createSpySupabaseClient({
        tutors: [makeCompleteTutorRow()],
        schoolOfferings: [{ tutor_id: 'tutor-dollar-6', course_option_id: 'co-math-4' }],
        rpcHandler: async (fnName) => {
          if (fnName === 'admin_get_readiness_slot_rows_v1') {
            const slots = buildSlots();
            slots.evaluated_at = '2026-11-17T11:00:00.000Z'; // 13:00 Cairo (after 12:00 trial!)
            return { data: slots, error: null };
          }
          return { data: null, error: null };
        },
      });
      __setAdminServiceSupabaseForTests(spyLater.client);

      const evalLater = await AdminService.evaluateTutorReadinessById('tutor-dollar-6');
      assert.equal(evalLater.validTrialSlotsCount, 0);
      assert.equal(evalLater.validPaidPrivateSlotsCount, 1); // 14:00 Cairo still future
      assert.equal(evalLater.isReadyForInitialPublish, false);
      void savedQualityRows;
    }

    // ------------------------------------------------------------------------
    // Scenario 4: Already-published tutor with expired slots remains published & editable
    // ------------------------------------------------------------------------
    {
      let savedViaRpc = false;
      const spy = createSpySupabaseClient({
        tutors: [makeCompleteTutorRow({ id: 'tutor-already-pub', is_published: true })],
        schoolOfferings: [{ tutor_id: 'tutor-already-pub', course_option_id: 'co-math-4' }],
        rpcHandler: async (fnName) => {
          if (fnName === 'admin_get_readiness_slot_rows_v1') {
            return {
              data: {
                version: 1,
                evaluated_at: '2026-11-17T08:00:00.000Z',
                trial_slots: [],
                private_slots: [],
              },
              error: null,
            };
          }
          if (fnName === 'admin_save_tutor') {
            savedViaRpc = true;
            return { data: 'tutor-already-pub', error: null };
          }
          return { data: null, error: null };
        },
      });
      __setAdminServiceSupabaseForTests(spy.client);

      const list = await AdminService.getTutorsList();
      assert.equal(list[0].isPublished, true);
      assert.equal(list[0].readiness.overallStatus, 'published_needs_slots');

      const payload: AdminTutorSavePayload = {
        id: 'tutor-already-pub',
        name: 'سارة محمود',
        honorific: 'أ.',
        headline: 'معلمة رياضيات متخصصة للمرحلة الابتدائية',
        avatarUrl: 'https://cdn.example.com/tutors/sara-mahmoud.jpg',
        verifiedCredentials: true,
        yearsOfExperience: 5,
        experienceBadgeText: 'خبرة 5 سنوات',
        curriculumTags: ['المنهج المصري'],
        hourlyRateMin: 6,
        hourlyRateMax: 6,
        currency: '$',
        sessionDurationMinutes: 50,
        trialDurationMinutes: 20,
        isPublished: true,
        helpChildQuote: 'أساعد طفلك على فهم الحساب ببساطة وثقة',
        helpChildSummary: 'شرح مبسط بأمثلة من الحياة اليومية وتدريبات متدرجة تناسب مستوى كل طفل.',
        targetStudentCases: [],
        privateInfo: {
          tutorId: 'tutor-already-pub',
          fullLegalName: 'سارة محمود',
          nationalIdNumber: '',
          countryCode: '+20',
          phoneNumber: '',
          whatsappNumber: '01012345678',
          email: '',
          internalNotes: '',
        },
        qualifications: [],
        methodologyPillars: [],
        trialSteps: [],
        schoolOfferingOptionIds: ['co-math-4'],
        quranOfferings: [],
      };

      const savedId = await AdminService.saveTutor(payload, false);
      assert.equal(savedId, 'tutor-already-pub');
      assert.equal(savedViaRpc, true);
    }

    // ------------------------------------------------------------------------
    // Scenario 5: Quality review save NEVER fakes success via localStorage on DB failure
    // ------------------------------------------------------------------------
    {
      const spy = createSpySupabaseClient({
        tutors: [makeCompleteTutorRow()],
        tableWriteError: {
          tutor_quality_reviews: { code: '42P01', message: 'relation "public.tutor_quality_reviews" does not exist' },
        },
        rpcHandler: async (fnName) => {
          if (fnName === 'admin_save_tutor_quality_review') {
            return {
              data: null,
              error: { code: 'PGRST202', message: 'Could not find the function public.admin_save_tutor_quality_review' },
            };
          }
          return { data: null, error: null };
        },
      });
      __setAdminServiceSupabaseForTests(spy.client);

      await assert.rejects(
        () =>
          AdminService.saveTutorInitialQualityReview({
            tutorId: 'tutor-dollar-6',
            avatarQualityApproved: true,
            approvedAvatarUrl: 'https://cdn.example.com/tutors/sara-mahmoud.jpg',
            priceQualityApproved: true,
            approvedPriceAmount: 6,
            approvedCurrency: '$',
            approvedDurationMinutes: 50,
          }),
        /021_admin_quality_review_and_private_slot_rpc\.sql|تعذر حفظ مراجعة الجودة/
      );
    }
  } finally {
    __setAdminServiceSupabaseForTests(null);
  }
}

async function main() {
  await runPostgresMigrationTests();
  console.log('✓ Part A: PostgreSQL PGlite migrations 020 & 021 tests passed');

  await runBatchingAndParserTests();
  console.log('✓ Part B: Batching (>500), parser, & completion draft guard tests passed');

  await runAdminServiceIntegrationTests();
  console.log('✓ Part C: AdminService readiness, 42501, $6 pricing, & publish guard tests passed');

  console.log('All admin readiness tests passed!');
}

main().catch((err) => {
  console.error('Admin readiness test suite failed:', err);
  process.exit(1);
});
