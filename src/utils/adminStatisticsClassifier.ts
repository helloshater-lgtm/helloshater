import type {
  AdminPlatformStatistics,
  AdminSubjectStatItem,
  AdminQuranProgramStatItem,
  AdminQuranAgeGroupStatItem,
  AdminStageStatItem,
  AdminCurriculumStatItem,
  AdminDetailedSpecializationStatItem,
  AdminStatisticsDrilldownRequest,
  AdminStatisticsDrilldownResponse,
  AdminStatTutorRef,
  AdminStatApplicantRef,
  AdminStatSubscriptionRef,
  AdminStatUnclassifiedRef,
  TrackType,
} from '../types';

export interface RawRefStage {
  id: string;
  name: string;
  grades_desc: string;
  display_order: number;
  is_active: boolean;
}

export interface RawRefGrade {
  id: string;
  stage_id: string;
  name: string;
  display_order: number;
  is_active: boolean;
}

export interface RawRefCurriculum {
  id: string;
  name: string;
  description?: string;
  display_order: number;
  is_active: boolean;
}

export interface RawRefSubject {
  id: string;
  name: string;
  english_name?: string;
  category: 'core' | 'languages' | 'sciences' | 'social';
  display_order: number;
  is_active: boolean;
}

export interface RawRefCourseOption {
  id: string;
  grade_id: string;
  subject_id: string;
  curriculum_id: string;
  is_active: boolean;
}

export interface RawRefQuranAgeGroup {
  id: string;
  name: string;
  age_range: string;
  display_order: number;
  is_active: boolean;
}

export interface RawRefQuranLevel {
  id: string;
  name: string;
  description: string;
  display_order: number;
  is_active: boolean;
}

export interface RawTutorRow {
  id: string;
  name: string;
  honorific: string;
  headline?: string;
  is_published: boolean;
  created_at?: string;
}

export interface RawTutorSchoolOfferingRow {
  id?: string;
  tutor_id: string;
  course_option_id?: string | null;
}

export interface RawTutorQuranOfferingRow {
  id?: string;
  tutor_id: string;
  age_group_id?: string | null;
  level_id?: string | null;
}

export interface RawApplicationRow {
  id: string;
  reference_code?: string;
  full_name: string;
  phone: string;
  track?: TrackType;
  status: string;
  school_course_option_ids?: string[] | null;
  school_specializations?: Array<{
    courseOptionId?: string | null;
    subjectId?: string | null;
    stageId?: string | null;
    curriculumId?: string | null;
    curriculumTypeId?: string | null;
    curriculumType?: string | null;
    gradeIds?: string[] | null;
  }> | null;
  quran_offerings?: Array<{
    levelId?: string | null;
    level_id?: string | null;
    ageGroupId?: string | null;
    age_group_id?: string | null;
  }> | null;
  quran_levels?: string[] | null;
  quran_age_groups?: string[] | null;
  created_at: string;
}

export interface RawPrivateSlotRow {
  id: string;
  tutor_id: string;
  offering_course_option_id?: string | null;
  quran_age_group_id?: string | null;
  quran_level_id?: string | null;
  specialization_label?: string | null;
  slot_date?: string;
  start_time?: string;
  end_time?: string;
  timezone?: string;
  is_available: boolean;
  is_booked?: boolean;
  admin_suspended?: boolean;
  is_future?: boolean;
  created_at?: string;
}

export interface RawPrivateBookingRow {
  id: string;
  slot_id?: string | null;
  tutor_id: string;
  student_name: string;
  specialization_label?: string | null;
  offering_course_option_id?: string | null;
  quran_age_group_id?: string | null;
  quran_level_id?: string | null;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  created_at: string;
}

export interface RawGroupRow {
  id: string;
  tutor_id: string;
  title: string;
  offering_course_option_id?: string | null;
  quran_age_group_id?: string | null;
  quran_level_id?: string | null;
  specialization_label?: string | null;
  review_status?: string;
  status: string;
  is_published: boolean;
  admin_suspended?: boolean;
  created_at?: string;
}

export interface RawGroupEnrollmentRow {
  id: string;
  group_id: string;
  tutor_id: string;
  student_name: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  created_at: string;
}

export interface RawTrialSummary {
  total_slots?: number;
  available_future_slots: number;
  booked_slots: number;
  suspended_slots?: number;
}

export interface RawStatisticsDataset {
  subjects: RawRefSubject[];
  stages: RawRefStage[];
  grades: RawRefGrade[];
  curricula: RawRefCurriculum[];
  courseOptions: RawRefCourseOption[];
  quranLevels: RawRefQuranLevel[];
  quranAgeGroups: RawRefQuranAgeGroup[];
  tutors: RawTutorRow[];
  schoolOfferings: RawTutorSchoolOfferingRow[];
  quranOfferings: RawTutorQuranOfferingRow[];
  applications: RawApplicationRow[];
  privateSlots: RawPrivateSlotRow[];
  privateBookings: RawPrivateBookingRow[];
  groups: RawGroupRow[];
  groupEnrollments: RawGroupEnrollmentRow[];
  trialSummary?: RawTrialSummary;
}

export interface EnrichedCourseOption {
  id: string;
  gradeId: string;
  gradeName: string;
  stageId: string;
  stageName: string;
  subjectId: string;
  subjectName: string;
  curriculumId: string;
  curriculumName: string;
  canonicalLabel: string;
  isActive: boolean;
  subjectOrder: number;
  gradeOrder: number;
  curriculumOrder: number;
}

export interface EnrichedQuranSpec {
  id: string;
  pairKey: string;
  levelId: string;
  levelName: string;
  ageGroupId: string;
  ageGroupName: string;
  canonicalLabel: string;
  isActive: boolean;
  levelOrder: number;
  ageOrder: number;
}

export type ResolvedSpecialization =
  | {
      status: 'school';
      courseOptionId: string;
      subjectId: string;
      gradeId: string;
      stageId: string;
      curriculumId: string;
      canonicalLabel: string;
    }
  | {
      status: 'quran';
      pairKey: string;
      levelId: string;
      ageGroupId: string;
      canonicalLabel: string;
    }
  | {
      status: 'unclassified';
      reason: string;
    };

/**
 * Resolves a private slot or group strictly using its reference foreign keys
 * (`offering_course_option_id` or `quran_age_group_id` + `quran_level_id`),
 * or if all foreign keys are absent, ONLY via an unambiguous single verified offering
 * belonging to the exact same `tutor_id` with an exact canonical label match.
 * Never performs substring or text guessing.
 */
export function resolveEntitySpecializationStrict(
  raw: {
    tutor_id: string;
    offering_course_option_id?: string | null;
    quran_age_group_id?: string | null;
    quran_level_id?: string | null;
    specialization_label?: string | null;
  },
  courseOptionsMap: Map<string, EnrichedCourseOption>,
  quranPairMap: Map<string, EnrichedQuranSpec>,
  tutorLabelToSpecsMap: Map<string, ResolvedSpecialization[]>
): ResolvedSpecialization {
  const coId = (raw.offering_course_option_id ?? '').trim();
  const qAgeId = (raw.quran_age_group_id ?? '').trim();
  const qLvlId = (raw.quran_level_id ?? '').trim();

  // Reject mixed school and quran foreign keys
  if (coId && (qAgeId || qLvlId)) {
    return {
      status: 'unclassified',
      reason: 'تعارض في البيانات: السجل يجمع بين معرف تخصص مدرسي ومعرف مسار قرآني في آن واحد',
    };
  }

  // 1. Direct School Course Option FK
  if (coId) {
    const opt = courseOptionsMap.get(coId);
    if (!opt) {
      return {
        status: 'unclassified',
        reason: `معرف خيار المادة (${coId}) غير موجود في جدول الخيارات المرجعية`,
      };
    }
    return {
      status: 'school',
      courseOptionId: opt.id,
      subjectId: opt.subjectId,
      gradeId: opt.gradeId,
      stageId: opt.stageId,
      curriculumId: opt.curriculumId,
      canonicalLabel: opt.canonicalLabel,
    };
  }

  // 2. Direct Quran FK Pair (both level and age group must be present and valid)
  if (qAgeId || qLvlId) {
    if (!qAgeId || !qLvlId) {
      return {
        status: 'unclassified',
        reason: 'بيانات المسار القرآني ناقصة (يجب توفر معرف المستوى ومعرف الفئة العمرية معًا)',
      };
    }
    const pairKey = `${qLvlId}|${qAgeId}`;
    const qSpec = quranPairMap.get(pairKey);
    if (!qSpec) {
      return {
        status: 'unclassified',
        reason: `معرف المستوى القرآني (${qLvlId}) أو الفئة العمرية (${qAgeId}) غير موجود في الجداول المرجعية`,
      };
    }
    return {
      status: 'quran',
      pairKey: qSpec.pairKey,
      levelId: qSpec.levelId,
      ageGroupId: qSpec.ageGroupId,
      canonicalLabel: qSpec.canonicalLabel,
    };
  }

  // 3. Fallback ONLY to an unambiguous single verified offering of the same tutor matching exact canonical label
  const exactLabel = (raw.specialization_label ?? '').trim();
  const tutorId = (raw.tutor_id ?? '').trim();
  if (!tutorId || !exactLabel) {
    return {
      status: 'unclassified',
      reason: 'السجل يفتقر إلى المعرف المرجعي للتخصص',
    };
  }

  const tutorMatches = tutorLabelToSpecsMap.get(`${tutorId}::${exactLabel}`) ?? [];
  if (tutorMatches.length === 1) {
    return tutorMatches[0];
  }
  if (tutorMatches.length > 1) {
    return {
      status: 'unclassified',
      reason: 'مسمى التخصص غامض لارتباطه بأكثر من تخصص واحد لنفس المعلم بدون معرف مرجعي حاسم',
    };
  }

  return {
    status: 'unclassified',
    reason: 'تعذر ربط السجل بأي تخصص مرجعي معتمد للمعلم (لا يوجد معرف مرجعي أو تطابق وحيد)',
  };
}

/**
 * Resolves an application's school and quran specializations strictly by reference IDs.
 * Never performs text guessing or cartesian-product guessing across multiple levels and age groups.
 */
