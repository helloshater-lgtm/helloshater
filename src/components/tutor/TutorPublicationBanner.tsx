import React, { useEffect, useState } from 'react';
import { AlertTriangle, Bell, CalendarPlus, CheckCircle2, PencilLine } from 'lucide-react';
import { PublicationService, TutorPublicationStatus, missingLabel } from '../../services/publicationService';
import { toArabicDigits } from '../../utils/formatters';

/** Tells the tutor why the profile is hidden / at risk, and what to do. */
export const TutorPublicationBanner: React.FC<{ onEditProfile: () => void; onOpenCalendar: () => void }> = ({ onEditProfile, onOpenCalendar }) => {
  const [s, setS] = useState<TutorPublicationStatus | null>(null);

  useEffect(() => {
    PublicationService.getMyStatus().then(setS).catch(() => setS(null));
  }, []);
  useEffect(() => {
    if (s?.notifications.some((n) => !n.read)) PublicationService.markRead().catch(() => undefined);
  }, [s]);

  if (!s || !s.approvedOnce || s.adminLocked) return null;
  const daysLeft = s.hideAt ? Math.max(0, Math.ceil((new Date(s.hideAt).getTime() - Date.now()) / 86400000)) : null;
  const unread = s.notifications.filter((n) => !n.read).slice(0, 2);

  let box: React.ReactNode = null;
  if (!s.isPublished && s.missing.length) {
    box = (
      <div className="p-4 rounded-2xl bg-rose-50 ring-1 ring-rose-200 space-y-3">
        <p className="font-['Cairo'] font-extrabold text-rose-900 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" /> ملفك مش ظاهر لأولياء الأمور دلوقتي
        </p>
        <p className="text-sm text-rose-900">ناقص:</p>
        <ul className="text-sm text-rose-900 list-disc pr-5 space-y-0.5">
          {s.missing.map((m) => <li key={m}>{missingLabel(m)}</li>)}
        </ul>
        <p className="text-xs text-rose-800">أول ما تكمّلهم، ملفك هيتنشر تلقائيًا خلال ساعة.</p>
        <button type="button" onClick={onEditProfile} className="h-11 px-4 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-sm font-extrabold flex items-center gap-2 cursor-pointer">
          <PencilLine className="w-4 h-4" /> كمّل ملفك دلوقتي
        </button>
      </div>
    );
  } else if (!s.isPublished && s.autoReason === 'no_slots') {
    box = (
      <div className="p-4 rounded-2xl bg-rose-50 ring-1 ring-rose-200 space-y-3">
        <p className="font-['Cairo'] font-extrabold text-rose-900 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" /> ملفك اتوقف لأنه مفيش مواعيد تجربة
        </p>
        <p className="text-sm text-rose-900">افتح مواعيد تجربة (٢٠ دقيقة) وهيتنشر ملفك تلقائيًا خلال ساعة.</p>
        <button type="button" onClick={onOpenCalendar} className="h-11 px-4 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-sm font-extrabold flex items-center gap-2 cursor-pointer">
          <CalendarPlus className="w-4 h-4" /> افتح مواعيد تجربة
        </button>
      </div>
    );
  } else if (s.isPublished && !s.hasTrialSlot) {
    box = (
      <div className="p-4 rounded-2xl bg-amber-50 ring-1 ring-amber-200 space-y-3">
        <p className="font-['Cairo'] font-extrabold text-amber-900 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" /> مفيش عندك مواعيد تجربة مفتوحة
        </p>
        <p className="text-sm text-amber-900">
          أولياء الأمور مش هيقدروا يحجزوا معاك.
          {daysLeft !== null && ` لو فضل كده، ملفك هيتوقف بعد ${toArabicDigits(daysLeft)} ${daysLeft === 1 ? 'يوم' : 'أيام'}.`}
        </p>
        <button type="button" onClick={onOpenCalendar} className="h-11 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-[#1F2A44] text-sm font-extrabold flex items-center gap-2 cursor-pointer">
          <CalendarPlus className="w-4 h-4" /> افتح مواعيد تجربة
        </button>
      </div>
    );
  } else if (unread.some((n) => n.kind === 'published')) {
    box = (
      <div className="p-4 rounded-2xl bg-emerald-50 ring-1 ring-emerald-200 text-emerald-900 font-bold flex items-center gap-2">
        <CheckCircle2 className="w-5 h-5" /> ملفك اتنشر تاني وظاهر لأولياء الأمور 🎉
      </div>
    );
  }

  if (!box && !unread.length) return null;
  return (
    <section aria-label="حالة ملفك" className="space-y-2">
      {box}
      {!box &&
        unread.map((n) => (
          <p key={n.id} className="p-3 rounded-2xl bg-white ring-1 ring-[#E2E8F0] text-sm text-[#1F2A44] flex gap-2">
            <Bell className="w-4 h-4 shrink-0 text-[#0D4E8B] mt-0.5" />
            <span><b>{n.title}:</b> {n.body}</span>
          </p>
        ))}
    </section>
  );
};
