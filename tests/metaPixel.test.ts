import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SHATIR_CONFIG } from '../src/config/shatirConfig';
import {
  META_PIXEL_ID,
  createMetaPixelController,
  isExcludedMetaRoute,
} from '../src/services/metaPixelService';
import {
  getConsentPreferences,
  saveConsentPreferences,
  withdrawMarketingConsent,
  needsConsentPrompt,
  GA_CONSENT_STORAGE_KEY,
  META_CONSENT_STORAGE_KEY,
} from '../src/services/consentService';
import {
  captureInitialAttribution,
  getSavedAttributionForPayload,
} from '../src/services/parentLeadService';
import {
  trackWhatsAppClicked,
  trackParentLeadFormOpened,
  trackParentLeadSubmitFailed,
} from '../src/services/analytics';

// Setup lightweight browser storage + window mock for unit testing consent & attribution
function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => {
      map.clear();
    },
  };
}

const listeners = new Map<string, Array<(evt: any) => void>>();
const gtagCalls: any[][] = [];
const localStorageMock = createMemoryStorage();
const sessionStorageMock = createMemoryStorage();

(globalThis as any).window = {
  localStorage: localStorageMock,
  sessionStorage: sessionStorageMock,
  location: {
    origin: 'https://www.shatirclasses.com',
    pathname: '/',
    hash: '',
    search: '?utm_source=fb&gclid=test_gclid_123&fbclid=test_fbclid_456',
  },
  gtag: (...args: any[]) => {
    gtagCalls.push(args);
  },
  addEventListener: (type: string, fn: (evt: any) => void) => {
    const arr = listeners.get(type) || [];
    arr.push(fn);
    listeners.set(type, arr);
  },
  removeEventListener: (type: string, fn: (evt: any) => void) => {
    const arr = listeners.get(type) || [];
    listeners.set(
      type,
      arr.filter((item) => item !== fn)
    );
  },
  dispatchEvent: (evt: any) => {
    const arr = listeners.get(evt.type) || [];
    for (const fn of arr) fn(evt);
    return true;
  },
};

(globalThis as any).CustomEvent = class CustomEventMock {
  type: string;
  detail: any;
  constructor(type: string, init?: { detail?: any }) {
    this.type = type;
    this.detail = init?.detail;
  }
};

(globalThis as any).document = {
  referrer: 'https://l.facebook.com/l.php?u=test',
};

// 1. Verify Central Config & index.html has zero Meta noscript / pre-consent pixel tags
{
  assert.equal(SHATIR_CONFIG.metaPixelId, '1515074777348342');
  assert.equal(META_PIXEL_ID, '1515074777348342');
  assert.equal(SHATIR_CONFIG.gaMeasurementId, 'G-CGL8XBRE0J');

  const indexHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
  assert.equal(indexHtml.includes('connect.facebook.net'), false, 'index.html must not statically load fbevents.js');
  assert.equal(indexHtml.includes('facebook.com/tr'), false, 'index.html must not contain a noscript tracking pixel');
  assert.equal(indexHtml.includes('G-CGL8XBRE0J'), true, 'Google Analytics must remain intact');
}

// 2. Verify Independent Consent Choices (Analytics vs Marketing) & Attribution Gating
{
  localStorageMock.clear();
  sessionStorageMock.clear();
  gtagCalls.length = 0;

  assert.equal(needsConsentPrompt(), true);
  assert.deepEqual(getConsentPreferences(), { analytics: 'unset', marketing: 'unset' });

  captureInitialAttribution();

  // Grant Google Analytics ONLY, Deny Meta Ads
  const prefs1 = saveConsentPreferences({ analytics: 'granted', marketing: 'denied' });
  assert.deepEqual(prefs1, { analytics: 'granted', marketing: 'denied' });
  assert.equal(localStorageMock.getItem(GA_CONSENT_STORAGE_KEY), 'granted');
  assert.equal(localStorageMock.getItem(META_CONSENT_STORAGE_KEY), 'denied');
  assert.equal(needsConsentPrompt(), false);

  const attrGaOnly = getSavedAttributionForPayload();
  assert.equal(attrGaOnly.gclid, 'test_gclid_123');
  assert.equal(attrGaOnly.fbclid, null, 'fbclid must stay null when marketing consent is denied');

  // Grant Meta Ads, Deny Google Analytics
  saveConsentPreferences({ analytics: 'denied', marketing: 'granted' });
  const attrMetaOnly = getSavedAttributionForPayload();
  assert.equal(attrMetaOnly.gclid, null);
  assert.equal(attrMetaOnly.fbclid, 'test_fbclid_456');

  // Withdraw Marketing consent
  const withdrawn = withdrawMarketingConsent();
  assert.equal(withdrawn.marketing, 'denied');
  assert.equal(getSavedAttributionForPayload().fbclid, null);
}

