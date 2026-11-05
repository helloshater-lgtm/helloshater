import { supabase } from '../lib/supabase';

export type ParentLeadRequestType = 'trial' | 'private' | 'group' | 'recommendation';
export type ParentLeadTrack = 'school' | 'quran' | null;
export type ParentLeadStatus = 'new' | 'contacted' | 'trial' | 'subscribed' | 'lost';

export const PARENT_LEAD_COUNTRY_OPTIONS = [
  { code: '+20', name: 'مصر (+20)', clean: '20' },
  { code: '+966', name: 'المملكة العربية السعودية (+966)', clean: '966' },
  { code: '+971', name: 'الإمارات العربية المتحدة (+971)', clean: '971' },
  { code: '+965', name: 'الكويت (+965)', clean: '965' },
  { code: '+974', name: 'قطر (+974)', clean: '974' },
  { code: '+968', name: 'سلطنة عُمان (+968)', clean: '968' },
  { code: '+973', name: 'مملكة البحرين (+973)', clean: '973' },
  { code: '+962', name: 'الأردن (+962)', clean: '962' },
];

const SESSION_ATTR_INIT_KEY = 'shatir_visit_attribution_init';
const CONSENT_STORAGE_KEY = 'shatir_ga_consent';

const ATTR_KEYS = {
  utm_source: 'utm_source',
  utm_medium: 'utm_medium',
  utm_campaign: 'utm_campaign',
  utm_content: 'utm_content',
  utm_term: 'utm_term',
  gclid: 'gclid',
  fbclid: 'fbclid',
  landing_page: 'landing_page',
  referrer: 'referrer',
} as const;

export interface VisitAttributionData {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  gclid: string | null;
  fbclid: string | null;
  landingPage: string | null;
  referrer: string | null;
}

export interface SubmitParentLeadInput {
  guardianName: string;
  countryCode: string;
  phone: string;
  childAge: number | null;
  consent: boolean;
  requestType: ParentLeadRequestType;
  track: ParentLeadTrack;
  tutorId?: string | null;
  courseOptionId?: string | null;
  quranAgeGroupId?: string | null;
  quranLevelId?: string | null;
}

export type SubmitParentLeadOutcome =
  | {
      status: 'success';
      referenceCode: string;
    }
  | {
      status: 'validation_error';
      message: string;
    }
  | {
      status: 'network_or_server_error';
      message: string;
    };

function isAnalyticsConsentGranted(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(CONSENT_STORAGE_KEY) === 'granted';
  } catch {
    return false;
  }
}

function extractReferrerOrigin(rawReferrer: string): string | null {
  if (!rawReferrer || !rawReferrer.trim()) return null;
  try {
    const parsed = new URL(rawReferrer);
    return parsed.origin || null;
  } catch {
    return null;
  }
}

/**
 * 1) Capture visit attribution on first entry to the site in sessionStorage.
 * Never overwrites already saved values on internal navigation.
 * Wraps all sessionStorage usage in try/catch.
 */
export function captureInitialAttribution(): void {
  if (typeof window === 'undefined') return;

  try {
    const alreadyInitialized = window.sessionStorage.getItem(SESSION_ATTR_INIT_KEY);
    if (alreadyInitialized === '1') {
      return;
    }

    const searchParams = new URLSearchParams(window.location.search || '');
    const paramNames = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_content',
      'utm_term',
      'gclid',
      'fbclid',
    ] as const;

    for (const key of paramNames) {
      const val = searchParams.get(key)?.trim();
      if (val) {
        window.sessionStorage.setItem(ATTR_KEYS[key], val);
      }
    }

    // Save landing page without query string
    const cleanLandingPage = `${window.location.pathname || '/'}${window.location.hash || ''}`;
    window.sessionStorage.setItem(ATTR_KEYS.landing_page, cleanLandingPage);

    // Save referrer as origin only
    const referrerOrigin = extractReferrerOrigin(
      typeof document !== 'undefined' ? document.referrer || '' : ''
    );
    if (referrerOrigin) {
      window.sessionStorage.setItem(ATTR_KEYS.referrer, referrerOrigin);
    }

    window.sessionStorage.setItem(SESSION_ATTR_INIT_KEY, '1');
  } catch {
    // Ignore sessionStorage errors (e.g. private browsing restrictions)
  }
}

/**
 * Reads attribution from sessionStorage.
 * Sends gclid and fbclid ONLY if current Analytics consent is 'granted'.
 */
export function getSavedAttributionForPayload(): VisitAttributionData {
  const empty: VisitAttributionData = {
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmContent: null,
    utmTerm: null,
    gclid: null,
    fbclid: null,
    landingPage: null,
    referrer: null,
  };

  if (typeof window === 'undefined') return empty;

  try {
    // Ensure initialized if called before effect runs
    captureInitialAttribution();

    const consentGranted = isAnalyticsConsentGranted();

    return {
      utmSource: window.sessionStorage.getItem(ATTR_KEYS.utm_source) || null,
      utmMedium: window.sessionStorage.getItem(ATTR_KEYS.utm_medium) || null,
      utmCampaign: window.sessionStorage.getItem(ATTR_KEYS.utm_campaign) || null,
      utmContent: window.sessionStorage.getItem(ATTR_KEYS.utm_content) || null,
      utmTerm: window.sessionStorage.getItem(ATTR_KEYS.utm_term) || null,
      gclid: consentGranted ? window.sessionStorage.getItem(ATTR_KEYS.gclid) || null : null,
      fbclid: consentGranted ? window.sessionStorage.getItem(ATTR_KEYS.fbclid) || null : null,
      landingPage: window.sessionStorage.getItem(ATTR_KEYS.landing_page) || null,
      referrer: window.sessionStorage.getItem(ATTR_KEYS.referrer) || null,
    };
  } catch {
    return empty;
  }
}

