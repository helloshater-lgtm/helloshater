/**
 * Build step: writes static SEO landing pages to dist/tutors/<slug>.html and
 * dist/sitemap.xml, using the live public tutor directory (anon key, read-only).
 * Never fails the build: without network/keys it writes pages without tutor cards.
 */
import 'dotenv/config';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SEO_PAGES } from '../src/utils/seoCatalog';
import { renderSeoPage, renderSitemap, tutorsForPage } from '../src/utils/seoRender';
import { DirectoryTutor, normalizeDirectory } from '../src/utils/tutorDirectory';

const OUT = join(process.cwd(), 'dist');

async function loadTutors(): Promise<DirectoryTutor[]> {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    console.warn('[seo] Supabase env missing → pages without tutor cards');
    return [];
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/rpc/get_public_tutor_directory`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return normalizeDirectory(await res.json()).tutors;
  } catch (e: any) {
    console.warn(`[seo] directory fetch failed (${e?.message}) → pages without tutor cards`);
    return [];
  }
}

async function main() {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  mkdirSync(join(OUT, 'tutors'), { recursive: true });
  const tutors = await loadTutors();
  for (const page of SEO_PAGES) {
    writeFileSync(join(OUT, 'tutors', `${page.slug}.html`), renderSeoPage(page, tutors));
  }
  writeFileSync(join(OUT, 'sitemap.xml'), renderSitemap());
  const withTutors = SEO_PAGES.filter((p) => tutorsForPage(p, tutors).length > 0).length;
  console.log(`[seo] wrote ${SEO_PAGES.length} pages (${withTutors} with bookable tutors) + sitemap.xml`);
}

main();
