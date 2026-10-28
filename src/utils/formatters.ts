import {
  QuranAgeGroup,
  QuranLevel,
  Tutor,
  TutorAvailableSlot,
  TutorPrivateSlot,
  TutorGroup,
  SchoolOffering,
  QuranOffering,
} from '../types';

/**
 * Convert Western digits (0-9) to Eastern Arabic numerals (٠-٩)
 */
export function toArabicDigits(value: number | string): string {
  const str = String(value ?? '');
  const arabicDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return str.replace(/[0-9]/g, (d) => arabicDigits[Number(d)]);
}

/**
 * Canonical Quran & Foundation Age Groups
 * Restricted strictly to the three active age groups:
 * - age_4_7: «الأطفال الصغار» — من ٤ إلى ٧ سنوات
 * - age_8_12: «الأطفال» — من ٨ إلى ١٢ سنة
 * - age_13_18: «اليافعون» — من ١٣ إلى ١٨ سنة
 * Note: age_adults is intentionally omitted here so its original database values and inactive state remain untouched.
 */
export const CANONICAL_QURAN_AGE_GROUPS: Record<
  string,
  { name: string; ageRange: string; displayOrder: number; defaultActive: boolean }
> = {
  age_4_7: {
    name: 'الأطفال الصغار',
    ageRange: 'من ٤ إلى ٧ سنوات',
    displayOrder: 1,
    defaultActive: true,
  },
  age_8_12: {
    name: 'الأطفال',
    ageRange: 'من ٨ إلى ١٢ سنة',
    displayOrder: 2,
    defaultActive: true,
  },
  age_13_18: {
    name: 'اليافعون',
    ageRange: 'من ١٣ إلى ١٨ سنة',
    displayOrder: 3,
    defaultActive: true,
  },
};

/**
 * Canonical Quran & Foundation Educational Programs (Levels)
 * Uses the verified database IDs from migration 001_initial_schema.sql:
 * - noor_bayan
 * - hifz_tilawa
 * - tajweed_rules
 * - khatt_imlaa
 * Preserves the exact scope and meaning of each approved program while providing clear goal descriptions.
 */
export const CANONICAL_QURAN_LEVELS: Record<
  string,
  { name: string; shortTitle: string; description: string; goalSummary: string; displayOrder: number }
> = {
  noor_bayan: {
    name: 'تأسيس نور البيان والقراءة العربية',
    shortTitle: 'تأسيس نور البيان والقراءة العربية',
    description:
      'تعليم الحروف العربية ومخارجها والتهجي السليم خطوة بخطوة حتى يتمكن الطفل من القراءة الصحيحة بطلاقة.',
    goalSummary: 'الهدف: تأسيس الطفل في مخارج الحروف والتهجي السليم لقراءة الكلمات والآيات بطلاقة.',
    displayOrder: 1,
  },
  hifz_tilawa: {
    name: 'حفظ وتلقين القرآن الكريم ومراجعته',
    shortTitle: 'حفظ وتلقين القرآن الكريم ومراجعته',
    description:
      'تحفيظ القرآن الكريم بالتلقين الصحيح مع المتابعة المنتظمة وتثبيت المحفوظ ومراجعته بما يناسب قدرة الطفل.',
    goalSummary: 'الهدف: حفظ القرآن الكريم بالتلقين السليم مع خطة مراجعة منتظمة لتثبيت المحفوظ.',
    displayOrder: 2,
  },
  tajweed_rules: {
    name: 'أحكام التجويد والإتقان برواية حفص',
    shortTitle: 'أحكام التجويد والإتقان برواية حفص',
    description:
      'تعلم أحكام التجويد وتطبيقها عمليًا أثناء التلاوة لضبط مخارج الحروف والمدود وتحسين الأداء القرآني.',
    goalSummary: 'الهدف: إتقان أحكام النون والميم والمدود ومخارج الحروف وتطبيقها عمليًا في التلاوة.',
    displayOrder: 3,
  },
  khatt_imlaa: {
    name: 'تحسين الخط العربي وقواعد الإملاء',
    shortTitle: 'تحسين الخط العربي وقواعد الإملاء',
    description:
      'تدريب عملي لتحسين جودة الخط العربي وإتقان قواعد الإملاء والكتابة الصحيحة بثقة ودون أخطاء شائعة.',
    goalSummary: 'الهدف: تحسين خط اليد وضبط قواعد الكتابة والإملاء العربي السليم.',
    displayOrder: 4,
  },
};

const STAGE_ARABIC_NAMES: Record<string, string> = {
  elementary: 'المرحلة الابتدائية',
  preparatory: 'المرحلة الإعدادية',
  secondary: 'المرحلة الثانوية',
};

const GRADE_ARABIC_NAMES: Record<string, string> = {
  elem_1: 'الأول الابتدائي',
  elem_2: 'الثاني الابتدائي',
  elem_3: 'الثالث الابتدائي',
  elem_4: 'الرابع الابتدائي',
  elem_5: 'الخامس الابتدائي',
  elem_6: 'السادس الابتدائي',
  prep_1: 'الأول الإعدادي',
  prep_2: 'الثاني الإعدادي',
  prep_3: 'الثالث الإعدادي',
  sec_1: 'الأول الثانوي',
  sec_2: 'الثاني الثانوي',
  sec_3: 'الثالث الثانوي',
};

const SUBJECT_ARABIC_NAMES: Record<string, string> = {
  math: 'الرياضيات',
  math_en: 'Math',
  arabic: 'اللغة العربية',
  english: 'اللغة الإنجليزية',
  science: 'العلوم',
  science_en: 'Science',
  social: 'الدراسات الاجتماعية',
  physics: 'الفيزياء',
  physics_en: 'Physics',
  chemistry: 'الكيمياء',
  chemistry_en: 'Chemistry',
  biology: 'الأحياء',
  biology_en: 'Biology',
  subj_math: 'الرياضيات',
  subj_arabic: 'اللغة العربية',
  subj_english: 'اللغة الإنجليزية',
  subj_science: 'العلوم',
  subj_social: 'الدراسات الاجتماعية',
  subj_ict: 'تكنولوجيا المعلومات',
  subj_french: 'اللغة الفرنسية',
  subj_german: 'اللغة الألمانية',
  subj_physics: 'الفيزياء',
  subj_chemistry: 'الكيمياء',
  subj_biology: 'الأحياء',
};

const CURRICULUM_ARABIC_NAMES: Record<string, string> = {
  national_arabic: 'المنهج المصري (عربي)',
  languages_experimental: 'لغات وتجريبي (Math / Science)',
  international: 'مناهج دولية (British / American)',
};

/**
 * Normalize a QuranAgeGroup record from DB or config so that its name and ageRange
 * strictly match the canonical definition for its ID without heuristic guessing.
 * Leaves age_adults untouched.
 */
export function normalizeQuranAgeGroup(ag: QuranAgeGroup): QuranAgeGroup {
  if (ag.id === 'age_adults') {
    return ag;
  }
  const canonical = CANONICAL_QURAN_AGE_GROUPS[ag.id];
  if (canonical) {
    return {
      ...ag,
      name: canonical.name,
      ageRange: canonical.ageRange,
    };
  }
  return {
    ...ag,
    name: normalizeLegacyAgeGroupText(ag.name),
    ageRange: ag.ageRange ? toArabicDigits(ag.ageRange) : '',
  };
}

/**
 * Normalize a QuranLevel record so it always carries its preserved name and improved goal description.
 */
export function normalizeQuranLevel(lvl: QuranLevel): QuranLevel {
  const canonical = CANONICAL_QURAN_LEVELS[lvl.id];
  if (canonical) {
    return {
      ...lvl,
      name: canonical.name,
      description: canonical.description,
    };
  }
  return lvl;
}

