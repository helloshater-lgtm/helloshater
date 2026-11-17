import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SHATIR_CONFIG } from '../src/config/shatirConfig';
import { Tutor } from '../src/types';
import {
  META_PIXEL_ID,
  MetaPixelService,
  createMetaPixelController,
  isExcludedMetaRoute,
  isTutorEligibleForMetaTracking,
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
  trackParentLeadSubmitted,
  trackParentLeadSubmitFailed,
} from '../src/services/analytics';

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

function makeTutor(overrides: Partial<Tutor> = {}): Tutor {
  return {
    id: 'tutor-school-1',
    name: 'أ. مريم عادل',
    honorific: 'أ.',
    headline: 'معلمة رياضيات للمرحلة الابتدائية',
    avatarUrl: 'https://example.com/avatar.jpg',
    verifiedCredentials: true,
    yearsOfExperience: 5,
    experienceBadgeText: 'خبرة ٥ سنوات',
    curriculumTags: ['المنهج المصري'],
    hourlyRateMin: 200,
    hourlyRateMax: 200,
    currency: 'EGP',
    sessionDurationMinutes: 50,
    trialDurationMinutes: 20,
    rating: null,
    reviewsCount: 0,
    totalStudentsTaught: 10,
    isPublished: true,
    helpChildQuote: 'شرح مبسط وتدريبات عملية',
    helpChildSummary: 'متابعة مستمرة لبناء الثقة في الرياضيات',
    methodologyPillars: [],
    subjectsTaughtSummary: [
      {
        title: 'الرياضيات',
        gradesRange: 'الابتدائي',
        curriculumNote: 'المنهج المصري',
        icon: 'math',
      },
    ],
    whatHappensInTrial: [],
    qualifications: [],
    offerings: [
      {
        track: 'school',
        stageId: 'elementary',
        gradeId: 'g4',
        subjectId: 'math',
        curriculumType: 'national_arabic',
      },
    ],
    ...overrides,
  };
}

const listeners = new Map<string, Array<(evt: any) => void>>();
const gtagCalls: any[][] = [];
const injectedScripts: any[] = [];
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
  head: {
    appendChild: (node: any) => {
      injectedScripts.push(node);
    },
  },
  getElementsByTagName: () => [],
  querySelector: () => null,
  createElement: (tag: string) => ({
    tag,
    async: false,
    src: '',
    attrs: {} as Record<string, string>,
    setAttribute(k: string, v: string) {
      this.attrs[k] = v;
    },
  }),
};

// 1. Verify Central Config Kill-Switch & index.html safety
{
  assert.equal(SHATIR_CONFIG.metaPixelEnabled, false, 'metaPixelEnabled must stay false until approved');
  assert.equal(SHATIR_CONFIG.metaPixelId, '1515074777348342');
  assert.equal(META_PIXEL_ID, '1515074777348342');
  assert.equal(SHATIR_CONFIG.gaMeasurementId, 'G-CGL8XBRE0J');

  const indexHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
  assert.equal(indexHtml.includes('connect.facebook.net'), false, 'index.html must not load fbevents.js');
  assert.equal(indexHtml.includes('facebook.com/tr'), false, 'index.html must not contain a noscript tracking pixel');
  assert.equal(indexHtml.includes('shatir_meta_consent'), false, 'index.html must not grant ad_storage while Meta is disabled');
  assert.equal(indexHtml.includes('G-CGL8XBRE0J'), true, 'Google Analytics must remain intact');
}

