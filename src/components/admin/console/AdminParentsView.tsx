import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarCheck2,
  ChevronLeft,
  FileText,
  Loader2,
  Mail,
  MessageCircle,
  NotebookPen,
  Search,
  Trash2,
  Users,
  UsersRound,
} from 'lucide-react';
import { AdminConsoleService } from '../../../services/adminConsoleService';
import { AdminParentDetail, AdminParentListItem } from '../../../types/adminConsole';
import {
  LEAD_STATUS_LABELS,
  TRIAL_STATUS_LABELS,
  formatAdminDateTime,
  relativeTimeAr,
  sourceLabel,
  whatsappLink,
} from '../../../utils/adminConsole';
import { buildCsv, csvFileName, downloadCsv } from '../../../utils/csvExport';
import { toArabicDigits } from '../../../utils/formatters';
import {
  Card,
  EmptyState,
  ErrorNotice,
  ExportButton,
  ICON,
  LoadingBlock,
  PageHeader,
  Pill,
  RefreshButton,
  StatTile,
  inputClass,
  primaryButton,
  toolbarButton,
} from './AdminConsoleUi';

const PAGE = 50;

const statusTone = (s: string) => (s === 'completed' ? 'green' : s === 'cancelled' ? 'rose' : 'blue') as 'green' | 'rose' | 'blue';

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

