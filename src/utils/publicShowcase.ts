import {
  Tutor,
  TutorAvailableSlot,
  TutorPrivateSlot,
  SearchCriteria,
  SchoolOffering,
  QuranOffering,
} from '../types';
import {
  evaluateTutorProfileReadiness,
  isPlaceholderOrDefaultAvatarUrl,
  TutorProfileReadinessEvaluation,
} from './tutorReadinessAndContact';
import {
  CANONICAL_QURAN_AGE_GROUPS,
  CANONICAL_QURAN_LEVELS,
  formatTutorExperience,
  toArabicDigits,
} from './formatters';

export interface PublicShowcaseEligibilityCandidate {
  tutor: Tutor;
  trialSlots: TutorAvailableSlot[];
  privateSlots: TutorPrivateSlot[];
}

export interface PublicShowcaseEligibilityResult {
  eligible: boolean;
  reasons: string[];
  earliestTrialSlot: TutorAvailableSlot | null;
  earliestPaidPrivateSlot: TutorPrivateSlot | null;
  validTrialSlotsCount: number;
  validPaidPrivateSlotsCount: number;
  evaluation: TutorProfileReadinessEvaluation;
}

const STAGE_SHORT_NAMES: Record<string, string> = {
  elementary: 'المرحلة الابتدائية',
  preparatory: 'المرحلة الإعدادية',
  secondary: 'المرحلة الثانوية',
};

const SUBJECT_DISPLAY_NAMES: Record<string, string> = {
  math: 'الرياضيات',
  math_en: 'الرياضيات (Math)',
  arabic: 'اللغة العربية',
  english: 'اللغة الإنجليزية',
  science: 'العلوم',
  science_en: 'العلوم (Science)',
  social: 'الدراسات الاجتماعية',
  physics: 'الفيزياء',
  physics_en: 'الفيزياء (Physics)',
  chemistry: 'الكيمياء',
  chemistry_en: 'الكيمياء (Chemistry)',
  biology: 'الأحياء',
  biology_en: 'الأحياء (Biology)',
};

/**
 * Evaluates whether a tutor is eligible to appear in the curated public showcase:
 * - Published & active (`tutor.isPublished === true`)
 * - Complete profile (valid personal photo, headline/bio, pricing/duration, active specializations)
 * - Has at least 1 future available unbooked non-suspended 20-min trial slot
 * - Separately has at least 1 future available unbooked non-suspended paid private slot (`priceAmount > 0`)
 */
export function isTutorEligibleForPublicShowcase(
  candidate: PublicShowcaseEligibilityCandidate,
  referenceNowMs?: number
): PublicShowcaseEligibilityResult {
  const { tutor, trialSlots = [], privateSlots = [] } = candidate;
  const evaluation = evaluateTutorProfileReadiness({
    tutor,
    activeSpecializationsCount: Array.isArray(tutor.offerings) ? tutor.offerings.length : 0,
    trialSlots,
    privateSlots,
    referenceNowMs,
  });

  const reasons: string[] = [];

  if (tutor.isPublished !== true) {
    reasons.push('ملف المعلم غير منشور للجمهور.');
  }

  if (!tutor.avatarUrl || isPlaceholderOrDefaultAvatarUrl(tutor.avatarUrl)) {
    reasons.push('الصورة الشخصية غير متوفرة أو افتراضية.');
  }

  for (const req of evaluation.missingRequirements) {
    reasons.push(req.missingReason || req.statusText);
  }

  const eligible =
    tutor.isPublished === true &&
    !isPlaceholderOrDefaultAvatarUrl(tutor.avatarUrl) &&
    evaluation.isDataComplete6of6 &&
    evaluation.validTrialSlotsCount >= 1 &&
    evaluation.validPaidPrivateSlotsCount >= 1;

  return {
    eligible,
    reasons,
    earliestTrialSlot: evaluation.earliestTrialSlot,
    earliestPaidPrivateSlot: evaluation.earliestPaidPrivateSlot,
    validTrialSlotsCount: evaluation.validTrialSlotsCount,
    validPaidPrivateSlotsCount: evaluation.validPaidPrivateSlotsCount,
    evaluation,
  };
}

