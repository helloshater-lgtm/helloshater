/**
 * Centralized Meta Pixel Service for Shatir Classes
 * Pixel ID: 1515074777348342
 *
 * Feature Kill-Switch & Policy Isolation:
 * - Gated FIRST by SHATIR_CONFIG.metaPixelEnabled (currently false):
 *   when false, SDK script is NEVER loaded, Pixel is NEVER initialized, and ZERO requests/events
 *   are sent even if marketing consent was previously saved in localStorage.
 * - Strict Sensitive-Category Isolation:
 *   Blocks PageView, ViewContent, and Lead on Quran routes/paths, Quran or mixed-specialization tutors,
 *   and unknown/ambiguous-context requests (never substituting 'quran' with 'general').
 * - Strict exclusion of admin, tutor dashboard, private previews, and tutor join routes.
 * - Strict sanitization: NO PII (names, phones, emails, child data, WhatsApp texts).
 * - Never blocks site search, tutor profiles, Lead saving, or WhatsApp flows.
 */

import { SHATIR_CONFIG } from '../config/shatirConfig';
import { SearchCriteria, Tutor } from '../types';
import {
  isMarketingConsentGranted,
  subscribeConsentChanges,
} from './consentService';

export const META_PIXEL_ID = SHATIR_CONFIG.metaPixelId || '1515074777348342';
const META_SCRIPT_SRC = 'https://connect.facebook.net/en_US/fbevents.js';
const META_SCRIPT_ATTR = 'data-shatir-meta-pixel';

export type PublicOrExcludedAppView =
  | 'home'
  | 'tutor-profile'
  | 'join-as-tutor'
  | 'admin'
  | 'tutor-dashboard'
  | 'my-trials'
  | 'privacy'
  | 'terms';

const PUBLIC_PARENT_VIEWS = new Set<PublicOrExcludedAppView>([
  'home',
  'tutor-profile',
  'privacy',
  'terms',
]);

const EXCLUDED_HASH_PREFIXES = ['#admin', '#tutor-dashboard', '#join-as-tutor', '#my-trials'];

const SENSITIVE_QURAN_REGEX =
  /(القرآن|قرآن|تجويد|تحفيظ|التحفيظ|نور\s*البيان|quran|noor[_\s-]*bayan|tajweed|tahfiz|agegroupid|levelid)/i;

declare global {
  interface Window {
    fbq?: ((...args: any[]) => void) & {
      callMethod?: (...args: any[]) => void;
      queue?: any[];
      loaded?: boolean;
      version?: string;
      push?: (...args: any[]) => void;
    };
    _fbq?: any;
  }
}

export interface MetaPixelRuntimeAdapter {
  isPixelEnabled: () => boolean;
  isMarketingConsentGranted: () => boolean;
  getCurrentHash: () => string;
  getCurrentSearch: () => string;
  ensurePixelInitialized: (pixelId: string) => void;
  callFbq: (...args: any[]) => void;
}

/**
 * Checks whether a route view or browser hash belongs to excluded internal/tutor flows.
 */
export function isExcludedMetaRoute(
  view?: PublicOrExcludedAppView | string | null,
  currentHash?: string
): boolean {
  if (view && !PUBLIC_PARENT_VIEWS.has(view as PublicOrExcludedAppView)) {
    return true;
  }

  const hash = String(
    currentHash !== undefined
      ? currentHash
      : typeof window !== 'undefined'
      ? window.location.hash || ''
      : ''
  )
    .trim()
    .toLowerCase();

  return EXCLUDED_HASH_PREFIXES.some((prefix) => hash.startsWith(prefix));
}

/**
 * Checks whether a URL, hash, or query string carries sensitive/Quran path or parameter context.
 */
export function isSensitiveUrlOrPath(rawPathOrQuery?: string | null): boolean {
  const val = String(rawPathOrQuery || '').trim();
  if (!val) return false;
  return SENSITIVE_QURAN_REGEX.test(val);
}

/**
 * Strictly determines whether a tutor profile is eligible for Meta tracking:
 * - Must be published (`isPublished === true`)
 * - Must have at least one specialization offering
 * - ALL offerings must strictly belong to `'school'` (excludes pure Quran AND mixed school+quran tutors)
 * - Public text metadata must not expose Quran/religious program keywords
 */