const ParentsList: React.FC<{ onOpen: (userId: string) => void }> = ({ onOpen }) => {
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<AdminParentListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await AdminConsoleService.listParents(q, PAGE, 0);
      setItems(r.items);
      setTotal(r.total);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => load(search), search ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [search, load]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const r = await AdminConsoleService.listParents(search, PAGE, items.length);
      setItems((prev) => [...prev, ...r.items]);
      setTotal(r.total);
    } catch (e) {
      setError(e);
    } finally {
      setLoadingMore(false);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = await AdminConsoleService.listParents(search, 500, 0);
      const csv = buildCsv(all.items, [
        { header: 'الاسم', value: (p) => p.name },
        { header: 'الإيميل', value: (p) => p.email },
        { header: 'واتساب', value: (p) => p.whatsapp },
        { header: 'عدد الأطفال', value: (p) => p.childrenCount },
        { header: 'عدد الحجوزات', value: (p) => p.bookingsCount },
        { header: 'حصص اتعملت', value: (p) => p.completedCount },
        { header: 'آخر حصة', value: (p) => p.lastSessionAt },
        { header: 'الحصة الجاية', value: (p) => p.nextSessionAt },
        { header: 'تاريخ التسجيل', value: (p) => p.joinedAt },
      ]);
      downloadCsv(csvFileName('parents'), csv);
      AdminConsoleService.logEvent('export_csv', `صدّر أولياء الأمور (${all.items.length})`, { page: 'parents', rows: all.items.length });
    } catch (e) {
      setError(e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="أولياء الأمور"
        subtitle={loading ? 'بنحمّل…' : `${toArabicDigits(total)} وليّ أمر عنده حساب`}
        actions={
          <>
            <ExportButton onClick={exportCsv} disabled={exporting || total === 0} label={exporting ? 'بنجهّز الملف…' : 'تصدير Excel'} />
            <RefreshButton onClick={() => load(search)} loading={loading} />
          </>
        }
      />

      <label className="relative block">
        <span className="sr-only">بحث في أولياء الأمور</span>
        <Search className="w-4 h-4 text-[#94A3B8] absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="اسم وليّ الأمر أو الطفل أو الإيميل أو الموبايل"
          className={`${inputClass} h-12 pr-11`}
        />
      </label>

      {error ? <ErrorNotice error={error} onRetry={() => load(search)} /> : null}

      {loading && items.length === 0 ? (
        <LoadingBlock />
      ) : items.length === 0 && !error ? (
        <Card>
          <EmptyState
            icon={<UsersRound {...ICON} />}
            title={search ? 'مفيش نتايج' : 'لسه مفيش أولياء أمور'}
            hint={search ? 'جرّب جزء من الاسم أو آخر أرقام الموبايل.' : 'أول ما وليّ أمر يحجز حصة تجريبية هيظهر هنا.'}
          />
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-3xl border border-[#E2E8F0] shadow-xs overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#F8FAFC] text-[#64748B] text-xs">
                <tr>
                  <th className="text-right font-bold px-4 py-3">وليّ الأمر</th>
                  <th className="text-right font-bold px-4 py-3">الأطفال</th>
                  <th className="text-right font-bold px-4 py-3">الحجوزات</th>
                  <th className="text-right font-bold px-4 py-3">الحصة الجاية</th>
                  <th className="text-right font-bold px-4 py-3">آخر دخول</th>
                  <th className="px-4 py-3"><span className="sr-only">فتح</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {items.map((p) => (
                  <tr key={p.userId} onClick={() => onOpen(p.userId)} className="hover:bg-[#F8FAFC] cursor-pointer">
                    <td className="px-4 py-3">
                      <p className="font-bold text-[#1F2A44]">{p.name || '—'}</p>
                      <p className="text-xs text-[#64748B]" dir="ltr">{p.email || p.whatsapp || ''}</p>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{toArabicDigits(p.childrenCount)}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {toArabicDigits(p.bookingsCount)}
                      {p.completedCount > 0 && <span className="text-xs text-[#64748B]"> · {toArabicDigits(p.completedCount)} اتعملت</span>}
                    </td>
                    <td className="px-4 py-3">{p.nextSessionAt ? <Pill tone="blue">{formatAdminDateTime(p.nextSessionAt)}</Pill> : <span className="text-[#94A3B8]">—</span>}</td>
                    <td className="px-4 py-3 text-[#64748B]">{relativeTimeAr(p.lastSignInAt)}</td>
                    <td className="px-4 py-3 text-left">
                      <button type="button" aria-label={`فتح ملف ${p.name || ''}`} className="w-9 h-9 rounded-xl hover:bg-[#EBF3FC] text-[#0D4E8B] inline-flex items-center justify-center cursor-pointer">
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="md:hidden space-y-2.5">
            {items.map((p) => (
              <li key={p.userId}>
                <button
                  type="button"
                  onClick={() => onOpen(p.userId)}
                  className="w-full text-right bg-white rounded-3xl border border-[#E2E8F0] shadow-xs p-4 flex items-center gap-3 cursor-pointer"
                >
                  <span className="w-11 h-11 rounded-full bg-[#EBF3FC] text-[#0D4E8B] flex items-center justify-center shrink-0 font-['Cairo'] font-extrabold">
                    {(p.name || p.email || '؟').charAt(0)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-base font-bold text-[#1F2A44] truncate">{p.name || p.email || 'وليّ أمر'}</span>
                    <span className="block text-xs text-[#64748B] truncate">
                      {toArabicDigits(p.childrenCount)} أطفال · {toArabicDigits(p.bookingsCount)} حجز
                      {p.nextSessionAt ? ` · الجاية ${formatAdminDateTime(p.nextSessionAt)}` : ''}
                    </span>
                  </span>
                  <ChevronLeft className="w-5 h-5 text-[#94A3B8] shrink-0" />
                </button>
              </li>
            ))}
          </ul>

          {items.length < total && (
            <div className="flex justify-center">
              <button type="button" onClick={loadMore} disabled={loadingMore} className={toolbarButton}>
                {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>عرض المزيد ({toArabicDigits(total - items.length)})</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

const ParentDetail: React.FC<{ userId: string; onBack: () => void; onOpenLead: (id: string) => void; canOpenLeads: boolean }> = ({
  userId,
  onBack,
  onOpenLead,
  canOpenLeads,
}) => {
  const [data, setData] = useState<AdminParentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await AdminConsoleService.getParent(userId));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const addNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;
    setSavingNote(true);
    setNoteError(null);
    try {
      await AdminConsoleService.addParentNote(userId, note);
      setNote('');
      await load();
    } catch (err: any) {
      setNoteError(err?.message || 'تعذر الحفظ.');
    } finally {
      setSavingNote(false);
    }
  };

  const deleteNote = async (id: string) => {
    if (!window.confirm('حذف الملاحظة؟')) return;
    try {
      await AdminConsoleService.deleteParentNote(id);
      await load();
    } catch (err: any) {
      setNoteError(err?.message || 'تعذر الحذف.');
    }
  };

  const back = (
    <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-bold text-[#0D4E8B] hover:underline cursor-pointer">
      <ArrowRight className="w-4 h-4" />
      <span>كل أولياء الأمور</span>
    </button>
  );

  if (!data) {
    return (
      <div className="space-y-4">
        {back}
        {error ? <ErrorNotice error={error} onRetry={load} /> : <LoadingBlock />}
      </div>
    );
  }

  const p = data.profile;
  const wa = whatsappLink(p.whatsapp);
  const completed = data.bookings.filter((b) => b.status === 'completed').length;
  const attended = data.bookings.filter((b) => b.report?.attended).length;
  const upcoming = data.bookings.filter((b) => b.status === 'confirmed' && new Date(b.startsAt).getTime() > Date.now()).length;

  return (
    <div className="space-y-5">
      {back}

      {/* Header */}
      <section className="bg-white rounded-3xl border border-[#E2E8F0] shadow-xs p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <span className="w-14 h-14 rounded-full bg-[#0D4E8B] text-white flex items-center justify-center shrink-0 font-['Cairo'] text-xl font-extrabold">
          {(p.name || p.email || '؟').charAt(0)}
        </span>
        <div className="flex-1 min-w-0">
          <h1 className="font-['Cairo'] text-xl sm:text-2xl font-extrabold text-[#1F2A44] truncate">{p.name || 'وليّ أمر'}</h1>
          <p className="text-sm text-[#64748B]">
            عنده حساب {relativeTimeAr(p.joinedAt)} · آخر دخول {relativeTimeAr(p.lastSignInAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className={`${primaryButton} bg-emerald-600 hover:bg-emerald-700`}>
              <MessageCircle className="w-4 h-4" />
              <span>واتساب</span>
            </a>
          )}
          {p.email && (
            <a href={`mailto:${p.email}`} className={toolbarButton}>
              <Mail className="w-4 h-4" />
              <span>إيميل</span>
            </a>
          )}
        </div>
      </section>

      <section aria-label="ملخص" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="الأطفال" value={data.children.length} />
        <StatTile label="الحجوزات" value={data.bookings.length} hint={upcoming ? `${toArabicDigits(upcoming)} جاية` : undefined} />
        <StatTile label="حصص اتعملت" value={completed} tone="green" />
        <StatTile label="حضر" value={attended} hint="حسب تقارير المعلمين" tone="green" />
      </section>

      <div className="grid lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-5">
          {/* Bookings */}
          <Card title="الحصص والتقارير" icon={<CalendarCheck2 {...ICON} />}>
            {data.bookings.length === 0 ? (
              <EmptyState icon={<CalendarCheck2 {...ICON} />} title="مفيش حجوزات" />
            ) : (
              <ol className="space-y-3">
                {data.bookings.map((b) => (
                  <li key={b.id} className="p-4 rounded-2xl border border-[#E2E8F0] space-y-2">
                    <div className="flex flex-wrap items-center gap-2 justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#1F2A44]">
                          {b.tutorName || 'معلم'}
                          {b.childName ? <span className="font-normal text-[#64748B]"> · {b.childName}</span> : null}
                        </p>
                        <p className="text-xs text-[#64748B]">{formatAdminDateTime(b.startsAt)}</p>
                      </div>
                      <Pill tone={statusTone(b.status)}>{TRIAL_STATUS_LABELS[b.status] || b.status}</Pill>
                    </div>
                    {b.report ? (
                      <div className="p-3 rounded-xl bg-[#F0F6FD] text-sm text-[#334155] space-y-1">
                        <p className="font-bold text-[#0D4E8B] flex items-center gap-1.5">
                          <FileText className="w-4 h-4" strokeWidth={1.75} />
                          {b.report.attended ? 'حضر الحصة' : 'ما حضرش'}
                        </p>
                        {b.report.levelSummary && <p><span className="text-[#64748B]">المستوى: </span>{b.report.levelSummary}</p>}
                        {b.report.covered && <p><span className="text-[#64748B]">اتعمل إيه: </span>{b.report.covered}</p>}
                        {b.report.recommendation && <p><span className="text-[#64748B]">التوصية: </span>{b.report.recommendation}</p>}
                        {b.report.homework && <p><span className="text-[#64748B]">واجب: </span>{b.report.homework}</p>}
                      </div>
                    ) : b.status !== 'cancelled' && new Date(b.endsAt).getTime() < Date.now() ? (
                      <p className="text-xs font-bold text-amber-700">المعلم لسه ما كتبش التقرير.</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {/* Leads */}
          {data.leads.length > 0 && (
            <Card title="طلباته على واتساب" subtitle="طلبات بنفس رقم الموبايل" icon={<MessageCircle {...ICON} />}>
              <ul className="divide-y divide-[#F1F5F9]">
                {data.leads.map((l) => (
                  <li key={l.id} className="py-2.5 flex items-center gap-3">
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold text-[#1F2A44]" dir="ltr">{l.referenceCode || '—'}</span>
                      <span className="block text-xs text-[#64748B]">
                        {formatAdminDateTime(l.createdAt, { withTime: false })}
                        {l.utmSource ? ` · ${sourceLabel(l.utmSource)}` : ''}
                      </span>
                    </span>
                    <Pill>{LEAD_STATUS_LABELS[l.status] || l.status}</Pill>
                    {canOpenLeads && (
                      <button type="button" onClick={() => onOpenLead(l.id)} aria-label="فتح الطلب" className="w-9 h-9 rounded-xl hover:bg-[#EBF3FC] text-[#0D4E8B] flex items-center justify-center cursor-pointer">
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          {/* Children */}
          <Card title="الأطفال" icon={<Users {...ICON} />}>
            {data.children.length === 0 ? (
              <p className="text-sm text-[#64748B]">ما ضافش أطفال لسه.</p>
            ) : (
              <ul className="space-y-2">
                {data.children.map((c) => (
                  <li key={c.id} className="flex items-center gap-2.5">
                    <span className="w-9 h-9 rounded-full bg-[#F1F5F9] text-[#475569] flex items-center justify-center font-['Cairo'] font-extrabold shrink-0">{c.name.charAt(0)}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-[#1F2A44] truncate">{c.name}</span>
                      {c.gradeLabel && <span className="block text-xs text-[#64748B] truncate">{c.gradeLabel}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Internal notes */}
          <Card title="ملاحظات الفريق" subtitle="داخلية، وليّ الأمر مش بيشوفها." icon={<NotebookPen {...ICON} />} tone="amber">
            <form onSubmit={addNote} className="space-y-2">
              <label className="block">
                <span className="sr-only">ملاحظة جديدة</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={2000}
                  rows={3}
                  placeholder="مثال: كلمناه وعايز معلم رياضيات الأسبوع الجاي"
                  className="w-full rounded-2xl border border-[#CBD5E1] bg-white p-3 text-sm text-[#1F2A44] outline-none focus:border-[#0D4E8B] focus:ring-4 focus:ring-[#0D4E8B]/10"
                />
              </label>
              {noteError && <p role="alert" className="text-xs font-bold text-rose-700">{noteError}</p>}
              <button type="submit" disabled={savingNote || !note.trim()} className={`${primaryButton} w-full`}>
                {savingNote && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>حفظ الملاحظة</span>
              </button>
            </form>
            {data.notes.length > 0 && (
              <ul className="mt-4 space-y-2.5">
                {data.notes.map((n) => (
                  <li key={n.id} className="p-3 rounded-2xl bg-[#FFFBEB] text-sm text-[#1F2A44]">
                    <p className="whitespace-pre-line leading-relaxed">{n.body}</p>
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-[#92400E]">
                      <span dir="auto">{n.authorEmail} · {relativeTimeAr(n.createdAt)}</span>
                      {n.canDelete && (
                        <button type="button" onClick={() => deleteNote(n.id)} aria-label="حذف الملاحظة" className="w-7 h-7 rounded-lg hover:bg-amber-100 flex items-center justify-center cursor-pointer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export const AdminParentsView: React.FC<{
  selectedUserId: string | null;
  onSelect: (userId: string | null) => void;
  onOpenLead: (leadId: string) => void;
  canOpenLeads: boolean;
}> = ({ selectedUserId, onSelect, onOpenLead, canOpenLeads }) =>
  selectedUserId ? (
    <ParentDetail userId={selectedUserId} onBack={() => onSelect(null)} onOpenLead={onOpenLead} canOpenLeads={canOpenLeads} />
  ) : (
    <ParentsList onOpen={(id) => onSelect(id)} />
  );
