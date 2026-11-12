import React, { useState, useEffect } from 'react';
import { TutorPortalService } from '../../services/tutorPortalService';
import {
  Tutor,
  TutorPortalContext,
  TutorAvailableSlot,
  ApprovedSpecializationItem,
  TutorPrivateSlot,
  TutorGroup,
} from '../../types';
import { TutorApplicationService } from '../../services/tutorApplicationService';
import { TutorAuthModal } from './TutorAuthModal';
import { TutorProfileView } from '../TutorProfileView';
import {
  formatTutorExperience,
  formatSessionPriceSummary,
  filterValidAvailableTrialSlots,
  filterValidAvailablePrivateSlots,
  isSlotInFuture,
  formatSlotDateArabic,
  formatTimeArabic12h,
  getTimezoneArabicLabel,
  SUPPORTED_TUTOR_TIMEZONES,
  SUPPORTED_TUTOR_CURRENCIES,
  addMinutesToTimeStr,
  getTodayCalendarDateInTimezone,
  getTomorrowCalendarDateInTimezone,
  generateWeeklyRecurringSlots,
  generateGroupSessionsSchedule,
  buildArabicWeeklyScheduleSummary,
  calculateGroupFinancialSummary,
  getCalendarDayOfWeek,
} from '../../utils/formatters';
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
  Camera,
  ShieldCheck,
  User,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Info,
  Lock,
  Users,
  BookOpen,
  DollarSign,
  CalendarCheck2,
  Check,
  AlertTriangle,
  Edit3,
  LogIn,
  LogOut,
  RefreshCw,
} from 'lucide-react';

interface TutorDashboardViewProps {
  onNavigateHome: () => void;
  onNavigateToJoin?: () => void;
  onNavigateToPublicProfile?: (tutorId: string) => void;
}

type DashboardTab = 'overview' | 'pricing' | 'profile-draft' | 'trials' | 'private' | 'groups';

