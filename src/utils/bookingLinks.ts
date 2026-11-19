/**
 * Shareable links that open the trial booking page directly (#book/<tutorId>),
 * for ads, WhatsApp messages and the tutor's own sharing.
 */
export const PUBLIC_SITE_URL = 'https://www.shatirclasses.com';

export type BookingLinkSource = 'whatsapp' | 'ads' | 'tutor_share' | 'admin';

const SAFE_ID = /^[a-zA-Z0-9_-]{1,120}$/;

export function buildTrialBookingUrl(
  tutorId: string,
  options: { source?: BookingLinkSource; campaign?: string; baseUrl?: string } = {}
): string {
  if (!SAFE_ID.test(String(tutorId || ''))) return '';
  const base = (options.baseUrl || PUBLIC_SITE_URL).replace(/\/+$/, '');
  const params = new URLSearchParams();
  if (options.source) {
    params.set('utm_source', options.source);
    params.set('utm_medium', options.source === 'ads' ? 'paid' : 'share');
    params.set('utm_campaign', options.campaign || 'trial_booking');
  }
  const query = params.toString();
  return `${base}/${query ? `?${query}` : ''}#book/${tutorId}`;
}

/** Ready-to-send WhatsApp share (wa.me without a number = the user picks the chat). */
export function buildTrialBookingWhatsAppShareUrl(
  tutorId: string,
  tutorDisplayName: string,
  source: BookingLinkSource = 'whatsapp'
): string {
  const url = buildTrialBookingUrl(tutorId, { source });
  if (!url) return '';
  const text = `احجز تجربة مجانية ٢٠ دقيقة مع ${tutorDisplayName} على شاطر كلاسيز 👇\n${url}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
