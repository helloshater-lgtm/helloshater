import {
  TutorAvailableSlot,
  TutorPrivateSlot,
  ApprovedSpecializationItem,
} from '../types';
import {
  isSlotInFuture,
  SUPPORTED_TUTOR_CURRENCIES,
  SUPPORTED_TUTOR_TIMEZONES,
} from './formatters';

// ============================================================================
// 1. Phone Normalization & Admin WhatsApp Contact Resolution
// ============================================================================

const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const EASTERN_ARABIC_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/**
 * Converts Eastern Arabic (٠-٩) and Persian (۰-۹) digits to Western ASCII digits (0-9).
 */
export function convertArabicDigitsToAscii(input: string): string {
  if (!input) return '';
  return String(input)
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(EASTERN_ARABIC_DIGITS.indexOf(d)));
}

export interface NormalizedTutorPhoneResult {
  isValid: boolean;
  e164Digits: string; // Digits only without '+' for wa.me/<e164Digits>
  displayPhone: string; // Formatted with '+' for UI display (e.g. +201012345678)
  countryCode: string; // Normalized country code with '+' (e.g. +20, +966)
  invalidReason?: string;
}

const KNOWN_CALLING_CODES = [
  '20',   // Egypt
  '966',  // Saudi Arabia
  '971',  // UAE
  '965',  // Kuwait
  '974',  // Qatar
  '973',  // Bahrain
  '968',  // Oman
  '962',  // Jordan
  '961',  // Lebanon
  '970',  // Palestine
  '964',  // Iraq
  '212',  // Morocco
  '213',  // Algeria
  '216',  // Tunisia
  '218',  // Libya
  '249',  // Sudan
  '967',  // Yemen
  '963',  // Syria
  '90',   // Turkey
  '44',   // UK
  '49',   // Germany
  '33',   // France
  '1',    // US / Canada
];

/**
 * Validates country-specific mobile length and prefix rules after country calling code is resolved.
 */
function validateInternationalDigits(e164Digits: string, countryCodeDigits: string): string | null {
  if (!/^[1-9][0-9]{7,14}$/.test(e164Digits)) {
    return 'رقم التواصل يجب أن يتكون من 8 إلى 15 رقمًا دوليًا صحيحًا.';
  }

  const nationalPart = countryCodeDigits && e164Digits.startsWith(countryCodeDigits)
    ? e164Digits.slice(countryCodeDigits.length)
    : '';

  if (countryCodeDigits === '20') {
    // Egypt mobile: +20 followed by 10 digits starting with 10, 11, 12, or 15
    if (!/^(10|11|12|15)[0-9]{8}$/.test(nationalPart)) {
      return 'رقم الموبايل المصري غير صالح (يجب أن يتكون من 10 أرقام بعد +20 ويبدأ بـ 10 أو 11 أو 12 أو 15).';
    }
  } else if (countryCodeDigits === '966') {
    // Saudi Arabia mobile: +966 followed by 9 digits starting with 5
    if (!/^5[0-9]{8}$/.test(nationalPart)) {
      return 'رقم الجوال السعودي غير صالح (يجب أن يتكون من 9 أرقام بعد +966 ويبدأ بـ 5).';
    }
  } else if (countryCodeDigits === '971') {
    // UAE mobile: +971 followed by 9 digits starting with 5
    if (!/^5[0-9]{8}$/.test(nationalPart)) {
      return 'رقم الجوال الإماراتي غير صالح (يجب أن يتكون من 9 أرقام بعد +971 ويبدأ بـ 5).';
    }
  } else if (countryCodeDigits && nationalPart.length < 6) {
    return 'الرقم المحلي بعد رمز الدولة قصير جدًا وغير مكتمل.';
  }

  return null;
}

/**
 * Normalizes a tutor's phone/WhatsApp number for `wa.me` links without assuming +20 for non-Egyptian tutors
 * and without duplicating the country code if already present in the phone string.
 */
export function normalizeTutorContactPhone(
  rawPhone: string | null | undefined,
  rawCountryCode?: string | null | undefined
): NormalizedTutorPhoneResult {
  const asciiPhoneRaw = convertArabicDigitsToAscii(String(rawPhone ?? '')).trim();
  const asciiCountryRaw = convertArabicDigitsToAscii(String(rawCountryCode ?? '')).trim();

  if (!asciiPhoneRaw) {
    return {
      isValid: false,
      e164Digits: '',
      displayPhone: '',
      countryCode: asciiCountryRaw || '',
      invalidReason: 'لا يوجد رقم هاتف أو واتساب مسجل لهذا المعلم.',
    };
  }

  // Strip directional formatting marks, spaces, hyphens, dots, and parentheses
  const cleanedPhone = asciiPhoneRaw.replace(/[\u200E\u200F\u202A-\u202E\s\-().]/g, '');
  const cleanedCountry = asciiCountryRaw.replace(/[\u200E\u200F\u202A-\u202E\s\-().]/g, '');

  // Reject if phone contains unexpected letters or invalid symbols (only optional leading + and digits allowed)
  if (!/^\+?[0-9]+$/.test(cleanedPhone)) {
    return {
      isValid: false,
      e164Digits: '',
      displayPhone: asciiPhoneRaw,
      countryCode: cleanedCountry,
      invalidReason: 'رقم التواصل يحتوي على رموز أو حروف غير صالحة.',
    };
  }

  // Extract country code digits if provided (e.g., "+966" or "00966" -> "966")
  let countryDigits = cleanedCountry.replace(/^\+/, '').replace(/^00/, '');
  if (countryDigits && !/^[1-9][0-9]{0,3}$/.test(countryDigits)) {
    countryDigits = '';
  }

  let phoneDigits = cleanedPhone;
  let hasExplicitInternationalPrefix = false;

  if (phoneDigits.startsWith('+')) {
    hasExplicitInternationalPrefix = true;
    phoneDigits = phoneDigits.slice(1);
  } else if (phoneDigits.startsWith('00')) {
    hasExplicitInternationalPrefix = true;
    phoneDigits = phoneDigits.slice(2);
  }

  let finalE164 = '';
  let resolvedCountryDigits = countryDigits;

  if (hasExplicitInternationalPrefix) {
    // Number already includes an explicit international prefix (+ or 00)
    // If someone wrote "+2001012345678" (leading local 0 after country code), clean that single 0
    if (resolvedCountryDigits && phoneDigits.startsWith(resolvedCountryDigits)) {
      let national = phoneDigits.slice(resolvedCountryDigits.length);
      if (national.startsWith('0')) {
        national = national.replace(/^0+/, '');
      }
      finalE164 = `${resolvedCountryDigits}${national}`;
    } else {
      // Detect calling code from the international number itself
      const matchedCode = KNOWN_CALLING_CODES.find((code) => phoneDigits.startsWith(code));
      if (matchedCode) {
        resolvedCountryDigits = matchedCode;
        let national = phoneDigits.slice(matchedCode.length);
        if (national.startsWith('0')) {
          national = national.replace(/^0+/, '');
        }
        finalE164 = `${matchedCode}${national}`;
      } else {
        finalE164 = phoneDigits;
      }
    }
  } else {
    // No explicit + or 00 on the phone input
    if (resolvedCountryDigits) {
      // Check if the phone input already starts with the country code (e.g. "201012345678" or "966501234567")
      if (
        phoneDigits.startsWith(resolvedCountryDigits) &&
        phoneDigits.length >= resolvedCountryDigits.length + 8
      ) {
        let national = phoneDigits.slice(resolvedCountryDigits.length);
        if (national.startsWith('0')) {
          national = national.replace(/^0+/, '');
        }
        finalE164 = `${resolvedCountryDigits}${national}`;
      } else {
        // Local number with a known country code (e.g. "01012345678" with "+20", or "0501234567" with "+966")
        const national = phoneDigits.replace(/^0+/, '');
        finalE164 = `${resolvedCountryDigits}${national}`;
      }
    } else {
      // Country code is NOT provided:
      // 1) Check if the number clearly starts with a known international prefix and valid length (e.g. 2010..., 9665..., 9715...)
      if (/^20(10|11|12|15)[0-9]{8}$/.test(phoneDigits)) {
        resolvedCountryDigits = '20';
        finalE164 = phoneDigits;
      } else if (/^9665[0-9]{8}$/.test(phoneDigits)) {
        resolvedCountryDigits = '966';
        finalE164 = phoneDigits;
      } else if (/^9715[0-9]{8}$/.test(phoneDigits)) {
        resolvedCountryDigits = '971';
        finalE164 = phoneDigits;
      } else if (/^0(10|11|12|15)[0-9]{8}$/.test(phoneDigits)) {
        // Standard 11-digit Egyptian mobile starting with 010/011/012/015
        resolvedCountryDigits = '20';
        finalE164 = `20${phoneDigits.slice(1)}`;
      } else {
        // Ambiguous local number without country code (e.g., 0501234567 could be SA or AE)
        return {
          isValid: false,
          e164Digits: '',
          displayPhone: asciiPhoneRaw,
          countryCode: '',
          invalidReason:
            'يرجى تحديد رمز الدولة (مثل +20 أو +966 أو +971) مع رقم الهاتف لضمان فتح واتساب الصحيح.',
        };
      }
    }
  }

  const validationError = validateInternationalDigits(finalE164, resolvedCountryDigits);
  if (validationError) {
    return {
      isValid: false,
      e164Digits: '',
      displayPhone: asciiPhoneRaw,
      countryCode: resolvedCountryDigits ? `+${resolvedCountryDigits}` : '',
      invalidReason: validationError,
    };
  }

  return {
    isValid: true,
    e164Digits: finalE164,
    displayPhone: `+${finalE164}`,
    countryCode: resolvedCountryDigits ? `+${resolvedCountryDigits}` : '',
  };
}

