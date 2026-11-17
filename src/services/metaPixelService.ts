/**
 * Centralized Meta Pixel Service for Shatir Classes
 * Pixel ID: 1515074777348342
 *
 * Guarantees:
 * - Loads fbevents.js dynamically once ONLY after explicit marketing consent is granted
 * - No <noscript> fallback image that would fire without consent
 * - Automatic Matching & Automatic Form/Button Events disabled (autoConfig: false, no user data in init)
 * - Strict exclusion of admin, tutor dashboard, private previews, and tutor join routes
 * - Strict sanitization: NO names, phones, emails, child data, or WhatsApp message text
 * - Strict deduplication for PageView, ViewContent (published tutor only), and Lead (once per saved lead)
 * - Never blocks search, profile loading, or lead submission if Pixel script is blocked or rejected
 */

import { SHATIR_CONFIG } from '../config/shatirConfig';
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
  | 'privacy'
  | 'terms';

const PUBLIC_PARENT_VIEWS = new Set<PublicOrExcludedAppView>([
  'home',
  'tutor-profile',
  'privacy',
  'terms',
]);

const EXCLUDED_HASH_PREFIXES = ['#admin', '#tutor-dashboard', '#join-as-tutor'];

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
  isMarketingConsentGranted: () => boolean;
  getCurrentHash: () => string;
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
 * Uses set autoConfig=false and init(pixelId) with NO user-data object (no advanced matching).
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
    isMarketingConsentGranted,
    getCurrentHash: () => (typeof window !== 'undefined' ? window.location.hash || '' : ''),
    ensurePixelInitialized: (pixelId: string) => {
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

  const syncConsentState = (granted?: boolean): void => {
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
  }): boolean => {
    if (!adapter.isMarketingConsentGranted()) return false;
    if (isExcludedMetaRoute(params.view, adapter.getCurrentHash())) return false;

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
    tutorId: string;
    track: 'school' | 'quran';
    isPublished?: boolean;
    isPreview?: boolean;
    view?: PublicOrExcludedAppView;
  }): boolean => {
    if (!adapter.isMarketingConsentGranted()) return false;
    if (params.isPreview === true) return false;
    if (params.isPublished !== true) return false;
    if (params.view && params.view !== 'tutor-profile') return false;
    if (isExcludedMetaRoute(params.view || 'tutor-profile', adapter.getCurrentHash())) return false;

    const tutorId = String(params.tutorId || '').trim();
    if (!tutorId) return false;
    if (lastTrackedTutorViewId === tutorId) return false;

    syncConsentState(true);
    lastTrackedTutorViewId = tutorId;

    const payload = sanitizeMetaPayload({
      content_ids: [tutorId],
      content_type: 'product',
      content_category: params.track,
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
    isPreview?: boolean;
    view?: PublicOrExcludedAppView;
  }): boolean => {
    if (!adapter.isMarketingConsentGranted()) return false;
    if (params.isPreview === true) return false;
    if (isExcludedMetaRoute(params.view, adapter.getCurrentHash())) return false;

    const ref = String(params.referenceCode || '').trim();
    if (!ref) return false;
    if (sentLeadReferenceCodes.has(ref)) return false;

    syncConsentState(true);
    sentLeadReferenceCodes.add(ref);

    const payload = sanitizeMetaPayload({
      content_category: params.track || 'general',
      request_type: params.requestType,
    });
    adapter.callFbq('track', 'Lead', payload);
    return true;
  };

  return {
    pixelId,
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
