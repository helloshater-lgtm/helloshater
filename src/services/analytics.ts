/**
 * Google Analytics 4 (GA4) Centralized Service for Shatir Classes
 * Measurement ID: G-CGL8XBRE0J
 * 
 * Strict Privacy & Sanitization:
 * - Never sends personal data (names, phone numbers, application data, WhatsApp message text, or raw URLs)
 * - Strict allowlist for event parameters
 * - Deduplication for React renders and SPA hash changes
 */

import { SearchCriteria } from '../types';
import { SHATIR_CONFIG } from '../config/shatirConfig';

declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
  }
}

export const GA_MEASUREMENT_ID = SHATIR_CONFIG.gaMeasurementId || 'G-CGL8XBRE0J';

// Strict parameter allowlist: only non-PII, public categorization keys are permitted
const ALLOWED_EVENT_PARAMS = new Set([
  'page_path',
  'page_title',
  'page_location',
  'track',
  'stage_id',
  'grade_id',
  'curriculum_id',
  'subject_id',
  'quran_age_group_id',
  'quran_level_id',
  'tutor_id',
  'slot_id',
  'source',
  'has_slots',
]);

// Deduplication state to prevent double-firing on React re-renders
let lastTrackedPagePath: string | null = null;
let hasFiredSelectorStarted = false;
let lastNoCourseComboKey: string | null = null;
let lastNoTutorsSearchKey: string | null = null;
let lastOpenedTutorProfileId: string | null = null;

/**
 * Filter out any parameter not strictly on the allowlist
 * Also validates that values do not contain phone numbers, emails, or free-form sensitive strings
 */
function sanitizeEventParams(params?: Record<string, any>): Record<string, any> {
  if (!params) return {};
  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(params)) {
    if (!ALLOWED_EVENT_PARAMS.has(key)) {
      continue;
    }

    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      // Block anything that looks like a phone number (e.g. 010..., +20..., etc.) or email
      if (/^(\+?[0-9]{7,15})$/.test(trimmed.replace(/\s+/g, ''))) {
        continue;
      }
      if (trimmed.includes('@') && trimmed.includes('.')) {
        continue;
      }
      // Block WhatsApp URLs with message payloads
      if (trimmed.includes('wa.me') || trimmed.includes('text=')) {
        continue;
      }
      sanitized[key] = trimmed;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Low-level safe dispatcher to window.gtag
 */
export function sendGAEvent(eventName: string, params?: Record<string, any>): void {
  if (typeof window === 'undefined') return;

  const safeParams = sanitizeEventParams(params);

  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, safeParams);
  } else if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push(['event', eventName, safeParams]);
  }

  if (import.meta.env?.DEV) {
    // Helpful for verification during local testing
    console.debug(`[GA4 Event] ${eventName}:`, safeParams);
  }
}

/**
 * Tracks React SPA Page Views with deduplication
 * Handles normal paths and hash-based routes (e.g., /#tutor/xxx, /#join-as-tutor)
 */
export function trackPageView(customPath?: string, customTitle?: string): void {
  if (typeof window === 'undefined') return;

  const path = customPath || (window.location.hash ? `/${window.location.hash}` : window.location.pathname || '/');
  const title = customTitle || document.title || 'شاطر كلاسيز';

  // Prevent duplicate page_view events on the exact same path
  if (lastTrackedPagePath === path) {
    return;
  }

  lastTrackedPagePath = path;

  // Clean URL without sensitive query parameters
  const sanitizedLocation = `${window.location.origin}${path}`;

  sendGAEvent('page_view', {
    page_path: path,
    page_title: title,
    page_location: sanitizedLocation,
  });
}

/**
 * 1. parent_selector_started:
 * Triggered when a parent starts using/interacting with the tutor selector for the first time
 * Deduplicated per interaction cycle.
 */
export function trackParentSelectorStarted(track: 'school' | 'quran' = 'school'): void {
  if (hasFiredSelectorStarted) return;
  hasFiredSelectorStarted = true;

  sendGAEvent('parent_selector_started', {
    track,
  });
}

/**
 * Resets the selector interaction state (e.g., when resetting filters)
 */
export function resetSelectorStartedTracking(): void {
  hasFiredSelectorStarted = false;
  lastNoCourseComboKey = null;
}

/**
 * 2. parent_search_submitted:
 * Triggered when the parent executes a search.
 * Only public IDs (track, stage, grade, curriculum, subject or quran age/level) are sent.
 */