/**
 * Builds a verified `https://wa.me/<digits>` URL (with optional encoded text).
 * Returns null if the phone number is missing or invalid so the UI never renders a broken link.
 */
export function buildTutorWhatsAppUrl(
  rawPhone: string | null | undefined,
  rawCountryCode?: string | null | undefined,
  messageText?: string
): string | null {
  const normalized = normalizeTutorContactPhone(rawPhone, rawCountryCode);
  if (!normalized.isValid || !normalized.e164Digits) {
    return null;
  }

  const baseUrl = `https://wa.me/${normalized.e164Digits}`;
  if (messageText && messageText.trim().length > 0) {
    return `${baseUrl}?text=${encodeURIComponent(messageText.trim())}`;
  }
  return baseUrl;
}

export interface TutorContactSourceInput {
  tutorId: string;
  privateInfo?: {
    countryCode?: string | null;
    whatsappNumber?: string | null;
    phoneNumber?: string | null;
  } | null;
  linkedApprovedApplication?: {
    applicantTutorId?: string | null;
    status?: string | null;
    countryCode?: string | null;
    whatsappNumber?: string | null;
    phone?: string | null;
  } | null;
}

export interface ResolvedTutorAdminContact {
  hasValidContact: boolean;
  source: 'private_whatsapp' | 'private_phone' | 'approved_application' | 'none';
  sourceLabel: string;
  e164Digits: string;
  displayPhone: string;
  countryCode: string;
  directWhatsAppUrl: string | null;
  invalidReason: string | null;
}

/**
 * Resolves the tutor's admin-only WhatsApp contact strictly from:
 * 1) `tutor_private_info` (whatsapp_number preferred, then phone_number)
 * 2) Fallback: latest approved `tutor_applications` record where `applicant_tutor_id === tutorId`
 * Never guesses by name or email.
 */
export function resolveTutorAdminContact(input: TutorContactSourceInput): ResolvedTutorAdminContact {
  const pInfo = input.privateInfo;
  let lastInvalidReason: string | null = null;

  // 1. Try privateInfo.whatsappNumber
  if (pInfo && pInfo.whatsappNumber && String(pInfo.whatsappNumber).trim().length > 0) {
    const res = normalizeTutorContactPhone(pInfo.whatsappNumber, pInfo.countryCode);
    if (res.isValid) {
      return {
        hasValidContact: true,
        source: 'private_whatsapp',
        sourceLabel: 'واتساب الملف الخاص',
        e164Digits: res.e164Digits,
        displayPhone: res.displayPhone,
        countryCode: res.countryCode,
        directWhatsAppUrl: `https://wa.me/${res.e164Digits}`,
        invalidReason: null,
      };
    }
    lastInvalidReason = res.invalidReason || 'رقم الواتساب المسجل في الملف الخاص غير صالح.';
  }

  // 2. Try privateInfo.phoneNumber
  if (pInfo && pInfo.phoneNumber && String(pInfo.phoneNumber).trim().length > 0) {
    const res = normalizeTutorContactPhone(pInfo.phoneNumber, pInfo.countryCode);
    if (res.isValid) {
      return {
        hasValidContact: true,
        source: 'private_phone',
        sourceLabel: 'هاتف الملف الخاص',
        e164Digits: res.e164Digits,
        displayPhone: res.displayPhone,
        countryCode: res.countryCode,
        directWhatsAppUrl: `https://wa.me/${res.e164Digits}`,
        invalidReason: null,
      };
    }
    lastInvalidReason = res.invalidReason || 'رقم الهاتف المسجل في الملف الخاص غير صالح.';
  }

  // 3. Fallback: Latest approved application explicitly linked via applicant_tutor_id === tutorId
  const app = input.linkedApprovedApplication;
  if (
    app &&
    app.applicantTutorId &&
    app.applicantTutorId === input.tutorId &&
    (!app.status || app.status === 'approved')
  ) {
    const candidateNumbers = [app.whatsappNumber, app.phone].filter(
      (v): v is string => Boolean(v && String(v).trim().length > 0)
    );

    for (const rawNum of candidateNumbers) {
      const res = normalizeTutorContactPhone(rawNum, app.countryCode);
      if (res.isValid) {
        return {
          hasValidContact: true,
          source: 'approved_application',
          sourceLabel: 'طلب الانضمام المعتمد المرتبط',
          e164Digits: res.e164Digits,
          displayPhone: res.displayPhone,
          countryCode: res.countryCode,
          directWhatsAppUrl: `https://wa.me/${res.e164Digits}`,
          invalidReason: null,
        };
      }
      lastInvalidReason = res.invalidReason || 'رقم الهاتف في طلب الانضمام المرتبط غير صالح.';
    }
  }

  return {
    hasValidContact: false,
    source: 'none',
    sourceLabel: 'غير متوفر',
    e164Digits: '',
    displayPhone: '',
    countryCode: pInfo?.countryCode || app?.countryCode || '',
    directWhatsAppUrl: null,
    invalidReason:
      lastInvalidReason || 'لا يوجد رقم تواصل مسجل في بيانات المعلم الخاصة أو طلب انضمامه المعتمد.',
  };
}

// ============================================================================
// 2. Configurable Readiness Policy & Indicative Price Guidance
// ============================================================================

export interface IndicativePriceRange {
  currency: string;
  minSuggested: number;
  maxSuggested: number;
}

export interface TutorReadinessPolicyConfig {
  minTrialSlots: number; // Default: 1
  minPaidPrivateSlots: number; // Default: 1
  minDistinctCoverageDays: number; // Default: 1
  upcomingWindowDays: number; // Default: 14
  requireInitialQualityReviewForFirstPublish: boolean; // Default: true
  indicativeRangesByCurrency: Record<string, { min: number; max: number }>;
}

