import assert from 'node:assert/strict';
import {
  Tutor,
  TutorAvailableSlot,
  TutorPrivateSlot,
  SearchCriteria,
} from '../src/types';
import {
  isTutorEligibleForPublicShowcase,
  selectFeaturedShowcaseTutors,
  matchesSimplifiedSearchCriteria,
} from '../src/utils/publicShowcase';

// Fixed reference timestamp: 2026-11-16 10:00:00 Cairo (UTC+2 => 08:00:00Z)
const REF_NOW_MS = Date.parse('2026-11-16T08:00:00.000Z');

function makeTutor(overrides: Partial<Tutor> = {}): Tutor {
  return {
    id: 'tutor-1',
    name: 'أحمد حسن',
    honorific: 'أ.',
    headline: 'معلم رياضيات للمرحلة الابتدائية والإعدادية',
    avatarUrl: 'https://cdn.example.com/tutors/ahmed-hassan.jpg',
    verifiedCredentials: true,
    isPublished: true,
    yearsOfExperience: 6,
    experienceBadgeText: 'خبرة 6 سنوات',
    curriculumTags: ['المنهج العربي'],
    hourlyRateMin: 175,
    hourlyRateMax: 175,
    currency: 'ج.م',
    sessionDurationMinutes: 50,
    trialDurationMinutes: 20,
    rating: null,
    reviewsCount: 0,
    totalStudentsTaught: 0,
    helpChildQuote: 'أساعد طفلك على فهم المسائل خطوة بخطوة',
    helpChildSummary: 'أشرح المفاهيم الأساسية بأمثلة عملية من حياة الطالب مع تدريبات تفاعلية.',
    methodologyPillars: [],
    targetStudentCases: ['تأسيس الرياضيات'],
    subjectsTaughtSummary: [],
    qualifications: [],
    trialSessionPlan: [],
    offerings: [
      {
        track: 'school',
        stageId: 'elementary',
        gradeId: 'grade_4',
        curriculumType: 'national_arabic',
        subjectId: 'math',
      },
    ],
    ...overrides,
  };
}

function makeTrialSlot(overrides: Partial<TutorAvailableSlot> = {}): TutorAvailableSlot {
  return {
    id: 'trial-1',
    tutorId: 'tutor-1',
    slotDate: '2026-11-18',
    startTime: '17:00',
    endTime: '17:20',
    durationMinutes: 20,
    timezone: 'Africa/Cairo',
    isAvailable: true,
    isBooked: false,
    adminSuspended: false,
    ...overrides,
  };
}

function makePrivateSlot(overrides: Partial<TutorPrivateSlot> = {}): TutorPrivateSlot {
  return {
    id: 'priv-1',
    tutorId: 'tutor-1',
    specializationLabel: 'الرياضيات - الصف الرابع الابتدائي',
    slotDate: '2026-11-19',
    startTime: '18:00',
    endTime: '18:50',
    durationMinutes: 50,
    priceAmount: 175,
    currency: 'ج.م',
    timezone: 'Africa/Cairo',
    isAvailable: true,
    isBooked: false,
    adminSuspended: false,
    ...overrides,
  };
}

// 1. Fully ready published tutor with future trial + future paid private slots passes
{
  const check = isTutorEligibleForPublicShowcase(
    {
      tutor: makeTutor(),
      trialSlots: [makeTrialSlot()],
      privateSlots: [makePrivateSlot()],
    },
    REF_NOW_MS
  );
  assert.equal(check.eligible, true, `Expected eligible=true, reasons=${check.reasons.join(', ')}`);
  assert.equal(check.validTrialSlotsCount, 1);
  assert.equal(check.validPaidPrivateSlotsCount, 1);
  assert.equal(check.earliestTrialSlot?.id, 'trial-1');
  assert.equal(check.earliestPaidPrivateSlot?.id, 'priv-1');
}

// 2. Unpublished tutor rejected
{
  const check = isTutorEligibleForPublicShowcase(
    {
      tutor: makeTutor({ isPublished: false }),
      trialSlots: [makeTrialSlot()],
      privateSlots: [makePrivateSlot()],
    },
    REF_NOW_MS
  );
  assert.equal(check.eligible, false);
}