/**
 * Filters, enriches, and sorts published complete tutors who have BOTH upcoming
 * trial slots AND upcoming paid private slots available separately.
 */
export function selectFeaturedShowcaseTutors(
  candidates: PublicShowcaseEligibilityCandidate[],
  limit = 3,
  referenceNowMs?: number
): { tutors: Tutor[]; totalReadyCount: number } {
  const readyItems: Array<{
    tutor: Tutor;
    earliestTrialKey: string;
    hasReviews: number;
    yearsOfExp: number;
  }> = [];

  for (const item of candidates) {
    const check = isTutorEligibleForPublicShowcase(item, referenceNowMs);
    if (!check.eligible || !check.earliestTrialSlot) continue;

    const enrichedTutor: Tutor = {
      ...item.tutor,
      earliestTrialSlot: check.earliestTrialSlot,
      availableTrialSlotsCount: check.validTrialSlotsCount,
      availablePrivateSlotsCount: check.validPaidPrivateSlotsCount,
    };

    const earliestTrialKey = `${check.earliestTrialSlot.slotDate}T${check.earliestTrialSlot.startTime}`;
    const hasReviews =
      typeof item.tutor.reviewsCount === 'number' &&
      item.tutor.reviewsCount > 0 &&
      typeof item.tutor.rating === 'number' &&
      item.tutor.rating > 0
        ? 1
        : 0;

    readyItems.push({
      tutor: enrichedTutor,
      earliestTrialKey,
      hasReviews,
      yearsOfExp: Number(item.tutor.yearsOfExperience || 0),
    });
  }

  readyItems.sort((a, b) => {
    if (b.hasReviews !== a.hasReviews) return b.hasReviews - a.hasReviews;
    const trialCmp = a.earliestTrialKey.localeCompare(b.earliestTrialKey);
    if (trialCmp !== 0) return trialCmp;
    return b.yearsOfExp - a.yearsOfExp;
  });

  return {
    tutors: readyItems.slice(0, Math.max(1, limit)).map((x) => x.tutor),
    totalReadyCount: readyItems.length,
  };
}

/**
 * Matches a published tutor strictly against SearchCriteria (supporting both exact
 * school/quran combinations and simplified/partial filters from the homepage bar).
 */
export function matchesSimplifiedSearchCriteria(tutor: Tutor, criteria: SearchCriteria): boolean {
  if (tutor.isPublished === false) return false;
  const offerings = Array.isArray(tutor.offerings) ? tutor.offerings : [];
  if (offerings.length === 0) return false;

  const schoolOfferings = offerings.filter((o): o is SchoolOffering => o.track === 'school');
  const quranOfferings = offerings.filter((o): o is QuranOffering => o.track === 'quran');

  if (criteria.track === 'all') {
    const hasStageFilter = Boolean(criteria.stageId);
    const hasCurriculumFilter = Boolean(criteria.curriculumType);
    const hasSubjectFilter = Boolean(
      criteria.subjectId || (criteria.subjectIds && criteria.subjectIds.length > 0)
    );

    if (!hasStageFilter && !hasCurriculumFilter && !hasSubjectFilter) {
      return true;
    }

    const allowedSubjectSet = criteria.subjectIds?.length
      ? new Set(criteria.subjectIds)
      : criteria.subjectId
      ? new Set([criteria.subjectId])
      : null;

    return schoolOfferings.some((o) => {
      if (hasStageFilter && o.stageId !== criteria.stageId) return false;
      if (hasCurriculumFilter && o.curriculumType !== criteria.curriculumType) return false;
      if (allowedSubjectSet && !allowedSubjectSet.has(o.subjectId)) return false;
      return true;
    });
  }

  if (criteria.track === 'school') {
    if (schoolOfferings.length === 0) return false;
    const allowedSubjectSet = criteria.subjectIds?.length
      ? new Set(criteria.subjectIds)
      : criteria.subjectId
      ? new Set([criteria.subjectId])
      : null;

    return schoolOfferings.some((o) => {
      if (criteria.stageId && o.stageId !== criteria.stageId) return false;
      if (criteria.gradeId && o.gradeId !== criteria.gradeId) return false;
      if (criteria.curriculumType && o.curriculumType !== criteria.curriculumType) return false;
      if (allowedSubjectSet && !allowedSubjectSet.has(o.subjectId)) return false;
      return true;
    });
  }

  // Quran track
  if (quranOfferings.length === 0) return false;
  return quranOfferings.some((o) => {
    if (criteria.ageGroupId && o.ageGroupId !== criteria.ageGroupId) return false;
    if (criteria.levelId && o.levelId !== criteria.levelId) return false;
    return true;
  });
}