export const DEFAULT_TUTOR_READINESS_POLICY: TutorReadinessPolicyConfig = {
  minTrialSlots: 1,
  minPaidPrivateSlots: 1,
  minDistinctCoverageDays: 1,
  upcomingWindowDays: 14,
  requireInitialQualityReviewForFirstPublish: true,
  indicativeRangesByCurrency: {
    'ج.م': { min: 80, max: 600 },
    'ر.س': { min: 25, max: 250 },
    'د.إ': { min: 25, max: 250 },
    '$': { min: 5, max: 60 },
  },
};

export interface IndicativePriceEvaluation {
  status: 'within_range' | 'below_indicative' | 'above_indicative' | 'unconfigured';
  minIndicative: number | null;
  maxIndicative: number | null;
  summaryText: string;
}

/**
 * Evaluates a tutor's session price against configurable indicative ranges scaled by duration (50/60 min base).
 * Note: This is purely an advisory indicator for the human admin reviewer and NEVER blocks valid integer prices (like $6 or 127 EGP).
 */
export function evaluateIndicativePriceGuidance(
  price: number,
  currency: string,
  durationMinutes: number,
  policy: TutorReadinessPolicyConfig = DEFAULT_TUTOR_READINESS_POLICY
): IndicativePriceEvaluation {
  const baseRange = policy.indicativeRangesByCurrency[currency];
  if (!baseRange || !Number.isFinite(price) || price <= 0) {
    return {
      status: 'unconfigured',
      minIndicative: null,
      maxIndicative: null,
      summaryText: 'نطاق استرشادي غير محدد لهذه العملة — القرار النهائي للمراجعة البشرية.',
    };
  }

  const durationScale = Math.max(0.5, Math.min(2.5, (durationMinutes || 50) / 50));
  const scaledMin = Math.max(1, Math.round(baseRange.min * durationScale));
  const scaledMax = Math.max(scaledMin + 1, Math.round(baseRange.max * durationScale));

  if (price < scaledMin) {
    return {
      status: 'below_indicative',
      minIndicative: scaledMin,
      maxIndicative: scaledMax,
      summaryText: `أقل من النطاق الاسترشادي المعتاد (${scaledMin}–${scaledMax} ${currency} لحصة ${durationMinutes} د) — يتطلب تأكيد المراجعة البشرية.`,
    };
  }

  if (price > scaledMax) {
    return {
      status: 'above_indicative',
      minIndicative: scaledMin,
      maxIndicative: scaledMax,
      summaryText: `أعلى من النطاق الاسترشادي المعتاد (${scaledMin}–${scaledMax} ${currency} لحصة ${durationMinutes} د) — يتطلب تأكيد المراجعة البشرية.`,
    };
  }

  return {
    status: 'within_range',
    minIndicative: scaledMin,
    maxIndicative: scaledMax,
    summaryText: `ضمن النطاق الاسترشادي المعتاد (${scaledMin}–${scaledMax} ${currency} لحصة ${durationMinutes} د).`,
  };
}

// ============================================================================
// 3. Unified 6-Requirement Readiness & Initial Quality Review Evaluator
// ============================================================================

export type ReadinessRequirementKey =
  | 'avatar'
  | 'bio'
  | 'pricing'
  | 'specializations'
  | 'paidPrivateSlot'
  | 'trialSlot';

export type AdminEditorTabTarget =
  | 'basics'
  | 'pricing'
  | 'offerings'
  | 'qualifications'
  | 'slots'
  | 'private'
  | 'pillars';

export type TutorDashboardTabTarget =
  | 'overview'
  | 'pricing'
  | 'profile-draft'
  | 'trials'
  | 'private'
  | 'groups';

export interface ReadinessRequirementItem {
  key: ReadinessRequirementKey;
  title: string;
  shortLabel: string;
  completed: boolean;
  statusText: string;
  missingReason: string | null;
  adminTargetTab: AdminEditorTabTarget;
  adminActionLabel: string;
  tutorTargetTab: TutorDashboardTabTarget;
  tutorActionLabel: string;
}

export interface TutorInitialQualityReviewRecord {
  tutorId: string;
  avatarQualityApproved: boolean;
  approvedAvatarUrl?: string | null;
  priceQualityApproved: boolean;
  approvedPriceAmount?: number | null;
  approvedCurrency?: string | null;
  approvedDurationMinutes?: number | null;
  reviewNotes?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
}

export interface TutorInitialQualityReviewEvaluation {
  avatarQualityApproved: boolean;
  avatarApprovalMatchesCurrentUrl: boolean;
  priceQualityApproved: boolean;
  priceApprovalMatchesCurrentPricing: boolean;
  isQualityReviewComplete: boolean;
  missingQualityReasons: string[];
  indicativePriceGuidance: IndicativePriceEvaluation;
  reviewNotes: string | null;
  reviewedAt: string | null;
}

export type TutorReadinessOverallStatus =
  | 'evaluation_error'
  | 'published_ready'
  | 'published_needs_slots'
  | 'ready_for_first_publish'
  | 'data_complete_needs_quality_review'
  | 'incomplete_data';

export interface TutorProfileReadinessEvaluation {
  tutorId: string;
  isPublished: boolean;
  evaluationError: boolean;
  evaluationErrorMessage: string | null;
  overallStatus: TutorReadinessOverallStatus;
  statusBadgeLabel: string;
  totalRequirementsCount: 6;
  completedRequirementsCount: number | null; // null when evaluationError is true
  completionPercentage: number | null; // null when evaluationError is true
  isDataComplete6of6: boolean;
  isReadyForInitialPublish: boolean;
  requirements: ReadinessRequirementItem[];
  missingRequirements: ReadinessRequirementItem[];
  // Slot & Coverage metrics
  validTrialSlots: TutorAvailableSlot[];
  validPaidPrivateSlots: TutorPrivateSlot[];
  freePrivateSlotsCount: number;
  validTrialSlotsCount: number;
  validPaidPrivateSlotsCount: number;
  earliestTrialSlot: TutorAvailableSlot | null;
  earliestPaidPrivateSlot: TutorPrivateSlot | null;
  distinctUpcomingDaysCount: number;
  coverageSpanDays: number;
  meetsSlotPolicyThresholds: boolean;
  slotPolicyWarnings: string[];
  // Initial Human Quality Review
  initialQualityReview: TutorInitialQualityReviewEvaluation;
}

/**
 * Checks if an avatar URL is empty, a default placeholder, or a generic platform logo.
 */
export function isPlaceholderOrDefaultAvatarUrl(url: string | null | undefined): boolean {
  if (!url) return true;
  const trimmed = String(url).trim();
  if (!trimmed) return true;

  const lower = trimmed.toLowerCase();
  if (
    lower === 'null' ||
    lower === 'undefined' ||
    lower === 'none' ||
    lower === 'about:blank' ||
    lower.includes('ui-avatars.com') ||
    lower.includes('dicebear.com') ||
    lower.includes('gravatar.com/avatar/000000') ||
    lower.includes('default-avatar') ||
    lower.includes('avatar-placeholder') ||
    lower.includes('placeholder') ||
    lower.includes('shatir-logo') ||
    lower.includes('/favicon') ||
    lower.endsWith('/logo.png') ||
    lower.endsWith('/logo.svg')
  ) {
    return true;
  }

  return false;
}

/**
 * Computes exact duration in minutes between two HH:MM(:SS) time strings on the same calendar day.
 */
