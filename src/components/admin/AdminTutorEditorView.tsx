import React, { useState, useEffect } from 'react';
import {
  AdminTutorFullDetail,
  AdminTutorSavePayload,
  SchoolCourseOptionDetail,
  TutorAvailableSlot,
  QuranAgeGroup,
  QuranLevel,
} from '../../types';
import { AdminService } from '../../services/adminService';
import { DataService } from '../../services/dataService';
import {
  ArrowRight,
  Save,
  Globe,
  GlobeLock,
  Upload,
  Plus,
  Trash2,
  Calendar,
  Clock,
  BookOpen,
  GraduationCap,
  ShieldAlert,
  User,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  Lock,
} from 'lucide-react';

interface AdminTutorEditorViewProps {
  initialDetail: AdminTutorFullDetail | null;
  isNew: boolean;
  onBack: () => void;
  onSaved: (tutorId: string) => void;
  onPreview: (tutorId: string) => void;
}

export const AdminTutorEditorView: React.FC<AdminTutorEditorViewProps> = ({
  initialDetail,
  isNew,
  onBack,
  onSaved,
  onPreview,
}) => {
  // Navigation tab
  const [activeTab, setActiveTab] = useState<
    'basics' | 'pricing' | 'offerings' | 'qualifications' | 'slots' | 'private' | 'pillars'
  >('basics');

  // Form State
  const [tutorId, setTutorId] = useState(initialDetail?.tutor.id || '');
  const [name, setName] = useState(initialDetail?.tutor.name || '');
  const [honorific, setHonorific] = useState(initialDetail?.tutor.honorific || 'أ.');
  const [headline, setHeadline] = useState(initialDetail?.tutor.headline || '');
  const [avatarUrl, setAvatarUrl] = useState(initialDetail?.tutor.avatarUrl || '');
  const [pendingAvatarPath, setPendingAvatarPath] = useState<string | null>(null);
  const [yearsOfExperience, setYearsOfExperience] = useState(
    initialDetail?.tutor.yearsOfExperience || 0
  );
  const [experienceBadgeText, setExperienceBadgeText] = useState(
    initialDetail?.tutor.experienceBadgeText || ''
  );
  const [verifiedCredentials, setVerifiedCredentials] = useState(
    initialDetail?.tutor.verifiedCredentials || false
  );
  const [helpChildQuote, setHelpChildQuote] = useState(initialDetail?.tutor.helpChildQuote || '');
  const [helpChildSummary, setHelpChildSummary] = useState(
    initialDetail?.tutor.helpChildSummary || ''
  );
  const [isPublished, setIsPublished] = useState(initialDetail?.tutor.isPublished || false);

  // Pricing State (labeled as Session Rate in UI)
  const [hourlyRateMin, setHourlyRateMin] = useState(initialDetail?.tutor.hourlyRateMin || 120);
  const [hourlyRateMax, setHourlyRateMax] = useState(initialDetail?.tutor.hourlyRateMax || 150);
  const [currency, setCurrency] = useState(initialDetail?.tutor.currency || 'ج.م');
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(
    initialDetail?.tutor.sessionDurationMinutes || 50
  );
  const [trialDurationMinutes, setTrialDurationMinutes] = useState(
    initialDetail?.tutor.trialDurationMinutes || 20
  );

  // School Offerings State
  const [allCourseOptions, setAllCourseOptions] = useState<SchoolCourseOptionDetail[]>([]);
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>(
    initialDetail?.schoolOfferingOptionIds || []
  );
  const [courseFilterStage, setCourseFilterStage] = useState('');
  const [courseFilterSubject, setCourseFilterSubject] = useState('');
  const [courseFilterCurriculum, setCourseFilterCurriculum] = useState('');

  // Quran Offerings State
  const [quranAges, setQuranAges] = useState<QuranAgeGroup[]>([]);
  const [quranLevels, setQuranLevels] = useState<QuranLevel[]>([]);
  const [quranOfferings, setQuranOfferings] = useState<Array<{ ageGroupId: string; levelId: string }>>(
    initialDetail?.quranOfferings || []
  );
  const [newQuranAgeId, setNewQuranAgeId] = useState('');
  const [newQuranLevelId, setNewQuranLevelId] = useState('');

  // Qualifications State
  const [qualifications, setQualifications] = useState(
    initialDetail?.qualifications || [
      { title: '', institution: '', verified: true, notes: '' },
    ]
  );

  // Private Info State
  const [fullLegalName, setFullLegalName] = useState(
    initialDetail?.privateInfo?.fullLegalName || ''
  );
  const [nationalIdNumber, setNationalIdNumber] = useState(
    initialDetail?.privateInfo?.nationalIdNumber || ''
  );
  const [countryCode, setCountryCode] = useState(
    initialDetail?.privateInfo?.countryCode || '+20'
  );
  const [phoneNumber, setPhoneNumber] = useState(
    initialDetail?.privateInfo?.phoneNumber || ''
  );
  const [whatsappNumber, setWhatsappNumber] = useState(
    initialDetail?.privateInfo?.whatsappNumber || ''
  );
  const [email, setEmail] = useState(initialDetail?.privateInfo?.email || '');
  const [internalNotes, setInternalNotes] = useState(
    initialDetail?.privateInfo?.internalNotes || ''
  );

  // Slots State
  const [slots, setSlots] = useState<TutorAvailableSlot[]>(initialDetail?.slots || []);
  const [newSlotDate, setNewSlotDate] = useState('');
  const [newSlotStart, setNewSlotStart] = useState('');
  const [newSlotEnd, setNewSlotEnd] = useState('');
  const [newSlotNotes, setNewSlotNotes] = useState('');
  const [isAddingSlot, setIsAddingSlot] = useState(false);

  // Methodology & Trial steps
  const [methodologyPillars, setMethodologyPillars] = useState(
    initialDetail?.methodologyPillars || [
      { title: 'تبسيط المفاهيم الصعبة', description: 'ربط الدرس بأمثلة عملية ممتعة تناسب عمر الطفل.', iconName: 'smile' },
      { title: 'الصبر والتشجيع المستمر', description: 'بناء ثقة الطالب بنفسه وتحويل رهبة المادة إلى حماس.', iconName: 'heart' },
      { title: 'تطبيق مباشر وتثبيت للمعلومة', description: 'حل تدريبات فورية للتأكد من استيعاب كل نقطة.', iconName: 'target' },
    ]
  );
  const [trialSteps, setTrialSteps] = useState(
    initialDetail?.trialSteps || [
      { stepNumber: 1, title: 'التعارف وكسر الجليد', description: 'حديث ودي خفيف مع الطالب لبناء الألفة وتخفيف أي توتر.' },
      { stepNumber: 2, title: 'تشخيص مستوى الاستيعاب', description: 'تحديد نقاط القوة والفجوات التعليمية التي تحتاج لدعم.' },
      { stepNumber: 3, title: 'شرح نموذج مبسط', description: 'شرح جزء من المنهج لتجربة أسلوب المعلم وتفاعله.' },
      { stepNumber: 4, title: 'خطة مقترحة مع ولي الأمر', description: 'مشاركة التوصيات وعدد الحصص الأنسب لتحقيق أفضل نتيجة.' },
    ]
  );

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load course options and Quran taxonomy on mount
  useEffect(() => {
    Promise.all([
      AdminService.getCourseOptionsWithDetails().catch(() => []),
      DataService.getQuranAgeGroups().catch(() => []),
      DataService.getQuranLevels().catch(() => []),
    ]).then(([opts, ages, lvls]) => {
      setAllCourseOptions(opts);
      setQuranAges(ages);
      setQuranLevels(lvls);
      if (ages.length > 0) setNewQuranAgeId(ages[0].id);
      if (lvls.length > 0) setNewQuranLevelId(lvls[0].id);
    });
  }, []);

  // Avatar Upload Handler via Supabase Storage
  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!tutorId.trim()) {
      setErrorMessage('يرجى كتابة معرف المعلم (ID) أولاً قبل رفع الصورة الشخصية.');
      return;
    }

    setIsUploadingAvatar(true);
    setErrorMessage(null);

    try {
      const { publicUrl, storagePath } = await AdminService.uploadAvatar(tutorId.trim(), file);
      setAvatarUrl(publicUrl);
      setPendingAvatarPath(storagePath);
      setSaveSuccessMsg('تم رفع الصورة الشخصية بنجاح.');
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'فشل رفع الصورة الشخصية.');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Offering Toggle
  const toggleOffering = (courseId: string) => {
    if (selectedOptionIds.includes(courseId)) {
      setSelectedOptionIds(selectedOptionIds.filter((id) => id !== courseId));
    } else {
      setSelectedOptionIds([...selectedOptionIds, courseId]);
    }
  };

  // Quran Offering Add/Remove
  const handleAddQuranOffering = () => {
    if (!newQuranAgeId || !newQuranLevelId) return;
    const exists = quranOfferings.some(
      (o) => o.ageGroupId === newQuranAgeId && o.levelId === newQuranLevelId
    );
    if (exists) {
      setErrorMessage('هذا المسار القرآني مضاف بالفعل للمعلم.');
      return;
    }
    setQuranOfferings([
      ...quranOfferings,
      { ageGroupId: newQuranAgeId, levelId: newQuranLevelId },
    ]);
  };

  const handleRemoveQuranOffering = (index: number) => {
    setQuranOfferings(quranOfferings.filter((_, i) => i !== index));
  };

  // Add Qualification
  const handleAddQualification = () => {
    setQualifications([
      ...qualifications,
      { title: '', institution: '', verified: true, notes: '' },
    ]);
  };

  const handleRemoveQualification = (index: number) => {
    setQualifications(qualifications.filter((_, i) => i !== index));
  };

  // Helper to add 20 minutes to HH:mm
  const add20MinutesToSlot = (timeStr: string): string => {
    if (!timeStr || !timeStr.includes(':')) return '';
    const [h, m] = timeStr.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return '';
    const totalMinutes = h * 60 + m + 20;
    const endH = Math.floor((totalMinutes / 60) % 24);
    const endM = totalMinutes % 60;
    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  };

  const handleSlotStartTimeChange = (val: string) => {
    setNewSlotStart(val);
    setNewSlotEnd(add20MinutesToSlot(val));
  };

  // Add Slot Handler
  const handleAddSlot = async () => {
    if (!newSlotDate || !newSlotStart || !newSlotEnd) {
      setErrorMessage('يرجى تحديد التاريخ ووقت البداية ووقت النهاية للموعد.');
      return;
    }

    const [startH, startM] = newSlotStart.split(':').map(Number);
    const [endH, endM] = newSlotEnd.split(':').map(Number);
    const durationMinutes = endH * 60 + endM - (startH * 60 + startM);
    if (durationMinutes !== 20) {
      setErrorMessage('مدة الحصة التجريبية المعتمدة هي 20 دقيقة بالضبط.');
      return;
    }

    if (!tutorId.trim()) {
      setErrorMessage('يرجى حفظ بيانات المعلم الأساسية أولاً قبل إضافة مواعيد تجريبية.');
      return;
    }

    setIsAddingSlot(true);
    setErrorMessage(null);

    try {
      const slotId = await AdminService.addSlot(
        tutorId.trim(),
        newSlotDate,
        newSlotStart,
        newSlotEnd,
        'Africa/Cairo',
        newSlotNotes
      );

      const addedSlot: TutorAvailableSlot = {
        id: slotId,
        tutorId: tutorId.trim(),
        slotDate: newSlotDate,
        startTime: newSlotStart,
        endTime: newSlotEnd,
        timezone: 'Africa/Cairo',
        isAvailable: true,
        notes: newSlotNotes || null,
      };

      setSlots([...slots, addedSlot]);
      setNewSlotDate('');
      setNewSlotStart('');
      setNewSlotEnd('');
      setNewSlotNotes('');
      setSaveSuccessMsg('تمت إضافة الموعد بنجاح.');
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'فشل إضافة الموعد.');
    } finally {
      setIsAddingSlot(false);
    }
  };

  // Confirm slot booking formally
  const handleConfirmBooking = async (slotId: string) => {
    const input = window.prompt('أدخل تفاصيل الحجز للطالب (اسم الطالب، هاتف ولي الأمر، أو كود الحجز):');
    if (input === null) return;
    const notes = input.trim();

    try {
      await AdminService.confirmSlotBooking(slotId, notes || undefined);
      setSlots(
        slots.map((s) =>
          s.id === slotId
            ? {
                ...s,
                isBooked: true,
                isAvailable: false,
                bookedAt: new Date().toISOString(),
                notes: notes || s.notes,
              }
            : s
        )
      );
      setSaveSuccessMsg('تم تأكيد حجز الموعد للطالب رسمياً وتحديث حالته.');
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'فشل تأكيد حجز الموعد.');
    }
  };

  // Slot Availability Toggle (administrative close / reopen for unbooked slots)
  const handleToggleSlotAvailability = async (slotId: string, currentAvailable: boolean) => {
    let note: string | undefined = undefined;
    if (currentAvailable) {
      const input = window.prompt('سبب الإغلاق الإداري للموعد (مثلاً: المعلم معتذر اليوم) - اختياري:');
      if (input !== null) {
        note = input.trim();
      }
    }
    try {
      await AdminService.toggleSlotAvailability(slotId, !currentAvailable, note);
      setSlots(
        slots.map((s) =>
          s.id === slotId
            ? { ...s, isAvailable: !currentAvailable, notes: note !== undefined ? note : s.notes }
            : s
        )
      );
      setSaveSuccessMsg(
        !currentAvailable
          ? 'تمت إعادة فتح الموعد وأصبح متاحاً للجمهور بتوقيت القاهرة.'
          : 'تم إغلاق الموعد إدارياً بنجاح.'
      );
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'فشل تحديث حالة الموعد.');
    }
  };

  // Delete Slot
  const handleDeleteSlot = async (slotId: string, isBooked?: boolean) => {
    if (isBooked) {
      setErrorMessage('لا يمكن حذف موعد مؤكد الحجز. الحجوزات المؤكدة محمية للحفاظ على سجلات الطلاب.');
      return;
    }
    if (!window.confirm('هل أنت متأكد من حذف هذا الموعد؟ يُفضل الإغلاق الإداري بدلاً من الحذف للحفاظ على السجلات.'))
      return;
    try {
      await AdminService.deleteSlot(slotId);
      setSlots(slots.filter((s) => s.id !== slotId));
      setSaveSuccessMsg('تم حذف الموعد.');
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'فشل حذف الموعد.');
    }
  };

  // Master Save Handler
  const handleSave = async (andPublish?: boolean) => {
    setIsSaving(true);
    setErrorMessage(null);
    setSaveSuccessMsg(null);

    const targetPublish = andPublish !== undefined ? andPublish : isPublished;

    try {
      const payload: AdminTutorSavePayload = {
        id: tutorId.trim().toLowerCase(),
        isNew,
        name,
        honorific,
        headline,
        avatarUrl,
        yearsOfExperience: Number(yearsOfExperience) || 0,
        experienceBadgeText,
        verifiedCredentials,
        helpChildQuote,
        helpChildSummary,
        targetStudentCases: [],
        curriculumTags: [],
        isPublished: targetPublish,
        hourlyRateMin: Number(hourlyRateMin) || 0,
        hourlyRateMax: Number(hourlyRateMax) || 0,
        currency,
        sessionDurationMinutes: Number(sessionDurationMinutes) || 50,
        trialDurationMinutes: Number(trialDurationMinutes) || 20,
        qualifications: qualifications.filter((q) => q.title.trim()),
        methodologyPillars,
        trialSteps,
        schoolOfferingOptionIds: selectedOptionIds,
        quranOfferings,
        privateInfo: {
          fullLegalName,
          nationalIdNumber,
          countryCode,
          phoneNumber,
          whatsappNumber,
          email,
          internalNotes,
        },
      };

      const savedId = await AdminService.saveTutor(payload, isNew);

      if (andPublish !== undefined) {
        await AdminService.toggleTutorPublish(savedId, andPublish);
        setIsPublished(andPublish);
      }

      // Save succeeded: clear pending path so it is not deleted
      setPendingAvatarPath(null);

      setSaveSuccessMsg(
        andPublish
          ? 'تم حفظ ونشر ملف المعلم في منصة شاطر بنجاح!'
          : 'تم حفظ كافة بيانات المعلم وتحديثها في قاعدة البيانات داخل معاملة واحدة بنجاح.'
      );
      setTimeout(() => setSaveSuccessMsg(null), 4000);

      onSaved(savedId);
    } catch (err: any) {
      // Safe cleanup: only delete newly uploaded avatar if DB does NOT point to it!
      // If network lost connection after successful DB commit, do NOT delete it!
      if (pendingAvatarPath && tutorId) {
        const deleted = await AdminService.safeCleanupPendingAvatar(
          tutorId.trim().toLowerCase(),
          pendingAvatarPath,
          avatarUrl
        );
        if (deleted) {
          setPendingAvatarPath(null);
          setAvatarUrl(initialDetail?.tutor.avatarUrl || '');
        }
      }
      setErrorMessage(err?.message || 'فشل حفظ بيانات المعلم.');
    } finally {
      setIsSaving(false);
    }
  };

  // Filtered course options for picker
  const filteredCourseOptions = allCourseOptions.filter((opt) => {
    if (courseFilterStage && opt.stageId !== courseFilterStage) return false;
    if (courseFilterSubject && opt.subjectId !== courseFilterSubject) return false;
    if (courseFilterCurriculum && opt.curriculumId !== courseFilterCurriculum) return false;
    return true;
  });

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-[#E2E8F0] shadow-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-xl border border-[#E2E8F0] hover:bg-slate-50 text-[#1F2A44] transition-colors cursor-pointer"
            title="العودة لقائمة المعلمين"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <div>
            <h2 className="font-['Cairo'] text-base sm:text-lg font-bold text-[#1F2A44] flex items-center gap-2">
              <span>{isNew ? 'إضافة معلم جديد' : `تعديل ملف: ${name || tutorId}`}</span>
              <span
                className={`text-xs font-bold inline-flex items-center gap-1 ${
                  isPublished ? 'text-emerald-700' : 'text-slate-500'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${isPublished ? 'bg-emerald-500' : 'bg-slate-400'}`}
                />
                {isPublished ? 'منشور' : 'غير منشور'}
              </span>
            </h2>
            <p className="text-xs text-[#64748B]">
              إدارة بيانات الملف والتسعير والتخصصات وبيانات التواصل الخاصة
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {!isNew && (
            <button
              type="button"
              onClick={() => onPreview(tutorId)}
              className="px-3.5 py-2 rounded-xl bg-[#F0F6FD] hover:bg-[#E2EFFD] text-[#0D4E8B] text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              title="معاينة الملف كما يراه أولياء الأمور"
            >
              <Eye className="w-4 h-4" />
              <span>معاينة</span>
            </button>
          )}

          <button
            type="button"
            disabled={isSaving}
            onClick={() => handleSave()}
            className="px-4 py-2 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs sm:text-sm font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>حفظ</span>
          </button>

          {!isNew && (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSave(!isPublished)}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                isPublished
                  ? 'bg-slate-100 text-slate-700 hover:bg-rose-50 hover:text-rose-700'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
              {isPublished ? (
                <>
                  <GlobeLock className="w-4 h-4" />
                  <span>إيقاف النشر</span>
                </>
              ) : (
                <>
                  <Globe className="w-4 h-4" />
                  <span>نشر في الموقع</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {saveSuccessMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm flex items-center gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold block">خطأ في العملية:</span>
            <span className="leading-relaxed">{errorMessage}</span>
          </div>
        </div>
      )}

      {/* Tabs Navigation (Segmented buttons) */}
      <div className="flex items-center gap-1 p-1 bg-[#F1F5F9] rounded-2xl overflow-x-auto text-xs font-bold scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveTab('basics')}
          className={`px-4 py-2.5 rounded-xl whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'basics' ? 'bg-white text-[#0D4E8B] shadow-xs' : 'text-[#64748B] hover:text-[#1F2A44]'
          }`}
        >
          البيانات الأساسية والصورة
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('pricing')}
          className={`px-4 py-2.5 rounded-xl whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'pricing' ? 'bg-white text-[#0D4E8B] shadow-xs' : 'text-[#64748B] hover:text-[#1F2A44]'
          }`}
        >
          سعر الحصة ومدتها
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('offerings')}
          className={`px-4 py-2.5 rounded-xl whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'offerings' ? 'bg-white text-[#0D4E8B] shadow-xs' : 'text-[#64748B] hover:text-[#1F2A44]'
          }`}
        >
          <span>التخصصات المعتمدة</span>
          <span className="px-1.5 py-0.2 rounded-full bg-slate-100 text-[10px] text-[#0D4E8B]">
            {selectedOptionIds.length + quranOfferings.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('qualifications')}
          className={`px-4 py-2.5 rounded-xl whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'qualifications' ? 'bg-white text-[#0D4E8B] shadow-xs' : 'text-[#64748B] hover:text-[#1F2A44]'
          }`}
        >
          المؤهلات والشهادات
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('slots')}
          className={`px-4 py-2.5 rounded-xl whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'slots' ? 'bg-white text-[#0D4E8B] shadow-xs' : 'text-[#64748B] hover:text-[#1F2A44]'
          }`}
        >
          <span>المواعيد التجريبية</span>
          <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-[10px] text-emerald-800">
            {slots.filter((s) => s.isAvailable).length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('private')}
          className={`px-4 py-2.5 rounded-xl whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'private' ? 'bg-white text-[#0D4E8B] shadow-xs' : 'text-[#64748B] hover:text-[#1F2A44]'
          }`}
        >
          <Lock className="w-3.5 h-3.5 text-slate-400" />
          <span>تواصل الإدارة الخاص</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('pillars')}
          className={`px-4 py-2.5 rounded-xl whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'pillars' ? 'bg-white text-[#0D4E8B] shadow-xs' : 'text-[#64748B] hover:text-[#1F2A44]'
          }`}
        >
          ركائز الشرح وخطوات التجربة
        </button>
      </div>

      {/* TAB 1: BASICS */}
      {activeTab === 'basics' && (
        <div className="bg-white p-5 sm:p-7 rounded-2xl border border-[#E2E8F0] space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Slug / ID */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#1F2A44]" htmlFor="tutor-id-input">
                معرف المعلم (Slug) <span className="text-rose-500">*</span>
              </label>
              <input
                id="tutor-id-input"
                type="text"
                dir="ltr"
                value={tutorId}
                disabled={!isNew}
                onChange={(e) => setTutorId(e.target.value)}
                placeholder="mohamed-ali-othman"
                className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none disabled:bg-slate-100 disabled:text-slate-500 font-mono text-left"
              />
              <p className="text-[11px] text-[#94A3B8]">
                يُستخدم في رابط ملف المعلم على الموقع: <span dir="ltr">/#tutor/{tutorId || 'slug'}</span>
              </p>
            </div>

            {/* Honorific & Name */}
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5 col-span-1">
                <label className="block text-xs font-bold text-[#1F2A44]">اللقب</label>
                <select
                  value={honorific}
                  onChange={(e) => setHonorific(e.target.value)}
                  className="w-full px-2 py-2 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none"
                >
                  <option value="أ.">أ.</option>
                  <option value="د.">د.</option>
                  <option value="م.">م.</option>
                  <option value="الشيخ">الشيخ</option>
                  <option value="الشيخة">الشيخة</option>
                </select>
              </div>

              <div className="space-y-1.5 col-span-2">
                <label className="block text-xs font-bold text-[#1F2A44]" htmlFor="tutor-name-input">
                  الاسم الكامل الظاهر <span className="text-rose-500">*</span>
                </label>
                <input
                  id="tutor-name-input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="محمد علي عثمان"
                  className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none"
                />
              </div>
            </div>
          </div>

          {/* Headline */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#1F2A44]" htmlFor="tutor-headline">
              العنوان التعريفي (Headline) <span className="text-rose-500">*</span>
            </label>
            <input
              id="tutor-headline"
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="معلم أول لغة عربية وتأسيس أطفال متميز وخبرة واسعة بالمنهج المصري"
              className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none"
            />
          </div>

          {/* Avatar Upload via Storage */}
          <div className="p-4 rounded-xl border border-[#E2E8F0] bg-[#F8F9FC] space-y-3">
            <label className="block text-xs font-bold text-[#1F2A44]">الصورة الشخصية للمعلم</label>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={name}
                  className="w-16 h-16 rounded-xl object-cover border border-[#E2E8F0] bg-white shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-slate-200 border border-[#E2E8F0] flex items-center justify-center text-slate-400 shrink-0">
                  <User className="w-8 h-8" />
                </div>
              )}

              <div className="space-y-1.5 flex-1 w-full">
                <div className="flex items-center gap-2">
                  <label className="px-3 py-1.5 rounded-xl bg-white border border-[#CBD5E1] hover:border-[#0D4E8B] text-[#0D4E8B] text-xs font-bold transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-xs">
                    {isUploadingAvatar ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    <span>{isUploadingAvatar ? 'جاري الرفع...' : 'رفع صورة من الجهاز'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleAvatarFileChange}
                      disabled={isUploadingAvatar}
                      className="hidden"
                    />
                  </label>
                  <span className="text-[11px] text-[#94A3B8]">
                    (JPEG, PNG, WebP — أقصى حجم 2MB)
                  </span>
                </div>
                <input
                  type="url"
                  dir="ltr"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="أو ضع رابط مباشر للصورة هنا..."
                  className="w-full px-3 py-1.5 rounded-xl border border-[#CBD5E1] text-xs text-left"
                />
              </div>
            </div>
          </div>

          {/* Experience */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#1F2A44]">عدد سنوات الخبرة</label>
              <input
                type="number"
                min="0"
                value={yearsOfExperience}
                onChange={(e) => setYearsOfExperience(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#1F2A44]">نص شارة الخبرة</label>
              <input
                type="text"
                value={experienceBadgeText}
                onChange={(e) => setExperienceBadgeText(e.target.value)}
                placeholder="خبرة ٧+ سنوات في تدريس المرحلة الابتدائية"
                className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none"
              />
            </div>
          </div>

          {/* Quotes and Bio */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#1F2A44]">
              اقتباس المعلم البارز (Help Child Quote)
            </label>
            <input
              type="text"
              value={helpChildQuote}
              onChange={(e) => setHelpChildQuote(e.target.value)}
              placeholder="كل طفل لديه قدرة فطرية على التفوق متى ما وجد التوجيه الصبور والتشجيع الصادق."
              className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#1F2A44]">
              النبذة التفصيلية عن أسلوب التدريس (Help Child Summary)
            </label>
            <textarea
              rows={4}
              value={helpChildSummary}
              onChange={(e) => setHelpChildSummary(e.target.value)}
              placeholder="أعتمد في شرحي على التبسيط التدريجي للمفاهيم، ومراعاة الفروق الفردية بين الطلاب، وتطبيق تدريبات فورية لترسيخ المعلومة..."
              className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none leading-relaxed"
            />
          </div>

          {/* Verified Credentials Toggle */}
          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="verified-credentials-toggle"
              checked={verifiedCredentials}
              onChange={(e) => setVerifiedCredentials(e.target.checked)}
              className="w-4 h-4 rounded text-[#0D4E8B] focus:ring-[#0D4E8B] cursor-pointer"
            />
            <label
              htmlFor="verified-credentials-toggle"
              className="text-xs font-bold text-[#1F2A44] cursor-pointer select-none"
            >
              تم تدقيق وتوثيق المؤهلات الأكاديمية والشهادات لهذا المعلم من قِبل إدارة شاطر
            </label>
          </div>
        </div>
      )}

      {/* TAB 2: PRICING & DURATION */}
      {activeTab === 'pricing' && (
        <div className="bg-white p-5 sm:p-7 rounded-2xl border border-[#E2E8F0] space-y-6">
          <div className="p-4 rounded-xl bg-[#F0F6FD] border border-[#CBD5E1] text-xs text-[#0D4E8B] leading-relaxed">
            <strong>ملاحظة تسعير شاطر:</strong> يُعرض سعر الحصة في الموقع لأولياء الأمور كسعر
            للحصة المحددة مدتها أدناه (مثلاً: 120 - 150 ج.م / 50 دقيقة)، ويتم تخزينهما في عمودي{' '}
            <code className="bg-white px-1.5 py-0.5 rounded font-mono text-[11px]">
              hourly_rate_min
            </code>{' '}
            و{' '}
            <code className="bg-white px-1.5 py-0.5 rounded font-mono text-[11px]">
              hourly_rate_max
            </code>
            .
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#1F2A44]">
                أقل سعر للحصة ({currency})
              </label>
              <input
                type="number"
                min="0"
                value={hourlyRateMin}
                onChange={(e) => setHourlyRateMin(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#1F2A44]">
                أعلى سعر للحصة ({currency})
              </label>
              <input
                type="number"
                min="0"
                value={hourlyRateMax}
                onChange={(e) => setHourlyRateMax(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#1F2A44]">العملة</label>
              <input
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#1F2A44]">
                مدة الحصة الاعتيادية (بالدقائق)
              </label>
              <input
                type="number"
                min="15"
                step="5"
                value={sessionDurationMinutes}
                onChange={(e) => setSessionDurationMinutes(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none"
              />
              <p className="text-[11px] text-[#94A3B8]">المعتاد لمنصة شاطر: 50 دقيقة أو 60 دقيقة.</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#1F2A44]">
                مدة الحصة التجريبية المجانية (بالدقائق)
              </label>
              <input
                type="number"
                min="10"
                step="5"
                value={trialDurationMinutes}
                onChange={(e) => setTrialDurationMinutes(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none"
              />
              <p className="text-[11px] text-[#94A3B8]">المعتاد لمنصة شاطر: 25 دقيقة أو 30 دقيقة.</p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: OFFERINGS (school_course_options & quran_offerings) */}
      {activeTab === 'offerings' && (
        <div className="bg-white p-5 sm:p-7 rounded-2xl border border-[#E2E8F0] space-y-8">
          {/* Section A: School Tracks */}
          <div className="space-y-4">
            <div>
              <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#1F2A44] flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#0D4E8B]" />
                <span>التخصصات المدرسية المعتمدة (School Track)</span>
              </h3>
              <p className="text-xs text-[#64748B]">
                اختر من التركيبات المعتمدة والمفعلة رسمياً في جدول{' '}
                <code className="font-mono text-[11px]">school_course_options</code>: الصف + المادة + المنهج.
              </p>
            </div>

            {/* Currently Selected Offerings List */}
            <div className="p-4 rounded-xl bg-[#F8F9FC] border border-[#E2E8F0] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1F2A44]">
                  التخصصات المدرسية المحددة حالياً ({selectedOptionIds.length}):
                </span>
                {selectedOptionIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedOptionIds([])}
                    className="text-xs text-rose-600 hover:underline cursor-pointer"
                  >
                    إلغاء تحديد الكل
                  </button>
                )}
              </div>

              {selectedOptionIds.length === 0 ? (
                <p className="text-xs text-[#94A3B8] italic py-2">
                  لم يتم اختيار أي تخصص مدرسي بعد.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2 pt-1">
                  {selectedOptionIds.map((optId) => {
                    const opt = allCourseOptions.find((o) => o.id === optId);
                    return (
                      <div
                        key={optId}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-[#CBD5E1] text-xs shadow-2xs"
                      >
                        <span className="font-bold text-[#0D4E8B]">{opt?.subjectName || 'مادة'}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-[#1F2A44]">{opt?.gradeName || 'صف'}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-[#64748B]">{opt?.curriculumName || 'منهج'}</span>
                        <button
                          type="button"
                          onClick={() => toggleOffering(optId)}
                          className="text-slate-400 hover:text-rose-600 p-0.5 rounded cursor-pointer mr-1"
                          title="إزالة هذا التخصص"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Filter options to pick from */}
            <div className="space-y-3 pt-1">
              <span className="text-xs font-bold text-[#1F2A44] block">
                تصفية واختيار من التركيبات المعتمدة:
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select
                  value={courseFilterStage}
                  onChange={(e) => setCourseFilterStage(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none"
                >
                  <option value="">جميع المراحل</option>
                  <option value="elementary">المرحلة الابتدائية</option>
                  <option value="preparatory">المرحلة الإعدادية</option>
                  <option value="secondary">المرحلة الثانوية</option>
                </select>

                <select
                  value={courseFilterSubject}
                  onChange={(e) => setCourseFilterSubject(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none"
                >
                  <option value="">جميع المواد</option>
                  <option value="arabic">اللغة العربية</option>
                  <option value="math">الرياضيات (Math)</option>
                  <option value="science">العلوم (Science)</option>
                  <option value="english">اللغة الإنجليزية</option>
                  <option value="physics">الفيزياء</option>
                  <option value="chemistry">الكيمياء</option>
                  <option value="biology">الأحياء</option>
                  <option value="social">الدراسات الاجتماعية</option>
                </select>

                <select
                  value={courseFilterCurriculum}
                  onChange={(e) => setCourseFilterCurriculum(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none"
                >
                  <option value="">جميع المناهج</option>
                  <option value="national_arabic">عربي (حكومي / أهلي)</option>
                  <option value="languages_experimental">لغات / تجريبي</option>
                </select>
              </div>

              {/* Course Options Checkboxes */}
              <div className="max-h-56 overflow-y-auto border border-[#E2E8F0] rounded-xl p-3 space-y-1.5 divide-y divide-slate-100">
                {filteredCourseOptions.length === 0 ? (
                  <div className="p-4 text-center text-xs text-[#94A3B8] space-y-1">
                    <p>لا توجد تركيبة معتمدة تطابق الفلاتر المختارة في جدول <code className="font-mono text-[11px]">school_course_options</code>.</p>
                    <p className="text-[11px] text-[#64748B]">إذا كانت هناك تركيبة مطلوبة غير مسجلة، يجب تفعيلها أولاً في جدول خيارات المواد.</p>
                  </div>
                ) : (
                  filteredCourseOptions.map((opt) => {
                    const isChecked = selectedOptionIds.includes(opt.id);
                    return (
                      <label
                        key={opt.id}
                        className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition-colors pt-2 ${
                          isChecked ? 'bg-[#F0F6FD]' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleOffering(opt.id)}
                            className="w-4 h-4 rounded text-[#0D4E8B] focus:ring-[#0D4E8B] cursor-pointer"
                          />
                          <span className="font-bold text-[#1F2A44]">{opt.gradeName}</span>
                          <span className="text-slate-400">·</span>
                          <span className="text-[#0D4E8B] font-bold">{opt.subjectName}</span>
                          <span className="text-slate-400">·</span>
                          <span className="text-[#64748B]">{opt.curriculumName}</span>
                        </div>
                        <span className="text-[10px] text-[#94A3B8] font-mono" dir="ltr">
                          {opt.stageId}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Section B: Quran & Foundation Tracks (tutor_quran_offerings) */}
          <div className="space-y-4 pt-6 border-t border-slate-200">
            <div>
              <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-emerald-800 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-emerald-700" />
                <span>مسار القرآن الكريم والتأسيس (Quran & Foundation Track)</span>
              </h3>
              <p className="text-xs text-[#64748B]">
                ربط تدريس المعلم بالفئة العمرية والبرنامج القرآني في جدول{' '}
                <code className="font-mono text-[11px]">tutor_quran_offerings</code>
              </p>
            </div>

            {/* Selected Quran Offerings */}
            <div className="p-4 rounded-xl bg-[#F0FDF4] border border-emerald-200 space-y-2.5">
              <span className="text-xs font-bold text-emerald-950 block">
                المسارات القرآنية المحددة حالياً ({quranOfferings.length}):
              </span>

              {quranOfferings.length === 0 ? (
                <p className="text-xs text-[#94A3B8] italic py-1">
                  لا توجد مسارات قرآنية مسجلة لهذا المعلم.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {quranOfferings.map((qo, idx) => {
                    const ageName = quranAges.find((a) => a.id === qo.ageGroupId)?.name || qo.ageGroupId;
                    const lvlName = quranLevels.find((l) => l.id === qo.levelId)?.name || qo.levelId;
                    return (
                      <div
                        key={idx}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-emerald-300 text-xs shadow-2xs"
                      >
                        <span className="font-bold text-emerald-800">{lvlName}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-700">{ageName}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveQuranOffering(idx)}
                          className="text-slate-400 hover:text-rose-600 p-0.5 rounded cursor-pointer mr-1"
                          title="إزالة هذا المسار"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Add Quran Offering Picker */}
            <div className="p-3.5 rounded-xl border border-[#E2E8F0] bg-[#F8F9FC] flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="flex-1">
                <select
                  value={newQuranLevelId}
                  onChange={(e) => setNewQuranLevelId(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none"
                >
                  {quranLevels.map((lvl) => (
                    <option key={lvl.id} value={lvl.id}>
                      {lvl.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex-1">
                <select
                  value={newQuranAgeId}
                  onChange={(e) => setNewQuranAgeId(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none"
                >
                  {quranAges.map((age) => (
                    <option key={age.id} value={age.id}>
                      {age.name} ({age.ageRange})
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleAddQuranOffering}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة المسار القرآني</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: QUALIFICATIONS */}
      {activeTab === 'qualifications' && (
        <div className="bg-white p-5 sm:p-7 rounded-2xl border border-[#E2E8F0] space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#1F2A44]">
                المؤهلات العلمية والشهادات
              </h3>
              <p className="text-xs text-[#64748B]">
                تُعرض في ملف المعلم لتأكيد الكفاءة الأكاديمية لأولياء الأمور
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddQualification}
              className="px-3 py-1.5 rounded-xl bg-[#F0F6FD] hover:bg-[#E2EFFD] text-[#0D4E8B] text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة مؤهل</span>
            </button>
          </div>

          <div className="space-y-3">
            {qualifications.map((q, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl border border-[#E2E8F0] bg-[#F8F9FC] space-y-3 relative"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#0D4E8B]">المؤهل #{idx + 1}</span>
                  {qualifications.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveQualification(idx)}
                      className="text-slate-400 hover:text-rose-600 text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-[#1F2A44]">اسم المؤهل / الشهادة</label>
                    <input
                      type="text"
                      value={q.title}
                      onChange={(e) => {
                        const updated = [...qualifications];
                        updated[idx].title = e.target.value;
                        setQualifications(updated);
                      }}
                      placeholder="بكالوريوس التربية - قسم الرياضيات"
                      className="w-full px-3 py-1.5 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-[#1F2A44]">الجهة المانحة / الجامعة</label>
                    <input
                      type="text"
                      value={q.institution}
                      onChange={(e) => {
                        const updated = [...qualifications];
                        updated[idx].institution = e.target.value;
                        setQualifications(updated);
                      }}
                      placeholder="جامعة عين شمس"
                      className="w-full px-3 py-1.5 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`qual-verified-${idx}`}
                      checked={q.verified}
                      onChange={(e) => {
                        const updated = [...qualifications];
                        updated[idx].verified = e.target.checked;
                        setQualifications(updated);
                      }}
                      className="w-3.5 h-3.5 rounded text-[#0D4E8B] focus:ring-[#0D4E8B] cursor-pointer"
                    />
                    <label
                      htmlFor={`qual-verified-${idx}`}
                      className="text-xs text-[#1F2A44] cursor-pointer font-medium"
                    >
                      مؤهل موثق من الإدارة (Verified)
                    </label>
                  </div>

                  <input
                    type="text"
                    value={q.notes || ''}
                    onChange={(e) => {
                      const updated = [...qualifications];
                      updated[idx].notes = e.target.value;
                      setQualifications(updated);
                    }}
                    placeholder="ملاحظات (مثلاً: بتقدير امتياز مع مرتبة الشرف)"
                    className="w-1/2 px-3 py-1 rounded-xl border border-[#CBD5E1] text-xs"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: SLOTS (Africa/Cairo Protected) */}
      {activeTab === 'slots' && (
        <div className="bg-white p-5 sm:p-7 rounded-2xl border border-[#E2E8F0] space-y-6">
          <div>
            <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#1F2A44]">
              المواعيد التجريبية للمعلم
            </h3>
            <p className="text-xs text-[#64748B]">
              المواعيد المحددة بالتاريخ والساعة التي تظهر لولي الأمر لحجز الحصة التجريبية (وفق توقيت القاهرة)
            </p>
          </div>

          {/* Add Slot Form */}
          <div className="p-4 rounded-xl bg-[#F8F9FC] border border-[#E2E8F0] space-y-3">
            <span className="text-xs font-bold text-[#0D4E8B] block">
              + إضافة موعد تجريبي جديد:
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#1F2A44]">تاريخ الموعد</label>
                <input
                  type="date"
                  value={newSlotDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setNewSlotDate(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#1F2A44]">وقت البداية (توقيت القاهرة)</label>
                <input
                  type="time"
                  value={newSlotStart}
                  onChange={(e) => handleSlotStartTimeChange(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#1F2A44]">وقت النهاية (20 دقيقة تلقائياً)</label>
                <input
                  type="time"
                  value={newSlotEnd}
                  onChange={(e) => setNewSlotEnd(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none bg-slate-50"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
              <input
                type="text"
                value={newSlotNotes}
                onChange={(e) => setNewSlotNotes(e.target.value)}
                placeholder="ملاحظات الموعد للإدارة (محجوز للطالب... / مغلق)..."
                className="flex-1 px-3 py-1.5 rounded-xl border border-[#CBD5E1] text-xs"
              />

              <button
                type="button"
                disabled={isAddingSlot}
                onClick={handleAddSlot}
                className="px-4 py-1.5 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
              >
                {isAddingSlot ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                <span>حفظ الموعد</span>
              </button>
            </div>
          </div>

          {/* Slots List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#1F2A44] block">
                المواعيد المسجلة ({slots.length}):
              </span>
              <div className="flex items-center gap-3 text-[11px] text-[#64748B]">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> متاح للحجز
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-purple-600" /> حجز مؤكد لطالب
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-slate-400" /> مغلق إدارياً
                </span>
              </div>
            </div>

            {slots.length === 0 ? (
              <p className="text-xs text-[#94A3B8] italic p-4 text-center border border-dashed border-[#CBD5E1] rounded-xl">
                لا توجد مواعيد مسجلة لهذا المعلم حتى الآن.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 border border-[#E2E8F0] rounded-xl overflow-hidden">
                {slots.map((s) => {
                  const isBooked = Boolean(s.isBooked);
                  const isAvailable = Boolean(s.isAvailable);

                  return (
                    <div
                      key={s.id}
                      className="p-3 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 text-xs"
                    >
                      {/* Slot Details */}
                      <div className="flex flex-wrap items-center gap-2.5">
                        <Calendar className="w-4 h-4 text-[#0D4E8B] shrink-0" />
                        <span className="font-bold text-[#1F2A44]">{s.slotDate}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-[#0D4E8B] font-bold">
                          {s.startTime.substring(0, 5)} - {s.endTime.substring(0, 5)}
                        </span>
                        <span className="text-[11px] text-[#94A3B8]">({s.timezone})</span>

                        {/* Status Badge */}
                        {isBooked ? (
                          <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 text-[11px] font-bold inline-flex items-center gap-1">
                            <Lock className="w-3 h-3 text-purple-600" />
                            حجز مؤكد لطالب
                          </span>
                        ) : isAvailable ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                            متاح للحجز
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 text-[11px] font-bold">
                            مغلق إدارياً
                          </span>
                        )}

                        {s.notes && (
                          <span className="text-[11px] text-slate-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                            {s.notes}
                          </span>
                        )}
                      </div>

                      {/* Slot Actions with explicit distinction */}
                      <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                        {isBooked ? (
                          <span
                            className="text-[11px] text-purple-800 font-bold px-2 py-1 rounded bg-purple-50 inline-flex items-center gap-1"
                            title="المواعيد المؤكدة محمية من التعديل أو الحذف للحفاظ على سجلات الطلاب"
                          >
                            <Lock className="w-3 h-3" />
                            محمي (حجز مؤكد)
                          </span>
                        ) : isAvailable ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleConfirmBooking(s.id)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors cursor-pointer border border-purple-200"
                              title="تسجيل وتأكيد حجز رسمي لطالب على هذا الموعد"
                            >
                              تأكيد حجز لطالب
                            </button>

                            <button
                              type="button"
                              onClick={() => handleToggleSlotAvailability(s.id, true)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
                              title="إغلاق الموعد مؤقتاً بدون تسجيل حجز"
                            >
                              إغلاق إداري
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteSlot(s.id, false)}
                              className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                              title="حذف الموعد نهائياً"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleToggleSlotAvailability(s.id, false)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer border border-emerald-200"
                              title="إعادة فتح الموعد وجعله متاحاً للحجز"
                            >
                              إعادة فتح الموعد
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteSlot(s.id, false)}
                              className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                              title="حذف الموعد نهائياً"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: PRIVATE INFO */}
      {activeTab === 'private' && (
        <div className="bg-white p-5 sm:p-7 rounded-2xl border border-[#E2E8F0] space-y-6">
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
            <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <strong className="block font-bold">بيانات خاصة بالإدارة فقط (سري ومحمي بالكامل):</strong>
              <p className="leading-relaxed">
                هذه البيانات تُحفظ في جدول منفصل تماماً <code className="font-mono text-[11px]">public.tutor_private_info</code> ولا يستطيع أي زائر أو متصفح عادي الوصول إليها بأي شكل وفق سياسات RLS الصارمة.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#1F2A44]">
                الاسم القانوني الكامل (في البطاقة)
              </label>
              <input
                type="text"
                value={fullLegalName}
                onChange={(e) => setFullLegalName(e.target.value)}
                placeholder="محمد علي عثمان إبراهيم"
                className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#1F2A44]">الرقم القومي / الهوية</label>
              <input
                type="text"
                dir="ltr"
                value={nationalIdNumber}
                onChange={(e) => setNationalIdNumber(e.target.value)}
                placeholder="2900101..."
                className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none text-left"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#1F2A44]">رمز الدولة</label>
              <input
                type="text"
                dir="ltr"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none text-left"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#1F2A44]">رقم هاتف الاتصال</label>
              <input
                type="tel"
                dir="ltr"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="01012345678"
                className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none text-left"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#1F2A44]">رقم الواتساب</label>
              <input
                type="tel"
                dir="ltr"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                placeholder="01012345678"
                className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none text-left"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#1F2A44]">البريد الإلكتروني الشخصي للمعلم</label>
            <input
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tutor@gmail.com"
              className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none text-left"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#1F2A44]">ملاحظات الإدارة الداخلية</label>
            <textarea
              rows={3}
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="ملاحظات المقابلة الشخصية، تقييم الإدارة للأسلوب، الاتفاق المالي الخاص..."
              className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none leading-relaxed"
            />
          </div>
        </div>
      )}

      {/* TAB 7: PILLARS & TRIAL STEPS */}
      {activeTab === 'pillars' && (
        <div className="bg-white p-5 sm:p-7 rounded-2xl border border-[#E2E8F0] space-y-6">
          <div>
            <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#1F2A44]">
              ركائز التدريس وخطوات الحصة التجريبية
            </h3>
            <p className="text-xs text-[#64748B]">
              تُعرض في ملف المعلم لتعريف ولي الأمر بما يميّز أسلوبه وتفاصيل التجربة المجانية
            </p>
          </div>

          {/* Methodology Pillars */}
          <div className="space-y-3">
            <span className="text-xs font-bold text-[#0D4E8B] block">ركائز أسلوب التدريس:</span>
            {methodologyPillars.map((p, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl border border-[#E2E8F0] bg-[#F8F9FC] grid grid-cols-1 sm:grid-cols-3 gap-2"
              >
                <input
                  type="text"
                  value={p.title}
                  onChange={(e) => {
                    const updated = [...methodologyPillars];
                    updated[idx].title = e.target.value;
                    setMethodologyPillars(updated);
                  }}
                  placeholder="عنوان الركيزة"
                  className="px-3 py-1.5 rounded-xl border border-[#CBD5E1] text-xs font-bold"
                />
                <input
                  type="text"
                  value={p.description}
                  onChange={(e) => {
                    const updated = [...methodologyPillars];
                    updated[idx].description = e.target.value;
                    setMethodologyPillars(updated);
                  }}
                  placeholder="شرح الركيزة"
                  className="sm:col-span-2 px-3 py-1.5 rounded-xl border border-[#CBD5E1] text-xs"
                />
              </div>
            ))}
          </div>

          {/* Trial Steps */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <span className="text-xs font-bold text-emerald-800 block">خطوات ما يحدث في الحصة التجريبية:</span>
            {trialSteps.map((s, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl border border-[#E2E8F0] bg-[#F8F9FC] grid grid-cols-1 sm:grid-cols-3 gap-2"
              >
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#0D4E8B] text-white flex items-center justify-center text-[10px] font-bold">
                    {idx + 1}
                  </span>
                  <input
                    type="text"
                    value={s.title}
                    onChange={(e) => {
                      const updated = [...trialSteps];
                      updated[idx].title = e.target.value;
                      setTrialSteps(updated);
                    }}
                    placeholder="عنوان الخطوة"
                    className="flex-1 px-3 py-1.5 rounded-xl border border-[#CBD5E1] text-xs font-bold"
                  />
                </div>
                <input
                  type="text"
                  value={s.description}
                  onChange={(e) => {
                    const updated = [...trialSteps];
                    updated[idx].description = e.target.value;
                    setTrialSteps(updated);
                  }}
                  placeholder="شرح ما يحدث في هذه الخطوة"
                  className="sm:col-span-2 px-3 py-1.5 rounded-xl border border-[#CBD5E1] text-xs"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Floating / Sticky Save Bar */}
      <div className="bg-white p-4 rounded-2xl border border-[#E2E8F0] shadow-sm flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-bold text-[#64748B] hover:text-[#1F2A44] transition-colors cursor-pointer"
        >
          إلغاء والعودة
        </button>

        <div className="flex items-center gap-2">
          {!isNew && (
            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSave(!isPublished)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                isPublished
                  ? 'bg-slate-100 text-slate-700 hover:bg-rose-50 hover:text-rose-700'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
              {isPublished ? 'إيقاف النشر' : 'نشر المعلم في الموقع'}
            </button>
          )}

          <button
            type="button"
            disabled={isSaving}
            onClick={() => handleSave()}
            className="px-6 py-2 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs sm:text-sm font-bold shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>حفظ بيانات المعلم</span>
          </button>
        </div>
      </div>
    </div>
  );
};
