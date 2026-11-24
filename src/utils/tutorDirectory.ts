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
}

export interface DirectoryData {
  stages: Array<{ id: string; name: string }>;
  subjects: Array<{ id: string; name: string }>;
  tutors: DirectoryTutor[];
}

export interface DirectoryFilters {
  stage: DirectoryStageId | null;
  subject: string | null;
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
  return { stage, subject };
}

/** New query string with the filters, keeping every other param (utm_*, gclid…). */
export function buildDirectorySearch(currentSearch: string, filters: DirectoryFilters): string {
  const p = new URLSearchParams(currentSearch || '');
  if (filters.stage) p.set('stage', filters.stage);
  else p.delete('stage');
  if (filters.subject && filters.stage !== 'quran') p.set('subject', filters.subject);
  else p.delete('subject');
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function tutorMatches(t: DirectoryTutor, f: DirectoryFilters): boolean {
  if (f.stage === 'quran') return t.quran;
  if (f.stage && !t.stageIds.includes(f.stage)) return false;
  if (f.subject && !t.subjectIds.includes(f.subject) && !t.subjectIds.includes(`${f.subject}_en`)) return false;
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
    })),
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
