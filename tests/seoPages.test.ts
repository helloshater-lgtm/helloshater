import assert from 'node:assert/strict';
import { SEO_PAGES, directoryLinkFor, relatedPages } from '../src/utils/seoCatalog';
import { esc, renderSeoPage, renderSitemap, tutorsForPage } from '../src/utils/seoRender';
import { normalizeDirectory } from '../src/utils/tutorDirectory';

const slugs = SEO_PAGES.map((p) => p.slug);
assert.equal(new Set(slugs).size, slugs.length, 'unique slugs');
assert.ok(slugs.every((s) => /^[a-z-]+$/.test(s)));
for (const p of SEO_PAGES) {
  assert.ok(!/للال|الال/.test(p.h1 + p.description + p.intro), `arabic prefix ok: ${p.slug}`);
  assert.ok(p.description.length <= 170, `description length ${p.slug}`);
}
const math = SEO_PAGES.find((p) => p.slug === 'math-elementary')!;
assert.equal(math.h1, 'معلم رياضيات للمرحلة الابتدائية أونلاين');
assert.equal(directoryLinkFor(math), '/?stage=elementary&subject=math#tutors');
assert.ok(relatedPages(math).some((r) => r.slug === 'math-preparatory'));

const tutors = normalizeDirectory({
  tutors: [
    { id: 't1', name: 'سارة <b>', honorific: 'أ.', stageIds: ['elementary'], subjectIds: ['math'], bookable: true, earliestTrialAt: '2030-01-01T10:00:00Z', priceMin: 150, avatarUrl: 'https://x/a.jpg' },
    { id: 't2', name: 'محمد', honorific: 'أ.', stageIds: ['elementary'], subjectIds: ['math'], bookable: true, earliestTrialAt: null },
    { id: 't3', name: 'منى', honorific: 'أ.', quran: true, bookable: true, earliestTrialAt: '2030-01-01T10:00:00Z' },
  ],
}).tutors;
assert.deepEqual(tutorsForPage(math, tutors).map((t) => t.id), ['t1'], 'only bookable math/elementary');
const html = renderSeoPage(math, tutors, new Date('2029-12-31T10:00:00Z'));
assert.ok(html.includes('<title>مدرس رياضيات ابتدائي أونلاين'));
assert.ok(html.includes('<link rel="canonical" href="https://www.shatirclasses.com/tutors/math-elementary">'));
assert.ok(html.includes('href="/#book/t1"'));
assert.ok(html.includes('سارة &lt;b&gt;') && !html.includes('سارة <b>'), 'escaped');
assert.ok(html.includes('"@type":"FAQPage"'));
assert.ok(html.includes('"lowPrice":150'));
assert.equal(esc(`"'<>&`), '&quot;&#39;&lt;&gt;&amp;');
const empty = renderSeoPage(SEO_PAGES.find((p) => p.slug === 'physics-secondary')!, tutors);
assert.ok(empty.includes('بتتفتح قريب'));
const sm = renderSitemap(SEO_PAGES, '2026-11-25');
assert.equal((sm.match(/<loc>/g) || []).length, SEO_PAGES.length + 1);
assert.ok(sm.includes('https://www.shatirclasses.com/tutors/quran'));
console.log(`SEO pages tests passed (${SEO_PAGES.length} pages).`);