export function isTutorEligibleForMetaTracking(tutor?: Tutor | null): boolean {
  if (!tutor) return false;
  if (tutor.isPublished !== true) return false;
  if (!Array.isArray(tutor.offerings) || tutor.offerings.length === 0) return false;

  const hasNonSchoolOffering = tutor.offerings.some((o) => o.track !== 'school');
  if (hasNonSchoolOffering) return false;

  const textParts: string[] = [
    tutor.headline || '',
    tutor.helpChildQuote || '',
    tutor.helpChildSummary || '',
    ...(Array.isArray(tutor.curriculumTags) ? tutor.curriculumTags : []),
    ...(Array.isArray(tutor.targetStudentCases) ? tutor.targetStudentCases : []),
    ...(Array.isArray(tutor.subjectsTaughtSummary)
      ? tutor.subjectsTaughtSummary.flatMap((s) => [s.title || '', s.curriculumNote || ''])
      : []),
  ];

  return !textParts.some((txt) => SENSITIVE_QURAN_REGEX.test(String(txt || '')));
}

/**
 * Returns true if search criteria reflects Quran or ambiguous/unknown ('all') track context.
 */
export function isSensitiveOrAmbiguousCriteria(criteria?: SearchCriteria | null): boolean {
  if (!criteria) return false;
  if (criteria.track === 'quran' || criteria.track === 'all') return true;
  if (criteria.ageGroupId || criteria.levelId) return true;
  return false;
}

/**
 * Sanitizes Meta event payload strictly against PII patterns and keeps only safe structural fields.
 */
function sanitizeMetaPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const ALLOWED_META_KEYS = new Set([
    'content_ids',
    'content_type',
    'content_category',
    'page_path',
    'request_type',
  ]);
  const clean: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(raw)) {
    if (!ALLOWED_META_KEYS.has(key)) continue;
    if (val === undefined || val === null) continue;

    if (Array.isArray(val)) {
      const safeArr = val
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim());
      if (safeArr.length > 0) {
        clean[key] = safeArr;
      }
      continue;
    }

    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed) continue;
      if (/^(\+?[0-9]{7,15})$/.test(trimmed.replace(/\s+/g, ''))) continue;
      if (trimmed.includes('@') && trimmed.includes('.')) continue;
      if (trimmed.includes('wa.me') || trimmed.includes('text=')) continue;
      clean[key] = trimmed;
    }
  }

  return clean;
}

/**
 * Installs the lightweight Meta Pixel queue stub once and injects fbevents.js once.
 * Never executes unless metaPixelEnabled === true AND marketing consent === 'granted'.
 */
function createBrowserMetaAdapter(): MetaPixelRuntimeAdapter {
  let scriptInjected = false;
  let initializedPixelId: string | null = null;

  const ensureFbqStub = () => {
    if (typeof window === 'undefined') return;
    if (typeof window.fbq === 'function') return;

    const fbqFunc: any = function (...args: any[]) {
      if (fbqFunc.callMethod) {
        fbqFunc.callMethod.apply(fbqFunc, args);
      } else {
        fbqFunc.queue.push(args);
      }
    };
    if (!window._fbq) window._fbq = fbqFunc;
    fbqFunc.push = fbqFunc;
    fbqFunc.loaded = true;
    fbqFunc.version = '2.0';
    fbqFunc.queue = [];
    window.fbq = fbqFunc;
  };

  const injectScriptOnce = () => {
    if (!SHATIR_CONFIG.metaPixelEnabled) return;
    if (scriptInjected || typeof document === 'undefined') return;
    if (document.querySelector(`script[${META_SCRIPT_ATTR}="1"]`)) {
      scriptInjected = true;
      return;
    }

    scriptInjected = true;
    try {
      const script = document.createElement('script');
      script.async = true;
      script.src = META_SCRIPT_SRC;
      script.setAttribute(META_SCRIPT_ATTR, '1');
      script.onerror = () => {
        // Silently absorb adblocker / network errors so site UX never breaks
      };
      const firstScript = document.getElementsByTagName('script')[0];
      if (firstScript && firstScript.parentNode) {
        firstScript.parentNode.insertBefore(script, firstScript);
      } else if (document.head) {
        document.head.appendChild(script);
      }
    } catch {
      // Never block UI execution
    }
  };

  return {
    isPixelEnabled: () => Boolean(SHATIR_CONFIG.metaPixelEnabled),
    isMarketingConsentGranted,
    getCurrentHash: () => (typeof window !== 'undefined' ? window.location.hash || '' : ''),
    getCurrentSearch: () => (typeof window !== 'undefined' ? window.location.search || '' : ''),
    ensurePixelInitialized: (pixelId: string) => {
      if (!SHATIR_CONFIG.metaPixelEnabled) return;
      if (typeof window === 'undefined') return;
      ensureFbqStub();
      injectScriptOnce();

      if (initializedPixelId !== pixelId && typeof window.fbq === 'function') {
        try {
          // Keep automatic button/form event capture & automatic matching disabled
          window.fbq('set', 'autoConfig', false, pixelId);
          // Initialize strictly with Pixel ID only (zero PII user data object)
          window.fbq('init', pixelId);
          initializedPixelId = pixelId;
        } catch {
          // Ignore errors
        }
      }
    },
    callFbq: (...args: any[]) => {
      if (!SHATIR_CONFIG.metaPixelEnabled) return;
      if (typeof window === 'undefined' || typeof window.fbq !== 'function') return;
      try {
        window.fbq(...args);
      } catch {
        // Ignore fbq call errors
      }
    },
  };
}

