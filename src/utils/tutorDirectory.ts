/**
 * Public tutor directory (home page + ad landing links).
 * Pure helpers: URL filters, filtering, ordering, labels and ad-link building.
 */

export type DirectoryStageId = 'elementary' | 'preparatory' | 'secondary' | 'quran';

export interface DirectoryTutor {
  id: string;
  name: string;
  honorific: string;
  headline: string | null;
  avatarUrl: string | null;
  rating: number | null;
  reviewsCount: number;
  yearsOfExperience: number | null;
  verified: boolean;
  priceMin: number | null;
  priceMax: number | null;
  currency: string | null;
  sessionMinutes: number | null;
  stageIds: string[];
  subjectIds: string[];
  quran: boolean;
  bookable: boolean;
  earliestTrialAt: string | null;
  trialSlotsCount: number;
  summary: string | null;
  country: string | null;
  completedSessions: number;
  studentsTaught: number | null;
  /** «dow-part» of open trial slots (Cairo), e.g. "6-e" = Saturday evening. */
  slotBuckets: string[];
}

export interface DirectoryStats {
  tutors: number;
  completedSessions: number;
  ratedTutors: number;
  avgRating: number | null;
  reviews: number;
}

export interface DirectoryData {
  stages: Array<{ id: string; name: string }>;
  subjects: Array<{ id: string; name: string }>;
  tutors: DirectoryTutor[];
  stats?: DirectoryStats | null;
}

export type DayPart = 'm' | 'a' | 'e';

export interface DirectoryFilters {
  stage: DirectoryStageId | null;
  subject: string | null;
  /** 0=Sunday … 6=Saturday */
  days?: number[];
  parts?: DayPart[];
  maxPrice?: number | null;
  verifiedOnly?: boolean;
}

export const DAY_LABELS: Array<{ id: number; label: string }> = [
  { id: 6, label: 'السبت' },
  { id: 0, label: 'الأحد' },
  { id: 1, label: 'الاثنين' },
  { id: 2, label: 'الثلاثاء' },
  { id: 3, label: 'الأربعاء' },
  { id: 4, label: 'الخميس' },
  { id: 5, label: 'الجمعة' },
];

export const PART_LABELS: Array<{ id: DayPart; label: string; hint: string }> = [
  { id: 'm', label: 'الصبح', hint: 'قبل ١٢ الظهر' },
  { id: 'a', label: 'بعد الضهر', hint: '١٢ – ٥' },
  { id: 'e', label: 'بالليل', hint: 'بعد ٥' },
];

/** Number of active "advanced" filters (shown on the filter button). */
export function advancedFilterCount(f: DirectoryFilters): number {
  return (f.days?.length ? 1 : 0) + (f.parts?.length ? 1 : 0) + (f.maxPrice ? 1 : 0) + (f.verifiedOnly ? 1 : 0);
}

const STAGE_ALIASES: Record<string, DirectoryStageId> = {
  elementary: 'elementary',
  primary: 'elementary',
  ebtdai: 'elementary',
  preparatory: 'preparatory',
  prep: 'preparatory',
  middle: 'preparatory',
  secondary: 'secondary',
  high: 'secondary',
  thanawi: 'secondary',
  quran: 'quran',
};

export const STAGE_CHIP_LABELS: Record<DirectoryStageId, string> = {
  elementary: 'ابتدائي',
  preparatory: 'إعدادي',
  secondary: 'ثانوي',
  quran: 'قرآن',
};

const SAFE_ID = /^[a-z0-9_]{2,40}$/;

/** Reads ?stage=…&subject=… (also accepts short aliases used in ads). */
export function parseDirectoryFilters(search: string): DirectoryFilters {
  const p = new URLSearchParams(search || '');
  const rawStage = String(p.get('stage') || '').trim().toLowerCase();
  const rawSubject = String(p.get('subject') || '').trim().toLowerCase();
  const stage = STAGE_ALIASES[rawStage] || null;
  const subject = stage !== 'quran' && SAFE_ID.test(rawSubject) ? rawSubject : null;
  const days = String(p.get('days') || '')
    .split(',')
    .filter((x) => x.trim() !== '')
    .map((x) => Number(x))
    .filter((x, i, a) => Number.isInteger(x) && x >= 0 && x <= 6 && a.indexOf(x) === i);
  const parts = String(p.get('time') || '')
    .split(',')
    .filter((x, i, a): x is DayPart => (x === 'm' || x === 'a' || x === 'e') && a.indexOf(x) === i);
  const max = Number(p.get('max'));
  const out: DirectoryFilters = { stage, subject };
  if (days.length) out.days = days;
  if (parts.length) out.parts = parts;
  if (Number.isFinite(max) && max > 0 && max < 100000) out.maxPrice = Math.round(max);
  if (p.get('verified') === '1') out.verifiedOnly = true;
  return out;
}

