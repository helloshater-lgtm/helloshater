import React, { useCallback, useEffect, useState } from 'react';
import { Bot, Lock, MessageCircle, Play, Unlock } from 'lucide-react';
import { AdminAutoPublicationRow, PublicationService, missingLabel } from '../../../services/publicationService';
import { relativeTimeAr, whatsappLink } from '../../../utils/adminConsole';
import { toArabicDigits } from '../../../utils/formatters';
import { Card, ICON, Pill, toolbarButton } from './AdminConsoleUi';

const statusOf = (r: AdminAutoPublicationRow) => {
  if (r.adminLocked) return { tone: 'slate' as const, label: 'مقفول يدويًا' };
  if (r.autoHidden) return { tone: 'rose' as const, label: r.autoReason === 'no_slots' ? 'متوقف: مفيش مواعيد' : 'متوقف: ملف ناقص' };
  if (r.noSlotsSince) {
    const days = Math.floor((Date.now() - new Date(r.noSlotsSince).getTime()) / 86400000);
    return { tone: 'amber' as const, label: `من غير مواعيد ${toArabicDigits(days)} يوم` };
  }
  return { tone: 'green' as const, label: 'منشور وجاهز' };
};

const msgFor = (r: AdminAutoPublicationRow) =>
  r.autoHidden && r.missing.length
    ? `أهلًا ${r.honorific} ${r.name} 👋\nملفك على شاطر كلاسيز مش ظاهر لأولياء الأمور لأن ناقص: ${r.missing.map(missingLabel).join('، ')}.\nضيفهم من لوحة المعلم وملفك هيتنشر تلقائيًا خلال ربع ساعة:\nhttps://www.shatirclasses.com/#tutor-dashboard`
    : `أهلًا ${r.honorific} ${r.name} 👋\nمفيش عندك مواعيد تجربة مفتوحة على شاطر كلاسيز، وأولياء الأمور مش قادرين يحجزوا.\nافتح ٣–٥ مواعيد من لوحة المعلم ← التقويم:\nhttps://www.shatirclasses.com/#tutor-dashboard`;

/** Auto publication overview: who was hidden / is at risk, run now, lock / unlock. */
export const AdminAutoPublication: React.FC = () => {
  const [rows, setRows] = useState<AdminAutoPublicationRow[] | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => PublicationService.adminList().then(setRows).catch(() => setRows(null)), []);
  useEffect(() => {
    load();
  }, [load]);
  if (!rows) return null;

  const attention = rows.filter((r) => r.autoHidden || r.adminLocked || r.noSlotsSince);
  const lastRun = rows.map((r) => r.lastCheckedAt).filter(Boolean).sort().pop() || null;

  return (
    <Card
      title="النشر التلقائي"
      subtitle={`المنصة بتفحص الملفات كل ربع ساعة: أي ملف ناقصه بيانات أو مواعيد تجريبي وثابتة بيتوقف، واللي يكمل يتنشر لوحده.${lastRun ? ` آخر فحص ${relativeTimeAr(lastRun)}.` : ''}`}
      icon={<Bot {...ICON} />}
      aside={
        <button
          type="button"
          disabled={busy !== null}
          onClick={async () => {
            setBusy('run');
            try {
              const r = await PublicationService.adminRunNow();
              setNotice(`اتوقف ${toArabicDigits(r.hidden)}، واتنشر ${toArabicDigits(r.published)}، واتبعت تحذير لـ ${toArabicDigits(r.warned)}.`);
              await load();
            } catch (e: any) {
              setNotice(e?.message || 'حصلت مشكلة.');
            } finally {
              setBusy(null);
            }
          }}
          className={toolbarButton}
        >
          <Play className="w-4 h-4" /> افحص دلوقتي
        </button>
      }
    >
      {notice && <p role="status" className="mb-3 p-3 rounded-2xl bg-emerald-50 text-emerald-800 text-sm font-bold">{notice}</p>}
      <p className="text-sm text-[#64748B] mb-3">
        {toArabicDigits(rows.length)} معلم تحت الإدارة التلقائية · {toArabicDigits(attention.length)} محتاجين متابعة
      </p>
      {attention.length === 0 ? (
        <p className="text-sm font-bold text-emerald-800">كل الملفات منشورة وجاهزة.</p>
      ) : (
        <ul className="divide-y divide-[#F1F5F9] max-h-[28rem] overflow-y-auto">
          {attention.map((r) => {
            const st = statusOf(r);
            const wa = whatsappLink(r.whatsapp, msgFor(r));
            return (
              <li key={r.tutorId} className="py-2.5 flex flex-wrap items-center gap-2">
                <span className="flex-1 min-w-[10rem]">
                  <span className="block text-sm font-bold text-[#1F2A44]">{r.honorific} {r.name}</span>
                  {r.missing.length > 0 && <span className="block text-xs text-rose-700">ناقص: {r.missing.map(missingLabel).join('، ')}</span>}
                </span>
                <Pill tone={st.tone}>{st.label}</Pill>
                {wa && !r.adminLocked && (
                  <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={`واتساب ${r.name}`} className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                    <MessageCircle className="w-4 h-4" />
                  </a>
                )}
                <button
                  type="button"
                  disabled={busy !== null}
                  title={r.adminLocked ? 'رجّعه للإدارة التلقائية' : 'اقفله يدويًا (المنصة مش هتنشره)'}
                  aria-label={r.adminLocked ? 'فك القفل' : 'قفل يدوي'}
                  onClick={async () => {
                    setBusy(r.tutorId);
                    try {
                      await PublicationService.adminSetLock(r.tutorId, !r.adminLocked);
                      await load();
                    } finally {
                      setBusy(null);
                    }
                  }}
                  className="w-9 h-9 rounded-xl bg-[#F1F5F9] text-[#475569] hover:bg-[#E2E8F0] flex items-center justify-center cursor-pointer"
                >
                  {r.adminLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-xs text-[#94A3B8]">المعلم الجديد لازم توافق عليه أول مرة. لو أخفيت معلم بإيدك، المنصة مش هتنشره تاني لوحدها.</p>
    </Card>
  );
};
