import React, { useState, useEffect, useMemo } from 'react';
import {
  AdminParentLeadRecord,
  AdminParentLeadSourceStat,
  ParentLeadStatus,
  AdminLeadBookingDraft,
} from '../../types';
import { AdminService, AdminTutorListItem } from '../../services/adminService';
import {
  MessageCircle,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Trash2,
  CalendarPlus,
  Copy,
  Check,
  Save,
  BarChart3,
  Inbox,
} from 'lucide-react';

interface AdminParentLeadsViewProps {
  tutorsList: AdminTutorListItem[];
  onOpenBookingFromLead: (draft: AdminLeadBookingDraft) => void;
  onUpdateNewLeadsCount?: (count: number) => void;
}

const STATUS_LABELS: Record<ParentLeadStatus, string> = {
  new: 'جديد',
  contacted: 'تواصلنا',
  trial: 'حصة تجريبية',
  subscribed: 'اشترك',
  lost: 'ماكملش',
};

const STATUS_BADGE_CLASSES: Record<ParentLeadStatus, string> = {
  new: 'bg-amber-50 text-amber-800 border-amber-200',
  contacted: 'bg-blue-50 text-[#0D4E8B] border-blue-200',
  trial: 'bg-purple-50 text-purple-800 border-purple-200',
  subscribed: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  lost: 'bg-slate-100 text-slate-600 border-slate-200',
};

const REQUEST_TYPE_LABELS: Record<string, string> = {
  trial: 'حصة تجريبية',
  private: 'حصة خاصة',
  group: 'مجموعة',
  recommendation: 'ترشيح معلم',
};

const TRACK_LABELS: Record<string, string> = {
  school: 'المناهج الدراسية',
  quran: 'القرآن والتأسيس',
};

function buildGuardianWhatsAppUrl(
  lead: AdminParentLeadRecord,
  resolvedTutorName: string | null
): string {
  const cleanCountry = (lead.countryCode || '+20').replace(/[^0-9]/g, '') || '20';
  let cleanLocal = (lead.phone || '').replace(/[^0-9]/g, '').replace(/^0+/, '');
  if (cleanLocal.startsWith(cleanCountry) && cleanLocal.length > 9) {
    cleanLocal = cleanLocal.slice(cleanCountry.length).replace(/^0+/, '');
  }
  const fullNumber = `${cleanCountry}${cleanLocal}`;

  const reqLabel = REQUEST_TYPE_LABELS[lead.requestType] || lead.requestType;
  const tutorPart = resolvedTutorName ? ` مع ${resolvedTutorName}` : '';
  const refPart = lead.referenceCode ? ` (رقم الطلب: ${lead.referenceCode})` : '';

  const message = [
    `أهلاً بحضرتك أ. ${lead.guardianName} 👋`,
    `معك فريق تنسيق منصة شاطر كلاسيز بخصوص طلبكم (${reqLabel}${tutorPart})${refPart}.`,
    `يسعدنا التنسيق معكم لاختيار وتأكيد الموعد الأنسب لطفلكم.`,
  ].join('\n');

  return `https://wa.me/${fullNumber}?text=${encodeURIComponent(message)}`;
}

