import React, { useState } from 'react';
import { AdminTutorListItem } from '../../services/adminService';
import {
  Search,
  Plus,
  Eye,
  Edit3,
  Globe,
  GlobeLock,
  Calendar,
  BookOpen,
  User,
  Loader2,
  AlertCircle,
  Clock,
} from 'lucide-react';

interface AdminTutorsListViewProps {
  tutors: AdminTutorListItem[];
  isLoading: boolean;
  onRefresh: () => void;
  onEditTutor: (tutorId: string) => void;
  onNewTutor: () => void;
  onPreviewTutor: (tutorId: string) => void;
  onTogglePublish: (tutorId: string, currentStatus: boolean) => Promise<void>;
}

export const AdminTutorsListView: React.FC<AdminTutorsListViewProps> = ({
  tutors,
  isLoading,
  onRefresh,
  onEditTutor,
  onNewTutor,
  onPreviewTutor,
  onTogglePublish,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'unpublished'>('all');
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

  // Filter tutors based on search and status
  const filteredTutors = tutors.filter((tutor) => {
    const matchesSearch =
      tutor.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tutor.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tutor.headline.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (statusFilter === 'published') return tutor.isPublished;
    if (statusFilter === 'unpublished') return !tutor.isPublished;
    return true;
  });

  const handleToggle = async (tutor: AdminTutorListItem) => {
    setActionInProgressId(tutor.id);
    try {
      await onTogglePublish(tutor.id, tutor.isPublished);
    } finally {
      setActionInProgressId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-[#E2E8F0] shadow-xs">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="البحث بالاسم أو المعرف (ID) أو العنوان..."
            className="w-full pl-3 pr-9 py-2 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] focus:ring-2 focus:ring-[#0D4E8B]/10 outline-none transition-all placeholder:text-[#94A3B8]"
          />
          <Search className="w-4 h-4 text-[#94A3B8] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Status Filter Tabs (Buttons / Interactive Segmented Control) */}
        <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-xl self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-white text-[#0D4E8B] shadow-xs'
                : 'text-[#64748B] hover:text-[#1F2A44]'
            }`}
          >
            الكل ({tutors.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('published')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'published'
                ? 'bg-white text-emerald-700 shadow-xs'
                : 'text-[#64748B] hover:text-[#1F2A44]'
            }`}
          >
            منشور ({tutors.filter((t) => t.isPublished).length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('unpublished')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'unpublished'
                ? 'bg-white text-slate-800 shadow-xs'
                : 'text-[#64748B] hover:text-[#1F2A44]'
            }`}
          >
            غير منشور ({tutors.filter((t) => !t.isPublished).length})
          </button>
        </div>

        {/* Add Tutor Button */}
        <button
          type="button"
          onClick={onNewTutor}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs sm:text-sm font-bold shadow-xs transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة معلم جديد</span>
        </button>
      </div>

      {/* Tutors Grid / List */}
      {isLoading ? (
        <div className="bg-white p-12 rounded-2xl border border-[#E2E8F0] text-center flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-[#0D4E8B] animate-spin" />
          <p className="text-sm text-[#64748B] font-medium">جاري تحميل المعلمين من قاعدة البيانات...</p>
        </div>
      ) : filteredTutors.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-[#E2E8F0] text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 mx-auto flex items-center justify-center text-slate-400">
            <User className="w-6 h-6" />
          </div>
          <h3 className="font-['Cairo'] text-base font-bold text-[#1F2A44]">
            {searchQuery ? 'لم يتم العثور على نتائج مطابقة للبحث' : 'لا يوجد معلمون في هذه القائمة'}
          </h3>
          <p className="text-xs sm:text-sm text-[#64748B]">
            {searchQuery
              ? 'جرّب البحث باسم آخر أو تأكد من خيارات التصفية المختارة.'
              : 'يمكنك البدء بإضافة أول معلم الآن من زر "إضافة معلم جديد".'}
          </p>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-xs text-[#0D4E8B] font-bold hover:underline"
            >
              مسح البحث
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTutors.map((tutor) => {
            const isProcessing = actionInProgressId === tutor.id;
            return (
              <div
                key={tutor.id}
                className="bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-5 flex flex-col justify-between gap-4 hover:shadow-xs transition-shadow relative"
              >
                {/* Top: Avatar, Name, Status */}
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {tutor.avatarUrl ? (
                        <img
                          src={tutor.avatarUrl}
                          alt={tutor.name}
                          className="w-12 h-12 rounded-xl object-cover border border-[#E2E8F0] bg-slate-50 shrink-0"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src =
                              'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop&crop=faces';
                          }}
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-slate-100 border border-[#E2E8F0] flex items-center justify-center text-slate-400 shrink-0 font-bold text-base">
                          {tutor.name.charAt(0)}
                        </div>
                      )}
                      <div>
                        <h4 className="font-['Cairo'] font-bold text-sm sm:text-base text-[#1F2A44] leading-tight">
                          {tutor.honorific} {tutor.name}
                        </h4>
                        <span className="text-[11px] text-[#94A3B8] font-mono block mt-0.5" dir="ltr">
                          @{tutor.id}
                        </span>
                      </div>
                    </div>

                    {/* Status Dot & Text (Unboxed clean metadata per design constitution) */}
                    <div className="flex items-center gap-1.5 shrink-0 text-xs font-bold">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          tutor.isPublished ? 'bg-emerald-500' : 'bg-slate-400'
                        }`}
                      />
                      <span className={tutor.isPublished ? 'text-emerald-700' : 'text-slate-500'}>
                        {tutor.isPublished ? 'منشور' : 'غير منشور'}
                      </span>
                    </div>
                  </div>

                  {/* Headline */}
                  <p className="text-xs text-[#535E7B] mt-3 line-clamp-2 leading-relaxed">
                    {tutor.headline}
                  </p>

                  {/* Pricing and Counters (Clean unboxed metadata with separators) */}
                  <div className="mt-3 pt-3 border-t border-[#F1F5F9] space-y-1.5 text-xs text-[#64748B]">
                    <div className="flex items-center justify-between">
                      <span>سعر الحصة:</span>
                      <span className="font-bold text-[#1F2A44]">
                        {tutor.hourlyRateMin} - {tutor.hourlyRateMax} {tutor.currency}
                        <span className="text-[#94A3B8] font-normal"> / {tutor.sessionDurationMinutes} د</span>
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px]">
                      <span className="flex items-center gap-1">
                        <BookOpen className="w-3.5 h-3.5 text-[#0D4E8B]" />
                        <span>التخصصات المعتمدة: {tutor.offeringsCount}</span>
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                        <span>المواعيد المتاحة: {tutor.availableSlotsCount}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions Bar */}
                <div className="pt-3 border-t border-[#F1F5F9] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {/* Edit button */}
                    <button
                      type="button"
                      onClick={() => onEditTutor(tutor.id)}
                      className="px-3 py-1.5 rounded-lg bg-[#F0F6FD] hover:bg-[#E2EFFD] text-[#0D4E8B] text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>تعديل</span>
                    </button>

                    {/* Preview button */}
                    <button
                      type="button"
                      onClick={() => onPreviewTutor(tutor.id)}
                      className="px-3 py-1.5 rounded-lg bg-[#F8F9FC] hover:bg-slate-100 text-[#475569] text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                      title="معاينة الملف كما يراه أولياء الأمور"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>معاينة</span>
                    </button>
                  </div>

                  {/* Publish / Unpublish Toggle */}
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => handleToggle(tutor)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 ${
                      tutor.isPublished
                        ? 'bg-slate-100 text-slate-700 hover:bg-rose-50 hover:text-rose-700'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs'
                    }`}
                  >
                    {isProcessing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : tutor.isPublished ? (
                      <>
                        <GlobeLock className="w-3.5 h-3.5" />
                        <span>إيقاف النشر</span>
                      </>
                    ) : (
                      <>
                        <Globe className="w-3.5 h-3.5" />
                        <span>نشر بالموقع</span>
                      </>
                    )}
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