export const TutorDashboardView: React.FC<TutorDashboardViewProps> = ({
  onNavigateHome,
  onNavigateToJoin,
}) => {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [hasExistingApplication, setHasExistingApplication] = useState(false);
  const [context, setContext] = useState<TutorPortalContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Active Tab: First page is 'overview' showing setup steps and quick actions
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');

  // Approved specializations
  const [specializations, setSpecializations] = useState<ApprovedSpecializationItem[]>([]);
  const [, setIsLoadingSpecs] = useState(false);

  // Direct Self-Service Pricing State ("سعري ومدة الحصة")
  const [pricingSessionPrice, setPricingSessionPrice] = useState<number>(150);
  const [pricingSessionPriceInput, setPricingSessionPriceInput] = useState<string>('150');
  const [pricingCurrency, setPricingCurrency] = useState<string>('ج.م');
  const [pricingDurationMinutes, setPricingDurationMinutes] = useState<number>(50);
  const [isSavingPricing, setIsSavingPricing] = useState(false);
  const [pricingSaveSuccess, setPricingSaveSuccess] = useState<string | null>(null);
  const [pricingSaveError, setPricingSaveError] = useState<string | null>(null);
  const [pricingFieldErrors, setPricingFieldErrors] = useState<{
    price?: string;
    duration?: string;
    currency?: string;
  }>({});

  // 1. Trial Slots State (Strictly 20 minutes)
  const [trialSlots, setTrialSlots] = useState<TutorAvailableSlot[]>([]);
  const [isLoadingTrials, setIsLoadingTrials] = useState(false);
  const [trialSlotsLoadError, setTrialSlotsLoadError] = useState<string | null>(null);
  const [trialReloadWarning, setTrialReloadWarning] = useState<string | null>(null);
  const [newTrialDate, setNewTrialDate] = useState('');
  const [newTrialStart, setNewTrialStart] = useState('16:00');
  const [newTrialEnd, setNewTrialEnd] = useState('16:20');
  const [newTrialTimezone, setNewTrialTimezone] = useState<string>('Africa/Cairo');
  const [isAddingTrial, setIsAddingTrial] = useState(false);
  const [deletingTrialId, setDeletingTrialId] = useState<string | null>(null);
  const [trialFieldErrors, setTrialFieldErrors] = useState<{
    date?: string;
    start?: string;
  }>({});

  // Editing Trial Slot Modal State (Strictly 20 minutes)
  const [editingTrialSlot, setEditingTrialSlot] = useState<TutorAvailableSlot | null>(null);
  const [editTrialDate, setEditTrialDate] = useState('');
  const [editTrialStart, setEditTrialStart] = useState('16:00');
  const [editTrialEnd, setEditTrialEnd] = useState('16:20');
  const [editTrialTimezone, setEditTrialTimezone] = useState<string>('Africa/Cairo');
  const [isUpdatingTrialSlot, setIsUpdatingTrialSlot] = useState(false);

  const handleTrialStartChange = (val: string) => {
    setNewTrialStart(val);
    setNewTrialEnd(addMinutesToTimeStr(val, 20));
  };

  const handleEditTrialStartChange = (val: string) => {
    setEditTrialStart(val);
    setEditTrialEnd(addMinutesToTimeStr(val, 20));
  };

  // 2. Private Slots State (1:1 paid sessions with multi-specialization support)
  const [privateSlots, setPrivateSlots] = useState<TutorPrivateSlot[]>([]);
  const [isLoadingPrivate, setIsLoadingPrivate] = useState(false);
  const [privateSlotsLoadError, setPrivateSlotsLoadError] = useState<string | null>(null);
  const [privateReloadWarning, setPrivateReloadWarning] = useState<string | null>(null);
  const [selectedSpecIds, setSelectedSpecIds] = useState<string[]>([]);
  const [privateDurationMinutes, setPrivateDurationMinutes] = useState<number>(50);
  const [privatePriceAmount, setPrivatePriceAmount] = useState<number>(150);
  const [privatePriceInput, setPrivatePriceInput] = useState<string>('150');
  const [privateCurrency, setPrivateCurrency] = useState<string>('ج.م');
  const [privateTimezone, setPrivateTimezone] = useState<string>('Africa/Cairo');
  const [privateSchedulingMode, setPrivateSchedulingMode] = useState<'single' | 'weekly_repeat'>('single');
  const [privateSingleDate, setPrivateSingleDate] = useState<string>('');
  const [privateStartTime, setPrivateStartTime] = useState<string>('17:00');
  const [privateRepeatDays, setPrivateRepeatDays] = useState<number[]>([1, 3]); // Mon, Wed (0=Sun, 6=Sat)
  const [privateRepeatUntilDate, setPrivateRepeatUntilDate] = useState<string>('');
  const [previewPrivateSlots, setPreviewPrivateSlots] = useState<
    Array<{ date: string; startTime: string; endTime: string }>
  >([]);
  const [isSavingPrivateSlots, setIsSavingPrivateSlots] = useState(false);
  const [deletingPrivateSlotId, setDeletingPrivateSlotId] = useState<string | null>(null);
  const [privateFieldErrors, setPrivateFieldErrors] = useState<{
    specializations?: string;
    price?: string;
    duration?: string;
    date?: string;
  }>({});

  // Editing private slot modal state
  const [editingPrivateSlot, setEditingPrivateSlot] = useState<TutorPrivateSlot | null>(null);
  const [editSlotDate, setEditSlotDate] = useState('');
  const [editSlotStart, setEditSlotStart] = useState('');
  const [editSlotEnd, setEditSlotEnd] = useState('');
  const [editSlotDuration, setEditSlotDuration] = useState(50);
  const [editSlotPrice, setEditSlotPrice] = useState(150);
  const [editSlotPriceInput, setEditSlotPriceInput] = useState('150');
  const [editSlotTimezone, setEditSlotTimezone] = useState<string>('Africa/Cairo');
  const [editSlotSpecIds, setEditSlotSpecIds] = useState<string[]>([]);
  const [isUpdatingSlot, setIsUpdatingSlot] = useState(false);
  const [editPrivateFieldErrors, setEditPrivateFieldErrors] = useState<{
    price?: string;
    date?: string;
  }>({});

  // Generate Preview for Private Slots using timezone-independent calendar math
  useEffect(() => {
    const endTime = addMinutesToTimeStr(privateStartTime, privateDurationMinutes);

    if (privateSchedulingMode === 'single') {
      if (privateSingleDate) {
        setPreviewPrivateSlots([
          { date: privateSingleDate.trim().slice(0, 10), startTime: privateStartTime.slice(0, 5), endTime },
        ]);
      } else {
        setPreviewPrivateSlots([]);
      }
    } else {
      if (!privateRepeatUntilDate || privateRepeatDays.length === 0) {
        setPreviewPrivateSlots([]);
        return;
      }
      const startTomorrowStr = getTomorrowCalendarDateInTimezone(privateTimezone);
      const list = generateWeeklyRecurringSlots({
        startDateStr: startTomorrowStr,
        untilDateStr: privateRepeatUntilDate,
        repeatDays: privateRepeatDays,
        startTime: privateStartTime,
        durationMinutes: privateDurationMinutes,
        maxSlots: 50,
      });
      setPreviewPrivateSlots(list);
    }
  }, [
    privateSchedulingMode,
    privateSingleDate,
    privateStartTime,
    privateDurationMinutes,
    privateRepeatDays,
    privateRepeatUntilDate,
    privateTimezone,
  ]);

  // 3. Educational Groups State (3-Step Wizard)
  const [groups, setGroups] = useState<TutorGroup[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [groupsLoadError, setGroupsLoadError] = useState<string | null>(null);
  const [groupsReloadWarning, setGroupsReloadWarning] = useState<string | null>(null);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [showAddGroupForm, setShowAddGroupForm] = useState(false);
  const [groupWizardStep, setGroupWizardStep] = useState<1 | 2 | 3>(1);

  // Group Form fields
  const [groupTitle, setGroupTitle] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [groupSpecId, setGroupSpecId] = useState('');
  const [groupMaxStudents, setGroupMaxStudents] = useState(5);
  const [groupPricePerStudent, setGroupPricePerStudent] = useState(250);
  const [groupPriceInput, setGroupPriceInput] = useState('250');
  const [groupPriceType, setGroupPriceType] = useState<'per_session' | 'full_package'>('full_package');
  const [groupCurrency, setGroupCurrency] = useState('ج.م');
  const [groupSessionsCount, setGroupSessionsCount] = useState(4);
  const [groupSessionDuration, setGroupSessionDuration] = useState(60);
  const [groupTimezone, setGroupTimezone] = useState<string>('Africa/Cairo');
  const [groupStartDate, setGroupStartDate] = useState('');
  const [groupEndDate, setGroupEndDate] = useState('');
  const [groupScheduleSummary, setGroupScheduleSummary] = useState('');
  const [groupSessionStartTime, setGroupSessionStartTime] = useState('18:00');
  const [groupWeeklyDays, setGroupWeeklyDays] = useState<number[]>([1, 3]); // Mon, Wed
  const [generatedGroupSessions, setGeneratedGroupSessions] = useState<
    Array<{
      sessionNumber: number;
      sessionDate: string;
      startTime: string;
      endTime: string;
      timezone: string;
      title: string;
    }>
  >([]);
  const [updatingGroupId, setUpdatingGroupId] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<TutorGroup | null>(null);
  const [isLoadingGroupSessionsForEdit, setIsLoadingGroupSessionsForEdit] = useState(false);
  // Tracks whether tutor explicitly changed any schedule field while editing an existing group
  const [groupScheduleModifiedByTutor, setGroupScheduleModifiedByTutor] = useState<boolean>(true);
  const [groupFieldErrors, setGroupFieldErrors] = useState<{
    title?: string;
    spec?: string;
    maxStudents?: string;
    price?: string;
    sessionsCount?: string;
    startDate?: string;
    schedule?: string;
  }>({});

  // 4. Profile Text & Self-Service Avatar State
  const [draftHeadline, setDraftHeadline] = useState('');
  const [draftQuote, setDraftQuote] = useState('');
  const [draftSummary, setDraftSummary] = useState('');
  const [isSavingProfileText, setIsSavingProfileText] = useState(false);
  const [textSaveSuccess, setTextSaveSuccess] = useState<string | null>(null);
  const [textSaveError, setTextSaveError] = useState<string | null>(null);
  const [textFieldErrors, setTextFieldErrors] = useState<{
    headline?: string;
    quote?: string;
    summary?: string;
  }>({});

  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null);
  const [selectedAvatarPreviewUrl, setSelectedAvatarPreviewUrl] = useState<string | null>(null);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);
  const [avatarSaveError, setAvatarSaveError] = useState<string | null>(null);
  const [avatarSaveSuccess, setAvatarSaveSuccess] = useState<string | null>(null);

  // 5. Preview Mode State ("شوف ملفك زي ولي الأمر")
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [previewTutorData, setPreviewTutorData] = useState<Tutor | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Load Data & Verify Eligibility
  const loadPortalData = async (preserveTextInputs = false) => {
    if (!preserveTextInputs) {
      setIsLoading(true);
    }
    setErrorMessage(null);
    try {
      const user = await TutorApplicationService.getCurrentUser();
      setCurrentUser(user);
      if (!user) {
        setContext(null);
        setHasExistingApplication(false);
        return;
      }

      setIsAuthModalOpen(false);
      const portalContext = await TutorPortalService.getMyContext();
      setContext(portalContext);

      const tutor = portalContext.tutor;
      if (!preserveTextInputs) {
        setDraftHeadline(tutor.headline || '');
        setDraftQuote(tutor.helpChildQuote || '');
        setDraftSummary(tutor.helpChildSummary || '');
      }

      // Sync pricing editor & default new private slot settings from saved database profile
      const dbPrice = Number(tutor.hourlyRateMin) > 0 ? Number(tutor.hourlyRateMin) : 150;
      const dbCurrency = tutor.currency || 'ج.م';
      const dbDuration = Number(tutor.sessionDurationMinutes) >= 30 ? Number(tutor.sessionDurationMinutes) : 50;

      setPricingSessionPrice(dbPrice);
      setPricingSessionPriceInput(String(dbPrice));
      setPricingCurrency(dbCurrency);
      setPricingDurationMinutes(dbDuration);

      setPrivatePriceAmount(dbPrice);
      setPrivatePriceInput(String(dbPrice));
      setPrivateCurrency(dbCurrency);
      setPrivateDurationMinutes(dbDuration);
      setGroupCurrency(dbCurrency);

      await Promise.allSettled([
        loadSpecializations(),
        loadTrialSlots(),
        loadPrivateSlots(),
        loadGroups(),
      ]);
    } catch (err: any) {
      setContext(null);
      try {
        const app = await TutorApplicationService.getMyApplication();
        setHasExistingApplication(Boolean(app && app.status !== 'draft'));
      } catch {
        setHasExistingApplication(false);
      }
      setErrorMessage(err?.message || 'تعذر تحميل بيانات لوحة المعلم.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadSpecializations = async () => {
    setIsLoadingSpecs(true);
    try {
      const specs = await TutorPortalService.getMySpecializations();
      setSpecializations(specs);
      if (specs.length > 0) {
        setSelectedSpecIds((prev) => (prev.length > 0 ? prev : specs.map((s) => s.id)));
        setGroupSpecId((prev) => (prev ? prev : specs[0].id));
      }
    } catch (err) {
      console.warn('Failed to load specializations:', err);
    } finally {
      setIsLoadingSpecs(false);
    }
  };

  const loadTrialSlots = async (options?: {
    throwOnError?: boolean;
  }): Promise<TutorAvailableSlot[]> => {
    setIsLoadingTrials(true);
    setTrialSlotsLoadError(null);
    try {
      const mySlots = await TutorPortalService.getMySlots();
      setTrialSlots(mySlots);
      setTrialReloadWarning(null);
      return mySlots;
    } catch (err: any) {
      const msg = err?.message || 'تعذر تحميل قائمة المواعيد التجريبية.';
      setTrialSlotsLoadError(msg);
      if (options?.throwOnError) {
        throw new Error(msg);
      }
      return [];
    } finally {
      setIsLoadingTrials(false);
    }
  };

  const loadPrivateSlots = async (options?: {
    throwOnError?: boolean;
  }): Promise<TutorPrivateSlot[]> => {
    setIsLoadingPrivate(true);
    setPrivateSlotsLoadError(null);
    try {
      const pSlots = await TutorPortalService.getMyPrivateSlots();
      setPrivateSlots(pSlots);
      setPrivateReloadWarning(null);
      return pSlots;
    } catch (err: any) {
      const msg = err?.message || 'تعذر تحميل قائمة المواعيد الخاصة.';
      setPrivateSlotsLoadError(msg);
      if (options?.throwOnError) {
        throw new Error(msg);
      }
      return [];
    } finally {
      setIsLoadingPrivate(false);
    }
  };

  const loadGroups = async (options?: { throwOnError?: boolean }): Promise<TutorGroup[]> => {
    setIsLoadingGroups(true);
    setGroupsLoadError(null);
    try {
      const myGroups = await TutorPortalService.getMyGroups();
      setGroups(myGroups);
      setGroupsReloadWarning(null);
      return myGroups;
    } catch (err: any) {
      const msg = err?.message || 'تعذر تحميل قائمة المجموعات التعليمية.';
      setGroupsLoadError(msg);
      if (options?.throwOnError) {
        throw new Error(msg);
      }
      return [];
    } finally {
      setIsLoadingGroups(false);
    }
  };

  useEffect(() => {
    loadPortalData();
    const unsubscribe = TutorApplicationService.onAuthStateChange((user) => {
      setCurrentUser(user);
      if (user) {
        setIsAuthModalOpen(false);
        loadPortalData();
      } else {
        setContext(null);
        setHasExistingApplication(false);
        setIsAuthModalOpen(false);
        if (typeof document !== 'undefined') {
          document.body.style.overflow = '';
        }
      }
    });
    return () => {
      unsubscribe();
      if (typeof document !== 'undefined') {
        document.body.style.overflow = '';
      }
    };
  }, []);

  const handleSignOut = async () => {
    setIsAuthModalOpen(false);
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
    await TutorApplicationService.signOut();
    setCurrentUser(null);
    setContext(null);
    setHasExistingApplication(false);
  };

  // Direct Pricing Update Handler ("سعري ومدة الحصة")
  const handleSaveProfilePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    setPricingSaveError(null);
    setPricingSaveSuccess(null);
    setPricingFieldErrors({});
    setErrorMessage(null);
    setSuccessMessage(null);

    const normalizedPriceStr = String(pricingSessionPriceInput ?? '')
      .trim()
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    const priceNum = Number(normalizedPriceStr);
    const durationNum = Number(pricingDurationMinutes);

    const nextFieldErrors: { price?: string; duration?: string; currency?: string } = {};

    if (!normalizedPriceStr) {
      nextFieldErrors.price = 'حقل السعر فارغ: يرجى إدخال رقم صحيح بدون كسور (من 1 إلى 100000، مثل 127 أو 175).';
    } else if (!/^-?[0-9]+$/.test(normalizedPriceStr) || !Number.isInteger(priceNum)) {
      nextFieldErrors.price = 'لا يُسمح بالكسور العشرية: يرجى إدخال رقم صحيح بدون كسور (مثل 127 أو 175) دون تقريب تلقائي.';
    } else if (!Number.isFinite(priceNum) || priceNum < 1 || priceNum > 100000) {
      nextFieldErrors.price = 'القيمة خارج النطاق المسموح: يجب أن يكون سعر الحصة رقمًا صحيحًا من 1 إلى 100000.';
    }

    if (!Number.isFinite(durationNum) || !Number.isInteger(durationNum) || durationNum < 30 || durationNum > 120) {
      nextFieldErrors.duration = 'مدة الحصة غير صالحة: يجب اختيار مدة بين 30 و 120 دقيقة.';
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setPricingFieldErrors(nextFieldErrors);
      setPricingSaveError(nextFieldErrors.price || nextFieldErrors.duration || 'يرجى مراجعة الحقول المميزة باللون الأحمر.');
      return;
    }

    setIsSavingPricing(true);
    try {
      const updatedPricing = await TutorPortalService.updateProfilePricing({
        sessionPrice: priceNum,
        currency: pricingCurrency,
        sessionDurationMinutes: durationNum,
      });

      // Immediately update context tutor and defaults for new private slots
      setContext((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tutor: {
            ...prev.tutor,
            hourlyRateMin: updatedPricing.hourlyRateMin,
            hourlyRateMax: updatedPricing.hourlyRateMax,
            currency: updatedPricing.currency,
            sessionDurationMinutes: updatedPricing.sessionDurationMinutes,
          },
        };
      });

      setPricingSessionPrice(updatedPricing.hourlyRateMin);
      setPricingSessionPriceInput(String(updatedPricing.hourlyRateMin));
      setPrivatePriceAmount(updatedPricing.hourlyRateMin);
      setPrivatePriceInput(String(updatedPricing.hourlyRateMin));
      setPrivateCurrency(updatedPricing.currency);
      setPrivateDurationMinutes(updatedPricing.sessionDurationMinutes);

      setPricingSaveSuccess(
        `تم حفظ سعرك (${updatedPricing.hourlyRateMin} ${updatedPricing.currency} للحصة — ${updatedPricing.sessionDurationMinutes} دقيقة) وتحديث ملفك المنشور مباشرةً وأصبح هو السعر الافتراضي لمواعيدك الخاصة الجديدة.`
      );
    } catch (err: any) {
      const msg = err?.message || 'تعذر حفظ السعر ومدة الحصة.';
      setPricingSaveError(msg);
      setPricingFieldErrors({ price: msg });
    } finally {
      setIsSavingPricing(false);
    }
  };

  // 1. Handlers for Trial Slots (20 mins)
  const handleCreateTrialSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    setTrialFieldErrors({});
    setTrialReloadWarning(null);
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!newTrialDate) {
      const msg = 'يرجى تحديد تاريخ الموعد التجريبي (تاريخ اليوم أو تاريخ مستقبلي).';
      setTrialFieldErrors({ date: msg });
      setErrorMessage(msg);
      return;
    }
    if (!newTrialStart || !newTrialEnd) {
      const msg = 'يرجى تحديد وقت بداية الموعد التجريبي.';
      setTrialFieldErrors({ start: msg });
      setErrorMessage(msg);
      return;
    }

    const savedDate = newTrialDate.trim().slice(0, 10);
    const savedStart = newTrialStart.trim().slice(0, 5);
    const computedEnd = addMinutesToTimeStr(newTrialStart, 20);
    setIsAddingTrial(true);

    try {
      const saveResult = await TutorPortalService.createSlot(
        savedDate,
        newTrialStart,
        computedEnd,
        newTrialTimezone
      );
      const actualAddedCount = saveResult.insertedCount;

      // Clear date input immediately after save succeeds so the tutor cannot accidentally duplicate the slot
      setNewTrialDate('');

      try {
        const refreshedSlots = await loadTrialSlots({ throwOnError: true });
        const foundInRefreshed = refreshedSlots.some((s) =>
          saveResult.slotId
            ? s.id === saveResult.slotId
            : String(s.slotDate || '').slice(0, 10) === savedDate &&
              String(s.startTime || '').slice(0, 5) === savedStart
        );

        if (!foundInRefreshed) {
          setTrialReloadWarning(
            `تم الحفظ (عدد المواعيد المضافة: ${actualAddedCount})، لكن تعذر تحديث القائمة أو لم يظهر الموعد الجديد بعد.`
          );
          return;
        }

        setSuccessMessage(
          `تم حفظ ونشر ${actualAddedCount} موعد تجريبي بنجاح وظهوره في قائمة المواعيد المسجلة!`
        );
        setTimeout(() => setSuccessMessage(null), 5000);
      } catch (reloadErr: any) {
        const detail = reloadErr?.message ? ` — ${reloadErr.message}` : '';
        setTrialReloadWarning(
          `تم الحفظ (عدد المواعيد المضافة: ${actualAddedCount})، لكن تعذر تحديث القائمة${detail}`
        );
      }
    } catch (err: any) {
      const msg = err?.message || 'فشل إضافة الموعد التجريبي.';
      setTrialFieldErrors({ date: msg });
      setErrorMessage(msg);
    } finally {
      setIsAddingTrial(false);
    }
  };

  const handleUpdateTrialSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTrialSlot) return;

    const updatedSlotId = editingTrialSlot.id;
    const savedDate = editTrialDate.trim().slice(0, 10);
    const savedStart = editTrialStart.trim().slice(0, 5);
    const computedEnd = addMinutesToTimeStr(editTrialStart, 20);
    setIsUpdatingTrialSlot(true);
    setTrialReloadWarning(null);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await TutorPortalService.updateTrialSlot({
        slotId: updatedSlotId,
        slotDate: editTrialDate,
        startTime: editTrialStart,
        endTime: computedEnd,
        timezone: editTrialTimezone,
      });

      setEditingTrialSlot(null);

      try {
        const refreshedSlots = await loadTrialSlots({ throwOnError: true });
        const foundUpdated = refreshedSlots.some(
          (s) =>
            s.id === updatedSlotId &&
            String(s.slotDate || '').slice(0, 10) === savedDate &&
            String(s.startTime || '').slice(0, 5) === savedStart
        );

        if (!foundUpdated) {
          setTrialReloadWarning('تم الحفظ، لكن تعذر تحديث القائمة.');
          return;
        }

        setSuccessMessage('تم تعديل الموعد التجريبي (٢٠ دقيقة) وتحديث القائمة بنجاح.');
        setTimeout(() => setSuccessMessage(null), 4000);
      } catch (reloadErr: any) {
        const detail = reloadErr?.message ? ` — ${reloadErr.message}` : '';
        setTrialReloadWarning(`تم الحفظ، لكن تعذر تحديث القائمة${detail}`);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'تعذر تعديل الموعد التجريبي.');
    } finally {
      setIsUpdatingTrialSlot(false);
    }
  };

  const handleDeleteTrialSlot = async (slotId: string) => {
    setDeletingTrialId(slotId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await TutorPortalService.deleteSlot(slotId);
      setTrialSlots((prev) => prev.filter((s) => s.id !== slotId));
      setSuccessMessage('تم حذف الموعد التجريبي بنجاح.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'تعذر حذف الموعد التجريبي.');
    } finally {
      setDeletingTrialId(null);
    }
  };

  // 2. Handlers for Private Slots (1:1 with multi-specialization support)
  const handleSavePrivateSlots = async (e: React.FormEvent) => {
    e.preventDefault();
    setPrivateFieldErrors({});
    setPrivateReloadWarning(null);
    setErrorMessage(null);
    setSuccessMessage(null);

    const nextErrors: {
      specializations?: string;
      price?: string;
      duration?: string;
      date?: string;
    } = {};

    const chosenSpecs = specializations.filter((s) => selectedSpecIds.includes(s.id));
    if (chosenSpecs.length === 0) {
      nextErrors.specializations = 'يرجى اختيار تخصص معتمد واحد على الأقل لهذا الموعد الخاص.';
    }

    const normalizedSlotPriceStr = String(privatePriceInput ?? '')
      .trim()
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    const parsedSlotPrice = Number(normalizedSlotPriceStr);

    if (!normalizedSlotPriceStr) {
      nextErrors.price = 'حقل السعر مطلوب: يرجى إدخال رقم صحيح بدون كسور (من 0 إلى 100000).';
    } else if (!/^-?[0-9]+$/.test(normalizedSlotPriceStr) || !Number.isInteger(parsedSlotPrice)) {
      nextErrors.price = 'لا يُسمح بالكسور العشرية: يرجى إدخال رقم صحيح بدون كسور (مثل 6 أو 127 أو 175).';
    } else if (!Number.isFinite(parsedSlotPrice) || parsedSlotPrice < 0 || parsedSlotPrice > 100000) {
      nextErrors.price = 'القيمة خارج النطاق المسموح: يجب أن يكون سعر الحصة رقمًا صحيحًا بين 0 و 100000.';
    }

    if (previewPrivateSlots.length === 0) {
      nextErrors.date =
        privateSchedulingMode === 'single'
          ? 'يرجى تحديد تاريخ الموعد (تاريخ اليوم أو تاريخ مستقبلي) لإضافة الموعد.'
          : 'يرجى تحديد تاريخ نهاية التكرار الأسبوعي (تاريخ مستقبلي) وأيام التكرار.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setPrivateFieldErrors(nextErrors);
      setErrorMessage(
        nextErrors.price ||
          nextErrors.date ||
          nextErrors.specializations ||
          'يرجى مراجعة الحقول المطلوبة لإضافة الموعد.'
      );
      return;
    }

    const activeCurrency = privateCurrency || context?.tutor.currency || 'ج.م';
    const slotsToSave = [...previewPrivateSlots];

    setIsSavingPrivateSlots(true);

    try {
      const res = await TutorPortalService.createPrivateSlots({
        specializations: chosenSpecs,
        durationMinutes: privateDurationMinutes,
        priceAmount: parsedSlotPrice,
        currency: activeCurrency,
        timezone: privateTimezone,
        slots: slotsToSave,
      });

      const actualInsertedCount = res.insertedCount;

      const specsNotice =
        chosenSpecs.length > 1
          ? `مع ${chosenSpecs.length} تخصصات بديلة لنفس الموعد`
          : `لتخصص ${chosenSpecs[0].label}`;

      setPrivatePriceAmount(parsedSlotPrice);
      setPrivatePriceInput(String(parsedSlotPrice));
      setPrivateCurrency(activeCurrency);

      // Clear date inputs immediately after save succeeds so the tutor cannot accidentally duplicate the slots
      setPrivateSingleDate('');
      setPrivateRepeatUntilDate('');

      try {
        const refreshedSlots = await loadPrivateSlots({ throwOnError: true });
        const matchedNewSlotsCount = slotsToSave.filter((expected) =>
          refreshedSlots.some(
            (actual) =>
              String(actual.slotDate || '').slice(0, 10) ===
                String(expected.date || '').slice(0, 10) &&
              String(actual.startTime || '').slice(0, 5) ===
                String(expected.startTime || '').slice(0, 5)
          )
        ).length;

        if (matchedNewSlotsCount < actualInsertedCount) {
          setPrivateReloadWarning(
            `تم الحفظ (عدد المواعيد المضافة: ${actualInsertedCount} بسعر ${parsedSlotPrice} ${activeCurrency})، لكن تعذر تحديث القائمة بالكامل.`
          );
          return;
        }

        setSuccessMessage(
          `تم حفظ ونشر ${actualInsertedCount} موعد خاص بنجاح بسعر ${parsedSlotPrice} ${activeCurrency} (${specsNotice}) وظهورها في قائمة مواعيدك المسجلة!`
        );
        setTimeout(() => setSuccessMessage(null), 6000);
      } catch (reloadErr: any) {
        const detail = reloadErr?.message ? ` — ${reloadErr.message}` : '';
        setPrivateReloadWarning(
          `تم الحفظ (عدد المواعيد المضافة: ${actualInsertedCount} بسعر ${parsedSlotPrice} ${activeCurrency})، لكن تعذر تحديث القائمة${detail}`
        );
      }
    } catch (err: any) {
      const msg = err?.message || 'فشل حفظ المواعيد الخاصة.';
      setErrorMessage(msg);
    } finally {
      setIsSavingPrivateSlots(false);
    }
  };

  const handleDeletePrivateSlot = async (slotId: string) => {
    setDeletingPrivateSlotId(slotId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await TutorPortalService.deletePrivateSlot(slotId);
      setPrivateSlots((prev) => prev.filter((s) => s.id !== slotId));
      setSuccessMessage('تم حذف الموعد الخاص بنجاح.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'تعذر حذف الموعد الخاص.');
    } finally {
      setDeletingPrivateSlotId(null);
    }
  };

  const handleUpdatePrivateSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPrivateSlot) return;
    setEditPrivateFieldErrors({});
    setPrivateReloadWarning(null);
    setErrorMessage(null);
    setSuccessMessage(null);

    const chosenSpecs = specializations.filter((s) => editSlotSpecIds.includes(s.id));
    if (chosenSpecs.length === 0) {
      setErrorMessage('يرجى اختيار تخصص معتمد واحد على الأقل للموعد الخاص.');
      return;
    }

    const normalizedEditPriceStr = String(editSlotPriceInput ?? '')
      .trim()
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    const parsedEditPrice = Number(normalizedEditPriceStr);

    if (
      !normalizedEditPriceStr ||
      !/^-?[0-9]+$/.test(normalizedEditPriceStr) ||
      !Number.isInteger(parsedEditPrice) ||
      parsedEditPrice < 0 ||
      parsedEditPrice > 100000
    ) {
      const msg = 'يرجى إدخال سعر حصة صحيح بدون كسور (من 0 إلى 100000).';
      setEditPrivateFieldErrors({ price: msg });
      return;
    }

    if (!editSlotDate) {
      setEditPrivateFieldErrors({ date: 'يرجى تحديد تاريخ الموعد.' });
      return;
    }

    const updatedSlotId = editingPrivateSlot.id;
    const savedDate = editSlotDate.trim().slice(0, 10);
    const savedStart = editSlotStart.trim().slice(0, 5);
    const computedEnd = addMinutesToTimeStr(editSlotStart, editSlotDuration);
    setIsUpdatingSlot(true);

    try {
      await TutorPortalService.updatePrivateSlot({
        slotId: updatedSlotId,
        slotDate: editSlotDate,
        startTime: editSlotStart,
        endTime: computedEnd,
        durationMinutes: editSlotDuration,
        priceAmount: parsedEditPrice,
        specializations: chosenSpecs,
        timezone: editSlotTimezone || editingPrivateSlot.timezone || 'Africa/Cairo',
      });

      setEditSlotPrice(parsedEditPrice);
      setEditingPrivateSlot(null);

      try {
        const refreshedSlots = await loadPrivateSlots({ throwOnError: true });
        const foundUpdated = refreshedSlots.some(
          (s) =>
            s.id === updatedSlotId &&
            String(s.slotDate || '').slice(0, 10) === savedDate &&
            String(s.startTime || '').slice(0, 5) === savedStart
        );

        if (!foundUpdated) {
          setPrivateReloadWarning('تم الحفظ، لكن تعذر تحديث القائمة.');
          return;
        }

        setSuccessMessage('تم تعديل الموعد الخاص وتحديث القائمة بنجاح.');
        setTimeout(() => setSuccessMessage(null), 4000);
      } catch (reloadErr: any) {
        const detail = reloadErr?.message ? ` — ${reloadErr.message}` : '';
        setPrivateReloadWarning(`تم الحفظ، لكن تعذر تحديث القائمة${detail}`);
      }
    } catch (err: any) {
      const msg = err?.message || 'فشل تعديل الموعد الخاص.';
      setEditPrivateFieldErrors({ price: msg });
      setErrorMessage(msg);
    } finally {
      setIsUpdatingSlot(false);
    }
  };

  // Auto-generate group sessions & weekly schedule summary ONLY when creating a new group
  // OR when the tutor explicitly modifies schedule settings while editing a group.
  useEffect(() => {
    if (editingGroup && !groupScheduleModifiedByTutor) {
      return;
    }

    if (!groupStartDate || groupSessionsCount < 1 || groupWeeklyDays.length === 0) {
      setGeneratedGroupSessions([]);
      return;
    }

    const sessions = generateGroupSessionsSchedule({
      startDateStr: groupStartDate,
      sessionsCount: groupSessionsCount,
      weeklyDays: groupWeeklyDays,
      startTime: groupSessionStartTime,
      durationMinutes: groupSessionDuration,
      timezone: groupTimezone,
    });

    setGeneratedGroupSessions(sessions);
    if (sessions.length > 0) {
      setGroupEndDate(sessions[sessions.length - 1].sessionDate);
    }

    const autoSummary = buildArabicWeeklyScheduleSummary({
      weeklyDays: groupWeeklyDays,
      startTime: groupSessionStartTime,
      durationMinutes: groupSessionDuration,
      timezone: groupTimezone,
    });
    if (autoSummary) {
      setGroupScheduleSummary(autoSummary);
    }
  }, [
    editingGroup,
    groupScheduleModifiedByTutor,
    groupStartDate,
    groupSessionsCount,
    groupWeeklyDays,
    groupSessionStartTime,
    groupSessionDuration,
    groupTimezone,
  ]);

  const handleOpenNewGroupWizard = () => {
    setEditingGroup(null);
    setGroupFieldErrors({});
    setGroupScheduleModifiedByTutor(true);
    setGroupWizardStep(1);
    setGroupTitle('');
    setGroupDescription('');
    if (specializations.length > 0 && !groupSpecId) {
      setGroupSpecId(specializations[0].id);
    }
    setGroupMaxStudents(5);
    setGroupPricePerStudent(250);
    setGroupPriceInput('250');
    setGroupPriceType('full_package');
    setGroupCurrency(context?.tutor.currency || 'ج.م');
    setGroupSessionsCount(4);
    setGroupSessionDuration(60);
    setGroupTimezone('Africa/Cairo');
    const tomorrowStr = getTomorrowCalendarDateInTimezone('Africa/Cairo');
    setGroupStartDate(tomorrowStr);
    setGroupSessionStartTime('18:00');
    setGroupWeeklyDays([1, 3]);
    setShowAddGroupForm(true);
  };

  const handleStartEditGroup = async (group: TutorGroup) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setGroupFieldErrors({});
    setEditingGroup(group);
    setGroupScheduleModifiedByTutor(false);
    setGroupWizardStep(1);
    setGroupTitle(group.title);
    setGroupDescription(group.description || '');
    setGroupMaxStudents(group.maxStudents);
    setGroupPricePerStudent(group.pricePerStudent);
    setGroupPriceInput(String(group.pricePerStudent ?? 0));
    setGroupPriceType((group.priceType as 'per_session' | 'full_package') || 'full_package');
    setGroupCurrency(group.currency || context?.tutor.currency || 'ج.م');
    setGroupSessionsCount(group.sessionsCount);
    setGroupSessionDuration(group.sessionDurationMinutes);
    setGroupStartDate(group.startDate);
    setGroupEndDate(group.endDate || '');
    setGroupScheduleSummary(group.weeklyScheduleSummary || '');

    const matchSpec = specializations.find((s) => s.label === group.specializationLabel);
    if (matchSpec) {
      setGroupSpecId(matchSpec.id);
    }

    setShowAddGroupForm(true);
    setIsLoadingGroupSessionsForEdit(true);

    try {
      const actualSessions = await TutorPortalService.getGroupSessions(group.id);
      if (Array.isArray(actualSessions) && actualSessions.length > 0) {
        const normalizedSessions = actualSessions.map((s: any, idx: number) => ({
          sessionNumber: Number(s.sessionNumber || idx + 1),
          sessionDate: String(s.sessionDate || '').slice(0, 10),
          startTime: String(s.startTime || '18:00').slice(0, 5),
          endTime: String(s.endTime || '19:00').slice(0, 5),
          timezone: String(s.timezone || 'Africa/Cairo'),
          title: String(s.title || `اللقاء ${idx + 1}`),
        }));

        setGeneratedGroupSessions(normalizedSessions);
        const firstSession = normalizedSessions[0];
        if (firstSession) {
          setGroupSessionStartTime(firstSession.startTime);
          setGroupTimezone(firstSession.timezone || 'Africa/Cairo');
        }
        const distinctDays = Array.from(
          new Set(
            normalizedSessions
              .map((s) => getCalendarDayOfWeek(s.sessionDate))
              .filter((d) => d >= 0 && d <= 6)
          )
        );
        if (distinctDays.length > 0) {
          setGroupWeeklyDays(distinctDays);
        }
      } else {
        // Fallback if sessions could not be fetched
        setGroupScheduleModifiedByTutor(true);
      }
    } catch {
      setGroupScheduleModifiedByTutor(true);
    } finally {
      setIsLoadingGroupSessionsForEdit(false);
    }
  };

  // 3. Handlers for Educational Groups
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setGroupFieldErrors({});
    setErrorMessage(null);
    setSuccessMessage(null);

    const chosenSpec = specializations.find((s) => s.id === groupSpecId);
    if (!chosenSpec) {
      const msg = 'يرجى اختيار تخصص معتمد للمجموعة.';
      setGroupFieldErrors({ spec: msg });
      setErrorMessage(msg);
      setGroupWizardStep(1);
      return;
    }

    if (!groupTitle.trim()) {
      const msg = 'يرجى إدخال اسم مميز للمجموعة التعليمية.';
      setGroupFieldErrors({ title: msg });
      setErrorMessage(msg);
      setGroupWizardStep(1);
      return;
    }

    const normalizedGroupPriceStr = String(groupPriceInput ?? '')
      .trim()
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
    const parsedGroupPrice = Number(normalizedGroupPriceStr);

    if (
      !normalizedGroupPriceStr ||
      !/^-?[0-9]+$/.test(normalizedGroupPriceStr) ||
      !Number.isInteger(parsedGroupPrice) ||
      parsedGroupPrice < 0 ||
      parsedGroupPrice > 100000
    ) {
      const msg = 'يرجى إدخال سعر اشتراك صحيح بدون كسور (رقم صحيح من 0 إلى 100000، مثل 127 أو 175).';
      setGroupFieldErrors({ price: msg });
      setErrorMessage(msg);
      setGroupWizardStep(2);
      return;
    }

    if (!Number.isInteger(groupMaxStudents) || groupMaxStudents < 2 || groupMaxStudents > 20) {
      const msg = 'الحد الأقصى للطلاب يجب أن يكون رقمًا صحيحًا بين 2 و 20 طالبًا.';
      setGroupFieldErrors({ maxStudents: msg });
      setErrorMessage(msg);
      setGroupWizardStep(2);
      return;
    }

    if (!groupStartDate) {
      const msg = 'يرجى تحديد تاريخ بدء المجموعة.';
      setGroupFieldErrors({ startDate: msg });
      setErrorMessage(msg);
      setGroupWizardStep(3);
      return;
    }

    if (generatedGroupSessions.length !== groupSessionsCount) {
      const msg = `جدول اللقاءات (${generatedGroupSessions.length}) يجب أن يطابق تماماً عدد الحصص المحدد (${groupSessionsCount}).`;
      setGroupFieldErrors({ sessionsCount: msg });
      setErrorMessage(msg);
      setGroupWizardStep(3);
      return;
    }

    const finalSummary =
      groupScheduleSummary.trim() ||
      buildArabicWeeklyScheduleSummary({
        weeklyDays: groupWeeklyDays,
        startTime: groupSessionStartTime,
        durationMinutes: groupSessionDuration,
        timezone: groupTimezone,
      });

    if (!finalSummary) {
      const msg = 'يرجى التحقق من ملخص مواعيد الحصص الأسبوعية.';
      setGroupFieldErrors({ schedule: msg });
      setErrorMessage(msg);
      setGroupWizardStep(3);
      return;
    }

    setIsCreatingGroup(true);
    setGroupsReloadWarning(null);
    const savedGroupTitle = groupTitle.trim();
    const isEditingExistingGroup = Boolean(editingGroup);

    try {
      if (editingGroup) {
        await TutorPortalService.updateGroup({
          groupId: editingGroup.id,
          title: savedGroupTitle,
          description: groupDescription.trim(),
          specialization: chosenSpec,
          maxStudents: groupMaxStudents,
          pricePerStudent: parsedGroupPrice,
          priceType: groupPriceType,
          currency: groupCurrency,
          sessionsCount: groupSessionsCount,
          sessionDurationMinutes: groupSessionDuration,
          startDate: generatedGroupSessions[0]?.sessionDate || groupStartDate,
          endDate:
            generatedGroupSessions[generatedGroupSessions.length - 1]?.sessionDate ||
            groupEndDate ||
            undefined,
          weeklyScheduleSummary: finalSummary,
          sessions: generatedGroupSessions,
        });

        setEditingGroup(null);
      } else {
        await TutorPortalService.createGroup({
          title: savedGroupTitle,
          description: groupDescription.trim(),
          specialization: chosenSpec,
          maxStudents: groupMaxStudents,
          pricePerStudent: parsedGroupPrice,
          priceType: groupPriceType,
          currency: groupCurrency,
          sessionsCount: groupSessionsCount,
          sessionDurationMinutes: groupSessionDuration,
          startDate: generatedGroupSessions[0]?.sessionDate || groupStartDate,
          endDate:
            generatedGroupSessions[generatedGroupSessions.length - 1]?.sessionDate ||
            groupEndDate ||
            undefined,
          weeklyScheduleSummary: finalSummary,
          sessions: generatedGroupSessions,
        });
      }

      // Close form and clear inputs immediately after save succeeds to prevent duplicate submission
      setShowAddGroupForm(false);
      setGroupTitle('');
      setGroupDescription('');
      setGroupScheduleSummary('');

      try {
        const refreshedGroups = await loadGroups({ throwOnError: true });
        const foundGroup = refreshedGroups.some((g) => g.title.trim() === savedGroupTitle);
        if (!foundGroup) {
          setGroupsReloadWarning('تم الحفظ، لكن تعذر تحديث القائمة.');
          return;
        }

        setSuccessMessage(
          isEditingExistingGroup
            ? 'تم تحديث بيانات المجموعة ونشرها مباشرة بنجاح.'
            : 'تم إنشاء المجموعة التعليمية ونشرها مباشرة بنجاح؛ أصبحت متاحة الآن للتسجيل في ملفك العام.'
        );
        setTimeout(() => setSuccessMessage(null), 5000);
      } catch (reloadErr: any) {
        const detail = reloadErr?.message ? ` — ${reloadErr.message}` : '';
        setGroupsReloadWarning(`تم الحفظ، لكن تعذر تحديث القائمة${detail}`);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'تعذر حفظ المجموعة التعليمية.');
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const handleUpdateGroupStatus = async (
    groupId: string,
    newStatus: 'open' | 'in_progress' | 'completed' | 'cancelled'
  ) => {
    setUpdatingGroupId(groupId);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await TutorPortalService.updateGroupStatus(groupId, newStatus);
      setSuccessMessage('تم تحديث حالة المجموعة بنجاح.');
      setTimeout(() => setSuccessMessage(null), 3000);
      await loadGroups();
    } catch (err: any) {
      setErrorMessage(err?.message || 'فشل تحديث حالة المجموعة.');
    } finally {
      setUpdatingGroupId(null);
    }
  };

  // 4. Self-service Avatar selection & immediate publish handlers
  const handleAvatarFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarSaveError(null);
    setAvatarSaveSuccess(null);
    setErrorMessage(null);

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setAvatarSaveError('نوع الملف غير مدعوم. يرجى اختيار صورة بصيغة JPG أو PNG أو WebP.');
      e.target.value = '';
      return;
    }

    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
      setAvatarSaveError('حجم الصورة يتجاوز الحد المسموح (2 ميجابايت). يرجى اختيار صورة أصغر حجماً.');
      e.target.value = '';
      return;
    }

    if (selectedAvatarPreviewUrl) {
      try {
        URL.revokeObjectURL(selectedAvatarPreviewUrl);
      } catch {
        // ignore
      }
    }

    const previewUrl = URL.createObjectURL(file);
    setSelectedAvatarFile(file);
    setSelectedAvatarPreviewUrl(previewUrl);
  };

  const handleSaveAndPublishAvatar = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedAvatarFile) {
      setAvatarSaveError('يرجى اختيار صورة جديدة أولاً ثم الضغط على «حفظ الصورة ونشرها».');
      return;
    }

    setIsSavingAvatar(true);
    setAvatarSaveError(null);
    setAvatarSaveSuccess(null);
    setErrorMessage(null);

    try {
      const result = await TutorPortalService.uploadAndPublishSelfServiceAvatar(selectedAvatarFile);

      // Update current tutor avatarUrl with the permanent public URL and clear any old pendingDraft
      setContext((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tutor: {
            ...prev.tutor,
            avatarUrl: result.avatarUrl,
          },
          pendingDraft: null,
        };
      });

      setSelectedAvatarFile(null);
      setSelectedAvatarPreviewUrl(null);
      setAvatarSaveSuccess('تم حفظ صورتك الشخصية ونشرها في ملفك مباشرة بنجاح!');
    } catch (err: any) {
      // Keep the current published avatar intact and display a clear Arabic error message
      setAvatarSaveError(
        err?.message || 'تعذر حفظ الصورة ونشرها. تم الاحتفاظ بصورتك الحالية دون تغيير.'
      );
    } finally {
      setIsSavingAvatar(false);
    }
  };

  // Immediate text update handler (preserves typed text on failure)
  const handleSaveProfileText = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    setTextSaveError(null);
    setTextSaveSuccess(null);
    setTextFieldErrors({});
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedHeadline = draftHeadline.trim();
    const trimmedQuote = draftQuote.trim();
    const trimmedSummary = draftSummary.trim();

    const nextFieldErrors: { headline?: string; quote?: string; summary?: string } = {};

    if (!trimmedHeadline || trimmedHeadline.length < 10 || trimmedHeadline.length > 250) {
      nextFieldErrors.headline = `العنوان القصير مطلوب ويجب أن يكون بين 10 و 250 حرفًا (عدد الحروف الحالي: ${trimmedHeadline.length} حرفًا). مثال مقبول: «مدرسة رياضيات».`;
    }

    if (trimmedQuote.length > 0 && (trimmedQuote.length < 5 || trimmedQuote.length > 350)) {
      nextFieldErrors.quote = `جملة "إزاي بتساعد الطفل يفهم؟" اختيارية، وعند كتابتها يجب أن تكون بين 5 و 350 حرفًا (عدد الحروف الحالي: ${trimmedQuote.length} حرفًا).`;
    }

    if (trimmedSummary.length > 0 && (trimmedSummary.length < 20 || trimmedSummary.length > 2500)) {
      nextFieldErrors.summary = `النبذة التفصيلية عنك لولي الأمر اختيارية، وعند كتابتها يجب أن تكون بين 20 و 2500 حرفًا (عدد الحروف الحالي: ${trimmedSummary.length} حرفًا).`;
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setTextFieldErrors(nextFieldErrors);
      setTextSaveError(
        nextFieldErrors.headline ||
          nextFieldErrors.quote ||
          nextFieldErrors.summary ||
          'يرجى مراجعة الحقول المميزة باللون الأحمر.'
      );
      return;
    }

    setIsSavingProfileText(true);
    try {
      const res = await TutorPortalService.updateProfileText({
        headline: trimmedHeadline,
        helpChildQuote: trimmedQuote.length > 0 ? trimmedQuote : null,
        helpChildSummary: trimmedSummary.length > 0 ? trimmedSummary : null,
      });

      setContext((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tutor: {
            ...prev.tutor,
            headline: trimmedHeadline,
            helpChildQuote: trimmedQuote.length > 0 ? trimmedQuote : '',
            helpChildSummary: trimmedSummary.length > 0 ? trimmedSummary : '',
          },
        };
      });

      if (res.changed === false) {
        setTextSaveSuccess('لا توجد تعديلات جديدة.');
      } else {
        setTextSaveSuccess('تم حفظ النبذة وتحديث ملفك المنشور مباشرةً.');
      }
    } catch (err: any) {
      // Preserve typed text in state and display error clearly
      const msg = err?.message || 'حدث خطأ أثناء حفظ التعديلات. نصوصك المكتوبة محفوظة في النموذج.';
      setTextSaveError(msg);
      if (msg.includes('الجملة القصيرة') || msg.includes('العنوان')) {
        setTextFieldErrors({ headline: msg });
      } else if (msg.includes('مساعدة الطفل')) {
        setTextFieldErrors({ quote: msg });
      } else if (msg.includes('النبذة')) {
        setTextFieldErrors({ summary: msg });
      }
    } finally {
      setIsSavingProfileText(false);
    }
  };

  // Open parent preview ("شوف ملفك زي ولي الأمر") with current displayed data without publishing
  const handleOpenParentPreview = async () => {
    if (!context) return;
    setIsLoadingPreview(true);
    try {
      const fullTutor = await TutorPortalService.getMyPreviewTutor(context.tutor, specializations);
      setPreviewTutorData(fullTutor);
      setIsPreviewMode(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setErrorMessage(err?.message || 'تعذر فتح معاينة الملف.');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4 text-center space-y-4" dir="rtl">
        <Loader2 className="w-10 h-10 text-[#0D4E8B] animate-spin mx-auto" />
        <p className="text-sm font-bold text-[#64748B]">
          جاري التحقق من أهلية الحساب وتحميل لوحة المعلم...
        </p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div
        className="max-w-xl mx-auto my-12 sm:my-16 p-6 sm:p-8 bg-white rounded-3xl border border-[#E2E8F0] shadow-sm text-center space-y-4"
        dir="rtl"
      >
        <div className="w-14 h-14 rounded-2xl bg-[#EBF3FC] text-[#0D4E8B] flex items-center justify-center mx-auto">
          <GraduationCap className="w-7 h-7" />
        </div>
        <h2 className="font-['Cairo'] text-lg sm:text-xl font-bold text-[#1F2A44]">
          لوحة المعلم مخصصة للمعلمين المعتمدين
        </h2>
        <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed">
          يرجى تسجيل الدخول بحساب المعلم الخاص بك للتحقق من أهليتك والوصول إلى لوحة المعلم أو متابعة طلبك.
        </p>
        <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setIsAuthModalOpen(true)}
            className="px-5 py-2.5 min-h-[44px] rounded-xl bg-[#0D4E8B] text-white text-xs sm:text-sm font-bold hover:bg-[#003767] transition-all flex items-center gap-2 cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            <span>دخول المعلمين</span>
          </button>
          <button
            type="button"
            onClick={onNavigateHome}
            className="px-4 py-2.5 min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200 text-[#1F2A44] text-xs sm:text-sm font-bold transition-all cursor-pointer"
          >
            العودة للرئيسية
          </button>
        </div>
        <TutorAuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          initialMode="signin"
          onSuccess={(user) => {
            setIsAuthModalOpen(false);
            setCurrentUser(user);
            loadPortalData();
          }}
        />
      </div>
    );
  }

  if (!context) {
    return (
      <div
        className="max-w-xl mx-auto my-12 sm:my-16 p-6 sm:p-8 bg-white rounded-3xl border border-[#E2E8F0] shadow-sm text-center space-y-4"
        dir="rtl"
      >
        <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
        <h2 className="font-['Cairo'] text-lg sm:text-xl font-bold text-[#1F2A44]">
          {hasExistingApplication
            ? 'طلب انضمامك قيد المتابعة'
            : 'لوحة المعلم مخصصة للمعلمين المعتمدين فقط'}
        </h2>
        <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed">
          {hasExistingApplication
            ? 'حسابك الحالي مرتبط بطلب انضمام لم يتم اعتماده بعد. لا يمكن فتح لوحة المعلم إلا بعد اعتماد الطلب وربطه بملف معلم، ويمكنك متابعة حالة طلبك الحالية.'
            : 'حسابك الحالي غير مرتبط بملف معلم معتمد ولا يحتوي على طلب مرسل. يرجى استكمال تقديم طلب الانضمام أولاً.'}
        </p>
        <div className="pt-2 flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              if (onNavigateToJoin) {
                onNavigateToJoin();
              } else {
                window.location.hash = '#join-as-tutor';
              }
            }}
            className="px-5 py-2.5 min-h-[44px] rounded-xl bg-[#0D4E8B] text-white text-xs sm:text-sm font-bold hover:bg-[#003767] transition-all cursor-pointer"
          >
            {hasExistingApplication ? 'متابعة طلبي' : 'استكمال التقديم'}
          </button>
          <button
            type="button"
            onClick={() => loadPortalData(false)}
            className="px-4 py-2.5 min-h-[44px] rounded-xl border border-[#CBD5E1] hover:bg-slate-50 text-[#1F2A44] text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>إعادة المحاولة</span>
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="px-4 py-2.5 min-h-[44px] rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>تسجيل الخروج</span>
          </button>
          <button
            type="button"
            onClick={onNavigateHome}
            className="px-4 py-2.5 min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200 text-[#1F2A44] text-xs sm:text-sm font-bold transition-all cursor-pointer"
          >
            العودة للرئيسية
          </button>
        </div>
      </div>
    );
  }

  const { tutor } = context;

  // Compute future available slots strictly (excluding past, booked, and admin-suspended slots/groups)
  const validFutureTrialSlots = filterValidAvailableTrialSlots(trialSlots);
  const validFuturePrivateSlots = filterValidAvailablePrivateSlots(privateSlots);
  const validFutureGroups = groups.filter(
    (g) =>
      g &&
      !g.adminSuspended &&
      g.isPublished &&
      (g.status === 'open' || g.status === 'in_progress') &&
      (g.remainingSeats === undefined ? g.maxStudents - g.enrolledStudents > 0 : g.remainingSeats > 0) &&
      isSlotInFuture(g.endDate || g.startDate, '23:59', 'Africa/Cairo')
  );

  // 5 Profile Readiness Steps (الصورة، النبذة، السعر، التخصصات، والمواعيد المتاحة المستقبلية)
  const hasAvatar = Boolean(tutor.avatarUrl && tutor.avatarUrl.trim().length > 0);
  const hasBioComplete = Boolean(
    tutor.headline &&
      tutor.headline.trim().length >= 10 &&
      ((tutor.helpChildSummary && tutor.helpChildSummary.trim().length >= 20) ||
        (tutor.helpChildQuote && tutor.helpChildQuote.trim().length >= 5))
  );
  const hasValidPrice = Boolean(
    Number(tutor.hourlyRateMin) > 0 &&
      Number(tutor.sessionDurationMinutes) >= 30 &&
      Boolean(tutor.currency)
  );
  const hasAtLeastOneSpec = specializations.length >= 1;
  const hasFutureAvailableSlot =
    validFutureTrialSlots.length > 0 ||
    validFuturePrivateSlots.length > 0 ||
    validFutureGroups.length > 0;

  const readinessSteps = [
    {
      key: 'avatar',
      title: 'الصورة الشخصية',
      completed: hasAvatar,
      statusText: hasAvatar ? 'منشورة في ملفك' : 'أضف صورتك الشخصية',
      actionLabel: 'صورتي ونبذتي',
      targetTab: 'profile-draft' as DashboardTab,
    },
    {
      key: 'bio',
      title: 'النبذة التعريفية',
      completed: hasBioComplete,
      statusText: hasBioComplete ? 'الجملة القصيرة والنبذة مكتملة' : 'أكمل نبذتك لولي الأمر',
      actionLabel: 'صورتي ونبذتي',
      targetTab: 'profile-draft' as DashboardTab,
    },
    {
      key: 'pricing',
      title: 'السعر ومدة الحصة',
      completed: hasValidPrice,
      statusText: hasValidPrice
        ? `${tutor.hourlyRateMin} ${tutor.currency} / ${tutor.sessionDurationMinutes} دقيقة`
        : 'حدد سعر الحصة ومدتها',
      actionLabel: 'سعري ومدة الحصة',
      targetTab: 'pricing' as DashboardTab,
    },
    {
      key: 'specializations',
      title: 'التخصصات المعتمدة',
      completed: hasAtLeastOneSpec,
      statusText: hasAtLeastOneSpec
        ? `${specializations.length} تخصص معتمد`
        : 'بانتظار ربط التخصصات',
      actionLabel: 'عرض التخصصات',
      targetTab: 'overview' as DashboardTab,
    },
    {
      key: 'slots',
      title: 'المواعيد المتاحة',
      completed: hasFutureAvailableSlot,
      statusText: hasFutureAvailableSlot
        ? `${validFutureTrialSlots.length} تجريبي • ${validFuturePrivateSlots.length} خاص • ${validFutureGroups.length} مجموعة`
        : 'لا توجد مواعيد مستقبلية متاحة حالياً',
      actionLabel: 'إضافة موعد',
      targetTab: 'private' as DashboardTab,
    },
  ];

  const completedStepsCount = readinessSteps.filter((s) => s.completed).length;
  const profileStrengthPercent = Math.round((completedStepsCount / readinessSteps.length) * 100);

  const futurePrivateBookedCount = privateSlots.filter(
    (s) => s.isBooked && isSlotInFuture(s.slotDate, s.startTime, s.timezone || 'Africa/Cairo')
  ).length;

  const groupFinancials = calculateGroupFinancialSummary({
    maxStudents: groupMaxStudents,
    pricePerStudent: groupPricePerStudent,
    priceType: groupPriceType,
    sessionsCount: groupSessionsCount,
  });

  // Parent Preview Mode ("شوف ملفك زي ولي الأمر")
  if (isPreviewMode && previewTutorData) {
    return (
      <div className="w-full space-y-4 pb-12" dir="rtl">
        <div className="bg-[#1F2A44] text-white px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold sticky top-0 z-50 shadow-md">
          <div className="flex items-center gap-2 flex-wrap">
            <Eye className="w-4 h-4 text-[#FFC629]" />
            <span>معاينة ملفك كما يراه ولي الأمر</span>
            <span className="text-slate-400">·</span>
            <span className={tutor.isPublished ? 'text-emerald-400' : 'text-amber-400'}>
              {tutor.isPublished
                ? 'ملفك منشور للزوار'
                : 'ملفك غير منشور حالياً (معاينة خاصة بك بدون نشر)'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsPreviewMode(false)}
            className="px-3.5 py-2 min-h-[40px] rounded-lg bg-white/15 hover:bg-white/25 text-white transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span>العودة للوحة المعلم</span>
            <ArrowRight className="w-3.5 h-3.5 rotate-180" />
          </button>
        </div>

        <TutorProfileView
          tutor={previewTutorData}
          previewTrialSlots={trialSlots}
          previewPrivateSlots={privateSlots}
          previewGroups={groups}
          onBack={() => setIsPreviewMode(false)}
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-6 sm:py-8 px-3 sm:px-6 lg:px-8 space-y-6" dir="rtl">
      {/* 1. Header Bar */}
      <div className="bg-white rounded-3xl p-4 sm:p-6 border border-[#E2E8F0] shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 sm:gap-4 min-w-0">
          <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden bg-slate-100 border border-[#CBD5E1] shrink-0 flex items-center justify-center">
            {tutor.avatarUrl ? (
              <img src={tutor.avatarUrl} alt={tutor.name} className="w-full h-full object-cover" />
            ) : (
              <User className="w-7 h-7 text-slate-400" />
            )}
            {tutor.verifiedCredentials && (
              <span
                className="absolute -bottom-1 -left-1 w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] shadow-xs"
                title="معتمد"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
              </span>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-['Cairo'] text-base sm:text-xl font-bold text-[#1F2A44]">
                مرحباً {tutor.honorific} {tutor.name}
              </h1>
              <span
                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                  tutor.isPublished
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
              >
                {tutor.isPublished ? 'ملفك منشور ومتاح للحجز' : 'ملف غير منشور للجمهور'}
              </span>
            </div>
            <p className="text-xs text-[#64748B] mt-1 line-clamp-1">
              {tutor.headline || 'معلم معتمد في منصة شاطر كلاسيز'}
            </p>
          </div>
        </div>

        {/* Preview & Account Actions */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end shrink-0">
          <button
            type="button"
            onClick={handleOpenParentPreview}
            disabled={isLoadingPreview}
            className="px-3.5 py-2 min-h-[44px] rounded-xl bg-[#F0F6FD] hover:bg-[#E2EFFD] border border-blue-200 text-xs font-bold text-[#0D4E8B] transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            {isLoadingPreview ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
            <span>شوف ملفك زي ولي الأمر</span>
          </button>

          <button
            type="button"
            onClick={onNavigateHome}
            className="px-3 py-2 min-h-[44px] rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-[#1F2A44] transition-all cursor-pointer"
          >
            الرئيسية
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            className="px-3 py-2 min-h-[44px] rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>خروج</span>
          </button>
        </div>
      </div>

      {/* 1.1 Quick Action Buttons Bar («صورتي ونبذتي» — «سعري ومدة الحصة» — «إضافة موعد» — «إنشاء مجموعة») */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-[#E2E8F0] shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Sparkles className="w-4 h-4 text-[#0D4E8B]" />
            <span className="font-['Cairo'] text-sm sm:text-base font-bold text-[#1F2A44]">
              إدارة ملفك بالخدمة الذاتية ({profileStrengthPercent}٪ مكتمل)
            </span>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#F0F6FD] text-[#0D4E8B]">
              {completedStepsCount} من {readinessSteps.length} خطوات جاهزة
            </span>
          </div>
          <span className="text-[11px] text-[#64748B]">
            تعديلاتك تظهر مباشرة في ملفك المنشور فور الحفظ دون انتظار مراجعة إدارية
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              profileStrengthPercent === 100 ? 'bg-emerald-600' : 'bg-[#0D4E8B]'
            }`}
            style={{ width: `${profileStrengthPercent}%` }}
          />
        </div>

        {/* 4 Primary Action Buttons required by spec */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => setActiveTab('profile-draft')}
            className={`min-h-[48px] px-3 py-2.5 rounded-2xl border text-xs font-bold font-['Cairo'] transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'profile-draft'
                ? 'bg-[#0D4E8B] text-white border-[#0D4E8B] shadow-xs'
                : 'bg-[#F8FAFC] hover:bg-[#F0F6FD] text-[#1F2A44] border-[#CBD5E1]'
            }`}
          >
            <Camera className="w-4 h-4 shrink-0" />
            <span>صورتي ونبذتي</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pricing')}
            className={`min-h-[48px] px-3 py-2.5 rounded-2xl border text-xs font-bold font-['Cairo'] transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'pricing'
                ? 'bg-[#0D4E8B] text-white border-[#0D4E8B] shadow-xs'
                : 'bg-[#F8FAFC] hover:bg-[#F0F6FD] text-[#1F2A44] border-[#CBD5E1]'
            }`}
          >
            <DollarSign className="w-4 h-4 shrink-0" />
            <span>سعري ومدة الحصة</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('private')}
            className={`min-h-[48px] px-3 py-2.5 rounded-2xl border text-xs font-bold font-['Cairo'] transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'private'
                ? 'bg-[#0D4E8B] text-white border-[#0D4E8B] shadow-xs'
                : 'bg-[#F8FAFC] hover:bg-[#F0F6FD] text-[#1F2A44] border-[#CBD5E1]'
            }`}
          >
            <CalendarCheck2 className="w-4 h-4 shrink-0" />
            <span>إضافة موعد</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('groups');
              handleOpenNewGroupWizard();
            }}
            className={`min-h-[48px] px-3 py-2.5 rounded-2xl border text-xs font-bold font-['Cairo'] transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'groups'
                ? 'bg-[#0D4E8B] text-white border-[#0D4E8B] shadow-xs'
                : 'bg-[#F8FAFC] hover:bg-[#F0F6FD] text-[#1F2A44] border-[#CBD5E1]'
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span>إنشاء مجموعة</span>
          </button>
        </div>
      </div>

      {/* Global Feedback Alerts */}
      {errorMessage && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start gap-2.5"
        >
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <span className="font-bold">{errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm flex items-start gap-2.5"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <span className="font-bold">{successMessage}</span>
        </div>
      )}

      {/* 2. Navigation Tabs (Responsive on 320px/390px mobile & desktop) */}
      <div className="flex items-center gap-1.5 sm:gap-2 border-b border-[#CBD5E1] pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`px-3.5 py-2.5 min-h-[44px] rounded-xl font-['Cairo'] text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'overview'
              ? 'bg-[#0D4E8B] text-white shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2A44] hover:bg-white'
          }`}
        >
          <GraduationCap className="w-4 h-4 shrink-0" />
          <span>خطوات تجهيز الملف</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('profile-draft')}
          className={`px-3.5 py-2.5 min-h-[44px] rounded-xl font-['Cairo'] text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'profile-draft'
              ? 'bg-[#0D4E8B] text-white shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2A44] hover:bg-white'
          }`}
        >
          <Edit3 className="w-4 h-4 shrink-0" />
          <span>صورتي ونبذتي</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('pricing')}
          className={`px-3.5 py-2.5 min-h-[44px] rounded-xl font-['Cairo'] text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'pricing'
              ? 'bg-[#0D4E8B] text-white shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2A44] hover:bg-white'
          }`}
        >
          <DollarSign className="w-4 h-4 shrink-0" />
          <span>سعري ومدة الحصة</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('private')}
          className={`px-3.5 py-2.5 min-h-[44px] rounded-xl font-['Cairo'] text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'private'
              ? 'bg-[#0D4E8B] text-white shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2A44] hover:bg-white'
          }`}
        >
          <CalendarCheck2 className="w-4 h-4 shrink-0" />
          <span>الحصص الخاصة (1:1)</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === 'private' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {validFuturePrivateSlots.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('trials')}
          className={`px-3.5 py-2.5 min-h-[44px] rounded-xl font-['Cairo'] text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'trials'
              ? 'bg-[#0D4E8B] text-white shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2A44] hover:bg-white'
          }`}
        >
          <Clock3 className="w-4 h-4 shrink-0" />
          <span>التجارب المجانية (20 د)</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === 'trials' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {validFutureTrialSlots.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('groups')}
          className={`px-3.5 py-2.5 min-h-[44px] rounded-xl font-['Cairo'] text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
            activeTab === 'groups'
              ? 'bg-[#0D4E8B] text-white shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2A44] hover:bg-white'
          }`}
        >
          <Users className="w-4 h-4 shrink-0" />
          <span>المجموعات</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === 'groups' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {validFutureGroups.length}
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 0: FIRST PAGE — PROFILE READINESS STEPS & OVERVIEW */}
      {/* ========================================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-fade-in">
          {/* 5 Setup Steps Checklist */}
          <div className="bg-white rounded-3xl border border-[#E2E8F0] p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#F1F5F9] pb-3">
              <div>
                <h2 className="font-['Cairo'] text-base sm:text-lg font-bold text-[#1F2A44]">
                  خطوات تجهيز ملفك التدريسي
                </h2>
                <p className="text-xs text-[#64748B] mt-0.5">
                  تأكد من اكتمال العناصر الخمسة التالية ليظهر ملفك بأفضل صورة لأولياء الأمور
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenParentPreview}
                disabled={isLoadingPreview}
                className="px-3.5 py-2 min-h-[44px] rounded-xl bg-[#F0F6FD] hover:bg-[#E2EFFD] text-[#0D4E8B] text-xs font-bold transition-all flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
              >
                <Eye className="w-4 h-4" />
                <span>شوف ملفك زي ولي الأمر</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {readinessSteps.map((step, index) => (
                <div
                  key={step.key}
                  className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 ${
                    step.completed
                      ? 'bg-emerald-50/40 border-emerald-200'
                      : 'bg-amber-50/40 border-amber-200'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-[#64748B]">
                        الخطوة {index + 1}
                      </span>
                      {step.completed ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>مكتمل</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-full">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>يحتاج استكمال</span>
                        </span>
                      )}
                    </div>
                    <h3 className="font-['Cairo'] text-sm font-bold text-[#1F2A44]">
                      {step.title}
                    </h3>
                    <p className="text-xs text-[#64748B] leading-relaxed">{step.statusText}</p>
                  </div>

                  {step.key !== 'specializations' && (
                    <button
                      type="button"
                      onClick={() => setActiveTab(step.targetTab)}
                      className="w-full py-2 min-h-[40px] rounded-xl bg-white hover:bg-slate-50 border border-[#CBD5E1] text-xs font-bold text-[#0D4E8B] transition-colors cursor-pointer"
                    >
                      {step.actionLabel}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-xs flex flex-col justify-between gap-3">
              <div className="space-y-1">
                <span className="text-xs text-[#64748B] font-bold block">سعري ومدة الحصة الفردية</span>
                <div className="font-['Cairo'] text-base sm:text-lg font-extrabold text-[#0D4E8B]">
                  {
                    formatSessionPriceSummary({
                      minPrice: tutor.hourlyRateMin,
                      maxPrice: tutor.hourlyRateMax,
                      currency: tutor.currency,
                      durationMinutes: tutor.sessionDurationMinutes,
                    }).combinedText
                  }
                </div>
                <span className="text-[11px] text-[#64748B] block">
                  للحصة الواحدة • يُحفظ ويُنشر مباشرةً في ملفك
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('pricing')}
                className="px-3 py-2 min-h-[40px] rounded-xl bg-[#F0F6FD] hover:bg-[#E2EFFD] text-xs font-bold text-[#0D4E8B] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>تعديل السعر ومدة الحصة</span>
              </button>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-xs flex flex-col justify-between gap-3">
              <div className="space-y-1">
                <span className="text-xs text-[#64748B] font-bold block">الخبرة التعليمية</span>
                <div className="font-['Cairo'] text-lg font-extrabold text-[#1F2A44]">
                  {formatTutorExperience(tutor.yearsOfExperience, tutor.experienceBadgeText) ||
                    'معلم معتمد'}
                </div>
                <span className="text-[11px] text-[#64748B] block">
                  تظهر موحّدة في بطاقة البحث والملف العام
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('profile-draft')}
                className="px-3 py-2 min-h-[40px] rounded-xl bg-[#F0F6FD] hover:bg-[#E2EFFD] text-xs font-bold text-[#0D4E8B] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>تعديل صورتي ونبذتي</span>
              </button>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-xs flex flex-col justify-between gap-3">
              <div className="space-y-1">
                <span className="text-xs text-[#64748B] font-bold block">
                  المواعيد المستقبلية المتاحة
                </span>
                <div className="font-['Cairo'] text-lg font-extrabold text-[#0D4E8B]">
                  {validFuturePrivateSlots.length} حصة خاصة • {validFutureTrialSlots.length} تجريبية
                </div>
                <span className="text-[11px] text-emerald-800 font-bold block">
                  {validFutureGroups.length} مجموعة نشطة • {futurePrivateBookedCount} حصة خاصة محجوزة
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('private')}
                  className="px-2.5 py-2 min-h-[40px] rounded-xl bg-[#F0F6FD] hover:bg-[#E2EFFD] text-xs font-bold text-[#0D4E8B] transition-colors cursor-pointer"
                >
                  إضافة موعد
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('groups');
                    handleOpenNewGroupWizard();
                  }}
                  className="px-2.5 py-2 min-h-[40px] rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-[#1F2A44] transition-colors cursor-pointer"
                >
                  إنشاء مجموعة
                </button>
              </div>
            </div>
          </div>

          {/* Approved Specializations Card */}
          <div className="bg-white rounded-3xl border border-[#E2E8F0] p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <h3 className="font-['Cairo'] text-base font-bold text-[#1F2A44] flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#0D4E8B]" />
                <span>تخصصاتي المعتمدة في منصة شاطر ({specializations.length})</span>
              </h3>
              <span className="text-xs text-[#64748B]">
                التخصصات المعتمدة في ملفك التي يمكنك فتح مواعيد ومجموعات لها
              </span>
            </div>

            {specializations.length === 0 ? (
              <p className="text-xs text-[#64748B]">لم يتم ربط تخصصات معتمدة بعد.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {specializations.map((spec) => (
                  <div
                    key={spec.id}
                    className="p-3.5 rounded-2xl bg-[#F8F9FC] border border-[#E2E8F0] flex items-center gap-3"
                  >
                    <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#0D4E8B] flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs sm:text-sm text-[#1F2A44]">{spec.label}</h4>
                      <span className="text-[10px] text-[#64748B]">
                        {spec.track === 'school' ? 'المسار المدرسي' : 'مسار القرآن والتأسيس'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 1: DIRECT PRICING & DURATION EDITOR («سعري ومدة الحصة») */}
      {/* ========================================================================= */}
      {activeTab === 'pricing' && (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-white rounded-3xl border border-[#E2E8F0] p-5 sm:p-8 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#F1F5F9] pb-4">
              <div className="space-y-1">
                <h2 className="font-['Cairo'] text-base sm:text-lg font-bold text-[#1F2A44] flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-[#0D4E8B]" />
                  <span>سعري ومدة الحصة الفردية</span>
                </h2>
                <p className="text-xs text-[#64748B] leading-relaxed">
                  عدّل سعر الحصة الواحدة وعملتك ومدة الحصة بالدقائق. يظهر السعر الجديد مباشرةً في ملفك المنشور، ويصبح هو السعر الافتراضي للمواعيد الخاصة الجديدة.
                </p>
              </div>

              <button
                type="button"
                onClick={handleOpenParentPreview}
                disabled={isLoadingPreview}
                className="px-3.5 py-2 min-h-[44px] rounded-xl bg-[#F0F6FD] hover:bg-[#E2EFFD] border border-blue-200 text-xs font-bold text-[#0D4E8B] transition-all flex items-center gap-1.5 self-start sm:self-auto cursor-pointer shrink-0"
              >
                <Eye className="w-4 h-4" />
                <span>شوف ملفك زي ولي الأمر</span>
              </button>
            </div>

            {/* Clarification Banner */}
            <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 text-xs sm:text-sm flex items-start gap-3">
              <Info className="w-5 h-5 text-[#0D4E8B] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold block">
                  توضيح تسعير الحصة الفردية (1:1):
                </span>
                <p className="leading-relaxed text-blue-800">
                  السعر المحدد هنا هو <strong>سعر الحصة الواحدة بالمدة المختارة ({pricingDurationMinutes} دقيقة)</strong> وليس سعر باقة. تعديل السعر هنا لا يغيّر أسعار أو مدد المواعيد المضافة مسبقاً أو الحجوزات المؤكدة، كما يمكنك تخصيص سعر أي موعد خاص عند إضافته.
                </p>
              </div>
            </div>

            {pricingSaveError && (
              <div
                role="alert"
                className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start gap-2.5"
              >
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <span className="font-bold">{pricingSaveError}</span>
              </div>
            )}

            {pricingSaveSuccess && (
              <div
                role="status"
                className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm flex items-start gap-2.5"
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <span className="font-bold">{pricingSaveSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSaveProfilePricing} noValidate className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Single Session Price */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="tutor-pricing-session-price"
                    className="text-xs sm:text-sm font-bold text-[#1F2A44] block"
                  >
                    سعر الحصة الواحدة <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="tutor-pricing-session-price"
                    type="number"
                    min={1}
                    max={100000}
                    step={1}
                    value={pricingSessionPriceInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPricingSessionPriceInput(val);
                      const num = Number(val);
                      if (val.trim() !== '' && Number.isFinite(num)) {
                        setPricingSessionPrice(num);
                      }
                      if (pricingFieldErrors.price) {
                        setPricingFieldErrors((prev) => ({ ...prev, price: undefined }));
                      }
                    }}
                    required
                    className={`w-full h-11 px-3.5 rounded-xl border text-sm font-bold focus:border-[#0D4E8B] outline-none ${
                      pricingFieldErrors.price
                        ? 'border-rose-400 bg-rose-50/40'
                        : 'border-[#CBD5E1]'
                    }`}
                  />
                  <span className="text-[11px] text-[#64748B] block">
                    رقم صحيح بدون كسور (من 1 إلى 100000 — مثل 127 أو 175)
                  </span>
                  {pricingFieldErrors.price && (
                    <p
                      role="alert"
                      className="text-[11px] text-rose-600 font-bold flex items-start gap-1 pt-0.5"
                    >
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{pricingFieldErrors.price}</span>
                    </p>
                  )}
                </div>

                {/* Currency */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="tutor-pricing-currency"
                    className="text-xs sm:text-sm font-bold text-[#1F2A44] block"
                  >
                    العملة <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="tutor-pricing-currency"
                    value={pricingCurrency}
                    onChange={(e) => setPricingCurrency(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm font-bold focus:border-[#0D4E8B] outline-none bg-white"
                  >
                    {SUPPORTED_TUTOR_CURRENCIES.map((curr) => (
                      <option key={curr.value} value={curr.value}>
                        {curr.label}
                      </option>
                    ))}
                  </select>
                  <span className="text-[11px] text-[#64748B] block">
                    تظهر بجانب السعر في ملفك العام
                  </span>
                </div>

                {/* Session Duration Minutes */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="tutor-pricing-duration"
                    className="text-xs sm:text-sm font-bold text-[#1F2A44] block"
                  >
                    مدة الحصة بالدقائق <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="tutor-pricing-duration"
                    value={pricingDurationMinutes}
                    onChange={(e) => {
                      setPricingDurationMinutes(Number(e.target.value));
                      if (pricingFieldErrors.duration) {
                        setPricingFieldErrors((prev) => ({ ...prev, duration: undefined }));
                      }
                    }}
                    className={`w-full h-11 px-3.5 rounded-xl border text-xs sm:text-sm font-bold focus:border-[#0D4E8B] outline-none bg-white ${
                      pricingFieldErrors.duration
                        ? 'border-rose-400 bg-rose-50/40'
                        : 'border-[#CBD5E1]'
                    }`}
                  >
                    <option value={30}>30 دقيقة</option>
                    <option value={45}>45 دقيقة</option>
                    <option value={50}>50 دقيقة (المعتادة)</option>
                    <option value={60}>60 دقيقة (ساعة كاملة)</option>
                    <option value={75}>75 دقيقة</option>
                    <option value={90}>90 دقيقة (ساعة ونصف)</option>
                    <option value={120}>120 دقيقة (ساعتان)</option>
                  </select>
                  <span className="text-[11px] text-[#64748B] block">
                    مدة الحصة الواحدة المقابلة للسعر أعلاه
                  </span>
                  {pricingFieldErrors.duration && (
                    <p
                      role="alert"
                      className="text-[11px] text-rose-600 font-bold flex items-start gap-1 pt-0.5"
                    >
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{pricingFieldErrors.duration}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Live Display Preview */}
              <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#64748B]">
                  كيف سيظهر السعر لولي الأمر في ملفك:
                </span>
                <span className="font-['Cairo'] text-sm sm:text-base font-extrabold text-[#0D4E8B]">
                  {
                    formatSessionPriceSummary({
                      minPrice: pricingSessionPrice,
                      maxPrice: pricingSessionPrice,
                      currency: pricingCurrency,
                      durationMinutes: pricingDurationMinutes,
                    }).combinedText
                  }
                </span>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isSavingPricing}
                  className="px-6 py-3 min-h-[44px] rounded-xl bg-[#0D4E8B] hover:bg-[#003767] disabled:opacity-50 text-white text-xs sm:text-sm font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
                >
                  {isSavingPricing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>حفظ السعر ومدة الحصة ونشره</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 2: SELF-SERVICE AVATAR & PROFILE TEXTS («صورتي ونبذتي») */}
      {/* ========================================================================= */}
      {activeTab === 'profile-draft' && (
        <div className="space-y-6 animate-fade-in">
          {/* PART A: SELF-SERVICE AVATAR — DIRECT UPLOAD & PUBLISH */}
          <div className="bg-white rounded-3xl border border-[#E2E8F0] p-5 sm:p-8 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#F1F5F9] pb-4">
              <div>
                <h2 className="font-['Cairo'] text-base sm:text-lg font-bold text-[#1F2A44] flex items-center gap-2">
                  <Camera className="w-5 h-5 text-[#0D4E8B]" />
                  <span>الصورة الشخصية لملفك</span>
                </h2>
                <p className="text-xs text-[#64748B] mt-0.5">
                  اختر صورة واضحة لوجهك بإضاءة جيدة، عاينها، ثم اضغط «حفظ الصورة ونشرها» لتظهر فوراً في ملفك العام.
                </p>
              </div>

              <button
                type="button"
                onClick={handleOpenParentPreview}
                disabled={isLoadingPreview}
                className="px-3.5 py-2 min-h-[44px] rounded-xl bg-[#F0F6FD] hover:bg-[#E2EFFD] border border-blue-200 text-xs font-bold text-[#0D4E8B] transition-all flex items-center gap-1.5 self-start sm:self-auto cursor-pointer shrink-0"
              >
                <Eye className="w-4 h-4" />
                <span>شوف ملفك زي ولي الأمر</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 1. Current Published Avatar */}
              <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#CBD5E1] flex items-center gap-3.5">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden bg-slate-100 border border-slate-300 shrink-0 flex items-center justify-center">
                  {tutor.avatarUrl ? (
                    <img
                      src={tutor.avatarUrl}
                      alt={tutor.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-8 h-8 text-slate-400" />
                  )}
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 block">
                    الصورة الحالية المنشورة:
                  </span>
                  <span className="text-xs font-bold text-[#1F2A44] block">
                    {tutor.avatarUrl
                      ? 'تظهر حالياً لأولياء الأمور في ملفك'
                      : 'لم تقم بنشر صورة شخصية بعد'}
                  </span>
                </div>
              </div>

              {/* 2. Select & Preview New Avatar */}
              <div className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#CBD5E1] flex items-center gap-3.5 relative">
                <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden bg-slate-100 border border-slate-300 shrink-0 flex items-center justify-center">
                  {selectedAvatarPreviewUrl ? (
                    <img
                      src={selectedAvatarPreviewUrl}
                      alt="معاينة الصورة المختارة"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Camera className="w-7 h-7 text-slate-400" />
                  )}

                  {isSavingAvatar && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center text-white">
                      <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                  )}
                </div>

                <div className="space-y-2 flex-1 min-w-0">
                  <label
                    htmlFor="tutor-self-avatar-input"
                    className="px-3.5 py-2 min-h-[40px] rounded-xl border border-[#0D4E8B] bg-blue-50/70 hover:bg-blue-100/70 text-xs font-bold text-[#0D4E8B] transition-all cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Camera className="w-4 h-4 shrink-0" />
                    <span>{selectedAvatarFile ? 'تغيير الصورة المختارة' : 'اختيار صورة جديدة'}</span>
                  </label>
                  <input
                    id="tutor-self-avatar-input"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleAvatarFileSelect}
                    disabled={isSavingAvatar}
                    className="sr-only"
                  />
                  <p className="text-[11px] text-[#64748B]">
                    صيغ مدعومة: JPG أو PNG أو WebP بحد أقصى 2 ميجابايت.
                  </p>
                </div>
              </div>
            </div>

            {avatarSaveError && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="font-bold">{avatarSaveError}</span>
              </div>
            )}

            {avatarSaveSuccess && (
              <div
                role="status"
                className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-bold">{avatarSaveSuccess}</span>
              </div>
            )}

            <div className="pt-1 flex items-center justify-end">
              <button
                type="button"
                onClick={handleSaveAndPublishAvatar}
                disabled={isSavingAvatar || !selectedAvatarFile}
                className="px-6 py-2.5 min-h-[44px] rounded-xl bg-[#0D4E8B] hover:bg-[#003767] disabled:opacity-50 text-white text-xs sm:text-sm font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
              >
                {isSavingAvatar ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري حفظ الصورة ونشرها...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>حفظ الصورة ونشرها</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* PART B: TEXTS FORM — IMMEDIATE UPDATE */}
          <div className="bg-white rounded-3xl border border-[#E2E8F0] p-5 sm:p-8 shadow-xs space-y-6">
            <div className="space-y-1 border-b border-[#F1F5F9] pb-4">
              <h3 className="font-['Cairo'] text-base sm:text-lg font-bold text-[#1F2A44] flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-[#0D4E8B]" />
                <span>النبذة ونصوص ملفك التعريفي</span>
              </h3>
              <p className="text-xs text-[#64748B] leading-relaxed">
                عدّل الجملة القصيرة ونبذتك وكيف تساعد الطفل، وستُحفظ وتظهر في ملفك المنشور مباشرةً.
              </p>
            </div>

            {/* Clarification of Headline vs Bio */}
            <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 text-xs space-y-1.5">
              <div className="font-bold flex items-center gap-1.5 text-[#0D4E8B]">
                <Info className="w-4 h-4 shrink-0" />
                <span>الفرق بين العنوان القصير والنبذة التفصيلية:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-blue-800 leading-relaxed">
                <li>
                  <strong>العنوان القصير (جملة قصيرة عنك):</strong> يظهر مباشرةً تحت اسمك في بطاقة البحث وأعلى ملفك التعريفي (مطلوب: من 10 إلى 250 حرفًا — عبارات مثل «مدرسة رياضيات» أو «معلم لغة عربية» تحقق الشرط).
                </li>
                <li>
                  <strong>النبذة التفصيلية لولي الأمر:</strong> تظهر داخل صفحة ملفك لتوضيح خبرتك الأكاديمية وطريقتك في الشرح والمتابعة مع ولي الأمر (اختيارية: من 20 إلى 2500 حرفًا عند كتابتها).
                </li>
              </ul>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>ممنوع كتابة أرقام هاتف أو روابط أو حسابات تواصل داخل النصوص.</span>
            </div>

            {textSaveError && (
              <div
                role="alert"
                className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start gap-2.5"
              >
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <span className="font-bold">{textSaveError}</span>
              </div>
            )}

            {textSaveSuccess && (
              <div
                role="status"
                className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm flex items-start gap-2.5"
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <span className="font-bold">{textSaveSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSaveProfileText} noValidate className="space-y-5">
              {/* 1. Short Headline ("جملة قصيرة عنك / العنوان القصير") */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label
                    htmlFor="tutor-profile-headline"
                    className="text-xs sm:text-sm font-bold text-[#1F2A44] block"
                  >
                    العنوان القصير (جملة قصيرة عنك) <span className="text-rose-500">*</span>
                  </label>
                  <span
                    className={`text-[11px] font-mono font-bold ${
                      draftHeadline.trim().length < 10 || draftHeadline.trim().length > 250
                        ? 'text-amber-600'
                        : 'text-emerald-700'
                    }`}
                  >
                    عدد الحروف: {draftHeadline.trim().length} / 250 (الحد المطلوب: من 10 إلى 250 حرفًا)
                  </span>
                </div>
                <input
                  id="tutor-profile-headline"
                  type="text"
                  value={draftHeadline}
                  onChange={(e) => {
                    setDraftHeadline(e.target.value);
                    if (textFieldErrors.headline) {
                      setTextFieldErrors((prev) => ({ ...prev, headline: undefined }));
                    }
                  }}
                  maxLength={250}
                  placeholder="مثال: مدرسة رياضيات — أو: أساعد طلاب الإعدادي يفهموا الرياضيات خطوة بخطوة"
                  required
                  className={`w-full h-11 px-3.5 rounded-xl border text-xs sm:text-sm focus:border-[#0D4E8B] outline-none ${
                    textFieldErrors.headline
                      ? 'border-rose-400 bg-rose-50/40'
                      : 'border-[#CBD5E1]'
                  }`}
                />
                <p className="text-[11px] text-[#64748B]">
                  يظهر تحت اسمك مباشرة في البطاقات. مثال مقبول: «مدرسة رياضيات» (13 حرفًا) أو «أساعد طلاب الإعدادي يفهموا الرياضيات خطوة بخطوة».
                </p>
                {textFieldErrors.headline && (
                  <p
                    role="alert"
                    className="text-[11px] text-rose-600 font-bold flex items-start gap-1 pt-0.5"
                  >
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{textFieldErrors.headline}</span>
                  </p>
                )}
              </div>

              {/* 2. Help Child Quote ("إزاي بتساعد الطفل يفهم؟") */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label
                    htmlFor="tutor-profile-quote"
                    className="text-xs sm:text-sm font-bold text-[#1F2A44] block"
                  >
                    إزاي بتساعد الطفل يفهم؟{' '}
                    <span className="text-[11px] font-normal text-[#64748B]">(اختياري)</span>
                  </label>
                  <span
                    className={`text-[11px] font-mono font-bold ${
                      draftQuote.trim().length > 0 &&
                      (draftQuote.trim().length < 5 || draftQuote.trim().length > 350)
                        ? 'text-amber-600'
                        : 'text-slate-500'
                    }`}
                  >
                    عدد الحروف: {draftQuote.trim().length} / 350 (الحد عند الكتابة: من 5 إلى 350 حرفًا)
                  </span>
                </div>
                <textarea
                  id="tutor-profile-quote"
                  rows={2}
                  value={draftQuote}
                  onChange={(e) => {
                    setDraftQuote(e.target.value);
                    if (textFieldErrors.quote) {
                      setTextFieldErrors((prev) => ({ ...prev, quote: undefined }));
                    }
                  }}
                  maxLength={350}
                  placeholder="مثال: أبسّط الدرس بأمثلة عملية قريبة من الطفل وأتأكد إنه حل بنفسه قبل نهاية الحصة."
                  className={`w-full p-3 rounded-xl border text-xs sm:text-sm focus:border-[#0D4E8B] outline-none ${
                    textFieldErrors.quote
                      ? 'border-rose-400 bg-rose-50/40'
                      : 'border-[#CBD5E1]'
                  }`}
                />
                {textFieldErrors.quote && (
                  <p
                    role="alert"
                    className="text-[11px] text-rose-600 font-bold flex items-start gap-1 pt-0.5"
                  >
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{textFieldErrors.quote}</span>
                  </p>
                )}
              </div>

              {/* 3. Summary ("اكتب نبذة عنك لولي الأمر") */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label
                    htmlFor="tutor-profile-summary"
                    className="text-xs sm:text-sm font-bold text-[#1F2A44] block"
                  >
                    النبذة التفصيلية عنك لولي الأمر{' '}
                    <span className="text-[11px] font-normal text-[#64748B]">(اختياري)</span>
                  </label>
                  <span
                    className={`text-[11px] font-mono font-bold ${
                      draftSummary.trim().length > 0 &&
                      (draftSummary.trim().length < 20 || draftSummary.trim().length > 2500)
                        ? 'text-amber-600'
                        : 'text-slate-500'
                    }`}
                  >
                    عدد الحروف: {draftSummary.trim().length} / 2500 (الحد عند الكتابة: من 20 إلى 2500 حرفًا)
                  </span>
                </div>
                <textarea
                  id="tutor-profile-summary"
                  rows={5}
                  value={draftSummary}
                  onChange={(e) => {
                    setDraftSummary(e.target.value);
                    if (textFieldErrors.summary) {
                      setTextFieldErrors((prev) => ({ ...prev, summary: undefined }));
                    }
                  }}
                  maxLength={2500}
                  placeholder="اكتب نبذة واضحة لولي الأمر تذكر فيها خبرتك وطريقتك..."
                  className={`w-full p-3 rounded-xl border text-xs sm:text-sm focus:border-[#0D4E8B] outline-none ${
                    textFieldErrors.summary
                      ? 'border-rose-400 bg-rose-50/40'
                      : 'border-[#CBD5E1]'
                  }`}
                />
                <p className="text-[11px] text-[#64748B]">
                  تظهر في قسم النبذة التفصيلية داخل ملفك. اذكر خبرتك وطريقتك وإزاي بتتابع مع ولي الأمر.
                </p>
                {textFieldErrors.summary && (
                  <p
                    role="alert"
                    className="text-[11px] text-rose-600 font-bold flex items-start gap-1 pt-0.5"
                  >
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{textFieldErrors.summary}</span>
                  </p>
                )}
              </div>

              <div className="pt-2 flex items-center justify-end">
                <button
                  type="submit"
                  disabled={isSavingProfileText}
                  className="px-6 py-3 min-h-[44px] rounded-xl bg-[#0D4E8B] hover:bg-[#003767] disabled:opacity-50 text-white text-xs sm:text-sm font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
                >
                  {isSavingProfileText ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>حفظ النبذة ونشرها</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 3: TRIAL SLOTS (مدة 20 دقيقة بالضبط + إضافة وتعديل وحذف) */}
      {/* ========================================================================= */}
      {activeTab === 'trials' && (
        <div className="space-y-6 animate-fade-in">
          <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 text-xs sm:text-sm flex items-start gap-3">
            <Info className="w-5 h-5 text-[#0D4E8B] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold block">نظام الحصص التجريبية المجانية (20 دقيقة):</span>
              <p className="leading-relaxed text-blue-800">
                مدتها محددة بالنظام بـ 20 دقيقة بالضبط، ويُحسب وقت النهاية تلقائياً. يمكنك اختيار التوقيت (القاهرة أو الرياض أو دبي) وتعديل أو حذف أي موعد غير محجوز.
              </p>
            </div>
          </div>

          {/* Add Trial Slot Form */}
          <div className="bg-white rounded-3xl border border-[#E2E8F0] p-5 sm:p-6 shadow-xs space-y-4">
            <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#1F2A44] flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#0D4E8B]" />
              <span>إضافة موعد تجريبي متاح (مجاني - 20 دقيقة بالضبط)</span>
            </h3>

            <form
              onSubmit={handleCreateTrialSlot}
              noValidate
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2"
            >
              <div className="space-y-1">
                <label
                  htmlFor="new-trial-date"
                  className="text-xs font-bold text-[#1F2A44] block"
                >
                  التاريخ
                </label>
                <input
                  id="new-trial-date"
                  type="date"
                  min={getTodayCalendarDateInTimezone(newTrialTimezone)}
                  value={newTrialDate}
                  onChange={(e) => {
                    setNewTrialDate(e.target.value);
                    if (trialFieldErrors.date) {
                      setTrialFieldErrors((prev) => ({ ...prev, date: undefined }));
                    }
                  }}
                  required
                  className={`w-full h-11 px-3 rounded-xl border text-xs focus:border-[#0D4E8B] outline-none ${
                    trialFieldErrors.date ? 'border-rose-400 bg-rose-50/40' : 'border-[#CBD5E1]'
                  }`}
                />
                {trialFieldErrors.date && (
                  <p role="alert" className="text-[11px] text-rose-600 font-bold flex items-start gap-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{trialFieldErrors.date}</span>
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="new-trial-start"
                  className="text-xs font-bold text-[#1F2A44] block"
                >
                  وقت البداية
                </label>
                <input
                  id="new-trial-start"
                  type="time"
                  value={newTrialStart}
                  onChange={(e) => handleTrialStartChange(e.target.value)}
                  required
                  className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="new-trial-end"
                  className="text-xs font-bold text-[#1F2A44] block"
                >
                  وقت النهاية (20 دقيقة تلقائياً)
                </label>
                <input
                  id="new-trial-end"
                  type="time"
                  value={newTrialEnd}
                  readOnly
                  className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-xs bg-slate-50 text-slate-600 cursor-not-allowed outline-none"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="new-trial-timezone"
                  className="text-xs font-bold text-[#1F2A44] block"
                >
                  المنطقة الزمنية
                </label>
                <select
                  id="new-trial-timezone"
                  value={newTrialTimezone}
                  onChange={(e) => setNewTrialTimezone(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none bg-white"
                >
                  {SUPPORTED_TUTOR_TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1 flex flex-col justify-end">
                <button
                  type="submit"
                  disabled={isAddingTrial}
                  className="w-full h-11 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] disabled:opacity-50 text-white text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isAddingTrial ? (
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

          {/* Trial Slots List */}
          <div className="bg-white rounded-3xl border border-[#E2E8F0] p-5 sm:p-6 shadow-xs space-y-4">
            <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#1F2A44] flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#0D4E8B]" />
                <span>قائمة المواعيد التجريبية ({trialSlots.length})</span>
              </span>
              <span className="text-xs text-[#64748B] font-normal">
                {validFutureTrialSlots.length} متاح مستقبلي •{' '}
                {trialSlots.filter((s) => s.isBooked).length} محجوز
              </span>
            </h3>

            {trialReloadWarning && (
              <div
                role="alert"
                className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-bold block">تم الحفظ، لكن تعذر تحديث القائمة</span>
                    <p className="text-xs text-amber-900">{trialReloadWarning}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => loadTrialSlots()}
                  disabled={isLoadingTrials}
                  className="px-4 py-2 min-h-[40px] rounded-xl bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                >
                  {isLoadingTrials ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  <span>إعادة تحميل القائمة</span>
                </button>
              </div>
            )}

            {trialSlotsLoadError && (
              <div
                role="alert"
                className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-bold block">فشل تحميل قائمة المواعيد التجريبية</span>
                    <p className="text-xs text-rose-800">{trialSlotsLoadError}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => loadTrialSlots()}
                  disabled={isLoadingTrials}
                  className="px-4 py-2 min-h-[40px] rounded-xl bg-white hover:bg-rose-100 border border-rose-300 text-rose-800 text-xs font-bold transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                >
                  {isLoadingTrials ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  <span>إعادة تحميل القائمة</span>
                </button>
              </div>
            )}

            {isLoadingTrials ? (
              <div className="p-8 text-center text-xs text-[#64748B] flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>جاري تحميل المواعيد التجريبية...</span>
              </div>
            ) : trialSlots.length === 0 ? (
              !trialSlotsLoadError && !trialReloadWarning ? (
                <div className="p-8 text-center border-2 border-dashed border-[#CBD5E1] rounded-2xl space-y-2">
                  <Clock3 className="w-8 h-8 text-[#CBD5E1] mx-auto" />
                  <p className="text-xs font-bold text-[#64748B]">
                    لم تقم بإضافة أي مواعيد تجريبية بعد.
                  </p>
                </div>
              ) : null
            ) : (
              <div className="divide-y divide-[#F1F5F9]">
                {trialSlots.map((slot) => {
                  const isFuture = isSlotInFuture(
                    slot.slotDate,
                    slot.startTime,
                    slot.timezone || 'Africa/Cairo'
                  );
                  const isPast = !isFuture;
                  const dateFormatted = formatSlotDateArabic(
                    slot.slotDate,
                    slot.timezone || 'Africa/Cairo'
                  );
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
                              : slot.isAvailable && !isPast && !slot.adminSuspended
                              ? 'bg-blue-50 text-[#0D4E8B] border border-blue-200'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          <Clock className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs sm:text-sm text-[#1F2A44]">
                              {dateFormatted.fullLabel}
                            </span>
                            <span className="font-mono text-xs text-[#64748B]" dir="ltr">
                              {slot.startTime.substring(0, 5)} - {slot.endTime.substring(0, 5)}
                            </span>
                            <span className="text-[10px] text-[#64748B]">
                              ({getTimezoneArabicLabel(slot.timezone || 'Africa/Cairo')})
                            </span>
                          </div>

                          <div className="flex items-center gap-2 mt-0.5">
                            {slot.isBooked ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                                <Lock className="w-3 h-3 text-emerald-600" />
                                <span>محجوز لطالب</span>
                              </span>
                            ) : slot.adminSuspended ? (
                              <span className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">
                                موقوف إدارياً
                              </span>
                            ) : slot.isAvailable && !isPast ? (
                              <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                                متاح للحجز (20 دقيقة)
                              </span>
                            ) : isPast ? (
                              <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                انقضى وقته
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                                غير متاح
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Edit & Delete Actions (Protected if booked or adminSuspended) */}
                      {!slot.isBooked && slot.isAvailable && !isPast && !slot.adminSuspended ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTrialSlot(slot);
                              setEditTrialDate(slot.slotDate);
                              const st = slot.startTime.substring(0, 5);
                              setEditTrialStart(st);
                              setEditTrialEnd(addMinutesToTimeStr(st, 20));
                              setEditTrialTimezone(slot.timezone || 'Africa/Cairo');
                            }}
                            className="px-3 py-1.5 min-h-[38px] rounded-xl border border-blue-200 text-[#0D4E8B] hover:bg-blue-50 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>تعديل</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteTrialSlot(slot.id)}
                            disabled={deletingTrialId === slot.id}
                            className="px-3 py-1.5 min-h-[38px] rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            {deletingTrialId === slot.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <>
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>حذف</span>
                              </>
                            )}
                          </button>
                        </div>
                      ) : slot.isBooked ? (
                        <span className="text-[11px] text-emerald-800 font-bold bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>محمي (محجوز لطالب)</span>
                        </span>
                      ) : slot.adminSuspended ? (
                        <span className="text-[11px] text-rose-700 font-bold bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg">
                          محمي (موقوف إدارياً)
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

      {/* ========================================================================= */}
      {/* SECTION 4: PAID PRIVATE SESSIONS (الحصص الخاصة المدفوعة 1:1) */}
      {/* ========================================================================= */}
      {activeTab === 'private' && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-xs space-y-1">
              <span className="text-xs text-[#64748B] font-bold block">
                المواعيد الخاصة المستقبلية المتاحة
              </span>
              <div className="font-['Cairo'] text-2xl font-extrabold text-[#0D4E8B]">
                {validFuturePrivateSlots.length}
              </div>
              <span className="text-[11px] text-[#64748B] block">
                متاح للحجز الفوري من أولياء الأمور
              </span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-xs space-y-1">
              <span className="text-xs text-[#64748B] font-bold block">
                المواعيد المحجوزة المؤكدة
              </span>
              <div className="font-['Cairo'] text-2xl font-extrabold text-emerald-600">
                {futurePrivateBookedCount}
              </div>
              <span className="text-[11px] text-[#64748B] block">محمية ولا يمكن تعديلها أو حذفها</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-xs space-y-1">
              <span className="text-xs text-[#64748B] font-bold block">
                السعر الافتراضي للحصة الخاصة
              </span>
              <div className="font-['Cairo'] text-lg font-extrabold text-[#1F2A44]">
                {tutor.hourlyRateMin} {tutor.currency} / {tutor.sessionDurationMinutes} دقيقة
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('pricing')}
                className="text-[11px] font-bold text-[#0D4E8B] hover:underline cursor-pointer"
              >
                تعديل السعر الافتراضي للملف ←
              </button>
            </div>
          </div>

          {/* Add Private Slots Form */}
          <div className="bg-white rounded-3xl border border-[#E2E8F0] p-5 sm:p-6 shadow-xs space-y-5">
            <div className="border-b border-[#F1F5F9] pb-3">
              <h3 className="font-['Cairo'] text-base font-bold text-[#1F2A44] flex items-center gap-2">
                <CalendarCheck2 className="w-5 h-5 text-[#0D4E8B]" />
                <span>إضافة مواعيد الحصص الخاصة (فردية 1:1)</span>
              </h3>
              <p className="text-xs text-[#64748B] mt-0.5">
                يُستخدم سعرك ومدة حصتك المحفوظان في ملفك كقيمة افتراضية، مع إمكانية تخصيص سعر أو مدة هذا الموعد، ويُحسب وقت النهاية تلقائياً.
              </p>
            </div>

            {specializations.length === 0 ? (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                لا توجد تخصصات معتمدة مسجلة لملفك حالياً.
              </div>
            ) : (
              <form onSubmit={handleSavePrivateSlots} noValidate className="space-y-4">
                {/* 1. Multi-Specialization Selection */}
                <div className="space-y-2 p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold text-[#1F2A44] flex items-center gap-1.5">
                        <BookOpen className="w-4 h-4 text-[#0D4E8B]" />
                        <span>
                          التخصصات المعتمدة المتاحة لهذا الموعد{' '}
                          <span className="text-rose-500">*</span>
                        </span>
                      </span>
                      <p className="text-[11px] text-[#64748B] mt-0.5">
                        يمكنك اختيار أكثر من تخصص بديل لنفس الحصة، وعند حجز أي مادة منها يُقفل الموعد كاملاً لمنع التعارض.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setSelectedSpecIds(specializations.map((s) => s.id))}
                        className="px-2.5 py-1 text-[11px] font-bold text-[#0D4E8B] hover:bg-blue-50 rounded-lg transition-all border border-blue-200 cursor-pointer"
                      >
                        تحديد الكل
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (specializations.length > 0) setSelectedSpecIds([specializations[0].id]);
                        }}
                        className="px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-all border border-slate-200 cursor-pointer"
                      >
                        الأول فقط
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {specializations.map((spec) => {
                      const isChecked = selectedSpecIds.includes(spec.id);
                      const checkboxId = `private-spec-checkbox-${spec.id}`;
                      return (
                        <label
                          key={spec.id}
                          htmlFor={checkboxId}
                          className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex items-start gap-2.5 ${
                            isChecked
                              ? 'bg-blue-50/70 border-[#0D4E8B] text-[#0D4E8B] shadow-xs'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            id={checkboxId}
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                if (selectedSpecIds.length > 1) {
                                  setSelectedSpecIds(selectedSpecIds.filter((id) => id !== spec.id));
                                }
                              } else {
                                setSelectedSpecIds([...selectedSpecIds, spec.id]);
                              }
                              if (privateFieldErrors.specializations) {
                                setPrivateFieldErrors((prev) => ({
                                  ...prev,
                                  specializations: undefined,
                                }));
                              }
                            }}
                            className="w-4 h-4 rounded text-[#0D4E8B] focus:ring-[#0D4E8B] mt-0.5 shrink-0"
                          />
                          <div className="space-y-0.5">
                            <span className="font-bold block leading-tight">{spec.label}</span>
                            <span
                              className={`text-[10px] inline-block px-1.5 py-0.2 rounded font-medium ${
                                spec.track === 'school'
                                  ? 'bg-blue-100/70 text-[#0D4E8B]'
                                  : 'bg-emerald-100/70 text-emerald-800'
                              }`}
                            >
                              {spec.track === 'school' ? 'المسار المدرسي' : 'قرآن وتأسيس'}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  {privateFieldErrors.specializations && (
                    <p
                      role="alert"
                      className="text-[11px] text-rose-600 font-bold flex items-start gap-1 pt-1"
                    >
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{privateFieldErrors.specializations}</span>
                    </p>
                  )}
                </div>

                {/* 2. Duration, Price & IANA Timezone */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label
                      htmlFor="private-slot-duration"
                      className="text-xs font-bold text-[#1F2A44] block"
                    >
                      مدة الحصة (بالدقائق)
                    </label>
                    <select
                      id="private-slot-duration"
                      value={privateDurationMinutes}
                      onChange={(e) => setPrivateDurationMinutes(Number(e.target.value))}
                      className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none bg-white"
                    >
                      <option value={30}>30 دقيقة</option>
                      <option value={45}>45 دقيقة</option>
                      <option value={50}>50 دقيقة (المعتادة)</option>
                      <option value={60}>60 دقيقة (ساعة كاملة)</option>
                      <option value={75}>75 دقيقة</option>
                      <option value={90}>90 دقيقة (ساعة ونصف)</option>
                      <option value={120}>120 دقيقة (ساعتان)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="private-slot-price"
                      className="text-xs font-bold text-[#1F2A44] block"
                    >
                      سعر الحصة الواحدة ({privateCurrency})
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="private-slot-price"
                        type="number"
                        min={0}
                        max={100000}
                        step={1}
                        value={privatePriceInput}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPrivatePriceInput(val);
                          const num = Number(val);
                          if (val.trim() !== '' && Number.isFinite(num)) {
                            setPrivatePriceAmount(num);
                          }
                          if (privateFieldErrors.price) {
                            setPrivateFieldErrors((prev) => ({ ...prev, price: undefined }));
                          }
                        }}
                        required
                        className={`w-full h-11 px-3 rounded-xl border text-xs font-bold focus:border-[#0D4E8B] outline-none ${
                          privateFieldErrors.price
                            ? 'border-rose-400 bg-rose-50/40'
                            : 'border-[#CBD5E1]'
                        }`}
                      />
                      <span className="text-xs font-bold text-[#64748B] shrink-0">
                        {privateCurrency}
                      </span>
                    </div>
                    {privateFieldErrors.price && (
                      <p
                        role="alert"
                        className="text-[11px] text-rose-600 font-bold flex items-start gap-1 pt-0.5"
                      >
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{privateFieldErrors.price}</span>
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="private-slot-timezone"
                      className="text-xs font-bold text-[#1F2A44] block"
                    >
                      المنطقة الزمنية
                    </label>
                    <select
                      id="private-slot-timezone"
                      value={privateTimezone}
                      onChange={(e) => setPrivateTimezone(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none bg-white"
                    >
                      {SUPPORTED_TUTOR_TIMEZONES.map((tz) => (
                        <option key={tz.value} value={tz.value}>
                          {tz.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Scheduling Mode Switcher */}
                <div className="space-y-1">
                  <span className="text-xs font-bold text-[#1F2A44] block">نمط الإضافة</span>
                  <div className="grid grid-cols-2 gap-2 h-11 max-w-sm">
                    <button
                      type="button"
                      onClick={() => setPrivateSchedulingMode('single')}
                      className={`rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        privateSchedulingMode === 'single'
                          ? 'bg-[#0D4E8B] text-white shadow-xs'
                          : 'bg-slate-100 text-[#64748B] hover:bg-slate-200'
                      }`}
                    >
                      موعد منفرد
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrivateSchedulingMode('weekly_repeat')}
                      className={`rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        privateSchedulingMode === 'weekly_repeat'
                          ? 'bg-[#0D4E8B] text-white shadow-xs'
                          : 'bg-slate-100 text-[#64748B] hover:bg-slate-200'
                      }`}
                    >
                      تكرار أسبوعي
                    </button>
                  </div>
                </div>

                {/* 3. Scheduling Mode Specific Inputs */}
                {privateSchedulingMode === 'single' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                    <div className="space-y-1">
                      <label
                        htmlFor="private-single-date"
                        className="text-xs font-bold text-[#1F2A44] block"
                      >
                        تاريخ الموعد
                      </label>
                      <input
                        id="private-single-date"
                        type="date"
                        min={getTodayCalendarDateInTimezone(privateTimezone)}
                        value={privateSingleDate}
                        onChange={(e) => {
                          setPrivateSingleDate(e.target.value);
                          if (privateFieldErrors.date) {
                            setPrivateFieldErrors((prev) => ({ ...prev, date: undefined }));
                          }
                        }}
                        required
                        className={`w-full h-11 px-3 rounded-xl border text-xs focus:border-[#0D4E8B] outline-none bg-white ${
                          privateFieldErrors.date
                            ? 'border-rose-400 bg-rose-50/40'
                            : 'border-[#CBD5E1]'
                        }`}
                      />
                      {privateFieldErrors.date && (
                        <p
                          role="alert"
                          className="text-[11px] text-rose-600 font-bold flex items-start gap-1 pt-0.5"
                        >
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>{privateFieldErrors.date}</span>
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="private-single-start"
                        className="text-xs font-bold text-[#1F2A44] block"
                      >
                        وقت البداية
                      </label>
                      <input
                        id="private-single-start"
                        type="time"
                        value={privateStartTime}
                        onChange={(e) => setPrivateStartTime(e.target.value)}
                        required
                        className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="private-single-end"
                        className="text-xs font-bold text-[#1F2A44] block"
                      >
                        وقت النهاية (تلقائياً)
                      </label>
                      <input
                        id="private-single-end"
                        type="time"
                        value={addMinutesToTimeStr(privateStartTime, privateDurationMinutes)}
                        readOnly
                        className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-xs bg-slate-100 text-slate-600 cursor-not-allowed outline-none"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label
                          htmlFor="private-repeat-start"
                          className="text-xs font-bold text-[#1F2A44] block"
                        >
                          وقت البداية الموحد
                        </label>
                        <input
                          id="private-repeat-start"
                          type="time"
                          value={privateStartTime}
                          onChange={(e) => setPrivateStartTime(e.target.value)}
                          required
                          className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none bg-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label
                          htmlFor="private-repeat-end"
                          className="text-xs font-bold text-[#1F2A44] block"
                        >
                          وقت النهاية (تلقائياً)
                        </label>
                        <input
                          id="private-repeat-end"
                          type="time"
                          value={addMinutesToTimeStr(privateStartTime, privateDurationMinutes)}
                          readOnly
                          className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-xs bg-slate-100 text-slate-600 cursor-not-allowed outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label
                          htmlFor="private-repeat-until"
                          className="text-xs font-bold text-[#1F2A44] block"
                        >
                          تكرار أسبوعياً حتى تاريخ نهاية
                        </label>
                        <input
                          id="private-repeat-until"
                          type="date"
                          min={getTomorrowCalendarDateInTimezone(privateTimezone)}
                          value={privateRepeatUntilDate}
                          onChange={(e) => {
                            setPrivateRepeatUntilDate(e.target.value);
                            if (privateFieldErrors.date) {
                              setPrivateFieldErrors((prev) => ({ ...prev, date: undefined }));
                            }
                          }}
                          required
                          className={`w-full h-11 px-3 rounded-xl border text-xs focus:border-[#0D4E8B] outline-none bg-white ${
                            privateFieldErrors.date
                              ? 'border-rose-400 bg-rose-50/40'
                              : 'border-[#CBD5E1]'
                          }`}
                        />
                        {privateFieldErrors.date && (
                          <p
                            role="alert"
                            className="text-[11px] text-rose-600 font-bold flex items-start gap-1 pt-0.5"
                          >
                            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>{privateFieldErrors.date}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-xs font-bold text-[#1F2A44] block">
                        أيام التكرار بالأسبوع:
                      </span>
                      <div className="flex items-center gap-2 flex-wrap">
                        {[
                          { day: 6, label: 'السبت' },
                          { day: 0, label: 'الأحد' },
                          { day: 1, label: 'الاثنين' },
                          { day: 2, label: 'الثلاثاء' },
                          { day: 3, label: 'الأربعاء' },
                          { day: 4, label: 'الخميس' },
                          { day: 5, label: 'الجمعة' },
                        ].map((d) => {
                          const active = privateRepeatDays.includes(d.day);
                          return (
                            <button
                              key={d.day}
                              type="button"
                              onClick={() => {
                                if (active) {
                                  if (privateRepeatDays.length > 1) {
                                    setPrivateRepeatDays(privateRepeatDays.filter((x) => x !== d.day));
                                  }
                                } else {
                                  setPrivateRepeatDays([...privateRepeatDays, d.day]);
                                }
                              }}
                              className={`px-3 py-2 min-h-[40px] rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                                active
                                  ? 'bg-[#0D4E8B] text-white border-[#0D4E8B]'
                                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {d.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. Preview Section before saving */}
                {previewPrivateSlots.length > 0 && (
                  <div className="p-4 rounded-2xl bg-[#F0F6FD] border border-[#CBD5E1] space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <span className="font-bold text-xs text-[#0D4E8B] flex items-center gap-1.5">
                        <Eye className="w-4 h-4" />
                        <span>معاينة المواعيد قبل الحفظ ({previewPrivateSlots.length} موعد):</span>
                      </span>
                      <span className="text-[11px] text-[#64748B]">
                        المدة: {privateDurationMinutes} دقيقة • السعر: {privatePriceAmount}{' '}
                        {privateCurrency}
                      </span>
                    </div>

                    <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                      {previewPrivateSlots.map((p, idx) => {
                        const dateInfo = formatSlotDateArabic(p.date, privateTimezone);
                        return (
                          <div
                            key={`${p.date}-${idx}`}
                            className="p-2 rounded-xl bg-white border border-[#E2E8F0] flex items-center justify-between text-xs"
                          >
                            <span className="font-bold text-[#1F2A44]">{dateInfo.fullLabel}</span>
                            <span className="font-mono text-slate-600" dir="ltr">
                              {p.startTime} - {p.endTime}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSavingPrivateSlots}
                    className="px-6 py-2.5 min-h-[44px] rounded-xl bg-[#0D4E8B] hover:bg-[#003767] disabled:opacity-50 text-white text-xs sm:text-sm font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    {isSavingPrivateSlots ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>حفظ ونشر المواعيد الخاصة ({previewPrivateSlots.length})</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Private Slots List */}
          <div className="bg-white rounded-3xl border border-[#E2E8F0] p-5 sm:p-6 shadow-xs space-y-4">
            <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#1F2A44] flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#0D4E8B]" />
                <span>قائمة المواعيد الخاصة (1:1) المسجلة ({privateSlots.length})</span>
              </span>
              <span className="text-xs text-[#64748B] font-normal">
                المواعيد المحجوزة أو الموقوفة إدارياً محمية ولا يمكن تعديلها أو حذفها
              </span>
            </h3>

            {privateReloadWarning && (
              <div
                role="alert"
                className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-bold block">تم الحفظ، لكن تعذر تحديث القائمة</span>
                    <p className="text-xs text-amber-900">{privateReloadWarning}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => loadPrivateSlots()}
                  disabled={isLoadingPrivate}
                  className="px-4 py-2 min-h-[40px] rounded-xl bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                >
                  {isLoadingPrivate ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  <span>إعادة تحميل القائمة</span>
                </button>
              </div>
            )}

            {privateSlotsLoadError && (
              <div
                role="alert"
                className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-bold block">فشل تحميل قائمة المواعيد الخاصة</span>
                    <p className="text-xs text-rose-800">{privateSlotsLoadError}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => loadPrivateSlots()}
                  disabled={isLoadingPrivate}
                  className="px-4 py-2 min-h-[40px] rounded-xl bg-white hover:bg-rose-100 border border-rose-300 text-rose-800 text-xs font-bold transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                >
                  {isLoadingPrivate ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  <span>إعادة تحميل القائمة</span>
                </button>
              </div>
            )}

            {isLoadingPrivate ? (
              <div className="p-8 text-center text-xs text-[#64748B] flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>جاري تحميل المواعيد الخاصة...</span>
              </div>
            ) : privateSlots.length === 0 ? (
              !privateSlotsLoadError && !privateReloadWarning ? (
                <div className="p-8 text-center border-2 border-dashed border-[#CBD5E1] rounded-2xl space-y-2">
                  <CalendarCheck2 className="w-8 h-8 text-[#CBD5E1] mx-auto" />
                  <p className="text-xs font-bold text-[#64748B]">
                    لم تقم بإضافة أي مواعيد خاصة مدفوعة بعد.
                  </p>
                </div>
              ) : null
            ) : (
              <div className="divide-y divide-[#F1F5F9]">
                {privateSlots.map((slot) => {
                  const isFuture = isSlotInFuture(
                    slot.slotDate,
                    slot.startTime,
                    slot.timezone || 'Africa/Cairo'
                  );
                  const isPast = !isFuture;
                  const dateFormatted = formatSlotDateArabic(
                    slot.slotDate,
                    slot.timezone || 'Africa/Cairo'
                  );
                  return (
                    <div
                      key={slot.id}
                      className="py-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                            slot.isBooked
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : slot.isAvailable && !isPast && !slot.adminSuspended
                              ? 'bg-blue-50 text-[#0D4E8B] border border-blue-200'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          <Clock className="w-4 h-4" />
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs sm:text-sm text-[#1F2A44]">
                              {dateFormatted.fullLabel}
                            </span>
                            <span className="font-mono text-xs text-[#64748B]" dir="ltr">
                              {slot.startTime.substring(0, 5)} - {slot.endTime.substring(0, 5)}
                            </span>
                            <span className="text-[10px] text-[#64748B]">
                              ({getTimezoneArabicLabel(slot.timezone || 'Africa/Cairo')})
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-[11px] text-[#0D4E8B] font-bold border border-blue-200">
                              {slot.priceAmount} {slot.currency} ({slot.durationMinutes} دقيقة)
                            </span>
                          </div>

                          <p className="text-xs text-[#0D4E8B] font-bold">
                            {slot.specializationLabel}
                          </p>

                          {slot.allowedSpecializations && slot.allowedSpecializations.length > 1 && (
                            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                              <span className="text-[10px] font-bold text-slate-500">
                                التخصصات البديلة المتاحة:
                              </span>
                              {slot.allowedSpecializations.map((spec: any, sIdx: number) => (
                                <span
                                  key={sIdx}
                                  className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-medium"
                                >
                                  {spec.label || spec.name}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center gap-2 pt-0.5">
                            {slot.isBooked ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                                <Lock className="w-3 h-3 text-emerald-600" />
                                <span>محجوز مؤكد لطالب</span>
                              </span>
                            ) : slot.adminSuspended ? (
                              <span className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">
                                موقوف إدارياً
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
                                مغلق
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Actions (Protected if booked or adminSuspended) */}
                      {!slot.isBooked && slot.isAvailable && !isPast && !slot.adminSuspended ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPrivateSlot(slot);
                              setEditPrivateFieldErrors({});
                              setEditSlotDate(slot.slotDate);
                              const st = slot.startTime.substring(0, 5);
                              setEditSlotStart(st);
                              setEditSlotDuration(slot.durationMinutes);
                              setEditSlotEnd(addMinutesToTimeStr(st, slot.durationMinutes));
                              setEditSlotPrice(slot.priceAmount);
                              setEditSlotPriceInput(String(slot.priceAmount));
                              setEditSlotTimezone(slot.timezone || 'Africa/Cairo');

                              const slotAllowed = Array.isArray(slot.allowedSpecializations)
                                ? slot.allowedSpecializations
                                : [];
                              const matchedIds: string[] = [];
                              slotAllowed.forEach((allowedItem) => {
                                const found = specializations.find(
                                  (sp) =>
                                    sp.id === allowedItem.id ||
                                    (allowedItem.courseOptionId &&
                                      sp.courseOptionId === allowedItem.courseOptionId) ||
                                    (allowedItem.ageGroupId &&
                                      allowedItem.levelId &&
                                      sp.ageGroupId === allowedItem.ageGroupId &&
                                      sp.levelId === allowedItem.levelId) ||
                                    sp.label === allowedItem.label
                                );
                                if (found && !matchedIds.includes(found.id)) {
                                  matchedIds.push(found.id);
                                }
                              });

                              if (matchedIds.length > 0) {
                                setEditSlotSpecIds(matchedIds);
                              } else {
                                const matchSpec = specializations.find(
                                  (s) =>
                                    (slot.offeringCourseOptionId &&
                                      s.courseOptionId === slot.offeringCourseOptionId) ||
                                    (slot.quranAgeGroupId &&
                                      slot.quranLevelId &&
                                      s.ageGroupId === slot.quranAgeGroupId &&
                                      s.levelId === slot.quranLevelId) ||
                                    s.label === slot.specializationLabel
                                );
                                if (matchSpec) setEditSlotSpecIds([matchSpec.id]);
                                else if (specializations.length > 0)
                                  setEditSlotSpecIds([specializations[0].id]);
                              }
                            }}
                            className="px-3 py-1.5 min-h-[38px] rounded-xl border border-blue-200 text-[#0D4E8B] hover:bg-blue-50 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>تعديل</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeletePrivateSlot(slot.id)}
                            disabled={deletingPrivateSlotId === slot.id}
                            className="px-3 py-1.5 min-h-[38px] rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            {deletingPrivateSlotId === slot.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <>
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>حذف</span>
                              </>
                            )}
                          </button>
                        </div>
                      ) : slot.isBooked ? (
                        <span className="text-[11px] text-emerald-800 font-bold bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>حصة خاصة مؤكدة</span>
                        </span>
                      ) : slot.adminSuspended ? (
                        <span className="text-[11px] text-rose-700 font-bold bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg">
                          محمي (موقوف إدارياً)
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

      {/* ========================================================================= */}
      {/* SECTION 5: EDUCATIONAL GROUPS (3-STEP WIZARD + FINANCIAL SUMMARY) */}
      {/* ========================================================================= */}
      {activeTab === 'groups' && (
        <div className="space-y-6 animate-fade-in">
          {/* Header Action */}
          <div className="bg-white rounded-3xl border border-[#E2E8F0] p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-['Cairo'] text-base font-bold text-[#1F2A44] flex items-center gap-2">
                <Users className="w-5 h-5 text-[#0D4E8B]" />
                <span>إدارة المجموعات التعليمية (Small Groups)</span>
              </h3>
              <p className="text-xs text-[#64748B] mt-0.5">
                أنشئ أو عدّل مجموعتك في ٣ خطوات واضحة مع حساب تلقائي للجدول والملخص المالي، وتُنشر مباشرة في ملفك.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                if (showAddGroupForm) {
                  setShowAddGroupForm(false);
                  setEditingGroup(null);
                } else {
                  handleOpenNewGroupWizard();
                }
              }}
              className="px-4 py-2.5 min-h-[44px] rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs sm:text-sm font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{showAddGroupForm ? 'إخفاء نموذج المجموعة' : 'إنشاء مجموعة جديدة'}</span>
            </button>
          </div>

          {/* 3-Step Group Form */}
          {showAddGroupForm && (
            <div className="bg-white rounded-3xl border border-[#CBD5E1] p-5 sm:p-6 shadow-sm space-y-5 animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#F1F5F9] pb-4">
                <h4 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#1F2A44] flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#0D4E8B]" />
                  <span>
                    {editingGroup
                      ? `تعديل المجموعة: ${editingGroup.title}`
                      : 'إنشاء مجموعة تعليمية جديدة (٣ خطوات)'}
                  </span>
                </h4>

                {/* Step Selector Pills */}
                <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => setGroupWizardStep(1)}
                    className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                      groupWizardStep === 1
                        ? 'bg-[#0D4E8B] text-white shadow-xs'
                        : 'text-[#64748B] hover:text-[#1F2A44]'
                    }`}
                  >
                    أ. الاسم والتخصص
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupWizardStep(2)}
                    className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                      groupWizardStep === 2
                        ? 'bg-[#0D4E8B] text-white shadow-xs'
                        : 'text-[#64748B] hover:text-[#1F2A44]'
                    }`}
                  >
                    ب. العدد والتسعير
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupWizardStep(3)}
                    className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                      groupWizardStep === 3
                        ? 'bg-[#0D4E8B] text-white shadow-xs'
                        : 'text-[#64748B] hover:text-[#1F2A44]'
                    }`}
                  >
                    ج. الجدول واللقاءات
                  </button>
                </div>
              </div>

              <form onSubmit={handleCreateGroup} noValidate className="space-y-5">
                {/* STEP A (1): الاسم والتخصص والوصف */}
                {groupWizardStep === 1 && (
                  <div className="space-y-4">
                    <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs font-bold text-[#0D4E8B]">
                      الخطوة أ: الاسم والتخصص والوصف
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label
                          htmlFor="group-title-input"
                          className="text-xs font-bold text-[#1F2A44] block"
                        >
                          اسم المجموعة <span className="text-rose-500">*</span>
                        </label>
                        <input
                          id="group-title-input"
                          type="text"
                          value={groupTitle}
                          onChange={(e) => {
                            setGroupTitle(e.target.value);
                            if (groupFieldErrors.title) {
                              setGroupFieldErrors((prev) => ({ ...prev, title: undefined }));
                            }
                          }}
                          placeholder="مثال: مراجعة وشرح تأسيس الرياضيات - الصف الرابع"
                          required
                          className={`w-full h-11 px-3 rounded-xl border text-xs focus:border-[#0D4E8B] outline-none ${
                            groupFieldErrors.title
                              ? 'border-rose-400 bg-rose-50/40'
                              : 'border-[#CBD5E1]'
                          }`}
                        />
                        {groupFieldErrors.title && (
                          <p
                            role="alert"
                            className="text-[11px] text-rose-600 font-bold flex items-start gap-1 pt-0.5"
                          >
                            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>{groupFieldErrors.title}</span>
                          </p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <label
                          htmlFor="group-spec-select"
                          className="text-xs font-bold text-[#1F2A44] block"
                        >
                          التخصص المعتمد <span className="text-rose-500">*</span>
                        </label>
                        <select
                          id="group-spec-select"
                          value={groupSpecId}
                          onChange={(e) => {
                            setGroupSpecId(e.target.value);
                            if (groupFieldErrors.spec) {
                              setGroupFieldErrors((prev) => ({ ...prev, spec: undefined }));
                            }
                          }}
                          required
                          className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-xs font-bold focus:border-[#0D4E8B] outline-none bg-white"
                        >
                          {specializations.map((spec) => (
                            <option key={spec.id} value={spec.id}>
                              {spec.label}
                            </option>
                          ))}
                        </select>
                        {groupFieldErrors.spec && (
                          <p
                            role="alert"
                            className="text-[11px] text-rose-600 font-bold flex items-start gap-1 pt-0.5"
                          >
                            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>{groupFieldErrors.spec}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label
                        htmlFor="group-description-textarea"
                        className="text-xs font-bold text-[#1F2A44] block"
                      >
                        وصف مختصر للمجموعة وأهدافها
                      </label>
                      <textarea
                        id="group-description-textarea"
                        rows={3}
                        value={groupDescription}
                        onChange={(e) => setGroupDescription(e.target.value)}
                        placeholder="اكتب نبذة عن خطة الحصص وما سيتعلمه الطالب خلال البرنامج..."
                        className="w-full p-3 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setGroupWizardStep(2)}
                        className="px-5 py-2.5 min-h-[44px] rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>التالي: العدد والتسعير</span>
                        <ArrowLeft className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP B (2): عدد الطلاب والسعر والعملة ونوع التسعير + الملخص المالي */}
                {groupWizardStep === 2 && (
                  <div className="space-y-4">
                    <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs font-bold text-[#0D4E8B]">
                      الخطوة ب: عدد الطلاب والسعر والعملة ونوع التسعير
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <label
                          htmlFor="group-max-students-input"
                          className="text-xs font-bold text-[#1F2A44] block"
                        >
                          الحد الأقصى للطلاب (2–20)
                        </label>
                        <input
                          id="group-max-students-input"
                          type="number"
                          min={2}
                          max={20}
                          step={1}
                          value={groupMaxStudents}
                          onChange={(e) => {
                            setGroupMaxStudents(Number(e.target.value));
                            if (groupFieldErrors.maxStudents) {
                              setGroupFieldErrors((prev) => ({ ...prev, maxStudents: undefined }));
                            }
                          }}
                          required
                          className={`w-full h-11 px-3 rounded-xl border text-xs font-bold focus:border-[#0D4E8B] outline-none ${
                            groupFieldErrors.maxStudents
                              ? 'border-rose-400 bg-rose-50/40'
                              : 'border-[#CBD5E1]'
                          }`}
                        />
                        {groupFieldErrors.maxStudents && (
                          <p
                            role="alert"
                            className="text-[11px] text-rose-600 font-bold flex items-start gap-1 pt-0.5"
                          >
                            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>{groupFieldErrors.maxStudents}</span>
                          </p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <label
                          htmlFor="group-price-input"
                          className="text-xs font-bold text-[#1F2A44] block"
                        >
                          سعر الاشتراك للطالب
                        </label>
                        <input
                          id="group-price-input"
                          type="number"
                          min={0}
                          max={100000}
                          step={1}
                          value={groupPriceInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            setGroupPriceInput(val);
                            const num = Number(val);
                            if (val.trim() !== '' && Number.isFinite(num)) {
                              setGroupPricePerStudent(num);
                            }
                            if (groupFieldErrors.price) {
                              setGroupFieldErrors((prev) => ({ ...prev, price: undefined }));
                            }
                          }}
                          required
                          className={`w-full h-11 px-3 rounded-xl border text-xs font-bold focus:border-[#0D4E8B] outline-none ${
                            groupFieldErrors.price
                              ? 'border-rose-400 bg-rose-50/40'
                              : 'border-[#CBD5E1]'
                          }`}
                        />
                        {groupFieldErrors.price && (
                          <p
                            role="alert"
                            className="text-[11px] text-rose-600 font-bold flex items-start gap-1 pt-0.5"
                          >
                            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>{groupFieldErrors.price}</span>
                          </p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <label
                          htmlFor="group-currency-select"
                          className="text-xs font-bold text-[#1F2A44] block"
                        >
                          العملة
                        </label>
                        <select
                          id="group-currency-select"
                          value={groupCurrency}
                          onChange={(e) => setGroupCurrency(e.target.value)}
                          className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-xs font-bold focus:border-[#0D4E8B] outline-none bg-white"
                        >
                          {SUPPORTED_TUTOR_CURRENCIES.map((curr) => (
                            <option key={curr.value} value={curr.value}>
                              {curr.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label
                          htmlFor="group-price-type-select"
                          className="text-xs font-bold text-[#1F2A44] block"
                        >
                          نوع التسعير
                        </label>
                        <select
                          id="group-price-type-select"
                          value={groupPriceType}
                          onChange={(e) =>
                            setGroupPriceType(e.target.value as 'per_session' | 'full_package')
                          }
                          className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-xs font-bold focus:border-[#0D4E8B] outline-none bg-white"
                        >
                          <option value="full_package">
                            للباقة كاملة ({groupSessionsCount} حصص)
                          </option>
                          <option value="per_session">لكل حصة منفردة</option>
                        </select>
                      </div>
                    </div>

                    {/* Financial Summary Cards for Tutor */}
                    <div className="p-4 rounded-2xl bg-[#F0F6FD] border border-blue-200 space-y-3">
                      <span className="text-xs font-bold text-[#0D4E8B] block">
                        ملخص الحساب المالي للمجموعة (بناءً على {groupSessionsCount} حصص و{' '}
                        {groupMaxStudents} طلاب كحد أقصى):
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="p-3 rounded-xl bg-white border border-blue-100">
                          <span className="text-[11px] text-[#64748B] block">
                            إجمالي اشتراك الطالب
                          </span>
                          <span className="font-['Cairo'] text-base font-extrabold text-[#1F2A44]">
                            {groupFinancials.totalStudentSubscription} {groupCurrency}
                          </span>
                        </div>
                        <div className="p-3 rounded-xl bg-white border border-blue-100">
                          <span className="text-[11px] text-[#64748B] block">
                            تكلفة الحصة للطالب
                          </span>
                          <span className="font-['Cairo'] text-base font-extrabold text-[#0D4E8B]">
                            {groupFinancials.costPerSessionForStudent} {groupCurrency} / حصة
                          </span>
                        </div>
                        <div className="p-3 rounded-xl bg-white border border-emerald-200">
                          <span className="text-[11px] text-emerald-800 font-bold block">
                            إجمالي الاشتراكات عند اكتمال العدد
                          </span>
                          <span className="font-['Cairo'] text-base font-extrabold text-emerald-700">
                            {groupFinancials.totalRevenueWhenFull} {groupCurrency}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setGroupWizardStep(1)}
                        className="px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <ArrowRight className="w-4 h-4" />
                        <span>السابق</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setGroupWizardStep(3)}
                        className="px-5 py-2.5 min-h-[44px] rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>التالي: أيام اللقاءات والجدول</span>
                        <ArrowLeft className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP C (3): أيام اللقاءات ووقتها ومدتها وتاريخ البدء وعدد الحصص */}
                {groupWizardStep === 3 && (
                  <div className="space-y-4">
                    <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[#0D4E8B]">
                      <span>
                        الخطوة ج: أيام اللقاءات ووقتها ومدتها وتاريخ البدء وعدد الحصص
                      </span>
                      {editingGroup && !groupScheduleModifiedByTutor && (
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          الجدول الفعلي الأصلي محفوظ كما هو
                        </span>
                      )}
                    </div>

                    {isLoadingGroupSessionsForEdit ? (
                      <div className="p-6 text-center text-xs text-[#64748B] flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>جاري تحميل جدول اللقاءات الفعلي للمجموعة...</span>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                          <div className="space-y-1">
                            <label
                              htmlFor="group-sessions-count-input"
                              className="text-xs font-bold text-[#1F2A44] block"
                            >
                              عدد الحصص المقررة
                            </label>
                            <input
                              id="group-sessions-count-input"
                              type="number"
                              min={1}
                              max={48}
                              value={groupSessionsCount}
                              onChange={(e) => {
                                setGroupScheduleModifiedByTutor(true);
                                setGroupSessionsCount(Number(e.target.value));
                              }}
                              required
                              className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-xs font-bold focus:border-[#0D4E8B] outline-none"
                            />
                          </div>

                          <div className="space-y-1">
                            <label
                              htmlFor="group-duration-select"
                              className="text-xs font-bold text-[#1F2A44] block"
                            >
                              مدة الحصة (بالدقائق)
                            </label>
                            <select
                              id="group-duration-select"
                              value={groupSessionDuration}
                              onChange={(e) => {
                                setGroupScheduleModifiedByTutor(true);
                                setGroupSessionDuration(Number(e.target.value));
                              }}
                              className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none bg-white"
                            >
                              <option value={30}>30 دقيقة</option>
                              <option value={45}>45 دقيقة</option>
                              <option value={60}>60 دقيقة (ساعة كاملة)</option>
                              <option value={75}>75 دقيقة</option>
                              <option value={90}>90 دقيقة</option>
                              <option value={120}>120 دقيقة</option>
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label
                              htmlFor="group-start-date-input"
                              className="text-xs font-bold text-[#1F2A44] block"
                            >
                              تاريخ البدء
                            </label>
                            <input
                              id="group-start-date-input"
                              type="date"
                              min={getTodayCalendarDateInTimezone(groupTimezone)}
                              value={groupStartDate}
                              onChange={(e) => {
                                setGroupScheduleModifiedByTutor(true);
                                setGroupStartDate(e.target.value);
                              }}
                              required
                              className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none"
                            />
                          </div>

                          <div className="space-y-1">
                            <label
                              htmlFor="group-start-time-input"
                              className="text-xs font-bold text-[#1F2A44] block"
                            >
                              وقت بدء اللقاءات
                            </label>
                            <input
                              id="group-start-time-input"
                              type="time"
                              value={groupSessionStartTime}
                              onChange={(e) => {
                                setGroupScheduleModifiedByTutor(true);
                                setGroupSessionStartTime(e.target.value);
                              }}
                              required
                              className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-xs font-mono focus:border-[#0D4E8B] outline-none"
                            />
                          </div>

                          <div className="space-y-1">
                            <label
                              htmlFor="group-timezone-select"
                              className="text-xs font-bold text-[#1F2A44] block"
                            >
                              المنطقة الزمنية
                            </label>
                            <select
                              id="group-timezone-select"
                              value={groupTimezone}
                              onChange={(e) => {
                                setGroupScheduleModifiedByTutor(true);
                                setGroupTimezone(e.target.value);
                              }}
                              className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none bg-white"
                            >
                              {SUPPORTED_TUTOR_TIMEZONES.map((tz) => (
                                <option key={tz.value} value={tz.value}>
                                  {tz.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <span className="text-xs font-bold text-[#1F2A44] block">
                            أيام اللقاءات الأسبوعية:
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {[
                              { day: 6, label: 'السبت' },
                              { day: 0, label: 'الأحد' },
                              { day: 1, label: 'الاثنين' },
                              { day: 2, label: 'الثلاثاء' },
                              { day: 3, label: 'الأربعاء' },
                              { day: 4, label: 'الخميس' },
                              { day: 5, label: 'الجمعة' },
                            ].map((d) => {
                              const isSelected = groupWeeklyDays.includes(d.day);
                              return (
                                <button
                                  key={d.day}
                                  type="button"
                                  onClick={() => {
                                    setGroupScheduleModifiedByTutor(true);
                                    if (isSelected) {
                                      if (groupWeeklyDays.length > 1) {
                                        setGroupWeeklyDays(
                                          groupWeeklyDays.filter((x) => x !== d.day)
                                        );
                                      }
                                    } else {
                                      setGroupWeeklyDays([...groupWeeklyDays, d.day]);
                                    }
                                  }}
                                  className={`px-3 py-2 min-h-[40px] rounded-xl text-xs font-bold cursor-pointer transition-all ${
                                    isSelected
                                      ? 'bg-[#0D4E8B] text-white shadow-xs'
                                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                  }`}
                                >
                                  {d.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label
                            htmlFor="group-schedule-summary-input"
                            className="text-xs font-bold text-[#1F2A44] block"
                          >
                            ملخص الجدول الأسبوعي (يتولد تلقائياً ويمكنك تعديله){' '}
                            <span className="text-rose-500">*</span>
                          </label>
                          <input
                            id="group-schedule-summary-input"
                            type="text"
                            value={groupScheduleSummary}
                            onChange={(e) => setGroupScheduleSummary(e.target.value)}
                            placeholder="مثال: كل اثنين وأربعاء من ٦:٠٠ م إلى ٧:٠٠ م (بتوقيت القاهرة)"
                            required
                            className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none"
                          />
                        </div>

                        {/* Sessions Table Preview */}
                        {generatedGroupSessions.length > 0 && (
                          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                            <div className="flex items-center justify-between flex-wrap gap-1">
                              <span className="text-xs font-bold text-[#1F2A44] block">
                                جدول اللقاءات المحسوب ({generatedGroupSessions.length} لقاء):
                              </span>
                              <span className="text-[11px] text-[#64748B]">
                                {getTimezoneArabicLabel(groupTimezone)}
                              </span>
                            </div>
                            <div className="max-h-44 overflow-y-auto space-y-1 text-xs">
                              {generatedGroupSessions.map((s) => {
                                const dateInfo = formatSlotDateArabic(
                                  s.sessionDate,
                                  s.timezone || groupTimezone
                                );
                                return (
                                  <div
                                    key={s.sessionNumber}
                                    className="flex items-center justify-between bg-white px-3 py-1.5 rounded-lg border border-slate-100 gap-2"
                                  >
                                    <span className="font-bold text-[#0D4E8B]">{s.title}</span>
                                    <span className="text-slate-700 font-medium">
                                      {dateInfo.fullLabel} ({s.sessionDate})
                                    </span>
                                    <span className="font-mono text-slate-600" dir="ltr">
                                      {s.startTime} - {s.endTime}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setGroupWizardStep(2)}
                        className="px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <ArrowRight className="w-4 h-4" />
                        <span>السابق: العدد والتسعير</span>
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddGroupForm(false);
                            setEditingGroup(null);
                          }}
                          className="px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                        >
                          إلغاء
                        </button>
                        <button
                          type="submit"
                          disabled={isCreatingGroup || isLoadingGroupSessionsForEdit}
                          className="px-6 py-2.5 min-h-[44px] rounded-xl bg-[#0D4E8B] hover:bg-[#003767] disabled:opacity-50 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          {isCreatingGroup ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <Check className="w-4 h-4" />
                              <span>
                                {editingGroup ? 'حفظ ونشر التعديلات' : 'نشر المجموعة التعليمية'}
                              </span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </form>
            </div>
          )}

          {/* Groups Cards List */}
          <div className="space-y-4">
            {groupsReloadWarning && (
              <div
                role="alert"
                className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-bold block">تم الحفظ، لكن تعذر تحديث القائمة</span>
                    <p className="text-xs text-amber-900">{groupsReloadWarning}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => loadGroups()}
                  disabled={isLoadingGroups}
                  className="px-4 py-2 min-h-[40px] rounded-xl bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                >
                  {isLoadingGroups ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  <span>إعادة تحميل القائمة</span>
                </button>
              </div>
            )}

            {groupsLoadError && (
              <div
                role="alert"
                className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-bold block">فشل تحميل قائمة المجموعات التعليمية</span>
                    <p className="text-xs text-rose-800">{groupsLoadError}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => loadGroups()}
                  disabled={isLoadingGroups}
                  className="px-4 py-2 min-h-[40px] rounded-xl bg-white hover:bg-rose-100 border border-rose-300 text-rose-800 text-xs font-bold transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                >
                  {isLoadingGroups ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  <span>إعادة تحميل القائمة</span>
                </button>
              </div>
            )}

            {isLoadingGroups ? (
              <div className="p-8 text-center text-xs text-[#64748B] flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>جاري تحميل المجموعات...</span>
              </div>
            ) : groups.length === 0 ? (
              !groupsLoadError && !groupsReloadWarning ? (
                <div className="bg-white p-8 text-center border-2 border-dashed border-[#CBD5E1] rounded-3xl space-y-2">
                  <Users className="w-8 h-8 text-[#CBD5E1] mx-auto" />
                  <p className="text-xs font-bold text-[#64748B]">
                    لم تقم بإنشاء أي مجموعات تعليمية بعد.
                  </p>
                </div>
              ) : null
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {groups.map((group) => {
                  const fin = calculateGroupFinancialSummary({
                    maxStudents: group.maxStudents,
                    pricePerStudent: group.pricePerStudent,
                    priceType: (group.priceType as 'per_session' | 'full_package') || 'full_package',
                    sessionsCount: group.sessionsCount,
                  });
                  return (
                    <div
                      key={group.id}
                      className="bg-white rounded-3xl border border-[#E2E8F0] p-5 shadow-xs flex flex-col justify-between gap-4"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                                group.adminSuspended
                                  ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              }`}
                            >
                              {group.adminSuspended ? 'موقوفة إدارياً' : 'منشورة ومتاحة'}
                            </span>

                            <span
                              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                                group.status === 'open'
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : group.status === 'in_progress'
                                  ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {group.status === 'open'
                                ? 'التسجيل مفتوح'
                                : group.status === 'in_progress'
                                ? 'بدأت بالفعل'
                                : group.status === 'completed'
                                ? 'مكتملة'
                                : 'ملغاة'}
                            </span>
                          </div>

                          <span className="text-xs font-bold text-[#0D4E8B] bg-slate-50 px-2.5 py-0.5 rounded-lg border border-slate-200">
                            {group.pricePerStudent} {group.currency} /{' '}
                            {group.priceType === 'per_session' ? 'للحصة' : 'للباقة'}
                          </span>
                        </div>

                        <h4 className="font-['Cairo'] text-base font-bold text-[#1F2A44]">
                          {group.title}
                        </h4>

                        <p className="text-xs text-[#0D4E8B] font-bold">
                          {group.specializationLabel}
                        </p>

                        {group.description && (
                          <p className="text-xs text-[#64748B] line-clamp-2 leading-relaxed">
                            {group.description}
                          </p>
                        )}

                        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
                          <div className="flex items-center justify-between">
                            <span>المقاعد المتبقية:</span>
                            <span className="font-bold text-[#1F2A44]">
                              {group.remainingSeats !== undefined
                                ? group.remainingSeats
                                : Math.max(0, group.maxStudents - group.enrolledStudents)}{' '}
                              مقاعد (المشغول: {group.enrolledStudents})
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>الجدول الأسبوعي:</span>
                            <span className="font-bold text-[#0D4E8B]">
                              {group.weeklyScheduleSummary}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>تاريخ البدء:</span>
                            <span className="font-mono">
                              {group.startDate} ({group.sessionsCount} حصص)
                            </span>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-slate-200/70">
                            <span>إجمالي اشتراك الطالب / عند الاكتمال:</span>
                            <span className="font-bold text-emerald-700">
                              {fin.totalStudentSubscription} {group.currency} • الإجمالي:{' '}
                              {fin.totalRevenueWhenFull} {group.currency}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-[#64748B]">
                          {group.adminSuspended
                            ? 'موقوفة إدارياً من الإدارة'
                            : group.isPublished
                            ? 'معروضة بالملف العام'
                            : 'غير معروضة حالياً'}
                        </span>

                        <div className="flex items-center gap-1.5">
                          {group.enrolledStudents === 0 &&
                            !group.adminSuspended &&
                            group.status !== 'completed' &&
                            group.status !== 'cancelled' && (
                              <button
                                type="button"
                                onClick={() => handleStartEditGroup(group)}
                                className="px-3 py-1.5 min-h-[38px] rounded-lg text-xs font-bold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all cursor-pointer flex items-center gap-1"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>تعديل</span>
                              </button>
                            )}

                          {!group.adminSuspended && group.status === 'open' ? (
                            <button
                              type="button"
                              disabled={updatingGroupId === group.id}
                              onClick={() => handleUpdateGroupStatus(group.id, 'in_progress')}
                              className="px-3 py-1.5 min-h-[38px] rounded-lg text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-all cursor-pointer"
                            >
                              بدء المجموعة
                            </button>
                          ) : !group.adminSuspended && group.status === 'in_progress' ? (
                            <button
                              type="button"
                              disabled={updatingGroupId === group.id}
                              onClick={() => handleUpdateGroupStatus(group.id, 'completed')}
                              className="px-3 py-1.5 min-h-[38px] rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all cursor-pointer"
                            >
                              إنهاء المجموعة
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Trial Slot Modal (Strictly 20 Minutes) */}
      {editingTrialSlot && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          dir="rtl"
        >
          <form
            onSubmit={handleUpdateTrialSlot}
            className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <h3 className="font-['Cairo'] text-base font-bold text-[#1F2A44] flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-[#0D4E8B]" />
              <span>تعديل الموعد التجريبي (٢٠ دقيقة)</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label
                  htmlFor="edit-trial-date-input"
                  className="font-bold text-slate-700 block mb-1"
                >
                  التاريخ *
                </label>
                <input
                  id="edit-trial-date-input"
                  type="date"
                  min={getTodayCalendarDateInTimezone(editTrialTimezone)}
                  value={editTrialDate}
                  onChange={(e) => setEditTrialDate(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 font-mono focus:border-[#0D4E8B] focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="edit-trial-start-input"
                    className="font-bold text-slate-700 block mb-1"
                  >
                    وقت البداية *
                  </label>
                  <input
                    id="edit-trial-start-input"
                    type="time"
                    value={editTrialStart}
                    onChange={(e) => handleEditTrialStartChange(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 font-mono focus:border-[#0D4E8B] focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="edit-trial-end-input"
                    className="font-bold text-slate-700 block mb-1"
                  >
                    وقت النهاية (٢٠ د تلقائياً)
                  </label>
                  <input
                    id="edit-trial-end-input"
                    type="time"
                    value={editTrialEnd}
                    readOnly
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 font-mono bg-slate-100 text-slate-600 cursor-not-allowed outline-none"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="edit-trial-timezone-select"
                  className="font-bold text-slate-700 block mb-1"
                >
                  المنطقة الزمنية
                </label>
                <select
                  id="edit-trial-timezone-select"
                  value={editTrialTimezone}
                  onChange={(e) => setEditTrialTimezone(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 font-bold focus:border-[#0D4E8B] focus:outline-none bg-white"
                >
                  {SUPPORTED_TUTOR_TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingTrialSlot(null)}
                className="px-4 py-2 min-h-[40px] rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isUpdatingTrialSlot}
                className="px-5 py-2 min-h-[40px] rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {isUpdatingTrialSlot ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span>حفظ التعديل</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Private Slot Modal */}
      {editingPrivateSlot && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          dir="rtl"
        >
          <form
            onSubmit={handleUpdatePrivateSlot}
            className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <h3 className="font-['Cairo'] text-base font-bold text-[#1F2A44] flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-[#0D4E8B]" />
              <span>تعديل الموعد الخاص</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-700 block">
                    التخصصات المعتمدة المتاحة لهذا الموعد *
                  </span>
                  <span className="text-[10px] font-bold text-[#0D4E8B]">
                    محدد ({editSlotSpecIds.length})
                  </span>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                  {specializations.map((s) => {
                    const isChecked = editSlotSpecIds.includes(s.id);
                    const editSpecInputId = `edit-slot-spec-${s.id}`;
                    return (
                      <label
                        key={s.id}
                        htmlFor={editSpecInputId}
                        className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all flex items-center gap-2 ${
                          isChecked
                            ? 'bg-blue-50 border-[#0D4E8B] text-[#0D4E8B] font-bold'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          id={editSpecInputId}
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              if (editSlotSpecIds.length > 1) {
                                setEditSlotSpecIds(editSlotSpecIds.filter((id) => id !== s.id));
                              }
                            } else {
                              setEditSlotSpecIds([...editSlotSpecIds, s.id]);
                            }
                          }}
                          className="w-4 h-4 rounded text-[#0D4E8B] shrink-0"
                        />
                        <span className="leading-snug">{s.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="edit-private-date-input"
                    className="font-bold text-slate-700 block mb-1"
                  >
                    التاريخ *
                  </label>
                  <input
                    id="edit-private-date-input"
                    type="date"
                    min={getTodayCalendarDateInTimezone(editSlotTimezone)}
                    value={editSlotDate}
                    onChange={(e) => setEditSlotDate(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 font-mono focus:border-[#0D4E8B] focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="edit-private-timezone-select"
                    className="font-bold text-slate-700 block mb-1"
                  >
                    المنطقة الزمنية
                  </label>
                  <select
                    id="edit-private-timezone-select"
                    value={editSlotTimezone}
                    onChange={(e) => setEditSlotTimezone(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 font-bold focus:border-[#0D4E8B] focus:outline-none bg-white"
                  >
                    {SUPPORTED_TUTOR_TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="edit-private-start-input"
                    className="font-bold text-slate-700 block mb-1"
                  >
                    وقت البدء *
                  </label>
                  <input
                    id="edit-private-start-input"
                    type="time"
                    value={editSlotStart}
                    onChange={(e) => {
                      setEditSlotStart(e.target.value);
                      setEditSlotEnd(addMinutesToTimeStr(e.target.value, editSlotDuration));
                    }}
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 font-mono focus:border-[#0D4E8B] focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="edit-private-end-input"
                    className="font-bold text-slate-700 block mb-1"
                  >
                    وقت النهاية (تلقائياً)
                  </label>
                  <input
                    id="edit-private-end-input"
                    type="time"
                    value={editSlotEnd}
                    readOnly
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 font-mono bg-slate-100 text-slate-600 cursor-not-allowed outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="edit-private-duration-select"
                    className="font-bold text-slate-700 block mb-1"
                  >
                    المدة (دقيقة)
                  </label>
                  <select
                    id="edit-private-duration-select"
                    value={editSlotDuration}
                    onChange={(e) => {
                      const dur = Number(e.target.value);
                      setEditSlotDuration(dur);
                      if (editSlotStart) setEditSlotEnd(addMinutesToTimeStr(editSlotStart, dur));
                    }}
                    className="w-full h-11 px-3 rounded-xl border border-slate-200 font-bold focus:border-[#0D4E8B] focus:outline-none bg-white"
                  >
                    <option value={30}>30 دقيقة</option>
                    <option value={45}>45 دقيقة</option>
                    <option value={50}>50 دقيقة</option>
                    <option value={60}>60 دقيقة</option>
                    <option value={75}>75 دقيقة</option>
                    <option value={90}>90 دقيقة</option>
                    <option value={120}>120 دقيقة</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="edit-private-price-input"
                    className="font-bold text-slate-700 block mb-1"
                  >
                    السعر ({editingPrivateSlot.currency || tutor.currency})
                  </label>
                  <input
                    id="edit-private-price-input"
                    type="number"
                    min={0}
                    max={100000}
                    step={1}
                    value={editSlotPriceInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditSlotPriceInput(val);
                      const num = Number(val);
                      if (val.trim() !== '' && Number.isFinite(num)) {
                        setEditSlotPrice(num);
                      }
                      if (editPrivateFieldErrors.price) {
                        setEditPrivateFieldErrors((prev) => ({ ...prev, price: undefined }));
                      }
                    }}
                    className={`w-full h-11 px-3 rounded-xl border font-mono focus:border-[#0D4E8B] focus:outline-none ${
                      editPrivateFieldErrors.price
                        ? 'border-rose-400 bg-rose-50/40'
                        : 'border-slate-200'
                    }`}
                    required
                  />
                  {editPrivateFieldErrors.price && (
                    <p
                      role="alert"
                      className="text-[11px] text-rose-600 font-bold flex items-start gap-1 pt-0.5"
                    >
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{editPrivateFieldErrors.price}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingPrivateSlot(null)}
                className="px-4 py-2 min-h-[40px] rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isUpdatingSlot}
                className="px-5 py-2 min-h-[40px] rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {isUpdatingSlot ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span>حفظ التعديل</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
