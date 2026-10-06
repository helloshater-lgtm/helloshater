import React, { useState, useEffect } from 'react';
import { TutorApplicationRecord, TutorApplicationStatus } from '../../types';
import { AdminService } from '../../services/adminService';
import {
  Search,
  Filter,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  FileText,
  User,
  Phone,
  Calendar,
  ChevronLeft,
  Loader2,
  RefreshCw,
  MessageCircle,
  BookOpen,
} from 'lucide-react';

interface AdminApplicationsListViewProps {
  onSelectApplication: (applicationId: string) => void;
  onUpdatePendingCount?: (count: number) => void;
}

export const AdminApplicationsListView: React.FC<AdminApplicationsListViewProps> = ({
  onSelectApplication,
  onUpdatePendingCount,
}) => {
  const [applications, setApplications] = useState<TutorApplicationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadApplications = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await AdminService.getApplications(
        statusFilter === 'all' ? undefined : statusFilter,
        searchQuery
      );
      setApplications(data);

      // Calculate pending count (submitted + needs_info)
      const pendingCount = data.filter(
        (a) => a.status === 'submitted' || a.status === 'pending_review' || a.status === 'needs_info'
      ).length;
      if (onUpdatePendingCount) {
        onUpdatePendingCount(pendingCount);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'تعذر تحميل طلبات الانضمام.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadApplications();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadApplications();
  };

  const getStatusBadge = (status: TutorApplicationStatus) => {
    switch (status) {
      case 'submitted':
      case 'pending_review':
        return (
          <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-[#0D4E8B] border border-blue-200 text-xs font-bold inline-flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            قيد المراجعة
          </span>
        );
      case 'needs_info':
        return (
          <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold inline-flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            مطلوب استكمال بيانات
          </span>
        );
      case 'approved':
        return (
          <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold inline-flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            مقبول
          </span>
        );
      case 'rejected':
        return (
          <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 text-xs font-bold inline-flex items-center gap-1">
            <XCircle className="w-3.5 h-3.5" />
            مرفوض
          </span>
        );
      case 'draft':
      default:
        return (
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold inline-flex items-center gap-1">
            <FileText className="w-3.5 h-3.5" />
            مسودة
          </span>
        );
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-[#E2E8F0] shadow-xs">
        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="البحث بالاسم أو كود الطلب أو الهاتف..."
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

        {/* Status Filters */}
        <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-xl overflow-x-auto self-start sm:self-auto max-w-full">
          {[
            { id: 'all', label: 'الكل' },
            { id: 'submitted', label: 'قيد المراجعة' },
            { id: 'needs_info', label: 'مطلوب استكمال' },
            { id: 'approved', label: 'مقبول' },
            { id: 'rejected', label: 'مرفوض' },
            { id: 'draft', label: 'مسودات' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === tab.id
                  ? 'bg-white text-[#0D4E8B] shadow-xs'
                  : 'text-[#64748B] hover:text-[#1F2A44]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Refresh button */}
        <button
          type="button"
          onClick={loadApplications}
          className="p-2 rounded-xl border border-[#E2E8F0] hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer shrink-0 self-end sm:self-auto"
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

      {/* Applications List */}
      {isLoading ? (
        <div className="bg-white p-12 rounded-2xl border border-[#E2E8F0] text-center flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-[#0D4E8B] animate-spin" />
          <p className="text-xs sm:text-sm text-[#64748B] font-medium">جاري تحميل طلبات المعلمين من قاعدة البيانات...</p>
        </div>
      ) : applications.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-[#E2E8F0] text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 mx-auto flex items-center justify-center text-slate-400">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="font-['Cairo'] text-base font-bold text-[#1F2A44]">
            {searchQuery ? 'لم يتم العثور على طلبات مطابقة للبحث' : 'لا توجد طلبات في هذا التصنيف'}
          </h3>
          <p className="text-xs text-[#64748B]">
            {searchQuery
              ? 'جرّب البحث باسم آخر أو كود طلب مختلف.'
              : 'ستظهر هنا طلبات المعلمين فور تقديمها عبر صفحة انضمام المعلمين.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {applications.map((app) => (
            <div
              key={app.id}
              className="bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-5 flex flex-col justify-between gap-4 hover:shadow-xs transition-shadow relative"
            >
              <div className="space-y-3">
                {/* Top Info */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-[#0D4E8B]/10 text-[#0D4E8B] flex items-center justify-center font-bold text-sm shrink-0">
                      {app.fullName.charAt(0) || 'م'}
                    </div>
                    <div>
                      <h4 className="font-['Cairo'] font-bold text-sm sm:text-base text-[#1F2A44]">
                        {app.fullName}
                      </h4>
                      <span className="text-[11px] text-[#94A3B8] font-mono block mt-0.5" dir="ltr">
                        {app.referenceCode}
                      </span>
                    </div>
                  </div>
                  {getStatusBadge(app.status)}
                </div>

                {/* Track and Degree */}
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
                      {app.academicDegree}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>سنوات الخبرة:</span>
                    <span className="text-[#1F2A44]">{app.experienceYears}</span>
                  </div>
                </div>

                {/* Contact and Date */}
                <div className="pt-2 border-t border-[#F1F5F9] flex items-center justify-between text-[11px] text-[#94A3B8]">
                  <span className="flex items-center gap-1 text-[#1F2A44]">
                    <Phone className="w-3.5 h-3.5 text-[#0D4E8B]" />
                    <span dir="ltr">{app.countryCode} {app.phone}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{new Date(app.createdAt).toLocaleDateString('ar-EG')}</span>
                  </span>
                </div>
              </div>

              {/* Action */}
              <div className="pt-3 border-t border-[#F1F5F9] flex items-center justify-between gap-2">
                <a
                  href={`https://wa.me/${app.countryCode.replace(/\+/g, '')}${app.phone.replace(/^0+/, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold transition-all flex items-center gap-1"
                  title="مراسلة عبر الواتساب"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>واتساب</span>
                </a>

                <button
                  type="button"
                  onClick={() => onSelectApplication(app.id)}
                  className="px-3 py-1.5 rounded-lg bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                >
                  <span>مراجعة الطلب</span>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
