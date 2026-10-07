import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { TutorPortalService } from '../../services/tutorPortalService';
import { TutorPortalContext, TutorAvailableSlot } from '../../types';
import {
  GraduationCap,
  Calendar,
  Clock,
  Eye,
  CheckCircle2,
  AlertCircle,
  Clock3,
  Loader2,
  Trash2,
  Plus,
  Send,
  Camera,
  ExternalLink,
  ShieldCheck,
  User,
  Sparkles,
  ArrowRight,
  Info,
  Lock,
} from 'lucide-react';

interface TutorDashboardViewProps {
  onNavigateHome: () => void;
  onNavigateToPublicProfile?: (tutorId: string) => void;
}

export const TutorDashboardView: React.FC<TutorDashboardViewProps> = ({
  onNavigateHome,
  onNavigateToPublicProfile,
}) => {
  const [context, setContext] = useState<TutorPortalContext | null>(null);
  const [slots, setSlots] = useState<TutorAvailableSlot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'overview' | 'profile-draft' | 'slots'>('overview');

  // Slots Form State (Trial duration is exactly 20 minutes)
  const [newSlotDate, setNewSlotDate] = useState('');
  const [newSlotStart, setNewSlotStart] = useState('16:00');
  const [newSlotEnd, setNewSlotEnd] = useState('16:20');
  const [newSlotTimezone, setNewSlotTimezone] = useState('Africa/Cairo');
  const [isAddingSlot, setIsAddingSlot] = useState(false);
  const [deletingSlotId, setDeletingSlotId] = useState<string | null>(null);

  // Helper to add 20 minutes to HH:mm
  const add20Minutes = (timeStr: string): string => {
    if (!timeStr || !timeStr.includes(':')) return '16:20';
    const [h, m] = timeStr.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return '16:20';
    const totalMinutes = h * 60 + m + 20;
    const endH = Math.floor((totalMinutes / 60) % 24);
    const endM = totalMinutes % 60;
    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  };

  const handleStartTimeChange = (val: string) => {
    setNewSlotStart(val);
    setNewSlotEnd(add20Minutes(val));
  };

  // Profile Draft Form State
  const [draftHeadline, setDraftHeadline] = useState('');
  const [draftQuote, setDraftQuote] = useState('');
  const [draftSummary, setDraftSummary] = useState('');
  const [draftAvatarPath, setDraftAvatarPath] = useState<string | null>(null);
  const [draftAvatarPreview, setDraftAvatarPreview] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isSubmittingDraft, setIsSubmittingDraft] = useState(false);

  // Load Data
  const loadPortalData = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const portalContext = await TutorPortalService.getMyContext();
      setContext(portalContext);

      // Populate draft form initial values
      const tutor = portalContext.tutor;
      const existingDraft = portalContext.pendingDraft;
      setDraftHeadline(existingDraft?.headline || tutor.headline || '');
      setDraftQuote(existingDraft?.helpChildQuote || tutor.helpChildQuote || '');
      setDraftSummary(existingDraft?.helpChildSummary || tutor.helpChildSummary || '');
      
      if (existingDraft?.avatarUrl) {
        setDraftAvatarPath(existingDraft.avatarUrl);
        // If it's a private storage path, try to get a temporary signed url for preview
        if (existingDraft.avatarUrl.startsWith('pending/')) {
          supabase.storage
            .from('tutor-avatars-pending')
            .createSignedUrl(existingDraft.avatarUrl, 3600)
            .then(({ data }) => {
              if (data?.signedUrl) setDraftAvatarPreview(data.signedUrl);
            });
        } else {
          setDraftAvatarPreview(existingDraft.avatarUrl);
        }
      } else {
        setDraftAvatarPath(null);
        setDraftAvatarPreview(null);
      }

      // Load slots
      try {
        const mySlots = await TutorPortalService.getMySlots();
        setSlots(mySlots);
      } catch (slotErr: any) {
        console.warn('Could not load slots:', slotErr);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'تعذر تحميل بيانات لوحة المعلم.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPortalData();
  }, []);

  // Handle Create Slot
  const handleCreateSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSlotDate || !newSlotStart || !newSlotEnd) {
      setErrorMessage('يرجى تحديد تاريخ ووقت البداية والنهاية للموعد.');
      return;
    }

    // Validate 20 minutes duration exactly
    const [startH, startM] = newSlotStart.split(':').map(Number);
    const [endH, endM] = newSlotEnd.split(':').map(Number);
    const durationMinutes = endH * 60 + endM - (startH * 60 + startM);
    if (durationMinutes !== 20) {
      setErrorMessage('مدة الموعد التجريبي المعتمدة هي 20 دقيقة بالضبط.');
      return;
    }

    setIsAddingSlot(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await TutorPortalService.createSlot(newSlotDate, newSlotStart, newSlotEnd, newSlotTimezone);
      setSuccessMessage('تمت إضافة الموعد المتاح بنجاح!');
      setTimeout(() => setSuccessMessage(null), 4000);
      const updatedSlots = await TutorPortalService.getMySlots();
      setSlots(updatedSlots);
      setNewSlotDate('');
    } catch (err: any) {
      setErrorMessage(err?.message || 'فشل إضافة الموعد.');
    } finally {
      setIsAddingSlot(false);
    }
  };

  // Handle Delete Slot
  const handleDeleteSlot = async (slotId: string) => {
    setDeletingSlotId(slotId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await TutorPortalService.deleteSlot(slotId);
      setSlots((prev) => prev.filter((s) => s.id !== slotId));
      setSuccessMessage('تم حذف الموعد بنجاح.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'تعذر حذف الموعد.');
    } finally {
      setDeletingSlotId(null);
    }
  };

  // Handle Draft Avatar Upload
  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingAvatar(true);
    setErrorMessage(null);

    try {
      const uploaded = await TutorPortalService.uploadDraftAvatar(file);
      setDraftAvatarPath(uploaded.storagePath);
      setDraftAvatarPreview(uploaded.previewSignedUrl);
      setSuccessMessage('تم رفع الصورة المقترحة بنجاح! سيتم إرسالها للمراجعة مع حفظ التعديلات.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'فشل رفع الصورة المقترحة.');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Handle Submit Profile Draft
  const handleSubmitProfileDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftHeadline.trim() || draftHeadline.trim().length < 10) {
      setErrorMessage('العنوان التعريفي مطلوب ويجب أن يحتوي على 10 أحرف على الأقل.');
      return;
    }

    setIsSubmittingDraft(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await TutorPortalService.submitProfileDraft({
        headline: draftHeadline.trim(),
        avatarPath: draftAvatarPath,
        helpChildQuote: draftQuote.trim() || null,
        helpChildSummary: draftSummary.trim() || null,
      });
      setSuccessMessage('تم إرسال مقترح التعديل بنجاح لإدارة شاطر للمراجعة والاعتماد!');
      await loadPortalData();
    } catch (err: any) {
      setErrorMessage(err?.message || 'فشل إرسال مقترح تعديل الملف.');
    } finally {
      setIsSubmittingDraft(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4 text-center space-y-4" dir="rtl">
        <Loader2 className="w-10 h-10 text-[#0D4E8B] animate-spin mx-auto" />
        <p className="text-sm font-bold text-[#64748B]">جاري تحميل لوحة المعلم...</p>
      </div>
    );
  }

  if (!context) {
    return (
      <div className="max-w-xl mx-auto my-16 p-6 sm:p-8 bg-white rounded-3xl border border-[#E2E8F0] shadow-sm text-center space-y-4" dir="rtl">
        <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
        <h2 className="font-['Cairo'] text-lg sm:text-xl font-bold text-[#1F2A44]">
          لوحة المعلم غير متاحة
        </h2>
        <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed">
          {errorMessage || 'حسابك غير مرتبط بطلب معتمد أو ملف معلم في منصة شاطر. يمكنك متابعة طلبك من صفحة الانضمام كمعلم.'}
        </p>
        <div className="pt-2 flex items-center justify-center gap-3">
          <button
            onClick={() => {
              window.location.hash = '#join-as-tutor';
            }}
            className="px-5 py-2.5 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs sm:text-sm font-bold transition-all cursor-pointer"
          >
            متابعة طلب الانضمام
          </button>
          <button
            onClick={onNavigateHome}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#1F2A44] text-xs sm:text-sm font-bold transition-all cursor-pointer"
          >
            الرئيسية
          </button>
        </div>
      </div>
    );
  }

  const { tutor, pendingDraft, application } = context;

  return (
    <div className="w-full max-w-5xl mx-auto py-6 sm:py-10 px-4 sm:px-6 space-y-6 animate-fade-in" dir="rtl">
      {/* Top Header Card */}
      <div className="bg-white rounded-3xl border border-[#E2E8F0] p-5 sm:p-7 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border border-[#CBD5E1] bg-slate-100 shrink-0 shadow-2xs">
              {tutor.avatarUrl ? (
                <img src={tutor.avatarUrl} alt={tutor.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#0D4E8B]">
                  <User className="w-8 h-8" />
                </div>
              )}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-['Cairo'] text-lg sm:text-xl font-bold text-[#1F2A44]">
                  {tutor.name}
                </h1>
                {tutor.verifiedCredentials && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>موثق ومعتمد</span>
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">{tutor.headline}</p>
              <p className="text-xs text-[#0D4E8B] font-mono mt-1" dir="ltr">
                ID: {tutor.id}
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {tutor.isPublished ? (
              <button
                type="button"
                onClick={() => {
                  if (onNavigateToPublicProfile) {
                    onNavigateToPublicProfile(tutor.id);
                  } else {
                    window.location.hash = `#tutor/${tutor.id}`;
                  }
                }}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
              >
                <span>معاينة ملفي العام</span>
                <ExternalLink className="w-4 h-4" />
              </button>
            ) : (
              <span className="px-3.5 py-2 rounded-xl bg-amber-50 text-amber-900 border border-amber-200 text-xs font-bold flex items-center gap-1.5">
                <Clock3 className="w-4 h-4 text-amber-600" />
                <span>الملف قيد المراجعة الإدارية قبل النشر</span>
              </span>
            )}
          </div>
        </div>

        {/* Publication Status Banner */}
        <div
          className={`p-4 rounded-2xl border text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            tutor.isPublished
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
              : 'bg-amber-50/80 border-amber-200 text-amber-900'
          }`}
        >
          <div className="flex items-start sm:items-center gap-2.5">
            {tutor.isPublished ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5 sm:mt-0" />
            ) : (
              <Clock3 className="w-5 h-5 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
            )}
            <div>
              <span className="font-bold block sm:inline">
                {tutor.isPublished
                  ? 'ملفك منشور حالياً في منصة شاطر ومتاح لأولياء الأمور للبحث والحجز.'
                  : 'تم اعتماد وقبول طلبك! ملفك حالياً مسودة إدارية غير منشورة للجمهور حتى اكتمال تجهيز الجداول.'}
              </span>
              {!tutor.isPublished && (
                <span className="text-[11px] text-[#64748B] block mt-0.5">
                  تستطيع الآن إضافة مواعيدك التجريبية واقتراح أي تحديثات على العنوان التعريفي والنبذة ليتم مراجعتها ونشرها.
                </span>
              )}
            </div>
          </div>

          {application?.referenceCode && (
            <span className="text-xs font-mono bg-white/80 px-2.5 py-1 rounded-lg border border-inherit shrink-0">
              مرجع الطلب: {application.referenceCode}
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <span className="font-bold">{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm flex items-start gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <span className="font-bold">{successMessage}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-[#CBD5E1] pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2.5 rounded-xl font-['Cairo'] text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'overview'
              ? 'bg-[#0D4E8B] text-white shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2A44] hover:bg-white'
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          <span>ملخص ملفي</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('slots')}
          className={`px-4 py-2.5 rounded-xl font-['Cairo'] text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'slots'
              ? 'bg-[#0D4E8B] text-white shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2A44] hover:bg-white'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>إدارة المواعيد التجريبية ({slots.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('profile-draft')}
          className={`px-4 py-2.5 rounded-xl font-['Cairo'] text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'profile-draft'
              ? 'bg-[#0D4E8B] text-white shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2A44] hover:bg-white'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>اقتراح تعديل الملف</span>
          {pendingDraft && (
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="يوجد مقترح معلق" />
          )}
        </button>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-xs space-y-1">
              <span className="text-xs text-[#64748B] font-bold block">سعر الحصة المعتمد</span>
              <div className="font-['Cairo'] text-lg font-extrabold text-[#0D4E8B]">
                {tutor.hourlyRateMin} {tutor.currency}
                <span className="text-xs text-[#64748B] font-normal mr-1">/ {tutor.sessionDurationMinutes} دقيقة</span>
              </div>
              <span className="text-[11px] text-[#64748B] block mt-1">
                تعديل السعر يتطلب مراجعة وموافقة الإدارة.
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-xs space-y-1">
              <span className="text-xs text-[#64748B] font-bold block">سنوات الخبرة</span>
              <div className="font-['Cairo'] text-lg font-extrabold text-[#1F2A44]">
                {tutor.yearsOfExperience} سنوات
              </div>
              <span className="text-[11px] text-[#64748B] block mt-1">
                {tutor.experienceBadgeText || 'خبرة معتمدة في التدريس'}
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-xs space-y-1">
              <span className="text-xs text-[#64748B] font-bold block">المواعيد التجريبية المسجلة</span>
              <div className="font-['Cairo'] text-lg font-extrabold text-[#0D4E8B]">
                {slots.filter((s) => s.isAvailable).length} موعد متاح
              </div>
              <span className="text-[11px] text-emerald-800 font-bold block mt-1">
                {slots.filter((s) => s.isBooked).length} موعد محجوز لطالب
              </span>
            </div>
          </div>

          {/* Details Card */}
          <div className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs space-y-5">
            <h3 className="font-['Cairo'] text-base font-bold text-[#1F2A44] flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-[#0D4E8B]" />
              <span>بيانات ملفك المعتمدة الحالية</span>
            </h3>

            <div className="space-y-4 text-xs sm:text-sm">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="font-bold text-[#1F2A44] block">العنوان التعريفي المعتمد:</span>
                <p className="text-slate-700 leading-relaxed">{tutor.headline || 'لم يحدد'}</p>
              </div>

              {tutor.helpChildQuote && (
                <div className="p-4 rounded-2xl bg-[#F0F6FD] border border-[#CBD5E1] space-y-1">
                  <span className="font-bold text-[#0D4E8B] block">اقتباس تبسيط المنهج للطفل:</span>
                  <p className="text-[#1F2A44] italic leading-relaxed">"{tutor.helpChildQuote}"</p>
                </div>
              )}

              {tutor.helpChildSummary && (
                <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] space-y-1">
                  <span className="font-bold text-[#1F2A44] block">نبذة أسلوب التدريس وطريقة الشرح:</span>
                  <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{tutor.helpChildSummary}</p>
                </div>
              )}
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-[#F1F5F9] text-xs text-[#64748B]">
              <span>ترغب في تحديث العنوان أو النبذة أو الصورة؟</span>
              <button
                type="button"
                onClick={() => setActiveTab('profile-draft')}
                className="font-bold text-[#0D4E8B] hover:underline cursor-pointer flex items-center gap-1"
              >
                <span>تقديم مقترح تعديل</span>
                <ArrowRight className="w-3.5 h-3.5 rotate-180" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SLOTS MANAGEMENT */}
      {activeTab === 'slots' && (
        <div className="space-y-6">
          {/* Add Slot Form */}
          <div className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs space-y-4">
            <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#1F2A44] flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#0D4E8B]" />
              <span>إضافة موعد تجريبي متاح للطلاب (مجاني - مدته 20 دقيقة بالضبط)</span>
            </h3>

            <p className="text-xs text-[#64748B] leading-relaxed">
              المواعيد التي تضيفها هنا تظهر لأولياء الأمور لحجز حصة تجريبية مباشرة. مدة الموعد محددة بـ 20 دقيقة وتُحسب تلقائياً.
            </p>

            <form onSubmit={handleCreateSlot} className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#1F2A44] block">التاريخ</label>
                <input
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  value={newSlotDate}
                  onChange={(e) => setNewSlotDate(e.target.value)}
                  required
                  className="w-full h-10 px-3 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#1F2A44] block">وقت البداية</label>
                <input
                  type="time"
                  value={newSlotStart}
                  onChange={(e) => handleStartTimeChange(e.target.value)}
                  required
                  className="w-full h-10 px-3 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#1F2A44] block">وقت النهاية (20 دقيقة تلقائياً)</label>
                <input
                  type="time"
                  value={newSlotEnd}
                  onChange={(e) => setNewSlotEnd(e.target.value)}
                  required
                  className="w-full h-10 px-3 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none bg-slate-50"
                />
              </div>

              <div className="space-y-1 flex flex-col justify-end">
                <button
                  type="submit"
                  disabled={isAddingSlot}
                  className="w-full h-10 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] disabled:opacity-50 text-white text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isAddingSlot ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>إضافة الموعد</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Slots List */}
          <div className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs space-y-4">
            <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#1F2A44] flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#0D4E8B]" />
                <span>قائمة المواعيد ({slots.length})</span>
              </span>
              <span className="text-xs text-[#64748B] font-normal">
                المواعيد المحجوزة محمية ولا يمكن حذفها
              </span>
            </h3>

            {slots.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed border-[#CBD5E1] rounded-2xl space-y-2">
                <Calendar className="w-8 h-8 text-[#CBD5E1] mx-auto" />
                <p className="text-xs font-bold text-[#64748B]">لم تقم بإضافة أي مواعيد تجريبية بعد.</p>
                <p className="text-[11px] text-[#94A3B8]">
                  أضف مواعيدك المتاحة بالأعلى لتمكين أولياء الأمور من حجز حصص تجريبية معك.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#F1F5F9]">
                {slots.map((slot) => {
                  const isPast = new Date(`${slot.slotDate}T${slot.startTime}`).getTime() < Date.now();
                  return (
                    <div
                      key={slot.id}
                      className="py-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            slot.isBooked
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : slot.isAvailable && !isPast
                              ? 'bg-blue-50 text-[#0D4E8B] border border-blue-200'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          <Clock className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs sm:text-sm text-[#1F2A44]">
                              {new Date(slot.slotDate).toLocaleDateString('ar-EG', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                            <span className="font-mono text-xs text-[#64748B]" dir="ltr">
                              {slot.startTime.substring(0, 5)} - {slot.endTime.substring(0, 5)}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 mt-0.5">
                            {slot.isBooked ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                                <Lock className="w-3 h-3 text-emerald-600" />
                                <span>محجوز لطالب</span>
                              </span>
                            ) : slot.isAvailable && !isPast ? (
                              <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                                متاح للاختيار
                              </span>
                            ) : isPast ? (
                              <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                انقضى وقته
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                                مغلق إدارياً
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Delete Action (Only for non-booked, available, non-past slots) */}
                      {!slot.isBooked && slot.isAvailable && !isPast ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteSlot(slot.id)}
                          disabled={deletingSlotId === slot.id}
                          className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {deletingSlotId === slot.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <>
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>حذف الموعد</span>
                            </>
                          )}
                        </button>
                      ) : slot.isBooked ? (
                        <span className="text-[11px] text-emerald-800 font-bold bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>حصة مؤكدة مع طالب</span>
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: PROPOSE PROFILE DRAFT */}
      {activeTab === 'profile-draft' && (
        <div className="bg-white rounded-3xl border border-[#E2E8F0] p-6 sm:p-8 shadow-xs space-y-6">
          <div className="border-b border-[#F1F5F9] pb-4 space-y-1">
            <h3 className="font-['Cairo'] text-base font-bold text-[#1F2A44] flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#0D4E8B]" />
              <span>اقتراح تعديل الملف التعريفي للمراجعة الإدارية</span>
            </h3>
            <p className="text-xs text-[#64748B] leading-relaxed">
              لحماية موثوقية المنصة أمام أولياء الأمور، تخضع التعديلات لمراجعة سريعة من الإدارة قبل نشرها للجمهور. النسخة المعتمدة تظل ظاهرة للجميع لحين الموافقة.
            </p>
          </div>

          {/* Pending Draft Status Banner if exists */}
          {pendingDraft && (
            <div
              className={`p-4 rounded-2xl border text-xs sm:text-sm space-y-2 ${
                pendingDraft.status === 'pending_review'
                  ? 'bg-blue-50 border-blue-200 text-[#0D4E8B]'
                  : pendingDraft.status === 'needs_revision'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-slate-50 border-slate-200 text-slate-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold flex items-center gap-1.5">
                  <Clock3 className="w-4 h-4" />
                  <span>
                    {pendingDraft.status === 'pending_review'
                      ? 'يوجد مقترح تعديل قيد مراجعة الإدارة حالياً'
                      : pendingDraft.status === 'needs_revision'
                      ? 'مطلوب تعديل على مقترحك وفق ملاحظات الإدارة'
                      : 'حالة المسودة: ' + pendingDraft.status}
                  </span>
                </span>
                {pendingDraft.submittedAt && (
                  <span className="text-[11px] text-[#64748B]">
                    تاريخ الإرسال: {new Date(pendingDraft.submittedAt).toLocaleDateString('ar-EG')}
                  </span>
                )}
              </div>

              {pendingDraft.adminNotes && (
                <div className="p-3 rounded-xl bg-white/80 border border-inherit text-xs">
                  <span className="font-bold block mb-0.5">ملاحظات الإدارة:</span>
                  <p>{pendingDraft.adminNotes}</p>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmitProfileDraft} className="space-y-5">
            {/* Proposed Avatar Upload */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#1F2A44] block">
                الصورة الشخصية المقترحة (اختياري)
              </label>

              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl overflow-hidden border border-[#CBD5E1] bg-slate-50 shrink-0">
                  {draftAvatarPreview ? (
                    <img src={draftAvatarPreview} alt="صورة مقترحة" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                      <Camera className="w-6 h-6" />
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="px-3.5 py-2 rounded-xl bg-[#F0F6FD] hover:bg-[#E3EFFD] text-[#0D4E8B] text-xs font-bold cursor-pointer transition-colors inline-flex items-center gap-1.5">
                    {isUploadingAvatar ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Camera className="w-3.5 h-3.5" />
                    )}
                    <span>{isUploadingAvatar ? 'جاري الرفع...' : 'رفع صورة جديدة للمراجعة'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleAvatarFileChange}
                      className="hidden"
                      disabled={isUploadingAvatar}
                    />
                  </label>
                  <p className="text-[11px] text-[#64748B]">
                    تُحفظ الصورة المقترحة في تخزين خاص وتخضع لموافقة الإدارة قبل اعتمادها في ملفك المنشور.
                  </p>
                </div>
              </div>
            </div>

            {/* Headline */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#1F2A44] block">
                العنوان التعريفي المقترح (Headline) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={draftHeadline}
                onChange={(e) => setDraftHeadline(e.target.value)}
                placeholder="مثال: معلم رياضيات متميز في تبسيط المفاهيم لطلاب اللغات والتجريبي"
                required
                className="w-full h-11 px-3.5 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none"
              />
              <span className="text-[11px] text-[#64748B]">
                بين 10 و 250 حرفاً — يظهر مباشرة تحت اسمك في بطاقة المعلم.
              </span>
            </div>

            {/* Quote */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#1F2A44] block">
                اقتباس تبسيط المنهج للطفل (Help Child Quote)
              </label>
              <textarea
                rows={2}
                value={draftQuote}
                onChange={(e) => setDraftQuote(e.target.value)}
                placeholder="مثال: لا يوجد طالب ضعيف، بل توجد طريقة شرح لم تناسبه بعد."
                className="w-full p-3 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none"
              />
              <span className="text-[11px] text-[#64748B]">
                جملة ملهمة تعبر عن فلسفتك مع الطالب (حتى 350 حرفاً).
              </span>
            </div>

            {/* Summary */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#1F2A44] block">
                نبذة أسلوب التدريس وطريقة المتابعة
              </label>
              <textarea
                rows={5}
                value={draftSummary}
                onChange={(e) => setDraftSummary(e.target.value)}
                placeholder="اكتب بالتفصيل كيف تبسط المفاهيم، كيف تشجع الطالب، وكيف تتواصل مع ولي الأمر..."
                className="w-full p-3 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none"
              />
              <span className="text-[11px] text-[#64748B]">
                بين 20 و 2500 حرفاً.
              </span>
            </div>

            <div className="pt-2 flex items-center justify-end">
              <button
                type="submit"
                disabled={isSubmittingDraft}
                className="px-6 py-3 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] disabled:opacity-50 text-white text-xs sm:text-sm font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
              >
                {isSubmittingDraft ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>إرسال مقترح التعديل للمراجعة</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