/**
 * Replace legacy Quran age group names for the three active categories (age_4_7, age_8_12, age_13_18)
 * inside specialization labels or badge texts so that all views are unified without rewriting DB records.
 * Does not touch age_adults ('كبار ومحو أمية').
 */
export function normalizeLegacyAgeGroupText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/أطفال وبراعم/g, 'الأطفال الصغار')
    .replace(/ناشئة وطلاب/g, 'الأطفال')
    .replace(/فتيان وفتيات/g, 'الأطفال')
    .replace(/يافعون وشباب/g, 'اليافعون')
    .replace(/شباب وناشئة/g, 'اليافعون')
    .replace(/4\s*[-–]\s*7\s*(سنوات|سنة)?/g, 'من ٤ إلى ٧ سنوات')
    .replace(/٤\s*[-–]\s*٧\s*(سنوات|سنة)?/g, 'من ٤ إلى ٧ سنوات')
    .replace(/8\s*[-–]\s*12\s*(سنوات|سنة)?/g, 'من ٨ إلى ١٢ سنة')
    .replace(/٨\s*[-–]\s*١٢\s*(سنوات|سنة)?/g, 'من ٨ إلى ١٢ سنة')
    .replace(/13\s*[-–]\s*18\s*(سنوات|سنة)?/g, 'من ١٣ إلى ١٨ سنة')
    .replace(/١٣\s*[-–]\s*١٨\s*(سنوات|سنة)?/g, 'من ١٣ إلى ١٨ سنة');
}

/**
 * Resolve the displayed specialization label via reference IDs and the unified canonical dictionary
 * without rewriting historical records in tutor_private_slots, tutor_groups, or tutor_private_bookings.
 */
export function resolveSpecializationLabel(params: {
  specializationLabel?: string | null;
  quranAgeGroupId?: string | null;
  quranLevelId?: string | null;
}): string {
  const ageId = (params.quranAgeGroupId || '').trim();
  const levelId = (params.quranLevelId || '').trim();

  if (ageId && levelId) {
    const canonicalAg = CANONICAL_QURAN_AGE_GROUPS[ageId];
    const canonicalLvl = CANONICAL_QURAN_LEVELS[levelId];
    if (canonicalAg && canonicalLvl) {
      return `قرآن وتأسيس: ${canonicalLvl.name} (${canonicalAg.name})`;
    }
  }

  return normalizeLegacyAgeGroupText(params.specializationLabel || '');
}

/**
 * Format a QuranAgeGroup for display in selectors, badges, and summaries.
 * Never falls back to a default age range that masks data errors.
 */
export function formatQuranAgeGroupDisplay(ag: QuranAgeGroup): {
  title: string;
  rangeText: string;
  fullLabel: string;
} {
  const normalized = normalizeQuranAgeGroup(ag);
  const title = normalized.name.trim();
  const rangeText = (normalized.ageRange || '').trim();
  return {
    title,
    rangeText,
    fullLabel: rangeText ? `${title} — ${rangeText}` : title,
  };
}

/**
 * Unified Tutor Experience Formatter
 * Fixes the discrepancy between TutorCard and TutorProfileView:
 * - Preserves exact ranges like «أقل من سنتين», «من سنتين إلى ٣ سنوات», «من ٤ إلى ٦ سنوات»
 * - Never turns «أقل من سنتين» (where yearsOfExperience = 1 in DB) into «خبرة سنتين» or «خبرة 1 سنوات»
 * - Uses proper Arabic grammar for numeric years without inflation or rounding
 */
export function formatTutorExperience(
  yearsOfExperience?: number | null,
  experienceBadgeText?: string | null
): string | null {
  const rawBadge = (experienceBadgeText || '').trim();

  if (rawBadge) {
    if (/^خبرة\s+0\s+(سنوات|سنة)$/.test(rawBadge)) {
      return null;
    }
    if (rawBadge === 'أقل من سنة' || rawBadge === 'less_than_1' || rawBadge === '0-1') {
      return 'خبرة أقل من سنة';
    }
    if (/^خبرة\s+1\s+(سنوات|سنة)$/.test(rawBadge) || rawBadge === 'أقل من سنتين') {
      return 'خبرة أقل من سنتين';
    }
    if (/^خبرة\s+2\s+(سنوات|سنة)$/.test(rawBadge)) {
      return 'خبرة سنتين';
    }
    if (rawBadge === 'من سنتين إلى 3 سنوات' || rawBadge === 'من سنتين إلى ٣ سنوات') {
      return 'خبرة من سنتين إلى ٣ سنوات';
    }
    if (rawBadge === 'من 4 إلى 6 سنوات' || rawBadge === 'من ٤ إلى ٦ سنوات') {
      return 'خبرة من ٤ إلى ٦ سنوات';
    }
    if (rawBadge === 'أكثر من 6 سنوات' || rawBadge === 'أكثر من ٦ سنوات') {
      return 'خبرة أكثر من ٦ سنوات';
    }
    const cleanArabicBadge = toArabicDigits(rawBadge);
    if (cleanArabicBadge.startsWith('خبرة')) {
      return cleanArabicBadge;
    }
    return `خبرة ${cleanArabicBadge}`;
  }

  const years = Number(yearsOfExperience ?? 0);
  if (!Number.isFinite(years) || years <= 0) {
    return null;
  }
  if (years === 1) {
    return 'خبرة سنة واحدة';
  }
  if (years === 2) {
    return 'خبرة سنتين';
  }
  if (years >= 3 && years <= 10) {
    return `خبرة ${toArabicDigits(years)} سنوات`;
  }
  return `خبرة ${toArabicDigits(years)} سنة`;
}

/**
 * Format session price and duration clearly for TutorCard and TutorProfileView.
 * Rules:
 * - When hourlyRateMin === hourlyRateMax (or max is absent), display «١٥٠ ج.م للحصة — ٥٠ دقيقة» (never «١٥٠–١٥٠»).
 * - Display a range only when hourlyRateMin !== hourlyRateMax.
 * - Explicitly labels per-session price («للحصة») vs group package price («للباقة»).
 */
export function formatSessionPriceSummary(params: {
  minPrice: number;
  maxPrice?: number | null;
  currency?: string;
  durationMinutes?: number | null;
  useArabicDigits?: boolean;
}): {
  priceText: string;
  unitText: string;
  durationText: string;
  combinedText: string;
  isRange: boolean;
} {
  const min = Math.max(0, Number(params.minPrice || 0));
  const max = params.maxPrice != null && Number(params.maxPrice) > 0 ? Number(params.maxPrice) : min;
  const currency = (params.currency || 'ج.م').trim();
  const duration = params.durationMinutes && params.durationMinutes > 0 ? params.durationMinutes : 50;
  const fmt = params.useArabicDigits !== false ? toArabicDigits : (v: number | string) => String(v);

  const isRange = max > min;
  const amountStr = isRange ? `${fmt(min)}–${fmt(max)}` : `${fmt(min)}`;
  const priceText = `${amountStr} ${currency}`;
  const unitText = 'للحصة';
  const durationText = `${fmt(duration)} دقيقة`;
  const combinedText = `${priceText} ${unitText} — ${durationText}`;

  return {
    priceText,
    unitText,
    durationText,
    combinedText,
    isRange,
  };
}

/**
 * Format Group price and type clearly without ever confusing package price with session price.
 */