export function getSlotDurationMinutesFromTimes(startTime: string, endTime: string): number {
  const sParts = String(startTime || '').trim().split(':').map(Number);
  const eParts = String(endTime || '').trim().split(':').map(Number);
  if (sParts.length < 2 || eParts.length < 2) return 0;
  const startMins = (sParts[0] || 0) * 60 + (sParts[1] || 0);
  const endMins = (eParts[0] || 0) * 60 + (eParts[1] || 0);
  return endMins - startMins;
}

export interface EvaluateTutorReadinessInput {
  tutor: {
    id: string;
    name?: string | null;
    headline?: string | null;
    avatarUrl?: string | null;
    helpChildQuote?: string | null;
    helpChildSummary?: string | null;
    hourlyRateMin?: number | null;
    hourlyRateMax?: number | null;
    currency?: string | null;
    sessionDurationMinutes?: number | null;
    trialDurationMinutes?: number | null;
    isPublished?: boolean | null;
  };
  activeSpecializationsCount?: number;
  specializations?: ApprovedSpecializationItem[];
  trialSlots?: TutorAvailableSlot[];
  privateSlots?: TutorPrivateSlot[];
  isAvatarBrokenAtRuntime?: boolean;
  evaluationError?: boolean;
  evaluationErrorMessage?: string | null;
  qualityReview?: TutorInitialQualityReviewRecord | null;
  policy?: TutorReadinessPolicyConfig;
  referenceNowMs?: number;
}

const CONTACT_LEAK_REGEX = /(https?:\/\/|www\.|t\.me\/|wa\.me\/|@[a-z0-9_]{3,}|[0-9٠-٩]{8,})/i;

/**
 * Single Unified Source of Truth for evaluating tutor profile readiness (6 independent requirements)
 * and initial human quality review across Admin and Tutor Portal.
 */
