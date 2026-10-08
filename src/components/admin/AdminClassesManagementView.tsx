import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Plus,
  Loader2,
  Filter,
  RefreshCw,
  Phone,
  User,
  ShieldCheck,
  FileCheck2,
  MessageSquare,
  Search,
  BookOpen,
} from 'lucide-react';
import { AdminService } from '../../services/adminService';

interface AdminClassesManagementViewProps {
  onNotify?: (message: string, type: 'success' | 'error') => void;
}

export const AdminClassesManagementView: React.FC<AdminClassesManagementViewProps> = ({ onNotify }) => {
  const [subTab, setSubTab] = useState<'private_bookings' | 'group_enrollments' | 'group_reviews'>('group_reviews');
  const [isLoading, setIsLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Data states
  const [privateBookings, setPrivateBookings] = useState<any[]>([]);
  const [groupEnrollments, setGroupEnrollments] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);

  // Filter states
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modals
  const [isNewBookingModalOpen, setIsNewBookingModalOpen] = useState(false);
  const [isNewEnrollmentModalOpen, setIsNewEnrollmentModalOpen] = useState(false);
  const [reviewModalGroup, setReviewModalGroup] = useState<any | null>(null);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | 'needs_revision'>('approve');
  const [reviewNotes, setReviewNotes] = useState('');

  // Cancel reason modal
  const [cancelModalItem, setCancelModalItem] = useState<{ type: 'private' | 'group'; id: string } | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelReopenSlot, setCancelReopenSlot] = useState(true);

  // New Private Booking form
  const [newBookingSlotId, setNewBookingSlotId] = useState('');
  const [newBookingStudentName, setNewBookingStudentName] = useState('');
  const [newBookingGuardianName, setNewBookingGuardianName] = useState('');
  const [newBookingPhone, setNewBookingPhone] = useState('');
  const [newBookingAgreedPrice, setNewBookingAgreedPrice] = useState<number>(150);
  const [newBookingNotes, setNewBookingNotes] = useState('');

  // New Group Enrollment form
  const [newEnrollmentGroupId, setNewEnrollmentGroupId] = useState('');
  const [newEnrollmentStudentName, setNewEnrollmentStudentName] = useState('');
  const [newEnrollmentGuardianName, setNewEnrollmentGuardianName] = useState('');
  const [newEnrollmentPhone, setNewEnrollmentPhone] = useState('');
  const [newEnrollmentAgreedPrice, setNewEnrollmentAgreedPrice] = useState<number>(300);
  const [newEnrollmentPriceType, setNewEnrollmentPriceType] = useState<'per_session' | 'full_package'>('full_package');
  const [newEnrollmentNotes, setNewEnrollmentNotes] = useState('');

  const loadData = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      if (subTab === 'private_bookings') {
        const data = await AdminService.getPrivateBookings();
        setPrivateBookings(data);
      } else if (subTab === 'group_enrollments') {
        const data = await AdminService.getGroupEnrollments();
        setGroupEnrollments(data);
      } else if (subTab === 'group_reviews') {
        const data = await AdminService.getGroups();
        setGroups(data);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل تحميل البيانات.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    setStatusFilter('all');
  }, [subTab]);

  // Handle Private Booking Confirmation
  const handleConfirmPrivate = async (id: string) => {
    setActionLoadingId(id);
    setErrorMessage(null);
    try {
      await AdminService.confirmPrivateBooking(id);
      setSuccessMessage('تم تأكيد حجز الحصة الخاصة بنجاح وقفل الموعد.');
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل تأكيد الحجز.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Private Booking Cancellation
  const handleCancelPrivate = async () => {
    if (!cancelModalItem) return;
    setActionLoadingId(cancelModalItem.id);
    setErrorMessage(null);
    try {
      await AdminService.cancelPrivateBooking(cancelModalItem.id, cancelReason, cancelReopenSlot);
      setSuccessMessage('تم إلغاء الحجز وتحديث السجل.');
      setCancelModalItem(null);
      setCancelReason('');
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل إلغاء الحجز.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Group Enrollment Confirmation
  const handleConfirmEnrollment = async (id: string) => {
    setActionLoadingId(id);
    setErrorMessage(null);
    try {
      await AdminService.confirmGroupEnrollment(id);
      setSuccessMessage('تم تأكيد اشتراك الطالب في المجموعة بنجاح.');
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل تأكيد الاشتراك.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Group Enrollment Cancellation
  const handleCancelEnrollment = async () => {
    if (!cancelModalItem) return;
    setActionLoadingId(cancelModalItem.id);
    setErrorMessage(null);
    try {
      await AdminService.cancelGroupEnrollment(cancelModalItem.id, cancelReason);
      setSuccessMessage('تم إلغاء الاشتراك وإعادة المقعد المتاح.');
      setCancelModalItem(null);
      setCancelReason('');
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل إلغاء الاشتراك.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Group Review Action
  const handleReviewGroup = async () => {
    if (!reviewModalGroup) return;
    setActionLoadingId(reviewModalGroup.id);
    setErrorMessage(null);
    try {
      await AdminService.reviewGroup(reviewModalGroup.id, reviewAction, reviewNotes);
      setSuccessMessage(`تم تنفيذ قرار المراجعة (${reviewAction === 'approve' ? 'اعتماد' : reviewAction === 'reject' ? 'رفض' : 'طلب تعديل'}) بنجاح.`);
      setReviewModalGroup(null);
      setReviewNotes('');
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل تنفيذ قرار مراجعة المجموعة.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Create Private Booking from WhatsApp
  const handleCreatePrivateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBookingSlotId || !newBookingStudentName || !newBookingPhone) {
      setErrorMessage('يرجى ملء جميع الحقول المطلوبة (معرف الموعد، اسم الطالب، الهاتف).');
      return;
    }
    setActionLoadingId('new_booking');
    setErrorMessage(null);
    try {
      const res = await AdminService.createPrivateBooking({
        slotId: newBookingSlotId.trim(),
        studentName: newBookingStudentName.trim(),
        guardianName: newBookingGuardianName.trim() || newBookingStudentName.trim(),
        phoneNumber: newBookingPhone.trim(),
        agreedPrice: newBookingAgreedPrice,
        notes: newBookingNotes.trim() || undefined,
      });

      if (res.alreadyExists) {
        setSuccessMessage('تم العثور على طلب الحجز مسبقاً (إعادة طلب مطابقة).');
      } else {
        setSuccessMessage('تم تسجيل طلب حجز الحصة الخاصة بنجاح.');
      }
      setIsNewBookingModalOpen(false);
      setNewBookingSlotId('');
      setNewBookingStudentName('');
      setNewBookingGuardianName('');
      setNewBookingPhone('');
      setNewBookingNotes('');
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل إنشاء طلب الحجز.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Create Group Enrollment from WhatsApp
  const handleCreateGroupEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEnrollmentGroupId || !newEnrollmentStudentName || !newEnrollmentPhone) {
      setErrorMessage('يرجى ملء جميع الحقول المطلوبة (معرف المجموعة، اسم الطالب، الهاتف).');
      return;
    }
    setActionLoadingId('new_enrollment');
    setErrorMessage(null);
    try {
      const res = await AdminService.createGroupEnrollment({
        groupId: newEnrollmentGroupId.trim(),
        studentName: newEnrollmentStudentName.trim(),
        guardianName: newEnrollmentGuardianName.trim() || newEnrollmentStudentName.trim(),
        phoneNumber: newEnrollmentPhone.trim(),
        agreedPrice: newEnrollmentAgreedPrice,
        priceType: newEnrollmentPriceType,
        notes: newEnrollmentNotes.trim() || undefined,
      });

      if (res.alreadyExists) {
        setSuccessMessage('تم العثور على اشتراك مسجل مسبقاً لهذا الطالب.');
      } else {
        setSuccessMessage('تم تسجيل طلب الاشتراك في المجموعة بنجاح.');
      }
      setIsNewEnrollmentModalOpen(false);
      setNewEnrollmentGroupId('');
      setNewEnrollmentStudentName('');
      setNewEnrollmentGuardianName('');
      setNewEnrollmentPhone('');
      setNewEnrollmentNotes('');
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'فشل تسجيل الاشتراك.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Filtered lists
  const filteredPrivateBookings = privateBookings.filter((b) => {
    const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
    const matchesSearch =
      searchTerm === '' ||
      b.student_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.guardian_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.phone_number?.includes(searchTerm) ||
      b.tutor_name?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const filteredGroupEnrollments = groupEnrollments.filter((e) => {
    const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
    const matchesSearch =
      searchTerm === '' ||
      e.student_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.group_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.phone_number?.includes(searchTerm) ||
      e.tutor_name?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const filteredGroups = groups.filter((g) => {
    const matchesStatus = statusFilter === 'all' || g.review_status === statusFilter;
    const matchesSearch =
      searchTerm === '' ||
      g.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      g.tutor_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      g.specialization_label?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Sub-tabs header */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] p-3 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setSubTab('group_reviews')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
              subTab === 'group_reviews'
                ? 'bg-[#0D4E8B] text-white shadow-xs'
                : 'text-[#64748B] hover:text-[#1F2A44] hover:bg-slate-100'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>مراجعة المجموعات</span>
            {groups.filter((g) => g.review_status === 'pending_review').length > 0 && (
              <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                {groups.filter((g) => g.review_status === 'pending_review').length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSubTab('private_bookings')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
              subTab === 'private_bookings'
                ? 'bg-[#0D4E8B] text-white shadow-xs'
                : 'text-[#64748B] hover:text-[#1F2A44] hover:bg-slate-100'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>حجوزات الحصص الخاصة (1:1)</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('group_enrollments')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
              subTab === 'group_enrollments'
                ? 'bg-[#0D4E8B] text-white shadow-xs'
                : 'text-[#64748B] hover:text-[#1F2A44] hover:bg-slate-100'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>اشتراكات المجموعات</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {subTab === 'private_bookings' && (
            <button
              type="button"
              onClick={() => setIsNewBookingModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>تسجيل حجز خاص (واتساب)</span>
            </button>
          )}

          {subTab === 'group_enrollments' && (
            <button
              type="button"
              onClick={() => setIsNewEnrollmentModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>تسجيل اشتراك مجموعة (واتساب)</span>
            </button>
          )}

          <button
            type="button"
            onClick={loadData}
            disabled={isLoading}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Messages */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث بالاسم أو الهاتف أو المعلم..."
            className="w-full pl-3 pr-9 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm focus:border-[#0D4E8B] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="py-2 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 bg-white focus:outline-none"
          >
            {subTab === 'group_reviews' ? (
              <>
                <option value="all">كل حالات المراجعة</option>
                <option value="pending_review">قيد المراجعة والاعتماد</option>
                <option value="approved">معتمدة ومنشورة</option>
                <option value="needs_revision">بحاجة لتعديل المعلم</option>
                <option value="rejected">مرفوضة</option>
              </>
            ) : (
              <>
                <option value="all">كل الحالات</option>
                <option value="pending">قيد المراجعة (Pending)</option>
                <option value="confirmed">مؤكدة (Confirmed)</option>
                <option value="cancelled">ملغاة (Cancelled)</option>
                <option value="completed">مكتملة (Completed)</option>
              </>
            )}
          </select>
        </div>
      </div>

      {/* TAB 1: GROUP REVIEWS QUEUE */}
      {subTab === 'group_reviews' && (
        <div className="space-y-4">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-[#64748B] flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-[#0D4E8B]" />
              <span>جاري تحميل المجموعات التعليمية...</span>
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="bg-white p-12 rounded-3xl border border-[#E2E8F0] text-center space-y-2">
              <BookOpen className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-bold text-[#64748B]">لا توجد مجموعات تعليمية تطابق معايير البحث.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredGroups.map((group) => (
                <div
                  key={group.id}
                  className="bg-white rounded-3xl border border-[#E2E8F0] p-5 shadow-xs space-y-3.5 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span
                        className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                          group.review_status === 'approved'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : group.review_status === 'pending_review'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200 animate-pulse'
                            : group.review_status === 'needs_revision'
                            ? 'bg-orange-50 text-orange-800 border border-orange-200'
                            : 'bg-rose-50 text-rose-800 border border-rose-200'
                        }`}
                      >
                        {group.review_status === 'approved'
                          ? 'معتمدة ومنشورة'
                          : group.review_status === 'pending_review'
                          ? 'قيد مراجعة الإدارة'
                          : group.review_status === 'needs_revision'
                          ? 'طلب استكمال/تعديل'
                          : 'مرفوضة'}
                      </span>

                      <span className="text-[11px] font-mono text-slate-500">
                        معرف: {group.id.substring(0, 8)}...
                      </span>
                    </div>

                    <h4 className="font-['Cairo'] text-base font-bold text-[#1F2A44]">{group.title}</h4>

                    <div className="flex items-center gap-1.5 text-xs text-[#0D4E8B] font-bold">
                      <User className="w-3.5 h-3.5" />
                      <span>المعلم: {group.tutor_name || group.tutor_id}</span>
                    </div>

                    <p className="text-xs text-slate-600 font-medium">{group.specialization_label}</p>

                    {group.description && (
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{group.description}</p>
                    )}

                    {group.admin_review_notes && (
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
                        <span className="font-bold">ملاحظات الإدارة المسجلة: </span>
                        <span>{group.admin_review_notes}</span>
                      </div>
                    )}

                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
                      <div className="flex items-center justify-between">
                        <span>السعر للطالب:</span>
                        <span className="font-bold text-[#0D4E8B]">
                          {group.price_per_student} {group.currency} / {group.price_type === 'per_session' ? 'للحصة' : 'للباقة'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>المقاعد والسعة:</span>
                        <span className="font-bold">
                          {group.max_students} مقاعد (المؤكد: {group.enrolled_students || 0})
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>الجدول:</span>
                        <span className="font-bold">{group.weekly_schedule_summary}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>تاريخ البدء:</span>
                        <span className="font-mono">{group.start_date} ({group.sessions_count} حصص)</span>
                      </div>
                    </div>
                  </div>

                  {/* Review Actions */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2 flex-wrap">
                    {group.review_status !== 'approved' && (
                      <button
                        type="button"
                        onClick={() => {
                          setReviewModalGroup(group);
                          setReviewAction('approve');
                          setReviewNotes('');
                        }}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>اعتماد ونشر</span>
                      </button>
                    )}

                    {group.review_status !== 'needs_revision' && (
                      <button
                        type="button"
                        onClick={() => {
                          setReviewModalGroup(group);
                          setReviewAction('needs_revision');
                          setReviewNotes('');
                        }}
                        className="px-3 py-1.5 rounded-xl border border-amber-300 text-amber-800 hover:bg-amber-50 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>طلب تعديل</span>
                      </button>
                    )}

                    {group.review_status !== 'rejected' && (
                      <button
                        type="button"
                        onClick={() => {
                          setReviewModalGroup(group);
                          setReviewAction('reject');
                          setReviewNotes('');
                        }}
                        className="px-3 py-1.5 rounded-xl border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>رفض</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PRIVATE BOOKINGS */}
      {subTab === 'private_bookings' && (
        <div className="space-y-4">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-[#64748B] flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-[#0D4E8B]" />
              <span>جاري تحميل سجلات الحجوزات...</span>
            </div>
          ) : filteredPrivateBookings.length === 0 ? (
            <div className="bg-white p-12 rounded-3xl border border-[#E2E8F0] text-center space-y-2">
              <Calendar className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-bold text-[#64748B]">لا توجد حجوزات حصص خاصة تطابق البحث.</p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-[#E2E8F0] overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <tr>
                      <th className="py-3 px-4">الطالب وولي الأمر</th>
                      <th className="py-3 px-4">الهاتف</th>
                      <th className="py-3 px-4">المعلم والتخصص</th>
                      <th className="py-3 px-4">الموعد والتوقيت</th>
                      <th className="py-3 px-4">السعر</th>
                      <th className="py-3 px-4">الحالة</th>
                      <th className="py-3 px-4 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredPrivateBookings.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-[#1F2A44]">{b.student_name}</div>
                          <div className="text-[11px] text-slate-500">ولي الأمر: {b.guardian_name}</div>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-700" dir="ltr">
                          {b.phone_number}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-[#0D4E8B]">{b.tutor_name}</div>
                          <div className="text-[11px] text-slate-500">{b.specialization_label}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-[#1F2A44]">{b.slot_date}</div>
                          <div className="font-mono text-[11px] text-slate-600" dir="ltr">
                            {b.start_time?.substring(0, 5)} - {b.end_time?.substring(0, 5)}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-bold text-[#0D4E8B]">
                          {b.agreed_price} {b.currency}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              b.status === 'confirmed'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : b.status === 'pending'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : b.status === 'cancelled'
                                ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                : 'bg-blue-50 text-blue-800'
                            }`}
                          >
                            {b.status === 'confirmed'
                              ? 'مؤكد'
                              : b.status === 'pending'
                              ? 'قيد المراجعة'
                              : b.status === 'cancelled'
                              ? 'ملغي'
                              : 'مكتمل'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {b.status === 'pending' && (
                              <button
                                type="button"
                                disabled={actionLoadingId === b.id}
                                onClick={() => handleConfirmPrivate(b.id)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition-all cursor-pointer shadow-xs"
                              >
                                {actionLoadingId === b.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  'تأكيد الحجز'
                                )}
                              </button>
                            )}

                            {b.status !== 'cancelled' && b.status !== 'completed' && (
                              <button
                                type="button"
                                onClick={() => setCancelModalItem({ type: 'private', id: b.id })}
                                className="px-2 py-1 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-[11px] font-bold transition-all cursor-pointer"
                              >
                                إلغاء
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: GROUP ENROLLMENTS */}
      {subTab === 'group_enrollments' && (
        <div className="space-y-4">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-[#64748B] flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-[#0D4E8B]" />
              <span>جاري تحميل سجلات الاشتراكات...</span>
            </div>
          ) : filteredGroupEnrollments.length === 0 ? (
            <div className="bg-white p-12 rounded-3xl border border-[#E2E8F0] text-center space-y-2">
              <Users className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-bold text-[#64748B]">لا توجد اشتراكات مجموعات تطابق البحث.</p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-[#E2E8F0] overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                    <tr>
                      <th className="py-3 px-4">الطالب وولي الأمر</th>
                      <th className="py-3 px-4">الهاتف</th>
                      <th className="py-3 px-4">المجموعة والمعلم</th>
                      <th className="py-3 px-4">التسعير</th>
                      <th className="py-3 px-4">الحالة</th>
                      <th className="py-3 px-4 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredGroupEnrollments.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-[#1F2A44]">{e.student_name}</div>
                          <div className="text-[11px] text-slate-500">ولي الأمر: {e.guardian_name}</div>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-700" dir="ltr">
                          {e.phone_number}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-[#0D4E8B]">{e.group_title}</div>
                          <div className="text-[11px] text-slate-500">المعلم: {e.tutor_name}</div>
                        </td>
                        <td className="py-3 px-4 font-bold text-[#0D4E8B]">
                          {e.agreed_price} {e.currency} ({e.price_type === 'per_session' ? 'للحصة' : 'للباقة'})
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              e.status === 'confirmed'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : e.status === 'pending'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : e.status === 'cancelled'
                                ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                : 'bg-blue-50 text-blue-800'
                            }`}
                          >
                            {e.status === 'confirmed'
                              ? 'مؤكد'
                              : e.status === 'pending'
                              ? 'قيد المراجعة'
                              : e.status === 'cancelled'
                              ? 'ملغي'
                              : 'مكتمل'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {e.status === 'pending' && (
                              <button
                                type="button"
                                disabled={actionLoadingId === e.id}
                                onClick={() => handleConfirmEnrollment(e.id)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition-all cursor-pointer shadow-xs"
                              >
                                {actionLoadingId === e.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  'تأكيد الاشتراك'
                                )}
                              </button>
                            )}

                            {e.status !== 'cancelled' && e.status !== 'completed' && (
                              <button
                                type="button"
                                onClick={() => setCancelModalItem({ type: 'group', id: e.id })}
                                className="px-2 py-1 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-[11px] font-bold transition-all cursor-pointer"
                              >
                                إلغاء
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL: Review Group */}
      {reviewModalGroup && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="font-['Cairo'] text-base font-bold text-[#1F2A44] flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#0D4E8B]" />
              <span>
                {reviewAction === 'approve'
                  ? 'اعتماد ونشر المجموعة'
                  : reviewAction === 'needs_revision'
                  ? 'طلب استكمال وتعديل من المعلم'
                  : 'رفض المجموعة'}
              </span>
            </h3>

            <p className="text-xs text-slate-600">
              المجموعة: <span className="font-bold text-[#1F2A44]">{reviewModalGroup.title}</span>
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">
                ملاحظات وتوجيهات الإدارة للمعلم:
              </label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={3}
                placeholder="اكتب أي ملاحظات توجيهية للمعلم هنا..."
                className="w-full p-3 rounded-xl border border-slate-200 text-xs focus:border-[#0D4E8B] focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReviewModalGroup(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleReviewGroup}
                disabled={actionLoadingId === reviewModalGroup.id}
                className={`px-5 py-2 rounded-xl text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer ${
                  reviewAction === 'approve'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : reviewAction === 'needs_revision'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {actionLoadingId === reviewModalGroup.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span>تأكيد الإجراء</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Cancellation Reason */}
      {cancelModalItem && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="font-['Cairo'] text-base font-bold text-[#1F2A44] flex items-center gap-2">
              <XCircle className="w-5 h-5 text-rose-600" />
              <span>إلغاء الطلب رسمياً وتوثيق السجل</span>
            </h3>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">سبب الإلغاء:</label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="مثال: طلب ولي الأمر تأجيل الحصة، اعتذار الطالب..."
                className="w-full p-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0D4E8B] focus:outline-none"
              />
            </div>

            {cancelModalItem.type === 'private' && (
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={cancelReopenSlot}
                  onChange={(e) => setCancelReopenSlot(e.target.checked)}
                  className="rounded text-[#0D4E8B]"
                />
                <span>إعادة فتح الموعد للاختيار العام (إذا كان مستقبلياً وغير متعارض)</span>
              </label>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCancelModalItem(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={cancelModalItem.type === 'private' ? handleCancelPrivate : handleCancelEnrollment}
                disabled={actionLoadingId === cancelModalItem.id}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {actionLoadingId === cancelModalItem.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span>تأكيد الإلغاء</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: New Private Booking from WhatsApp */}
      {isNewBookingModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreatePrivateBooking}
            className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-xl"
          >
            <h3 className="font-['Cairo'] text-base font-bold text-[#1F2A44] flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#0D4E8B]" />
              <span>تسجيل طلب حجز حصة خاصة (بيانات واتساب)</span>
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  معرف الموعد الخاص (Slot ID UUID) *
                </label>
                <input
                  type="text"
                  required
                  value={newBookingSlotId}
                  onChange={(e) => setNewBookingSlotId(e.target.value)}
                  placeholder="e.g. 748b6139-38b4-419b-a0ea-4396c561bcfc"
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-mono focus:border-[#0D4E8B] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">اسم الطالب *</label>
                  <input
                    type="text"
                    required
                    value={newBookingStudentName}
                    onChange={(e) => setNewBookingStudentName(e.target.value)}
                    placeholder="اسم الطالب"
                    className="w-full p-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0D4E8B] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">اسم ولي الأمر</label>
                  <input
                    type="text"
                    value={newBookingGuardianName}
                    onChange={(e) => setNewBookingGuardianName(e.target.value)}
                    placeholder="اسم ولي الأمر"
                    className="w-full p-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0D4E8B] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">رقم الهاتف (واتساب) *</label>
                  <input
                    type="text"
                    required
                    value={newBookingPhone}
                    onChange={(e) => setNewBookingPhone(e.target.value)}
                    placeholder="01xxxxxxxxx"
                    className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-mono focus:border-[#0D4E8B] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">السعر المتفق عليه (ج.م) *</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={newBookingAgreedPrice}
                    onChange={(e) => setNewBookingAgreedPrice(Number(e.target.value))}
                    className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-mono focus:border-[#0D4E8B] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ملاحظات داخلية</label>
                <input
                  type="text"
                  value={newBookingNotes}
                  onChange={(e) => setNewBookingNotes(e.target.value)}
                  placeholder="أي تفاصيل خاصة بالاتفاق..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0D4E8B] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsNewBookingModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={actionLoadingId === 'new_booking'}
                className="px-5 py-2 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {actionLoadingId === 'new_booking' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span>تسجيل الحجز</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: New Group Enrollment from WhatsApp */}
      {isNewEnrollmentModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateGroupEnrollment}
            className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-xl"
          >
            <h3 className="font-['Cairo'] text-base font-bold text-[#1F2A44] flex items-center gap-2">
              <Users className="w-5 h-5 text-[#0D4E8B]" />
              <span>تسجيل اشتراك مجموعة تعليمية (بيانات واتساب)</span>
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  معرف المجموعة (Group ID UUID) *
                </label>
                <input
                  type="text"
                  required
                  value={newEnrollmentGroupId}
                  onChange={(e) => setNewEnrollmentGroupId(e.target.value)}
                  placeholder="e.g. 56214309-8f85-48b4-8e6d-92d5c414d6ee"
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-mono focus:border-[#0D4E8B] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">اسم الطالب *</label>
                  <input
                    type="text"
                    required
                    value={newEnrollmentStudentName}
                    onChange={(e) => setNewEnrollmentStudentName(e.target.value)}
                    placeholder="اسم الطالب"
                    className="w-full p-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0D4E8B] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">اسم ولي الأمر</label>
                  <input
                    type="text"
                    value={newEnrollmentGuardianName}
                    onChange={(e) => setNewEnrollmentGuardianName(e.target.value)}
                    placeholder="اسم ولي الأمر"
                    className="w-full p-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0D4E8B] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">رقم الهاتف *</label>
                  <input
                    type="text"
                    required
                    value={newEnrollmentPhone}
                    onChange={(e) => setNewEnrollmentPhone(e.target.value)}
                    placeholder="01xxxxxxxxx"
                    className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-mono focus:border-[#0D4E8B] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">السعر (ج.م) *</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={newEnrollmentAgreedPrice}
                    onChange={(e) => setNewEnrollmentAgreedPrice(Number(e.target.value))}
                    className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-mono focus:border-[#0D4E8B] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">نوع السعر</label>
                  <select
                    value={newEnrollmentPriceType}
                    onChange={(e) => setNewEnrollmentPriceType(e.target.value as any)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-bold focus:border-[#0D4E8B] focus:outline-none"
                  >
                    <option value="full_package">للباقة كاملة</option>
                    <option value="per_session">للحصة</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">ملاحظات داخلية</label>
                <input
                  type="text"
                  value={newEnrollmentNotes}
                  onChange={(e) => setNewEnrollmentNotes(e.target.value)}
                  placeholder="أي تفاصيل خاصة بالاشتراك..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs focus:border-[#0D4E8B] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsNewEnrollmentModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={actionLoadingId === 'new_enrollment'}
                className="px-5 py-2 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {actionLoadingId === 'new_enrollment' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span>تسجيل الاشتراك</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
