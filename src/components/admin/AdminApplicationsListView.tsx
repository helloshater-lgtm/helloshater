import React, { useState, useEffect, useMemo } from 'react';
import { TutorApplicationRecord, TutorApplicationStatus } from '../../types';
import { AdminService } from '../../services/adminService';
import {
  resolveTutorApplicationStatus,
  evaluateTutorApplicationCompleteness,
} from '../../utils/formatters';
import {
  Search,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  FileText,
  Phone,
  Mail,
  Calendar,
  ChevronLeft,
  Loader2,
  RefreshCw,
  MessageCircle,
  Send,
} from 'lucide-react';

const WHATSAPP_DRAFT_REMINDER_TEXT =
  'السلام عليكم، طلب انضمامك إلى شاطر كلاسيز ما زال غير مُرسل. يرجى إكمال البيانات والضغط على إرسال الطلب حتى نتمكن من مراجعته.';

interface AdminApplicationsListViewProps {
  onSelectApplication: (applicationId: string) => void;
  onUpdatePendingCount?: (count: number) => void;
}

export const AdminApplicationsListView: React.FC<AdminApplicationsListViewProps> = ({
  onSelectApplication,
  onUpdatePendingCount,
}) => {
  const [allApplications, setAllApplications] = useState<TutorApplicationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Inline decision state for submitted cards
  const [activeCardDecision, setActiveCardDecision] = useState<{
    appId: string;
    type: 'approve' | 'reject';
    slug: string;
    notes: string;
  } | null>(null);
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);
  const [cardDecisionError, setCardDecisionError] = useState<string | null>(null);

  const loadApplications = async (silent = false) => {
    if (!silent) {
      setIsLoading(true);
    }
    setErrorMessage(null);
    try {
      const data = await AdminService.getApplications(undefined);
      setAllApplications(data);

      // Calculate pending count strictly from reviewable submitted statuses (status !== 'draft')
      const pendingCount = data.filter(
        (a) => a.status !== 'draft' && resolveTutorApplicationStatus(a.status).isReviewableByAdmin
      ).length;
      if (onUpdatePendingCount) {
        onUpdatePendingCount(pendingCount);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'تعذر تحميل طلبات الانضمام.');
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    loadApplications();
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
  };

  // Filter by search query first so counts reflect current search (or all when empty)
  const searchFilteredApplications = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allApplications;
    return allApplications.filter((app) => {
      const nameMatch = (app.fullName || '').toLowerCase().includes(q);
      const phoneMatch = (app.phone || '').toLowerCase().includes(q);
      const emailMatch = (app.email || '').toLowerCase().includes(q);
      const refMatch = (app.referenceCode || '').toLowerCase().includes(q);
      return nameMatch || phoneMatch || emailMatch || refMatch;
    });
  }, [allApplications, searchQuery]);

  // Compute tab counts: non-draft tabs only count status !== 'draft'; 'draft' tab counts status === 'draft'
  const tabCounts = useMemo(() => {
    const submittedApps = searchFilteredApplications.filter(
      (a) => a.status !== 'draft' && resolveTutorApplicationStatus(a.status).canonicalKey !== 'draft'
    );
    const draftApps = searchFilteredApplications.filter(
      (a) => a.status === 'draft' || resolveTutorApplicationStatus(a.status).canonicalKey === 'draft'
    );

    return {
      all: submittedApps.length,
      submitted: submittedApps.filter(
        (a) => resolveTutorApplicationStatus(a.status).canonicalKey === 'submitted'
      ).length,
      needs_info: submittedApps.filter(
        (a) => resolveTutorApplicationStatus(a.status).canonicalKey === 'needs_info'
      ).length,
      approved: submittedApps.filter(
        (a) => resolveTutorApplicationStatus(a.status).canonicalKey === 'approved'
      ).length,
      rejected: submittedApps.filter(
        (a) => resolveTutorApplicationStatus(a.status).canonicalKey === 'rejected'
      ).length,
      draft: draftApps.length,
    };
  }, [searchFilteredApplications]);

  // Filter applications for the active tab
  const displayedApplications = useMemo(() => {
    if (statusFilter === 'draft') {
      return searchFilteredApplications.filter(
        (a) => a.status === 'draft' || resolveTutorApplicationStatus(a.status).canonicalKey === 'draft'
      );
    }

    // All other tabs strictly exclude status === 'draft'
    const nonDrafts = searchFilteredApplications.filter(
      (a) => a.status !== 'draft' && resolveTutorApplicationStatus(a.status).canonicalKey !== 'draft'
    );

    if (statusFilter === 'all') {
      return nonDrafts;
    }

    return nonDrafts.filter(
      (a) => resolveTutorApplicationStatus(a.status).canonicalKey === statusFilter
    );
  }, [searchFilteredApplications, statusFilter]);

  const handleOpenCardDecision = (app: TutorApplicationRecord, type: 'approve' | 'reject') => {
    setCardDecisionError(null);
    setSuccessMessage(null);
    setActiveCardDecision({
      appId: app.id,
      type,
      slug: `tutor-${Math.floor(1000 + Math.random() * 9000)}`,
      notes: '',
    });
  };

  const handleExecuteCardDecision = async () => {
    if (!activeCardDecision) return;
    setCardDecisionError(null);
    setErrorMessage(null);
    setSuccessMessage(null);

    if (activeCardDecision.type === 'approve') {
      const cleanSlug = activeCardDecision.slug.trim().toLowerCase();
      if (!cleanSlug || !/^[a-z0-9-]+$/.test(cleanSlug)) {
        setCardDecisionError('يرجى إدخال معرف صالح للمعلم (Slug) بالإنجليزية والأرقام والشرطات فقط.');
        return;
      }
    } else if (!activeCardDecision.notes.trim()) {
      setCardDecisionError('يرجى كتابة سبب الرفض قبل تأكيد القرار.');
      return;
    }

    setIsSubmittingDecision(true);
    try {
      if (activeCardDecision.type === 'approve') {
        await AdminService.approveApplication(
          activeCardDecision.appId,
          activeCardDecision.slug.trim().toLowerCase(),
          activeCardDecision.notes.trim() || undefined
        );
        setSuccessMessage('تم قبول الطلب واعتماد المعلم بنجاح وتحديث القائمة فوراً.');
      } else {
        await AdminService.reviewApplication(
          activeCardDecision.appId,
          'rejected',
          activeCardDecision.notes.trim()
        );
        setSuccessMessage('تم رفض الطلب وتحديث القائمة فوراً.');
      }
      setActiveCardDecision(null);
      await loadApplications(true);
    } catch (err: any) {
      setCardDecisionError(err?.message || 'فشل تنفيذ القرار الإداري.');
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  const getStatusBadge = (status: TutorApplicationStatus | string | null | undefined) => {
    const info = resolveTutorApplicationStatus(status);
    return (
      <span
        className={`px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1 ${info.badgeClassName}`}
      >
        {info.canonicalKey === 'submitted' && <Clock className="w-3.5 h-3.5" />}
        {info.canonicalKey === 'needs_info' && <AlertCircle className="w-3.5 h-3.5" />}
        {info.canonicalKey === 'approved' && <CheckCircle2 className="w-3.5 h-3.5" />}
        {info.canonicalKey === 'rejected' && <XCircle className="w-3.5 h-3.5" />}
        {(info.canonicalKey === 'draft' || info.canonicalKey === 'unknown') && (
          <FileText className="w-3.5 h-3.5" />
        )}
        {info.listBadgeLabel}
      </span>
    );
  };

  const tabs = [
    { id: 'all', label: 'الكل', count: tabCounts.all },
    { id: 'submitted', label: 'قيد المراجعة', count: tabCounts.submitted },
    { id: 'needs_info', label: 'مطلوب استكمال', count: tabCounts.needs_info },
    { id: 'approved', label: 'مقبول', count: tabCounts.approved },
    { id: 'rejected', label: 'مرفوض', count: tabCounts.rejected },
    { id: 'draft', label: 'لم يكتمل', count: tabCounts.draft },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Filter and Search Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-[#E2E8F0] shadow-xs">
        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="البحث بالاسم أو البريد أو كود الطلب أو الهاتف..."
            className="w-full pl-10 pr-9 py-2 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none"
          />
          <Search className="w-4 h-4 text-[#94A3B8] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <button
            type="submit"
            className="absolute left-2 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-[#0D4E8B] text-white text-[11px] font-bold cursor-pointer"
          >
            بحث
          </button>
        </form>

        {/* Status Filters with Counts */}
        <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-xl overflow-x-auto self-start lg:self-auto max-w-full">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setStatusFilter(tab.id);
                setActiveCardDecision(null);
                setCardDecisionError(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                statusFilter === tab.id
                  ? 'bg-white text-[#0D4E8B] shadow-xs'
                  : 'text-[#64748B] hover:text-[#1F2A44]'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
                  statusFilter === tab.id
                    ? 'bg-[#EBF3FC] text-[#0D4E8B]'
                    : 'bg-slate-200/80 text-slate-600'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Refresh button */}
        <button
          type="button"
          onClick={() => loadApplications()}
          className="p-2 rounded-xl border border-[#E2E8F0] hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer shrink-0 self-end lg:self-auto"
          title="تحديث القائمة"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#0D4E8B]' : ''}`} />
        </button>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm flex items-start gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Applications List */}
      {isLoading ? (
        <div className="bg-white p-12 rounded-2xl border border-[#E2E8F0] text-center flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-[#0D4E8B] animate-spin" />
          <p className="text-xs sm:text-sm text-[#64748B] font-medium">
            جاري تحميل طلبات المعلمين من قاعدة البيانات...
          </p>
        </div>
      ) : displayedApplications.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-[#E2E8F0] text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 mx-auto flex items-center justify-center text-slate-400">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="font-['Cairo'] text-base font-bold text-[#1F2A44]">
            {searchQuery ? 'لم يتم العثور على طلبات مطابقة للبحث' : 'لا توجد طلبات في هذا التصنيف'}
          </h3>
          <p className="text-xs text-[#64748B]">
            {searchQuery
              ? 'جرّب البحث باسم آخر أو بريد إلكتروني أو كود طلب مختلف.'
              : statusFilter === 'draft'
              ? 'لا توجد طلبات غير مكتملة حالياً.'
              : 'ستظهر هنا طلبات المعلمين المرسلة للمراجعة.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedApplications.map((app) => {
            const statusInfo = resolveTutorApplicationStatus(app.status);
            const isDraft = app.status === 'draft' || statusInfo.canonicalKey === 'draft';
            const completeness = isDraft ? evaluateTutorApplicationCompleteness(app) : null;
            const hasPhone = Boolean(app.phone && app.phone.trim());
            const cleanPhone = hasPhone
              ? `${(app.countryCode || '+20').replace(/\+/g, '')}${app.phone.replace(/^0+/, '')}`
              : '';
            const draftReminderWhatsAppUrl = hasPhone
              ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(WHATSAPP_DRAFT_REMINDER_TEXT)}`
              : '';
            const isCardDecisionOpen = activeCardDecision?.appId === app.id;

            return (
              <div
                key={app.id}
                className="bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-5 flex flex-col justify-between gap-4 hover:shadow-xs transition-shadow relative"
              >
                <div className="space-y-3">
                  {/* Top Info */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#0D4E8B]/10 text-[#0D4E8B] flex items-center justify-center font-bold text-sm shrink-0">
                        {(app.fullName || 'م').charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-['Cairo'] font-bold text-sm sm:text-base text-[#1F2A44] truncate">
                          {app.fullName || 'بدون اسم بعد'}
                        </h4>
                        <span className="text-[11px] text-[#94A3B8] font-mono block mt-0.5" dir="ltr">
                          {app.referenceCode || '—'}
                        </span>
                      </div>
                    </div>
                    {getStatusBadge(app.status)}
                  </div>

                  {isDraft ? (
                    /* Incomplete Application Card Details */
                    <div className="space-y-2.5 text-xs pt-2 border-t border-[#F1F5F9]">
                      {/* Contact details if present */}
                      <div className="space-y-1 text-[#64748B]">
                        {app.email && (
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1 shrink-0">
                              <Mail className="w-3.5 h-3.5 text-[#0D4E8B]" />
                              <span>البريد:</span>
                            </span>
                            <span className="font-mono text-[#1F2A44] truncate" dir="ltr">
                              {app.email}
                            </span>
                          </div>
                        )}
                        {hasPhone ? (
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1 shrink-0">
                              <Phone className="w-3.5 h-3.5 text-[#0D4E8B]" />
                              <span>الهاتف:</span>
                            </span>
                            <span className="font-mono text-[#1F2A44]" dir="ltr">
                              {app.countryCode} {app.phone}
                            </span>
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-400">رقم الهاتف غير مسجل بعد</div>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1 shrink-0">
                            <Calendar className="w-3.5 h-3.5 text-[#64748B]" />
                            <span>آخر تحديث:</span>
                          </span>
                          <span className="text-[#1F2A44]">
                            {new Date(app.updatedAt || app.createdAt).toLocaleString('ar-EG')}
                          </span>
                        </div>
                      </div>

                      {/* Missing Required Fields */}
                      <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/80 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-bold text-amber-900">
                          <span>الحقول المطلوبة الناقصة:</span>
                          <span>{completeness?.progressLabelAr}</span>
                        </div>
                        {completeness && completeness.missingFields.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {completeness.missingFields.map((field) => (
                              <span
                                key={field.key}
                                className="px-2 py-0.5 rounded-md bg-white border border-amber-200 text-amber-900 text-[10px] font-bold"
                              >
                                {field.label}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-amber-800">
                            جميع الحقول معبأة — لم يضغط المعلم على «إرسال الطلب» بعد.
                          </p>
                        )}
                      </div>

                      {/* Disabled Approve & Reject Buttons with explanation */}
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled
                            className="flex-1 py-1.5 px-2.5 rounded-lg bg-slate-200 text-slate-500 text-[11px] font-bold cursor-not-allowed opacity-70"
                          >
                            قبول
                          </button>
                          <button
                            type="button"
                            disabled
                            className="flex-1 py-1.5 px-2.5 rounded-lg bg-slate-200 text-slate-500 text-[11px] font-bold cursor-not-allowed opacity-70"
                          >
                            رفض
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-600 text-center font-medium">
                          لا يمكن اتخاذ قرار قبل أن يرسل المعلم طلبه.
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* Submitted Application Card Details */
                    <>
                      <div className="space-y-1 text-xs text-[#64748B] pt-2 border-t border-[#F1F5F9]">
                        <div className="flex items-center justify-between">
                          <span>المسار التدريسي:</span>
                          <span className="font-bold text-[#1F2A44]">
                            {app.track === 'school' ? 'المناهج المدرسية' : 'القرآن والتأسيس'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>المؤهل:</span>
                          <span className="text-[#1F2A44] truncate max-w-[180px]" title={app.academicDegree}>
                            {app.academicDegree || '—'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>سنوات الخبرة:</span>
                          <span className="text-[#1F2A44]">{app.experienceYears || '—'}</span>
                        </div>
                      </div>

                      {/* Contact and Date */}
                      <div className="pt-2 border-t border-[#F1F5F9] flex items-center justify-between text-[11px] text-[#94A3B8]">
                        <span className="flex items-center gap-1 text-[#1F2A44]">
                          <Phone className="w-3.5 h-3.5 text-[#0D4E8B]" />
                          <span dir="ltr">
                            {app.countryCode} {app.phone}
                          </span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{new Date(app.updatedAt || app.createdAt).toLocaleDateString('ar-EG')}</span>
                        </span>
                      </div>

                      {/* Quick Approve / Reject Actions for Reviewable Submitted Applications */}
                      {statusInfo.isReviewableByAdmin && (
                        <div className="pt-2 border-t border-[#F1F5F9] space-y-2">
                          {!isCardDecisionOpen ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenCardDecision(app, 'approve')}
                                className="flex-1 py-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer"
                              >
                                قبول
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenCardDecision(app, 'reject')}
                                className="flex-1 py-1.5 px-2.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-xs font-bold transition-colors cursor-pointer"
                              >
                                رفض
                              </button>
                            </div>
                          ) : (
                            <div className="p-3 rounded-xl bg-[#F8FAFD] border border-[#CBD5E1] space-y-2">
                              <div className="text-xs font-bold text-[#1F2A44]">
                                {activeCardDecision.type === 'approve'
                                  ? 'تأكيد قبول الطلب (إنشاء ملف غير منشور)'
                                  : 'تأكيد رفض الطلب'}
                              </div>

                              {activeCardDecision.type === 'approve' && (
                                <div className="space-y-1">
                                  <label className="text-[11px] font-bold text-[#64748B] block">
                                    معرف المعلم (Slug):
                                  </label>
                                  <input
                                    type="text"
                                    dir="ltr"
                                    value={activeCardDecision.slug}
                                    onChange={(e) =>
                                      setActiveCardDecision({
                                        ...activeCardDecision,
                                        slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                                      })
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-[#CBD5E1] text-xs font-mono bg-white"
                                  />
                                </div>
                              )}

                              <div className="space-y-1">
                                <label className="text-[11px] font-bold text-[#64748B] block">
                                  {activeCardDecision.type === 'approve'
                                    ? 'ملاحظات إدارية (اختياري):'
                                    : 'سبب الرفض (مطلوب):'}
                                </label>
                                <textarea
                                  rows={2}
                                  value={activeCardDecision.notes}
                                  onChange={(e) =>
                                    setActiveCardDecision({
                                      ...activeCardDecision,
                                      notes: e.target.value,
                                    })
                                  }
                                  placeholder="اكتب الملاحظات هنا..."
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-[#CBD5E1] text-xs bg-white"
                                />
                              </div>

                              {cardDecisionError && (
                                <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] flex items-start gap-1.5">
                                  <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                                  <span>{cardDecisionError}</span>
                                </div>
                              )}

                              <div className="flex items-center gap-1.5 pt-1">
                                <button
                                  type="button"
                                  disabled={isSubmittingDecision}
                                  onClick={handleExecuteCardDecision}
                                  className={`flex-1 py-1.5 px-2.5 rounded-lg text-white text-xs font-bold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50 ${
                                    activeCardDecision.type === 'approve'
                                      ? 'bg-emerald-600 hover:bg-emerald-700'
                                      : 'bg-rose-600 hover:bg-rose-700'
                                  }`}
                                >
                                  {isSubmittingDecision ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Send className="w-3.5 h-3.5" />
                                  )}
                                  <span>تأكيد</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isSubmittingDecision}
                                  onClick={() => {
                                    setActiveCardDecision(null);
                                    setCardDecisionError(null);
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg border border-[#CBD5E1] bg-white text-slate-600 text-xs font-bold cursor-pointer"
                                >
                                  إلغاء
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Card Bottom Actions */}
                <div className="pt-3 border-t border-[#F1F5F9] flex items-center justify-between gap-2">
                  {isDraft ? (
                    hasPhone ? (
                      <a
                        href={draftReminderWhatsAppUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition-all flex items-center gap-1.5"
                        title="إرسال تذكير يدوي عبر واتساب"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                        <span>تذكير عبر واتساب</span>
                      </a>
                    ) : (
                      <span className="text-[11px] text-slate-400">بدون هاتف للتذكير</span>
                    )
                  ) : hasPhone ? (
                    <a
                      href={`https://wa.me/${cleanPhone}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold transition-all flex items-center gap-1"
                      title="مراسلة عبر الواتساب"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>واتساب</span>
                    </a>
                  ) : (
                    <span />
                  )}

                  <button
                    type="button"
                    onClick={() => onSelectApplication(app.id)}
                    className="px-3 py-1.5 rounded-lg bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                  >
                    <span>{isDraft ? 'عرض التفاصيل' : 'مراجعة الطلب'}</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