/** New query string with the filters, keeping every other param (utm_*, gclid…). */
export function buildDirectorySearch(currentSearch: string, filters: DirectoryFilters): string {
  const p = new URLSearchParams(currentSearch || '');
  if (filters.stage) p.set('stage', filters.stage);
  else p.delete('stage');
  if (filters.subject && filters.stage !== 'quran') p.set('subject', filters.subject);
  else p.delete('subject');
  if (filters.days?.length) p.set('days', filters.days.join(','));
  else p.delete('days');
  if (filters.parts?.length) p.set('time', filters.parts.join(','));
  else p.delete('time');
  if (filters.maxPrice) p.set('max', String(filters.maxPrice));
  else p.delete('max');
  if (filters.verifiedOnly) p.set('verified', '1');
  else p.delete('verified');
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function tutorMatches(t: DirectoryTutor, f: DirectoryFilters): boolean {
  if (f.stage === 'quran') return t.quran;
  if (f.stage && !t.stageIds.includes(f.stage)) return false;
  if (f.subject && !t.subjectIds.includes(f.subject) && !t.subjectIds.includes(`${f.subject}_en`)) return false;
  if (f.verifiedOnly && !t.verified) return false;
  if (f.maxPrice && (t.priceMin === null || t.priceMin > f.maxPrice)) return false;
  if (f.days?.length || f.parts?.length) {
    const ok = t.slotBuckets.some((b) => {
      const [d, part] = b.split('-');
      return (!f.days?.length || f.days.includes(Number(d))) && (!f.parts?.length || f.parts.includes(part as DayPart));
    });
    if (!ok) return false;
  }
  return true;
}

/** Bookable now first (earliest slot), then by rating; tutors without slots last. */
export function sortDirectoryTutors(list: DirectoryTutor[]): DirectoryTutor[] {
  return [...list].sort((a, b) => {
    const ah = a.bookable && a.earliestTrialAt ? 1 : 0;
    const bh = b.bookable && b.earliestTrialAt ? 1 : 0;
    if (ah !== bh) return bh - ah;
    if (ah && bh) return new Date(a.earliestTrialAt!).getTime() - new Date(b.earliestTrialAt!).getTime();
    return (b.rating || 0) - (a.rating || 0);
  });
}

export function filterDirectory(data: DirectoryData, f: DirectoryFilters): DirectoryTutor[] {
  return sortDirectoryTutors(data.tutors.filter((t) => tutorMatches(t, f)));
}

/** «الرياضيات (Math)» → «الرياضيات»; English variants merged into the Arabic chip. */
export function shortSubjectName(name: string): string {
  return name.replace(/\s*\(.*?\)\s*/g, '').replace(/^.*?—\s*/, '').trim();
}

/** Subject chips available for the chosen stage (only subjects that have tutors). */
export function subjectChipsFor(data: DirectoryData, stage: DirectoryStageId | null): Array<{ id: string; label: string; count: number }> {
  if (stage === 'quran') return [];
  const counts = new Map<string, number>();
  for (const t of data.tutors) {
    if (stage && !t.stageIds.includes(stage)) continue;
    const seen = new Set<string>();
    for (const sid of t.subjectIds) {
      const base = sid.replace(/_en$/, '');
      if (seen.has(base)) continue;
      seen.add(base);
      counts.set(base, (counts.get(base) || 0) + 1);
    }
  }
  return data.subjects
    .filter((s) => !s.id.endsWith('_en') && counts.has(s.id))
    .map((s) => ({ id: s.id, label: shortSubjectName(s.name), count: counts.get(s.id) || 0 }))
    .sort((a, b) => b.count - a.count);
}

export function stageChipsFor(data: DirectoryData): Array<{ id: DirectoryStageId; label: string; count: number }> {
  const ids: DirectoryStageId[] = ['elementary', 'preparatory', 'secondary', 'quran'];
  return ids
    .map((id) => ({
      id,
      label: STAGE_CHIP_LABELS[id],
      count: data.tutors.filter((t) => (id === 'quran' ? t.quran : t.stageIds.includes(id))).length,
    }))
    .filter((c) => c.count > 0);
}

const CAIRO = 'Africa/Cairo';

/** «النهارده ٦:٣٠ م» / «بكرة ١١ ص» / «الخميس ٢٧ نوفمبر». */
export function formatEarliestTrial(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const key = (x: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: CAIRO }).format(x);
  const time = new Intl.DateTimeFormat('ar-EG', { timeZone: CAIRO, hour: 'numeric', minute: '2-digit' }).format(d);
  if (key(d) === key(now)) return `النهارده ${time}`;
  if (key(d) === key(new Date(now.getTime() + 86400000))) return `بكرة ${time}`;
  const day = new Intl.DateTimeFormat('ar-EG', { timeZone: CAIRO, weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  return `${day} ${time}`;
}

export function normalizeDirectory(raw: any): DirectoryData {
  const arr = (v: any) => (Array.isArray(v) ? v : []);
  const num = (v: any) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
  return {
    stages: arr(raw?.stages).map((s) => ({ id: String(s.id), name: String(s.name ?? '') })),
    subjects: arr(raw?.subjects).map((s) => ({ id: String(s.id), name: String(s.name ?? '') })),
    tutors: arr(raw?.tutors).map((t) => ({
      id: String(t.id),
      name: String(t.name ?? ''),
      honorific: String(t.honorific ?? ''),
      headline: t.headline ? String(t.headline) : null,
      avatarUrl: t.avatarUrl ? String(t.avatarUrl) : null,
      rating: num(t.rating),
      reviewsCount: num(t.reviewsCount) || 0,
      yearsOfExperience: num(t.yearsOfExperience),
      verified: Boolean(t.verified),
      priceMin: num(t.priceMin),
      priceMax: num(t.priceMax),
      currency: t.currency ? String(t.currency) : null,
      sessionMinutes: num(t.sessionMinutes),
      stageIds: arr(t.stageIds).map(String),
      subjectIds: arr(t.subjectIds).map(String),
      quran: Boolean(t.quran),
      bookable: Boolean(t.bookable),
      earliestTrialAt: t.earliestTrialAt ? String(t.earliestTrialAt) : null,
      trialSlotsCount: num(t.trialSlotsCount) || 0,
      summary: t.summary ? String(t.summary) : null,
      country: t.country ? String(t.country) : null,
      completedSessions: num(t.completedSessions) || 0,
      studentsTaught: num(t.studentsTaught),
      slotBuckets: arr(t.slotBuckets).map(String),
    })),
    stats: raw?.stats
      ? {
          tutors: num(raw.stats.tutors) || 0,
          completedSessions: num(raw.stats.completedSessions) || 0,
          ratedTutors: num(raw.stats.ratedTutors) || 0,
          avgRating: num(raw.stats.avgRating),
          reviews: num(raw.stats.reviews) || 0,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// Ad landing links (admin tool)
// ---------------------------------------------------------------------------

export function buildAdLandingUrl(opts: {
  stage?: DirectoryStageId | null;
  subject?: string | null;
  source?: string;
  campaign?: string;
  content?: string;
  baseUrl?: string;
}): string {
  const base = (opts.baseUrl || 'https://www.shatirclasses.com').replace(/\/+$/, '');
  const p = new URLSearchParams();
  if (opts.stage) p.set('stage', opts.stage);
  if (opts.subject && opts.stage !== 'quran') p.set('subject', opts.subject);
  const clean = (v?: string) => String(v || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  p.set('utm_source', clean(opts.source) || 'facebook');
  p.set('utm_medium', 'paid');
  const subject = opts.stage === 'quran' ? null : opts.subject;
  const campaign = clean(opts.campaign) || [opts.stage, subject].filter(Boolean).join('_') || 'general';
  p.set('utm_campaign', campaign);
  if (clean(opts.content)) p.set('utm_content', clean(opts.content));
  return `${base}/?${p.toString()}`;
}

/** Price slider bounds from the tutors' real prices. */
export function priceBounds(data: DirectoryData): { min: number; max: number } | null {
  const prices = data.tutors.map((t) => t.priceMin).filter((x): x is number => typeof x === 'number' && x > 0);
  if (!prices.length) return null;
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export const COUNTRY_FLAGS: Record<string, { flag: string; name: string }> = {
  EG: { flag: '🇪🇬', name: 'مصر' },
  SA: { flag: '🇸🇦', name: 'السعودية' },
  AE: { flag: '🇦🇪', name: 'الإمارات' },
  KW: { flag: '🇰🇼', name: 'الكويت' },
  QA: { flag: '🇶🇦', name: 'قطر' },
  OM: { flag: '🇴🇲', name: 'عُمان' },
  BH: { flag: '🇧🇭', name: 'البحرين' },
  JO: { flag: '🇯🇴', name: 'الأردن' },
};

/** Show social-proof counters only once they are big enough to build trust. */
export const MIN_PUBLIC_SESSIONS = 10;

/** «Available soon» = an open trial slot in the next 48 hours. */
export function isAvailableSoon(t: DirectoryTutor, now: Date = new Date()): boolean {
  if (!t.bookable || !t.earliestTrialAt) return false;
  return new Date(t.earliestTrialAt).getTime() - now.getTime() < 48 * 3600e3;
}