export function formatGroupPriceSummary(
  group: Pick<
    TutorGroup,
    'pricePerStudent' | 'priceType' | 'currency' | 'sessionsCount' | 'sessionDurationMinutes'
  >
): {
  priceText: string;
  typeLabel: string;
  detailsText: string;
  combinedText: string;
} {
  const price = toArabicDigits(group.pricePerStudent);
  const currency = (group.currency || 'ج.م').trim();
  const sessionsCount = toArabicDigits(group.sessionsCount);
  const duration = toArabicDigits(group.sessionDurationMinutes || 60);

  const isPerSession = group.priceType === 'per_session';
  const typeLabel = isPerSession ? 'للحصة الواحدة' : `للباقة كاملة (${sessionsCount} حصص)`;
  const priceText = `${price} ${currency}`;
  const detailsText = `${sessionsCount} حصص • ${duration} دقيقة للحصة`;
  const combinedText = `${priceText} ${typeLabel}`;

  return {
    priceText,
    typeLabel,
    detailsText,
    combinedText,
  };
}

/**
 * Extract the tutor's primary academic degree from qualifications, and determine a clear
 * descriptive headline so that the academic degree is not automatically duplicated as the headline.
 */
export function getTutorHeadlineAndDegree(tutor: Tutor): {
  descriptiveHeadline: string;
  academicDegree: string | null;
} {
  const rawHeadline = (tutor.headline || '').trim();
  const firstQualTitle = (tutor.qualifications?.[0]?.title || '').trim();

  const normalizeStr = (s: string) => s.replace(/\s+/g, ' ').trim();
  const isHeadlineSameAsQual = Boolean(
    rawHeadline && firstQualTitle && normalizeStr(rawHeadline) === normalizeStr(firstQualTitle)
  );
  const looksLikeBareDegree =
    /^(بكالوريوس|ليسانس|ماجستير|دكتوراه|دبلوم|كلية|خريج|خريجة)\b/.test(rawHeadline) &&
    rawHeadline.length < 85;

  const academicDegree = firstQualTitle || (looksLikeBareDegree ? rawHeadline : null);

  if (rawHeadline && !isHeadlineSameAsQual && !looksLikeBareDegree) {
    return {
      descriptiveHeadline: normalizeLegacyAgeGroupText(rawHeadline),
      academicDegree,
    };
  }

  // Derive descriptive headline from tutor's approved offerings & subjectsTaughtSummary
  const schoolOfferings = (tutor.offerings || []).filter(
    (o): o is SchoolOffering => o.track === 'school'
  );
  const quranOfferings = (tutor.offerings || []).filter(
    (o): o is QuranOffering => o.track === 'quran'
  );

  const subjectNames = Array.from(
    new Set(
      schoolOfferings
        .map((o) => SUBJECT_ARABIC_NAMES[o.subjectId])
        .filter(Boolean)
    )
  );
  const stageNames = Array.from(
    new Set(
      schoolOfferings
        .map((o) => STAGE_ARABIC_NAMES[o.stageId])
        .filter(Boolean)
    )
  );
  const quranProgramNames = Array.from(
    new Set(
      quranOfferings
        .map((o) => CANONICAL_QURAN_LEVELS[o.levelId]?.name)
        .filter(Boolean)
    )
  );

  if (schoolOfferings.length > 0 && quranOfferings.length > 0) {
    const subjPart = subjectNames.slice(0, 2).join(' و');
    return {
      descriptiveHeadline: subjPart
        ? `تدريس ${subjPart} والقرآن الكريم والتأسيس بأسلوب مبسط وتفاعلي`
        : 'تدريس المواد الدراسية والقرآن الكريم والتأسيس التربوي',
      academicDegree,
    };
  }

  if (quranOfferings.length > 0 && schoolOfferings.length === 0) {
    if (quranProgramNames.length > 0) {
      return {
        descriptiveHeadline: `متخصص في ${quranProgramNames.slice(0, 2).join(' و')}`,
        academicDegree,
      };
    }
    return {
      descriptiveHeadline: 'متخصص في تحفيظ القرآن الكريم وتجويده وتأسيس القراءة العربية',
      academicDegree,
    };
  }

  if (subjectNames.length > 0) {
    const subjStr = subjectNames.slice(0, 2).join(' و');
    const stageStr = stageNames.length > 0 ? ` — ${stageNames.slice(0, 2).join(' و')}` : '';
    return {
      descriptiveHeadline: `متخصص في تدريس ${subjStr}${stageStr}`,
      academicDegree,
    };
  }

  const summaryTitles = (tutor.subjectsTaughtSummary || [])
    .map((s) => normalizeLegacyAgeGroupText(s.title))
    .filter(Boolean);
  if (summaryTitles.length > 0) {
    return {
      descriptiveHeadline: `متخصص في ${summaryTitles.slice(0, 2).join(' و')}`,
      academicDegree,
    };
  }

  return {
    descriptiveHeadline: rawHeadline
      ? normalizeLegacyAgeGroupText(rawHeadline)
      : 'معلم معتمد في منصة شاطر كلاسيز',
    academicDegree,
  };
}

/**
 * Summarize the tutor's approved specializations and target ages/grades for quick comparison on TutorCard.
 */
export function getTutorSpecializationSummary(tutor: Tutor): {
  primarySpecialization: string;
  suitableAgesOrGrades: string;
  secondaryTags: string[];
} {
  const schoolOfferings = (tutor.offerings || []).filter(
    (o): o is SchoolOffering => o.track === 'school'
  );
  const quranOfferings = (tutor.offerings || []).filter(
    (o): o is QuranOffering => o.track === 'quran'
  );

  const subjectNames = Array.from(
    new Set(
      schoolOfferings
        .map((o) => SUBJECT_ARABIC_NAMES[o.subjectId])
        .filter(Boolean)
    )
  );
  const gradeNames = Array.from(
    new Set(
      schoolOfferings
        .map((o) => GRADE_ARABIC_NAMES[o.gradeId])
        .filter(Boolean)
    )
  );
  const stageNames = Array.from(
    new Set(
      schoolOfferings
        .map((o) => STAGE_ARABIC_NAMES[o.stageId])
        .filter(Boolean)
    )
  );
  const curriculaNames = Array.from(
    new Set(
      schoolOfferings
        .map((o) => CURRICULUM_ARABIC_NAMES[o.curriculumType])
        .filter(Boolean)
    )
  );

  const quranAgeLabels = Array.from(
    new Set(
      quranOfferings
        .map((o) => {
          const ag = CANONICAL_QURAN_AGE_GROUPS[o.ageGroupId];
          return ag ? `${ag.name} (${ag.ageRange})` : '';
        })
        .filter(Boolean)
    )
  );

  const quranProgramLabels = Array.from(
    new Set(
      quranOfferings
        .map((o) => CANONICAL_QURAN_LEVELS[o.levelId]?.name)
        .filter(Boolean)
    )
  );

  let primarySpecialization = '';
  if (subjectNames.length > 0 && quranProgramLabels.length > 0) {
    primarySpecialization = `${subjectNames.slice(0, 2).join(' • ')} + القرآن والتأسيس`;
  } else if (subjectNames.length > 0) {
    primarySpecialization = subjectNames.slice(0, 3).join(' • ');
  } else if (quranProgramLabels.length > 0) {
    primarySpecialization = quranProgramLabels.slice(0, 2).join(' • ');
  } else if (tutor.subjectsTaughtSummary && tutor.subjectsTaughtSummary.length > 0) {
    primarySpecialization = tutor.subjectsTaughtSummary
      .slice(0, 2)
      .map((s) => normalizeLegacyAgeGroupText(s.title))
      .join(' • ');
  } else {
    primarySpecialization = 'تخصصات تعليمية معتمدة';
  }

  let suitableAgesOrGrades = '';
  if (gradeNames.length > 0 && quranAgeLabels.length > 0) {
    suitableAgesOrGrades = `${gradeNames.slice(0, 2).join('، ')} • ${quranAgeLabels[0]}`;
  } else if (gradeNames.length > 0) {
    if (gradeNames.length <= 3) {
      suitableAgesOrGrades = gradeNames.join('، ');
    } else {
      suitableAgesOrGrades = `${gradeNames.slice(0, 2).join('، ')} (+${toArabicDigits(
        gradeNames.length - 2
      )} صفوف)`;
    }
  } else if (stageNames.length > 0) {
    suitableAgesOrGrades = stageNames.join('، ');
  } else if (quranAgeLabels.length > 0) {
    suitableAgesOrGrades = quranAgeLabels.join(' • ');
  } else if (tutor.subjectsTaughtSummary && tutor.subjectsTaughtSummary.length > 0) {
    suitableAgesOrGrades = normalizeLegacyAgeGroupText(tutor.subjectsTaughtSummary[0].gradesRange);
  } else {
    suitableAgesOrGrades = 'جميع المراحل المعتمدة للمعلم';
  }

  const secondaryTags: string[] = [];
  if (curriculaNames.length > 0) {
    curriculaNames.slice(0, 2).forEach((c) => secondaryTags.push(c));
  } else if (tutor.curriculumTags && tutor.curriculumTags.length > 0) {
    tutor.curriculumTags
      .slice(0, 2)
      .forEach((t) => secondaryTags.push(normalizeLegacyAgeGroupText(t)));
  }

  return {
    primarySpecialization,
    suitableAgesOrGrades,
    secondaryTags,
  };
}

