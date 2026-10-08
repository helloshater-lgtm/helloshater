import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { TutorPortalService } from '../../services/tutorPortalService';
import {
  TutorPortalContext,
  TutorAvailableSlot,
  ApprovedSpecializationItem,
  TutorPrivateSlot,
  TutorGroup,
} from '../../types';
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
  Users,
  BookOpen,
  DollarSign,
  CalendarCheck2,
  Layers,
  Check,
  AlertTriangle,
  Edit3,
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
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Active Tab: 5 clear sections
  const [activeTab, setActiveTab] = useState<'overview' | 'trials' | 'private' | 'groups' | 'profile-draft'>('trials');

  // Approved specializations
  const [specializations, setSpecializations] = useState<ApprovedSpecializationItem[]>([]);
  const [isLoadingSpecs, setIsLoadingSpecs] = useState(false);

  // 1. Trial Slots State (Strictly 20 minutes)
  const [trialSlots, setTrialSlots] = useState<TutorAvailableSlot[]>([]);
  const [newTrialDate, setNewTrialDate] = useState('');
  const [newTrialStart, setNewTrialStart] = useState('16:00');
  const [newTrialEnd, setNewTrialEnd] = useState('16:20');
  const [newTrialTimezone, setNewTrialTimezone] = useState('Africa/Cairo');
  const [isAddingTrial, setIsAddingTrial] = useState(false);
  const [deletingTrialId, setDeletingTrialId] = useState<string | null>(null);

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

  const handleTrialStartChange = (val: string) => {
    setNewTrialStart(val);
    setNewTrialEnd(add20Minutes(val));
  };

  // 2. Private Slots State (1:1 paid sessions)
  const [privateSlots, setPrivateSlots] = useState<TutorPrivateSlot[]>([]);
  const [isLoadingPrivate, setIsLoadingPrivate] = useState(false);
  const [selectedSpecId, setSelectedSpecId] = useState<string>('');
  const [privateDurationMinutes, setPrivateDurationMinutes] = useState<number>(50);
  const [privatePriceAmount, setPrivatePriceAmount] = useState<number>(150);
  const [privateCurrency, setPrivateCurrency] = useState<string>('ج.م');
  const [privateTimezone, setPrivateTimezone] = useState<string>('Africa/Cairo');
  const [privateSchedulingMode, setPrivateSchedulingMode] = useState<'single' | 'weekly_repeat'>('single');
  const [privateSingleDate, setPrivateSingleDate] = useState<string>('');
  const [privateStartTime, setPrivateStartTime] = useState<string>('17:00');
  const [privateRepeatDays, setPrivateRepeatDays] = useState<number[]>([1, 3]); // Mon, Wed (0=Sun, 6=Sat)
  const [privateRepeatUntilDate, setPrivateRepeatUntilDate] = useState<string>('');
  const [previewPrivateSlots, setPreviewPrivateSlots] = useState<Array<{ date: string; startTime: string; endTime: string }>>([]);
  const [isSavingPrivateSlots, setIsSavingPrivateSlots] = useState(false);
  const [deletingPrivateSlotId, setDeletingPrivateSlotId] = useState<string | null>(null);

  // Helper to add duration to HH:mm
  const addMinutesToTime = (timeStr: string, minutes: number): string => {
    if (!timeStr || !timeStr.includes(':')) return '17:50';
    const [h, m] = timeStr.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return '17:50';
    const total = h * 60 + m + minutes;
    const endH = Math.floor((total / 60) % 24);
    const endM = total % 60;
    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  };

  // Generate Preview for Private Slots
  useEffect(() => {
    const endTime = addMinutesToTime(privateStartTime, privateDurationMinutes);

    if (privateSchedulingMode === 'single') {
      if (privateSingleDate) {
        setPreviewPrivateSlots([{ date: privateSingleDate, startTime: privateStartTime, endTime }]);
      } else {
        setPreviewPrivateSlots([]);
      }
    } else {
      if (!privateRepeatUntilDate || privateRepeatDays.length === 0) {
        setPreviewPrivateSlots([]);
        return;
      }
      const list: Array<{ date: string; startTime: string; endTime: string }> = [];
      const startD = new Date();
      startD.setDate(startD.getDate() + 1); // start tomorrow
      const endD = new Date(privateRepeatUntilDate);

      const curr = new Date(startD);
      while (curr <= endD && list.length < 50) {
        if (privateRepeatDays.includes(curr.getDay())) {
          const y = curr.getFullYear();
          const m = String(curr.getMonth() + 1).padStart(2, '0');
          const d = String(curr.getDate()).padStart(2, '0');
          list.push({ date: `${y}-${m}-${d}`, startTime: privateStartTime, endTime });
        }
        curr.setDate(curr.getDate() + 1);
      }
      setPreviewPrivateSlots(list);
    }
  }, [
    privateSchedulingMode,
    privateSingleDate,
    privateStartTime,
    privateDurationMinutes,
    privateRepeatDays,
    privateRepeatUntilDate,
  ]);

  // 3. Educational Groups State
  const [groups, setGroups] = useState<TutorGroup[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [showAddGroupForm, setShowAddGroupForm] = useState(false);

  // Group Form fields
  const [groupTitle, setGroupTitle] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [groupSpecId, setGroupSpecId] = useState('');
  const [groupMaxStudents, setGroupMaxStudents] = useState(5);
  const [groupPricePerStudent, setGroupPricePerStudent] = useState(250);
  const [groupPriceType, setGroupPriceType] = useState<'per_session' | 'full_package'>('full_package');
  const [groupCurrency, setGroupCurrency] = useState('ج.م');
  const [groupSessionsCount, setGroupSessionsCount] = useState(4);
  const [groupSessionDuration, setGroupSessionDuration] = useState(60);
  const [groupStartDate, setGroupStartDate] = useState('');
  const [groupEndDate, setGroupEndDate] = useState('');
  const [groupScheduleSummary, setGroupScheduleSummary] = useState('');
  const [groupSessionStartTime, setGroupSessionStartTime] = useState('18:00');
  const [groupWeeklyDays, setGroupWeeklyDays] = useState<number[]>([1, 3]); // Mon, Wed
  const [generatedGroupSessions, setGeneratedGroupSessions] = useState<
    Array<{ sessionNumber: number; sessionDate: string; startTime: string; endTime: string; timezone: string; title: string }>
  >([]);
  const [updatingGroupId, setUpdatingGroupId] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<TutorGroup | null>(null);

  // Editing private slot modal state
  const [editingPrivateSlot, setEditingPrivateSlot] = useState<TutorPrivateSlot | null>(null);
  const [editSlotDate, setEditSlotDate] = useState('');
  const [editSlotStart, setEditSlotStart] = useState('');
  const [editSlotEnd, setEditSlotEnd] = useState('');
  const [editSlotDuration, setEditSlotDuration] = useState(60);
  const [editSlotPrice, setEditSlotPrice] = useState(150);
  const [editSlotSpecId, setEditSlotSpecId] = useState('');
  const [isUpdatingSlot, setIsUpdatingSlot] = useState(false);

  // 4. Profile Draft State
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

      // Initial rate and currency defaults
      setPrivatePriceAmount(tutor.hourlyRateMin || 150);
      setPrivateCurrency(tutor.currency || 'ج.م');
      setPrivateDurationMinutes(tutor.sessionDurationMinutes || 50);

      // Load sub-data
      await Promise.allSettled([
        loadSpecializations(),
        loadTrialSlots(),
        loadPrivateSlots(),
        loadGroups(),
      ]);
    } catch (err: any) {
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
        setSelectedSpecId(specs[0].id);
        setGroupSpecId(specs[0].id);
      }
    } catch (err) {
      console.warn('Failed to load specializations:', err);
    } finally {
      setIsLoadingSpecs(false);
    }
  };

  const loadTrialSlots = async () => {
    try {
      const mySlots = await TutorPortalService.getMySlots();
      setTrialSlots(mySlots);
    } catch (err) {
      console.warn('Could not load trial slots:', err);
    }
  };

  const loadPrivateSlots = async () => {
    setIsLoadingPrivate(true);
    try {
      const pSlots = await TutorPortalService.getMyPrivateSlots();
      setPrivateSlots(pSlots);
    } catch (err) {
      console.warn('Could not load private slots:', err);
    } finally {
      setIsLoadingPrivate(false);
    }
  };

  const loadGroups = async () => {
    setIsLoadingGroups(true);
    try {
      const myGroups = await TutorPortalService.getMyGroups();
      setGroups(myGroups);
    } catch (err) {
      console.warn('Could not load groups:', err);
    } finally {
      setIsLoadingGroups(false);
    }
  };

  useEffect(() => {
    loadPortalData();
  }, []);

  // 1. Handlers for Trial Slots (20 mins)
  const handleCreateTrialSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTrialDate || !newTrialStart || !newTrialEnd) {
      setErrorMessage('يرجى تحديد تاريخ ووقت البداية والنهاية للموعد التجريبي.');
      return;
    }

    const [startH, startM] = newTrialStart.split(':').map(Number);
    const [endH, endM] = newTrialEnd.split(':').map(Number);
    const durationMinutes = endH * 60 + endM - (startH * 60 + startM);
    if (durationMinutes !== 20) {
      setErrorMessage('مدة الموعد التجريبي المعتمدة هي 20 دقيقة بالضبط.');
      return;
    }

    setIsAddingTrial(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await TutorPortalService.createSlot(newTrialDate, newTrialStart, newTrialEnd, newTrialTimezone);
      setSuccessMessage('تمت إضافة الموعد التجريبي بنجاح!');
      setTimeout(() => setSuccessMessage(null), 4000);
      await loadTrialSlots();
      setNewTrialDate('');
    } catch (err: any) {
      setErrorMessage(err?.message || 'فشل إضافة الموعد التجريبي.');
    } finally {
      setIsAddingTrial(false);
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

  // 2. Handlers for Private Slots (1:1)
  const handleSavePrivateSlots = async (e: React.FormEvent) => {
    e.preventDefault();
    const chosenSpec = specializations.find((s) => s.id === selectedSpecId);
    if (!chosenSpec) {
      setErrorMessage('يرجى اختيار تخصص معتمد أولاً.');
      return;
    }

    if (previewPrivateSlots.length === 0) {
      setErrorMessage('يرجى تحديد موعد صالح واحد على الأقل للمعاينة والحفظ.');
      return;
    }

    if (privatePriceAmount < 0) {
      setErrorMessage('يرجى تحديد سعر حصة صالح.');
      return;
    }

    setIsSavingPrivateSlots(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await TutorPortalService.createPrivateSlots({
        specialization: chosenSpec,
        durationMinutes: privateDurationMinutes,
        priceAmount: privatePriceAmount,
        currency: privateCurrency,
        timezone: privateTimezone,
        slots: previewPrivateSlots,
      });

      setSuccessMessage(`تم حفظ ${res.insertedCount} موعداً خاصاً بنجاح! تظهر الآن لأولياء الأمور لحجز الحصص الفردية.`);
      setTimeout(() => setSuccessMessage(null), 5000);
      await loadPrivateSlots();
      setPrivateSingleDate('');
      setPrivateRepeatUntilDate('');
    } catch (err: any) {
      setErrorMessage(err?.message || 'فشل حفظ المواعيد الخاصة.');
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
    const chosenSpec = specializations.find((s) => s.id === editSlotSpecId);
    if (!chosenSpec) {
      setErrorMessage('يرجى اختيار تخصص معتمد للموعد.');
      return;
    }

    setIsUpdatingSlot(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await TutorPortalService.updatePrivateSlot({
        slotId: editingPrivateSlot.id,
        slotDate: editSlotDate,
        startTime: editSlotStart,
        endTime: editSlotEnd,
        durationMinutes: editSlotDuration,
        priceAmount: editSlotPrice,
        specialization: chosenSpec,
      });

      setSuccessMessage('تم تعديل الموعد الخاص بنجاح.');
      setTimeout(() => setSuccessMessage(null), 4000);
      setEditingPrivateSlot(null);
      await loadPrivateSlots();
    } catch (err: any) {
      setErrorMessage(err?.message || 'فشل تعديل الموعد الخاص.');
    } finally {
      setIsUpdatingSlot(false);
    }
  };

  // Helper to auto-calculate sessions array
  useEffect(() => {
    if (!groupStartDate || groupSessionsCount < 1 || groupWeeklyDays.length === 0) {
      setGeneratedGroupSessions([]);
      return;
    }

    const sessions: Array<{
      sessionNumber: number;
      sessionDate: string;
      startTime: string;
      endTime: string;
      timezone: string;
      title: string;
    }> = [];

    const startD = new Date(groupStartDate);
    const curr = new Date(startD);
    const endTime = addMinutesToTime(groupSessionStartTime, groupSessionDuration);

    let sessionNum = 1;
    // Walk forward day by day until session count is reached
    for (let dayOffset = 0; dayOffset < 365 && sessions.length < groupSessionsCount; dayOffset++) {
      if (groupWeeklyDays.includes(curr.getDay())) {
        const y = curr.getFullYear();
        const m = String(curr.getMonth() + 1).padStart(2, '0');
        const d = String(curr.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;
        sessions.push({
          sessionNumber: sessionNum,
          sessionDate: dateStr,
          startTime: groupSessionStartTime,
          endTime,
          timezone: 'Africa/Cairo',
          title: `اللقاء ${sessionNum}`,
        });
        sessionNum++;
      }
      curr.setDate(curr.getDate() + 1);
    }

    setGeneratedGroupSessions(sessions);
    if (sessions.length > 0) {
      setGroupEndDate(sessions[sessions.length - 1].sessionDate);
    }
  }, [groupStartDate, groupSessionsCount, groupWeeklyDays, groupSessionStartTime, groupSessionDuration]);

  // 3. Handlers for Educational Groups
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const chosenSpec = specializations.find((s) => s.id === groupSpecId);
    if (!chosenSpec) {
      setErrorMessage('يرجى اختيار تخصص معتمد للمجموعة.');
      return;
    }

    if (!groupTitle.trim()) {
      setErrorMessage('يرجى إدخال اسم مميز للمجموعة التعليمية.');
      return;
    }

    if (!groupStartDate) {
      setErrorMessage('يرجى تحديد تاريخ بدء المجموعة.');
      return;
    }

    if (generatedGroupSessions.length !== groupSessionsCount) {
      setErrorMessage(`جدول اللقاءات (${generatedGroupSessions.length}) يجب أن يطابق تماماً عدد الحصص المحدد (${groupSessionsCount}).`);
      return;
    }

    if (!groupScheduleSummary.trim()) {
      setErrorMessage('يرجى كتابة ملخص مواعيد الحصص الأسبوعية (مثال: كل اثنين وأربعاء الساعة ٦ مساءً).');
      return;
    }

    setIsCreatingGroup(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (editingGroup) {
        await TutorPortalService.updateGroup({
          groupId: editingGroup.id,
          title: groupTitle.trim(),
          description: groupDescription.trim(),
          specialization: chosenSpec,
          maxStudents: groupMaxStudents,
          pricePerStudent: groupPricePerStudent,
          priceType: groupPriceType,
          currency: groupCurrency,
          sessionsCount: groupSessionsCount,
          sessionDurationMinutes: groupSessionDuration,
          startDate: groupStartDate,
          endDate: groupEndDate || undefined,
          weeklyScheduleSummary: groupScheduleSummary.trim(),
          sessions: generatedGroupSessions,
        });

        setSuccessMessage('تم تحديث بيانات المجموعة بنجاح وإعادة تقديمها لمراجعة الإدارة.');
        setEditingGroup(null);
      } else {
        await TutorPortalService.createGroup({
          title: groupTitle.trim(),
          description: groupDescription.trim(),
          specialization: chosenSpec,
          maxStudents: groupMaxStudents,
          pricePerStudent: groupPricePerStudent,
          priceType: groupPriceType,
          currency: groupCurrency,
          sessionsCount: groupSessionsCount,
          sessionDurationMinutes: groupSessionDuration,
          startDate: groupStartDate,
          endDate: groupEndDate || undefined,
          weeklyScheduleSummary: groupScheduleSummary.trim(),
          sessions: generatedGroupSessions,
        });

        setSuccessMessage('تم إنشاء المجموعة التعليمية بنجاح ورفعها لمراجعة الإدارة والاعتماد قبل النشر للجمهور.');
      }

      setTimeout(() => setSuccessMessage(null), 5000);
      setShowAddGroupForm(false);
      setGroupTitle('');
      setGroupDescription('');
      setGroupScheduleSummary('');
      await loadGroups();
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

  // 4. Draft avatar and submit handlers
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
            onClick={onNavigateHome}
            className="px-5 py-2.5 rounded-xl bg-[#0D4E8B] text-white text-xs sm:text-sm font-bold hover:bg-[#003767] transition-all cursor-pointer"
          >
            العودة للرئيسية
          </button>
        </div>
      </div>
    );
  }

  const { tutor, pendingDraft, application } = context;

  // Counters for future private slots
  const nowTime = Date.now();
  const futurePrivateSlots = privateSlots.filter(
    (s) => new Date(`${s.slotDate}T${s.startTime}`).getTime() > nowTime
  );
  const futurePrivateAvailableCount = futurePrivateSlots.filter((s) => s.isAvailable && !s.isBooked).length;
  const futurePrivateBookedCount = futurePrivateSlots.filter((s) => s.isBooked).length;

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6" dir="rtl">
      {/* 1. Header Bar */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-[#E2E8F0] shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden bg-slate-100 border border-[#CBD5E1] shrink-0 flex items-center justify-center">
            {tutor.avatarUrl ? (
              <img src={tutor.avatarUrl} alt={tutor.name} className="w-full h-full object-cover" />
            ) : (
              <User className="w-7 h-7 text-slate-400" />
            )}
            {tutor.verifiedCredentials && (
              <span className="absolute -bottom-1 -left-1 w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] shadow-xs" title="معتمد">
                <ShieldCheck className="w-3.5 h-3.5" />
              </span>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-['Cairo'] text-lg sm:text-xl font-bold text-[#1F2A44]">
                مرحباً {tutor.honorific} {tutor.name}
              </h1>
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                tutor.isPublished
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border border-amber-200'
              }`}>
                {tutor.isPublished ? 'ملفك منشور ومتاح للحجز' : 'ملف غير منشور للجمهور'}
              </span>
            </div>
            <p className="text-xs text-[#64748B] mt-1 line-clamp-1">
              {tutor.headline || 'معلم معتمد في منصة شاطر كلاسيز'}
            </p>
          </div>
        </div>

        {/* Quick Nav Actions */}
        <div className="flex items-center gap-2 self-end md:self-center shrink-0">
          {onNavigateToPublicProfile && tutor.isPublished && (
            <button
              onClick={() => onNavigateToPublicProfile(tutor.id)}
              className="px-3 py-2 rounded-xl border border-[#CBD5E1] hover:bg-slate-50 text-xs font-bold text-[#0D4E8B] transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Eye className="w-4 h-4" />
              <span>معاينة ملفي العام</span>
            </button>
          )}

          <button
            onClick={onNavigateHome}
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-[#1F2A44] transition-all cursor-pointer"
          >
            الرئيسية
          </button>
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

      {/* 2. Navigation Tabs (5 Clear Sections) */}
      <div className="flex items-center gap-2 border-b border-[#CBD5E1] pb-2 overflow-x-auto">
        {/* Tab 1: Trials */}
        <button
          type="button"
          onClick={() => setActiveTab('trials')}
          className={`px-4 py-2.5 rounded-xl font-['Cairo'] text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'trials'
              ? 'bg-[#0D4E8B] text-white shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2A44] hover:bg-white'
          }`}
        >
          <Clock3 className="w-4 h-4" />
          <span>الحصص التجريبية (20 دقيقة)</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
            activeTab === 'trials' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
          }`}>
            {trialSlots.length}
          </span>
        </button>

        {/* Tab 2: Private (1:1) */}
        <button
          type="button"
          onClick={() => setActiveTab('private')}
          className={`px-4 py-2.5 rounded-xl font-['Cairo'] text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'private'
              ? 'bg-[#0D4E8B] text-white shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2A44] hover:bg-white'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>الحصص الخاصة المدفوعة (1:1)</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
            activeTab === 'private' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
          }`}>
            {privateSlots.length}
          </span>
        </button>

        {/* Tab 3: Groups */}
        <button
          type="button"
          onClick={() => setActiveTab('groups')}
          className={`px-4 py-2.5 rounded-xl font-['Cairo'] text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'groups'
              ? 'bg-[#0D4E8B] text-white shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2A44] hover:bg-white'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>المجموعات التعليمية</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
            activeTab === 'groups' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
          }`}>
            {groups.length}
          </span>
        </button>

        {/* Tab 4: Overview */}
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
          <span>ملخص ملفي وتخصصاتي</span>
        </button>

        {/* Tab 5: Profile Draft */}
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

      {/* ========================================================================= */}
      {/* SECTION 1: TRIAL SLOTS (مدة 20 دقيقة بالضبط) */}
      {/* ========================================================================= */}
      {activeTab === 'trials' && (
        <div className="space-y-6 animate-fade-in">
          {/* Info Banner */}
          <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 text-xs sm:text-sm flex items-start gap-3">
            <Info className="w-5 h-5 text-[#0D4E8B] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold block">نظام الحصص التجريبية المجانية (20 دقيقة):</span>
              <p className="leading-relaxed text-blue-800">
                الحصة التجريبية تمنح ولي الأمر والطالب انطباعاً واقعياً عن أسلوبك. مدتها محددة بالنظام بـ 20 دقيقة بالضبط، وتُحسب نهاية الحصة تلقائياً لمنع أي تعارض.
              </p>
            </div>
          </div>

          {/* Add Trial Slot Form */}
          <div className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs space-y-4">
            <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#1F2A44] flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#0D4E8B]" />
              <span>إضافة موعد تجريبي متاح (مجاني - 20 دقيقة بالضبط)</span>
            </h3>

            <form onSubmit={handleCreateTrialSlot} className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#1F2A44] block">التاريخ</label>
                <input
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  value={newTrialDate}
                  onChange={(e) => setNewTrialDate(e.target.value)}
                  required
                  className="w-full h-10 px-3 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#1F2A44] block">وقت البداية</label>
                <input
                  type="time"
                  value={newTrialStart}
                  onChange={(e) => handleTrialStartChange(e.target.value)}
                  required
                  className="w-full h-10 px-3 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#1F2A44] block">وقت النهاية (20 دقيقة تلقائياً)</label>
                <input
                  type="time"
                  value={newTrialEnd}
                  onChange={(e) => setNewTrialEnd(e.target.value)}
                  required
                  className="w-full h-10 px-3 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none bg-slate-50 cursor-not-allowed"
                />
              </div>

              <div className="space-y-1 flex flex-col justify-end">
                <button
                  type="submit"
                  disabled={isAddingTrial}
                  className="w-full h-10 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] disabled:opacity-50 text-white text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
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
          <div className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs space-y-4">
            <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#1F2A44] flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#0D4E8B]" />
                <span>قائمة المواعيد التجريبية المسجلة ({trialSlots.length})</span>
              </span>
              <span className="text-xs text-[#64748B] font-normal">
                {trialSlots.filter((s) => s.isAvailable).length} متاح • {trialSlots.filter((s) => s.isBooked).length} محجوز
              </span>
            </h3>

            {trialSlots.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed border-[#CBD5E1] rounded-2xl space-y-2">
                <Clock3 className="w-8 h-8 text-[#CBD5E1] mx-auto" />
                <p className="text-xs font-bold text-[#64748B]">لم تقم بإضافة أي مواعيد تجريبية بعد.</p>
                <p className="text-[11px] text-[#94A3B8]">
                  أضف أوقات فراغك بالأعلى لتمكين أولياء الأمور من حجز حصص تجريبية معك.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#F1F5F9]">
                {trialSlots.map((slot) => {
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
                            <span className="text-[10px] text-[#64748B]">({slot.timezone})</span>
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

                      {/* Delete Action */}
                      {!slot.isBooked && slot.isAvailable && !isPast ? (
                        <button
                          type="button"
                          onClick={() => handleDeleteTrialSlot(slot.id)}
                          disabled={deletingTrialId === slot.id}
                          className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {deletingTrialId === slot.id ? (
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

      {/* ========================================================================= */}
      {/* SECTION 2: PAID PRIVATE SESSIONS (الحصص الخاصة المدفوعة 1:1) */}
      {/* ========================================================================= */}
      {activeTab === 'private' && (
        <div className="space-y-6 animate-fade-in">
          {/* Counters Banner (محسوبة من قاعدة البيانات) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-xs space-y-1">
              <span className="text-xs text-[#64748B] font-bold block">المواعيد الخاصة المستقبلية المتاحة</span>
              <div className="font-['Cairo'] text-2xl font-extrabold text-[#0D4E8B]">
                {futurePrivateAvailableCount}
              </div>
              <span className="text-[11px] text-[#64748B] block">متاح للحجز الفوري من أولياء الأمور</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-xs space-y-1">
              <span className="text-xs text-[#64748B] font-bold block">المواعيد المحجوزة المؤكدة</span>
              <div className="font-['Cairo'] text-2xl font-extrabold text-emerald-600">
                {futurePrivateBookedCount}
              </div>
              <span className="text-[11px] text-[#64748B] block">محمية ولا يمكن حذفها</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-xs space-y-1">
              <span className="text-xs text-[#64748B] font-bold block">التخصصات المعتمدة الجاهزة للتدريس</span>
              <div className="font-['Cairo'] text-2xl font-extrabold text-[#1F2A44]">
                {specializations.length}
              </div>
              <span className="text-[11px] text-[#64748B] block">معتمدة رسمياً في ملفك التدريسي</span>
            </div>
          </div>

          {/* Add Private Slots Form */}
          <div className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs space-y-5">
            <div className="border-b border-[#F1F5F9] pb-3">
              <h3 className="font-['Cairo'] text-base font-bold text-[#1F2A44] flex items-center gap-2">
                <CalendarCheck2 className="w-5 h-5 text-[#0D4E8B]" />
                <span>إضافة مواعيد الحصص الخاصة (فردية 1:1)</span>
              </h3>
              <p className="text-xs text-[#64748B] mt-0.5">
                حدد التخصص من تخصصاتك المعتمدة، وسعر الحصة ومدتها، ثم أضف موعداً منفرداً أو تكراراً أسبوعياً مع معاينة المواعيد قبل الحفظ.
              </p>
            </div>

            {specializations.length === 0 ? (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                لا توجد تخصصات معتمدة مسجلة لملفك حالياً. يرجى مراجعة الإدارة لاعتماد تخصصات التدريس الخاصة بك.
              </div>
            ) : (
              <form onSubmit={handleSavePrivateSlots} className="space-y-4">
                {/* 1. Specialization Selection */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-xs font-bold text-[#1F2A44] block">
                      التخصص المعتمد <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={selectedSpecId}
                      onChange={(e) => setSelectedSpecId(e.target.value)}
                      required
                      className="w-full h-11 px-3.5 rounded-xl border border-[#CBD5E1] text-xs font-bold text-[#1F2A44] focus:border-[#0D4E8B] outline-none bg-white"
                    >
                      {specializations.map((spec) => (
                        <option key={spec.id} value={spec.id}>
                          {spec.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#1F2A44] block">التوقيت المعتمد</label>
                    <select
                      value={privateTimezone}
                      onChange={(e) => setPrivateTimezone(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none bg-white"
                    >
                      <option value="Africa/Cairo">بتوقيت القاهرة (مصر)</option>
                      <option value="Asia/Riyadh">بتوقيت مكة المكرمة (السعودية)</option>
                    </select>
                  </div>
                </div>

                {/* 2. Duration & Price */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#1F2A44] block">
                      مدة الحصة (بالدقائق)
                    </label>
                    <select
                      value={privateDurationMinutes}
                      onChange={(e) => setPrivateDurationMinutes(Number(e.target.value))}
                      className="w-full h-10 px-3 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none bg-white"
                    >
                      <option value={45}>45 دقيقة</option>
                      <option value={50}>50 دقيقة (المعتادة)</option>
                      <option value={60}>60 دقيقة (ساعة كاملة)</option>
                      <option value={90}>90 دقيقة (ساعة ونصف)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#1F2A44] block">
                      سعر الحصة
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        step={10}
                        value={privatePriceAmount}
                        onChange={(e) => setPrivatePriceAmount(Number(e.target.value))}
                        required
                        className="w-full h-10 px-3 rounded-xl border border-[#CBD5E1] text-xs font-bold focus:border-[#0D4E8B] outline-none"
                      />
                      <span className="text-xs font-bold text-[#64748B] shrink-0">{privateCurrency}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#1F2A44] block">
                      نمط الإضافة
                    </label>
                    <div className="grid grid-cols-2 gap-2 h-10">
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
                </div>

                {/* 3. Scheduling Mode Specific Inputs */}
                {privateSchedulingMode === 'single' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#1F2A44] block">تاريخ الموعد</label>
                      <input
                        type="date"
                        min={new Date().toISOString().split('T')[0]}
                        value={privateSingleDate}
                        onChange={(e) => setPrivateSingleDate(e.target.value)}
                        required
                        className="w-full h-10 px-3 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[#1F2A44] block">وقت البداية</label>
                      <input
                        type="time"
                        value={privateStartTime}
                        onChange={(e) => setPrivateStartTime(e.target.value)}
                        required
                        className="w-full h-10 px-3 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none bg-white"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[#1F2A44] block">وقت البداية الموحد</label>
                        <input
                          type="time"
                          value={privateStartTime}
                          onChange={(e) => setPrivateStartTime(e.target.value)}
                          required
                          className="w-full h-10 px-3 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none bg-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[#1F2A44] block">تكرار أسبوعياً حتى تاريخ نهاية</label>
                        <input
                          type="date"
                          min={new Date().toISOString().split('T')[0]}
                          value={privateRepeatUntilDate}
                          onChange={(e) => setPrivateRepeatUntilDate(e.target.value)}
                          required
                          className="w-full h-10 px-3 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none bg-white"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-[#1F2A44] block">أيام التكرار بالأسبوع:</label>
                      <div className="flex items-center gap-2 flex-wrap">
                        {[
                          { day: 0, label: 'الأحد' },
                          { day: 1, label: 'الاثنين' },
                          { day: 2, label: 'الثلاثاء' },
                          { day: 3, label: 'الأربعاء' },
                          { day: 4, label: 'الخميس' },
                          { day: 5, label: 'الجمعة' },
                          { day: 6, label: 'السبت' },
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
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
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
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-[#0D4E8B] flex items-center gap-1.5">
                        <Eye className="w-4 h-4" />
                        <span>معاينة المواعيد قبل الحفظ ({previewPrivateSlots.length} موعد):</span>
                      </span>
                      <span className="text-[11px] text-[#64748B]">
                        المدة: {privateDurationMinutes} دقيقة • السعر: {privatePriceAmount} {privateCurrency}
                      </span>
                    </div>

                    <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                      {previewPrivateSlots.map((p, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded-xl bg-white border border-[#E2E8F0] flex items-center justify-between text-xs"
                        >
                          <span className="font-bold text-[#1F2A44]">
                            {new Date(p.date).toLocaleDateString('ar-EG', {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                          <span className="font-mono text-slate-600" dir="ltr">
                            {p.startTime} - {p.endTime}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Submit button */}
                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSavingPrivateSlots || previewPrivateSlots.length === 0}
                    className="px-6 py-2.5 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] disabled:opacity-50 text-white text-xs sm:text-sm font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
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
          <div className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs space-y-4">
            <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#1F2A44] flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#0D4E8B]" />
                <span>قائمة المواعيد الخاصة (1:1) المسجلة ({privateSlots.length})</span>
              </span>
              <span className="text-xs text-[#64748B] font-normal">
                المواعيد المحجوزة محمية وتظهر حالة الحجز فوراً
              </span>
            </h3>

            {isLoadingPrivate ? (
              <div className="p-8 text-center text-xs text-[#64748B] flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>جاري تحميل المواعيد الخاصة...</span>
              </div>
            ) : privateSlots.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed border-[#CBD5E1] rounded-2xl space-y-2">
                <CalendarCheck2 className="w-8 h-8 text-[#CBD5E1] mx-auto" />
                <p className="text-xs font-bold text-[#64748B]">لم تقم بإضافة أي مواعيد خاصة مدفوعة بعد.</p>
                <p className="text-[11px] text-[#94A3B8]">
                  أضف مواعيدك الفردية المتاحة بالأعلى لتمكين أولياء الأمور من حجز حصص مدفوعة مستمرة معك.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#F1F5F9]">
                {privateSlots.map((slot) => {
                  const isPast = new Date(`${slot.slotDate}T${slot.startTime}`).getTime() < Date.now();
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
                              : slot.isAvailable && !isPast
                              ? 'bg-blue-50 text-[#0D4E8B] border border-blue-200'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          <Clock className="w-4 h-4" />
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
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
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] text-slate-700 font-bold">
                              {slot.durationMinutes} دقيقة • {slot.priceAmount} {slot.currency}
                            </span>
                          </div>

                          <p className="text-xs text-[#0D4E8B] font-bold">
                            {slot.specializationLabel}
                          </p>

                          <div className="flex items-center gap-2 pt-0.5">
                            {slot.isBooked ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                                <Lock className="w-3 h-3 text-emerald-600" />
                                <span>محجوز مؤكد لطالب</span>
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

                      {/* Actions */}
                      {!slot.isBooked && slot.isAvailable && !isPast ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingPrivateSlot(slot);
                              setEditSlotDate(slot.slotDate);
                              setEditSlotStart(slot.startTime.substring(0, 5));
                              setEditSlotEnd(slot.endTime.substring(0, 5));
                              setEditSlotDuration(slot.durationMinutes);
                              setEditSlotPrice(slot.priceAmount);
                              const matchSpec = specializations.find((s) => s.label === slot.specializationLabel);
                              if (matchSpec) setEditSlotSpecId(matchSpec.id);
                              else if (specializations.length > 0) setEditSlotSpecId(specializations[0].id);
                            }}
                            className="px-2.5 py-1.5 rounded-xl border border-blue-200 text-[#0D4E8B] hover:bg-blue-50 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>تعديل</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeletePrivateSlot(slot.id)}
                            disabled={deletingPrivateSlotId === slot.id}
                            className="px-2.5 py-1.5 rounded-xl border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
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
      {/* SECTION 3: EDUCATIONAL GROUPS (المجموعات التعليمية) */}
      {/* ========================================================================= */}
      {activeTab === 'groups' && (
        <div className="space-y-6 animate-fade-in">
          {/* Header Action */}
          <div className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-['Cairo'] text-base font-bold text-[#1F2A44] flex items-center gap-2">
                <Users className="w-5 h-5 text-[#0D4E8B]" />
                <span>إدارة المجموعات التعليمية (Small Groups)</span>
              </h3>
              <p className="text-xs text-[#64748B] mt-0.5">
                مجموعات طلابية ذات عدد مقاعد محدد وسعر اشتراك للطالب الواحد مع جدول أسبوعي واضح.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowAddGroupForm(!showAddGroupForm)}
              className="px-4 py-2.5 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs sm:text-sm font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{showAddGroupForm ? 'إخفاء نموذج الإضافة' : 'إنشاء مجموعة جديدة'}</span>
            </button>
          </div>

          {/* Add Group Form */}
          {showAddGroupForm && (
            <div className="bg-white rounded-3xl border border-[#CBD5E1] p-6 shadow-sm space-y-4 animate-fade-in">
              <h4 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#1F2A44] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#0D4E8B]" />
                <span>بيانات المجموعة التعليمية الجديدة</span>
              </h4>

              <form onSubmit={handleCreateGroup} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#1F2A44] block">
                      اسم المجموعة <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={groupTitle}
                      onChange={(e) => setGroupTitle(e.target.value)}
                      placeholder="مثال: مراجعة وشرح تأسيس الرياضيات - الصف الرابع"
                      required
                      className="w-full h-10 px-3 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#1F2A44] block">
                      التخصص المعتمد <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={groupSpecId}
                      onChange={(e) => setGroupSpecId(e.target.value)}
                      required
                      className="w-full h-10 px-3 rounded-xl border border-[#CBD5E1] text-xs font-bold focus:border-[#0D4E8B] outline-none bg-white"
                    >
                      {specializations.map((spec) => (
                        <option key={spec.id} value={spec.id}>
                          {spec.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#1F2A44] block">
                    وصف مختصر للمجموعة وأهدافها
                  </label>
                  <textarea
                    rows={2}
                    value={groupDescription}
                    onChange={(e) => setGroupDescription(e.target.value)}
                    placeholder="اكتب نبذة عن خطة الحصص وما سيتعلمه الطالب خلال البرنامج..."
                    className="w-full p-3 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#1F2A44] block">الحد الأقصى للطلاب</label>
                    <input
                      type="number"
                      min={2}
                      max={20}
                      value={groupMaxStudents}
                      onChange={(e) => setGroupMaxStudents(Number(e.target.value))}
                      required
                      className="w-full h-10 px-3 rounded-xl border border-[#CBD5E1] text-xs font-bold focus:border-[#0D4E8B] outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#1F2A44] block">سعر الاشتراك للطالب</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        step={20}
                        value={groupPricePerStudent}
                        onChange={(e) => setGroupPricePerStudent(Number(e.target.value))}
                        required
                        className="w-full h-10 px-3 rounded-xl border border-[#CBD5E1] text-xs font-bold focus:border-[#0D4E8B] outline-none"
                      />
                      <span className="text-xs font-bold text-[#64748B] shrink-0">{groupCurrency}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#1F2A44] block">نوع التسعير</label>
                    <select
                      value={groupPriceType}
                      onChange={(e) => setGroupPriceType(e.target.value as any)}
                      className="w-full h-10 px-3 rounded-xl border border-[#CBD5E1] text-xs font-bold focus:border-[#0D4E8B] outline-none bg-white"
                    >
                      <option value="full_package">للباقة كاملة ({groupSessionsCount} حصص)</option>
                      <option value="per_session">لكل حصة منفردة</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#1F2A44] block">مدة الحصة (بالدقائق)</label>
                    <select
                      value={groupSessionDuration}
                      onChange={(e) => setGroupSessionDuration(Number(e.target.value))}
                      className="w-full h-10 px-3 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none bg-white"
                    >
                      <option value={45}>45 دقيقة</option>
                      <option value={60}>60 دقيقة (ساعة كاملة)</option>
                      <option value={75}>75 دقيقة</option>
                      <option value={90}>90 دقيقة</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#1F2A44] block">عدد الحصص المقررة</label>
                    <input
                      type="number"
                      min={1}
                      max={40}
                      value={groupSessionsCount}
                      onChange={(e) => setGroupSessionsCount(Number(e.target.value))}
                      required
                      className="w-full h-10 px-3 rounded-xl border border-[#CBD5E1] text-xs font-bold focus:border-[#0D4E8B] outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#1F2A44] block">تاريخ البدء</label>
                    <input
                      type="date"
                      min={new Date().toISOString().split('T')[0]}
                      value={groupStartDate}
                      onChange={(e) => setGroupStartDate(e.target.value)}
                      required
                      className="w-full h-10 px-3 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#1F2A44] block">وقت بدء اللقاءات</label>
                    <input
                      type="time"
                      value={groupSessionStartTime}
                      onChange={(e) => setGroupSessionStartTime(e.target.value)}
                      required
                      className="w-full h-10 px-3 rounded-xl border border-[#CBD5E1] text-xs font-mono focus:border-[#0D4E8B] outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#1F2A44] block">
                    أيام اللقاءات الأسبوعية:
                  </label>
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
                            if (isSelected) {
                              setGroupWeeklyDays(groupWeeklyDays.filter((x) => x !== d.day));
                            } else {
                              setGroupWeeklyDays([...groupWeeklyDays, d.day]);
                            }
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all ${
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
                  <label className="text-xs font-bold text-[#1F2A44] block">
                    ملخص الجدول الأسبوعي (نص وصفي للعرض) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={groupScheduleSummary}
                    onChange={(e) => setGroupScheduleSummary(e.target.value)}
                    placeholder="مثال: كل اثنين وأربعاء من ٦:٠٠ إلى ٧:٠٠ م"
                    required
                    className="w-full h-10 px-3 rounded-xl border border-[#CBD5E1] text-xs focus:border-[#0D4E8B] outline-none"
                  />
                </div>

                {/* Sessions Table Preview */}
                {generatedGroupSessions.length > 0 && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                    <span className="text-xs font-bold text-[#1F2A44] block">
                      معاينة جدول اللقاءات ({generatedGroupSessions.length} لقاء):
                    </span>
                    <div className="max-h-36 overflow-y-auto space-y-1 text-xs">
                      {generatedGroupSessions.map((s) => (
                        <div key={s.sessionNumber} className="flex items-center justify-between bg-white px-2.5 py-1 rounded-lg border border-slate-100">
                          <span className="font-bold text-[#0D4E8B]">{s.title}</span>
                          <span className="font-mono text-slate-600">{s.sessionDate}</span>
                          <span className="text-slate-500">{s.startTime} - {s.endTime}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Review Note */}
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                  <Info className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    ملاحظة هامة: بعد إنشاء المجموعة، ستخضع لمراجعة إدارة شاطر للتأكد من المنهج والمواعيد قبل نشرها للجمهور.
                  </span>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddGroupForm(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isCreatingGroup}
                    className="px-6 py-2.5 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] disabled:opacity-50 text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    {isCreatingGroup ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>نشر المجموعة التعليمية</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Groups Cards List */}
          <div className="space-y-4">
            {isLoadingGroups ? (
              <div className="p-8 text-center text-xs text-[#64748B] flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>جاري تحميل المجموعات...</span>
              </div>
            ) : groups.length === 0 ? (
              <div className="bg-white p-8 text-center border-2 border-dashed border-[#CBD5E1] rounded-3xl space-y-2">
                <Users className="w-8 h-8 text-[#CBD5E1] mx-auto" />
                <p className="text-xs font-bold text-[#64748B]">لم تقم بإنشاء أي مجموعات تعليمية بعد.</p>
                <p className="text-[11px] text-[#94A3B8]">
                  أنشئ مجموعتك الأولى بالأعلى لتقديم دورات تفاعلية مشتركة بعدد مقاعد محدد.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {groups.map((group) => (
                  <div
                    key={group.id}
                    className="bg-white rounded-3xl border border-[#E2E8F0] p-5 shadow-xs flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                            group.reviewStatus === 'approved'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : group.reviewStatus === 'rejected'
                              ? 'bg-rose-50 text-rose-800 border border-rose-200'
                              : group.reviewStatus === 'needs_revision'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                          }`}>
                            {group.reviewStatus === 'approved'
                              ? 'معتمدة إدارياً'
                              : group.reviewStatus === 'rejected'
                              ? 'مرفوضة'
                              : group.reviewStatus === 'needs_revision'
                              ? 'بحاجة لتعديل'
                              : 'قيد مراجعة الإدارة'}
                          </span>

                          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                            group.status === 'open'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : group.status === 'in_progress'
                              ? 'bg-blue-50 text-blue-800 border border-blue-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {group.status === 'open'
                              ? 'التسجيل مفتوح'
                              : group.status === 'in_progress'
                              ? 'بدأت بالفعل'
                              : group.status === 'completed'
                              ? 'مكتملة'
                              : 'ملغاة'}
                          </span>
                        </div>

                        <span className="text-xs font-bold text-[#0D4E8B] bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200">
                          {group.pricePerStudent} {group.currency} / {group.priceType === 'per_session' ? 'للحصة' : 'للباقة'}
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

                      {group.adminReviewNotes && (
                        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                          <span className="font-bold">ملاحظات الإدارة: </span>
                          <span>{group.adminReviewNotes}</span>
                        </div>
                      )}

                      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
                        <div className="flex items-center justify-between">
                          <span>المقاعد المتبقية:</span>
                          <span className="font-bold text-[#1F2A44]">
                            {group.remainingSeats !== undefined ? group.remainingSeats : Math.max(0, group.maxStudents - group.enrolledStudents)} مقاعد متبقية (المشغول: {group.enrolledStudents})
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>الجدول الأسبوعي:</span>
                          <span className="font-bold text-[#0D4E8B]">{group.weeklyScheduleSummary}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>تاريخ البدء:</span>
                          <span className="font-mono">{group.startDate} ({group.sessionsCount} حصص)</span>
                        </div>
                      </div>
                    </div>

                    {/* Status Toggle Actions */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-[#64748B]">
                        {group.isPublished ? 'معروضة بالملف العام' : 'غير معروضة (تتطلب اعتماد الإدارة)'}
                      </span>

                      <div className="flex items-center gap-1.5">
                        {group.enrolledStudents === 0 && group.status !== 'completed' && group.status !== 'cancelled' && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingGroup(group);
                              setGroupTitle(group.title);
                              setGroupDescription(group.description || '');
                              setGroupMaxStudents(group.maxStudents);
                              setGroupPricePerStudent(group.pricePerStudent);
                              setGroupPriceType(group.priceType as any);
                              setGroupSessionsCount(group.sessionsCount);
                              setGroupSessionDuration(group.sessionDurationMinutes);
                              setGroupStartDate(group.startDate);
                              setGroupScheduleSummary(group.weeklyScheduleSummary);
                              const matchSpec = specializations.find((s) => s.label === group.specializationLabel);
                              if (matchSpec) setGroupSpecId(matchSpec.id);
                              setShowAddGroupForm(true);
                              window.scrollTo({ top: 400, behavior: 'smooth' });
                            }}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all cursor-pointer flex items-center gap-1"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>تعديل</span>
                          </button>
                        )}

                        {group.status === 'open' ? (
                          <button
                            type="button"
                            disabled={updatingGroupId === group.id}
                            onClick={() => handleUpdateGroupStatus(group.id, 'in_progress')}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-all cursor-pointer"
                          >
                            بدء المجموعة
                          </button>
                        ) : group.status === 'in_progress' ? (
                          <button
                            type="button"
                            disabled={updatingGroupId === group.id}
                            onClick={() => handleUpdateGroupStatus(group.id, 'completed')}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all cursor-pointer"
                          >
                            إنهاء المجموعة
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 4: PROFILE OVERVIEW & APPROVED SPECIALIZATIONS */}
      {/* ========================================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-fade-in">
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
                {trialSlots.filter((s) => s.isAvailable).length} موعد متاح
              </div>
              <span className="text-[11px] text-emerald-800 font-bold block mt-1">
                {trialSlots.filter((s) => s.isBooked).length} موعد محجوز لطالب
              </span>
            </div>
          </div>

          {/* Approved Specializations Card */}
          <div className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-['Cairo'] text-base font-bold text-[#1F2A44] flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#0D4E8B]" />
                <span>تخصصاتي المعتمدة في منصة شاطر ({specializations.length})</span>
              </h3>
              <span className="text-xs text-[#64748B]">
                التخصصات المعتمدة من الإدارة التي يمكنك فتح مواعيد لها
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

      {/* ========================================================================= */}
      {/* SECTION 5: PROFILE DRAFT PROPOSAL */}
      {/* ========================================================================= */}
      {activeTab === 'profile-draft' && (
        <div className="bg-white rounded-3xl border border-[#E2E8F0] p-6 sm:p-8 shadow-xs space-y-6 animate-fade-in">
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
                  <label className="px-3 py-2 rounded-xl border border-[#CBD5E1] hover:bg-slate-50 text-xs font-bold text-[#1F2A44] transition-all cursor-pointer inline-flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5" />
                    <span>{isUploadingAvatar ? 'جاري الرفع...' : 'اختيار صورة جديدة'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleAvatarFileChange}
                      disabled={isUploadingAvatar}
                      className="hidden"
                    />
                  </label>
                  <p className="text-[11px] text-[#64748B]">
                    صيغ مدعومة: JPG أو PNG أو WebP بحد أقصى 2 ميجابايت.
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

      {/* Edit Private Slot Modal */}
      {editingPrivateSlot && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleUpdatePrivateSlot}
            className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <h3 className="font-['Cairo'] text-base font-bold text-[#1F2A44] flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-[#0D4E8B]" />
              <span>تعديل الموعد الخاص</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">التخصص المعتمد *</label>
                <select
                  value={editSlotSpecId}
                  onChange={(e) => setEditSlotSpecId(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 font-bold focus:border-[#0D4E8B] focus:outline-none"
                >
                  {specializations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">التاريخ *</label>
                <input
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  value={editSlotDate}
                  onChange={(e) => setEditSlotDate(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 font-mono focus:border-[#0D4E8B] focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">وقت البدء *</label>
                  <input
                    type="time"
                    value={editSlotStart}
                    onChange={(e) => {
                      setEditSlotStart(e.target.value);
                      setEditSlotEnd(addMinutesToTime(e.target.value, editSlotDuration));
                    }}
                    className="w-full p-2.5 rounded-xl border border-slate-200 font-mono focus:border-[#0D4E8B] focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">وقت النهاية *</label>
                  <input
                    type="time"
                    value={editSlotEnd}
                    onChange={(e) => setEditSlotEnd(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 font-mono focus:border-[#0D4E8B] focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">المدة (دقيقة)</label>
                  <select
                    value={editSlotDuration}
                    onChange={(e) => {
                      const dur = Number(e.target.value);
                      setEditSlotDuration(dur);
                      if (editSlotStart) setEditSlotEnd(addMinutesToTime(editSlotStart, dur));
                    }}
                    className="w-full p-2.5 rounded-xl border border-slate-200 font-bold focus:border-[#0D4E8B] focus:outline-none"
                  >
                    <option value={45}>45 دقيقة</option>
                    <option value={50}>50 دقيقة</option>
                    <option value={60}>60 دقيقة</option>
                    <option value={90}>90 دقيقة</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">السعر (ج.م)</label>
                  <input
                    type="number"
                    min={0}
                    value={editSlotPrice}
                    onChange={(e) => setEditSlotPrice(Number(e.target.value))}
                    className="w-full p-2.5 rounded-xl border border-slate-200 font-mono focus:border-[#0D4E8B] focus:outline-none"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingPrivateSlot(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isUpdatingSlot}
                className="px-5 py-2 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
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
