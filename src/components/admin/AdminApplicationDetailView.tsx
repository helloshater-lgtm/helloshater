import React, { useState, useEffect } from 'react';
import { TutorApplicationRecord, TutorApplicationStatus } from '../../types';
import { AdminService } from '../../services/adminService';
import {
  ArrowRight,
  User,
  Phone,
  Mail,
  GraduationCap,
  BookOpen,
  Calendar,
  Clock,
  DollarSign,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  XCircle,
  MessageCircle,
  FileText,
  ExternalLink,
  Loader2,
  Check,
  Send,
  Camera,
  Image as ImageIcon,
  Info,
} from 'lucide-react';

interface AdminApplicationDetailViewProps {
  applicationId: string;
  onBack: () => void;
  onNavigateToTutorEdit?: (tutorId: string) => void;
}

export const AdminApplicationDetailView: React.FC<AdminApplicationDetailViewProps> = ({
  applicationId,
  onBack,
  onNavigateToTutorEdit,
}) => {
  const [application, setApplication] = useState<TutorApplicationRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Associated Tutor Status (if approved)
  const [tutorStatus, setTutorStatus] = useState<{ isPublished: boolean; avatarUrl: string | null } | null>(null);
  const [isPublishingWithAvatar, setIsPublishingWithAvatar] = useState(false);

  // Decision state
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionType, setActionType] = useState<'idle' | 'needs_info' | 'approve' | 'reject'>('idle');
  const [decisionNotes, setDecisionNotes] = useState('');
  const [tutorSlug, setTutorSlug] = useState('');
  const [avatarSignedUrl, setAvatarSignedUrl] = useState<string | null>(null);

  const loadApplication = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await AdminService.getApplicationById(applicationId);
      if (!data) {
        setErrorMessage('تعذر العثور على بيانات الطلب المحدد.');
      } else {
        setApplication(data);
        // Load avatar signed URL if exists (private preview only)
        if (data.avatarPath) {
          AdminService.getApplicationAvatarSignedUrl(data.avatarPath).then((url) => {
            setAvatarSignedUrl(url);
          });
        } else {
          setAvatarSignedUrl(null);
        }
        // Auto-generate suggested slug
        setTutorSlug(`tutor-${Math.floor(1000 + Math.random() * 9000)}`);

        // Check associated tutor publication state if approved
        if (data.status === 'approved' && data.applicantTutorId) {
          try {
            const status = await AdminService.getTutorPublicationStatus(data.applicantTutorId);
            setTutorStatus(status);
          } catch (tutorErr) {
            console.warn('Could not load tutor publication status:', tutorErr);
          }
        } else {
          setTutorStatus(null);
        }
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'فشل تحميل بيانات الطلب.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadApplication();
  }, [applicationId]);

  // Handle Review (needs_info or reject)
  const handleReviewAction = async (targetStatus: 'needs_info' | 'rejected') => {
    if (!decisionNotes.trim()) {
      setErrorMessage('يرجى تدوين الملاحظات والتوجيهات للمعلم قبل إرسال القرار.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await AdminService.reviewApplication(applicationId, targetStatus, decisionNotes.trim());
      setSuccessMessage(
        targetStatus === 'needs_info'
          ? 'تم إرسال طلب استكمال البيانات للمعلم بنجاح. يستطيع المعلم الآن تعديل طلبه.'
          : 'تم تسجيل رفض الطلب بنجاح وتحديث حالته في النظام.'
      );
      setActionType('idle');
      setDecisionNotes('');
      await loadApplication();
    } catch (err: any) {
      setErrorMessage(err?.message || 'فشل تنفيذ القرار الإداري.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Approve (Creates draft tutor record without copying avatar to public bucket)
  const handleApproveAction = async () => {
    if (!tutorSlug.trim() || !/^[a-z0-9-]+$/.test(tutorSlug.trim())) {
      setErrorMessage('يرجى إدخال معرف صالح للمعلم (Slug) بالإنجليزية والأرقام والشرطات فقط.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await AdminService.approveApplication(
        applicationId,
        tutorSlug.trim().toLowerCase(),
        decisionNotes.trim() || undefined
      );

      setSuccessMessage(
        `تم قبول الطلب واعتماد المعلم بنجاح! تم إنشاء ملف المعلم (${result.tutorId}) بحالة "غير منشور". تظل الصورة الشخصية محفوظة في الدلو الخاص لمعاينة الإدارة، ولن يتم نقلها للدلو العام إلا عند قرار النشر الصريح.`
      );
      setActionType('idle');
      await loadApplication();
    } catch (err: any) {
      setErrorMessage(err?.message || 'فشل اعتماد وقبول الطلب.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Explicit Publication Action: Transfer avatar and publish tutor in one atomic flow
  const handlePublishWithAvatar = async () => {
    if (!application?.applicantTutorId) return;

    setIsPublishingWithAvatar(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (application.avatarPath && !tutorStatus?.avatarUrl) {
        await AdminService.publishTutorWithApplicationAvatar(
          application.id,
          application.applicantTutorId
        );
        setSuccessMessage(
          'تم نقل الصورة بنجاح إلى الدلو العام، وتحديث رابطها في ملف المعلم، ونشر ملف المعلم في المنصة للجمهور!'
        );
      } else {
        await AdminService.toggleTutorPublish(application.applicantTutorId, true);
        setSuccessMessage('تم نشر وتفعيل ملف المعلم في منصة شاطر بنجاح!');
      }
      await loadApplication();
    } catch (err: any) {
      setErrorMessage(err?.message || 'فشل نقل الصورة أو نشر ملف المعلم.');
    } finally {
      setIsPublishingWithAvatar(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white p-12 rounded-2xl border border-[#E2E8F0] text-center flex flex-col items-center justify-center gap-3" dir="rtl">
        <Loader2 className="w-8 h-8 text-[#0D4E8B] animate-spin" />
        <p className="text-xs sm:text-sm text-[#64748B] font-medium">جاري تحميل تفاصيل طلب الانضمام...</p>
      </div>
    );
  }

  if (!application) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-[#E2E8F0] text-center space-y-4" dir="rtl">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
        <h3 className="font-bold text-[#1F2A44] text-base">الطلب غير موجود</h3>
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 rounded-xl bg-[#0D4E8B] text-white text-xs font-bold cursor-pointer"
        >
          العودة لقائمة الطلبات
        </button>
      </div>
    );
  }

  const cleanPhone = application.countryCode.replace(/\+/g, '') + application.phone.replace(/^0+/, '');
  const isApproved = application.status === 'approved';

  return (
    <div className="space-y-6 max-w-5xl mx-auto" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-[#E2E8F0] shadow-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-xl border border-[#E2E8F0] hover:bg-slate-50 text-[#1F2A44] transition-colors cursor-pointer"
            title="العودة لقائمة الطلبات"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-['Cairo'] text-base sm:text-lg font-bold text-[#1F2A44]">
                طلب انضمام: {application.fullName}
              </h2>
              <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded" dir="ltr">
                {application.referenceCode}
              </span>
            </div>
            <p className="text-xs text-[#64748B] mt-0.5">
              تاريخ التقديم: {new Date(application.createdAt).toLocaleString('ar-EG')}
            </p>
          </div>
        </div>

        {/* WhatsApp & Quick Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={`https://wa.me/${cleanPhone}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold transition-all flex items-center gap-1.5 border border-emerald-200"
          >
            <MessageCircle className="w-4 h-4 text-emerald-600" />
            <span>مراسلة المعلم عبر الواتساب</span>
          </a>

          {isApproved && application.applicantTutorId && onNavigateToTutorEdit && (
            <button
              type="button"
              onClick={() => onNavigateToTutorEdit(application.applicantTutorId!)}
              className="px-3.5 py-2 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <span>فتح ملف المعلم</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm flex items-start gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Status & Decision Banner */}
      <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#64748B]">الحالة الحالية:</span>
            <span
              className={`px-3 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 ${
                application.status === 'approved'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : application.status === 'needs_info'
                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                  : application.status === 'rejected'
                  ? 'bg-rose-50 text-rose-800 border border-rose-200'
                  : 'bg-blue-50 text-[#0D4E8B] border border-blue-200'
              }`}
            >
              {application.status === 'approved' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
              {application.status === 'needs_info' && <AlertCircle className="w-4 h-4 text-amber-600" />}
              {application.status === 'rejected' && <XCircle className="w-4 h-4 text-rose-600" />}
              {application.status === 'submitted' && <Clock className="w-4 h-4 text-[#0D4E8B]" />}
              {application.status === 'approved'
                ? 'مقبول وتم إنشاء الملف'
                : application.status === 'needs_info'
                ? 'مطلوب استكمال بيانات من المعلم'
                : application.status === 'rejected'
                ? 'مرفوض'
                : 'قيد المراجعة الإدارية'}
            </span>
          </div>

          {/* Action Trigger Buttons */}
          {(application.status === 'submitted' || application.status === 'needs_info') && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActionType('needs_info')}
                className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold border border-amber-200 transition-colors cursor-pointer"
              >
                طلب استكمال بيانات
              </button>
              <button
                type="button"
                onClick={() => setActionType('reject')}
                className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-bold border border-rose-200 transition-colors cursor-pointer"
              >
                رفض الطلب
              </button>
              <button
                type="button"
                onClick={() => setActionType('approve')}
                className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
              >
                قبول واعتماد المعلم
              </button>
            </div>
          )}

          {/* Approved tutor publication status & explicit action */}
          {application.status === 'approved' && application.applicantTutorId && (
            <div className="flex flex-wrap items-center gap-2">
              {tutorStatus && (
                <span
                  className={`px-3 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 ${
                    tutorStatus.isPublished
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                      : 'bg-amber-100 text-amber-900 border border-amber-300'
                  }`}
                >
                  {tutorStatus.isPublished ? 'ملف منشور للجمهور' : 'ملف غير منشور (مسودة)'}
                </span>
              )}

              {tutorStatus && !tutorStatus.isPublished && (
                <button
                  type="button"
                  onClick={handlePublishWithAvatar}
                  disabled={isPublishingWithAvatar}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {isPublishingWithAvatar ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>جاري نقل الصورة والنشر...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>
                        {application.avatarPath && !tutorStatus.avatarUrl
                          ? 'نقل الصورة ونشر المعلم في المنصة'
                          : 'نشر ملف المعلم في المنصة'}
                      </span>
                    </>
                  )}
                </button>
              )}

              {onNavigateToTutorEdit && (
                <button
                  type="button"
                  onClick={() => onNavigateToTutorEdit(application.applicantTutorId!)}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#1F2A44] text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>تعديل ملف المعلم</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Existing Admin Notes if present */}
        {application.adminNotes && (
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
            <span className="font-bold block text-[#1F2A44]">آخر ملاحظات إدارية مسجلة:</span>
            <p className="whitespace-pre-line leading-relaxed">{application.adminNotes}</p>
          </div>
        )}

        {/* Inline Decision Form */}
        {actionType !== 'idle' && (
          <div className="p-4 rounded-xl bg-[#F8F9FC] border border-[#CBD5E1] space-y-3 animate-fade-in">
            <h4 className="font-['Cairo'] text-sm font-bold text-[#1F2A44] flex items-center gap-1.5">
              {actionType === 'approve' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
              {actionType === 'needs_info' && <AlertCircle className="w-4 h-4 text-amber-600" />}
              {actionType === 'reject' && <XCircle className="w-4 h-4 text-rose-600" />}
              <span>
                {actionType === 'approve'
                  ? 'تأكيد قبول الطلب وإنشاء ملف المعلم غير المنشور'
                  : actionType === 'needs_info'
                  ? 'طلب استكمال بيانات من المعلم'
                  : 'رفض طلب الانضمام'}
              </span>
            </h4>

            {actionType === 'approve' && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#1F2A44] block">
                  معرف المعلم في الرابط (Tutor Slug)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={tutorSlug}
                  onChange={(e) => setTutorSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="mohamed-ali"
                  className="w-full max-w-md px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs font-mono focus:border-[#0D4E8B] outline-none"
                />
                <span className="text-[11px] text-[#64748B] block">
                  سيتم إنشاء ملف المعلم بهذا المعرف بحالة <strong>غير منشور</strong> ليتسنى للمشرف مراجعته ونشره لاحقاً.
                </span>

                {application?.avatarPath && (
                  <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-[#0D4E8B] flex items-start gap-2 pt-2">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      الصورة الشخصية للمتقدم تظل محفوظة بأمان في الدلو الخاص. سيتم الاحتفاظ بها ومعاينتها للإدارة فقط، ولن يتم نقلها للدلو العام أو إتاحة رابطها حتى يصدر قرار النشر الصريح.
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#1F2A44] block">
                {actionType === 'needs_info'
                  ? 'الملاحظات والبيانات المطلوبة (ستظهر للمعلم في حسابه)'
                  : actionType === 'reject'
                  ? 'سبب الرفض (يسجل داخلياً ويظهر للمعلم)'
                  : 'ملاحظات إدارية داخلية (اختياري)'}
              </label>
              <textarea
                rows={3}
                value={decisionNotes}
                onChange={(e) => setDecisionNotes(e.target.value)}
                placeholder="اكتب التوجيهات أو الملاحظات هنا..."
                className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => {
                  if (actionType === 'approve') handleApproveAction();
                  else handleReviewAction(actionType as any);
                }}
                className={`px-4 py-2 rounded-xl text-white text-xs font-bold cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50 ${
                  actionType === 'approve'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : actionType === 'needs_info'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>تنفيذ القرار</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActionType('idle');
                  setDecisionNotes('');
                }}
                className="px-3 py-2 rounded-xl border border-[#CBD5E1] text-slate-600 hover:bg-white text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Section 1: Personal & Contact */}
        <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] space-y-4">
          <h3 className="font-['Cairo'] text-sm font-bold text-[#1F2A44] pb-2 border-b border-[#F1F5F9] flex items-center justify-between">
            <span className="flex items-center gap-2">
              <User className="w-4 h-4 text-[#0D4E8B]" />
              <span>البيانات الشخصية والتواصل</span>
            </span>
            {avatarSignedUrl ? (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-bold">
                  صورة مرفوعة
                </span>
                <a
                  href={avatarSignedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-full overflow-hidden border border-[#CBD5E1] shadow-2xs block hover:opacity-90 transition-opacity"
                  title="عرض الصورة بالحجم الكامل"
                >
                  <img src={avatarSignedUrl} alt="صورة المتقدم" className="w-full h-full object-cover" />
                </a>
              </div>
            ) : (
              <span className="text-[10px] text-[#64748B] bg-slate-100 px-2 py-0.5 rounded-full">
                بدون صورة
              </span>
            )}
          </h3>

          <div className="space-y-2.5 text-xs">
            {avatarSignedUrl && (
              <div className="p-3 rounded-xl bg-[#F8FAFD] border border-[#E2E8F0] flex items-center gap-3">
                <div className="w-12 h-12 rounded-full overflow-hidden border border-[#CBD5E1] shrink-0 bg-white shadow-2xs">
                  <img src={avatarSignedUrl} alt="صورة المتقدم" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-[#0D4E8B] flex items-center gap-1">
                    <Camera className="w-3.5 h-3.5" />
                    <span>الصورة الشخصية للمتقدم</span>
                  </div>
                  <p className="text-[11px] text-[#64748B] mt-0.5 truncate">
                    مسار التخزين الخاص: <span className="font-mono">{application.avatarPath}</span>
                  </p>
                </div>
                <a
                  href={avatarSignedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 rounded-lg bg-white border border-[#CBD5E1] hover:bg-slate-50 text-[11px] font-bold text-[#1F2A44] transition-colors"
                >
                  معاينة مكبرة
                </a>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-[#64748B]">الاسم الكامل:</span>
              <span className="font-bold text-[#1F2A44]">{application.fullName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#64748B]">رقم الهاتف والواتساب:</span>
              <span className="font-mono text-[#1F2A44]" dir="ltr">
                {application.countryCode} {application.phone}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#64748B]">البريد الإلكتروني:</span>
              <span className="font-mono text-[#1F2A44]" dir="ltr">
                {application.email || 'غير متوفر'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#64748B]">المسار التدريسي:</span>
              <span className="font-bold text-[#0D4E8B]">
                {application.track === 'school' ? 'المناهج المدرسية' : 'القرآن والتأسيس'}
              </span>
            </div>
          </div>
        </div>

        {/* Section 2: Qualifications & Experience */}
        <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] space-y-4">
          <h3 className="font-['Cairo'] text-sm font-bold text-[#1F2A44] pb-2 border-b border-[#F1F5F9] flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-[#0D4E8B]" />
            <span>المؤهلات والخبرة الأكاديمية</span>
          </h3>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#64748B]">المؤهل الأكاديمي:</span>
              <span className="font-bold text-[#1F2A44]">{application.academicDegree}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#64748B]">سنوات الخبرة:</span>
              <span className="text-[#1F2A44]">{application.experienceYears}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#64748B]">الخبرة أونلاين:</span>
              <span className="text-[#1F2A44]">
                {application.hasOnlineExperience === 'yes' ? 'نعم (لديه خبرة سابقة)' : 'جديد في التدريس عن بُعد'}
              </span>
            </div>
            {application.onlineExperienceDetails && (
              <div className="p-2.5 rounded-xl bg-slate-50 text-[11px] text-slate-700 leading-relaxed">
                <strong>أدوات التدريس أونلاين:</strong> {application.onlineExperienceDetails}
              </div>
            )}
            {application.portfolioUrl && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-[#64748B]">رابط إلكتروني / سيرة:</span>
                <a
                  href={application.portfolioUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#0D4E8B] hover:underline flex items-center gap-1 font-mono text-[11px]"
                >
                  <span>عرض الرابط</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Section 3: Specializations & Materials */}
        <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] space-y-4 md:col-span-2">
          <h3 className="font-['Cairo'] text-sm font-bold text-[#1F2A44] pb-2 border-b border-[#F1F5F9] flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#0D4E8B]" />
            <span>التخصصات والمواد المختارة</span>
          </h3>

          {application.track === 'school' ? (
            <div className="space-y-3">
              {(!application.schoolSpecializations || application.schoolSpecializations.length === 0) ? (
                <p className="text-xs text-[#94A3B8] italic">لم يتم حفظ تخصصات مفصلة.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {application.schoolSpecializations.map((spec, idx) => (
                    <div key={spec.id || idx} className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs space-y-1">
                      <div className="font-bold text-[#0D4E8B] flex items-center justify-between">
                        <span>تخصص {idx + 1}: {spec.subjectId}</span>
                        <span className="text-[11px] text-slate-500 font-normal">({spec.teachingLanguage === 'english' ? 'لغات / English' : 'عربي'})</span>
                      </div>
                      <div className="text-[#64748B]">
                        المنهج: <span className="text-[#1F2A44] font-medium">{spec.curriculumType}</span> · المرحلة: <span className="text-[#1F2A44] font-medium">{spec.stageId}</span>
                      </div>
                      <div className="text-[11px] text-slate-600 pt-1">
                        الصفوف: {spec.gradeIds?.join('، ') || 'جميع الصفوف'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                  <strong className="block text-[#0D4E8B]">البرامج القرآنية والتأسيسية:</strong>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {application.quranLevels?.map((lvl) => (
                      <span key={lvl} className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                        {lvl}
                      </span>
                    )) || 'غير محدد'}
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                  <strong className="block text-[#0D4E8B]">الفئات العمرية المستهدفة:</strong>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {application.quranAgeGroups?.map((age) => (
                      <span key={age} className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                        {age}
                      </span>
                    )) || 'غير محدد'}
                  </div>
                </div>
              </div>

              {application.quranNotes && (
                <div className="p-3 rounded-xl bg-slate-50 text-slate-700 text-xs">
                  <strong>ملاحظات التأسيس والقراءات:</strong> {application.quranNotes}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section 4: Bio & Teaching Methodology */}
        <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] space-y-3 md:col-span-2">
          <h3 className="font-['Cairo'] text-sm font-bold text-[#1F2A44] pb-2 border-b border-[#F1F5F9] flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#0D4E8B]" />
            <span>نبذة أسلوب التدريس وتبسيط المعلومة</span>
          </h3>
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line bg-[#F8F9FC] p-4 rounded-xl border border-slate-200">
            {application.bioAndMethodology}
          </p>
        </div>

        {/* Section 5: Pricing, Duration & Availability */}
        <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] space-y-4">
          <h3 className="font-['Cairo'] text-sm font-bold text-[#1F2A44] pb-2 border-b border-[#F1F5F9] flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-[#0D4E8B]" />
            <span>التسعير والمدة المقترحة</span>
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[#64748B]">سعر الحصة المقترح:</span>
              <span className="font-bold text-[#1F2A44]">
                {application.suggestedHourlyRate} {application.currency}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#64748B]">مدة الحصة:</span>
              <span className="text-[#1F2A44]">{application.sessionDurationMinutes} دقيقة</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#64748B]">المنطقة الزمنية:</span>
              <span className="text-[#1F2A44]">{application.timezone}</span>
            </div>
          </div>
        </div>

        {/* Section 6: Available Days & Policy Consent */}
        <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] space-y-4">
          <h3 className="font-['Cairo'] text-sm font-bold text-[#1F2A44] pb-2 border-b border-[#F1F5F9] flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#0D4E8B]" />
            <span>أيام التفرغ والموافقة على السياسة</span>
          </h3>
          <div className="space-y-2 text-xs">
            <div>
              <span className="text-[#64748B] block mb-1">أيام التفرغ الممكنة:</span>
              <div className="flex flex-wrap gap-1">
                {application.availableDays?.map((d) => (
                  <span key={d} className="px-2 py-0.5 rounded bg-slate-100 text-[#1F2A44] font-medium text-[11px]">
                    {d}
                  </span>
                )) || 'غير محدد'}
              </div>
            </div>
            <div className="pt-2 border-t border-slate-100">
              <span className="text-[#64748B] block mb-1">الفترات المفضلة:</span>
              <div className="flex flex-wrap gap-1">
                {application.preferredTimes?.map((t) => (
                  <span key={t} className="px-2 py-0.5 rounded bg-slate-100 text-[#1F2A44] text-[11px]">
                    {t}
                  </span>
                )) || 'غير محدد'}
              </div>
            </div>
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
              <span className="text-emerald-700 font-bold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                <span>تمت الموافقة على وثيقة التعاون ({application.policyVersion || 'v1.0'})</span>
              </span>
              <span className="text-slate-400">
                {application.policyAcceptedAt ? new Date(application.policyAcceptedAt).toLocaleDateString('ar-EG') : ''}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