export function evaluateTutorProfileReadiness(
  input: EvaluateTutorReadinessInput
): TutorProfileReadinessEvaluation {
  const {
    tutor,
    activeSpecializationsCount,
    specializations,
    trialSlots = [],
    privateSlots = [],
    isAvatarBrokenAtRuntime = false,
    evaluationError = false,
    evaluationErrorMessage = null,
    qualityReview = null,
    policy = DEFAULT_TUTOR_READINESS_POLICY,
    referenceNowMs = Date.now(),
  } = input;

  const isPublished = Boolean(tutor.isPublished);
  const rawAvatarUrl = String(tutor.avatarUrl ?? '').trim();
  const priceMin = Number(tutor.hourlyRateMin ?? 0);
  const priceMax =
    tutor.hourlyRateMax !== undefined && tutor.hourlyRateMax !== null && Number(tutor.hourlyRateMax) > 0
      ? Number(tutor.hourlyRateMax)
      : priceMin;
  const currency = String(tutor.currency ?? '').trim();
  const durationMins = Number(tutor.sessionDurationMinutes ?? 0);

  // Evaluate Initial Quality Review
  const indicativeGuidance = evaluateIndicativePriceGuidance(priceMin, currency, durationMins, policy);

  const hasValidAvatarData =
    rawAvatarUrl.length > 0 &&
    !isPlaceholderOrDefaultAvatarUrl(rawAvatarUrl) &&
    !isAvatarBrokenAtRuntime;

  const avatarApprovalMatchesCurrentUrl = Boolean(
    qualityReview?.avatarQualityApproved &&
      hasValidAvatarData &&
      (!qualityReview.approvedAvatarUrl ||
        qualityReview.approvedAvatarUrl.trim() === rawAvatarUrl)
  );

  const priceApprovalMatchesCurrentPricing = Boolean(
    qualityReview?.priceQualityApproved &&
      priceMin >= 1 &&
      (!qualityReview.approvedPriceAmount || Number(qualityReview.approvedPriceAmount) === priceMin) &&
      (!qualityReview.approvedCurrency || qualityReview.approvedCurrency.trim() === currency) &&
      (!qualityReview.approvedDurationMinutes ||
        Number(qualityReview.approvedDurationMinutes) === durationMins)
  );

  const missingQualityReasons: string[] = [];
  if (!avatarApprovalMatchesCurrentUrl) {
    missingQualityReasons.push(
      qualityReview?.avatarQualityApproved && qualityReview.approvedAvatarUrl !== rawAvatarUrl
        ? 'تغيرت الصورة الشخصية منذ آخر مراجعة — يلزم تأكيد مناسبة ووضوح الصورة الحالية قبل النشر الأول.'
        : 'لم يتم تأكيد مناسبة ووضوح الصورة الشخصية من الإدارة بعد.'
    );
  }
  if (!priceApprovalMatchesCurrentPricing) {
    missingQualityReasons.push(
      qualityReview?.priceQualityApproved
        ? 'تغير السعر أو العملة أو مدة الحصة منذ آخر مراجعة — يلزم تأكيد مناسبة السعر الحالي قبل النشر الأول.'
        : 'لم يتم تأكيد مناسبة السعر مقارنة بالعملة والمدة والخدمة من الإدارة بعد.'
    );
  }

  const initialQualityReview: TutorInitialQualityReviewEvaluation = {
    avatarQualityApproved: avatarApprovalMatchesCurrentUrl,
    avatarApprovalMatchesCurrentUrl,
    priceQualityApproved: priceApprovalMatchesCurrentPricing,
    priceApprovalMatchesCurrentPricing,
    isQualityReviewComplete: avatarApprovalMatchesCurrentUrl && priceApprovalMatchesCurrentPricing,
    missingQualityReasons,
    indicativePriceGuidance: indicativeGuidance,
    reviewNotes: qualityReview?.reviewNotes ?? null,
    reviewedAt: qualityReview?.reviewedAt ?? null,
  };

  // If data fetching failed, return explicit evaluation_error state without fabricating 0 counts or 100% completion
  if (evaluationError) {
    return {
      tutorId: tutor.id,
      isPublished,
      evaluationError: true,
      evaluationErrorMessage:
        evaluationErrorMessage ||
        'تعذر جلب بيانات التخصصات أو المواعيد من الخادم لتقييم الجاهزية بدقة.',
      overallStatus: 'evaluation_error',
      statusBadgeLabel: 'تعذر تقييم الجاهزية',
      totalRequirementsCount: 6,
      completedRequirementsCount: null,
      completionPercentage: null,
      isDataComplete6of6: false,
      isReadyForInitialPublish: false,
      requirements: [],
      missingRequirements: [],
      validTrialSlots: [],
      validPaidPrivateSlots: [],
      freePrivateSlotsCount: 0,
      validTrialSlotsCount: 0,
      validPaidPrivateSlotsCount: 0,
      earliestTrialSlot: null,
      earliestPaidPrivateSlot: null,
      distinctUpcomingDaysCount: 0,
      coverageSpanDays: 0,
      meetsSlotPolicyThresholds: false,
      slotPolicyWarnings: [],
      initialQualityReview,
    };
  }

  // --------------------------------------------------------------------------
  // (أ) Requirement 1: Valid Personal Photo (`avatar`)
  // --------------------------------------------------------------------------
  let avatarMissingReason: string | null = null;
  if (!rawAvatarUrl) {
    avatarMissingReason = 'الصورة الشخصية مفقودة — يرجى رفع صورة شخصية واضحة.';
  } else if (isPlaceholderOrDefaultAvatarUrl(rawAvatarUrl)) {
    avatarMissingReason = 'الرابط الحالي يشير إلى صورة افتراضية أو شعار وليس صورة شخصية للمعلم.';
  } else if (isAvatarBrokenAtRuntime) {
    avatarMissingReason = 'تعذر تحميل ملف الصورة الشخصية من الرابط المسجل (صورة تالفة أو غير متاحة).';
  }

  const avatarReq: ReadinessRequirementItem = {
    key: 'avatar',
    title: 'الصورة الشخصية',
    shortLabel: 'الصورة الشخصية',
    completed: avatarMissingReason === null,
    statusText:
      avatarMissingReason === null
        ? 'صورة شخصية مرفوعة وصالحة للعرض'
        : avatarMissingReason,
    missingReason: avatarMissingReason,
    adminTargetTab: 'basics',
    adminActionLabel: 'مراجعة أو رفع الصورة',
    tutorTargetTab: 'profile-draft',
    tutorActionLabel: 'صورتي ونبذتي',
  };

  // --------------------------------------------------------------------------
  // (ب) Requirement 2: Headline & Bio (`bio`)
  // --------------------------------------------------------------------------
  const headlineTrimmed = String(tutor.headline ?? '').trim();
  const summaryTrimmed = String(tutor.helpChildSummary ?? '').trim();
  const quoteTrimmed = String(tutor.helpChildQuote ?? '').trim();

  let bioMissingReason: string | null = null;
  if (!headlineTrimmed) {
    bioMissingReason = 'العنوان القصير مفقود (مطلوب بين 10 و 250 حرفًا).';
  } else if (headlineTrimmed.length < 10) {
    bioMissingReason = `العنوان القصير أقصر من الحد الأدنى المطلوب (${headlineTrimmed.length}/10 أحرف).`;
  } else if (headlineTrimmed.length > 250) {
    bioMissingReason = `العنوان القصير يتجاوز الحد الأقصى المسموح (${headlineTrimmed.length}/250 حرفًا).`;
  } else if (summaryTrimmed.length === 0 && quoteTrimmed.length === 0) {
    bioMissingReason =
      'النبذة التعريفية مفقودة — يلزم كتابة نبذة لولي الأمر (20–2500 حرف) أو جملة مساعدة الطفل (5–350 حرفًا).';
  } else if (summaryTrimmed.length > 0 && summaryTrimmed.length < 20) {
    bioMissingReason = `النبذة التعريفية أقصر من الحد الأدنى (${summaryTrimmed.length}/20 حرفًا).`;
  } else if (summaryTrimmed.length > 2500) {
    bioMissingReason = `النبذة التعريفية تتجاوز الحد الأقصى (${summaryTrimmed.length}/2500 حرف).`;
  } else if (quoteTrimmed.length > 0 && quoteTrimmed.length < 5) {
    bioMissingReason = `جملة مساعدة الطفل أقصر من الحد الأدنى (${quoteTrimmed.length}/5 أحرف).`;
  } else if (quoteTrimmed.length > 350) {
    bioMissingReason = `جملة مساعدة الطفل تتجاوز الحد الأقصى (${quoteTrimmed.length}/350 حرفًا).`;
  } else if (
    CONTACT_LEAK_REGEX.test(`${headlineTrimmed} ${quoteTrimmed} ${summaryTrimmed}`)
  ) {
    bioMissingReason =
      'النصوص التعريفية تحتوي على أرقام هاتف أو روابط تواصل خارجية غير مسموح بها.';
  }

  const bioReq: ReadinessRequirementItem = {
    key: 'bio',
    title: 'العنوان والنبذة التعريفية',
    shortLabel: 'العنوان والنبذة',
    completed: bioMissingReason === null,
    statusText:
      bioMissingReason === null
        ? `العنوان (${headlineTrimmed.length} حرفًا) والنبذة مستوفية للشروط`
        : bioMissingReason,
    missingReason: bioMissingReason,
    adminTargetTab: 'basics',
    adminActionLabel: 'تعديل العنوان والنبذة',
    tutorTargetTab: 'profile-draft',
    tutorActionLabel: 'صورتي ونبذتي',
  };

  // --------------------------------------------------------------------------
  // (ج) Requirement 3: Pricing & Session Duration (`pricing`)
  // --------------------------------------------------------------------------
  let pricingMissingReason: string | null = null;
  if (!Number.isFinite(priceMin) || !Number.isInteger(priceMin) || priceMin < 1 || priceMin > 100000) {
    pricingMissingReason =
      'سعر الحصة غير صالح — يجب تحديد رقم صحيح بين 1 و 100000 بدون كسور.';
  } else if (!Number.isFinite(priceMax) || !Number.isInteger(priceMax) || priceMax < priceMin || priceMax > 100000) {
    pricingMissingReason = 'الحد الأعلى لسعر الحصة غير متطابق أو أقل من الحد الأدنى.';
  } else if (!SUPPORTED_TUTOR_CURRENCIES.some((c) => c.value === currency)) {
    pricingMissingReason = 'العملة غير محددة أو غير مدعومة (المتاح: ج.م، ر.س، د.إ، $).';
  } else if (
    !Number.isFinite(durationMins) ||
    !Number.isInteger(durationMins) ||
    durationMins < 30 ||
    durationMins > 120
  ) {
    pricingMissingReason = 'مدة الحصة غير صالحة — يجب أن تكون بين 30 و 120 دقيقة.';
  }

  const pricingReq: ReadinessRequirementItem = {
    key: 'pricing',
    title: 'السعر ومدة الحصة',
    shortLabel: 'السعر ومدة الحصة',
    completed: pricingMissingReason === null,
    statusText:
      pricingMissingReason === null
        ? `${priceMin} ${currency} / ${durationMins} دقيقة`
        : pricingMissingReason,
    missingReason: pricingMissingReason,
    adminTargetTab: 'pricing',
    adminActionLabel: 'ضبط السعر والمدة',
    tutorTargetTab: 'pricing',
    tutorActionLabel: 'سعري ومدة الحصة',
  };

  // --------------------------------------------------------------------------
  // (د) Requirement 4: Active Approved Specializations (`specializations`)
  // --------------------------------------------------------------------------
  const resolvedSpecsCount =
    typeof activeSpecializationsCount === 'number'
      ? activeSpecializationsCount
      : Array.isArray(specializations)
      ? specializations.length
      : 0;

  const specsMissingReason =
    resolvedSpecsCount >= 1
      ? null
      : 'لا يوجد أي تخصص تدريسي معتمد ومفعّل مرتبط بملف المعلم في الجداول المرجعية.';

  const specsReq: ReadinessRequirementItem = {
    key: 'specializations',
    title: 'التخصصات المعتمدة',
    shortLabel: 'التخصصات المعتمدة',
    completed: specsMissingReason === null,
    statusText:
      specsMissingReason === null
        ? `${resolvedSpecsCount} تخصص معتمد ومفعّل`
        : specsMissingReason,
    missingReason: specsMissingReason,
    adminTargetTab: 'offerings',
    adminActionLabel: 'ربط التخصصات المعتمدة',
    tutorTargetTab: 'overview',
    tutorActionLabel: 'عرض التخصصات',
  };

  // --------------------------------------------------------------------------
  // (هـ) Requirement 5: Future Available Paid Private Slot (`paidPrivateSlot`)
  // --------------------------------------------------------------------------
  const validPaidPrivateSlots: TutorPrivateSlot[] = [];
  let freePrivateSlotsCount = 0;

  for (const slot of privateSlots) {
    if (!slot || !slot.isAvailable || slot.isBooked || slot.adminSuspended) continue;
    const tz = String(slot.timezone || 'Africa/Cairo').trim();
    if (!SUPPORTED_TUTOR_TIMEZONES.some((t) => t.value === tz)) continue;
    if (!isSlotInFuture(slot.slotDate, slot.startTime, tz, referenceNowMs)) continue;

    const slotDur = Number(slot.durationMinutes || getSlotDurationMinutesFromTimes(slot.startTime, slot.endTime));
    if (!Number.isInteger(slotDur) || slotDur < 30 || slotDur > 120) continue;

    const slotCurrency = String(slot.currency || currency || 'ج.م').trim();
    if (!SUPPORTED_TUTOR_CURRENCIES.some((c) => c.value === slotCurrency)) continue;

    const hasValidSpec = Boolean(
      (slot.specializationLabel && String(slot.specializationLabel).trim().length > 0) ||
        slot.offeringCourseOptionId ||
        (slot.quranAgeGroupId && slot.quranLevelId) ||
        (Array.isArray(slot.allowedSpecializations) && slot.allowedSpecializations.length > 0)
    );
    if (!hasValidSpec) continue;

    const slotPrice = Number(slot.priceAmount);
    if (slotPrice === 0) {
      freePrivateSlotsCount += 1;
      continue; // Free private slot (price = 0) does NOT satisfy paid private slot requirement
    }
    if (!Number.isInteger(slotPrice) || slotPrice < 1 || slotPrice > 100000) continue;

    validPaidPrivateSlots.push(slot);
  }

  validPaidPrivateSlots.sort((a, b) => {
    const cmpDate = String(a.slotDate).localeCompare(String(b.slotDate));
    if (cmpDate !== 0) return cmpDate;
    return String(a.startTime).localeCompare(String(b.startTime));
  });

  const requiredPaidSlots = Math.max(1, policy.minPaidPrivateSlots || 1);
  let paidSlotMissingReason: string | null = null;
  if (validPaidPrivateSlots.length < requiredPaidSlots) {
    if (validPaidPrivateSlots.length === 0 && freePrivateSlotsCount > 0) {
      paidSlotMissingReason =
        'المواعيد الخاصة المسجلة حالياً مجانية (بسعر 0) — يلزم إضافة موعد حصة خاصة مدفوعة واحد على الأقل بسعر أكبر من صفر.';
    } else if (validPaidPrivateSlots.length === 0) {
      paidSlotMissingReason =
        'لا يوجد أي موعد مستقبلي متاح لحصة خاصة مدفوعة (1:1) غير محجوز وغير موقوف إداريًا.';
    } else {
      paidSlotMissingReason = `عدد مواعيد الحصص الخاصة المدفوعة المتاحة (${validPaidPrivateSlots.length}) أقل من الحد الأدنى المطلوب (${requiredPaidSlots}).`;
    }
  }

  const paidPrivateSlotReq: ReadinessRequirementItem = {
    key: 'paidPrivateSlot',
    title: 'موعد حصة خاصة مدفوعة متاح',
    shortLabel: 'حصة خاصة مدفوعة',
    completed: paidSlotMissingReason === null,
    statusText:
      paidSlotMissingReason === null
        ? `${validPaidPrivateSlots.length} موعد حصة خاصة مدفوعة متاح`
        : paidSlotMissingReason,
    missingReason: paidSlotMissingReason,
    adminTargetTab: 'slots',
    adminActionLabel: 'إدارة المواعيد الخاصة',
    tutorTargetTab: 'private',
    tutorActionLabel: 'إضافة موعد خاص مدفوع',
  };

  // --------------------------------------------------------------------------
  // (و) Requirement 6: Future Available Trial Slot (`trialSlot`, strictly 20m)
  // --------------------------------------------------------------------------
  const validTrialSlots: TutorAvailableSlot[] = [];

  for (const slot of trialSlots) {
    if (!slot || !slot.isAvailable || slot.isBooked || slot.adminSuspended) continue;
    const tz = String(slot.timezone || 'Africa/Cairo').trim();
    if (!SUPPORTED_TUTOR_TIMEZONES.some((t) => t.value === tz)) continue;
    if (!isSlotInFuture(slot.slotDate, slot.startTime, tz, referenceNowMs)) continue;

    const trialDur = getSlotDurationMinutesFromTimes(slot.startTime, slot.endTime);
    if (trialDur !== 20) continue;

    validTrialSlots.push(slot);
  }

  validTrialSlots.sort((a, b) => {
    const cmpDate = String(a.slotDate).localeCompare(String(b.slotDate));
    if (cmpDate !== 0) return cmpDate;
    return String(a.startTime).localeCompare(String(b.startTime));
  });

  const requiredTrialSlots = Math.max(1, policy.minTrialSlots || 1);
  let trialSlotMissingReason: string | null = null;
  if (validTrialSlots.length < requiredTrialSlots) {
    if (validTrialSlots.length === 0) {
      trialSlotMissingReason =
        'لا يوجد أي موعد مستقبلي متاح لحصة تجريبية (مدتها 20 دقيقة) غير محجوز وغير موقوف إداريًا.';
    } else {
      trialSlotMissingReason = `عدد المواعيد التجريبية المتاحة (${validTrialSlots.length}) أقل من الحد الأدنى المطلوب (${requiredTrialSlots}).`;
    }
  }

  const trialSlotReq: ReadinessRequirementItem = {
    key: 'trialSlot',
    title: 'موعد حصة تجريبية متاح (20 دقيقة)',
    shortLabel: 'حصة تجريبية (20 د)',
    completed: trialSlotMissingReason === null,
    statusText:
      trialSlotMissingReason === null
        ? `${validTrialSlots.length} موعد تجريبي متاح (20 دقيقة)`
        : trialSlotMissingReason,
    missingReason: trialSlotMissingReason,
    adminTargetTab: 'slots',
    adminActionLabel: 'إضافة موعد تجريبي',
    tutorTargetTab: 'trials',
    tutorActionLabel: 'إضافة موعد تجريبي',
  };

  // Combine all 6 independent requirements
  const requirements: ReadinessRequirementItem[] = [
    avatarReq,
    bioReq,
    pricingReq,
    specsReq,
    paidPrivateSlotReq,
    trialSlotReq,
  ];

  const completedRequirementsCount = requirements.filter((r) => r.completed).length;
  const missingRequirements = requirements.filter((r) => !r.completed);
  const completionPercentage = Math.round((completedRequirementsCount / 6) * 100);

  // Upcoming days coverage calculation
  const allFutureSlotDates = Array.from(
    new Set([
      ...validTrialSlots.map((s) => String(s.slotDate).slice(0, 10)),
      ...validPaidPrivateSlots.map((s) => String(s.slotDate).slice(0, 10)),
    ])
  ).sort();

  const distinctUpcomingDaysCount = allFutureSlotDates.length;
  let coverageSpanDays = 0;
  if (allFutureSlotDates.length >= 2) {
    const firstMs = Date.parse(`${allFutureSlotDates[0]}T00:00:00Z`);
    const lastMs = Date.parse(`${allFutureSlotDates[allFutureSlotDates.length - 1]}T00:00:00Z`);
    if (Number.isFinite(firstMs) && Number.isFinite(lastMs) && lastMs >= firstMs) {
      coverageSpanDays = Math.round((lastMs - firstMs) / (1000 * 60 * 60 * 24)) + 1;
    }
  } else if (allFutureSlotDates.length === 1) {
    coverageSpanDays = 1;
  }

  const slotPolicyWarnings: string[] = [];
  if (validTrialSlots.length < requiredTrialSlots) {
    slotPolicyWarnings.push(
      `المواعيد التجريبية المتاحة (${validTrialSlots.length}) أقل من سياسة الجاهزية (${requiredTrialSlots}).`
    );
  }
  if (validPaidPrivateSlots.length < requiredPaidSlots) {
    slotPolicyWarnings.push(
      `مواعيد الحصص الخاصة المدفوعة (${validPaidPrivateSlots.length}) أقل من سياسة الجاهزية (${requiredPaidSlots}).`
    );
  }
  const minCoverageDays = Math.max(1, policy.minDistinctCoverageDays || 1);
  if (distinctUpcomingDaysCount < minCoverageDays) {
    slotPolicyWarnings.push(
      `تغطية الأيام القادمة (${distinctUpcomingDaysCount} يوم) أقل من الحد المطلوب في السياسة (${minCoverageDays} أيام).`
    );
  }

  const meetsSlotPolicyThresholds =
    validTrialSlots.length >= requiredTrialSlots &&
    validPaidPrivateSlots.length >= requiredPaidSlots &&
    distinctUpcomingDaysCount >= minCoverageDays;

  const isDataComplete6of6 = completedRequirementsCount === 6 && meetsSlotPolicyThresholds;
  const isReadyForInitialPublish =
    isDataComplete6of6 &&
    (!policy.requireInitialQualityReviewForFirstPublish ||
      initialQualityReview.isQualityReviewComplete);

  let overallStatus: TutorReadinessOverallStatus;
  let statusBadgeLabel: string;

  if (isPublished) {
    if (!paidPrivateSlotReq.completed || !trialSlotReq.completed || !meetsSlotPolicyThresholds) {
      overallStatus = 'published_needs_slots';
      statusBadgeLabel = 'منشور — يحتاج تحديث المواعيد';
    } else if (!isDataComplete6of6) {
      overallStatus = 'incomplete_data';
      statusBadgeLabel = `منشور — بحاجة لاستكمال (${completedRequirementsCount}/6)`;
    } else {
      overallStatus = 'published_ready';
      statusBadgeLabel = 'منشور ومكتمل (6/6)';
    }
  } else {
    if (isReadyForInitialPublish) {
      overallStatus = 'ready_for_first_publish';
      statusBadgeLabel = 'جاهز للنشر النهائي (6/6)';
    } else if (isDataComplete6of6) {
      overallStatus = 'data_complete_needs_quality_review';
      statusBadgeLabel = 'مكتمل البيانات (6/6) — بانتظار مراجعة الجودة';
    } else {
      overallStatus = 'incomplete_data';
      statusBadgeLabel = `بحاجة لاستكمال (${completedRequirementsCount}/6)`;
    }
  }

  return {
    tutorId: tutor.id,
    isPublished,
    evaluationError: false,
    evaluationErrorMessage: null,
    overallStatus,
    statusBadgeLabel,
    totalRequirementsCount: 6,
    completedRequirementsCount,
    completionPercentage,
    isDataComplete6of6,
    isReadyForInitialPublish,
    requirements,
    missingRequirements,
    validTrialSlots,
    validPaidPrivateSlots,
    freePrivateSlotsCount,
    validTrialSlotsCount: validTrialSlots.length,
    validPaidPrivateSlotsCount: validPaidPrivateSlots.length,
    earliestTrialSlot: validTrialSlots[0] || null,
    earliestPaidPrivateSlot: validPaidPrivateSlots[0] || null,
    distinctUpcomingDaysCount,
    coverageSpanDays,
    meetsSlotPolicyThresholds,
    slotPolicyWarnings,
    initialQualityReview,
  };
}

