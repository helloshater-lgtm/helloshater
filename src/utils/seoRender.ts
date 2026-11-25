/**
 * Static HTML for SEO landing pages (rendered at build time, readable by Google
 * without JavaScript). Pure functions: no DOM, no network.
 */
import { SeoPage, SEO_PAGES, SITE_URL, directoryLinkFor, relatedPages, seoPageUrl } from './seoCatalog';
import { DirectoryTutor, filterDirectory } from './tutorDirectory';

/** Absolute date (pages are static: «بكرة» would go stale). */
const absDate = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).format(d);
};

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const ar = (v: number | string) => String(v).replace(/[0-9]/g, (d) => AR_DIGITS[Number(d)]);

export const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** JSON for <script type="application/ld+json"> (no closing-tag injection). */
const ld = (o: unknown) => JSON.stringify(o).replace(/</g, '\\u003c');

export function tutorsForPage(page: SeoPage, tutors: DirectoryTutor[]): DirectoryTutor[] {
  return filterDirectory(
    { stages: [], subjects: [], tutors },
    { stage: page.stage, subject: page.subject }
  ).filter((t) => t.bookable && t.earliestTrialAt);
}

const GA = `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
try{if(localStorage.getItem('shatir_internal_traffic_v1')!=='1'&&localStorage.getItem('shatir_ga_consent')==='granted'){gtag('consent','update',{analytics_storage:'granted'});}}catch(e){}</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-CGL8XBRE0J"></script>
<script>gtag('js',new Date());gtag('config','G-CGL8XBRE0J',{cookie_flags:'SameSite=None;Secure'});</script>`;

const CSS = `*{box-sizing:border-box}body{margin:0;font-family:Cairo,Tajawal,system-ui,sans-serif;background:#F5F9FE;color:#1F2A44;line-height:1.7}
a{color:inherit}.w{max-width:1040px;margin:0 auto;padding:0 16px}
header.top{background:#fff;border-bottom:1px solid #E2E8F0}header.top .w{display:flex;align-items:center;justify-content:space-between;height:64px}
.brand{display:flex;align-items:center;gap:8px;font-weight:800;color:#0D4E8B;text-decoration:none;font-size:18px}
.brand i{width:36px;height:36px;border-radius:50%;background:#0D4E8B;border:2px solid #FFC629;color:#fff;font-style:normal;font-size:11px;display:flex;align-items:center;justify-content:center}
.navcta{background:#FFC629;color:#1F2A44;text-decoration:none;font-weight:800;font-size:14px;padding:9px 14px;border-radius:12px}
nav.crumb{font-size:12px;color:#64748B;padding-top:12px}nav.crumb a{text-decoration:none}
.hero{padding:10px 0 18px}.pill{display:inline-block;background:#fff;border:1px solid #CBEAD9;color:#0B5D38;font-weight:800;font-size:13px;border-radius:99px;padding:5px 12px}
h1{font-size:clamp(24px,5vw,40px);font-weight:900;line-height:1.3;margin:10px 0 8px}h1 span{color:#0D4E8B}
.lead{font-size:15px;color:#475569;margin:0 0 12px;max-width:720px}
.ok{list-style:none;padding:0;margin:0 0 14px;display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13px;font-weight:700;color:#0B5D38}.ok li:before{content:'✓ '}
.cta{display:inline-block;background:#0D4E8B;color:#fff;text-decoration:none;font-weight:800;padding:12px 20px;border-radius:14px}
h2{font-size:20px;font-weight:800;margin:22px 0 12px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.card{background:#fff;border:1px solid #E2E8F0;border-radius:18px;padding:14px;display:flex;flex-direction:column;gap:8px}
.row{display:flex;gap:12px;align-items:flex-start}.ph{width:68px;height:68px;border-radius:14px;object-fit:cover;object-position:top;background:#EAF2FC;flex:none}
.n{font-weight:800;font-size:16px;margin:0}.m{font-size:13px;color:#64748B;margin:0}.hl{font-size:13px;font-weight:700;margin:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.e{font-size:12.5px;color:#065f46;font-weight:700;margin:0}.book{display:block;text-align:center;background:#FFC629;color:#1F2A44;text-decoration:none;font-weight:800;padding:11px;border-radius:12px}
.empty{background:#fff;border:1px solid #E2E8F0;border-radius:18px;padding:18px;text-align:center}
.why{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;padding:0;list-style:none}.why li{background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:12px;font-weight:700;font-size:14px}
details{background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:12px 14px;margin-bottom:8px}summary{font-weight:800;cursor:pointer}details p{margin:8px 0 0;color:#475569}
.links{display:flex;flex-wrap:wrap;gap:8px}.links a{background:#fff;border:1px solid #E2E8F0;border-radius:99px;padding:7px 13px;font-size:13px;font-weight:700;text-decoration:none}
footer{margin-top:28px;background:#fff;border-top:1px solid #E2E8F0;padding:18px 0;font-size:13px;color:#64748B}`;