/**
 * Returns a clean primary specialization title for a featured tutor card.
 */
export function getTutorPrimaryTrackTitle(tutor: Tutor, criteria?: SearchCriteria): string {
  const schoolOfferings = (tutor.offerings || []).filter(
    (o): o is SchoolOffering => o.track === 'school'
  );
  const quranOfferings = (tutor.offerings || []).filter(
    (o): o is QuranOffering => o.track === 'quran'
  );

  if (criteria?.track === 'quran' || (schoolOfferings.length === 0 && quranOfferings.length > 0)) {
    const lvlId = criteria?.track === 'quran' && criteria.levelId ? criteria.levelId : quranOfferings[0]?.levelId;
    if (lvlId && CANONICAL_QURAN_LEVELS[lvlId]) {
      return quranOfferings.length > 1 && !criteria?.levelId
        ? 'القرآن الكريم والتأسيس'
        : CANONICAL_QURAN_LEVELS[lvlId].shortTitle;
    }
    return 'القرآن الكريم والتأسيس';
  }

  if (criteria?.track === 'school' && criteria.subjectId && SUBJECT_DISPLAY_NAMES[criteria.subjectId]) {
    return SUBJECT_DISPLAY_NAMES[criteria.subjectId];
  }

  const subjectNames = Array.from(
    new Set(schoolOfferings.map((o) => SUBJECT_DISPLAY_NAMES[o.subjectId]).filter(Boolean))
  );
  if (subjectNames.length > 0) {
    return subjectNames.slice(0, 2).join(' و');
  }

  if (quranOfferings.length > 0) {
    return 'القرآن الكريم والتأسيس';
  }

  return tutor.subjectsTaughtSummary?.[0]?.title || 'معلم معتمد';
}

/**
 * Returns concise tags for a tutor card (stage/age group + formatted experience).
 */
export function getTutorFeaturedTags(tutor: Tutor): string[] {
  const tags: string[] = [];
  const schoolOfferings = (tutor.offerings || []).filter(
    (o): o is SchoolOffering => o.track === 'school'
  );
  const quranOfferings = (tutor.offerings || []).filter(
    (o): o is QuranOffering => o.track === 'quran'
  );

  if (schoolOfferings.length > 0) {
    const stageNames = Array.from(
      new Set(schoolOfferings.map((o) => STAGE_SHORT_NAMES[o.stageId]).filter(Boolean))
    );
    if (stageNames.length === 1) {
      tags.push(stageNames[0]);
    } else if (stageNames.length > 1) {
      tags.push(
        stageNames
          .map((s) => s.replace(/^المرحلة\s+/, ''))
          .slice(0, 2)
          .join(' و')
      );
    }
  } else if (quranOfferings.length > 0) {
    const ageIds = Array.from(new Set(quranOfferings.map((o) => o.ageGroupId)));
    const firstAge = CANONICAL_QURAN_AGE_GROUPS[ageIds[0]];
    if (ageIds.length === 1 && firstAge) {
      tags.push(`${firstAge.name} (${firstAge.ageRange})`);
    } else if (ageIds.length > 1) {
      tags.push(toArabicDigits('للأطفال ٤–١٨ سنة'));
    }
  }

  const expText = formatTutorExperience(tutor.yearsOfExperience, tutor.experienceBadgeText);
  if (expText) {
    tags.push(expText);
  }

  return tags;
}

/**
 * Returns clean 1-2 character Arabic initials when a tutor image fails to load.
 */
export function getAvatarInitials(name: string | null | undefined): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'م';
  if (parts.length === 1) return parts[0].charAt(0);
  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`;
}