export function resolveApplicationSpecializationsStrict(
  app: RawApplicationRow,
  courseOptionsMap: Map<string, EnrichedCourseOption>,
  schoolTripletToOptionMap: Map<string, EnrichedCourseOption>,
  quranPairMap: Map<string, EnrichedQuranSpec>
): {
  schoolSpecs: Map<string, EnrichedCourseOption>;
  quranSpecs: Map<string, EnrichedQuranSpec>;
  unclassifiedReasons: string[];
} {
  const schoolSpecs = new Map<string, EnrichedCourseOption>();
  const quranSpecs = new Map<string, EnrichedQuranSpec>();
  const unclassifiedReasons: string[] = [];

  if (Array.isArray(app.school_course_option_ids)) {
    for (const rawOptId of app.school_course_option_ids) {
      const optId = (rawOptId ?? '').trim();
      if (!optId) continue;
      const opt = courseOptionsMap.get(optId);
      if (!opt) {
        unclassifiedReasons.push(`معرف خيار المادة (${optId}) في طلب الانضمام غير موجود في جدول الخيارات المرجعية`);
      } else {
        schoolSpecs.set(opt.id, opt);
      }
    }
  }

  if (Array.isArray(app.school_specializations)) {
    for (const spec of app.school_specializations) {
      if (!spec || typeof spec !== 'object') continue;
      const directCoId = (spec.courseOptionId ?? '').trim();
      if (directCoId) {
        const opt = courseOptionsMap.get(directCoId);
        if (!opt) {
          unclassifiedReasons.push(`معرف خيار المادة (${directCoId}) في التخصص المدرسي غير صالح`);
        } else {
          schoolSpecs.set(opt.id, opt);
        }
        continue;
      }

      const subjId = (spec.subjectId ?? '').trim();
      const stageId = (spec.stageId ?? '').trim();
      const currId = (spec.curriculumId ?? spec.curriculumTypeId ?? spec.curriculumType ?? '').trim();
      const gradeIds = Array.isArray(spec.gradeIds) ? spec.gradeIds : [];

      if (!subjId || !currId || gradeIds.length === 0) {
        unclassifiedReasons.push('تخصص مدرسي في طلب الانضمام يفتقر إلى معرف المادة أو المنهج أو الصفوف');
        continue;
      }

      for (const rawGId of gradeIds) {
        const gId = (rawGId ?? '').trim();
        const opt = schoolTripletToOptionMap.get(`${gId}|${subjId}|${currId}`);
        if (!opt) {
          unclassifiedReasons.push(
            `التركيبة المرجعية (الصف: ${gId || 'فارغ'}، المادة: ${subjId}، المنهج: ${currId}) غير موجودة في جدول الخيارات المرجعية`
          );
          continue;
        }
        if (stageId && stageId !== opt.stageId) {
          unclassifiedReasons.push(
            `تعارض بين المرحلة المختارة (${stageId}) والمرحلة الفعلية للصف (${opt.stageId})`
          );
          continue;
        }
        schoolSpecs.set(opt.id, opt);
      }
    }
  }

  const hasStructuredQuranOfferings =
    Array.isArray(app.quran_offerings) && app.quran_offerings.length > 0;

  if (hasStructuredQuranOfferings) {
    for (const qo of app.quran_offerings!) {
      if (!qo || typeof qo !== 'object') continue;
      const lId = (qo.levelId ?? qo.level_id ?? '').trim();
      const aId = (qo.ageGroupId ?? qo.age_group_id ?? '').trim();
      if (!lId || !aId) {
        unclassifiedReasons.push('عرض قرآني في طلب الانضمام يفتقر إلى معرف المستوى أو الفئة العمرية');
        continue;
      }
      const qSpec = quranPairMap.get(`${lId}|${aId}`);
      if (!qSpec) {
        unclassifiedReasons.push(`زوج المسار القرآني (${lId} / ${aId}) غير موجود في الجداول المرجعية`);
      } else {
        quranSpecs.set(qSpec.pairKey, qSpec);
      }
    }
  } else {
    const rawLevels = Array.isArray(app.quran_levels)
      ? app.quran_levels.map((x) => (x ?? '').trim()).filter(Boolean)
      : [];
    const rawAges = Array.isArray(app.quran_age_groups)
      ? app.quran_age_groups.map((x) => (x ?? '').trim()).filter(Boolean)
      : [];

    if (rawLevels.length === 1 && rawAges.length === 1) {
      const pairKey = `${rawLevels[0]}|${rawAges[0]}`;
      const qSpec = quranPairMap.get(pairKey);
      if (!qSpec) {
        unclassifiedReasons.push(`زوج المسار القرآني (${pairKey}) غير صالح`);
      } else {
        quranSpecs.set(qSpec.pairKey, qSpec);
      }
    } else if (rawLevels.length > 0 || rawAges.length > 0) {
      // Do NOT guess cartesian product when multiple levels/age groups are stored without explicit pairing
      unclassifiedReasons.push(
        'بيانات مسار قرآني قديمة تحتوي على مستويات أو فئات عمرية متعددة أو ناقصة دون ربط زوجي محدد في quran_offerings'
      );
    }
  }

  if (
    app.status !== 'draft' &&
    schoolSpecs.size === 0 &&
    quranSpecs.size === 0 &&
    unclassifiedReasons.length === 0
  ) {
    unclassifiedReasons.push('طلب انضمام مرسل لا يحتوي على أي تخصصات مرجعية مسجلة');
  }

  return { schoolSpecs, quranSpecs, unclassifiedReasons };
}

/**
 * Pure reference-based computation of AdminPlatformStatistics.
 */