function tutorCard(t: DirectoryTutor, now: Date): string {
  const price = t.priceMin ? `${ar(t.priceMin)} ${esc(t.currency || 'ج.م')} / حصة ${ar(t.sessionMinutes || 50)} دقيقة` : '';
  const rating = t.rating && t.reviewsCount > 0 ? `⭐ ${ar(Number(t.rating).toFixed(1))} (${ar(t.reviewsCount)} تقييم)` : 'جديد على شاطر';
  void now;
  const earliest = absDate(t.earliestTrialAt);
  const img = t.avatarUrl
    ? `<img class="ph" src="${esc(t.avatarUrl)}" alt="${esc(`${t.honorific} ${t.name}`)}" loading="lazy" width="68" height="68">`
    : `<div class="ph" role="img" aria-label="${esc(t.name)}"></div>`;
  return `<article class="card"><div class="row">${img}<div>
<h3 class="n"><a href="/#tutor/${encodeURIComponent(t.id)}" style="text-decoration:none">${esc(`${t.honorific} ${t.name}`)}</a>${t.verified ? ' ✔︎' : ''}</h3>
<p class="m">${rating}${t.yearsOfExperience ? ` · خبرة ${ar(t.yearsOfExperience)} سنين` : ''}</p>
${price ? `<p class="m"><b style="color:#1F2A44">${price}</b></p>` : ''}</div></div>
${t.headline ? `<p class="hl">${esc(t.headline)}</p>` : ''}
${earliest ? `<p class="e">📅 أقرب تجربة: ${esc(earliest)}</p>` : ''}
<a class="book" href="/#book/${encodeURIComponent(t.id)}">🎁 احجز تجربة مجانية</a></article>`;
}

export function renderSeoPage(page: SeoPage, allTutors: DirectoryTutor[], now: Date = new Date()): string {
  const url = seoPageUrl(page);
  const tutors = tutorsForPage(page, allTutors).slice(0, 12);
  const related = relatedPages(page);
  const dirLink = directoryLinkFor(page);
  const prices = tutors.map((t) => t.priceMin).filter((x): x is number => typeof x === 'number' && x > 0);

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'شاطر كلاسيز', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: page.name, item: url },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: page.faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: page.h1,
      serviceType: 'دروس خصوصية أونلاين',
      provider: { '@type': 'Organization', name: 'شاطر كلاسيز', url: SITE_URL },
      areaServed: 'EG',
      ...(prices.length
        ? { offers: { '@type': 'AggregateOffer', priceCurrency: 'EGP', lowPrice: Math.min(...prices), highPrice: Math.max(...prices), offerCount: prices.length } }
        : {}),
    },
  ];

  return `<!doctype html>
<html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website"><meta property="og:locale" content="ar_EG"><meta property="og:site_name" content="شاطر كلاسيز">
<meta property="og:title" content="${esc(page.title)}"><meta property="og:description" content="${esc(page.description)}"><meta property="og:url" content="${url}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800;900&display=swap" rel="stylesheet">
<style>${CSS}</style>
${jsonLd.map((o) => `<script type="application/ld+json">${ld(o)}</script>`).join('\n')}
${GA}
</head><body>
<header class="top"><div class="w"><a class="brand" href="/"><i>شاطر</i>شاطر كلاسيز</a><a class="navcta" href="${dirLink}">شوف كل المعلمين</a></div></header>
<main class="w">
<nav class="crumb" aria-label="مسار الصفحة"><a href="/">الرئيسية</a> › <span>${esc(page.name)}</span></nav>
<section class="hero">
<span class="pill">🎁 أول حصة تجريبية مجانًا · ٢٠ دقيقة أونلاين</span>
<h1>${esc(page.h1)}</h1>
<p class="lead">${esc(page.intro)}</p>
<ul class="ok"><li>من غير دفع</li><li>من غير تسجيل</li><li>لو ما ناسبش نغيّرلك مجانًا</li></ul>
<a class="cta" href="${dirLink}">اختار المعلم واحجز التجربة</a>
</section>
<section aria-labelledby="t"><h2 id="t">${tutors.length ? `${ar(tutors.length)} ${tutors.length <= 10 ? 'معلمين متاحين' : 'معلم متاح'} للتجربة` : 'المعلمين'}</h2>
${tutors.length
    ? `<div class="grid">${tutors.map((t) => tutorCard(t, now)).join('')}</div>`
    : `<div class="empty"><p>مواعيد المعلمين في ${esc(page.name)} بتتفتح قريب.</p><a class="cta" href="${dirLink}">شوف كل المعلمين المتاحين</a></div>`}
</section>
<section aria-labelledby="w"><h2 id="w">ليه شاطر كلاسيز؟</h2><ul class="why">${page.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></section>
<section aria-labelledby="f"><h2 id="f">أسئلة أولياء الأمور</h2>
${page.faqs.map((f, i) => `<details${i === 0 ? ' open' : ''}><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n')}
</section>
${related.length ? `<section aria-labelledby="r"><h2 id="r">مواد ومراحل تانية</h2><div class="links">${related.map((r) => `<a href="/tutors/${r.slug}">${esc(r.name)}</a>`).join('')}</div></section>` : ''}
</main>
<footer><div class="w">© شاطر كلاسيز · <a href="/">الرئيسية</a> · <a href="/#privacy">الخصوصية</a> · <a href="/#terms">الشروط</a></div></footer>
</body></html>
`;
}

export function renderSitemap(pages: SeoPage[] = SEO_PAGES, lastmod: string = new Date().toISOString().slice(0, 10)): string {
  const urls = [
    `  <url><loc>${SITE_URL}/</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    ...pages.map((p) => `  <url><loc>${seoPageUrl(p)}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}