// 2. Verify Production Kill-Switch (metaPixelEnabled: false) EVEN WHEN SAVED MARKETING CONSENT EXISTS
{
  localStorageMock.clear();
  sessionStorageMock.clear();
  gtagCalls.length = 0;
  injectedScripts.length = 0;

  // Simulate user who previously saved Meta marketing consent='granted'
  localStorageMock.setItem(GA_CONSENT_STORAGE_KEY, 'granted');
  localStorageMock.setItem(META_CONSENT_STORAGE_KEY, 'granted');

  // needsConsentPrompt does not prompt for disabled Meta Pixel when GA is already answered
  assert.equal(needsConsentPrompt(), false);

  // fbclid must NOT be captured or returned while metaPixelEnabled is false (even with saved marketing='granted')
  captureInitialAttribution();
  const attr = getSavedAttributionForPayload();
  assert.equal(attr.gclid, 'test_gclid_123', 'GA4 attribution still works');
  assert.equal(attr.fbclid, null, 'fbclid must NOT be collected or sent when metaPixelEnabled=false');

  // Calling real MetaPixelService methods with spy window.fbq produces ZERO calls and ZERO SDK loads
  const unexpectedFbqCalls: any[][] = [];
  (globalThis as any).window.fbq = (...args: any[]) => {
    unexpectedFbqCalls.push(args);
  };

  const schoolTutor = makeTutor();
  MetaPixelService.syncConsentState(true);
  assert.equal(MetaPixelService.isEnabled(), false);
  assert.equal(MetaPixelService.trackPageView({ path: '/', view: 'home' }), false);
  assert.equal(
    MetaPixelService.trackViewContent({
      tutor: schoolTutor,
      tutorId: schoolTutor.id,
      isPreview: false,
      view: 'tutor-profile',
    }),
    false
  );
  assert.equal(
    MetaPixelService.trackLead({
      referenceCode: 'SH-DISABLED-1',
      track: 'school',
      requestType: 'trial',
      tutor: schoolTutor,
    }),
    false
  );

  // Also test trackParentLeadSubmitted: GA4 still records the event cleanly while Meta sends ZERO requests
  const gaCountBefore = gtagCalls.length;
  trackParentLeadSubmitted({
    track: 'school',
    request_type: 'trial',
    referenceCode: 'SH-DISABLED-GA-OK',
    tutor: schoolTutor,
  });
  assert.equal(gtagCalls.length, gaCountBefore + 1, 'GA4 tracking continues working normally');
  assert.equal(injectedScripts.length, 0, 'Zero Meta SDK script tags may be injected');
  assert.equal(unexpectedFbqCalls.length, 0, 'Zero Meta fbq calls may occur when metaPixelEnabled=false');

  // Consent storage & withdrawal keep working cleanly while ads consent remains denied in gtag
  saveConsentPreferences({ analytics: 'granted', marketing: 'granted' });
  const adUpdateCall = gtagCalls[gtagCalls.length - 1];
  assert.equal(adUpdateCall[0], 'consent');
  assert.equal(adUpdateCall[1], 'update');
  assert.equal(adUpdateCall[2].analytics_storage, 'granted');
  assert.equal(adUpdateCall[2].ad_storage, 'denied');
  assert.equal(adUpdateCall[2].ad_user_data, 'denied');
  assert.equal(adUpdateCall[2].ad_personalization, 'denied');

  const withdrawn = withdrawMarketingConsent();
  assert.equal(withdrawn.marketing, 'denied');
  assert.deepEqual(getConsentPreferences(), { analytics: 'granted', marketing: 'denied' });
  delete (globalThis as any).window.fbq;
}