// 3. Placeholder / missing avatar rejected
{
  const checkMissing = isTutorEligibleForPublicShowcase(
    {
      tutor: makeTutor({ avatarUrl: '' }),
      trialSlots: [makeTrialSlot()],
      privateSlots: [makePrivateSlot()],
    },
    REF_NOW_MS
  );
  assert.equal(checkMissing.eligible, false);

  const checkPlaceholder = isTutorEligibleForPublicShowcase(
    {
      tutor: makeTutor({ avatarUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=Test' }),
      trialSlots: [makeTrialSlot()],
      privateSlots: [makePrivateSlot()],
    },
    REF_NOW_MS
  );
  assert.equal(checkPlaceholder.eligible, false);
}

// 4. Separate slot checks: trial present WITHOUT paid private rejected; paid private WITHOUT trial rejected
{
  const onlyTrial = isTutorEligibleForPublicShowcase(
    {
      tutor: makeTutor(),
      trialSlots: [makeTrialSlot()],
      privateSlots: [],
    },
    REF_NOW_MS
  );
  assert.equal(onlyTrial.eligible, false);

  const onlyPrivate = isTutorEligibleForPublicShowcase(
    {
      tutor: makeTutor(),
      trialSlots: [],
      privateSlots: [makePrivateSlot()],
    },
    REF_NOW_MS
  );
  assert.equal(onlyPrivate.eligible, false);
}

// 5. Booked, admin-suspended, past, or zero-price private slots strictly excluded
{
  const bookedSlots = isTutorEligibleForPublicShowcase(
    {
      tutor: makeTutor(),
      trialSlots: [makeTrialSlot({ isBooked: true })],
      privateSlots: [makePrivateSlot()],
    },
    REF_NOW_MS
  );
  assert.equal(bookedSlots.eligible, false);

  const suspendedPrivate = isTutorEligibleForPublicShowcase(
    {
      tutor: makeTutor(),
      trialSlots: [makeTrialSlot()],
      privateSlots: [makePrivateSlot({ adminSuspended: true })],
    },
    REF_NOW_MS
  );
  assert.equal(suspendedPrivate.eligible, false);

  const pastTrial = isTutorEligibleForPublicShowcase(
    {
      tutor: makeTutor(),
      trialSlots: [makeTrialSlot({ slotDate: '2026-11-15', startTime: '17:00', endTime: '17:20' })],
      privateSlots: [makePrivateSlot()],
    },
    REF_NOW_MS
  );
  assert.equal(pastTrial.eligible, false);

  const zeroPricePrivate = isTutorEligibleForPublicShowcase(
    {
      tutor: makeTutor(),
      trialSlots: [makeTrialSlot()],
      privateSlots: [makePrivateSlot({ priceAmount: 0 })],
    },
    REF_NOW_MS
  );
  assert.equal(zeroPricePrivate.eligible, false);
}

// 6. Deterministic selection & ordering (real reviews first, soonest trial, max 3)
{
  const t1 = makeTutor({ id: 't1', rating: null, reviewsCount: 0, yearsOfExperience: 8 });
  const t2 = makeTutor({ id: 't2', rating: 4.9, reviewsCount: 5, yearsOfExperience: 4 });
  const t3 = makeTutor({ id: 't3', rating: null, reviewsCount: 0, yearsOfExperience: 3 });
  const t4 = makeTutor({ id: 't4', rating: null, reviewsCount: 0, yearsOfExperience: 10 });
  const tInvalid = makeTutor({ id: 'tInvalid', avatarUrl: '' });

  const { tutors, totalReadyCount } = selectFeaturedShowcaseTutors(
    [
      {
        tutor: t1,
        trialSlots: [makeTrialSlot({ id: 's1', tutorId: 't1', slotDate: '2026-11-20' })],
        privateSlots: [makePrivateSlot({ id: 'p1', tutorId: 't1' })],
      },
      {
        tutor: t2,
        trialSlots: [makeTrialSlot({ id: 's2', tutorId: 't2', slotDate: '2026-11-22' })],
        privateSlots: [makePrivateSlot({ id: 'p2', tutorId: 't2' })],
      },
      {
        tutor: t3,
        trialSlots: [makeTrialSlot({ id: 's3', tutorId: 't3', slotDate: '2026-11-18' })],
        privateSlots: [makePrivateSlot({ id: 'p3', tutorId: 't3' })],
      },
      {
        tutor: t4,
        trialSlots: [makeTrialSlot({ id: 's4', tutorId: 't4', slotDate: '2026-11-20' })],
        privateSlots: [makePrivateSlot({ id: 'p4', tutorId: 't4' })],
      },
      {
        tutor: tInvalid,
        trialSlots: [makeTrialSlot({ id: 's5', tutorId: 'tInvalid', slotDate: '2026-11-17' })],
        privateSlots: [makePrivateSlot({ id: 'p5', tutorId: 'tInvalid' })],
      },
    ],
    3,
    REF_NOW_MS
  );

  assert.equal(totalReadyCount, 4);
  assert.deepEqual(
    tutors.map((t) => t.id),
    ['t2', 't3', 't4']
  );
  assert.equal(tutors[0].earliestTrialSlot?.id, 's2');
  assert.equal(tutors[0].availablePrivateSlotsCount, 1);
}

// 7. Simplified & exact search criteria matching
{
  const schoolMathTutor = makeTutor({
    id: 'school-math',
    offerings: [
      {
        track: 'school',
        stageId: 'elementary',
        gradeId: 'grade_4',
        curriculumType: 'languages_experimental',
        subjectId: 'math_en',
      },
    ],
  });

  const quranTutor = makeTutor({
    id: 'quran-1',
    offerings: [
      {
        track: 'quran',
        ageGroupId: 'early_childhood',
        levelId: 'noor_bayan',
      },
    ],
  });

  const allCriteria: SearchCriteria = { track: 'all' };
  assert.equal(matchesSimplifiedSearchCriteria(schoolMathTutor, allCriteria), true);
  assert.equal(matchesSimplifiedSearchCriteria(quranTutor, allCriteria), true);

  const mathQuickCriteria: SearchCriteria = {
    track: 'school',
    subjectIds: ['math', 'math_en'],
  };
  assert.equal(matchesSimplifiedSearchCriteria(schoolMathTutor, mathQuickCriteria), true);
  assert.equal(matchesSimplifiedSearchCriteria(quranTutor, mathQuickCriteria), false);

  const stageOnlyCriteria: SearchCriteria = {
    track: 'school',
    stageId: 'elementary',
  };
  assert.equal(matchesSimplifiedSearchCriteria(schoolMathTutor, stageOnlyCriteria), true);

  const wrongCurriculumCriteria: SearchCriteria = {
    track: 'school',
    curriculumType: 'national_arabic',
  };
  assert.equal(matchesSimplifiedSearchCriteria(schoolMathTutor, wrongCurriculumCriteria), false);

  const quranCriteria: SearchCriteria = {
    track: 'quran',
    levelId: 'noor_bayan',
  };
  assert.equal(matchesSimplifiedSearchCriteria(quranTutor, quranCriteria), true);
  assert.equal(matchesSimplifiedSearchCriteria(schoolMathTutor, quranCriteria), false);
}

console.log('All public showcase & simplified search unit tests passed.');
