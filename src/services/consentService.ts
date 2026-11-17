/**
 * Centralized Privacy & Tracking Consent Manager for Shatir Classes
 * Manages independent consent choices for:
 * 1. Google Analytics 4 (analytics_storage) -> localStorage key 'shatir_ga_consent'
 * 2. Meta Pixel / Ad Measurement (marketing / ad_storage) -> localStorage key 'shatir_meta_consent'
 */

import { SHATIR_CONFIG } from '../config/shatirConfig';

export type ConsentDecision = 'granted' | 'denied';
export type StoredConsentValue = ConsentDecision | 'unset';

export interface ConsentPreferences {
  analytics: StoredConsentValue;
  marketing: StoredConsentValue;
}

export const GA_CONSENT_STORAGE_KEY = 'shatir_ga_consent';
export const META_CONSENT_STORAGE_KEY = 'shatir_meta_consent';
export const CONSENT_CHANGED_EVENT = 'shatir:consent-changed';
export const OPEN_CONSENT_SETTINGS_EVENT = 'shatir:open-consent-settings';

function readStoredDecision(key: string): StoredConsentValue {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return 'unset';
    const val = window.localStorage.getItem(key);
    if (val === 'granted' || val === 'denied') return val;
    return 'unset';
  } catch {
    return 'unset';
  }
}

function writeStoredDecision(key: string, decision: ConsentDecision): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, decision);
  } catch {
    // Ignore storage access errors (e.g. private browsing)
  }
}

export function getConsentPreferences(): ConsentPreferences {
  return {
    analytics: readStoredDecision(GA_CONSENT_STORAGE_KEY),
    marketing: readStoredDecision(META_CONSENT_STORAGE_KEY),
  };
}

export function isAnalyticsConsentGranted(): boolean {
  return getConsentPreferences().analytics === 'granted';
}

export function isMarketingConsentGranted(): boolean {
  return getConsentPreferences().marketing === 'granted';
}

export function needsConsentPrompt(): boolean {
  const prefs = getConsentPreferences();
  if (!SHATIR_CONFIG.metaPixelEnabled) {
    return prefs.analytics === 'unset';
  }
  return prefs.analytics === 'unset' || prefs.marketing === 'unset';
}

function syncGtagConsent(analytics: ConsentDecision, marketing: ConsentDecision): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  const effectiveMarketing: ConsentDecision = SHATIR_CONFIG.metaPixelEnabled ? marketing : 'denied';
  try {
    window.gtag('consent', 'update', {
      analytics_storage: analytics,
      ad_storage: effectiveMarketing,
      ad_user_data: effectiveMarketing,
      ad_personalization: effectiveMarketing,
    });
  } catch {
    // Ignore gtag failure
  }
}

export function saveConsentPreferences(decisions: {
  analytics: ConsentDecision;
  marketing: ConsentDecision;
}): ConsentPreferences {
  writeStoredDecision(GA_CONSENT_STORAGE_KEY, decisions.analytics);
  writeStoredDecision(META_CONSENT_STORAGE_KEY, decisions.marketing);
  syncGtagConsent(decisions.analytics, decisions.marketing);

  const next: ConsentPreferences = {
    analytics: decisions.analytics,
    marketing: decisions.marketing,
  };

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: next }));
  }

  return next;
}

export function withdrawMarketingConsent(): ConsentPreferences {
  const current = getConsentPreferences();
  return saveConsentPreferences({
    analytics: current.analytics === 'granted' ? 'granted' : 'denied',
    marketing: 'denied',
  });
}

export function withdrawAllConsent(): ConsentPreferences {
  return saveConsentPreferences({
    analytics: 'denied',
    marketing: 'denied',
  });
}

export function openConsentSettings(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_CONSENT_SETTINGS_EVENT));
}

export function subscribeConsentChanges(
  listener: (prefs: ConsentPreferences) => void
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<ConsentPreferences>;
    listener(customEvent.detail || getConsentPreferences());
  };
  window.addEventListener(CONSENT_CHANGED_EVENT, handler);
  return () => window.removeEventListener(CONSENT_CHANGED_EVENT, handler);
}

export function subscribeOpenConsentSettings(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => listener();
  window.addEventListener(OPEN_CONSENT_SETTINGS_EVENT, handler);
  return () => window.removeEventListener(OPEN_CONSENT_SETTINGS_EVENT, handler);
}