function hasArabicText(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

function isNetworkOrServerFailure(err: any, message: string): boolean {
  const lower = (message || '').toLowerCase();
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('load failed') ||
    lower.includes('timeout') ||
    lower.includes('500') ||
    lower.includes('502') ||
    lower.includes('503') ||
    lower.includes('504')
  ) {
    return true;
  }
  const code = String(err?.code || '');
  if (code.startsWith('5') || code === 'PGRST301' || code === 'PGRST000') {
    return true;
  }
  return !hasArabicText(message);
}

export const ParentLeadService = {
  /**
   * Submits a parent lead via RPC submit_parent_lead.
   * Never logs personal data or referenceCode to console.
   */
  async submitParentLead(input: SubmitParentLeadInput): Promise<SubmitParentLeadOutcome> {
    const attribution = getSavedAttributionForPayload();

    const p_payload = {
      guardianName: input.guardianName.trim(),
      countryCode: input.countryCode.trim() || '+20',
      phone: input.phone.trim(),
      childAge: input.childAge !== null && !Number.isNaN(input.childAge) ? Number(input.childAge) : null,
      consent: Boolean(input.consent),
      requestType: input.requestType,
      track: input.track ?? null,
      tutorId: input.tutorId || null,
      courseOptionId: input.courseOptionId || null,
      quranAgeGroupId: input.quranAgeGroupId || null,
      quranLevelId: input.quranLevelId || null,
      utmSource: attribution.utmSource,
      utmMedium: attribution.utmMedium,
      utmCampaign: attribution.utmCampaign,
      utmContent: attribution.utmContent,
      utmTerm: attribution.utmTerm,
      gclid: attribution.gclid,
      fbclid: attribution.fbclid,
      landingPage: attribution.landingPage,
      referrer: attribution.referrer,
    };

    try {
      const { data, error } = await supabase.rpc('submit_parent_lead', {
        p_payload,
      });

      if (error) {
        const msg = (error.message || '').trim();
        if (hasArabicText(msg) && !isNetworkOrServerFailure(error, msg)) {
          return {
            status: 'validation_error',
            message: msg,
          };
        }
        return {
          status: 'network_or_server_error',
          message:
            'تعذر تسجيل الطلب تلقائيًا بسبب مشكلة في الاتصال، ولكن يمكنك المتابعة مباشرة عبر واتساب الآن.',
        };
      }

      if (data && typeof data === 'object' && 'success' in data && (data as any).success === false) {
        const errMsg = String(
          (data as any).message || (data as any).error || 'يرجى التأكد من صحة البيانات المدخلة.'
        ).trim();
        if (hasArabicText(errMsg)) {
          return {
            status: 'validation_error',
            message: errMsg,
          };
        }
        return {
          status: 'network_or_server_error',
          message:
            'تعذر تسجيل الطلب تلقائيًا بسبب مشكلة في الخادم، ولكن يمكنك المتابعة مباشرة عبر واتساب الآن.',
        };
      }

      const refCode =
        typeof data === 'string'
          ? data.trim()
          : String(
              (data as any)?.referenceCode ??
                (data as any)?.reference_code ??
                (data as any)?.ref_code ??
                ''
            ).trim();

      if (!refCode) {
        return {
          status: 'network_or_server_error',
          message:
            'يمكنك المتابعة مباشرة عبر واتساب الآن لإتمام طلبك مع فريق شاطر.',
        };
      }

      return {
        status: 'success',
        referenceCode: refCode,
      };
    } catch (err: any) {
      const msg = String(err?.message || '').trim();
      if (hasArabicText(msg) && !isNetworkOrServerFailure(err, msg)) {
        return {
          status: 'validation_error',
          message: msg,
        };
      }
      return {
        status: 'network_or_server_error',
        message:
          'تعذر تسجيل الطلب تلقائيًا بسبب مشكلة في الشبكة، ولكن يمكنك المتابعة مباشرة عبر واتساب الآن.',
      };
    }
  },

  /**
   * Marks that the parent clicked to open WhatsApp (fire-and-forget, without awaiting).
   */
  markWhatsAppOpened(referenceCode?: string | null): void {
    const trimmed = (referenceCode || '').trim();
    if (!trimmed) return;
    try {
      void supabase
        .rpc('mark_parent_lead_whatsapp_opened', {
          p_reference_code: trimmed,
        })
        .then(
          () => {},
          () => {}
        );
    } catch {
      // Ignore errors silently without logging PII
    }
  },
};

/**
 * Appends "رقم الطلب: <referenceCode>" to a WhatsApp wa.me URL message.
 */
export function appendReferenceCodeToWhatsAppUrl(
  baseUrl: string,
  referenceCode?: string | null
): { url: string; messageText: string } {
  const parts = baseUrl.split('?text=');
  const baseEndpoint = parts[0] || '';
  const rawMessage = decodeURIComponent(parts[1] || '');
  const trimmedRef = (referenceCode || '').trim();

  if (!trimmedRef) {
    return {
      url: baseUrl,
      messageText: rawMessage,
    };
  }

  const refLine = `رقم الطلب: ${trimmedRef}`;
  const updatedMessage = rawMessage.includes(refLine)
    ? rawMessage
    : `${rawMessage}\n\n${refLine}`;

  return {
    url: `${baseEndpoint}?text=${encodeURIComponent(updatedMessage)}`,
    messageText: updatedMessage,
  };
}
