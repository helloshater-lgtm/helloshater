/**
 * SEO landing pages: one page per subject × stage («معلم رياضيات ابتدائي أونلاين»).
 * Pure data + helpers, used by scripts/generate-seo-pages.ts at build time and by the footer.
 */
import type { DirectoryStageId } from './tutorDirectory';

export interface SeoPage {
  slug: string; // /tutors/<slug>
  subject: string | null; // subject id in the directory (math, arabic, …) or null
  stage: DirectoryStageId | null;
  /** Short Arabic name used in headings and links, e.g. «رياضيات ابتدائي». */
  name: string;
  title: string; // <title> (≤ 60 chars where possible)
  h1: string;
  description: string; // meta description (≤ 160 chars)
  intro: string;
  points: string[];
  faqs: Array<{ q: string; a: string }>;
}

const STAGE_TEXT: Record<'elementary' | 'preparatory' | 'secondary', { short: string; long: string; grades: string }> = {
  elementary: { short: 'ابتدائي', long: 'المرحلة الابتدائية', grades: 'من الصف الأول للسادس الابتدائي' },
  preparatory: { short: 'إعدادي', long: 'المرحلة الإعدادية', grades: 'من الصف الأول للثالث الإعدادي' },
  secondary: { short: 'ثانوي', long: 'المرحلة الثانوية', grades: 'من الصف الأول للثالث الثانوي' },
};

const SUBJECTS: Record<string, { name: string; slug: string; stages: Array<'elementary' | 'preparatory' | 'secondary'>; focus: string }> = {
  math: { name: 'رياضيات', slug: 'math', stages: ['elementary', 'preparatory', 'secondary'], focus: 'الفهم وحل المسائل خطوة بخطوة' },
  arabic: { name: 'لغة عربية', slug: 'arabic', stages: ['elementary', 'preparatory', 'secondary'], focus: 'القراءة والكتابة والنحو والتعبير' },
  english: { name: 'لغة إنجليزية', slug: 'english', stages: ['elementary', 'preparatory', 'secondary'], focus: 'القراءة والقواعد والمحادثة' },
  science: { name: 'علوم', slug: 'science', stages: ['elementary', 'preparatory'], focus: 'فهم المفاهيم بالأمثلة والتجارب' },
  physics: { name: 'فيزياء', slug: 'physics', stages: ['secondary'], focus: 'القوانين وحل المسائل' },
  chemistry: { name: 'كيمياء', slug: 'chemistry', stages: ['secondary'], focus: 'المعادلات والفهم العملي' },
  biology: { name: 'أحياء', slug: 'biology', stages: ['secondary'], focus: 'الفهم والمراجعة قبل الامتحانات' },
};

/** «ل» + word: «المرحلة» → «للمرحلة». */
const li = (x: string) => (x.startsWith('ال') ? `لل${x.slice(2)}` : `ل${x}`);

const COMMON_POINTS = [
  'أول حصة تجريبية مجانًا (٢٠ دقيقة) من غير دفع ولا تسجيل',
  'معلمين مراجَعين: مقابلة وشهادات وصورة حقيقية',
  'تقرير لوليّ الأمر بعد كل حصة',
  'لو المعلم ما ناسبش طفلك نرشّحلك غيره مجانًا',
];

function subjectStagePage(subjectId: string, stage: 'elementary' | 'preparatory' | 'secondary'): SeoPage {
  const s = SUBJECTS[subjectId];
  const st = STAGE_TEXT[stage];
  const name = `${s.name} ${st.short}`;
  return {
    slug: `${s.slug}-${stage}`,
    subject: subjectId,
    stage,
    name,
    title: `مدرس ${name} أونلاين | أول حصة مجانًا – شاطر كلاسيز`,
    h1: `معلم ${s.name} ${li(st.long)} أونلاين`,
    description: `معلمين ${s.name} مراجَعين ${li(st.long)} (${st.grades}). اختار المعلم، شوف أقرب ميعاد واحجز حصة تجريبية مجانية ٢٠ دقيقة من غير تسجيل.`,
    intro: `بتدوّر على مدرس ${s.name} خصوصي لطفلك في ${st.long}؟ على شاطر كلاسيز تقدر تختار معلم ${s.name} مراجَع ${st.grades}، يركّز على ${s.focus}، وتبدأ بحصة تجريبية مجانية أونلاين من البيت.`,
    points: COMMON_POINTS,
    faqs: [
      { q: `كام سعر حصة ${name} أونلاين؟`, a: 'السعر بيختلف حسب المعلم، وبيظهر على صفحة كل معلم قبل الحجز. وأول حصة تجريبية (٢٠ دقيقة) مجانًا.' },
      { q: 'بتدرّسوا المنهج المصري ومنهج اللغات؟', a: `أيوه، عندنا معلمين ${s.name} للمنهج العربي، ومعلمين لمنهج اللغات حسب تخصص كل معلم.` },
      { q: 'الحصة بتبقى إزاي؟', a: 'الحصة أونلاين بالصوت والصورة، والرابط بيوصلك في «حجوزاتي» قبل الميعاد، وبعد الحصة بيوصلك تقرير من المعلم عن مستوى طفلك.' },
      { q: 'لازم أعمل حساب علشان أحجز؟', a: 'لأ. تختار الميعاد وتكتب اسمك ورقم الواتساب وبس.' },
    ],
  };
}