export function computePlatformStatisticsFromDataset(
  dataset: RawStatisticsDataset
): AdminPlatformStatistics {
  const subjectsMap = new Map<string, RawRefSubject>(dataset.subjects.map((s) => [s.id, s]));
  const stagesMap = new Map<string, RawRefStage>(dataset.stages.map((s) => [s.id, s]));
  const gradesMap = new Map<string, RawRefGrade>(dataset.grades.map((g) => [g.id, g]));
  const curriculaMap = new Map<string, RawRefCurriculum>(dataset.curricula.map((c) => [c.id, c]));
  const quranLevelsMap = new Map<string, RawRefQuranLevel>(dataset.quranLevels.map((l) => [l.id, l]));
  const quranAgeGroupsMap = new Map<string, RawRefQuranAgeGroup>(
    dataset.quranAgeGroups.map((a) => [a.id, a])
  );
  const tutorsMap = new Map<string, AdminStatTutorRef>(
    dataset.tutors.map((t) => [
      t.id,
      {
        id: t.id,
        name: t.name || t.id,
        honorific: t.honorific || 'أ.',
        headline: t.headline,
        isPublished: Boolean(t.is_published),
        createdAt: t.created_at,
      },
    ])
  );

  // Build Enriched Course Options Map (including inactive options!)
  const courseOptionsMap = new Map<string, EnrichedCourseOption>();
  const schoolTripletToOptionMap = new Map<string, EnrichedCourseOption>();

  for (const opt of dataset.courseOptions) {
    const sub = subjectsMap.get(opt.subject_id);
    const grade = gradesMap.get(opt.grade_id);
    const stage = grade ? stagesMap.get(grade.stage_id) : undefined;
    const curr = curriculaMap.get(opt.curriculum_id);
    if (!sub || !grade || !curr) continue;

    const canonicalLabel = `${sub.name} - ${grade.name} (${curr.name})`.trim();
    const isActive = Boolean(
      opt.is_active &&
        sub.is_active &&
        grade.is_active &&
        (stage ? stage.is_active : true) &&
        curr.is_active
    );
    const enriched: EnrichedCourseOption = {
      id: opt.id,
      gradeId: opt.grade_id,
      gradeName: grade.name,
      stageId: grade.stage_id,
      stageName: stage?.name || grade.stage_id,
      subjectId: opt.subject_id,
      subjectName: sub.name,
      curriculumId: opt.curriculum_id,
      curriculumName: curr.name,
      canonicalLabel,
      isActive,
      subjectOrder: sub.display_order ?? 1,
      gradeOrder: grade.display_order ?? 1,
      curriculumOrder: curr.display_order ?? 1,
    };
    courseOptionsMap.set(opt.id, enriched);
    schoolTripletToOptionMap.set(`${opt.grade_id}|${opt.subject_id}|${opt.curriculum_id}`, enriched);
  }

  // Build Enriched Quran Pair Map (including inactive levels and age groups!)
  const quranPairMap = new Map<string, EnrichedQuranSpec>();
  const sortedQuranLevels = [...dataset.quranLevels].sort(
    (a, b) => (a.display_order ?? 1) - (b.display_order ?? 1)
  );
  const sortedQuranAgeGroups = [...dataset.quranAgeGroups].sort(
    (a, b) => (a.display_order ?? 1) - (b.display_order ?? 1)
  );

  for (const ql of sortedQuranLevels) {
    for (const qag of sortedQuranAgeGroups) {
      const pairKey = `${ql.id}|${qag.id}`;
      const canonicalLabel = `قرآن وتأسيس: ${ql.name} (${qag.name})`.trim();
      const spec: EnrichedQuranSpec = {
        id: `quran:${ql.id}:${qag.id}`,
        pairKey,
        levelId: ql.id,
        levelName: ql.name,
        ageGroupId: qag.id,
        ageGroupName: qag.name,
        canonicalLabel,
        isActive: Boolean(ql.is_active && qag.is_active),
        levelOrder: ql.display_order ?? 1,
        ageOrder: qag.display_order ?? 1,
      };
      quranPairMap.set(pairKey, spec);
    }
  }

  // Accumulator definition (with separated confirmed / completed / pending / cancelled)
  interface StatAccumulator {
    tutorsSet: Set<string>;
    publishedTutorsSet: Set<string>;
    unpublishedTutorsSet: Set<string>;
    offeringsCount: number;
    coveredCourseOptionsSet: Set<string>;
    publishedCoveredCourseOptionsSet: Set<string>;
    submittedAppsSet: Set<string>;
    needsInfoAppsSet: Set<string>;
    approvedAppsSet: Set<string>;
    rejectedAppsSet: Set<string>;
    draftAppsSet: Set<string>;
    confirmedPrivateBookings: number;
    completedPrivateBookings: number;
    pendingPrivateBookings: number;
    cancelledPrivateBookings: number;
    confirmedGroupEnrollments: number;
    completedGroupEnrollments: number;
    pendingGroupEnrollments: number;
    cancelledGroupEnrollments: number;
    activeGroupsCount: number;
    totalGroupsCount: number;
    availablePrivateSlotsCount: number;
  }

  const createEmptyAcc = (): StatAccumulator => ({
    tutorsSet: new Set(),
    publishedTutorsSet: new Set(),
    unpublishedTutorsSet: new Set(),
    offeringsCount: 0,
    coveredCourseOptionsSet: new Set(),
    publishedCoveredCourseOptionsSet: new Set(),
    submittedAppsSet: new Set(),
    needsInfoAppsSet: new Set(),
    approvedAppsSet: new Set(),
    rejectedAppsSet: new Set(),
    draftAppsSet: new Set(),
    confirmedPrivateBookings: 0,
    completedPrivateBookings: 0,
    pendingPrivateBookings: 0,
    cancelledPrivateBookings: 0,
    confirmedGroupEnrollments: 0,
    completedGroupEnrollments: 0,
    pendingGroupEnrollments: 0,
    cancelledGroupEnrollments: 0,
    activeGroupsCount: 0,
    totalGroupsCount: 0,
    availablePrivateSlotsCount: 0,
  });

  const sortedSubjects = [...dataset.subjects].sort(
    (a, b) => (a.display_order ?? 1) - (b.display_order ?? 1)
  );
  const sortedStages = [...dataset.stages].sort(
    (a, b) => (a.display_order ?? 1) - (b.display_order ?? 1)
  );
  const sortedCurricula = [...dataset.curricula].sort(
    (a, b) => (a.display_order ?? 1) - (b.display_order ?? 1)
  );

  const subjectAccMap = new Map<string, StatAccumulator>();
  sortedSubjects.forEach((s) => subjectAccMap.set(s.id, createEmptyAcc()));

  const quranOverallAcc = createEmptyAcc();

  const quranLevelAccMap = new Map<string, StatAccumulator>();
  sortedQuranLevels.forEach((ql) => quranLevelAccMap.set(ql.id, createEmptyAcc()));

  const quranAgeAccMap = new Map<string, StatAccumulator>();
  sortedQuranAgeGroups.forEach((qa) => quranAgeAccMap.set(qa.id, createEmptyAcc()));

  const stageAccMap = new Map<string, StatAccumulator>();
  sortedStages.forEach((st) => stageAccMap.set(st.id, createEmptyAcc()));

  const curriculumAccMap = new Map<string, StatAccumulator>();
  sortedCurricula.forEach((cr) => curriculumAccMap.set(cr.id, createEmptyAcc()));

  const courseOptionAccMap = new Map<string, StatAccumulator>();
  courseOptionsMap.forEach((_v, k) => courseOptionAccMap.set(k, createEmptyAcc()));

  const quranPairAccMap = new Map<string, StatAccumulator>();
  quranPairMap.forEach((_v, k) => quranPairAccMap.set(k, createEmptyAcc()));

  const addTutorToAcc = (
    acc: StatAccumulator | undefined,
    tutorId: string,
    optionKey?: string
  ) => {
    if (!acc) return;
    const tutor = tutorsMap.get(tutorId);
    if (!tutor) return;
    acc.tutorsSet.add(tutorId);
    if (tutor.isPublished) {
      acc.publishedTutorsSet.add(tutorId);
    } else {
      acc.unpublishedTutorsSet.add(tutorId);
    }
    acc.offeringsCount += 1;
    if (optionKey) {
      acc.coveredCourseOptionsSet.add(optionKey);
      if (tutor.isPublished) {
        acc.publishedCoveredCourseOptionsSet.add(optionKey);
      }
    }
  };

  // 1. Process Tutor Offerings & build per-tutor canonical label map
  const schoolTutorsSet = new Set<string>();
  const quranTutorsSet = new Set<string>();
  const tutorLabelToSpecsMap = new Map<string, ResolvedSpecialization[]>();
  let unclassifiedTutorOfferingsCount = 0;

  for (const row of dataset.schoolOfferings) {
    const tutorId = (row.tutor_id ?? '').trim();
    if (!tutorsMap.has(tutorId)) {
      unclassifiedTutorOfferingsCount += 1;
      continue;
    }
    const coId = (row.course_option_id ?? '').trim();
    const opt = courseOptionsMap.get(coId);
    if (!opt) {
      unclassifiedTutorOfferingsCount += 1;
      continue;
    }

    schoolTutorsSet.add(tutorId);
    addTutorToAcc(subjectAccMap.get(opt.subjectId), tutorId, opt.id);
    addTutorToAcc(stageAccMap.get(opt.stageId), tutorId, opt.id);
    addTutorToAcc(curriculumAccMap.get(opt.curriculumId), tutorId, opt.id);
    addTutorToAcc(courseOptionAccMap.get(opt.id), tutorId, opt.id);

    const key = `${tutorId}::${opt.canonicalLabel}`;
    const list = tutorLabelToSpecsMap.get(key) ?? [];
    list.push({
      status: 'school',
      courseOptionId: opt.id,
      subjectId: opt.subjectId,
      gradeId: opt.gradeId,
      stageId: opt.stageId,
      curriculumId: opt.curriculumId,
      canonicalLabel: opt.canonicalLabel,
    });
    tutorLabelToSpecsMap.set(key, list);
  }

  for (const row of dataset.quranOfferings) {
    const tutorId = (row.tutor_id ?? '').trim();
    if (!tutorsMap.has(tutorId)) {
      unclassifiedTutorOfferingsCount += 1;
      continue;
    }
    const lId = (row.level_id ?? '').trim();
    const aId = (row.age_group_id ?? '').trim();
    const pairKey = `${lId}|${aId}`;
    const qSpec = quranPairMap.get(pairKey);
    if (!qSpec) {
      unclassifiedTutorOfferingsCount += 1;
      continue;
    }

    quranTutorsSet.add(tutorId);
    addTutorToAcc(quranOverallAcc, tutorId, pairKey);
    addTutorToAcc(quranLevelAccMap.get(qSpec.levelId), tutorId, pairKey);
    addTutorToAcc(quranAgeAccMap.get(qSpec.ageGroupId), tutorId, pairKey);
    addTutorToAcc(quranPairAccMap.get(pairKey), tutorId, pairKey);

    const key = `${tutorId}::${qSpec.canonicalLabel}`;
    const list = tutorLabelToSpecsMap.get(key) ?? [];
    list.push({
      status: 'quran',
      pairKey: qSpec.pairKey,
      levelId: qSpec.levelId,
      ageGroupId: qSpec.ageGroupId,
      canonicalLabel: qSpec.canonicalLabel,
    });
    tutorLabelToSpecsMap.set(key, list);
  }

  // 2. Process Tutor Applications
  const addApplicantToAcc = (
    acc: StatAccumulator | undefined,
    appId: string,
    status: string
  ) => {
    if (!acc) return;
    if (status === 'draft') {
      acc.draftAppsSet.add(appId);
    } else if (status === 'needs_info') {
      acc.needsInfoAppsSet.add(appId);
    } else if (status === 'approved') {
      acc.approvedAppsSet.add(appId);
    } else if (status === 'rejected') {
      acc.rejectedAppsSet.add(appId);
    } else {
      acc.submittedAppsSet.add(appId);
    }
  };

  let totalSubmittedApplications = 0;
  let submittedOnlyApplications = 0;
  let needsInfoApplications = 0;
  let approvedApplications = 0;
  let rejectedApplications = 0;
  let draftApplications = 0;
  let schoolSubmittedApplications = 0;
  let quranSubmittedApplications = 0;
  let unclassifiedApplicationsCount = 0;

  for (const app of dataset.applications) {
    const appId = app.id;
    const status = app.status || 'submitted';

    if (status === 'draft') {
      draftApplications += 1;
    } else {
      totalSubmittedApplications += 1;
      if (app.track === 'quran') {
        quranSubmittedApplications += 1;
      } else {
        schoolSubmittedApplications += 1;
      }
      if (status === 'needs_info') needsInfoApplications += 1;
      else if (status === 'approved') approvedApplications += 1;
      else if (status === 'rejected') rejectedApplications += 1;
      else submittedOnlyApplications += 1;
    }

    const resolvedApp = resolveApplicationSpecializationsStrict(
      app,
      courseOptionsMap,
      schoolTripletToOptionMap,
      quranPairMap
    );

    if (status !== 'draft' && resolvedApp.unclassifiedReasons.length > 0) {
      unclassifiedApplicationsCount += 1;
    }

    const appSubjectIds = new Set<string>();
    const appStageIds = new Set<string>();
    const appCurriculumIds = new Set<string>();

    resolvedApp.schoolSpecs.forEach((opt) => {
      appSubjectIds.add(opt.subjectId);
      appStageIds.add(opt.stageId);
      appCurriculumIds.add(opt.curriculumId);
      addApplicantToAcc(courseOptionAccMap.get(opt.id), appId, status);
    });

    appSubjectIds.forEach((subjId) => addApplicantToAcc(subjectAccMap.get(subjId), appId, status));
    appStageIds.forEach((stgId) => addApplicantToAcc(stageAccMap.get(stgId), appId, status));
    appCurriculumIds.forEach((currId) =>
      addApplicantToAcc(curriculumAccMap.get(currId), appId, status)
    );

    const appQuranLevels = new Set<string>();
    const appQuranAges = new Set<string>();

    resolvedApp.quranSpecs.forEach((qSpec) => {
      appQuranLevels.add(qSpec.levelId);
      appQuranAges.add(qSpec.ageGroupId);
      addApplicantToAcc(quranPairAccMap.get(qSpec.pairKey), appId, status);
    });

    if (resolvedApp.quranSpecs.size > 0) {
      addApplicantToAcc(quranOverallAcc, appId, status);
      appQuranLevels.forEach((lId) => addApplicantToAcc(quranLevelAccMap.get(lId), appId, status));
      appQuranAges.forEach((aId) => addApplicantToAcc(quranAgeAccMap.get(aId), appId, status));
    }
  }

  // 3. Process Groups & Private Slots
  let globalActiveGroupsCount = 0;
  let globalTotalGroupsCount = 0;
  let unclassifiedGroupsCount = 0;

  const resolvedGroupsById = new Map<
    string,
    { raw: RawGroupRow; resolved: ResolvedSpecialization }
  >();

  for (const group of dataset.groups) {
    globalTotalGroupsCount += 1;
    const isGroupActiveAndPublished =
      Boolean(group.is_published) &&
      !Boolean(group.admin_suspended) &&
      (group.review_status === undefined || group.review_status === 'approved') &&
      (group.status === 'open' || group.status === 'in_progress');

    if (isGroupActiveAndPublished) {
      globalActiveGroupsCount += 1;
    }

    const resolved = resolveEntitySpecializationStrict(
      group,
      courseOptionsMap,
      quranPairMap,
      tutorLabelToSpecsMap
    );
    resolvedGroupsById.set(group.id, { raw: group, resolved });

    if (resolved.status === 'unclassified') {
      unclassifiedGroupsCount += 1;
      continue;
    }

    const recordGroupOnAcc = (acc: StatAccumulator | undefined) => {
      if (!acc) return;
      acc.totalGroupsCount += 1;
      if (isGroupActiveAndPublished) {
        acc.activeGroupsCount += 1;
      }
    };

    if (resolved.status === 'school') {
      recordGroupOnAcc(subjectAccMap.get(resolved.subjectId));
      recordGroupOnAcc(stageAccMap.get(resolved.stageId));
      recordGroupOnAcc(curriculumAccMap.get(resolved.curriculumId));
      recordGroupOnAcc(courseOptionAccMap.get(resolved.courseOptionId));
    } else {
      recordGroupOnAcc(quranOverallAcc);
      recordGroupOnAcc(quranLevelAccMap.get(resolved.levelId));
      recordGroupOnAcc(quranAgeAccMap.get(resolved.ageGroupId));
      recordGroupOnAcc(quranPairAccMap.get(resolved.pairKey));
    }
  }

  let globalAvailablePrivateSlotsCount = 0;
  let unclassifiedPrivateSlotsCount = 0;

  const resolvedSlotsById = new Map<
    string,
    { raw: RawPrivateSlotRow; resolved: ResolvedSpecialization }
  >();

  for (const slot of dataset.privateSlots) {
    const resolved = resolveEntitySpecializationStrict(
      slot,
      courseOptionsMap,
      quranPairMap,
      tutorLabelToSpecsMap
    );
    resolvedSlotsById.set(slot.id, { raw: slot, resolved });

    if (resolved.status === 'unclassified') {
      unclassifiedPrivateSlotsCount += 1;
    }

    const isAvailableFuture =
      Boolean(slot.is_available) &&
      !Boolean(slot.is_booked) &&
      !Boolean(slot.admin_suspended) &&
      slot.is_future !== false;

    if (!isAvailableFuture) continue;
    globalAvailablePrivateSlotsCount += 1;

    if (resolved.status === 'unclassified') continue;

    const recordSlotOnAcc = (acc: StatAccumulator | undefined) => {
      if (!acc) return;
      acc.availablePrivateSlotsCount += 1;
    };

    if (resolved.status === 'school') {
      recordSlotOnAcc(subjectAccMap.get(resolved.subjectId));
      recordSlotOnAcc(stageAccMap.get(resolved.stageId));
      recordSlotOnAcc(courseOptionAccMap.get(resolved.courseOptionId));
    } else {
      recordSlotOnAcc(quranOverallAcc);
      recordSlotOnAcc(quranLevelAccMap.get(resolved.levelId));
      recordSlotOnAcc(quranPairAccMap.get(resolved.pairKey));
    }
  }

  // 4. Process Private Bookings & Group Enrollments (Strictly separating confirmed, completed, pending, cancelled)
  let globalConfirmedPrivate = 0;
  let globalCompletedPrivate = 0;
  let globalPendingPrivate = 0;
  let globalCancelledPrivate = 0;

  let globalConfirmedGroup = 0;
  let globalCompletedGroup = 0;
  let globalPendingGroup = 0;
  let globalCancelledGroup = 0;

  let unclassifiedPrivateBookingsCount = 0;
  let unclassifiedGroupEnrollmentsCount = 0;

  const recordSubscriptionOnAcc = (
    acc: StatAccumulator | undefined,
    kind: 'private' | 'group',
    status: string
  ) => {
    if (!acc) return;
    if (kind === 'private') {
      if (status === 'confirmed') acc.confirmedPrivateBookings += 1;
      else if (status === 'completed') acc.completedPrivateBookings += 1;
      else if (status === 'pending') acc.pendingPrivateBookings += 1;
      else if (status === 'cancelled') acc.cancelledPrivateBookings += 1;
    } else {
      if (status === 'confirmed') acc.confirmedGroupEnrollments += 1;
      else if (status === 'completed') acc.completedGroupEnrollments += 1;
      else if (status === 'pending') acc.pendingGroupEnrollments += 1;
      else if (status === 'cancelled') acc.cancelledGroupEnrollments += 1;
    }
  };

  for (const b of dataset.privateBookings) {
    const status = b.status || 'pending';
    if (status === 'confirmed') globalConfirmedPrivate += 1;
    else if (status === 'completed') globalCompletedPrivate += 1;
    else if (status === 'pending') globalPendingPrivate += 1;
    else if (status === 'cancelled') globalCancelledPrivate += 1;

    let resolved: ResolvedSpecialization;
    if (b.slot_id && resolvedSlotsById.has(b.slot_id)) {
      const slotEntry = resolvedSlotsById.get(b.slot_id)!;
      if (slotEntry.raw.tutor_id !== b.tutor_id) {
        resolved = {
          status: 'unclassified',
          reason: 'تعارض في معرف المعلم بين الحجز الخاص والموعد المرتبط به',
        };
      } else {
        resolved = slotEntry.resolved;
      }
    } else if (
      b.offering_course_option_id ||
      b.quran_age_group_id ||
      b.quran_level_id ||
      b.specialization_label
    ) {
      resolved = resolveEntitySpecializationStrict(
        b,
        courseOptionsMap,
        quranPairMap,
        tutorLabelToSpecsMap
      );
    } else {
      resolved = {
        status: 'unclassified',
        reason: 'الموعد المرتبط بالحجز الخاص غير موجود أو يفتقر إلى التخصص المرجعي',
      };
    }

    if (resolved.status === 'unclassified') {
      unclassifiedPrivateBookingsCount += 1;
      continue;
    }

    if (resolved.status === 'school') {
      recordSubscriptionOnAcc(subjectAccMap.get(resolved.subjectId), 'private', status);
      recordSubscriptionOnAcc(stageAccMap.get(resolved.stageId), 'private', status);
      recordSubscriptionOnAcc(curriculumAccMap.get(resolved.curriculumId), 'private', status);
      recordSubscriptionOnAcc(courseOptionAccMap.get(resolved.courseOptionId), 'private', status);
    } else {
      recordSubscriptionOnAcc(quranOverallAcc, 'private', status);
      recordSubscriptionOnAcc(quranLevelAccMap.get(resolved.levelId), 'private', status);
      recordSubscriptionOnAcc(quranAgeAccMap.get(resolved.ageGroupId), 'private', status);
      recordSubscriptionOnAcc(quranPairAccMap.get(resolved.pairKey), 'private', status);
    }
  }

  for (const ge of dataset.groupEnrollments) {
    const status = ge.status || 'pending';
    if (status === 'confirmed') globalConfirmedGroup += 1;
    else if (status === 'completed') globalCompletedGroup += 1;
    else if (status === 'pending') globalPendingGroup += 1;
    else if (status === 'cancelled') globalCancelledGroup += 1;

    const groupEntry = resolvedGroupsById.get(ge.group_id);
    let resolved: ResolvedSpecialization;
    if (!groupEntry) {
      resolved = {
        status: 'unclassified',
        reason: 'المجموعة التعليمية المرتبطة بالاشتراك غير موجودة',
      };
    } else if (groupEntry.raw.tutor_id !== ge.tutor_id) {
      resolved = {
        status: 'unclassified',
        reason: 'تعارض في معرف المعلم بين اشتراك المجموعة والمجموعة المرتبطة به',
      };
    } else {
      resolved = groupEntry.resolved;
    }

    if (resolved.status === 'unclassified') {
      unclassifiedGroupEnrollmentsCount += 1;
      continue;
    }

    if (resolved.status === 'school') {
      recordSubscriptionOnAcc(subjectAccMap.get(resolved.subjectId), 'group', status);
      recordSubscriptionOnAcc(stageAccMap.get(resolved.stageId), 'group', status);
      recordSubscriptionOnAcc(curriculumAccMap.get(resolved.curriculumId), 'group', status);
      recordSubscriptionOnAcc(courseOptionAccMap.get(resolved.courseOptionId), 'group', status);
    } else {
      recordSubscriptionOnAcc(quranOverallAcc, 'group', status);
      recordSubscriptionOnAcc(quranLevelAccMap.get(resolved.levelId), 'group', status);
      recordSubscriptionOnAcc(quranAgeAccMap.get(resolved.ageGroupId), 'group', status);
      recordSubscriptionOnAcc(quranPairAccMap.get(resolved.pairKey), 'group', status);
    }
  }

  // 5. Build Output Structures
  const subjectTotalCourseOptionsCount = new Map<string, number>();
  courseOptionsMap.forEach((opt) => {
    subjectTotalCourseOptionsCount.set(
      opt.subjectId,
      (subjectTotalCourseOptionsCount.get(opt.subjectId) || 0) + 1
    );
  });

  const buildSubjectStat = (
    id: string,
    name: string,
    englishName: string | undefined,
    category: 'core' | 'languages' | 'sciences' | 'social' | 'quran',
    track: 'school' | 'quran',
    isActive: boolean,
    acc: StatAccumulator,
    totalOptionsCount: number
  ): AdminSubjectStatItem => {
    const submittedApplicants = acc.submittedAppsSet.size;
    const needsInfoApplicants = acc.needsInfoAppsSet.size;
    const approvedApplicants = acc.approvedAppsSet.size;
    const rejectedApplicants = acc.rejectedAppsSet.size;
    const draftApplicants = acc.draftAppsSet.size;
    const pendingApplicants = submittedApplicants + needsInfoApplicants;
    const totalApplicants = pendingApplicants + approvedApplicants + rejectedApplicants;

    const confirmedSubscriptions = acc.confirmedPrivateBookings + acc.confirmedGroupEnrollments;
    const completedSubscriptions = acc.completedPrivateBookings + acc.completedGroupEnrollments;
    const pendingSubscriptions = acc.pendingPrivateBookings + acc.pendingGroupEnrollments;
    const cancelledSubscriptions = acc.cancelledPrivateBookings + acc.cancelledGroupEnrollments;

    return {
      subjectId: id,
      subjectName: name,
      englishName,
      category,
      track,
      isActive,
      totalTutors: acc.tutorsSet.size,
      publishedTutors: acc.publishedTutorsSet.size,
      unpublishedTutors: acc.unpublishedTutorsSet.size,
      approvedOfferingsCount: acc.offeringsCount,
      coveredCourseOptionsCount: acc.coveredCourseOptionsSet.size,
      publishedCoveredCourseOptionsCount: acc.publishedCoveredCourseOptionsSet.size,
      totalCourseOptionsCount: totalOptionsCount,
      totalApplicants,
      pendingApplicants,
      submittedApplicants,
      needsInfoApplicants,
      approvedApplicants,
      rejectedApplicants,
      draftApplicants,
      confirmedPrivateBookings: acc.confirmedPrivateBookings,
      completedPrivateBookings: acc.completedPrivateBookings,
      pendingPrivateBookings: acc.pendingPrivateBookings,
      cancelledPrivateBookings: acc.cancelledPrivateBookings,
      totalPrivateBookings:
        acc.confirmedPrivateBookings +
        acc.completedPrivateBookings +
        acc.pendingPrivateBookings +
        acc.cancelledPrivateBookings,
      confirmedGroupEnrollments: acc.confirmedGroupEnrollments,
      completedGroupEnrollments: acc.completedGroupEnrollments,
      pendingGroupEnrollments: acc.pendingGroupEnrollments,
      cancelledGroupEnrollments: acc.cancelledGroupEnrollments,
      totalGroupEnrollments:
        acc.confirmedGroupEnrollments +
        acc.completedGroupEnrollments +
        acc.pendingGroupEnrollments +
        acc.cancelledGroupEnrollments,
      confirmedSubscriptions,
      completedSubscriptions,
      pendingSubscriptions,
      cancelledSubscriptions,
      uniqueConfirmedStudents: null,
      activeGroupsCount: acc.activeGroupsCount,
      totalGroupsCount: acc.totalGroupsCount,
      availablePrivateSlotsCount: acc.availablePrivateSlotsCount,
    };
  };

  const subjectsStats: AdminSubjectStatItem[] = sortedSubjects.map((s) =>
    buildSubjectStat(
      s.id,
      s.name,
      s.english_name || undefined,
      s.category,
      'school',
      Boolean(s.is_active),
      subjectAccMap.get(s.id) || createEmptyAcc(),
      subjectTotalCourseOptionsCount.get(s.id) || 0
    )
  );

  const quranSummary: AdminSubjectStatItem = buildSubjectStat(
    'quran_track',
    'القرآن الكريم والتأسيس (نور البيان والتجويد)',
    'Quran & Foundation',
    'quran',
    'quran',
    true,
    quranOverallAcc,
    quranPairMap.size
  );

  const quranLevelsStats: AdminQuranProgramStatItem[] = sortedQuranLevels.map((ql) => {
    const acc = quranLevelAccMap.get(ql.id) || createEmptyAcc();
    const submittedApplicants = acc.submittedAppsSet.size;
    const needsInfoApplicants = acc.needsInfoAppsSet.size;
    const approvedApplicants = acc.approvedAppsSet.size;
    const rejectedApplicants = acc.rejectedAppsSet.size;
    const pendingApplicants = submittedApplicants + needsInfoApplicants;

    return {
      levelId: ql.id,
      levelName: ql.name,
      description: ql.description || '',
      isActive: Boolean(ql.is_active),
      totalTutors: acc.tutorsSet.size,
      publishedTutors: acc.publishedTutorsSet.size,
      unpublishedTutors: acc.unpublishedTutorsSet.size,
      totalApplicants: pendingApplicants + approvedApplicants + rejectedApplicants,
      pendingApplicants,
      submittedApplicants,
      needsInfoApplicants,
      approvedApplicants,
      rejectedApplicants,
      draftApplicants: acc.draftAppsSet.size,
      confirmedPrivateBookings: acc.confirmedPrivateBookings,
      completedPrivateBookings: acc.completedPrivateBookings,
      pendingPrivateBookings: acc.pendingPrivateBookings,
      cancelledPrivateBookings: acc.cancelledPrivateBookings,
      confirmedGroupEnrollments: acc.confirmedGroupEnrollments,
      completedGroupEnrollments: acc.completedGroupEnrollments,
      pendingGroupEnrollments: acc.pendingGroupEnrollments,
      cancelledGroupEnrollments: acc.cancelledGroupEnrollments,
      confirmedSubscriptions: acc.confirmedPrivateBookings + acc.confirmedGroupEnrollments,
      completedSubscriptions: acc.completedPrivateBookings + acc.completedGroupEnrollments,
      pendingSubscriptions: acc.pendingPrivateBookings + acc.pendingGroupEnrollments,
      cancelledSubscriptions: acc.cancelledPrivateBookings + acc.cancelledGroupEnrollments,
      uniqueConfirmedStudents: null,
      activeGroupsCount: acc.activeGroupsCount,
      availablePrivateSlotsCount: acc.availablePrivateSlotsCount,
    };
  });

  const quranAgeGroupsStats: AdminQuranAgeGroupStatItem[] = sortedQuranAgeGroups.map((qa) => {
    const acc = quranAgeAccMap.get(qa.id) || createEmptyAcc();
    const pendingApplicants = acc.submittedAppsSet.size + acc.needsInfoAppsSet.size;

    return {
      ageGroupId: qa.id,
      ageGroupName: qa.name,
      ageRange: qa.age_range || '',
      isActive: Boolean(qa.is_active),
      totalTutors: acc.tutorsSet.size,
      publishedTutors: acc.publishedTutorsSet.size,
      unpublishedTutors: acc.unpublishedTutorsSet.size,
      totalApplicants: pendingApplicants + acc.approvedAppsSet.size + acc.rejectedAppsSet.size,
      pendingApplicants,
      approvedApplicants: acc.approvedAppsSet.size,
      rejectedApplicants: acc.rejectedAppsSet.size,
      confirmedSubscriptions: acc.confirmedPrivateBookings + acc.confirmedGroupEnrollments,
      completedSubscriptions: acc.completedPrivateBookings + acc.completedGroupEnrollments,
      pendingSubscriptions: acc.pendingPrivateBookings + acc.pendingGroupEnrollments,
      cancelledSubscriptions: acc.cancelledPrivateBookings + acc.cancelledGroupEnrollments,
      uniqueConfirmedStudents: null,
    };
  });

  const stagesStats: AdminStageStatItem[] = sortedStages.map((st) => {
    const acc = stageAccMap.get(st.id) || createEmptyAcc();
    const pendingApplicants = acc.submittedAppsSet.size + acc.needsInfoAppsSet.size;

    return {
      stageId: st.id,
      stageName: st.name,
      gradesDesc: st.grades_desc || '',
      isActive: Boolean(st.is_active),
      totalTutors: acc.tutorsSet.size,
      publishedTutors: acc.publishedTutorsSet.size,
      unpublishedTutors: acc.unpublishedTutorsSet.size,
      totalApplicants: pendingApplicants + acc.approvedAppsSet.size + acc.rejectedAppsSet.size,
      pendingApplicants,
      approvedApplicants: acc.approvedAppsSet.size,
      rejectedApplicants: acc.rejectedAppsSet.size,
      confirmedSubscriptions: acc.confirmedPrivateBookings + acc.confirmedGroupEnrollments,
      completedSubscriptions: acc.completedPrivateBookings + acc.completedGroupEnrollments,
      pendingSubscriptions: acc.pendingPrivateBookings + acc.pendingGroupEnrollments,
      cancelledSubscriptions: acc.cancelledPrivateBookings + acc.cancelledGroupEnrollments,
      uniqueConfirmedStudents: null,
      activeGroupsCount: acc.activeGroupsCount,
      availablePrivateSlotsCount: acc.availablePrivateSlotsCount,
    };
  });

  const curriculaStats: AdminCurriculumStatItem[] = sortedCurricula.map((cr) => {
    const acc = curriculumAccMap.get(cr.id) || createEmptyAcc();
    const pendingApplicants = acc.submittedAppsSet.size + acc.needsInfoAppsSet.size;

    return {
      curriculumId: cr.id,
      curriculumName: cr.name,
      isActive: Boolean(cr.is_active),
      totalTutors: acc.tutorsSet.size,
      publishedTutors: acc.publishedTutorsSet.size,
      unpublishedTutors: acc.unpublishedTutorsSet.size,
      totalApplicants: pendingApplicants + acc.approvedAppsSet.size + acc.rejectedAppsSet.size,
      pendingApplicants,
      approvedApplicants: acc.approvedAppsSet.size,
      rejectedApplicants: acc.rejectedAppsSet.size,
      confirmedSubscriptions: acc.confirmedPrivateBookings + acc.confirmedGroupEnrollments,
      completedSubscriptions: acc.completedPrivateBookings + acc.completedGroupEnrollments,
      pendingSubscriptions: acc.pendingPrivateBookings + acc.pendingGroupEnrollments,
      cancelledSubscriptions: acc.cancelledPrivateBookings + acc.cancelledGroupEnrollments,
      uniqueConfirmedStudents: null,
    };
  });

  const detailedSpecializations: AdminDetailedSpecializationStatItem[] = [];

  const sortedCourseOptions = Array.from(courseOptionsMap.values()).sort(
    (a, b) =>
      a.subjectOrder - b.subjectOrder ||
      a.gradeOrder - b.gradeOrder ||
      a.curriculumOrder - b.curriculumOrder ||
      a.id.localeCompare(b.id)
  );

  for (const opt of sortedCourseOptions) {
    const acc = courseOptionAccMap.get(opt.id) || createEmptyAcc();
    const submittedApplicants = acc.submittedAppsSet.size;
    const needsInfoApplicants = acc.needsInfoAppsSet.size;
    const approvedApplicants = acc.approvedAppsSet.size;
    const rejectedApplicants = acc.rejectedAppsSet.size;
    const pendingApplicants = submittedApplicants + needsInfoApplicants;

    detailedSpecializations.push({
      id: opt.id,
      track: 'school',
      label: opt.canonicalLabel,
      isActive: opt.isActive,
      stageId: opt.stageId,
      stageName: opt.stageName,
      gradeId: opt.gradeId,
      gradeName: opt.gradeName,
      subjectId: opt.subjectId,
      subjectName: opt.subjectName,
      curriculumId: opt.curriculumId,
      curriculumName: opt.curriculumName,
      totalTutors: acc.tutorsSet.size,
      publishedTutors: acc.publishedTutorsSet.size,
      unpublishedTutors: acc.unpublishedTutorsSet.size,
      totalApplicants: pendingApplicants + approvedApplicants + rejectedApplicants,
      pendingApplicants,
      submittedApplicants,
      needsInfoApplicants,
      approvedApplicants,
      rejectedApplicants,
      draftApplicants: acc.draftAppsSet.size,
      confirmedPrivateBookings: acc.confirmedPrivateBookings,
      completedPrivateBookings: acc.completedPrivateBookings,
      pendingPrivateBookings: acc.pendingPrivateBookings,
      cancelledPrivateBookings: acc.cancelledPrivateBookings,
      confirmedGroupEnrollments: acc.confirmedGroupEnrollments,
      completedGroupEnrollments: acc.completedGroupEnrollments,
      pendingGroupEnrollments: acc.pendingGroupEnrollments,
      cancelledGroupEnrollments: acc.cancelledGroupEnrollments,
      confirmedSubscriptions: acc.confirmedPrivateBookings + acc.confirmedGroupEnrollments,
      completedSubscriptions: acc.completedPrivateBookings + acc.completedGroupEnrollments,
      pendingSubscriptions: acc.pendingPrivateBookings + acc.pendingGroupEnrollments,
      cancelledSubscriptions: acc.cancelledPrivateBookings + acc.cancelledGroupEnrollments,
      uniqueConfirmedStudents: null,
      activeGroupsCount: acc.activeGroupsCount,
      availablePrivateSlotsCount: acc.availablePrivateSlotsCount,
    });
  }

  for (const qSpec of quranPairMap.values()) {
    const acc = quranPairAccMap.get(qSpec.pairKey) || createEmptyAcc();
    const submittedApplicants = acc.submittedAppsSet.size;
    const needsInfoApplicants = acc.needsInfoAppsSet.size;
    const approvedApplicants = acc.approvedAppsSet.size;
    const rejectedApplicants = acc.rejectedAppsSet.size;
    const pendingApplicants = submittedApplicants + needsInfoApplicants;

    detailedSpecializations.push({
      id: qSpec.id,
      track: 'quran',
      label: qSpec.canonicalLabel,
      isActive: qSpec.isActive,
      levelId: qSpec.levelId,
      levelName: qSpec.levelName,
      ageGroupId: qSpec.ageGroupId,
      ageGroupName: qSpec.ageGroupName,
      totalTutors: acc.tutorsSet.size,
      publishedTutors: acc.publishedTutorsSet.size,
      unpublishedTutors: acc.unpublishedTutorsSet.size,
      totalApplicants: pendingApplicants + approvedApplicants + rejectedApplicants,
      pendingApplicants,
      submittedApplicants,
      needsInfoApplicants,
      approvedApplicants,
      rejectedApplicants,
      draftApplicants: acc.draftAppsSet.size,
      confirmedPrivateBookings: acc.confirmedPrivateBookings,
      completedPrivateBookings: acc.completedPrivateBookings,
      pendingPrivateBookings: acc.pendingPrivateBookings,
      cancelledPrivateBookings: acc.cancelledPrivateBookings,
      confirmedGroupEnrollments: acc.confirmedGroupEnrollments,
      completedGroupEnrollments: acc.completedGroupEnrollments,
      pendingGroupEnrollments: acc.pendingGroupEnrollments,
      cancelledGroupEnrollments: acc.cancelledGroupEnrollments,
      confirmedSubscriptions: acc.confirmedPrivateBookings + acc.confirmedGroupEnrollments,
      completedSubscriptions: acc.completedPrivateBookings + acc.completedGroupEnrollments,
      pendingSubscriptions: acc.pendingPrivateBookings + acc.pendingGroupEnrollments,
      cancelledSubscriptions: acc.cancelledPrivateBookings + acc.cancelledGroupEnrollments,
      uniqueConfirmedStudents: null,
      activeGroupsCount: acc.activeGroupsCount,
      availablePrivateSlotsCount: acc.availablePrivateSlotsCount,
    });
  }

  const publishedTutorsCount = dataset.tutors.filter((t) => Boolean(t.is_published)).length;
  const unassignedTutorsCount = dataset.tutors.filter(
    (t) => !schoolTutorsSet.has(t.id) && !quranTutorsSet.has(t.id)
  ).length;

  const allSubjectsWithQuran = [...subjectsStats, quranSummary];
  const subjectsWithoutPublishedTutors = allSubjectsWithQuran.filter(
    (s) => s.publishedTutors === 0
  ).length;
  const subjectsWithPendingApplicants = allSubjectsWithQuran.filter(
    (s) => s.pendingApplicants > 0
  ).length;
  const specializationsWithoutPublishedTutors = detailedSpecializations.filter(
    (sp) => sp.publishedTutors === 0
  ).length;

  const confirmedSubscriptions = globalConfirmedPrivate + globalConfirmedGroup;
  const completedSubscriptions = globalCompletedPrivate + globalCompletedGroup;
  const pendingSubscriptions = globalPendingPrivate + globalPendingGroup;
  const cancelledSubscriptions = globalCancelledPrivate + globalCancelledGroup;
  const unmappedBookingsCount = unclassifiedPrivateBookingsCount + unclassifiedGroupEnrollmentsCount;

  const totalUnclassifiedCount =
    unassignedTutorsCount +
    unclassifiedTutorOfferingsCount +
    unclassifiedApplicationsCount +
    unclassifiedGroupsCount +
    unclassifiedPrivateSlotsCount +
    unclassifiedPrivateBookingsCount +
    unclassifiedGroupEnrollmentsCount;

  return {
    overview: {
      totalTutors: dataset.tutors.length,
      publishedTutors: publishedTutorsCount,
      unpublishedTutors: dataset.tutors.length - publishedTutorsCount,
      schoolTutorsCount: schoolTutorsSet.size,
      quranTutorsCount: quranTutorsSet.size,
      unassignedTutorsCount,
      totalSubmittedApplications,
      totalAllApplications: dataset.applications.length,
      pendingApplications: submittedOnlyApplications + needsInfoApplications,
      submittedOnlyApplications,
      needsInfoApplications,
      approvedApplications,
      rejectedApplications,
      draftApplications,
      schoolSubmittedApplications,
      quranSubmittedApplications,
      confirmedSubscriptions,
      completedSubscriptions,
      pendingSubscriptions,
      cancelledSubscriptions,
      confirmedPrivateBookings: globalConfirmedPrivate,
      completedPrivateBookings: globalCompletedPrivate,
      pendingPrivateBookings: globalPendingPrivate,
      cancelledPrivateBookings: globalCancelledPrivate,
      confirmedGroupEnrollments: globalConfirmedGroup,
      completedGroupEnrollments: globalCompletedGroup,
      pendingGroupEnrollments: globalPendingGroup,
      cancelledGroupEnrollments: globalCancelledGroup,
      uniqueConfirmedStudents: null,
      uniqueStudentsAvailable: false,
      uniqueStudentsUnavailableReason:
        'غير متاح حاليًا لعدم وجود معرف هوية طالب ثابت وموثوق مرتبط بالسجلات',
      activeGroupsCount: globalActiveGroupsCount,
      totalGroupsCount: globalTotalGroupsCount,
      availablePrivateSlotsCount: globalAvailablePrivateSlotsCount,
      availableTrialSlotsCount: Number(dataset.trialSummary?.available_future_slots || 0),
      bookedTrialSlotsCount: Number(dataset.trialSummary?.booked_slots || 0),
      subjectsWithoutPublishedTutors,
      specializationsWithoutPublishedTutors,
      subjectsWithPendingApplicants,
      unmappedBookingsCount,
      unclassifiedSummary: {
        unassignedTutorsCount,
        unclassifiedTutorOfferingsCount,
        unclassifiedApplicationsCount,
        unclassifiedGroupsCount,
        unclassifiedPrivateSlotsCount,
        unclassifiedPrivateBookingsCount,
        unclassifiedGroupEnrollmentsCount,
        totalUnclassifiedCount,
      },
    },
    subjectsStats,
    quranSummary,
    quranLevelsStats,
    quranAgeGroupsStats,
    stagesStats,
    curriculaStats,
    detailedSpecializations,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Paginates drilldown records from a dataset (matching `admin_get_statistics_drilldown`).
 */
export function computeStatisticsDrilldownFromDataset(
  dataset: RawStatisticsDataset,
  req: AdminStatisticsDrilldownRequest
): AdminStatisticsDrilldownResponse {
  const subjectsMap = new Map<string, RawRefSubject>(dataset.subjects.map((s) => [s.id, s]));
  const stagesMap = new Map<string, RawRefStage>(dataset.stages.map((s) => [s.id, s]));
  const gradesMap = new Map<string, RawRefGrade>(dataset.grades.map((g) => [g.id, g]));
  const curriculaMap = new Map<string, RawRefCurriculum>(dataset.curricula.map((c) => [c.id, c]));
  const tutorsMap = new Map<string, RawTutorRow>(dataset.tutors.map((t) => [t.id, t]));

  const courseOptionsMap = new Map<string, EnrichedCourseOption>();
  const schoolTripletToOptionMap = new Map<string, EnrichedCourseOption>();

  for (const opt of dataset.courseOptions) {
    const sub = subjectsMap.get(opt.subject_id);
    const grade = gradesMap.get(opt.grade_id);
    const stage = grade ? stagesMap.get(grade.stage_id) : undefined;
    const curr = curriculaMap.get(opt.curriculum_id);
    if (!sub || !grade || !curr) continue;

    const canonicalLabel = `${sub.name} - ${grade.name} (${curr.name})`.trim();
    const enriched: EnrichedCourseOption = {
      id: opt.id,
      gradeId: opt.grade_id,
      gradeName: grade.name,
      stageId: grade.stage_id,
      stageName: stage?.name || grade.stage_id,
      subjectId: opt.subject_id,
      subjectName: sub.name,
      curriculumId: opt.curriculum_id,
      curriculumName: curr.name,
      canonicalLabel,
      isActive: Boolean(
        opt.is_active &&
          sub.is_active &&
          grade.is_active &&
          (stage ? stage.is_active : true) &&
          curr.is_active
      ),
      subjectOrder: sub.display_order ?? 1,
      gradeOrder: grade.display_order ?? 1,
      curriculumOrder: curr.display_order ?? 1,
    };
    courseOptionsMap.set(opt.id, enriched);
    schoolTripletToOptionMap.set(`${opt.grade_id}|${opt.subject_id}|${opt.curriculum_id}`, enriched);
  }

  const quranPairMap = new Map<string, EnrichedQuranSpec>();
  for (const ql of dataset.quranLevels) {
    for (const qag of dataset.quranAgeGroups) {
      const pairKey = `${ql.id}|${qag.id}`;
      quranPairMap.set(pairKey, {
        id: `quran:${ql.id}:${qag.id}`,
        pairKey,
        levelId: ql.id,
        levelName: ql.name,
        ageGroupId: qag.id,
        ageGroupName: qag.name,
        canonicalLabel: `قرآن وتأسيس: ${ql.name} (${qag.name})`.trim(),
        isActive: Boolean(ql.is_active && qag.is_active),
        levelOrder: ql.display_order ?? 1,
        ageOrder: qag.display_order ?? 1,
      });
    }
  }

  const tutorLabelToSpecsMap = new Map<string, ResolvedSpecialization[]>();
  const schoolTutorsSet = new Set<string>();
  const quranTutorsSet = new Set<string>();

  for (const row of dataset.schoolOfferings) {
    if (!tutorsMap.has(row.tutor_id)) continue;
    const opt = courseOptionsMap.get(row.course_option_id ?? '');
    if (!opt) continue;
    schoolTutorsSet.add(row.tutor_id);
    const key = `${row.tutor_id}::${opt.canonicalLabel}`;
    const list = tutorLabelToSpecsMap.get(key) ?? [];
    list.push({
      status: 'school',
      courseOptionId: opt.id,
      subjectId: opt.subjectId,
      gradeId: opt.gradeId,
      stageId: opt.stageId,
      curriculumId: opt.curriculumId,
      canonicalLabel: opt.canonicalLabel,
    });
    tutorLabelToSpecsMap.set(key, list);
  }

  for (const row of dataset.quranOfferings) {
    if (!tutorsMap.has(row.tutor_id)) continue;
    const qSpec = quranPairMap.get(`${row.level_id ?? ''}|${row.age_group_id ?? ''}`);
    if (!qSpec) continue;
    quranTutorsSet.add(row.tutor_id);
    const key = `${row.tutor_id}::${qSpec.canonicalLabel}`;
    const list = tutorLabelToSpecsMap.get(key) ?? [];
    list.push({
      status: 'quran',
      pairKey: qSpec.pairKey,
      levelId: qSpec.levelId,
      ageGroupId: qSpec.ageGroupId,
      canonicalLabel: qSpec.canonicalLabel,
    });
    tutorLabelToSpecsMap.set(key, list);
  }

  const page = Math.max(1, req.page || 1);
  const pageSize = Math.max(1, Math.min(100, req.pageSize || 20));
  const startIdx = (page - 1) * pageSize;

  const isGlobalScope =
    (!req.track || req.track === 'all') &&
    !req.subjectId &&
    !req.stageId &&
    !req.gradeId &&
    !req.curriculumId &&
    !req.courseOptionId &&
    !req.quranLevelId &&
    !req.quranAgeGroupId;

  const isQuranScope =
    req.track === 'quran' ||
    req.subjectId === 'quran_track' ||
    Boolean(req.quranLevelId) ||
    Boolean(req.quranAgeGroupId);

  const matchesSpec = (res: ResolvedSpecialization): boolean => {
    if (res.status === 'unclassified') return false;
    if (isGlobalScope) return true;
    if (isQuranScope) {
      if (res.status !== 'quran') return false;
      if (req.quranLevelId && res.levelId !== req.quranLevelId) return false;
      if (req.quranAgeGroupId && res.ageGroupId !== req.quranAgeGroupId) return false;
      return true;
    }
    if (res.status !== 'school') return false;
    if (req.courseOptionId && res.courseOptionId !== req.courseOptionId) return false;
    if (req.subjectId && res.subjectId !== req.subjectId) return false;
    if (req.stageId && res.stageId !== req.stageId) return false;
    if (req.gradeId && res.gradeId !== req.gradeId) return false;
    if (req.curriculumId && res.curriculumId !== req.curriculumId) return false;
    return true;
  };

  if (req.entityType === 'tutors') {
    const matchedTutorIds = new Set<string>();
    if (isGlobalScope) {
      dataset.tutors.forEach((t) => matchedTutorIds.add(t.id));
    } else if (isQuranScope) {
      for (const qo of dataset.quranOfferings) {
        const qSpec = quranPairMap.get(`${qo.level_id ?? ''}|${qo.age_group_id ?? ''}`);
        if (!qSpec) continue;
        if (req.quranLevelId && qSpec.levelId !== req.quranLevelId) continue;
        if (req.quranAgeGroupId && qSpec.ageGroupId !== req.quranAgeGroupId) continue;
        matchedTutorIds.add(qo.tutor_id);
      }
    } else {
      for (const so of dataset.schoolOfferings) {
        const opt = courseOptionsMap.get(so.course_option_id ?? '');
        if (!opt) continue;
        if (req.courseOptionId && opt.id !== req.courseOptionId) continue;
        if (req.subjectId && opt.subjectId !== req.subjectId) continue;
        if (req.stageId && opt.stageId !== req.stageId) continue;
        if (req.gradeId && opt.gradeId !== req.gradeId) continue;
        if (req.curriculumId && opt.curriculumId !== req.curriculumId) continue;
        matchedTutorIds.add(so.tutor_id);
      }
    }

    const tutorsList: AdminStatTutorRef[] = Array.from(matchedTutorIds)
      .map((id) => tutorsMap.get(id))
      .filter((t): t is RawTutorRow => Boolean(t))
      .filter((t) => {
        if (req.statusFilter === 'published') return Boolean(t.is_published);
        if (req.statusFilter === 'unpublished') return !Boolean(t.is_published);
        return true;
      })
      .map((t) => ({
        id: t.id,
        name: t.name,
        honorific: t.honorific || 'أ.',
        headline: t.headline,
        isPublished: Boolean(t.is_published),
        createdAt: t.created_at,
      }))
      .sort(
        (a, b) =>
          Number(b.isPublished) - Number(a.isPublished) || a.name.localeCompare(b.name, 'ar')
      );

    return {
      entityType: 'tutors',
      totalCount: tutorsList.length,
      page,
      pageSize,
      tutors: tutorsList.slice(startIdx, startIdx + pageSize),
    };
  }

  if (req.entityType === 'applicants') {
    const matchedApps: AdminStatApplicantRef[] = [];
    for (const app of dataset.applications) {
      const status = app.status || 'submitted';
      if (status === 'draft') continue;
      if (req.statusFilter === 'pending') {
        if (status === 'approved' || status === 'rejected') continue;
      } else if (req.statusFilter && req.statusFilter !== 'all' && status !== req.statusFilter) {
        continue;
      }

      if (!isGlobalScope) {
        const resolvedApp = resolveApplicationSpecializationsStrict(
          app,
          courseOptionsMap,
          schoolTripletToOptionMap,
          quranPairMap
        );
        let hasMatch = false;
        if (isQuranScope) {
          for (const qSpec of resolvedApp.quranSpecs.values()) {
            if (req.quranLevelId && qSpec.levelId !== req.quranLevelId) continue;
            if (req.quranAgeGroupId && qSpec.ageGroupId !== req.quranAgeGroupId) continue;
            hasMatch = true;
            break;
          }
        } else {
          for (const opt of resolvedApp.schoolSpecs.values()) {
            if (req.courseOptionId && opt.id !== req.courseOptionId) continue;
            if (req.subjectId && opt.subjectId !== req.subjectId) continue;
            if (req.stageId && opt.stageId !== req.stageId) continue;
            if (req.gradeId && opt.gradeId !== req.gradeId) continue;
            if (req.curriculumId && opt.curriculumId !== req.curriculumId) continue;
            hasMatch = true;
            break;
          }
        }
        if (!hasMatch) continue;
      }

      matchedApps.push({
        id: app.id,
        referenceCode: app.reference_code,
        fullName: app.full_name,
        phone: app.phone,
        track: app.track,
        status,
        createdAt: app.created_at,
      });
    }

    return {
      entityType: 'applicants',
      totalCount: matchedApps.length,
      page,
      pageSize,
      applicants: matchedApps.slice(startIdx, startIdx + pageSize),
    };
  }

  if (req.entityType === 'subscriptions') {
    const resolvedSlotsById = new Map<
      string,
      { raw: RawPrivateSlotRow; resolved: ResolvedSpecialization }
    >();
    for (const slot of dataset.privateSlots) {
      resolvedSlotsById.set(slot.id, {
        raw: slot,
        resolved: resolveEntitySpecializationStrict(
          slot,
          courseOptionsMap,
          quranPairMap,
          tutorLabelToSpecsMap
        ),
      });
    }

    const resolvedGroupsById = new Map<
      string,
      { raw: RawGroupRow; resolved: ResolvedSpecialization }
    >();
    for (const g of dataset.groups) {
      resolvedGroupsById.set(g.id, {
        raw: g,
        resolved: resolveEntitySpecializationStrict(
          g,
          courseOptionsMap,
          quranPairMap,
          tutorLabelToSpecsMap
        ),
      });
    }

    const matchedSubs: AdminStatSubscriptionRef[] = [];

    for (const b of dataset.privateBookings) {
      if (req.statusFilter && req.statusFilter !== 'all' && b.status !== req.statusFilter) continue;
      let resolved: ResolvedSpecialization;
      let specLabel = b.specialization_label ?? '';
      if (b.slot_id && resolvedSlotsById.has(b.slot_id)) {
        const se = resolvedSlotsById.get(b.slot_id)!;
        specLabel = specLabel || se.raw.specialization_label || '';
        resolved =
          se.raw.tutor_id === b.tutor_id
            ? se.resolved
            : { status: 'unclassified', reason: 'تعارض المعلم' };
      } else {
        resolved = resolveEntitySpecializationStrict(
          b,
          courseOptionsMap,
          quranPairMap,
          tutorLabelToSpecsMap
        );
      }

      if (!isGlobalScope && !matchesSpec(resolved)) continue;
      const tutor = tutorsMap.get(b.tutor_id);
      matchedSubs.push({
        id: b.id,
        kind: 'private',
        studentName: b.student_name,
        tutorId: b.tutor_id,
        tutorName: tutor ? `${tutor.honorific || 'أ.'} ${tutor.name}` : b.tutor_id,
        specializationLabel: specLabel,
        groupTitle: null,
        status: b.status,
        createdAt: b.created_at,
      });
    }

    for (const ge of dataset.groupEnrollments) {
      if (req.statusFilter && req.statusFilter !== 'all' && ge.status !== req.statusFilter) continue;
      const geGroup = resolvedGroupsById.get(ge.group_id);
      const resolved: ResolvedSpecialization =
        geGroup && geGroup.raw.tutor_id === ge.tutor_id
          ? geGroup.resolved
          : { status: 'unclassified', reason: 'مجموعة غير مصنفة' };

      if (!isGlobalScope && !matchesSpec(resolved)) continue;
      const tutor = tutorsMap.get(ge.tutor_id);
      matchedSubs.push({
        id: ge.id,
        kind: 'group',
        studentName: ge.student_name,
        tutorId: ge.tutor_id,
        tutorName: tutor ? `${tutor.honorific || 'أ.'} ${tutor.name}` : ge.tutor_id,
        specializationLabel: geGroup?.raw.specialization_label ?? '',
        groupTitle: geGroup?.raw.title ?? null,
        status: ge.status,
        createdAt: ge.created_at,
      });
    }

    matchedSubs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      entityType: 'subscriptions',
      totalCount: matchedSubs.length,
      page,
      pageSize,
      subscriptions: matchedSubs.slice(startIdx, startIdx + pageSize),
    };
  }

  // Unclassified items drilldown
  const unclassifiedItems: AdminStatUnclassifiedRef[] = [];

  for (const t of dataset.tutors) {
    if (!schoolTutorsSet.has(t.id) && !quranTutorsSet.has(t.id)) {
      unclassifiedItems.push({
        id: t.id,
        category: 'unassigned_tutor',
        title: `${t.honorific || 'أ.'} ${t.name}`,
        subtitle: t.is_published ? 'معلم منشور' : 'معلم غير منشور',
        reason: 'حساب معلم لا يمتلك أي تخصص مدرسي أو قرآني مرجعي مسجل',
        createdAt: t.created_at,
        entityId: t.id,
      });
    }
  }

  for (const row of dataset.schoolOfferings) {
    const tutor = tutorsMap.get(row.tutor_id);
    const opt = courseOptionsMap.get(row.course_option_id ?? '');
    if (!tutor || !opt) {
      unclassifiedItems.push({
        id: row.id || `${row.tutor_id}-${row.course_option_id}`,
        category: 'tutor_offering',
        title: tutor ? `تخصص مدرسي لمعلم: ${tutor.honorific || 'أ.'} ${tutor.name}` : `تخصص مدرسي (${row.tutor_id})`,
        subtitle: `course_option_id: ${row.course_option_id || 'غير محدد'}`,
        reason: !tutor
          ? 'عرض مادة مدرسية مرتبط بمعرف معلم غير موجود'
          : 'عرض مادة مدرسية مرتبط بمعرف خيار مادة (course_option_id) غير صالح',
        entityId: row.tutor_id,
      });
    }
  }

  for (const row of dataset.quranOfferings) {
    const tutor = tutorsMap.get(row.tutor_id);
    const qSpec = quranPairMap.get(`${row.level_id ?? ''}|${row.age_group_id ?? ''}`);
    if (!tutor || !qSpec) {
      unclassifiedItems.push({
        id: row.id || `${row.tutor_id}-${row.level_id}-${row.age_group_id}`,
        category: 'tutor_offering',
        title: tutor ? `تخصص قرآني لمعلم: ${tutor.honorific || 'أ.'} ${tutor.name}` : `تخصص قرآني (${row.tutor_id})`,
        subtitle: `${row.level_id || '؟'} / ${row.age_group_id || '؟'}`,
        reason: !tutor
          ? 'عرض قرآني مرتبط بمعرف معلم غير موجود'
          : 'عرض قرآني مرتبط بمستوى أو فئة عمرية غير صالحة مرجعيًا',
        entityId: row.tutor_id,
      });
    }
  }

  for (const app of dataset.applications) {
    if (app.status === 'draft') continue;
    const resolvedApp = resolveApplicationSpecializationsStrict(
      app,
      courseOptionsMap,
      schoolTripletToOptionMap,
      quranPairMap
    );
    if (resolvedApp.unclassifiedReasons.length > 0) {
      unclassifiedItems.push({
        id: app.id,
        category: 'application',
        title: app.full_name,
        subtitle: `طلب انضمام (${app.reference_code || app.phone})`,
        reason: resolvedApp.unclassifiedReasons.join(' | '),
        createdAt: app.created_at,
        entityId: app.id,
      });
    }
  }

  const resolvedGroupsById = new Map<
    string,
    { raw: RawGroupRow; resolved: ResolvedSpecialization }
  >();
  for (const g of dataset.groups) {
    const res = resolveEntitySpecializationStrict(
      g,
      courseOptionsMap,
      quranPairMap,
      tutorLabelToSpecsMap
    );
    resolvedGroupsById.set(g.id, { raw: g, resolved: res });
    if (res.status === 'unclassified') {
      unclassifiedItems.push({
        id: g.id,
        category: 'group',
        title: g.title,
        subtitle: g.specialization_label || '',
        reason: res.reason,
        createdAt: g.created_at,
        entityId: g.id,
      });
    }
  }

  const resolvedSlotsById = new Map<
    string,
    { raw: RawPrivateSlotRow; resolved: ResolvedSpecialization }
  >();
  for (const s of dataset.privateSlots) {
    const res = resolveEntitySpecializationStrict(
      s,
      courseOptionsMap,
      quranPairMap,
      tutorLabelToSpecsMap
    );
    resolvedSlotsById.set(s.id, { raw: s, resolved: res });
    if (res.status === 'unclassified') {
      unclassifiedItems.push({
        id: s.id,
        category: 'private_slot',
        title: s.specialization_label || 'موعد حصة خاصة',
        subtitle: `${s.slot_date || ''} ${s.start_time || ''}`.trim(),
        reason: res.reason,
        createdAt: s.created_at,
        entityId: s.id,
      });
    }
  }

  for (const b of dataset.privateBookings) {
    let res: ResolvedSpecialization;
    if (b.slot_id && resolvedSlotsById.has(b.slot_id)) {
      const se = resolvedSlotsById.get(b.slot_id)!;
      res =
        se.raw.tutor_id === b.tutor_id
          ? se.resolved
          : {
              status: 'unclassified',
              reason: 'تعارض في معرف المعلم بين الحجز الخاص والموعد المرتبط به',
            };
    } else {
      res = resolveEntitySpecializationStrict(
        b,
        courseOptionsMap,
        quranPairMap,
        tutorLabelToSpecsMap
      );
    }
    if (res.status === 'unclassified') {
      unclassifiedItems.push({
        id: b.id,
        category: 'private_booking',
        title: `حجز خاص: ${b.student_name}`,
        subtitle: b.specialization_label || '',
        reason: res.reason,
        createdAt: b.created_at,
        entityId: b.id,
      });
    }
  }

  for (const ge of dataset.groupEnrollments) {
    const geGroup = resolvedGroupsById.get(ge.group_id);
    if (!geGroup || geGroup.raw.tutor_id !== ge.tutor_id || geGroup.resolved.status === 'unclassified') {
      unclassifiedItems.push({
        id: ge.id,
        category: 'group_enrollment',
        title: `اشتراك مجموعة: ${ge.student_name}`,
        subtitle: geGroup?.raw.title || '',
        reason:
          !geGroup
            ? 'المجموعة المرتبطة بالاشتراك غير موجودة'
            : geGroup.raw.tutor_id !== ge.tutor_id
            ? 'تعارض في معرف المعلم بين الاشتراك والمجموعة'
            : geGroup.resolved.status === 'unclassified'
            ? geGroup.resolved.reason
            : 'اشتراك غير مصنف',
        createdAt: ge.created_at,
        entityId: ge.id,
      });
    }
  }

  const filteredUnclassified =
    req.statusFilter && req.statusFilter !== 'all'
      ? unclassifiedItems.filter((item) => item.category === req.statusFilter)
      : unclassifiedItems;

  return {
    entityType: 'unclassified',
    totalCount: filteredUnclassified.length,
    page,
    pageSize,
    unclassifiedItems: filteredUnclassified.slice(startIdx, startIdx + pageSize),
  };
}
