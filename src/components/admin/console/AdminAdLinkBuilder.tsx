import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, Link2 } from 'lucide-react';
import { TutorDirectoryService } from '../../../services/tutorDirectoryService';
import {
  DirectoryData,
  DirectoryStageId,
  STAGE_CHIP_LABELS,
  buildAdLandingUrl,
  filterDirectory,
  subjectChipsFor,
} from '../../../utils/tutorDirectory';
import { toArabicDigits } from '../../../utils/formatters';
import { Card, ICON, inputClass, toolbarButton } from './AdminConsoleUi';

const SOURCES = [
  { id: 'facebook', label: 'فيسبوك' },
  { id: 'instagram', label: 'إنستجرام' },
  { id: 'tiktok', label: 'تيك توك' },
  { id: 'google', label: 'جوجل' },
  { id: 'whatsapp', label: 'واتساب' },
];

/** Builds the ad link that opens the filtered tutors directly (with UTM tags). */
export const AdminAdLinkBuilder: React.FC = () => {
  const [data, setData] = useState<DirectoryData | null>(null);
  const [stage, setStage] = useState<DirectoryStageId | ''>('');
  const [subject, setSubject] = useState('');
  const [source, setSource] = useState('facebook');
  const [campaign, setCampaign] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    TutorDirectoryService.getDirectory().then(setData).catch(() => setData(null));
  }, []);

  const subjects = useMemo(() => (data ? subjectChipsFor(data, stage || null) : []), [data, stage]);
  const url = buildAdLandingUrl({ stage: stage || null, subject: subject || null, source, campaign });
  const matches = data ? filterDirectory(data, { stage: stage || null, subject: subject || null }) : [];
  const bookable = matches.filter((t) => t.bookable && t.earliestTrialAt).length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('انسخ الرابط:', url);
    }
  };

  return (
    <Card title="رابط إعلان" subtitle="اختار المرحلة والمادة: الرابط يفتح المعلمين المناسبين على طول، والحجوزات تتحسب للإعلان." icon={<Link2 {...ICON} />}>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="space-y-1">
          <span className="text-xs font-bold text-[#64748B]">المرحلة</span>
          <select value={stage} onChange={(e) => { setStage(e.target.value as DirectoryStageId | ''); setSubject(''); }} className={inputClass}>
            <option value="">كل المراحل</option>
            {(Object.keys(STAGE_CHIP_LABELS) as DirectoryStageId[]).map((s) => (
              <option key={s} value={s}>{STAGE_CHIP_LABELS[s]}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold text-[#64748B]">المادة</span>
          <select value={subject} onChange={(e) => setSubject(e.target.value)} disabled={stage === 'quran'} className={inputClass}>
            <option value="">كل المواد</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold text-[#64748B]">مكان الإعلان</span>
          <select value={source} onChange={(e) => setSource(e.target.value)} className={inputClass}>
            {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold text-[#64748B]">اسم الحملة (إنجليزي)</span>
          <input value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="math_nov" dir="ltr" className={inputClass} />
        </label>
      </div>
      <div className="mt-3 p-3 rounded-2xl bg-[#F8FAFC] text-xs text-[#1F2A44] break-all" dir="ltr">{url}</div>
      {data && (
        <p className={`mt-2 text-xs font-bold ${bookable ? 'text-emerald-700' : 'text-rose-700'}`}>
          {bookable
            ? `هيظهر ${toArabicDigits(matches.length)} معلم، منهم ${toArabicDigits(bookable)} عندهم مواعيد تجربة قريبة.`
            : 'مفيش معلم عنده مواعيد تجربة للاختيار ده دلوقتي. ما تشغّلش الإعلان قبل ما تتفتح مواعيد.'}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={copy} className={toolbarButton}>
          {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
          <span>{copied ? 'اتنسخ' : 'نسخ الرابط'}</span>
        </button>
        <a href={url} target="_blank" rel="noopener noreferrer" className={toolbarButton}>
          <ExternalLink className="w-4 h-4" />
          <span>جرّبه</span>
        </a>
      </div>
    </Card>
  );
};