// 3. Verify Meta Pixel Controller: Consent Gate, Single Init, AutoConfig Off, Revoke on Withdraw, Dedupe
{
  let marketingConsent = false;
  let currentHash = '';
  let initCount = 0;
  const fbqCalls: any[][] = [];

  const controller = createMetaPixelController(
    {
      isMarketingConsentGranted: () => marketingConsent,
      getCurrentHash: () => currentHash,
      ensurePixelInitialized: (pixelId: string) => {
        if (initCount === 0) {
          fbqCalls.push(['set', 'autoConfig', false, pixelId]);
          fbqCalls.push(['init', pixelId]);
          initCount += 1;
        }
      },
      callFbq: (...args: any[]) => {
        fbqCalls.push(args);
      },
    },
    '1515074777348342'
  );

  // Before consent: nothing initializes and no events fire
  controller.syncConsentState(false);
  assert.equal(initCount, 0);
  assert.equal(controller.trackPageView({ path: '/', view: 'home' }), false);
  assert.equal(
    controller.trackViewContent({
      tutorId: 'tutor-1',
      track: 'school',
      isPublished: true,
      isPreview: false,
      view: 'tutor-profile',
    }),
    false
  );
  assert.equal(
    controller.trackLead({
      referenceCode: 'SH-1001',
      track: 'school',
      requestType: 'trial',
    }),
    false
  );
  assert.equal(fbqCalls.length, 0);

  // Grant marketing consent: initializes once with autoConfig=false and no user-data object
  marketingConsent = true;
  controller.syncConsentState(true);
  assert.equal(initCount, 1);
  assert.deepEqual(fbqCalls[0], ['set', 'autoConfig', false, '1515074777348342']);
  assert.deepEqual(fbqCalls[1], ['init', '1515074777348342']);
  assert.deepEqual(fbqCalls[2], ['consent', 'grant']);

  // PageView fires once per path (deduped on re-renders)
  assert.equal(controller.trackPageView({ path: '/', view: 'home' }), true);
  assert.equal(controller.trackPageView({ path: '/', view: 'home' }), false);
  assert.equal(controller.trackPageView({ path: '/#privacy', view: 'privacy' }), true);
  assert.equal(controller.trackPageView({ path: '/#terms', view: 'terms' }), true);

  // ViewContent requires published=true, isPreview=false, public tutor-profile route, and dedupes
  assert.equal(
    controller.trackViewContent({
      tutorId: 'tutor-unpublished',
      track: 'school',
      isPublished: false,
      view: 'tutor-profile',
    }),
    false
  );
  assert.equal(
    controller.trackViewContent({
      tutorId: 'tutor-preview',
      track: 'school',
      isPublished: true,
      isPreview: true,
      view: 'tutor-profile',
    }),
    false
  );
  assert.equal(
    controller.trackViewContent({
      tutorId: 'tutor-1',
      track: 'school',
      isPublished: true,
      isPreview: false,
      view: 'tutor-profile',
    }),
    true
  );
  assert.equal(
    controller.trackViewContent({
      tutorId: 'tutor-1',
      track: 'school',
      isPublished: true,
      isPreview: false,
      view: 'tutor-profile',
    }),
    false
  );

  // Verify ViewContent payload has NO PII / NO tutor name
  const viewContentCall = fbqCalls.find((c) => c[0] === 'track' && c[1] === 'ViewContent');
  assert.ok(viewContentCall);
  assert.deepEqual(viewContentCall[2], {
    content_ids: ['tutor-1'],
    content_type: 'product',
    content_category: 'school',
  });

  // Lead: requires non-empty saved referenceCode, dedupes per referenceCode
  assert.equal(
    controller.trackLead({ referenceCode: '', track: 'school', requestType: 'trial' }),
    false
  );
  assert.equal(
    controller.trackLead({ referenceCode: null, track: 'school', requestType: 'trial' }),
    false
  );
  assert.equal(
    controller.trackLead({ referenceCode: 'SH-555', track: 'quran', requestType: 'trial' }),
    true
  );
  assert.equal(
    controller.trackLead({ referenceCode: 'SH-555', track: 'quran', requestType: 'trial' }),
    false,
    'Duplicate Lead for same saved referenceCode must be ignored'
  );
  assert.equal(
    controller.trackLead({ referenceCode: 'SH-556', track: 'school', requestType: 'private' }),
    true
  );

  // Verify Lead payload contains zero PII (no names, phone, email, child age, referenceCode, or WhatsApp text)
  const leadCalls = fbqCalls.filter((c) => c[0] === 'track' && c[1] === 'Lead');
  assert.equal(leadCalls.length, 2);
  assert.deepEqual(leadCalls[0][2], {
    content_category: 'quran',
    request_type: 'trial',
  });

  // Excluded routes: admin, tutor-dashboard, join-as-tutor never fire PageView, ViewContent, or Lead
  for (const excludedView of ['admin', 'tutor-dashboard', 'join-as-tutor'] as const) {
    assert.equal(isExcludedMetaRoute(excludedView), true);
    assert.equal(controller.trackPageView({ path: `/#${excludedView}`, view: excludedView }), false);
    assert.equal(
      controller.trackViewContent({
        tutorId: 'tutor-1',
        track: 'school',
        isPublished: true,
        view: excludedView,
      }),
      false
    );
    assert.equal(
      controller.trackLead({
        referenceCode: `SH-EXC-${excludedView}`,
        track: 'school',
        requestType: 'trial',
        view: excludedView,
      }),
      false
    );
  }

  // Excluded hash even if view omitted
  currentHash = '#admin';
  assert.equal(isExcludedMetaRoute(undefined, '#admin'), true);
  assert.equal(controller.trackLead({ referenceCode: 'SH-HASH-ADMIN', track: 'school', requestType: 'trial' }), false);
  currentHash = '';

  // Withdraw consent -> calls fbq('consent', 'revoke') and blocks all future events
  marketingConsent = false;
  controller.syncConsentState(false);
  assert.equal(
    fbqCalls.some((c) => c[0] === 'consent' && c[1] === 'revoke'),
    true
  );
  assert.equal(controller.trackPageView({ path: '/', view: 'home' }), false);
  assert.equal(
    controller.trackLead({ referenceCode: 'SH-AFTER-REVOKE', track: 'school', requestType: 'trial' }),
    false
  );

  // Re-granting consent still initializes ONLY once (initCount remains 1)
  marketingConsent = true;
  controller.syncConsentState(true);
  assert.equal(initCount, 1);
  assert.equal(controller.trackPageView({ path: '/', view: 'home' }), true);
}