/**
 * Throws a clear Arabic error listing all missing items if an unpublished tutor is being transitioned to published
 * (`isPublished: false -> true`) without satisfying all 6 requirements + initial quality review.
 */
export function assertTutorReadyForInitialPublish(
  evaluation: TutorProfileReadinessEvaluation
): void {
  if (evaluation.evaluationError) {
    throw new Error(
      evaluation.evaluationErrorMessage ||
        'تعذر تقييم جاهزية المعلم للنشر حالياً. يرجى إعادة المحاولة أولاً.'
    );
  }

  const reasons: string[] = [];
  for (const req of evaluation.missingRequirements) {
    reasons.push(`• ${req.title}: ${req.missingReason || req.statusText}`);
  }
  for (const warn of evaluation.slotPolicyWarnings) {
    if (!reasons.some((r) => r.includes(warn))) {
      reasons.push(`• سياسة المواعيد: ${warn}`);
    }
  }
  if (!evaluation.initialQualityReview.isQualityReviewComplete) {
    for (const qReason of evaluation.initialQualityReview.missingQualityReasons) {
      reasons.push(`• مراجعة الجودة الأولية: ${qReason}`);
    }
  }

  if (reasons.length > 0) {
    throw new Error(
      `لا يمكن نشر ملف المعلم للجمهور قبل استيفاء شروط الجاهزية (6/6) ومراجعة الجودة الأولية:\n${reasons.join('\n')}`
    );
  }
}