export const AdminParentLeadsView: React.FC<AdminParentLeadsViewProps> = ({
  tutorsList,
  onOpenBookingFromLead,
  onUpdateNewLeadsCount,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | ParentLeadStatus>('all');
  const [allLeadsForCounts, setAllLeadsForCounts] = useState<AdminParentLeadRecord[]>([]);
  const [displayedLeads, setDisplayedLeads] = useState<AdminParentLeadRecord[]>([]);
  const [sourceStats, setSourceStats] = useState<AdminParentLeadSourceStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Per-lead editable status & admin notes
  const [draftStatusById, setDraftStatusById] = useState<Record<string, ParentLeadStatus>>({});
  const [draftNotesById, setDraftNotesById] = useState<Record<string, string>>({});
  const [savingLeadId, setSavingLeadId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingLeadId, setDeletingLeadId] = useState<string | null>(null);
  const [copiedLeadId, setCopiedLeadId] = useState<string | null>(null);

  const tutorNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tutorsList) {
      map.set(t.id, `${t.honorific || ''} ${t.name}`.trim());
    }
    return map;
  }, [tutorsList]);

  const loadLeadsAndStats = async (activeFilter: 'all' | ParentLeadStatus = statusFilter) => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [allLeads, filteredLeads, stats] = await Promise.all([
        AdminService.getParentLeads(null, 200),
        activeFilter === 'all'
          ? Promise.resolve<AdminParentLeadRecord[] | null>(null)
          : AdminService.getParentLeads(activeFilter, 200),
        AdminService.getParentLeadStats(30).catch(() => [] as AdminParentLeadSourceStat[]),
      ]);

      const finalDisplayed = filteredLeads ?? allLeads;
      setAllLeadsForCounts(allLeads);
      setDisplayedLeads(finalDisplayed);
      setSourceStats(stats);

      const newCount = allLeads.filter((l) => l.status === 'new').length;
      onUpdateNewLeadsCount?.(newCount);

      // Sync editable state for displayed leads
      const nextStatusMap: Record<string, ParentLeadStatus> = {};
      const nextNotesMap: Record<string, string> = {};
      for (const item of allLeads) {
        nextStatusMap[item.id] = item.status;
        nextNotesMap[item.id] = item.adminNotes || '';
      }
      setDraftStatusById(nextStatusMap);
      setDraftNotesById(nextNotesMap);
    } catch (err: any) {
      setErrorMessage(err?.message || 'تعذر تحميل طلبات أولياء الأمور.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLeadsAndStats(statusFilter);
  }, [statusFilter]);

  const countsByStatus = useMemo(() => {
    const counts: Record<'all' | ParentLeadStatus, number> = {
      all: allLeadsForCounts.length,
      new: 0,
      contacted: 0,
      trial: 0,
      subscribed: 0,
      lost: 0,
    };
    for (const lead of allLeadsForCounts) {
      if (lead.status in counts) {
        counts[lead.status] += 1;
      }
    }
    return counts;
  }, [allLeadsForCounts]);

  const handleUpdateLead = async (lead: AdminParentLeadRecord) => {
    const newStatus = draftStatusById[lead.id] || lead.status;
    const newNotes = draftNotesById[lead.id] ?? lead.adminNotes ?? '';

    setSavingLeadId(lead.id);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await AdminService.updateParentLead(lead.id, newStatus, newNotes);
      setSuccessMessage(`تم تحديث حالة الطلب (${lead.referenceCode || lead.guardianName}) بنجاح.`);
      await loadLeadsAndStats(statusFilter);
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: any) {
      setErrorMessage(err?.message || 'فشل تحديث حالة الطلب.');
    } finally {
      setSavingLeadId(null);
    }
  };

  const handleDeleteLead = async (leadId: string) => {
    setDeletingLeadId(leadId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await AdminService.deleteParentLead(leadId);
      setConfirmDeleteId(null);
      setSuccessMessage('تم حذف الطلب بنجاح.');
      await loadLeadsAndStats(statusFilter);
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: any) {
      setErrorMessage(err?.message || 'فشل حذف الطلب.');
    } finally {
      setDeletingLeadId(null);
    }
  };

  const handleCopyLeadInfo = (lead: AdminParentLeadRecord, resolvedTutorName: string | null) => {
    const fullPhone = `${lead.countryCode || '+20'} ${lead.phone}`;
    const summary = [
      `رقم الطلب: ${lead.referenceCode || '—'}`,
      `ولي الأمر: ${lead.guardianName}`,
      `الهاتف: ${fullPhone}`,
      lead.childAge !== null ? `سن الطفل: ${lead.childAge}` : null,
      `نوع الطلب: ${REQUEST_TYPE_LABELS[lead.requestType] || lead.requestType}`,
      resolvedTutorName ? `المعلم: ${resolvedTutorName}` : null,
    ]
      .filter(Boolean)
      .join(' | ');

    navigator.clipboard?.writeText(summary);
    setCopiedLeadId(lead.id);
    setTimeout(() => setCopiedLeadId(null), 2000);
  };

  const filterButtons: Array<{ key: 'all' | ParentLeadStatus; label: string }> = [
    { key: 'all', label: 'الكل' },
    { key: 'new', label: STATUS_LABELS.new },
    { key: 'contacted', label: STATUS_LABELS.contacted },
    { key: 'trial', label: STATUS_LABELS.trial },
    { key: 'subscribed', label: STATUS_LABELS.subscribed },
    { key: 'lost', label: STATUS_LABELS.lost },
  ];

  return (
    <div className="space-y-6">
      {/* Feedback Banners */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm flex items-center gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="font-bold">{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold block">خطأ في العملية:</span>
            <span>{errorMessage}</span>
          </div>
        </div>
      )}

      {/* 6) ملخص المصادر (آخر 30 يومًا) */}
      <section className="bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#F0F6FD] text-[#0D4E8B] flex items-center justify-center shrink-0">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-['Cairo'] text-base sm:text-lg font-bold text-[#1F2A44]">
                ملخص المصادر والحملات (آخر 30 يومًا)
              </h2>
              <p className="text-xs text-[#64748B]">
                توزيع طلبات أولياء الأمور حسب المصدر والحملة وحالة المتابعة
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => loadLeadsAndStats(statusFilter)}
            disabled={isLoading}
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#1F2A44] text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>تحديث البيانات</span>
          </button>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[#E2E8F0]">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#475569] font-['Cairo'] font-bold">
              <tr>
                <th className="py-3 px-4">المصدر</th>
                <th className="py-3 px-4">الحملة</th>
                <th className="py-3 px-4 text-center">الطلبات</th>
                <th className="py-3 px-4 text-center">تواصلنا</th>
                <th className="py-3 px-4 text-center">حصة تجريبية</th>
                <th className="py-3 px-4 text-center">اشترك</th>
                <th className="py-3 px-4 text-center">ماكملش</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {sourceStats.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 px-4 text-center text-[#64748B]">
                    لا توجد بيانات مصادر مسجلة لآخر 30 يومًا حتى الآن.
                  </td>
                </tr>
              ) : (
                sourceStats.map((st, idx) => (
                  <tr key={`${st.source}-${st.campaign}-${idx}`} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-bold text-[#1F2A44]" dir="ltr">
                      {st.source || 'مباشر'}
                    </td>
                    <td className="py-3 px-4 text-[#475569]" dir="ltr">
                      {st.campaign || '—'}
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-[#0D4E8B]">
                      {st.totalLeads}
                    </td>
                    <td className="py-3 px-4 text-center font-semibold text-blue-700">
                      {st.contacted}
                    </td>
                    <td className="py-3 px-4 text-center font-semibold text-purple-700">
                      {st.trial}
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-emerald-700">
                      {st.subscribed}
                    </td>
                    <td className="py-3 px-4 text-center font-semibold text-slate-600">
                      {st.lost}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 5) قسم "طلبات جديدة" */}
      <section className="bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#0D4E8B] text-white flex items-center justify-center shrink-0">
              <Inbox className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-['Cairo'] text-base sm:text-lg font-bold text-[#1F2A44]">
                طلبات جديدة (طلبات أولياء الأمور)
              </h2>
              <p className="text-xs text-[#64748B]">
                متابعة طلبات الحصص التجريبية والخاصة والمجموعات وترشيح المعلمين
              </p>
            </div>
          </div>

          {/* Status Filter Pills with Counts */}
          <div className="flex flex-wrap items-center gap-1.5">
            {filterButtons.map((btn) => {
              const isSelected = statusFilter === btn.key;
              const count = countsByStatus[btn.key] ?? 0;
              return (
                <button
                  key={btn.key}
                  type="button"
                  onClick={() => setStatusFilter(btn.key)}
                  className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-['Cairo'] font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-[#0D4E8B] text-white shadow-2xs'
                      : 'bg-[#F8FAFC] text-[#475569] hover:bg-slate-100 border border-[#E2E8F0]'
                  }`}
                >
                  <span>{btn.label}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[11px] font-bold ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-slate-200/80 text-[#1F2A44]'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 text-center flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-7 h-7 text-[#0D4E8B] animate-spin" />
            <p className="text-xs sm:text-sm text-[#64748B]">جاري تحميل طلبات أولياء الأمور...</p>
          </div>
        ) : displayedLeads.length === 0 ? (
          <div className="py-12 text-center bg-[#F8FAFC] rounded-2xl border border-[#E2E8F0] space-y-2">
            <Inbox className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-xs sm:text-sm font-bold text-[#475569]">
              لا توجد طلبات مطابقة للحالة المختارة حاليًا.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {displayedLeads.map((lead) => {
              const resolvedTutorName =
                lead.tutorName || (lead.tutorId ? tutorNameById.get(lead.tutorId) || lead.tutorId : null);
              const whatsappUrl = buildGuardianWhatsAppUrl(lead, resolvedTutorName);
              const currentDraftStatus = draftStatusById[lead.id] || lead.status;
              const currentDraftNotes = draftNotesById[lead.id] ?? lead.adminNotes ?? '';
              const isSavingThis = savingLeadId === lead.id;
              const isConfirmingDelete = confirmDeleteId === lead.id;
              const isDeletingThis = deletingLeadId === lead.id;
              const cleanLocalPhone = (lead.phone || '').replace(/[^0-9]/g, '').replace(/^0+/, '');
              const normalizedPhoneForBooking = `${lead.countryCode || '+20'}${cleanLocalPhone}`;

              return (
                <div
                  key={lead.id}
                  className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC]/60 p-4 sm:p-5 space-y-4"
                >
                  {/* Top Row: Reference Code, Date, Status Badge, WhatsApp Opened Badge */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E2E8F0]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="px-2.5 py-1 rounded-lg bg-white border border-[#CBD5E1] font-mono text-xs font-bold text-[#0D4E8B]"
                        dir="ltr"
                      >
                        {lead.referenceCode || '—'}
                      </span>
                      <span
                        className={`px-2.5 py-1 rounded-lg border text-xs font-bold ${
                          STATUS_BADGE_CLASSES[lead.status] || STATUS_BADGE_CLASSES.new
                        }`}
                      >
                        {STATUS_LABELS[lead.status] || lead.status}
                      </span>
                      <span
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                          lead.whatsappOpened
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        فتح واتساب: {lead.whatsappOpened ? 'نعم' : 'لا'}
                      </span>
                    </div>

                    <span className="text-xs text-[#64748B]">
                      {new Date(lead.createdAt).toLocaleString('ar-EG')}
                    </span>
                  </div>

                  {/* Lead Details Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs bg-white p-3.5 rounded-xl border border-[#E2E8F0]">
                    <div>
                      <span className="text-[#64748B] block mb-0.5">اسم ولي الأمر:</span>
                      <span className="font-bold text-[#1F2A44] text-sm">{lead.guardianName}</span>
                    </div>

                    <div>
                      <span className="text-[#64748B] block mb-0.5">الهاتف:</span>
                      <span className="font-mono font-bold text-[#0D4E8B] text-sm" dir="ltr">
                        {lead.countryCode} {lead.phone}
                      </span>
                    </div>

                    <div>
                      <span className="text-[#64748B] block mb-0.5">سن الطفل:</span>
                      <span className="font-bold text-[#1F2A44]">
                        {lead.childAge !== null ? `${lead.childAge} سنوات` : 'غير محدد'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[#64748B] block mb-0.5">نوع الطلب:</span>
                      <span className="font-bold text-[#0D4E8B]">
                        {REQUEST_TYPE_LABELS[lead.requestType] || lead.requestType}
                      </span>
                    </div>

                    <div>
                      <span className="text-[#64748B] block mb-0.5">المعلم:</span>
                      <span className="font-bold text-[#1F2A44]">
                        {resolvedTutorName || 'غير محدد (ترشيح عام)'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[#64748B] block mb-0.5">المسار:</span>
                      <span className="font-bold text-[#1F2A44]">
                        {lead.track ? TRACK_LABELS[lead.track] || lead.track : 'غير محدد'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[#64748B] block mb-0.5">المصدر:</span>
                      <span className="font-bold text-[#1F2A44]" dir="ltr">
                        {lead.utmSource || lead.referrer || 'مباشر'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[#64748B] block mb-0.5">الحملة:</span>
                      <span className="font-bold text-[#1F2A44]" dir="ltr">
                        {lead.utmCampaign || '—'}
                      </span>
                    </div>
                  </div>

                  {/* Status + Admin Notes Update Row */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end">
                    <div className="md:col-span-3 space-y-1">
                      <label className="text-xs font-bold text-[#475569] block">تغيير الحالة:</label>
                      <select
                        value={currentDraftStatus}
                        onChange={(e) =>
                          setDraftStatusById((prev) => ({
                            ...prev,
                            [lead.id]: e.target.value as ParentLeadStatus,
                          }))
                        }
                        className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-[#CBD5E1] bg-white text-xs font-bold text-[#1F2A44] focus:outline-none focus:border-[#0D4E8B] cursor-pointer"
                      >
                        {(Object.keys(STATUS_LABELS) as ParentLeadStatus[]).map((stKey) => (
                          <option key={stKey} value={stKey}>
                            {STATUS_LABELS[stKey]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-6 space-y-1">
                      <label className="text-xs font-bold text-[#475569] block">
                        ملاحظات الإدارة:
                      </label>
                      <input
                        type="text"
                        value={currentDraftNotes}
                        onChange={(e) =>
                          setDraftNotesById((prev) => ({
                            ...prev,
                            [lead.id]: e.target.value,
                          }))
                        }
                        placeholder="اكتب ملاحظات المتابعة مع ولي الأمر..."
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[#CBD5E1] bg-white text-xs text-[#1F2A44] focus:outline-none focus:border-[#0D4E8B]"
                      />
                    </div>

                    <div className="md:col-span-3">
                      <button
                        type="button"
                        disabled={isSavingThis}
                        onClick={() => handleUpdateLead(lead)}
                        className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {isSavingThis ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        <span>حفظ التحديث</span>
                      </button>
                    </div>
                  </div>

                  {/* Action Buttons Row: WhatsApp, Convert to Booking, Copy Info, Delete */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-[#E2E8F0]">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* WhatsApp Direct Link to Guardian */}
                      <a
                        href={whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-[#25D366] hover:bg-[#1EBE5D] text-white text-xs font-bold transition-colors inline-flex items-center gap-1.5 shadow-2xs"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>واتساب</span>
                      </a>

                      {/* Convert to Booking Button */}
                      <button
                        type="button"
                        onClick={() =>
                          onOpenBookingFromLead({
                            leadId: lead.id,
                            referenceCode: lead.referenceCode,
                            guardianName: lead.guardianName,
                            phone: normalizedPhoneForBooking,
                            tutorId: lead.tutorId,
                            tutorName: resolvedTutorName,
                            requestType: lead.requestType,
                            courseOptionId: lead.courseOptionId,
                            quranAgeGroupId: lead.quranAgeGroupId,
                            quranLevelId: lead.quranLevelId,
                          })
                        }
                        className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <CalendarPlus className="w-4 h-4 text-amber-700" />
                        <span>تسجيل حجز</span>
                      </button>

                      {/* Copy Lead Summary Button */}
                      <button
                        type="button"
                        onClick={() => handleCopyLeadInfo(lead, resolvedTutorName)}
                        className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-[#475569] border border-[#CBD5E1] text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        {copiedLeadId === lead.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-700">تم نسخ البيانات</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>نسخ البيانات</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Delete Lead with Confirmation */}
                    <div>
                      {!isConfirmingDelete ? (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(lead.id)}
                          className="min-h-[44px] px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف الطلب</span>
                        </button>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl">
                          <span className="text-xs font-bold text-rose-900">
                            تأكيد حذف الطلب نهائيًا؟
                          </span>
                          <button
                            type="button"
                            disabled={isDeletingThis}
                            onClick={() => handleDeleteLead(lead.id)}
                            className="min-h-[38px] px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                          >
                            {isDeletingThis && <Loader2 className="w-3 h-3 animate-spin" />}
                            <span>تأكيد الحذف</span>
                          </button>
                          <button
                            type="button"
                            disabled={isDeletingThis}
                            onClick={() => setConfirmDeleteId(null)}
                            className="min-h-[38px] px-3 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold cursor-pointer"
                          >
                            إلغاء
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