/**
 * Timezone & Slot Date/Time Utilities (Default: Africa/Cairo)
 * Uses Intl.DateTimeFormat to accurately compute current date/time and UTC offset in Africa/Cairo
 * without hardcoding GMT+2 year-round (since Egypt uses GMT+3 during Daylight Saving Time).
 */
export function getCurrentPartsInTimezone(timezone = 'Africa/Cairo'): {
  dateStr: string; // YYYY-MM-DD
  timeStr: string; // HH:mm:ss
} {
  const tz = timezone || 'Africa/Cairo';
  try {
    const now = new Date();
    const dateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const timeFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    return {
      dateStr: dateFormatter.format(now),
      timeStr: timeFormatter.format(now),
    };
  } catch {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return {
      dateStr: `${y}-${m}-${d}`,
      timeStr: `${hh}:${mm}:${ss}`,
    };
  }
}

/**
 * Check if a slot (YYYY-MM-DD + HH:mm[:ss]) is strictly in the future in its timezone (default Africa/Cairo).
 */
export function isSlotInFuture(
  slotDate: string,
  startTime: string,
  timezone = 'Africa/Cairo'
): boolean {
  if (!slotDate || !startTime) return false;
  const cleanDate = slotDate.trim().slice(0, 10);
  const rawTime = startTime.trim();
  const cleanTime = rawTime.length === 5 ? `${rawTime}:00` : rawTime.slice(0, 8);
  const nowParts = getCurrentPartsInTimezone(timezone || 'Africa/Cairo');

  if (cleanDate > nowParts.dateStr) return true;
  if (cleanDate < nowParts.dateStr) return false;
  return cleanTime > nowParts.timeStr;
}

/**
 * Get a clear, accurate Arabic timezone label with dynamic offset (e.g. "بتوقيت القاهرة — GMT+2" or "بتوقيت القاهرة — GMT+3")
 */
export function getTimezoneArabicLabel(timezone = 'Africa/Cairo'): string {
  const tz = (timezone || 'Africa/Cairo').trim();
  let offsetPart = '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date());
    const tzName = parts.find((p) => p.type === 'timeZoneName')?.value;
    if (tzName) {
      offsetPart = ` (${tzName})`;
    }
  } catch {
    // ignore if shortOffset is unsupported
  }

  if (tz === 'Africa/Cairo') {
    return `بتوقيت القاهرة${offsetPart}`;
  }
  if (tz === 'Asia/Riyadh') {
    return `بتوقيت مكة المكرمة${offsetPart}`;
  }
  return `بتوقيت ${tz}${offsetPart}`;
}

/**
 * Filter and sort available trial slots: excludes booked, unavailable, adminSuspended, and past slots.
 */
export function filterValidAvailableTrialSlots(slots: TutorAvailableSlot[]): TutorAvailableSlot[] {
  if (!Array.isArray(slots)) return [];
  return slots
    .filter(
      (s) =>
        s &&
        s.isAvailable !== false &&
        !s.isBooked &&
        !s.adminSuspended &&
        isSlotInFuture(s.slotDate, s.startTime, s.timezone || 'Africa/Cairo')
    )
    .sort((a, b) => {
      const cmpDate = a.slotDate.localeCompare(b.slotDate);
      if (cmpDate !== 0) return cmpDate;
      return a.startTime.localeCompare(b.startTime);
    });
}

/**
 * Filter and sort available private 1:1 slots: excludes booked, unavailable, adminSuspended, and past slots.
 */
export function filterValidAvailablePrivateSlots(slots: TutorPrivateSlot[]): TutorPrivateSlot[] {
  if (!Array.isArray(slots)) return [];
  return slots
    .filter(
      (s) =>
        s &&
        s.isAvailable !== false &&
        !s.isBooked &&
        !s.adminSuspended &&
        isSlotInFuture(s.slotDate, s.startTime, s.timezone || 'Africa/Cairo')
    )
    .sort((a, b) => {
      const cmpDate = a.slotDate.localeCompare(b.slotDate);
      if (cmpDate !== 0) return cmpDate;
      return a.startTime.localeCompare(b.startTime);
    });
}

/**
 * Format HH:mm[:ss] into readable Arabic 12-hour time (e.g. "٤:٣٠ م" or "١٠:٠٠ ص")
 */
export function formatTimeArabic12h(timeStr: string, useArabicDigits = true): string {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] || '0', 10);
  if (isNaN(h) || isNaN(m)) return timeStr;

  const period = h >= 12 ? 'م' : 'ص';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const minPadded = String(m).padStart(2, '0');
  const raw = `${h12}:${minPadded} ${period}`;
  return useArabicDigits ? toArabicDigits(raw) : raw;
}

/**
 * Format YYYY-MM-DD into a concise Arabic label (e.g. "غداً • الثلاثاء ٢٥ أكتوبر" or "الأربعاء ٢٦ أكتوبر")
 */
