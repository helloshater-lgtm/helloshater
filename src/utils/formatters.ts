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
  arabic: 'اللغة العربية',
  english: 'اللغة الإنجليزية',
  science: 'العلوم',
  social: 'الدراسات الاجتماعية',
  physics: 'الفيزياء',
  chemistry: 'الكيمياء',
  biology: 'الأحياء',
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