export function trackParentSearchSubmitted(criteria: SearchCriteria): void {
  if (criteria.track === 'school') {
    sendGAEvent('parent_search_submitted', {
      track: 'school',
      stage_id: criteria.stageId,
      grade_id: criteria.gradeId,
      curriculum_id: criteria.curriculumType,
      subject_id: criteria.subjectId,
    });
  } else {
    sendGAEvent('parent_search_submitted', {
      track: 'quran',
      quran_age_group_id: criteria.ageGroupId,
      quran_level_id: criteria.levelId,
    });
  }
}

/**
 * 3. no_course_options_shown:
 * Triggered when a grade and curriculum are selected, but no active courses/subjects exist in the database.
 * Deduplicated per stage + grade + curriculum combination.
 */
export function trackNoCourseOptionsShown(
  stageId?: string,
  gradeId?: string,
  curriculumType?: string
): void {
  const comboKey = `${stageId || ''}_${gradeId || ''}_${curriculumType || ''}`;
  if (lastNoCourseComboKey === comboKey) return;
  lastNoCourseComboKey = comboKey;

  sendGAEvent('no_course_options_shown', {
    track: 'school',
    stage_id: stageId,
    grade_id: gradeId,
    curriculum_id: curriculumType,
  });
}

/**
 * 4. no_tutors_shown:
 * Triggered when a search completes and returns 0 tutors.
 * Deduplicated per criteria.
 */
export function trackNoTutorsShown(criteria: SearchCriteria): void {
  const searchKey = criteria.track === 'school'
    ? `school_${criteria.stageId}_${criteria.gradeId}_${criteria.curriculumType}_${criteria.subjectId}`
    : `quran_${criteria.ageGroupId}_${criteria.levelId}`;

  if (lastNoTutorsSearchKey === searchKey) return;
  lastNoTutorsSearchKey = searchKey;

  if (criteria.track === 'school') {
    sendGAEvent('no_tutors_shown', {
      track: 'school',
      stage_id: criteria.stageId,
      grade_id: criteria.gradeId,
      curriculum_id: criteria.curriculumType,
      subject_id: criteria.subjectId,
    });
  } else {
    sendGAEvent('no_tutors_shown', {
      track: 'quran',
      quran_age_group_id: criteria.ageGroupId,
      quran_level_id: criteria.levelId,
    });
  }
}

/**
 * 5. tutor_profile_opened:
 * Triggered when a tutor profile view is loaded.
 * Only sends the public tutor_id. Deduplicated per tutor opening.
 */
export function trackTutorProfileOpened(tutorId: string): void {
  if (lastOpenedTutorProfileId === tutorId) return;
  lastOpenedTutorProfileId = tutorId;

  sendGAEvent('tutor_profile_opened', {
    tutor_id: tutorId,
  });
}

/**
 * Reset tutor profile opened deduplication when leaving the profile
 */
export function resetTutorProfileTracking(): void {
  lastOpenedTutorProfileId = null;
}

/**
 * 6. trial_slot_selected:
 * Triggered when the parent clicks on an available slot in the tutor profile.
 * Only sends tutor_id and slot_id.
 */
export function trackTrialSlotSelected(tutorId: string, slotId: string): void {
  sendGAEvent('trial_slot_selected', {
    tutor_id: tutorId,
    slot_id: slotId,
  });
}

/**
 * 7. whatsapp_clicked:
 * Triggered when any WhatsApp button or link is clicked.
 * Includes a source parameter (e.g. 'header', 'hero_cta', 'floating_button', 'footer', 'empty_search_interest', 'trial_booking_modal', 'no_slots_inquiry').
 * Never contains personal data, phone numbers, or prefilled message text.
 */
export function trackWhatsAppClicked(source: string, extra?: { tutor_id?: string }): void {
  sendGAEvent('whatsapp_clicked', {
    source,
    tutor_id: extra?.tutor_id,
  });
}

/**
 * 8. teacher_application_whatsapp_clicked:
 * Triggered when the teacher completes the application form and clicks the final WhatsApp submission button.
 * Sends NO form data, NO applicant phone number, NO applicant name.
 */
export function trackTeacherApplicationWhatsAppClicked(): void {
  sendGAEvent('teacher_application_whatsapp_clicked', {
    source: 'teacher_application',
  });
}