/**
 * Generates an editable Arabic WhatsApp draft message for the admin to send to the tutor
 * listing confirmed missing profile items and the tutor portal link.
 */
export function buildTutorProfileCompletionWhatsAppDraft(params: {
  tutorName: string;
  honorific?: string;
  evaluation: TutorProfileReadinessEvaluation;
  portalUrl?: string;
  customAdminNote?: string;
}): string {
  if (params.evaluation.evaluationError) {
    throw new Error(
      params.evaluation.evaluationErrorMessage ||
        'تعذر تجهيز مسودة طلب استكمال الملف لأن تقييم الجاهزية من الخادم لم يكتمل.'
    );
  }

  const honorificPrefix = params.honorific ? `${params.honorific} ` : 'أ. ';
  const cleanName = String(params.tutorName || 'معلمنا العزيز').trim();
  const portalLink =
    params.portalUrl ||
    (typeof window !== 'undefined' && window.location?.origin
      ? `${window.location.origin}/#tutor-portal`
      : 'https://shatir.classes/#tutor-portal');

  const lines: string[] = [
    `مرحباً ${honorificPrefix}${cleanName}،`,
    'نتمنى لك يوماً سعيداً من فريق إدارة منصة شاطر كلاسيز 🌟',
  ];

  const missingReqs = params.evaluation.missingRequirements;
  const qualityNotes = params.evaluation.initialQualityReview.missingQualityReasons;

  if (params.evaluation.overallStatus === 'published_needs_slots') {
    lines.push(
      '',
      'ملفك منشور حالياً لأولياء الأمور، ولكن نود تذكيرك بتحديث وإضافة مواعيد مستقبلية جديدة حتى يتمكن أولياء الأمور من الحجز معك:'
    );
    for (const req of missingReqs) {
      lines.push(`- ${req.title}: ${req.missingReason || req.statusText}`);
    }
  } else if (missingReqs.length > 0) {
    lines.push(
      '',
      'لتجهيز ملفك ونشره لأولياء الأمور على المنصة، يرجى استكمال العناصر التالية من لوحة المعلم الخاصة بك:'
    );
    for (const req of missingReqs) {
      lines.push(`- ${req.title}: ${req.missingReason || req.statusText}`);
    }
  } else if (qualityNotes.length > 0) {
    lines.push(
      '',
      'شكراً لاستكمال بيانات ملفك! توجد ملاحظة سريعة ضمن مراجعة الجودة الأولية قبل تفعيل النشر العام:'
    );
    for (const note of qualityNotes) {
      lines.push(`- ${note}`);
    }
  } else {
    lines.push(
      '',
      'شكراً لاستكمال بيانات ملفك التعليمي على منصة شاطر كلاسيز.'
    );
  }

  if (params.customAdminNote && params.customAdminNote.trim()) {
    lines.push('', `ملاحظة الإدارة: ${params.customAdminNote.trim()}`);
  }

  lines.push(
    '',
    `رابط لوحة المعلم لتحديث ملفك ومواعيدك مباشرة:`,
    portalLink,
    '',
    'مع خالص التحية،',
    'إدارة شاطر كلاسيز'
  );

  return lines.join('\n');
}

// ============================================================================
// 4. Batched Readiness Slot Rows RPC Contract Parser & Helper (v1)
// ============================================================================

export const READINESS_SLOT_ROWS_RPC_BATCH_SIZE = 500;