export function formatSlotDateArabic(
  dateStr: string,
  timezone = 'Africa/Cairo'
): {
  dayName: string;
  shortDate: string;
  fullLabel: string;
  relativeBadge: string | null;
} {
  if (!dateStr) {
    return { dayName: '', shortDate: '', fullLabel: '', relativeBadge: null };
  }
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0));

  const dayName = new Intl.DateTimeFormat('ar-EG', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(dateObj);

  const shortDate = new Intl.DateTimeFormat('ar-EG', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(dateObj);

  const todayStr = getCurrentPartsInTimezone(timezone).dateStr;
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const todayUtc = Date.UTC(ty, (tm || 1) - 1, td || 1, 12, 0, 0);
  const diffDays = Math.round((dateObj.getTime() - todayUtc) / (1000 * 60 * 60 * 24));

  let relativeBadge: string | null = null;
  if (diffDays === 0) relativeBadge = 'اليوم';
  else if (diffDays === 1) relativeBadge = 'غداً';

  const fullLabel = relativeBadge ? `${relativeBadge} (${dayName} ${shortDate})` : `${dayName} ${shortDate}`;

  return {
    dayName,
    shortDate,
    fullLabel,
    relativeBadge,
  };
}

/**
 * Format an earliest available trial slot into a concise, trustworthy badge text for TutorCard.
 */
export function formatEarliestTrialSlotBadge(slot: TutorAvailableSlot | null | undefined): string | null {
  if (!slot) return null;
  if (!isSlotInFuture(slot.slotDate, slot.startTime, slot.timezone || 'Africa/Cairo')) {
    return null;
  }
  const dateInfo = formatSlotDateArabic(slot.slotDate, slot.timezone || 'Africa/Cairo');
  const timeLabel = formatTimeArabic12h(slot.startTime, true);
  return `${dateInfo.fullLabel} — ${timeLabel}`;
}

/**
 * Canonical Tutor Application Status Metadata & Resolver
 * Ensures all views (Admin List, Admin Detail, Tutor Portal) render application status
 * from a single source of truth, never mapping 'draft' or unknown statuses to 'Under Review'.
 */
export type CanonicalApplicationStatusKey =
  | 'draft'
  | 'submitted'
  | 'needs_info'
  | 'approved'
  | 'rejected'
  | 'unknown';

export interface TutorApplicationStatusDisplayInfo {
  canonicalKey: CanonicalApplicationStatusKey;
  rawStatus: string;
  listBadgeLabel: string;
  detailBadgeLabel: string;
  tutorBadgeLabel: string;
  descriptionText: string;
  badgeStyle: string;
  isReviewableByAdmin: boolean;
  isEditableByTutor: boolean;
  isSubmittedOrReviewed: boolean;
}

export function resolveTutorApplicationStatus(
  rawStatus: string | null | undefined
): TutorApplicationStatusDisplayInfo {
  const clean = (rawStatus || '').trim().toLowerCase();

  switch (clean) {
    case 'draft':
      return {
        canonicalKey: 'draft',
        rawStatus: clean,
        listBadgeLabel: 'مسودة',
        detailBadgeLabel: 'مسودة — لم يُرسل للمراجعة بعد',
        tutorBadgeLabel: 'مسودة (غير مرسل بعد)',
        descriptionText:
          'هذا الطلب محفوظ كمسودة لدى المعلم ولم يتم إرساله للمراجعة بعد. لا يمكن اتخاذ قرار إداري بالقبول أو الرفض قبل أن يُكمل المعلم إرسال الطلب وموافقته على السياسة.',
        badgeStyle: 'bg-slate-100 text-slate-700 border border-slate-300',
        isReviewableByAdmin: false,
        isEditableByTutor: true,
        isSubmittedOrReviewed: false,
      };

    case 'submitted':
    case 'pending_review':
    case 'interview_scheduled':
      return {
        canonicalKey: 'submitted',
        rawStatus: clean,
        listBadgeLabel: 'قيد المراجعة',
        detailBadgeLabel: 'قيد المراجعة الإدارية',
        tutorBadgeLabel: 'قيد المراجعة لدى الإدارة',
        descriptionText:
          'تم إرسال هذا الطلب رسميًا من المعلم وهو جاهز للمراجعة الإدارية واتخاذ قرار (القبول، أو طلب استكمال بيانات، أو الرفض).',
        badgeStyle: 'bg-blue-50 text-[#0D4E8B] border border-blue-200',
        isReviewableByAdmin: true,
        isEditableByTutor: false,
        isSubmittedOrReviewed: true,
      };

    case 'needs_info':
      return {
        canonicalKey: 'needs_info',
        rawStatus: clean,
        listBadgeLabel: 'مطلوب استكمال بيانات',
        detailBadgeLabel: 'مطلوب استكمال بيانات من المعلم',
        tutorBadgeLabel: 'مطلوب استكمال بيانات',
        descriptionText:
          'طلبت الإدارة استكمال أو توضيح بعض البيانات من المعلم. يستطيع المعلم تعديل طلبه وإعادة إرساله، كما يمكن للإدارة تحديث قرارها.',
        badgeStyle: 'bg-amber-50 text-amber-800 border border-amber-200',
        isReviewableByAdmin: true,
        isEditableByTutor: true,
        isSubmittedOrReviewed: true,
      };

    case 'approved':
      return {
        canonicalKey: 'approved',
        rawStatus: clean,
        listBadgeLabel: 'مقبول',
        detailBadgeLabel: 'مقبول وتم إنشاء الملف',
        tutorBadgeLabel: 'تم اعتماد وقبول طلبك',
        descriptionText: 'تم قبول الطلب واعتماد المعلم وإنشاء ملفه التدريسي في المنصة.',
        badgeStyle: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
        isReviewableByAdmin: false,
        isEditableByTutor: false,
        isSubmittedOrReviewed: true,
      };

    case 'rejected':
      return {
        canonicalKey: 'rejected',
        rawStatus: clean,
        listBadgeLabel: 'مرفوض',
        detailBadgeLabel: 'مرفوض',
        tutorBadgeLabel: 'مرفوض',
        descriptionText: 'تم رفض طلب الانضمام بعد المراجعة الإدارية.',
        badgeStyle: 'bg-rose-50 text-rose-800 border border-rose-200',
        isReviewableByAdmin: false,
        isEditableByTutor: false,
        isSubmittedOrReviewed: true,
      };

    default:
      return {
        canonicalKey: 'unknown',
        rawStatus: clean || 'غير محدد',
        listBadgeLabel: `حالة غير معروفة (${clean || 'فارغ'})`,
        detailBadgeLabel: `حالة غير معروفة (${clean || 'فارغ'}) — لم يُؤكد الإرسال`,
        tutorBadgeLabel: 'حالة غير معروفة',
        descriptionText:
          'حالة هذا الطلب غير معروفة في النظام ولا يمكن معاملته كطلب مُرسل للمراجعة قبل التحقق منه.',
        badgeStyle: 'bg-slate-100 text-slate-600 border border-slate-300',
        isReviewableByAdmin: false,
        isEditableByTutor: false,
        isSubmittedOrReviewed: false,
      };
  }
}

/**
 * Explicit lookup map ONLY for Arabic-taught registration form subject keys.
 * Crucially: English-taught subjects ('math_en', 'science_en', 'physics_en', 'chemistry_en', 'biology_en')
 * are NEVER in this map and must NEVER be merged into 'math', 'science', etc.!
 */
export const EXPLICIT_ARABIC_FORM_SUBJECT_MAP: Readonly<Record<string, string>> = {
  math_ar: 'math',
  science_ar: 'science',
  physics_ar: 'physics',
  chemistry_ar: 'chemistry',
  biology_ar: 'biology',
};

export const ARABIC_TAUGHT_SUBJECT_IDS: ReadonlySet<string> = new Set([
  'math',
  'math_ar',
  'science',
  'science_ar',
  'physics',
  'physics_ar',
  'chemistry',
  'chemistry_ar',
  'biology',
  'biology_ar',
  'arabic',
  'social',
]);

export const ENGLISH_TAUGHT_SUBJECT_IDS: ReadonlySet<string> = new Set([
  'math_en',
  'science_en',
  'physics_en',
  'chemistry_en',
  'biology_en',
  'english',
]);

/**
 * Resolve a subject ID explicitly against reference subject IDs without automatic suffix stripping.
 * - Never merges 'math_en' (Math) into 'math' (الرياضيات).
 * - Only maps explicit Arabic form keys ('math_ar' -> 'math', etc.) when teachingLanguage is not 'english'
 *   and the '_ar' key is not itself present in availableSubjectIds.
 */
export function resolveExplicitSubjectId(
  rawSubjectId: string | null | undefined,
  teachingLanguage?: string | null,
  availableSubjectIds?: ReadonlySet<string>
): string {
  const clean = (rawSubjectId || '').trim();
  if (!clean) return '';

  // 1. Direct match in reference subjects if available
  if (availableSubjectIds && availableSubjectIds.has(clean)) {
    return clean;
  }

  // 2. Explicit Arabic form alias mapping ONLY when language is not 'english'
  const cleanLang = (teachingLanguage || '').trim().toLowerCase();
  if (cleanLang !== 'english' && Object.prototype.hasOwnProperty.call(EXPLICIT_ARABIC_FORM_SUBJECT_MAP, clean)) {
    return EXPLICIT_ARABIC_FORM_SUBJECT_MAP[clean];
  }

  return clean;
}

/**
 * Safe parser for tutor experience years text.
 * Matches SQL `public.parse_tutor_experience_years`:
 * - Maps canonical Arabic/code range labels to the reliable minimum of the range (never the average/midpoint).
 * - Never rounds "أقل من سنة" or "أقل من سنتين" up to 1 full year (returns 0; the original text is preserved in experience_badge_text).
 * - Extracts ONLY the leading number if numeric text is given (so "1-3" becomes 1, NEVER 13).
 * - Returns 0 when empty/unrecognized in accordance with tutors.years_of_experience >= 0 constraint.
 */
export function parseTutorExperienceYearsSafe(experienceText: string | null | undefined): number {
  const clean = (experienceText || '').trim();
  if (!clean) return 0;

  switch (clean) {
    case 'أقل من سنة':
    case 'أقل من سنتين':
    case 'less_than_1':
    case '0-1':
      return 0;
    case 'من سنة إلى ٣ سنوات':
    case 'من سنة إلى 3 سنوات':
    case '1-3':
      return 1;
    case 'من سنتين إلى ٣ سنوات':
    case 'من سنتين إلى 3 سنوات':
    case '2-3':
      return 2;
    case 'من ٣ إلى ٥ سنوات':
    case 'من 3 إلى 5 سنوات':
    case '3-5':
      return 3;
    case 'من ٤ إلى ٦ سنوات':
    case 'من 4 إلى 6 سنوات':
    case '4-6':
      return 4;
    case 'من ٥ إلى ١٠ سنوات':
    case 'من 5 إلى 10 سنوات':
    case '5-10':
      return 5;
    case 'أكثر من ٦ سنوات':
    case 'أكثر من 6 سنوات':
    case '6+':
      return 6;
    case 'من ٧ إلى ١٠ سنوات':
    case 'من 7 إلى 10 سنوات':
    case '7-10':
      return 7;
    case 'أكثر من ١٠ سنوات':
    case 'أكثر من 10 سنوات':
    case '10+':
      return 10;
    default: {
      if (clean.startsWith('أقل من')) {
        return 0;
      }
      const arabicIndic = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
      let western = clean;
      for (let i = 0; i < 10; i++) {
        western = western.replaceAll(arabicIndic[i], String(i));
      }
      const match = western.match(/^[0-9]+/);
      if (match) {
        const parsed = parseInt(match[0], 10);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
      }
      return 0;
    }
  }
}

export interface SchoolSpecializationReferenceData {
  subjects: Array<{ id: string; name: string; english_name?: string | null; is_active?: boolean }>;
  stages: Array<{ id: string; name: string; is_active?: boolean }>;
  grades: Array<{ id: string; stage_id: string; name: string; is_active?: boolean }>;
  curricula: Array<{ id: string; name: string; is_active?: boolean }>;
  courseOptions: Array<{
    id: string;
    grade_id: string;
    subject_id: string;
    curriculum_id: string;
    is_active?: boolean;
  }>;
}

export interface SchoolSpecializationValidationResult {
  isValid: boolean;
  matchedOptionIds: string[];
  normalizedSpecializations: any[];
  subjects: string[];
  stages: string[];
  curricula: string[];
  unmatchedItems: string[];
}

/**
 * Strictly validates and resolves school specializations against reference tables and school_course_options.
 * - Never strips '_en' or merges 'math_en' (Math) into 'math' (الرياضيات).
 * - Validates subject, grade, stage (grade.stage_id === stageId), curriculum, teachingLanguage, and is_active.
 * - Never silently drops unmatched specialization items or grades when another item succeeds;
 *   returns all items needing correction in `unmatchedItems`.
 */
export function validateAndResolveSchoolSpecializations(params: {
  specializations?: any[] | null;
  directCourseOptionIds?: string[] | null;
  referenceData: SchoolSpecializationReferenceData;
}): SchoolSpecializationValidationResult {
  const { specializations, directCourseOptionIds, referenceData } = params;

  const subjectsMap = new Map(referenceData.subjects.map((s) => [s.id, s]));
  const availableSubjectIds = new Set(referenceData.subjects.map((s) => s.id));
  const stagesMap = new Map(referenceData.stages.map((s) => [s.id, s]));
  const gradesMap = new Map(referenceData.grades.map((g) => [g.id, g]));
  const curriculaMap = new Map(referenceData.curricula.map((c) => [c.id, c]));
  const courseOptionsById = new Map(referenceData.courseOptions.map((co) => [co.id, co]));
  const courseOptionsByTriplet = new Map(
    referenceData.courseOptions.map((co) => [`${co.grade_id}|${co.subject_id}|${co.curriculum_id}`, co])
  );

  const matchedOptionIds: string[] = [];
  const matchedOptionIdSet = new Set<string>();
  const normalizedSpecializations: any[] = [];
  const subjectsSet = new Set<string>();
  const stagesSet = new Set<string>();
  const curriculaSet = new Set<string>();
  const unmatchedItems: string[] = [];

  // 1. Validate direct school_course_option_ids if provided
  if (Array.isArray(directCourseOptionIds) && directCourseOptionIds.length > 0) {
    for (const rawOptId of directCourseOptionIds) {
      const optId = String(rawOptId || '').trim();
      if (!optId) continue;

      const opt = courseOptionsById.get(optId);
      if (!opt) {
        unmatchedItems.push(`معرف خيار المقرر (${optId}) غير موجود في جدول خيارات المقررات المعتمدة.`);
        continue;
      }

      const sub = subjectsMap.get(opt.subject_id);
      const grade = gradesMap.get(opt.grade_id);
      const stage = grade ? stagesMap.get(grade.stage_id) : undefined;
      const curr = curriculaMap.get(opt.curriculum_id);

      const allActive =
        opt.is_active !== false &&
        Boolean(sub && sub.is_active !== false) &&
        Boolean(grade && grade.is_active !== false) &&
        Boolean(stage && stage.is_active !== false) &&
        Boolean(curr && curr.is_active !== false);

      if (!allActive) {
        unmatchedItems.push(`خيار المقرر (${optId}) أو أحد عناصره المرجعية غير مفعّل حالياً.`);
        continue;
      }

      if (!matchedOptionIdSet.has(opt.id)) {
        matchedOptionIdSet.add(opt.id);
        matchedOptionIds.push(opt.id);
      }
      if (sub) subjectsSet.add(sub.id);
      if (stage) stagesSet.add(stage.id);
      if (curr) curriculaSet.add(curr.id);
    }
  }

  // 2. Validate structured specializations
  const specsList = Array.isArray(specializations) ? specializations : [];
  specsList.forEach((spec, index) => {
    const specNum = index + 1;
    if (!spec || typeof spec !== 'object') {
      unmatchedItems.push(`التخصص الدراسي رقم (${specNum}): بنية بيانات التخصص غير صالحة.`);
      normalizedSpecializations.push(spec);
      return;
    }

    const directCoId = String(spec.courseOptionId || '').trim();
    if (directCoId) {
      const opt = courseOptionsById.get(directCoId);
      if (!opt) {
        unmatchedItems.push(`التخصص الدراسي رقم (${specNum}): معرف خيار المقرر (${directCoId}) غير موجود في قاعدة البيانات.`);
        normalizedSpecializations.push(spec);
        return;
      }
      const sub = subjectsMap.get(opt.subject_id);
      const grade = gradesMap.get(opt.grade_id);
      const stage = grade ? stagesMap.get(grade.stage_id) : undefined;
      const curr = curriculaMap.get(opt.curriculum_id);
      const allActive =
        opt.is_active !== false &&
        Boolean(sub && sub.is_active !== false) &&
        Boolean(grade && grade.is_active !== false) &&
        Boolean(stage && stage.is_active !== false) &&
        Boolean(curr && curr.is_active !== false);

      if (!allActive) {
        unmatchedItems.push(`التخصص الدراسي رقم (${specNum}): خيار المقرر (${directCoId}) غير مفعّل حالياً.`);
        normalizedSpecializations.push(spec);
        return;
      }

      if (!matchedOptionIdSet.has(opt.id)) {
        matchedOptionIdSet.add(opt.id);
        matchedOptionIds.push(opt.id);
      }
      if (sub) subjectsSet.add(sub.id);
      if (stage) stagesSet.add(stage.id);
      if (curr) curriculaSet.add(curr.id);
      normalizedSpecializations.push(spec);
      return;
    }

    const rawSubjId = String(spec.subjectId || '').trim();
    const rawLang = String(spec.teachingLanguage || '').trim().toLowerCase();
    const rawStageId = String(spec.stageId || '').trim();
    const rawCurrId = String(
      spec.curriculumType || spec.curriculumId || spec.curriculumTypeId || ''
    ).trim();

    if (!rawSubjId) {
      unmatchedItems.push(`التخصص الدراسي رقم (${specNum}): لم يتم تحديد المادة الدراسية.`);
      normalizedSpecializations.push(spec);
      return;
    }

    // Check teachingLanguage consistency with subject (never merge math_en with math!)
    const expectedLang = ENGLISH_TAUGHT_SUBJECT_IDS.has(rawSubjId)
      ? 'english'
      : ARABIC_TAUGHT_SUBJECT_IDS.has(rawSubjId)
      ? 'arabic'
      : '';

    if (rawLang && rawLang !== 'arabic' && rawLang !== 'english') {
      unmatchedItems.push(
        `التخصص الدراسي رقم (${specNum}): لغة التدريس (${rawLang}) غير صالحة للمادة (${rawSubjId}).`
      );
      normalizedSpecializations.push(spec);
      return;
    }

    if (expectedLang && rawLang && rawLang !== expectedLang) {
      unmatchedItems.push(
        `التخصص الدراسي رقم (${specNum}): تعارض بين المادة المختارة (${rawSubjId}) ولغة التدريس (${rawLang}).`
      );
      normalizedSpecializations.push(spec);
      return;
    }

    const resolvedSubjId = resolveExplicitSubjectId(rawSubjId, rawLang || expectedLang, availableSubjectIds);
    const subjectObj = subjectsMap.get(resolvedSubjId);

    if (!subjectObj) {
      unmatchedItems.push(
        `التخصص الدراسي رقم (${specNum}): المادة (${rawSubjId}) غير موجودة في جدول المواد المرجعية المعتمدة.`
      );
      normalizedSpecializations.push(spec);
      return;
    }

    if (subjectObj.is_active === false) {
      unmatchedItems.push(
        `التخصص الدراسي رقم (${specNum}): المادة (${subjectObj.name || resolvedSubjId}) غير مفعّلة حالياً.`
      );
      normalizedSpecializations.push(spec);
      return;
    }

    if (!rawStageId) {
      unmatchedItems.push(
        `التخصص الدراسي رقم (${specNum}) (${subjectObj.name}): لم يتم تحديد المرحلة الدراسية.`
      );
      normalizedSpecializations.push(spec);
      return;
    }

    const stageObj = stagesMap.get(rawStageId);
    if (!stageObj) {
      unmatchedItems.push(
        `التخصص الدراسي رقم (${specNum}) (${subjectObj.name}): المرحلة الدراسية (${rawStageId}) غير موجودة في جدول المراحل المرجعية.`
      );
      normalizedSpecializations.push(spec);
      return;
    }

    if (stageObj.is_active === false) {
      unmatchedItems.push(
        `التخصص الدراسي رقم (${specNum}) (${subjectObj.name}): المرحلة الدراسية (${stageObj.name}) غير مفعّلة حالياً.`
      );
      normalizedSpecializations.push(spec);
      return;
    }

    if (!rawCurrId) {
      unmatchedItems.push(
        `التخصص الدراسي رقم (${specNum}) (${subjectObj.name}): لم يتم تحديد نوع المنهج الدراسي.`
      );
      normalizedSpecializations.push(spec);
      return;
    }

    const currObj = curriculaMap.get(rawCurrId);
    if (!currObj) {
      unmatchedItems.push(
        `التخصص الدراسي رقم (${specNum}) (${subjectObj.name}): نوع المنهج (${rawCurrId}) غير موجود في جدول المناهج المرجعية.`
      );
      normalizedSpecializations.push(spec);
      return;
    }

    if (currObj.is_active === false) {
      unmatchedItems.push(
        `التخصص الدراسي رقم (${specNum}) (${subjectObj.name}): نوع المنهج (${currObj.name}) غير مفعّل حالياً.`
      );
      normalizedSpecializations.push(spec);
      return;
    }

    const gradeIds: string[] = Array.isArray(spec.gradeIds) ? spec.gradeIds : [];
    if (gradeIds.length === 0) {
      unmatchedItems.push(
        `التخصص الدراسي رقم (${specNum}) (${subjectObj.name}): يجب اختيار صف دراسي واحد على الأقل.`
      );
      normalizedSpecializations.push(spec);
      return;
    }

    let validGradeMatchesForSpec = 0;
    for (const rawGradeId of gradeIds) {
      const gradeId = String(rawGradeId || '').trim();
      if (!gradeId) {
        unmatchedItems.push(
          `التخصص الدراسي رقم (${specNum}) (${subjectObj.name}): يحتوي على معرف صف دراسي فارغ.`
        );
        continue;
      }

      const gradeObj = gradesMap.get(gradeId);
      if (!gradeObj) {
        unmatchedItems.push(
          `التخصص الدراسي رقم (${specNum}) (${subjectObj.name}): الصف الدراسي (${gradeId}) غير موجود في جدول الصفوف المرجعية.`
        );
        continue;
      }

      if (gradeObj.is_active === false) {
        unmatchedItems.push(
          `التخصص الدراسي رقم (${specNum}) (${subjectObj.name}): الصف الدراسي (${gradeObj.name}) غير مفعّل حالياً.`
        );
        continue;
      }

      if (gradeObj.stage_id !== stageObj.id) {
        unmatchedItems.push(
          `التخصص الدراسي رقم (${specNum}) (${subjectObj.name}): الصف الدراسي (${gradeObj.name}) لا يتبع المرحلة المختارة (${stageObj.name}).`
        );
        continue;
      }

      const courseOpt = courseOptionsByTriplet.get(`${gradeObj.id}|${subjectObj.id}|${currObj.id}`);
      if (!courseOpt) {
        unmatchedItems.push(
          `التخصص الدراسي رقم (${specNum}): لا يوجد خيار مقرر معتمد للتركيبة (المادة: ${subjectObj.name}، الصف: ${gradeObj.name}، المنهج: ${currObj.name}).`
        );
        continue;
      }

      if (courseOpt.is_active === false) {
        unmatchedItems.push(
          `التخصص الدراسي رقم (${specNum}): خيار المقرر (المادة: ${subjectObj.name}، الصف: ${gradeObj.name}، المنهج: ${currObj.name}) غير مفعّل حالياً.`
        );
        continue;
      }

      validGradeMatchesForSpec += 1;
      if (!matchedOptionIdSet.has(courseOpt.id)) {
        matchedOptionIdSet.add(courseOpt.id);
        matchedOptionIds.push(courseOpt.id);
      }
    }

    if (validGradeMatchesForSpec > 0) {
      subjectsSet.add(subjectObj.id);
      stagesSet.add(stageObj.id);
      curriculaSet.add(currObj.id);
    }

    normalizedSpecializations.push({
      ...spec,
      subjectId: subjectObj.id,
      teachingLanguage: (rawLang || expectedLang || 'arabic') as 'arabic' | 'english',
      stageId: stageObj.id,
      curriculumType: currObj.id,
    });
  });

  if (matchedOptionIds.length === 0 && unmatchedItems.length === 0) {
    unmatchedItems.push('يجب اختيار تخصص مدرسي صالح واحد على الأقل مطابق لجدول خيارات المقررات المعتمدة.');
  }

  return {
    isValid: unmatchedItems.length === 0 && matchedOptionIds.length > 0,
    matchedOptionIds,
    normalizedSpecializations:
      normalizedSpecializations.length > 0 ? normalizedSpecializations : specsList,
    subjects: Array.from(subjectsSet),
    stages: Array.from(stagesSet),
    curricula: Array.from(curriculaSet),
    unmatchedItems,
  };
}

export interface QuranSpecializationReferenceData {
  ageGroups: Array<{ id: string; name: string; is_active?: boolean }>;
  levels: Array<{ id: string; name: string; is_active?: boolean }>;
}

export interface QuranSpecializationValidationResult {
  isValid: boolean;
  ageGroups: string[];
  levels: string[];
  quranOfferings: Array<{ ageGroupId: string; levelId: string }>;
  unmatchedItems: string[];
}

/**
 * Strictly validates Quran track specializations (age groups, programs, and explicit pairs).
 * Preserves explicit (ageGroupId, levelId) pairs in quranOfferings when present.
 */
export function validateAndResolveQuranSpecializations(params: {
  ageGroups?: string[] | null;
  levels?: string[] | null;
  quranOfferings?: Array<{ ageGroupId?: string; age_group_id?: string; levelId?: string; level_id?: string }> | null;
  referenceData: QuranSpecializationReferenceData;
}): QuranSpecializationValidationResult {
  const { ageGroups, levels, quranOfferings, referenceData } = params;
  const ageMap = new Map(referenceData.ageGroups.map((a) => [a.id, a]));
  const levelMap = new Map(referenceData.levels.map((l) => [l.id, l]));

  const validAges: string[] = [];
  const validAgesSet = new Set<string>();
  const validLevels: string[] = [];
  const validLevelsSet = new Set<string>();
  const validOfferings: Array<{ ageGroupId: string; levelId: string }> = [];
  const seenPairs = new Set<string>();
  const unmatchedItems: string[] = [];

  if (Array.isArray(ageGroups)) {
    for (const rawAge of ageGroups) {
      const ageId = String(rawAge || '').trim();
      if (!ageId) continue;
      const ageObj = ageMap.get(ageId);
      if (!ageObj) {
        unmatchedItems.push(`الفئة العمرية (${ageId}) غير موجودة في جدول الفئات العمرية المعتمدة.`);
      } else if (ageObj.is_active === false) {
        unmatchedItems.push(`الفئة العمرية (${ageObj.name}) غير مفعّلة حالياً.`);
      } else if (!validAgesSet.has(ageObj.id)) {
        validAgesSet.add(ageObj.id);
        validAges.push(ageObj.id);
      }
    }
  }

  if (Array.isArray(levels)) {
    for (const rawLvl of levels) {
      const lvlId = String(rawLvl || '').trim();
      if (!lvlId) continue;
      const lvlObj = levelMap.get(lvlId);
      if (!lvlObj) {
        unmatchedItems.push(`برنامج القرآن والتأسيس (${lvlId}) غير موجود في جدول البرامج المعتمدة.`);
      } else if (lvlObj.is_active === false) {
        unmatchedItems.push(`برنامج القرآن والتأسيس (${lvlObj.name}) غير مفعّل حالياً.`);
      } else if (!validLevelsSet.has(lvlObj.id)) {
        validLevelsSet.add(lvlObj.id);
        validLevels.push(lvlObj.id);
      }
    }
  }

  if (Array.isArray(quranOfferings) && quranOfferings.length > 0) {
    quranOfferings.forEach((pair, idx) => {
      const pairNum = idx + 1;
      if (!pair || typeof pair !== 'object') {
        unmatchedItems.push(`تخصص القرآن رقم (${pairNum}): بنية الزوج غير صالحة.`);
        return;
      }
      const ageId = String(pair.ageGroupId || pair.age_group_id || '').trim();
      const lvlId = String(pair.levelId || pair.level_id || '').trim();
      if (!ageId || !lvlId) {
        unmatchedItems.push(`تخصص القرآن رقم (${pairNum}): يجب تحديد الفئة العمرية والبرنامج معاً.`);
        return;
      }
      const ageObj = ageMap.get(ageId);
      if (!ageObj) {
        unmatchedItems.push(`تخصص القرآن رقم (${pairNum}): الفئة العمرية (${ageId}) غير موجودة في الجداول المرجعية.`);
        return;
      }
      if (ageObj.is_active === false) {
        unmatchedItems.push(`تخصص القرآن رقم (${pairNum}): الفئة العمرية (${ageObj.name}) غير مفعّلة حالياً.`);
        return;
      }
      const lvlObj = levelMap.get(lvlId);
      if (!lvlObj) {
        unmatchedItems.push(`تخصص القرآن رقم (${pairNum}): البرنامج (${lvlId}) غير موجود في الجداول المرجعية.`);
        return;
      }
      if (lvlObj.is_active === false) {
        unmatchedItems.push(`تخصص القرآن رقم (${pairNum}): البرنامج (${lvlObj.name}) غير مفعّل حالياً.`);
        return;
      }

      const pairKey = `${ageObj.id}|${lvlObj.id}`;
      if (!seenPairs.has(pairKey)) {
        seenPairs.add(pairKey);
        validOfferings.push({ ageGroupId: ageObj.id, levelId: lvlObj.id });
      }
      if (!validAgesSet.has(ageObj.id)) {
        validAgesSet.add(ageObj.id);
        validAges.push(ageObj.id);
      }
      if (!validLevelsSet.has(lvlObj.id)) {
        validLevelsSet.add(lvlObj.id);
        validLevels.push(lvlObj.id);
      }
    });
  } else if (validAges.length > 0 && validLevels.length > 0) {
    for (const ageId of validAges) {
      for (const lvlId of validLevels) {
        const pairKey = `${ageId}|${lvlId}`;
        if (!seenPairs.has(pairKey)) {
          seenPairs.add(pairKey);
          validOfferings.push({ ageGroupId: ageId, levelId: lvlId });
        }
      }
    }
  }

  if ((validAges.length === 0 || validLevels.length === 0 || validOfferings.length === 0) && unmatchedItems.length === 0) {
    unmatchedItems.push('يجب اختيار فئة عمرية صالحة واحدة وبرنامج قرآني أو تأسيسي صالح واحد على الأقل.');
  }

  return {
    isValid: unmatchedItems.length === 0 && validOfferings.length > 0,
    ageGroups: validAges,
    levels: validLevels,
    quranOfferings: validOfferings,
    unmatchedItems,
  };
}