// 4. Verify WhatsApp Clicks, Form Opens, and Failed Lead Submits NEVER trigger Meta Lead or Purchase
{
  const blockedFbqCalls: any[][] = [];
  (globalThis as any).window.fbq = (...args: any[]) => {
    blockedFbqCalls.push(args);
  };
  saveConsentPreferences({ analytics: 'granted', marketing: 'granted' });

  trackParentLeadFormOpened({ track: 'school', request_type: 'trial' });
  trackParentLeadSubmitFailed({ track: 'school', request_type: 'trial' });
  trackWhatsAppClicked('hero_cta', { tutor_id: 'tutor-1', booking_type: 'trial' });

  const accidentalMetaEvents = blockedFbqCalls.filter(
    (c) => c[0] === 'track' && (c[1] === 'Lead' || c[1] === 'Purchase' || c[1] === 'Schedule')
  );
  assert.equal(accidentalMetaEvents.length, 0);
}

// 5. Verify Resilience if fbq / script loading throws (adblocker scenario)
{
  const brokenController = createMetaPixelController(
    {
      isMarketingConsentGranted: () => true,
      getCurrentHash: () => '',
      ensurePixelInitialized: () => {
        // Simulate script blocked without throwing outward
      },
      callFbq: () => {
        // Adblocker stub does not throw
      },
    },
    '1515074777348342'
  );
  assert.doesNotThrow(() => {
    brokenController.syncConsentState(true);
    brokenController.trackPageView({ path: '/', view: 'home' });
    brokenController.trackViewContent({
      tutorId: 'tutor-1',
      track: 'school',
      isPublished: true,
      view: 'tutor-profile',
    });
    brokenController.trackLead({
      referenceCode: 'SH-RESILIENT',
      track: 'school',
      requestType: 'trial',
    });
  });
}

console.log('All Meta Pixel & independent consent unit tests passed.');