export interface ParsedAdminReadinessSlotRows {
  version: 1;
  evaluatedAt: string;
  evaluatedAtMs: number;
  trialSlots: TutorAvailableSlot[];
  privateSlots: TutorPrivateSlot[];
}

export interface FetchAdminReadinessSlotRowsResult {
  success: boolean;
  errorMessage: string | null;
  evaluatedAt: string | null;
  evaluatedAtMs: number;
  trialSlots: TutorAvailableSlot[];
  privateSlots: TutorPrivateSlot[];
}

export type AdminReadinessSlotRowsRpcInvoker = (
  tutorIdsBatch: string[]
) => Promise<{
  data: unknown;
  error: { message?: string; code?: string } | null;
}>;

/**
 * Strictly validates and maps the JSONB response of `public.admin_get_readiness_slot_rows_v1`.
 * Never fabricates missing arrays, timestamps, or sensitive/internal fields (like notes).
 */
export function parseAdminReadinessSlotRowsResponse(
  raw: unknown
): ParsedAdminReadinessSlotRows {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('استجابة دالة تقييم المواعيد غير صالحة (ليست كائنًا).');
  }

  const payload = raw as Record<string, unknown>;
  if (payload.version !== 1) {
    throw new Error(
      `إصدار عقد دالة تقييم المواعيد غير مدعوم (${String(payload.version ?? 'غير محدد')}).`
    );
  }

  if (typeof payload.evaluated_at !== 'string' || !payload.evaluated_at.trim()) {
    throw new Error('استجابة دالة تقييم المواعيد تفتقد التوقيت المرجعي للخادم (evaluated_at).');
  }

  const evaluatedAtMs = Date.parse(payload.evaluated_at);
  if (!Number.isFinite(evaluatedAtMs)) {
    throw new Error('توقيت الخادم المرجعي في استجابة المواعيد غير صالح.');
  }

  if (!Array.isArray(payload.trial_slots) || !Array.isArray(payload.private_slots)) {
    throw new Error('استجابة دالة تقييم المواعيد تفتقد مصفوفات trial_slots أو private_slots.');
  }

  const trialSlots: TutorAvailableSlot[] = payload.trial_slots.map((row: any) => ({
    id: String(row?.id ?? ''),
    tutorId: String(row?.tutor_id ?? ''),
    slotDate: String(row?.slot_date ?? ''),
    startTime: String(row?.start_time ?? ''),
    endTime: String(row?.end_time ?? ''),
    timezone: String(row?.timezone || 'Africa/Cairo'),
    isAvailable: Boolean(row?.is_available),
    isBooked: Boolean(row?.is_booked),
    adminSuspended: Boolean(row?.admin_suspended),
  }));

  const privateSlots: TutorPrivateSlot[] = payload.private_slots.map((row: any) => ({
    id: String(row?.id ?? ''),
    tutorId: String(row?.tutor_id ?? ''),
    specializationLabel: String(row?.specialization_label || ''),
    offeringCourseOptionId: row?.offering_course_option_id ? String(row.offering_course_option_id) : null,
    quranAgeGroupId: row?.quran_age_group_id ? String(row.quran_age_group_id) : null,
    quranLevelId: row?.quran_level_id ? String(row.quran_level_id) : null,
    allowedSpecializations: Array.isArray(row?.allowed_specializations)
      ? row.allowed_specializations
      : undefined,
    slotDate: String(row?.slot_date ?? ''),
    startTime: String(row?.start_time ?? ''),
    endTime: String(row?.end_time ?? ''),
    timezone: String(row?.timezone || 'Africa/Cairo'),
    durationMinutes: Number(row?.duration_minutes ?? 0),
    priceAmount:
      row?.price_amount !== null && row?.price_amount !== undefined
        ? Number(row.price_amount)
        : 0,
    currency: String(row?.currency || 'ج.م'),
    isAvailable: Boolean(row?.is_available),
    isBooked: Boolean(row?.is_booked),
    adminSuspended: Boolean(row?.admin_suspended),
  }));

  return {
    version: 1,
    evaluatedAt: payload.evaluated_at,
    evaluatedAtMs,
    trialSlots,
    privateSlots,
  };
}

/**
 * Fetches readiness slot rows via `admin_get_readiness_slot_rows_v1` in deduplicated
 * batches of at most 500 tutor IDs. On any RPC error or malformed response, returns
 * `success: false` so callers fail explicitly (`evaluationError: true`) rather than
 * falling back to direct table reads or assuming 0 slots.
 */
export async function fetchAdminReadinessSlotRows(
  tutorIds: string[],
  rpcInvoker: AdminReadinessSlotRowsRpcInvoker
): Promise<FetchAdminReadinessSlotRowsResult> {
  const uniqueIds = Array.from(
    new Set(
      (tutorIds || [])
        .map((id) => String(id ?? '').trim())
        .filter((id) => id.length > 0)
    )
  );

  if (uniqueIds.length === 0) {
    const nowMs = Date.now();
    return {
      success: true,
      errorMessage: null,
      evaluatedAt: new Date(nowMs).toISOString(),
      evaluatedAtMs: nowMs,
      trialSlots: [],
      privateSlots: [],
    };
  }

  const batches: string[][] = [];
  for (let i = 0; i < uniqueIds.length; i += READINESS_SLOT_ROWS_RPC_BATCH_SIZE) {
    batches.push(uniqueIds.slice(i, i + READINESS_SLOT_ROWS_RPC_BATCH_SIZE));
  }

  try {
    const results = await Promise.all(
      batches.map(async (batch) => {
        const { data, error } = await rpcInvoker(batch);
        if (error) {
          const codePart = error.code ? ` (${error.code})` : '';
          throw new Error(
            `فشل استدعاء دالة مواعيد الجاهزية admin_get_readiness_slot_rows_v1${codePart}: ${error.message || 'خطأ غير معروف'}`
          );
        }
        return parseAdminReadinessSlotRowsResponse(data);
      })
    );

    const allTrials: TutorAvailableSlot[] = [];
    const allPrivates: TutorPrivateSlot[] = [];
    let resolvedEvaluatedAt = results[0].evaluatedAt;
    let resolvedEvaluatedAtMs = results[0].evaluatedAtMs;

    for (const part of results) {
      allTrials.push(...part.trialSlots);
      allPrivates.push(...part.privateSlots);
      if (part.evaluatedAtMs < resolvedEvaluatedAtMs) {
        resolvedEvaluatedAtMs = part.evaluatedAtMs;
        resolvedEvaluatedAt = part.evaluatedAt;
      }
    }

    const compareSlot = (
      a: { slotDate: string; startTime: string; id: string },
      b: { slotDate: string; startTime: string; id: string }
    ) => {
      const cmpDate = String(a.slotDate).localeCompare(String(b.slotDate));
      if (cmpDate !== 0) return cmpDate;
      const cmpTime = String(a.startTime).localeCompare(String(b.startTime));
      if (cmpTime !== 0) return cmpTime;
      return String(a.id).localeCompare(String(b.id));
    };

    allTrials.sort(compareSlot);
    allPrivates.sort(compareSlot);

    return {
      success: true,
      errorMessage: null,
      evaluatedAt: resolvedEvaluatedAt,
      evaluatedAtMs: resolvedEvaluatedAtMs,
      trialSlots: allTrials,
      privateSlots: allPrivates,
    };
  } catch (err: any) {
    return {
      success: false,
      errorMessage:
        err?.message ||
        'تعذر جلب مواعيد الجاهزية من دالة الخادم admin_get_readiness_slot_rows_v1.',
      evaluatedAt: null,
      evaluatedAtMs: Date.now(),
      trialSlots: [],
      privateSlots: [],
    };
  }
}

