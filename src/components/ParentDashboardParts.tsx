import React, { useState } from 'react';
import { FileText, Loader2, Pencil, Plus, Trash2, User, Users, X } from 'lucide-react';
import { ParentChild, ParentDashboardBooking } from '../types';
import { ParentDashboardService } from '../services/parentDashboardService';
import { hasBookingEnded } from '../utils/directTrialBooking';
import { toArabicDigits } from '../utils/formatters';

const inputCls =
  'w-full h-12 rounded-2xl border border-[#CBD5E1] bg-white px-4 text-sm text-[#1F2A44] outline-none focus:border-[#0D4E8B] focus:ring-4 focus:ring-[#0D4E8B]/10';

/** «أطفالي»: add / edit / delete children of the signed-in guardian. */
export const ParentChildrenSection: React.FC<{
  children: ParentChild[];
  onChanged: () => Promise<void> | void;
}> = ({ children, onChanged }) => {
  const [editing, setEditing] = useState<ParentChild | 'new' | null>(null);
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = (c: ParentChild | 'new') => {
    setEditing(c);
    setName(c === 'new' ? '' : c.name);
    setGrade(c === 'new' ? '' : c.gradeLabel || '');
    setError(null);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await ParentDashboardService.upsertChild({
        id: editing && editing !== 'new' ? editing.id : null,
        name,
        gradeLabel: grade,
      });
      setEditing(null);
      await onChanged();
    } catch (err: any) {
      setError(err?.message || 'تعذر الحفظ.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: ParentChild) => {
    if (!window.confirm(`حذف ${c.name}؟ حجوزاته هتفضل موجودة.`)) return;
    setBusy(true);
    try {
      await ParentDashboardService.deleteChild(c.id);
      await onChanged();
    } catch (err: any) {
      setError(err?.message || 'تعذر الحذف.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="أطفالي" className="bg-white rounded-3xl border border-[#E2E8F0] shadow-xs p-5 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-[#EBF3FC] text-[#0D4E8B] flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" strokeWidth={1.75} />
          </span>
          <div>
            <h2 className="font-['Cairo'] text-lg font-extrabold text-[#1F2A44]">أطفالي</h2>
            <p className="text-xs text-[#64748B]">عشان كل حصة وتقريرها يتسجلوا باسم الطفل.</p>
          </div>
        </div>
        {editing === null && (
          <button
            type="button"
            onClick={() => open('new')}
            className="min-h-[44px] px-4 rounded-2xl border border-[#CBD5E1] text-[#0D4E8B] text-sm font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0 hover:bg-[#F8FAFC] cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة طفل</span>
          </button>
        )}
      </div>

      {children.length === 0 && editing === null && (
        <p className="text-sm text-[#64748B]">لسه ما ضفتش أطفال. ضيف طفلك عشان تختار الحصة لمين وتتابع تقاريره.</p>
      )}

      {children.length > 0 && (
        <ul className="divide-y divide-[#F1F5F9]">
          {children.map((c) => (
            <li key={c.id} className="py-3 first:pt-0 last:pb-0 flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-[#F1F5F9] text-[#475569] flex items-center justify-center shrink-0 font-['Cairo'] font-extrabold">
                {c.name.charAt(0)}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-[#1F2A44] truncate">{c.name}</p>
                {c.gradeLabel && <p className="text-sm text-[#64748B] truncate">{c.gradeLabel}</p>}
              </div>
              <button type="button" onClick={() => open(c)} aria-label={`تعديل ${c.name}`} className="w-10 h-10 rounded-xl hover:bg-[#F1F5F9] text-[#475569] flex items-center justify-center cursor-pointer">
                <Pencil className="w-4 h-4" strokeWidth={1.75} />
              </button>
              <button type="button" onClick={() => remove(c)} disabled={busy} aria-label={`حذف ${c.name}`} className="w-10 h-10 rounded-xl hover:bg-rose-50 text-rose-600 flex items-center justify-center cursor-pointer">
                <Trash2 className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing !== null && (
        <form onSubmit={save} aria-label="بيانات الطفل" className="p-4 rounded-2xl bg-[#F8FAFC] space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-['Cairo'] text-sm font-extrabold text-[#1F2A44]">{editing === 'new' ? 'طفل جديد' : 'تعديل البيانات'}</p>
            <button type="button" onClick={() => setEditing(null)} aria-label="إغلاق" className="w-9 h-9 rounded-xl hover:bg-white flex items-center justify-center cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-bold text-[#1F2A44]">اسم الطفل</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={inputCls} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-bold text-[#1F2A44]">السن أو الصف <span className="font-normal text-[#94A3B8]">· اختياري</span></span>
            <input value={grade} onChange={(e) => setGrade(e.target.value)} maxLength={80} placeholder="مثال: الصف الرابع الابتدائي أو ٧ سنين" className={inputCls} />
          </label>
          {error && <p role="alert" className="text-sm font-bold text-rose-700">{error}</p>}
          <button type="submit" disabled={busy} className="w-full min-h-[48px] rounded-2xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>حفظ</span>
          </button>
        </form>
      )}
    </section>
  );
};

/** Inside a booking card: «الحصة لمين؟» and the tutor's report after the session. */
export const ParentBookingExtras: React.FC<{
  booking: ParentDashboardBooking;
  children: ParentChild[];
  onChanged: () => Promise<void> | void;
}> = ({ booking, children, onChanged }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (booking.status === 'cancelled') return null;
  const ended = hasBookingEnded(booking.endsAt);
  const report = booking.report;

  const setChild = async (childId: string) => {
    setBusy(true);
    setError(null);
    try {
      await ParentDashboardService.setTrialChild(booking.id, childId || null);
      await onChanged();
    } catch (err: any) {
      setError(err?.message || 'تعذر الحفظ.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <User className="w-4 h-4 text-[#64748B] shrink-0" strokeWidth={1.75} />
        <span className="text-sm font-bold text-[#1F2A44] shrink-0">الحصة لمين؟</span>
        {children.length > 0 ? (
          <select
            aria-label="الحصة لمين؟"
            value={booking.childId || ''}
            disabled={busy}
            onChange={(e) => setChild(e.target.value)}
            className="flex-1 min-w-0 h-10 px-3 rounded-xl border border-[#CBD5E1] bg-white text-sm text-[#1F2A44]"
          >
            <option value="">اختار الطفل</option>
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm text-[#64748B]">ضيف طفلك من «أطفالي» فوق.</span>
        )}
        {busy && <Loader2 className="w-4 h-4 animate-spin text-[#0D4E8B]" />}
      </div>
      {error && <p role="alert" className="text-sm font-bold text-rose-700">{error}</p>}

      {report ? (
        <div aria-label="تقرير المعلم" className="p-4 rounded-2xl bg-[#F0F6FD] space-y-2 text-sm text-[#334155]">
          <p className="font-['Cairo'] font-extrabold text-[#0D4E8B] flex items-center gap-1.5">
            <FileText className="w-4 h-4" strokeWidth={1.75} />
            تقرير المعلم بعد الحصة
          </p>
          <p className="font-bold">{report.attended ? `${booking.childName || 'الطفل'} حضر الحصة.` : `${booking.childName || 'الطفل'} ما حضرش الحصة.`}</p>
          {report.levelSummary && <p><span className="text-[#64748B]">المستوى: </span>{report.levelSummary}</p>}
          {report.covered && <p><span className="text-[#64748B]">اتعمل إيه: </span>{report.covered}</p>}
          {report.recommendation && <p><span className="text-[#64748B]">توصية المعلم: </span>{report.recommendation}</p>}
          {report.homework && <p><span className="text-[#64748B]">واجب / متابعة: </span>{report.homework}</p>}
        </div>
      ) : ended ? (
        <p className="px-4 py-3 rounded-2xl bg-[#F8FAFC] text-sm text-[#64748B] flex items-center gap-2">
          <FileText className="w-4 h-4 shrink-0" strokeWidth={1.75} />
          تقرير المعلم عن الحصة هيظهر هنا أول ما يكتبه.
        </p>
      ) : null}
    </div>
  );
};

export const parentChildrenCountLabel = (n: number) => (n === 1 ? 'طفل واحد' : `${toArabicDigits(n)} أطفال`);
