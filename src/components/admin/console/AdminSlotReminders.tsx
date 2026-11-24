import React, { useEffect, useState } from 'react';
import { CalendarX2, MessageCircle } from 'lucide-react';
import { getTutorsWithoutTrialSlots, TutorWithoutSlots } from '../../../services/tutorDirectoryService';
import { relativeTimeAr, whatsappLink } from '../../../utils/adminConsole';
import { toArabicDigits } from '../../../utils/formatters';
import { Card, ICON, Pill } from './AdminConsoleUi';

export const reminderMessage = (t: { honorific: string; name: string }) =>
  `أهلًا ${t.honorific} ${t.name} 👋\nأولياء أمور بيدوّروا على معلمين على شاطر كلاسيز دلوقتي، ومفيش عندك مواعيد تجربة مجانية مفتوحة.\nممكن تفتح ٣–٥ مواعيد (٢٠ دقيقة) للأسبوع ده من لوحة المعلم ← التقويم؟\nhttps://www.shatirclasses.com/#tutor-dashboard\nشكرًا 🙏`;

/** Published tutors with no open trial slot + one-tap WhatsApp reminder. */
export const AdminSlotReminders: React.FC = () => {
  const [list, setList] = useState<TutorWithoutSlots[] | null | undefined>(undefined);
  const [sent, setSent] = useState<Set<string>>(new Set());

  useEffect(() => {
    getTutorsWithoutTrialSlots().then(setList).catch(() => setList(null));
  }, []);

  if (list === undefined || list === null) return null;

  return (
    <Card
      title="معلمين مالهمش مواعيد تجربة"
      subtitle="الإعلان ميفيدش من غير مواعيد. ابعت تذكير بضغطة."
      icon={<CalendarX2 {...ICON} />}
      tone={list.length ? 'amber' : 'green'}
      aside={<Pill tone={list.length ? 'amber' : 'green'}>{toArabicDigits(list.length)}</Pill>}
    >
      {list.length === 0 ? (
        <p className="text-sm text-emerald-800 font-bold">كل المعلمين المنشورين عندهم مواعيد مفتوحة.</p>
      ) : (
        <ul className="divide-y divide-[#F1F5F9] max-h-96 overflow-y-auto">
          {list.map((t) => {
            const wa = whatsappLink(t.whatsapp, reminderMessage(t));
            const done = sent.has(t.tutorId);
            return (
              <li key={t.tutorId} className="py-2.5 flex items-center gap-3">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-[#1F2A44] truncate">{t.honorific} {t.name}</span>
                  <span className="block text-xs text-[#64748B]">
                    {t.lastSlotAt ? `آخر ميعاد ${relativeTimeAr(t.lastSlotAt)}` : 'ما فتحش مواعيد قبل كده'}
                  </span>
                </span>
                {wa ? (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setSent((s) => new Set(s).add(t.tutorId))}
                    className={`h-10 px-3 rounded-xl text-xs font-bold flex items-center gap-1.5 ${done ? 'bg-slate-100 text-slate-500' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                  >
                    <MessageCircle className="w-4 h-4" />
                    {done ? 'اتبعت' : 'ذكّره'}
                  </a>
                ) : (
                  <span className="text-xs text-[#94A3B8]">مفيش رقم</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
};