// 3. Offline Policy Isolation Tests (mock isPixelEnabled: () => true, ZERO network requests)
{
  let marketingConsent = true;
  let currentHash = '';
  let currentSearch = '';
  let initCount = 0;
  const fbqCalls: any[][] = [];

  const controller = createMetaPixelController(
    {
      isPixelEnabled: () => true,
      isMarketingConsentGranted: () => marketingConsent,
      getCurrentHash: () => currentHash,
      getCurrentSearch: () => currentSearch,
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

  const pureSchoolTutor = makeTutor({ id: 'tutor-pure-school' });
  const pureQuranTutor = makeTutor({
    id: 'tutor-pure-quran',
    headline: 'معلم قرآن كريم وتجويد',
    helpChildQuote: 'تحفيظ بأسلوب ميسر',
    helpChildSummary: 'تعليم التلاوة والتجويد للأطفال',
    curriculumTags: ['تحفيظ القرآن'],
    subjectsTaughtSummary: [{ title: 'القرآن الكريم', gradesRange: '٦-٩ سنوات', curriculumNote: 'تجويد', icon: 'book' }],
    offerings: [{ track: 'quran', ageGroupId: '6-9', levelId: 'hifz' }],
  });
  const mixedTutor = makeTutor({
    id: 'tutor-mixed',
    headline: 'معلمة تأسيس لغوي وقرآن',
    offerings: [
      {
        track: 'school',
        stageId: 'elementary',
        gradeId: 'g1',
        subjectId: 'arabic',
        curriculumType: 'national_arabic',
      },
      {
        track: 'quran',
        ageGroupId: '6-9',
        levelId: 'noor_bayan',
      },
    ],
  });
  const leakySchoolMetadataTutor = makeTutor({
    id: 'tutor-leaky-text',
    headline: 'معلمة لغة عربية وتأسيس نور البيان وتجويد',
    offerings: [
      {
        track: 'school',
        stageId: 'elementary',
        gradeId: 'g1',
        subjectId: 'arabic',
        curriculumType: 'national_arabic',
      },
    ],
  });
  const emptyOfferingsTutor = makeTutor({
    id: 'tutor-empty',
    offerings: [],
  });
  const unpublishedSchoolTutor = makeTutor({
    id: 'tutor-unpublished',
    isPublished: false,
  });

  // Eligibility helper assertions
  assert.equal(isTutorEligibleForMetaTracking(pureSchoolTutor), true);
  assert.equal(isTutorEligibleForMetaTracking(pureQuranTutor), false);
  assert.equal(isTutorEligibleForMetaTracking(mixedTutor), false);
  assert.equal(isTutorEligibleForMetaTracking(leakySchoolMetadataTutor), false);
  assert.equal(isTutorEligibleForMetaTracking(emptyOfferingsTutor), false);
  assert.equal(isTutorEligibleForMetaTracking(unpublishedSchoolTutor), false);
  assert.equal(isTutorEligibleForMetaTracking(null), false);

  // PageView isolation checks
  assert.equal(
    controller.trackPageView({ path: '/', view: 'home', criteria: { track: 'quran', ageGroupId: '6-9' } }),
    false,
    'Home PageView must be blocked under Quran search criteria'
  );
  assert.equal(
    controller.trackPageView({ path: '/', view: 'home', criteria: { track: 'all' } }),
    false,
    'Home PageView must be blocked under ambiguous all-tracks criteria'
  );
  assert.equal(
    controller.trackPageView({ path: '/?track=quran&levelId=tajweed', view: 'home' }),
    false,
    'Sensitive URL paths/queries must block PageView'
  );
  currentSearch = '?ageGroupId=6-9';
  assert.equal(
    controller.trackPageView({ path: '/', view: 'home' }),
    false,
    'Sensitive query params must block PageView'
  );
  currentSearch = '';

  // /#tutor/<id> MUST NOT fire PageView while tutor is unloaded, Quran, or mixed
  assert.equal(
    controller.trackPageView({ path: '/#tutor/tutor-pure-quran', view: 'tutor-profile' }),
    false,
    'Tutor profile PageView must wait for loaded school tutor (never leak /#tutor/<id> URL)'
  );
  assert.equal(
    controller.trackPageView({
      path: '/#tutor/tutor-pure-quran',
      view: 'tutor-profile',
      tutor: pureQuranTutor,
    }),
    false,
    'Quran tutor profile PageView must be blocked'
  );
  assert.equal(
    controller.trackPageView({
      path: '/#tutor/tutor-mixed',
      view: 'tutor-profile',
      tutor: mixedTutor,
    }),
    false,
    'Mixed school+quran tutor profile PageView must be blocked'
  );

  // Pure school home & tutor profile PageView succeed cleanly and dedupe
  assert.equal(
    controller.trackPageView({ path: '/', view: 'home', criteria: { track: 'school', stageId: 'elementary' } }),
    true
  );
  assert.equal(
    controller.trackPageView({ path: '/', view: 'home', criteria: { track: 'school', stageId: 'elementary' } }),
    false
  );
  assert.equal(
    controller.trackPageView({
      path: '/#tutor/tutor-pure-school',
      view: 'tutor-profile',
      tutor: pureSchoolTutor,
    }),
    true
  );

  // ViewContent isolation checks
  assert.equal(
    controller.trackViewContent({ tutor: pureQuranTutor, view: 'tutor-profile', isPreview: false }),
    false
  );
  assert.equal(
    controller.trackViewContent({ tutor: mixedTutor, view: 'tutor-profile', isPreview: false }),
    false
  );
  assert.equal(
    controller.trackViewContent({ tutor: leakySchoolMetadataTutor, view: 'tutor-profile', isPreview: false }),
    false
  );
  assert.equal(
    controller.trackViewContent({ tutor: emptyOfferingsTutor, view: 'tutor-profile', isPreview: false }),
    false
  );
  assert.equal(
    controller.trackViewContent({ tutor: unpublishedSchoolTutor, view: 'tutor-profile', isPreview: false }),
    false
  );
  assert.equal(
    controller.trackViewContent({ tutor: pureSchoolTutor, view: 'tutor-profile', isPreview: true }),
    false
  );
  assert.equal(
    controller.trackViewContent({
      tutor: pureSchoolTutor,
      view: 'tutor-profile',
      isPreview: false,
      criteria: { track: 'quran' },
    }),
    false
  );
  assert.equal(
    controller.trackViewContent({ tutor: pureSchoolTutor, view: 'tutor-profile', isPreview: false }),
    true
  );
  assert.equal(
    controller.trackViewContent({ tutor: pureSchoolTutor, view: 'tutor-profile', isPreview: false }),
    false,
    'ViewContent dedupes per tutor ID'
  );

  // Lead isolation checks
  assert.equal(
    controller.trackLead({ referenceCode: 'SH-QURAN-1', track: 'quran', requestType: 'trial', tutor: pureQuranTutor }),
    false,
    'Quran Lead must be blocked'
  );
  assert.equal(
    controller.trackLead({ referenceCode: 'SH-NULL-1', track: null, requestType: 'recommendation' }),
    false,
    'Unknown-context (track: null) recommendation Lead must NEVER fall back to general'
  );
  assert.equal(
    controller.trackLead({ referenceCode: 'SH-MIXED-1', track: 'school', requestType: 'trial', tutor: mixedTutor }),
    false,
    'Mixed-specialization tutor Lead must be blocked even if request claims school track'
  );
  assert.equal(
    controller.trackLead({
      referenceCode: 'SH-QID-1',
      track: 'school',
      requestType: 'private',
      tutor: pureSchoolTutor,
      quranAgeGroupId: '6-9',
    }),
    false,
    'Lead carrying quranAgeGroupId must be blocked'
  );
  assert.equal(
    controller.trackLead({ referenceCode: '', track: 'school', requestType: 'trial', tutor: pureSchoolTutor }),
    false
  );
  assert.equal(
    controller.trackLead({ referenceCode: 'SH-SCHOOL-1', track: 'school', requestType: 'trial', tutor: pureSchoolTutor }),
    true
  );
  assert.equal(
    controller.trackLead({ referenceCode: 'SH-SCHOOL-1', track: 'school', requestType: 'trial', tutor: pureSchoolTutor }),
    false,
    'Duplicate Lead for same referenceCode must be ignored'
  );

  const leadCalls = fbqCalls.filter((c) => c[0] === 'track' && c[1] === 'Lead');
  assert.equal(leadCalls.length, 1);
  assert.deepEqual(leadCalls[0][2], {
    content_category: 'school',
    request_type: 'trial',
  });
  assert.equal(
    fbqCalls.some((c) => JSON.stringify(c).includes('general')),
    false,
    'Payload must never substitute sensitive or unknown tracks with general'
  );

  // Excluded routes check
  for (const excludedView of ['admin', 'tutor-dashboard', 'join-as-tutor'] as const) {
    assert.equal(isExcludedMetaRoute(excludedView), true);
    assert.equal(controller.trackPageView({ path: `/#${excludedView}`, view: excludedView }), false);
    assert.equal(
      controller.trackViewContent({ tutor: pureSchoolTutor, view: excludedView }),
      false
    );
    assert.equal(
      controller.trackLead({
        referenceCode: `SH-EXC-${excludedView}`,
        track: 'school',
        requestType: 'trial',
        tutor: pureSchoolTutor,
        view: excludedView,
      }),
      false
    );
  }

  // Withdraw consent -> calls fbq('consent', 'revoke') and blocks future events
  marketingConsent = false;
  controller.syncConsentState(false);
  assert.equal(
    fbqCalls.some((c) => c[0] === 'consent' && c[1] === 'revoke'),
    true
  );
  assert.equal(controller.trackPageView({ path: '/', view: 'home' }), false);
  assert.equal(initCount, 1);
}

// 4. Verify WhatsApp Clicks, Form Opens, and Failed Submits NEVER trigger Meta Lead/Purchase
{
  const blockedFbqCalls: any[][] = [];
  (globalThis as any).window.fbq = (...args: any[]) => {
    blockedFbqCalls.push(args);
  };
  saveConsentPreferences({ analytics: 'granted', marketing: 'granted' });

  trackParentLeadFormOpened({ track: 'school', request_type: 'trial' });
  trackParentLeadSubmitFailed({ track: 'school', request_type: 'trial' });
  trackWhatsAppClicked('hero_cta', { tutor_id: 'tutor-1', booking_type: 'trial' });

  assert.equal(blockedFbqCalls.length, 0);
  delete (globalThis as any).window.fbq;
}

console.log('All Meta Pixel kill-switch & sensitive-category isolation tests passed (0 live Meta requests).');