function stageHub(stage: 'elementary' | 'preparatory' | 'secondary'): SeoPage {
  const st = STAGE_TEXT[stage];
  return {
    slug: stage,
    subject: null,
    stage,
    name: `مدرسين ${st.short}`,
    title: `مدرس خصوصي ${st.short} أونلاين | حصة تجريبية مجانية – شاطر كلاسيز`,
    h1: `مدرسين خصوصي ${li(st.long)} أونلاين`,
    description: `معلمين مراجَعين لكل مواد ${st.long} (${st.grades}). احجز حصة تجريبية مجانية في دقيقة من غير تسجيل، وتابع مستوى طفلك بتقرير بعد كل حصة.`,
    intro: `كل مواد ${st.long} في مكان واحد: رياضيات وعربي وإنجليزي وعلوم وأكتر. اختار المادة والمعلم المناسب لطفلك، وابدأ بحصة تجريبية مجانية أونلاين.`,
    points: COMMON_POINTS,
    faqs: [
      { q: `إيه المواد المتاحة ${li(st.long)}؟`, a: 'المواد الأساسية للمنهج المصري ومنهج اللغات، والمتاح بيظهر حسب المعلمين اللي عندهم مواعيد.' },
      { q: 'أول حصة مجانية فعلًا؟', a: 'أيوه، أول حصة تجريبية ٢٠ دقيقة مجانية من غير أي بيانات دفع ولا التزام.' },
      { q: 'لو المعلم ما ناسبش طفلي؟', a: 'كلّمنا على واتساب ونرشّحلك معلم تاني مجانًا.' },
    ],
  };
}

const QURAN_PAGE: SeoPage = {
  slug: 'quran',
  subject: null,
  stage: 'quran',
  name: 'تحفيظ قرآن للأطفال',
  title: 'محفظ قرآن للأطفال أونلاين | حصة تجريبية مجانية – شاطر كلاسيز',
  h1: 'محفظ قرآن وتجويد للأطفال أونلاين',
  description: 'معلمين ومحفظين قرآن مراجَعين للأطفال: تحفيظ وتجويد وتأسيس نطق. احجز حصة تجريبية مجانية ٢٠ دقيقة من غير تسجيل.',
  intro: 'عايز طفلك يحفظ القرآن ويتعلم التجويد صح من البيت؟ اختار محفظ مراجَع على شاطر كلاسيز، شوف أقرب ميعاد، وابدأ بحصة تجريبية مجانية أونلاين.',
  points: COMMON_POINTS,
  faqs: [
    { q: 'من سن كام ينفع يبدأ الطفل؟', a: 'من ٤–٥ سنين بتأسيس النطق والحروف، وبعدها التحفيظ والتجويد حسب مستوى الطفل.' },
    { q: 'الحلقة فردية ولا جماعية؟', a: 'الحصة التجريبية فردية، وبعدها تقدر تختار حصص فردية أو مجموعات صغيرة لو متاحة مع المعلم.' },
    { q: 'أول حصة مجانية؟', a: 'أيوه، أول حصة تجريبية ٢٠ دقيقة مجانية من غير أي دفع.' },
  ],
};

export const SEO_PAGES: SeoPage[] = [
  QURAN_PAGE,
  ...(['elementary', 'preparatory', 'secondary'] as const).map(stageHub),
  ...Object.keys(SUBJECTS).flatMap((id) => SUBJECTS[id].stages.map((st) => subjectStagePage(id, st))),
];

export const SITE_URL = 'https://www.shatirclasses.com';
export const seoPageUrl = (p: SeoPage) => `${SITE_URL}/tutors/${p.slug}`;

/** SPA link that opens the live, filtered directory for this page. */
export function directoryLinkFor(p: SeoPage): string {
  const q = new URLSearchParams();
  if (p.stage) q.set('stage', p.stage);
  if (p.subject) q.set('subject', p.subject);
  const s = q.toString();
  return `/${s ? `?${s}` : ''}#tutors`;
}

/** Pages to link from a page (same subject other stages + same stage other subjects). */
export function relatedPages(p: SeoPage, max = 8): SeoPage[] {
  return SEO_PAGES.filter((x) => x.slug !== p.slug && ((p.subject && x.subject === p.subject) || (p.stage && x.stage === p.stage)))
    .slice(0, max);
}
