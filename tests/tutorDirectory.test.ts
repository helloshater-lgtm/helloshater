import assert from 'node:assert/strict';
import {
  buildAdLandingUrl, buildDirectorySearch, filterDirectory, normalizeDirectory,
  parseDirectoryFilters, shortSubjectName, stageChipsFor, subjectChipsFor, formatEarliestTrial,
} from '../src/utils/tutorDirectory';
import { csvCell } from '../src/utils/csvExport';

const data = normalizeDirectory({
  stages: [{ id: 'elementary', name: 'ابتدائي' }],
  subjects: [{ id: 'math', name: 'الرياضيات (Math)' }, { id: 'math_en', name: 'Math — الرياضيات بالإنجليزية' }, { id: 'arabic', name: 'اللغة العربية' }],
  tutors: [
    { id: 'a', name: 'A', stageIds: ['elementary'], subjectIds: ['math_en'], bookable: true, earliestTrialAt: '2030-01-02T10:00:00Z', rating: 4 },
    { id: 'b', name: 'B', stageIds: ['elementary', 'preparatory'], subjectIds: ['math', 'arabic'], bookable: true, earliestTrialAt: '2030-01-01T10:00:00Z' },
    { id: 'c', name: 'C', quran: true, bookable: false, earliestTrialAt: '2030-01-01T09:00:00Z', rating: 5 },
    { id: 'd', name: 'D', stageIds: ['secondary'], subjectIds: ['physics'], rating: '4.9' },
  ],
});

assert.deepEqual(parseDirectoryFilters('?stage=primary&subject=math&utm_source=fb'), { stage: 'elementary', subject: 'math' });
assert.deepEqual(parseDirectoryFilters('?stage=quran&subject=math'), { stage: 'quran', subject: null });
assert.deepEqual(parseDirectoryFilters('?stage=x&subject=<script>'), { stage: null, subject: null });
assert.equal(buildDirectorySearch('?utm_source=fb&stage=secondary', { stage: 'elementary', subject: 'math' }), '?utm_source=fb&stage=elementary&subject=math');
assert.equal(buildDirectorySearch('?stage=elementary', { stage: null, subject: null }), '');

assert.deepEqual(filterDirectory(data, { stage: null, subject: null }).map((t) => t.id), ['b', 'a', 'c', 'd']);
assert.deepEqual(filterDirectory(data, { stage: 'elementary', subject: 'math' }).map((t) => t.id), ['b', 'a'], 'math_en merged');
assert.deepEqual(filterDirectory(data, { stage: 'quran', subject: null }).map((t) => t.id), ['c']);
assert.deepEqual(subjectChipsFor(data, 'elementary').map((c) => [c.id, c.label, c.count]), [['math', 'الرياضيات', 2], ['arabic', 'اللغة العربية', 1]]);
assert.deepEqual(stageChipsFor(data).map((c) => c.id), ['elementary', 'preparatory', 'secondary', 'quran']);
assert.equal(shortSubjectName('Math — الرياضيات بالإنجليزية'), 'الرياضيات بالإنجليزية');
assert.equal(data.tutors[3].rating, 4.9);

const now = new Date('2026-11-24T08:00:00Z');
assert.ok(formatEarliestTrial('2026-11-24T16:30:00Z', now)!.startsWith('النهارده'));
assert.ok(formatEarliestTrial('2026-11-25T09:00:00Z', now)!.startsWith('بكرة'));
assert.equal(formatEarliestTrial(null), null);

const url = buildAdLandingUrl({ stage: 'elementary', subject: 'math', source: 'Facebook', campaign: 'Math Nov!' });
assert.equal(url, 'https://www.shatirclasses.com/?stage=elementary&subject=math&utm_source=facebook&utm_medium=paid&utm_campaign=math_nov');
assert.equal(buildAdLandingUrl({ stage: 'quran', subject: 'math' }), 'https://www.shatirclasses.com/?stage=quran&utm_source=facebook&utm_medium=paid&utm_campaign=quran');
assert.ok(parseDirectoryFilters(new URL(url).search).subject === 'math');
void csvCell;
console.log('Tutor directory tests passed.');