export function createMetaPixelController(
  adapter: MetaPixelRuntimeAdapter,
  pixelId: string = META_PIXEL_ID
) {
  let hasGrantedInSession = false;
  let lastTrackedPagePath: string | null = null;
  let lastTrackedTutorViewId: string | null = null;
  const sentLeadReferenceCodes = new Set<string>();

  const isActive = (): boolean => {
    return Boolean(adapter.isPixelEnabled()) && Boolean(adapter.isMarketingConsentGranted());
  };

  const syncConsentState = (granted?: boolean): void => {
    // Master feature kill-switch: never load SDK, initialize, or fire requests while disabled
    if (!adapter.isPixelEnabled()) {
      if (hasGrantedInSession) {
        adapter.callFbq('consent', 'revoke');
      }
      hasGrantedInSession = false;
      lastTrackedPagePath = null;
      lastTrackedTutorViewId = null;
      return;
    }

    const isGranted = granted !== undefined ? granted : adapter.isMarketingConsentGranted();

    if (isGranted) {
      adapter.ensurePixelInitialized(pixelId);
      if (!hasGrantedInSession) {
        adapter.callFbq('consent', 'grant');
        hasGrantedInSession = true;
      }
    } else {
      if (hasGrantedInSession) {
        adapter.callFbq('consent', 'revoke');
      }
      hasGrantedInSession = false;
      lastTrackedPagePath = null;
      lastTrackedTutorViewId = null;
    }
  };

  const trackPageView = (params: {
    path: string;
    view?: PublicOrExcludedAppView;
    tutor?: Tutor | null;
    criteria?: SearchCriteria | null;
  }): boolean => {
    if (!isActive()) return false;
    if (isExcludedMetaRoute(params.view, adapter.getCurrentHash())) return false;
    if (isSensitiveUrlOrPath(params.path) || isSensitiveUrlOrPath(adapter.getCurrentSearch())) {
      return false;
    }
    if (isSensitiveOrAmbiguousCriteria(params.criteria)) {
      return false;
    }

    // Tutor profile route MUST wait for loaded published non-Quran school-only tutor
    if (params.view === 'tutor-profile' && !isTutorEligibleForMetaTracking(params.tutor)) {
      return false;
    }

    const normalizedPath = String(params.path || '/').trim() || '/';
    if (lastTrackedPagePath === normalizedPath) return false;

    syncConsentState(true);
    lastTrackedPagePath = normalizedPath;

    const payload = sanitizeMetaPayload({
      page_path: normalizedPath,
    });
    adapter.callFbq('track', 'PageView', payload);
    return true;
  };

  const trackViewContent = (params: {
    tutor?: Tutor | null;
    tutorId?: string;
    isPreview?: boolean;
    view?: PublicOrExcludedAppView;
    criteria?: SearchCriteria | null;
  }): boolean => {
    if (!isActive()) return false;
    if (params.isPreview === true) return false;
    if (params.view && params.view !== 'tutor-profile') return false;
    if (isExcludedMetaRoute(params.view || 'tutor-profile', adapter.getCurrentHash())) return false;
    if (isSensitiveUrlOrPath(adapter.getCurrentHash()) || isSensitiveUrlOrPath(adapter.getCurrentSearch())) {
      return false;
    }
    if (isSensitiveOrAmbiguousCriteria(params.criteria)) return false;

    // Require full tutor inspection: strictly published, non-Quran, non-mixed school-only
    if (!isTutorEligibleForMetaTracking(params.tutor)) return false;

    const tutorId = String(params.tutor?.id || params.tutorId || '').trim();
    if (!tutorId) return false;
    if (lastTrackedTutorViewId === tutorId) return false;

    syncConsentState(true);
    lastTrackedTutorViewId = tutorId;

    const payload = sanitizeMetaPayload({
      content_ids: [tutorId],
      content_type: 'product',
      content_category: 'school',
    });
    adapter.callFbq('track', 'ViewContent', payload);
    return true;
  };

  const resetTutorViewTracking = (): void => {
    lastTrackedTutorViewId = null;
  };

  const trackLead = (params: {
    referenceCode?: string | null;
    track?: 'school' | 'quran' | null;
    requestType: 'trial' | 'private' | 'group' | 'recommendation';
    tutor?: Tutor | null;
    tutorEligibleForMeta?: boolean;
    quranAgeGroupId?: string | null;
    quranLevelId?: string | null;
    isPreview?: boolean;
    view?: PublicOrExcludedAppView;
  }): boolean => {
    if (!isActive()) return false;
    if (params.isPreview === true) return false;
    if (isExcludedMetaRoute(params.view, adapter.getCurrentHash())) return false;
    if (isSensitiveUrlOrPath(adapter.getCurrentHash()) || isSensitiveUrlOrPath(adapter.getCurrentSearch())) {
      return false;
    }

    // Strict Track & Context Gate:
    // ONLY explicit 'school' track is permitted. Never allow 'quran', null, undefined, or generic substitution.
    if (params.track !== 'school') return false;
    if (params.quranAgeGroupId || params.quranLevelId) return false;

    // Unknown-context recommendation without explicit tutor/school verification is rejected
    if (params.requestType === 'recommendation' && params.tutor === undefined && params.tutorEligibleForMeta !== true) {
      return false;
    }

    // If lead is tied to a tutor, enforce non-Quran & non-mixed school-only tutor check
    if (params.tutor && !isTutorEligibleForMetaTracking(params.tutor)) {
      return false;
    }
    if (params.tutorEligibleForMeta === false) {
      return false;
    }

    const ref = String(params.referenceCode || '').trim();
    if (!ref) return false;
    if (sentLeadReferenceCodes.has(ref)) return false;

    syncConsentState(true);
    sentLeadReferenceCodes.add(ref);

    const payload = sanitizeMetaPayload({
      content_category: 'school',
      request_type: params.requestType,
    });
    adapter.callFbq('track', 'Lead', payload);
    return true;
  };

  /**
   * Conversion for ads: a free trial was booked (standard «Schedule» event).
   * School tutors only (Quran / mixed tutors are never tracked), no PII, once per booking.
   */
  const sentBookings = new Set<string>();
  const trackTrialBooked = (params: { bookingId: string; tutor?: Tutor | null }): boolean => {
    if (!isActive()) return false;
    const hash = adapter.getCurrentHash();
    if (EXCLUDED_HASH_PREFIXES.some((p) => hash.startsWith(p))) return false;
    if (isSensitiveUrlOrPath(adapter.getCurrentSearch())) return false;
    if (!isTutorEligibleForMetaTracking(params.tutor)) return false;
    const id = String(params.bookingId || '').trim();
    if (!id || sentBookings.has(id)) return false;
    syncConsentState(true);
    sentBookings.add(id);
    adapter.callFbq('track', 'Schedule', sanitizeMetaPayload({ content_category: 'school', request_type: 'trial' }));
    return true;
  };

  return {
    pixelId,
    trackTrialBooked,
    isEnabled: () => Boolean(adapter.isPixelEnabled()),
    syncConsentState,
    trackPageView,
    trackViewContent,
    resetTutorViewTracking,
    trackLead,
  };
}

const defaultAdapter = createBrowserMetaAdapter();
export const MetaPixelService = createMetaPixelController(defaultAdapter, META_PIXEL_ID);

if (typeof window !== 'undefined') {
  subscribeConsentChanges((prefs) => {
    MetaPixelService.syncConsentState(prefs.marketing === 'granted');
  });
}
