import React, { useState, useEffect } from 'react';
import {
  AdminTutorFullDetail,
  AdminTutorSavePayload,
  SchoolCourseOptionDetail,
  TutorAvailableSlot,
  TutorPrivateSlot,
  QuranAgeGroup,
  QuranLevel,
  AdminProfileDraftItem,
} from '../../types';
import { AdminService } from '../../services/adminService';
import { DataService } from '../../services/dataService';
import {
  AdminEditorTabTarget,
  evaluateTutorProfileReadiness,
  evaluateIndicativePriceGuidance,
  TutorInitialQualityReviewRecord,
} from '../../utils/tutorReadinessAndContact';
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
  ShieldCheck,
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
  initialTab?: AdminEditorTabTarget;
  onBack: () => void;
  onSaved: (tutorId: string) => void;
  onPreview: (tutorId: string) => void;
}

export const AdminTutorEditorView: React.FC<AdminTutorEditorViewProps> = ({
  initialDetail,
  isNew,
  initialTab = 'basics',
  onBack,
  onSaved,
  onPreview,
}) => {
  // Navigation tab
  const [activeTab, setActiveTab] = useState<AdminEditorTabTarget>(initialTab || 'basics');

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Form State
  const [tutorId, setTutorId] = useState(initialDetail?.tutor.id || '');
  const [name, setName] = useState(initialDetail?.tutor.name || '');
  const [honorific, setHonorific] = useState(initialDetail?.tutor.honorific || 'أ.');
  const [headline, setHeadline] = useState(initialDetail?.tutor.headline || '');
  const [avatarUrl, setAvatarUrl] = useState(initialDetail?.tutor.avatarUrl || '');
  const [isAvatarBrokenAtRuntime, setIsAvatarBrokenAtRuntime] = useState(false);
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

  // Trial Slots State
  const [slots, setSlots] = useState<TutorAvailableSlot[]>(initialDetail?.slots || []);
  const [newSlotDate, setNewSlotDate] = useState('');
  const [newSlotStart, setNewSlotStart] = useState('');
  const [newSlotEnd, setNewSlotEnd] = useState('');
  const [newSlotNotes, setNewSlotNotes] = useState('');
  const [isAddingSlot, setIsAddingSlot] = useState(false);

  // Paid Private Slots State
  const [privateSlots, setPrivateSlots] = useState<TutorPrivateSlot[]>([]);
  const [privateSlotsLoadError, setPrivateSlotsLoadError] = useState<string | null>(null);
  const [readinessLoadError, setReadinessLoadError] = useState<string | null>(null);
  const [newPrivateDate, setNewPrivateDate] = useState('');
  const [newPrivateStart, setNewPrivateStart] = useState('');
  const [newPrivateDuration, setNewPrivateDuration] = useState<number>(
    initialDetail?.tutor.sessionDurationMinutes || 50
  );
  const [newPrivatePrice, setNewPrivatePrice] = useState<number>(
    initialDetail?.tutor.hourlyRateMin || 120
  );
  const [newPrivateCurrency, setNewPrivateCurrency] = useState<string>(
    initialDetail?.tutor.currency || 'ج.م'
  );
  const [newPrivateNotes, setNewPrivateNotes] = useState('');
  const [isAddingPrivateSlot, setIsAddingPrivateSlot] = useState(false);

  // Quality Review State
  const [qualityReviewState, setQualityReviewState] = useState<TutorInitialQualityReviewRecord | null>(null);
  const [qrAvatarApproved, setQrAvatarApproved] = useState(false);
  const [qrPriceApproved, setQrPriceApproved] = useState(false);
  const [qrNotes, setQrNotes] = useState('');
  const [isSavingQualityReview, setIsSavingQualityReview] = useState(false);

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

  // Pending profile draft review state (e.g. avatar-only draft)
  const [pendingDraft, setPendingDraft] = useState<AdminProfileDraftItem | null>(null);
  const [draftReviewNotes, setDraftReviewNotes] = useState('');
  const [isReviewingDraft, setIsReviewingDraft] = useState(false);

  const loadPendingDraftForTutor = async (id: string) => {
    if (!id) return;
    try {
      const drafts = await AdminService.getPendingProfileDrafts(id);
      setPendingDraft(drafts.length > 0 ? drafts[0] : null);
    } catch {
      setPendingDraft(null);
    }
  };

  const loadEditorSlotsAndReadiness = async (id: string) => {
    if (!id) return;
    setPrivateSlotsLoadError(null);
    setReadinessLoadError(null);

    try {
      const pSlots = await AdminService.getTutorPrivateSlotsForAdmin(id);
      setPrivateSlots(pSlots);
    } catch (err: any) {
      setPrivateSlots([]);
      setPrivateSlotsLoadError(
        err?.message || 'تعذر جلب المواعيد الخاصة المدفوعة من الخادم.'
      );
    }

    try {
      const res = await AdminService.evaluateTutorReadinessById(id);
      if (res.evaluationError) {
        setReadinessLoadError(
          res.evaluationErrorMessage || 'تعذر التحقق من جاهزية الملف من الخادم.'
        );
      }
      setQualityReviewState({
        tutorId: id,
        avatarQualityApproved: res.initialQualityReview.avatarApprovalMatchesCurrentUrl,
        approvedAvatarUrl: res.initialQualityReview.avatarApprovalMatchesCurrentUrl
          ? (initialDetail?.tutor.avatarUrl || avatarUrl || null)
          : null,
        priceQualityApproved: res.initialQualityReview.priceApprovalMatchesCurrentPricing,
        approvedPriceAmount: initialDetail?.tutor.hourlyRateMin ?? Number(hourlyRateMin) ?? 0,
        approvedCurrency: initialDetail?.tutor.currency || currency || 'ج.م',
        approvedDurationMinutes:
          initialDetail?.tutor.sessionDurationMinutes ?? Number(sessionDurationMinutes) ?? 50,
        reviewNotes: res.initialQualityReview.reviewNotes,
        reviewedAt: res.initialQualityReview.reviewedAt,
      });
      setQrAvatarApproved(res.initialQualityReview.avatarApprovalMatchesCurrentUrl);
      setQrPriceApproved(res.initialQualityReview.priceApprovalMatchesCurrentPricing);
      setQrNotes(res.initialQualityReview.reviewNotes || '');
    } catch (err: any) {
      setReadinessLoadError(
        err?.message || 'تعذر تقييم جاهزية ملف المعلم من الخادم.'
      );
    }
  };

  // Load course options, Quran taxonomy, private slots, and quality review on mount
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

    if (!isNew && initialDetail?.tutor.id) {
      loadPendingDraftForTutor(initialDetail.tutor.id);
      loadEditorSlotsAndReadiness(initialDetail.tutor.id);
    }
  }, [isNew, initialDetail?.tutor.id]);

  useEffect(() => {
    setIsAvatarBrokenAtRuntime(false);
  }, [avatarUrl]);

  const handleReviewPendingDraft = async (action: 'approve' | 'needs_revision' | 'reject') => {
    if (!pendingDraft) return;
    if ((action === 'needs_revision' || action === 'reject') && !draftReviewNotes.trim()) {
      setErrorMessage('يرجى كتابة سبب طلب التعديل أو الرفض ليظهر للمعلم.');
      return;
    }

    setIsReviewingDraft(true);
    setErrorMessage(null);
    setSaveSuccessMsg(null);

    try {
      await AdminService.reviewProfileDraft(pendingDraft.id, action, draftReviewNotes.trim() || undefined);
      setPendingDraft(null);
      setDraftReviewNotes('');

      if (action === 'approve' && tutorId) {
        const refreshed = await AdminService.getTutorForEdit(tutorId);
        setAvatarUrl(refreshed.tutor.avatarUrl || '');
        setHeadline(refreshed.tutor.headline || '');
        setHelpChildQuote(refreshed.tutor.helpChildQuote || '');
        setHelpChildSummary(refreshed.tutor.helpChildSummary || '');
      }

      setSaveSuccessMsg(
        action === 'approve'
          ? 'تم اعتماد التعديل وتحديث ملف المعلم بنجاح.'
          : action === 'needs_revision'
          ? 'تم إرسال ملاحظة طلب التعديل إلى المعلم.'
          : 'تم رفض المسودة.'
      );
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'فشل تنفيذ قرار مراجعة المسودة.');
    } finally {
      setIsReviewingDraft(false);
    }
  };

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
      setSaveSuccessMsg('تمت إضافة الموعد التجريبي بنجاح.');
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'فشل إضافة الموعد.');
    } finally {
      setIsAddingSlot(false);
    }
  };

  // Add Paid Private Slot Handler
  const handleAddPrivateSlot = async () => {
    if (!newPrivateDate || !newPrivateStart) {
      setErrorMessage('يرجى تحديد تاريخ ووقت بداية الحصة الخاصة المدفوعة.');
      return;
    }

    if (!tutorId.trim()) {
      setErrorMessage('يرجى حفظ بيانات المعلم الأساسية أولاً قبل إضافة مواعيد خاصة مدفوعة.');
      return;
    }

    const durationVal = Number(newPrivateDuration);
    if (!Number.isInteger(durationVal) || durationVal < 30 || durationVal > 120) {
      setErrorMessage('مدة الحصة الخاصة يجب أن تكون بين 30 و120 دقيقة.');
      return;
    }

    const priceVal = Number(newPrivatePrice);
    if (!Number.isInteger(priceVal) || priceVal < 1 || priceVal > 100000) {
      setErrorMessage('سعر الحصة الخاصة المدفوعة يجب أن يكون رقماً صحيحاً أكبر من صفر (1 إلى 100,000).');
      return;
    }

    const activeSchoolCount = selectedOptionIds.length;
    const activeQuranCount = quranOfferings.length;
    if (activeSchoolCount + activeQuranCount === 0) {
      setErrorMessage('يرجى تحديد تخصص معتمد واحد على الأقل للمعلم في تبويب «التخصصات المعتمدة» قبل إضافة موعد حصة خاصة.');
      return;
    }

    const firstCourseOptId = selectedOptionIds[0] || null;
    const firstCourseOpt = firstCourseOptId
      ? allCourseOptions.find((o) => o.id === firstCourseOptId)
      : null;
    const firstQuranOffering = quranOfferings[0] || null;
    const computedSpecLabel = firstCourseOpt
      ? `${firstCourseOpt.subjectName} - ${firstCourseOpt.gradeName}`
      : firstQuranOffering
      ? 'القرآن الكريم والتأسيس'
      : 'حصة خاصة 1:1';

    const [sh, sm] = newPrivateStart.split(':').map(Number);
    const totalEndMins = sh * 60 + sm + durationVal;
    const endH = Math.floor((totalEndMins / 60) % 24);
    const endM = totalEndMins % 60;
    const computedEndTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

    setIsAddingPrivateSlot(true);
    setErrorMessage(null);

    try {
      const slotId = await AdminService.addPrivateSlotForTutor({
        tutorId: tutorId.trim(),
        slotDate: newPrivateDate,
        startTime: newPrivateStart,
        endTime: computedEndTime,
        durationMinutes: durationVal,
        priceAmount: priceVal,
        currency: newPrivateCurrency || currency || 'ج.م',
        timezone: 'Africa/Cairo',
        specializationLabel: computedSpecLabel,
        offeringCourseOptionId: firstCourseOptId,
        quranAgeGroupId: !firstCourseOptId && firstQuranOffering ? firstQuranOffering.ageGroupId : null,
        quranLevelId: !firstCourseOptId && firstQuranOffering ? firstQuranOffering.levelId : null,
      });

      const refreshedPrivate = await AdminService.getTutorPrivateSlotsForAdmin(tutorId.trim()).catch(() => null);
      if (refreshedPrivate) {
        setPrivateSlotsLoadError(null);
        setPrivateSlots(refreshedPrivate);
      } else {
        setPrivateSlots([
          ...privateSlots,
          {
            id: slotId,
            tutorId: tutorId.trim(),
            specializationLabel: computedSpecLabel,
            offeringCourseOptionId: firstCourseOptId,
            quranAgeGroupId: !firstCourseOptId && firstQuranOffering ? firstQuranOffering.ageGroupId : null,
            quranLevelId: !firstCourseOptId && firstQuranOffering ? firstQuranOffering.levelId : null,
            slotDate: newPrivateDate,
            startTime: newPrivateStart,
            endTime: computedEndTime,
            timezone: 'Africa/Cairo',
            durationMinutes: durationVal,
            priceAmount: priceVal,
            currency: newPrivateCurrency || currency || 'ج.م',
            isAvailable: true,
            isBooked: false,
            adminSuspended: false,
          },
        ]);
      }

      setNewPrivateDate('');
      setNewPrivateStart('');
      setNewPrivateNotes('');
      setSaveSuccessMsg('تمت إضافة موعد الحصة الخاصة المدفوعة بنجاح.');
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'فشل إضافة موعد الحصة الخاصة المدفوعة.');
    } finally {
      setIsAddingPrivateSlot(false);
    }
  };

  // Save Initial Quality Review Handler
  const handleSaveQualityReview = async () => {
    if (!tutorId.trim()) return;
    setIsSavingQualityReview(true);
    setErrorMessage(null);
    try {
      const saved = await AdminService.saveTutorInitialQualityReview({
        tutorId: tutorId.trim(),
        avatarQualityApproved: qrAvatarApproved,
        approvedAvatarUrl: avatarUrl,
        priceQualityApproved: qrPriceApproved,
        approvedPriceAmount: Number(hourlyRateMin) || 0,
        approvedCurrency: currency,
        approvedDurationMinutes: Number(sessionDurationMinutes) || 50,
        reviewNotes: qrNotes.trim() || undefined,
      });
      setQualityReviewState(saved);
      setSaveSuccessMsg('تم حفظ اعتماد مراجعة الجودة الأولية بنجاح.');
      setTimeout(() => setSaveSuccessMsg(null), 3500);
    } catch (err: any) {
      setErrorMessage(err?.message || 'تعذر حفظ مراجعة الجودة الأولية.');
    } finally {
      setIsSavingQualityReview(false);
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

  // Live readiness evaluation in editor
  const readinessPolicy = AdminService.getReadinessPolicy();
  const combinedEditorError = privateSlotsLoadError || readinessLoadError;
  const editorReadiness = evaluateTutorProfileReadiness({
    tutor: {
      id: tutorId || 'draft',
      name,
      headline,
      avatarUrl,
      helpChildQuote,
      helpChildSummary,
      hourlyRateMin: Number(hourlyRateMin) || 0,
      hourlyRateMax: Number(hourlyRateMax) || 0,
      currency,
      sessionDurationMinutes: Number(sessionDurationMinutes) || 50,
      trialDurationMinutes: Number(trialDurationMinutes) || 20,
      isPublished,
    },
    activeSpecializationsCount: selectedOptionIds.length + quranOfferings.length,
    trialSlots: slots,
    privateSlots,
    isAvatarBrokenAtRuntime,
    evaluationError: !isNew && Boolean(combinedEditorError),
    evaluationErrorMessage: combinedEditorError,
    policy: readinessPolicy,
    qualityReview: qualityReviewState,
  });

  const livePriceGuidance = evaluateIndicativePriceGuidance(
    Number(hourlyRateMin) || 0,
    currency,
    Number(sessionDurationMinutes) || 50,
    readinessPolicy
  );

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
            <span className="leading-relaxed whitespace-pre-line">{errorMessage}</span>
          </div>
        </div>
      )}

      {/* Unified 6/6 Readiness & Initial Quality Review Card in Editor */}
      {!isNew && (
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-5 space-y-4 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  editorReadiness.evaluationError
                    ? 'bg-rose-50 text-rose-700'
                    : editorReadiness.isReadyForInitialPublish
                    ? 'bg-emerald-50 text-emerald-700'
                    : editorReadiness.isDataComplete6of6
                    ? 'bg-blue-50 text-[#0D4E8B]'
                    : 'bg-amber-50 text-amber-700'
                }`}
              >
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-['Cairo'] text-sm font-bold text-[#1F2A44]">
                    جاهزية الملف للنشر ومراجعة الجودة الأولية
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold tabular-nums ${
                      editorReadiness.evaluationError
                        ? 'bg-rose-100 text-rose-800'
                        : editorReadiness.isReadyForInitialPublish
                        ? 'bg-emerald-100 text-emerald-800'
                        : editorReadiness.isDataComplete6of6
                        ? 'bg-blue-100 text-[#0D4E8B]'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {editorReadiness.evaluationError
                      ? `${editorReadiness.statusBadgeLabel} (تعذر التحقق)`
                      : `${editorReadiness.statusBadgeLabel} (${editorReadiness.completedRequirementsCount ?? 0}/${editorReadiness.totalRequirementsCount} · ${editorReadiness.completionPercentage ?? 0}%)`}
                  </span>
                </div>
                {editorReadiness.evaluationError ? (
                  <p className="text-[11px] text-rose-700 font-bold">
                    تجريبي متاح: تعذر التحقق · خاص مدفوع متاح: تعذر التحقق · تغطية الأيام: —
                  </p>
                ) : (
                  <p className="text-[11px] text-[#64748B]">
                    تجريبي متاح: <strong className="tabular-nums">{editorReadiness.validTrialSlotsCount}</strong> · خاص مدفوع متاح:{' '}
                    <strong className="tabular-nums">{editorReadiness.validPaidPrivateSlotsCount}</strong> · تغطية الأيام:{' '}
                    <strong className="tabular-nums">{editorReadiness.distinctUpcomingDaysCount}</strong> يوم
                  </p>
                )}
              </div>
            </div>

            {editorReadiness.evaluationError && tutorId && (
              <button
                type="button"
                onClick={() => loadEditorSlotsAndReadiness(tutorId)}
                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
              >
                إعادة التحقق
              </button>
            )}
          </div>

          {editorReadiness.evaluationError ? (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span className="leading-relaxed">
                {editorReadiness.evaluationErrorMessage ||
                  'تعذر جلب بيانات المواعيد أو الجاهزية من الخادم لتقييم المتطلبات الستة بدقة.'}
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {editorReadiness.requirements.map((item) => (
                <div
                  key={item.key}
                  className={`p-3 rounded-xl border text-xs flex flex-col justify-between gap-2 ${
                    item.completed
                      ? 'bg-emerald-50/40 border-emerald-200'
                      : 'bg-amber-50/60 border-amber-200'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="font-bold text-[#1F2A44]">{item.title}</span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          item.completed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {item.completed ? 'مكتمل' : 'ناقص'}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#64748B] leading-relaxed">
                      {item.completed ? item.statusText : item.missingReason || item.statusText}
                    </p>
                  </div>

                  {!item.completed && (
                    <button
                      type="button"
                      onClick={() => setActiveTab(item.adminTargetTab)}
                      className="self-start px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 text-[#0D4E8B] border border-[#CBD5E1] text-[11px] font-bold cursor-pointer"
                    >
                      {item.adminActionLabel}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Initial Quality Review Section (For First Publication) */}
          {!isPublished && (
            <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-[#1F2A44] block">
                    مراجعة الجودة البشرية قبل النشر لأول مرة (منفصلة عن اكتمال البيانات 6/6):
                  </span>
                  <span className="text-[11px] text-[#64748B]">
                    يرتبط الاعتماد برابط الصورة الحالي وبالسعر والعملة والمدة الحالية. إذا غيّر المعلم الصورة أو السعر قبل النشر، يُطلب تأكيد الجودة للقيم الجديدة.
                  </span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                    editorReadiness.initialQualityReview.isQualityReviewComplete
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {editorReadiness.initialQualityReview.isQualityReviewComplete
                    ? 'معتمد للنشر الأول'
                    : 'بانتظار اعتماد الجودة'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label className="flex items-start gap-2 p-2.5 rounded-xl bg-white border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={qrAvatarApproved}
                    onChange={(e) => setQrAvatarApproved(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded text-[#0D4E8B] cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-[#1F2A44] block">
                      تأكيد وضوح وملاءمة الصورة الشخصية الحالية
                    </span>
                    <span className="text-[11px] text-[#64748B]">
                      صورة حقيقية واضحة ومناسبة للظهور لأولياء الأمور
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2 p-2.5 rounded-xl bg-white border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={qrPriceApproved}
                    onChange={(e) => setQrPriceApproved(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded text-[#0D4E8B] cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-[#1F2A44] block">
                      تأكيد ملاءمة سعر الحصة الحالية ({hourlyRateMin} - {hourlyRateMax} {currency} / {sessionDurationMinutes} د)
                    </span>
                    <span
                      className={`text-[11px] block ${
                        livePriceGuidance.status === 'within_range'
                          ? 'text-emerald-700'
                          : 'text-amber-700 font-medium'
                      }`}
                    >
                      {livePriceGuidance.summaryText}
                    </span>
                  </div>
                </label>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="text"
                  value={qrNotes}
                  onChange={(e) => setQrNotes(e.target.value)}
                  placeholder="ملاحظة مراجعة الجودة الأولية (اختياري)..."
                  className="flex-1 px-3 py-1.5 rounded-xl border border-[#CBD5E1] bg-white text-xs"
                />
                <button
                  type="button"
                  disabled={isSavingQualityReview}
                  onClick={handleSaveQualityReview}
                  className="px-4 py-1.5 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs font-bold cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {isSavingQualityReview ? 'جاري الحفظ...' : 'حفظ اعتماد الجودة'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pending Profile Draft Review Card (Handles image-only drafts where headline === null without showing empty text fields) */}
      {pendingDraft && (
        <div className="bg-amber-50/70 rounded-2xl border border-amber-200 p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-amber-500 text-white text-xs font-bold">
                مراجعة معلقة
              </span>
              <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#1F2A44]">
                {pendingDraft.headline === null &&
                !pendingDraft.helpChildQuote &&
                !pendingDraft.helpChildSummary
                  ? 'طلب تحديث الصورة الشخصية للمعلم'
                  : 'طلب تحديث بيانات الملف الشخصي للمعلم'}
              </h3>
            </div>
            {pendingDraft.submittedAt && (
              <span className="text-[11px] text-[#64748B]">
                تاريخ الإرسال: {new Date(pendingDraft.submittedAt).toLocaleString('ar-EG')}
              </span>
            )}
          </div>

          {/* Proposed Image (shown when avatarUrl is present or when headline === null) */}
          {(pendingDraft.avatarUrl || pendingDraft.pendingAvatarSignedUrl || pendingDraft.headline === null) && (
            <div className="flex flex-wrap items-center gap-6 bg-white p-4 rounded-xl border border-amber-200/80">
              {avatarUrl && (
                <div className="flex items-center gap-3">
                  <img
                    src={avatarUrl}
                    alt="الصورة الحالية"
                    className="w-16 h-16 rounded-2xl object-cover border border-slate-200"
                  />
                  <div>
                    <span className="text-[11px] font-bold text-[#64748B] block">الصورة الحالية</span>
                    <span className="text-xs text-[#1F2A44]">المنشورة بالملف</span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                {pendingDraft.pendingAvatarSignedUrl ? (
                  <img
                    src={pendingDraft.pendingAvatarSignedUrl}
                    alt="الصورة الجديدة المقترحة"
                    className="w-20 h-20 rounded-2xl object-cover border-2 border-amber-400 shadow-xs"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-[11px] text-[#64748B] text-center p-2">
                    صورة مرفوعة ({pendingDraft.avatarUrl || 'بدون مسار'})
                  </div>
                )}
                <div>
                  <span className="text-[11px] font-bold text-amber-800 block">الصورة الجديدة المقترحة</span>
                  <span className="text-xs text-[#1F2A44]">بانتظار موافقة الإدارة</span>
                </div>
              </div>
            </div>
          )}

          {/* Only render text fields when they are NOT null (never show empty text fields for image-only drafts) */}
          {(pendingDraft.headline !== null ||
            pendingDraft.helpChildQuote !== null ||
            pendingDraft.helpChildSummary !== null) && (
            <div className="grid grid-cols-1 gap-3 bg-white p-4 rounded-xl border border-amber-200/80 text-xs">
              {pendingDraft.headline !== null && (
                <div>
                  <span className="font-bold text-[#64748B] block mb-1">الجملة القصيرة:</span>
                  <p className="text-[#1F2A44] font-medium">{pendingDraft.headline}</p>
                </div>
              )}
              {pendingDraft.helpChildQuote !== null && (
                <div>
                  <span className="font-bold text-[#64748B] block mb-1">جملة مساعدة الطفل:</span>
                  <p className="text-[#1F2A44] font-medium">{pendingDraft.helpChildQuote}</p>
                </div>
              )}
              {pendingDraft.helpChildSummary !== null && (
                <div>
                  <span className="font-bold text-[#64748B] block mb-1">النبذة:</span>
                  <p className="text-[#1F2A44] whitespace-pre-line">{pendingDraft.helpChildSummary}</p>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
            <input
              type="text"
              value={draftReviewNotes}
              onChange={(e) => setDraftReviewNotes(e.target.value)}
              placeholder="ملاحظات للمعلم (مطلوبة عند طلب تعديل أو رفض)..."
              className="flex-1 px-3.5 py-2 rounded-xl border border-amber-300 bg-white text-xs text-[#1F2A44] focus:outline-hidden focus:border-[#0D4E8B]"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isReviewingDraft}
                onClick={() => handleReviewPendingDraft('approve')}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                اعتماد الصورة
              </button>
              <button
                type="button"
                disabled={isReviewingDraft}
                onClick={() => handleReviewPendingDraft('needs_revision')}
                className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                طلب تعديل
              </button>
              <button
                type="button"
                disabled={isReviewingDraft}
                onClick={() => handleReviewPendingDraft('reject')}
                className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                رفض
              </button>
            </div>
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
          <span>المواعيد (تجريبي + خاص مدفوع)</span>
          <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-[10px] text-emerald-800">
            {slots.filter((s) => s.isAvailable).length +
              privateSlots.filter((s) => s.isAvailable && !s.isBooked && !s.adminSuspended && Number(s.priceAmount) > 0).length}
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
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-[#1F2A44]" htmlFor="tutor-headline">
                العنوان التعريفي القصير (Headline) <span className="text-rose-500">*</span>
              </label>
              <span className="text-[11px] text-[#64748B] tabular-nums">
                {headline.trim().length} / 250 حرفًا (الحد الأدنى 10 أحرف)
              </span>
            </div>
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
              {avatarUrl && !isAvatarBrokenAtRuntime ? (
                <img
                  src={avatarUrl}
                  alt={name}
                  onError={() => setIsAvatarBrokenAtRuntime(true)}
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
                {isAvatarBrokenAtRuntime && (
                  <p className="text-[11px] text-rose-600 font-bold">
                    تعذر تحميل الصورة من الرابط الحالي (صورة تالفة). يرجى رفع صورة صالحة.
                  </p>
                )}
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
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-[#1F2A44]">
                اقتباس المعلم البارز (Help Child Quote)
              </label>
              <span className="text-[11px] text-[#64748B] tabular-nums">
                {helpChildQuote.trim().length} / 350 حرفًا
              </span>
            </div>
            <input
              type="text"
              value={helpChildQuote}
              onChange={(e) => setHelpChildQuote(e.target.value)}
              placeholder="كل طفل لديه قدرة فطرية على التفوق متى ما وجد التوجيه الصبور والتشجيع الصادق."
              className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-[#1F2A44]">
                النبذة التفصيلية عن أسلوب التدريس (Help Child Summary)
              </label>
              <span className="text-[11px] text-[#64748B] tabular-nums">
                {helpChildSummary.trim().length} / 2500 حرف (الحد الأدنى 20 حرفًا)
              </span>
            </div>
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
            <strong>ملاحظة تسعير شاطر:</strong> يُقبل أي سعر صحيح أكبر من صفر (1 إلى 100,000) دون اشتراط مضاعفات 5 أو 10 أو حد أدنى 20 (مثل 6 دولارات أو 127 أو 175).
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#1F2A44]">
                أقل سعر للحصة ({currency})
              </label>
              <input
                type="number"
                min="1"
                max="100000"
                step="1"
                value={hourlyRateMin}
                onChange={(e) => setHourlyRateMin(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none tabular-nums"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#1F2A44]">
                أعلى سعر للحصة ({currency})
              </label>
              <input
                type="number"
                min="1"
                max="100000"
                step="1"
                value={hourlyRateMax}
                onChange={(e) => setHourlyRateMax(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none tabular-nums"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#1F2A44]">العملة</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none"
              >
                <option value="ج.م">جنيه مصري (ج.م)</option>
                <option value="ر.س">ريال سعودي (ر.س)</option>
                <option value="د.إ">درهم إماراتي (د.إ)</option>
                <option value="$">دولار أمريكي ($)</option>
              </select>
            </div>
          </div>

          {/* Live Indicative Price Guidance */}
          <div
            className={`p-3.5 rounded-xl border text-xs ${
              livePriceGuidance.status === 'within_range'
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            <span className="font-bold block mb-0.5">النطاق السعري الاسترشادي للإدارة:</span>
            <span>{livePriceGuidance.summaryText}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#1F2A44]">
                مدة الحصة الاعتيادية (بالدقائق: 30 إلى 120)
              </label>
              <input
                type="number"
                min="30"
                max="120"
                step="1"
                value={sessionDurationMinutes}
                onChange={(e) => setSessionDurationMinutes(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none tabular-nums"
              />
              <p className="text-[11px] text-[#94A3B8]">المعتاد لمنصة شاطر: 45 أو 50 أو 60 دقيقة.</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#1F2A44]">
                مدة الحصة التجريبية المجانية (بالدقائق)
              </label>
              <input
                type="number"
                min="20"
                max="20"
                step="1"
                value={trialDurationMinutes}
                onChange={(e) => setTrialDurationMinutes(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none tabular-nums"
              />
              <p className="text-[11px] text-[#94A3B8]">مدة الحصة التجريبية المعتمدة في شاطر: 20 دقيقة.</p>
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

      {/* TAB 5: SLOTS (Trial Slots + Paid Private 1:1 Slots) */}
      {activeTab === 'slots' && (
        <div className="bg-white p-5 sm:p-7 rounded-2xl border border-[#E2E8F0] space-y-8">
          {/* PART A: Trial Slots (20 minutes) */}
          <div className="space-y-6">
            <div>
              <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#1F2A44]">
                ١. المواعيد التجريبية المجانية (20 دقيقة)
              </h3>
              <p className="text-xs text-[#64748B]">
                المواعيد المحددة بالتاريخ والساعة التي تظهر لولي الأمر لحجز الحصة التجريبية (وفق توقيت القاهرة)
              </p>
            </div>

            {/* Add Trial Slot Form */}
            <div className="p-4 rounded-xl bg-[#F8F9FC] border border-[#E2E8F0] space-y-3">
              <span className="text-xs font-bold text-[#0D4E8B] block">
                + إضافة موعد تجريبي جديد (20 دقيقة):
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
                  placeholder="ملاحظات الموعد للإدارة (اختياري)..."
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
                  <span>حفظ الموعد التجريبي</span>
                </button>
              </div>
            </div>

            {/* Trial Slots List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1F2A44] block">
                  المواعيد التجريبية المسجلة ({slots.length}):
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
                  لا توجد مواعيد تجريبية مسجلة لهذا المعلم حتى الآن.
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
                        <div className="flex flex-wrap items-center gap-2.5">
                          <Calendar className="w-4 h-4 text-[#0D4E8B] shrink-0" />
                          <span className="font-bold text-[#1F2A44]">{s.slotDate}</span>
                          <span className="text-slate-400">·</span>
                          <span className="text-[#0D4E8B] font-bold">
                            {s.startTime.substring(0, 5)} - {s.endTime.substring(0, 5)}
                          </span>
                          <span className="text-[11px] text-[#94A3B8]">({s.timezone})</span>

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

          {/* PART B: Paid Private 1:1 Slots */}
          <div className="space-y-6 pt-6 border-t border-slate-200">
            <div>
              <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#1F2A44]">
                ٢. مواعيد الحصص الخاصة المدفوعة (1:1)
              </h3>
              <p className="text-xs text-[#64748B]">
                يشترط لاكتمال جاهزية النشر وجود موعد مستقبلي واحد على الأقل لحصة خاصة مدفوعة (بسعر صحيح أكبر من صفر، ومدة 30–120 دقيقة).
              </p>
            </div>

            {/* Add Paid Private Slot Form */}
            <div className="p-4 rounded-xl bg-emerald-50/40 border border-emerald-200 space-y-3">
              <span className="text-xs font-bold text-emerald-800 block">
                + إضافة موعد حصة خاصة مدفوعة (1:1):
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[#1F2A44]">تاريخ الحصة</label>
                  <input
                    type="date"
                    value={newPrivateDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setNewPrivateDate(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl border border-[#CBD5E1] bg-white text-xs focus:border-[#0D4E8B] outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[#1F2A44]">وقت البداية (توقيت القاهرة)</label>
                  <input
                    type="time"
                    value={newPrivateStart}
                    onChange={(e) => setNewPrivateStart(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl border border-[#CBD5E1] bg-white text-xs focus:border-[#0D4E8B] outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[#1F2A44]">مدة الحصة (30 - 120 د)</label>
                  <input
                    type="number"
                    min="30"
                    max="120"
                    step="1"
                    value={newPrivateDuration}
                    onChange={(e) => setNewPrivateDuration(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-xl border border-[#CBD5E1] bg-white text-xs focus:border-[#0D4E8B] outline-none tabular-nums"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[#1F2A44]">سعر الحصة المدفوعة ({newPrivateCurrency})</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="1"
                      max="100000"
                      step="1"
                      value={newPrivatePrice}
                      onChange={(e) => setNewPrivatePrice(Number(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-xl border border-[#CBD5E1] bg-white text-xs focus:border-[#0D4E8B] outline-none tabular-nums"
                    />
                    <select
                      value={newPrivateCurrency}
                      onChange={(e) => setNewPrivateCurrency(e.target.value)}
                      className="px-2 py-1.5 rounded-xl border border-[#CBD5E1] bg-white text-xs"
                    >
                      <option value="ج.م">ج.م</option>
                      <option value="ر.س">ر.س</option>
                      <option value="د.إ">د.إ</option>
                      <option value="$">$</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
                <input
                  type="text"
                  value={newPrivateNotes}
                  onChange={(e) => setNewPrivateNotes(e.target.value)}
                  placeholder="ملاحظات الحصة الخاصة (اختياري)..."
                  className="flex-1 px-3 py-1.5 rounded-xl border border-[#CBD5E1] bg-white text-xs"
                />

                <button
                  type="button"
                  disabled={isAddingPrivateSlot}
                  onClick={handleAddPrivateSlot}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {isAddingPrivateSlot ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  <span>حفظ الموعد الخاص المدفوع</span>
                </button>
              </div>
            </div>

            {/* Paid Private Slots List */}
            <div className="space-y-3">
              <span className="text-xs font-bold text-[#1F2A44] block">
                مواعيد الحصص الخاصة المسجلة ({privateSlotsLoadError ? 'تعذر التحقق' : privateSlots.length}):
              </span>

              {privateSlotsLoadError ? (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>{privateSlotsLoadError}</span>
                  </div>
                  {tutorId && (
                    <button
                      type="button"
                      onClick={() => loadEditorSlotsAndReadiness(tutorId)}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shrink-0 cursor-pointer"
                    >
                      إعادة التحميل
                    </button>
                  )}
                </div>
              ) : privateSlots.length === 0 ? (
                <p className="text-xs text-[#94A3B8] italic p-4 text-center border border-dashed border-[#CBD5E1] rounded-xl">
                  لا توجد مواعيد حصص خاصة مسجلة لهذا المعلم حتى الآن.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 border border-[#E2E8F0] rounded-xl overflow-hidden">
                  {privateSlots.map((ps) => {
                    const isBooked = Boolean(ps.isBooked);
                    const isSuspended = Boolean(ps.adminSuspended);
                    const isAvailable = Boolean(ps.isAvailable) && !isBooked && !isSuspended;
                    const isPaid = Number(ps.priceAmount) > 0;

                    return (
                      <div
                        key={ps.id}
                        className="p-3 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 text-xs"
                      >
                        <div className="flex flex-wrap items-center gap-2.5">
                          <Clock className="w-4 h-4 text-emerald-700 shrink-0" />
                          <span className="font-bold text-[#1F2A44]">{ps.slotDate}</span>
                          <span className="text-slate-400">·</span>
                          <span className="text-emerald-800 font-bold">
                            {ps.startTime.substring(0, 5)} - {ps.endTime.substring(0, 5)} ({ps.durationMinutes} د)
                          </span>
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-[#1F2A44] font-bold tabular-nums">
                            {ps.priceAmount} {ps.currency}
                          </span>
                          {!isPaid && (
                            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                              مجاني (لا يحسب كموعد مدفوع)
                            </span>
                          )}
                          {isBooked ? (
                            <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 text-[11px] font-bold">
                              محجوز لطالب
                            </span>
                          ) : isSuspended ? (
                            <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold">
                              موقوف إدارياً
                            </span>
                          ) : isAvailable ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                              متاح للحجز
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px] font-bold">
                              غير متاح
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
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
