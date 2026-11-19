import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Tutor,
  SearchCriteria,
  TutorAvailableSlot,
  TutorPrivateSlot,
  TutorGroup,
  DirectTrialBooking,
  DirectTrialBookingPolicy,
} from '../types';
import { DataService } from '../services/dataService';
import { DirectTrialBookingService } from '../services/directTrialBookingService';
import { PARENT_LEAD_COUNTRY_OPTIONS } from '../services/parentLeadService';
import { normalizeTutorContactPhone } from '../utils/tutorReadinessAndContact';
import {
  filterDirectBookingTrialSlots,
  formatBookingInOwnTimezone,
  formatMinimumNoticeArabic,
  savePendingDirectTrialDraft,
  loadPendingDirectTrialDraft,
  clearPendingDirectTrialDraft,
  saveDirectTrialReturnTarget,
  loadDirectTrialReturnTarget,
  clearDirectTrialReturnTarget,
  resolveInitialTrialSlotSelection,
} from '../utils/directTrialBooking';
import { VideoModal } from './VideoModal';
import { WhatsAppNoticeModal } from './WhatsAppNoticeModal';
import { EmailCodeVerifier } from './EmailCodeVerifier';
import {
  trackBookingSlotSelected,
  trackTrialSlotSelected,
  trackWhatsAppClicked,
} from '../services/analytics';
import {
  buildPrivateSessionBookingWhatsAppUrl,
  buildGroupClassBookingWhatsAppUrl,
  buildInterestRegistrationWhatsAppUrl,
} from '../config/shatirConfig';
import {
  formatTutorExperience,
  formatSessionPriceSummary,
  formatGroupPriceSummary,
  getTutorHeadlineAndDegree,
  getTutorSpecializationSummary,
  normalizeLegacyAgeGroupText,
  filterValidAvailableTrialSlots,
  filterValidAvailablePrivateSlots,
  formatTimeArabic12h,
  formatSlotDateArabic,
  getTimezoneArabicLabel,
  toArabicDigits,
  buildTutorTeachingGroups,
} from '../utils/formatters';
import {
  ArrowRight,
  GraduationCap,
  Clock,
  Play,
  Lightbulb,
  Check,
  BookOpen,
  Calendar,
  CalendarDays,
  ShieldCheck,
  MessageCircle,
  CheckCircle2,
  Users,
  Loader2,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Star,
  UserCheck,
  Info,
  Mail,
  AlertCircle,
  CalendarCheck2,
  Gift,
} from 'lucide-react';

interface TutorProfileViewProps {
  tutor: Tutor;
  criteria?: SearchCriteria;
  onBack: () => void;
  onNavigateToMyTrials?: () => void;
  stageName?: string;
  gradeName?: string;
  subjectName?: string;
  curriculumName?: string;
  quranAgeName?: string;
  quranLevelName?: string;
  previewTrialSlots?: TutorAvailableSlot[];
  previewPrivateSlots?: TutorPrivateSlot[];
  previewGroups?: TutorGroup[];
  initialFocusBooking?: boolean;
}

type BookingTabType = 'trial' | 'private' | 'groups';

export const TutorProfileView: React.FC<TutorProfileViewProps> = ({
  tutor,
  criteria,
  onBack,
  onNavigateToMyTrials,
  stageName,
  gradeName,
  subjectName,
  curriculumName,
  quranAgeName,
  quranLevelName,
  previewTrialSlots,
  previewPrivateSlots,
  previewGroups,
  initialFocusBooking = false,
}) => {
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [modalContext, setModalContext] = useState<{
    requestType: 'trial' | 'private' | 'group' | 'recommendation';
    track: 'school' | 'quran' | null;
    courseOptionId: string | null;
    quranAgeGroupId: string | null;
    quranLevelId: string | null;
    customWhatsAppUrl?: string;
    whatsappAnalyticsSource: string;
  } | null>(null);
  const [isBioExpanded, setIsBioExpanded] = useState(false);

  const isPreviewMode =
    previewTrialSlots !== undefined ||
    previewPrivateSlots !== undefined ||
    previewGroups !== undefined;
  const isUnpublishedProfile = tutor.isPublished === false;
  const [previewBookingNotice, setPreviewBookingNotice] = useState<string | null>(null);

  // Active tab in the compact booking widget
  const [activeBookingTab, setActiveBookingTab] = useState<BookingTabType>('private');

  // Trial slots & direct trial booking policy state
  const [rawTrialSlots, setRawTrialSlots] = useState<TutorAvailableSlot[]>([]);
  const [isLoadingTrialSlots, setIsLoadingTrialSlots] = useState(true);
  const [bookingPolicy, setBookingPolicy] = useState<DirectTrialBookingPolicy | null>(null);
  const [isLoadingPolicy, setIsLoadingPolicy] = useState(false);
  const [selectedTrialDate, setSelectedTrialDate] = useState<string>('');
  const [selectedTrialSlotId, setSelectedTrialSlotId] = useState<string>('');
  const [trialDayWindowStart, setTrialDayWindowStart] = useState<number>(0);
  const [showTrialMiniCalendar, setShowTrialMiniCalendar] = useState<boolean>(false);

  // Direct booking interactive flow state
  const [isDirectPanelOpen, setIsDirectPanelOpen] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(
    () => !isPreviewMode && !isUnpublishedProfile
  );
  const [authUser, setAuthUser] = useState<{ id: string; email?: string | null } | null>(null);
  const [otpEmail, setOtpEmail] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [otpSentEmail, setOtpSentEmail] = useState<string | null>(null);
  const [guardianName, setGuardianName] = useState('');
  const [whatsappCountryCode, setWhatsappCountryCode] = useState('+20');
  const [whatsappLocalPhone, setWhatsappLocalPhone] = useState('');
  const [directBookingError, setDirectBookingError] = useState<string | null>(null);
  const [isConfirmingDirectBooking, setIsConfirmingDirectBooking] = useState(false);
  const [confirmedDirectBooking, setConfirmedDirectBooking] =
    useState<DirectTrialBooking | null>(null);
  const appliedDraftKeyRef = useRef<string | null>(null);
  const selectedTrialSelectionRef = useRef<{ date: string; slotId: string }>({
    date: '',
    slotId: '',
  });

  // Private 1:1 slots & Groups state
  const [rawPrivateSlots, setRawPrivateSlots] = useState<TutorPrivateSlot[]>([]);
  const [selectedPrivateDate, setSelectedPrivateDate] = useState<string>('');
  const [selectedPrivateSlotId, setSelectedPrivateSlotId] = useState<string>('');
  const [selectedSpecBySlotId, setSelectedSpecBySlotId] = useState<Record<string, string>>({});
  const [privateDayWindowStart, setPrivateDayWindowStart] = useState<number>(0);
  const [showPrivateMiniCalendar, setShowPrivateMiniCalendar] = useState<boolean>(false);

  const [publicGroups, setPublicGroups] = useState<TutorGroup[]>([]);
  const [isLoadingOffers, setIsLoadingOffers] = useState(true);

  // Normalized tutor display attributes
  const experienceText = useMemo(
    () => formatTutorExperience(tutor.yearsOfExperience, tutor.experienceBadgeText),
    [tutor.yearsOfExperience, tutor.experienceBadgeText]
  );

  const sessionPriceText = useMemo(
    () =>
      formatSessionPriceSummary({
        minPrice: tutor.hourlyRateMin,
        maxPrice: tutor.hourlyRateMax,
        currency: tutor.currency,
        durationMinutes: tutor.sessionDurationMinutes,
      }).combinedText,
    [tutor.hourlyRateMin, tutor.hourlyRateMax, tutor.currency, tutor.sessionDurationMinutes]
  );

  const { descriptiveHeadline, academicDegree } = useMemo(
    () => getTutorHeadlineAndDegree(tutor),
    [tutor]
  );

  const rawSpecializationSummary = useMemo(
    () => getTutorSpecializationSummary(tutor),
    [tutor]
  );

  const specializationInfo = useMemo(() => {
    const primaryLabel =
      subjectName ||
      quranLevelName ||
      rawSpecializationSummary.primarySpecialization;
    const secondaryLabel = normalizeLegacyAgeGroupText(
      gradeName ||
        quranAgeName ||
        rawSpecializationSummary.suitableAgesOrGrades
    );
    return {
      primaryLabel,
      secondaryLabel,
    };
  }, [
    subjectName,
    quranLevelName,
    gradeName,
    quranAgeName,
    rawSpecializationSummary,
  ]);

  const hasValidReviews =
    typeof tutor.reviewsCount === 'number' &&
    tutor.reviewsCount > 0 &&
    typeof tutor.rating === 'number' &&
    tutor.rating > 0;

  const hasVerifiedQualification = Boolean(
    Array.isArray(tutor.qualifications) && tutor.qualifications.some((q) => q.verified === true)
  );

  const hasRealVideo = Boolean(tutor.videoPreview?.available);

  // Filter strictly valid future available trial slots (no fabricated fallback slots)
  const baseValidTrialSlots = useMemo(
    () => filterValidAvailableTrialSlots(rawTrialSlots),
    [rawTrialSlots]
  );

  const isDirectBookingEnabled = Boolean(
    !isPreviewMode &&
      !isUnpublishedProfile &&
      bookingPolicy?.directBookingAvailable === true
  );

  const validTrialSlots = useMemo(() => {
    if (isDirectBookingEnabled && bookingPolicy) {
      return filterDirectBookingTrialSlots(
        rawTrialSlots,
        bookingPolicy.minimumNoticeMinutes
      );
    }
    return baseValidTrialSlots;
  }, [isDirectBookingEnabled, bookingPolicy, rawTrialSlots, baseValidTrialSlots]);

  const hasNoticeFilteredOutAllSlots = Boolean(
    isDirectBookingEnabled &&
      baseValidTrialSlots.length > 0 &&
      validTrialSlots.length === 0
  );

  // Group trial slots by date
  const trialSlotsByDate = useMemo(() => {
    const map = new Map<string, TutorAvailableSlot[]>();
    for (const slot of validTrialSlots) {
      const list = map.get(slot.slotDate) || [];
      list.push(slot);
      map.set(slot.slotDate, list);
    }
    return map;
  }, [validTrialSlots]);

  const availableTrialDates = useMemo(
    () => Array.from(trialSlotsByDate.keys()).sort((a, b) => a.localeCompare(b)),
    [trialSlotsByDate]
  );

  // Filter strictly valid future available private 1:1 slots (excluding booked, past, and admin_suspended)
  const validPrivateSlots = useMemo(
    () => filterValidAvailablePrivateSlots(rawPrivateSlots),
    [rawPrivateSlots]
  );

  // Group private slots by date
  const privateSlotsByDate = useMemo(() => {
    const map = new Map<string, TutorPrivateSlot[]>();
    for (const slot of validPrivateSlots) {
      const list = map.get(slot.slotDate) || [];
      list.push(slot);
      map.set(slot.slotDate, list);
    }
    return map;
  }, [validPrivateSlots]);

  const availablePrivateDates = useMemo(
    () => Array.from(privateSlotsByDate.keys()).sort((a, b) => a.localeCompare(b)),
    [privateSlotsByDate]
  );

  const refreshTrialSlots = useCallback(async () => {
    if (previewTrialSlots !== undefined || isUnpublishedProfile) return;
    const slots = await DataService.getTutorAvailableSlots(tutor.id);
    setRawTrialSlots(slots || []);
  }, [tutor.id, previewTrialSlots, isUnpublishedProfile]);

  // Fetch Trial Slots + Direct Trial Booking Policy
  useEffect(() => {
    if (previewTrialSlots !== undefined) {
      setRawTrialSlots(previewTrialSlots);
      setIsLoadingTrialSlots(false);
      setBookingPolicy(null);
      setIsLoadingPolicy(false);
      return;
    }

    if (isUnpublishedProfile) {
      setRawTrialSlots([]);
      setIsLoadingTrialSlots(false);
      setBookingPolicy(null);
      setIsLoadingPolicy(false);
      return;
    }

    let isMounted = true;
    setIsLoadingTrialSlots(true);
    setIsLoadingPolicy(true);
    setConfirmedDirectBooking(null);
    setDirectBookingError(null);

    DataService.getTutorAvailableSlots(tutor.id)
      .then((slots) => {
        if (!isMounted) return;
        setRawTrialSlots(slots || []);
        setIsLoadingTrialSlots(false);
      })
      .catch(() => {
        if (!isMounted) return;
        setRawTrialSlots([]);
        setIsLoadingTrialSlots(false);
      });

    DirectTrialBookingService.getDirectTrialBookingPolicy(tutor.id)
      .then((policy) => {
        if (!isMounted) return;
        setBookingPolicy(policy);
      })
      .catch(() => {
        if (!isMounted) return;
        setBookingPolicy(null);
      })
      .finally(() => {
        if (isMounted) setIsLoadingPolicy(false);
      });

    return () => {
      isMounted = false;
    };
  }, [tutor.id, previewTrialSlots, isUnpublishedProfile]);

  // Track Supabase parent auth session cleanly
  useEffect(() => {
    if (isPreviewMode || isUnpublishedProfile) {
      setIsCheckingAuth(false);
      return;
    }
    let isMounted = true;
    setIsCheckingAuth(true);

    DirectTrialBookingService.getCurrentSessionUser()
      .then((user) => {
        if (!isMounted) return;
        setAuthUser(user);
        if (user && loadDirectTrialReturnTarget()?.target === `tutor/${tutor.id}`) {
          clearDirectTrialReturnTarget();
        }
      })
      .catch(() => {
        if (isMounted) setAuthUser(null);
      })
      .finally(() => {
        if (isMounted) setIsCheckingAuth(false);
      });

    const unsubscribe = DirectTrialBookingService.onAuthStateChange((user) => {
      if (!isMounted) return;
      setAuthUser(user);
      setIsCheckingAuth(false);
      if (user && loadDirectTrialReturnTarget()?.target === `tutor/${tutor.id}`) {
        clearDirectTrialReturnTarget();
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [isPreviewMode, isUnpublishedProfile, tutor.id]);

  // Reset per-tutor draft application tracking when switching tutors
  useEffect(() => {
    appliedDraftKeyRef.current = null;
    selectedTrialSelectionRef.current = { date: '', slotId: '' };
  }, [tutor.id]);

  // Select default earliest date & first slot FIRST, and THEN restore saved draft slot
  useEffect(() => {
    if (isLoadingTrialSlots || isLoadingPolicy) return;

    const rawDraft =
      isDirectBookingEnabled && !isPreviewMode && !isUnpublishedProfile
        ? loadPendingDirectTrialDraft(tutor.id)
        : null;
    const draftKey = rawDraft
      ? `${rawDraft.tutorId}:${rawDraft.slotId}:${rawDraft.savedAt}`
      : null;
    const draftToApply =
      rawDraft && draftKey && draftKey !== appliedDraftKeyRef.current
        ? rawDraft
        : null;

    const resolution = resolveInitialTrialSlotSelection({
      validTrialSlots,
      draft: draftToApply,
      isDirectBookingEnabled,
      currentSelectedDate: selectedTrialSelectionRef.current.date,
      currentSelectedSlotId: selectedTrialSelectionRef.current.slotId,
    });

    selectedTrialSelectionRef.current = {
      date: resolution.selectedDate,
      slotId: resolution.selectedSlotId,
    };
    setSelectedTrialDate(resolution.selectedDate);
    setSelectedTrialSlotId(resolution.selectedSlotId);

    if (resolution.selectedDate && availableTrialDates.length > 0) {
      const dateIdx = availableTrialDates.indexOf(resolution.selectedDate);
      if (dateIdx >= 0) {
        const windowSize = 4;
        setTrialDayWindowStart((prev) => {
          if (dateIdx < prev || dateIdx >= prev + windowSize) {
            return Math.max(
              0,
              Math.min(dateIdx, Math.max(0, availableTrialDates.length - windowSize))
            );
          }
          return prev;
        });
      }
    } else {
      setTrialDayWindowStart(0);
    }

    if (draftToApply && draftKey && resolution.restoredDraft) {
      appliedDraftKeyRef.current = draftKey;
      if (draftToApply.guardianName) {
        setGuardianName((prev) => prev || draftToApply.guardianName || '');
      }
      if (draftToApply.countryCode) {
        setWhatsappCountryCode(draftToApply.countryCode);
      }
      if (draftToApply.localPhone) {
        setWhatsappLocalPhone((prev) => prev || draftToApply.localPhone || '');
      }
      if (!isPreviewMode && !isUnpublishedProfile && typeof window !== 'undefined') {
        // Continue the parent's pending choice on the dedicated booking page
        window.location.hash = `#book/${tutor.id}`;
        return;
      }
      setIsDirectPanelOpen(true);

      if (resolution.draftSlotUnavailable && validTrialSlots.length > 0) {
        setDirectBookingError(
          'الموعد الذي اخترته سابقاً لم يعد متاحاً. تم تحديد أقرب موعد متاح بدلاً منه، ويمكنك تعديله قبل تأكيد الحجز.'
        );
      }

      if (typeof document !== 'undefined') {
        window.setTimeout(() => {
          document.getElementById('booking-widget-section')?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
        }, 120);
      }
    }
  }, [
    tutor.id,
    isLoadingTrialSlots,
    isLoadingPolicy,
    isDirectBookingEnabled,
    isPreviewMode,
    isUnpublishedProfile,
    validTrialSlots,
    availableTrialDates,
  ]);

  // Fetch Private Slots & Groups
  useEffect(() => {
    if (previewPrivateSlots !== undefined || previewGroups !== undefined) {
      const slots = previewPrivateSlots || [];
      setRawPrivateSlots(slots);
      const initialSelections: Record<string, string> = {};
      slots.forEach((slot) => {
        const specs = Array.isArray(slot.allowedSpecializations)
          ? slot.allowedSpecializations
          : [];
        if (specs.length > 0) {
          initialSelections[slot.id] = specs[0].id;
        }
      });
      setSelectedSpecBySlotId(initialSelections);
      setPublicGroups(
        (previewGroups || []).filter(
          (g) =>
            !g.adminSuspended &&
            (g.status === 'open' || g.status === 'in_progress') &&
            (g.reviewStatus === undefined || g.reviewStatus === 'approved' || g.isPublished)
        )
      );
      setIsLoadingOffers(false);
      return;
    }

    if (isUnpublishedProfile) {
      setRawPrivateSlots([]);
      setPublicGroups([]);
      setIsLoadingOffers(false);
      return;
    }

    let isMounted = true;
    setIsLoadingOffers(true);
    Promise.allSettled([
      DataService.getTutorPrivateSlots(tutor.id),
      DataService.getTutorGroups(tutor.id),
    ]).then(([privateRes, groupsRes]) => {
      if (!isMounted) return;
      if (privateRes.status === 'fulfilled') {
        const slots = (privateRes.value || []) as TutorPrivateSlot[];
        setRawPrivateSlots(slots);

        const initialSelections: Record<string, string> = {};
        slots.forEach((slot) => {
          const specs = Array.isArray(slot.allowedSpecializations)
            ? slot.allowedSpecializations
            : [];
          if (specs.length > 0) {
            const matchedSpec = specs.find((sp) => {
              const lbl = normalizeLegacyAgeGroupText(String(sp.label || ''));
              if (
                subjectName &&
                gradeName &&
                lbl.includes(subjectName) &&
                lbl.includes(gradeName)
              ) {
                return true;
              }
              if (quranLevelName && lbl.includes(quranLevelName)) {
                return true;
              }
              return false;
            });
            initialSelections[slot.id] = (matchedSpec || specs[0]).id;
          }
        });
        setSelectedSpecBySlotId(initialSelections);
      }
      if (groupsRes.status === 'fulfilled') {
        setPublicGroups((groupsRes.value || []) as TutorGroup[]);
      }
      setIsLoadingOffers(false);
    });
    return () => {
      isMounted = false;
    };
  }, [tutor.id, subjectName, gradeName, quranLevelName, previewPrivateSlots, previewGroups]);

  // Initialize earliest private date & first slot automatically when validPrivateSlots load
  useEffect(() => {
    if (availablePrivateDates.length > 0) {
      const firstDate = availablePrivateDates[0];
      setSelectedPrivateDate(firstDate);
      setPrivateDayWindowStart(0);
      const firstDaySlots = privateSlotsByDate.get(firstDate) || [];
      if (firstDaySlots.length > 0) {
        setSelectedPrivateSlotId(firstDaySlots[0].id);
      }
    } else {
      setSelectedPrivateDate('');
      setSelectedPrivateSlotId('');
    }
  }, [availablePrivateDates, privateSlotsByDate]);

  // Selected Trial Slot object
  const selectedTrialSlot = useMemo(
    () => validTrialSlots.find((s) => s.id === selectedTrialSlotId) || null,
    [validTrialSlots, selectedTrialSlotId]
  );

  // Selected Private Slot object
  const selectedPrivateSlot = useMemo(
    () => validPrivateSlots.find((s) => s.id === selectedPrivateSlotId) || null,
    [validPrivateSlots, selectedPrivateSlotId]
  );

  // Dynamic Cairo Timezone Label (never hardcoded GMT+2 year-round)
  const activeTimezoneLabel = useMemo(
    () =>
      getTimezoneArabicLabel(
        selectedTrialSlot?.timezone || selectedPrivateSlot?.timezone || 'Africa/Cairo'
      ),
    [selectedTrialSlot?.timezone, selectedPrivateSlot?.timezone]
  );

  const hasCriteria = Boolean(criteria);
  const detectedTrack: 'school' | 'quran' =
    criteria?.track === 'school' || criteria?.track === 'quran'
      ? criteria.track
      : tutor.offerings.some((o) => o.track === 'school')
      ? 'school'
      : 'quran';
  const isSchool = detectedTrack === 'school';

  const primarySubjectName =
    subjectName ||
    tutor.subjectsTaughtSummary?.[0]?.title ||
    (isSchool ? 'المناهج المدرسية' : 'القرآن الكريم والتأسيس');

  const defaultCurriculumName =
    curriculumName || tutor.curriculumTags?.[0] || 'المنهج المصري';

  const selectedTrialSlotPayload = useMemo(() => {
    if (!selectedTrialSlot) return undefined;
    const dateInfo = formatSlotDateArabic(selectedTrialSlot.slotDate);
    const timeRange = `${formatTimeArabic12h(selectedTrialSlot.startTime)} – ${formatTimeArabic12h(
      selectedTrialSlot.endTime
    )}`;
    return {
      date: dateInfo.shortDate,
      dayName: dateInfo.dayName,
      timeRange,
      timezone: getTimezoneArabicLabel(selectedTrialSlot.timezone || 'Africa/Cairo'),
    };
  }, [selectedTrialSlot]);

  const bookingPayload = useMemo(
    () => ({
      tutorName: tutor.name,
      tutorHonorific: tutor.honorific,
      track: detectedTrack as 'school' | 'quran',
      subjectName: primarySubjectName,
      stageName: isSchool ? stageName : undefined,
      gradeName: isSchool ? gradeName : undefined,
      curriculumName: isSchool
        ? curriculumName || (hasCriteria ? undefined : defaultCurriculumName)
        : undefined,
      quranAgeGroupName: !isSchool
        ? normalizeLegacyAgeGroupText(quranAgeName || specializationInfo.secondaryLabel)
        : undefined,
      quranLevelName: !isSchool
        ? quranLevelName || specializationInfo.primaryLabel
        : undefined,
      selectedSlot: selectedTrialSlotPayload,
    }),
    [
      tutor.name,
      tutor.honorific,
      detectedTrack,
      primarySubjectName,
      isSchool,
      stageName,
      gradeName,
      curriculumName,
      hasCriteria,
      defaultCurriculumName,
      quranAgeName,
      specializationInfo,
      quranLevelName,
      selectedTrialSlotPayload,
    ]
  );

  // Handlers
  const handleSelectTrialDay = (dateStr: string) => {
    setSelectedTrialDate(dateStr);
    setShowTrialMiniCalendar(false);
    const daySlots = trialSlotsByDate.get(dateStr) || [];
    if (daySlots.length > 0) {
      const firstSlot = daySlots[0];
      selectedTrialSelectionRef.current = { date: dateStr, slotId: firstSlot.id };
      setSelectedTrialSlotId(firstSlot.id);
      trackTrialSlotSelected(tutor.id, firstSlot.id);
    } else {
      selectedTrialSelectionRef.current = { date: dateStr, slotId: '' };
    }
  };

  const handleSelectTrialTime = (slot: TutorAvailableSlot) => {
    selectedTrialSelectionRef.current = { date: slot.slotDate, slotId: slot.id };
    setSelectedTrialDate(slot.slotDate);
    setSelectedTrialSlotId(slot.id);
    trackTrialSlotSelected(tutor.id, slot.id);
  };

  const handleSelectPrivateDay = (dateStr: string) => {
    setSelectedPrivateDate(dateStr);
    setShowPrivateMiniCalendar(false);
    const daySlots = privateSlotsByDate.get(dateStr) || [];
    if (daySlots.length > 0) {
      const firstSlot = daySlots[0];
      setSelectedPrivateSlotId(firstSlot.id);
      trackBookingSlotSelected({
        tutorId: tutor.id,
        slotId: firstSlot.id,
        bookingType: 'private_1on1',
      });
    }
  };

  const handleSelectPrivateTime = (slot: TutorPrivateSlot) => {
    setSelectedPrivateSlotId(slot.id);
    const specs = Array.isArray(slot.allowedSpecializations)
      ? slot.allowedSpecializations
      : [];
    const chosenSpecId = selectedSpecBySlotId[slot.id] || specs[0]?.id;
    trackBookingSlotSelected({
      tutorId: tutor.id,
      slotId: slot.id,
      bookingType: 'private_1on1',
      specializationId: chosenSpecId,
    });
  };

  const openTrialWhatsAppModal = () => {
    if (isUnpublishedProfile || isPreviewMode) {
      setPreviewBookingNotice(
        isUnpublishedProfile
          ? 'ملفك قيد التجهيز وغير ظاهر لأولياء الأمور — هذه معاينة خاصة بك، ويظل الحجز غير متاح للجمهور حتى استكمال متطلبات الملف ونشره.'
          : 'هذه معاينة خاصة لملفك كما يراه ولي الأمر. ملفك منشور حالياً ومتاح للحجز للزوار.'
      );
      return;
    }
    setModalContext({
      requestType: 'trial',
      track: detectedTrack as 'school' | 'quran',
      courseOptionId: isSchool ? criteria?.courseOptionId || null : null,
      quranAgeGroupId: !isSchool ? criteria?.ageGroupId || null : null,
      quranLevelId: !isSchool ? criteria?.levelId || null : null,
      customWhatsAppUrl: undefined,
      whatsappAnalyticsSource: 'trial_booking_modal',
    });
    setIsWhatsAppModalOpen(true);
  };

  const sendDirectOtpEmail = async (email: string) => {
    if (!selectedTrialSlot) return;
    const returnTarget = `tutor/${tutor.id}`;
    savePendingDirectTrialDraft({
      tutorId: tutor.id,
      slotId: selectedTrialSlot.id,
      guardianName: guardianName.trim() || undefined,
      countryCode: whatsappCountryCode,
      localPhone: whatsappLocalPhone.trim() || undefined,
    });
    saveDirectTrialReturnTarget(returnTarget);
    const redirectUrl = `${window.location.origin}${window.location.pathname}?direct_return=${encodeURIComponent(returnTarget)}`;
    await DirectTrialBookingService.signInParentWithOtp(email, redirectUrl);
  };

  const resendDirectOtp = async () => {
    if (otpSentEmail) await sendDirectOtpEmail(otpSentEmail);
  };

  const handleSendDirectOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTrialSlot) return;
    setDirectBookingError(null);
    setIsSendingOtp(true);
    try {
      await sendDirectOtpEmail(otpEmail);
      setOtpSentEmail(otpEmail.trim());
    } catch (err: any) {
      setDirectBookingError(
        err?.message || 'تعذر إرسال كود الدخول إلى بريدك. يرجى التأكد من صحة البريد الإلكتروني.'
      );
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleConfirmDirectTrialBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUnpublishedProfile || isPreviewMode || !selectedTrialSlot) return;

    setDirectBookingError(null);
    const cleanGuardian = guardianName.trim();
    if (cleanGuardian.length < 2) {
      setDirectBookingError('يرجى إدخال اسم ولي الأمر بالكامل.');
      return;
    }

    const phoneValidation = normalizeTutorContactPhone(
      whatsappLocalPhone,
      whatsappCountryCode
    );
    if (!phoneValidation.isValid || !phoneValidation.displayPhone) {
      setDirectBookingError(
        phoneValidation.invalidReason ||
          'يرجى إدخال رقم واتساب صحيح مع اختيار المفتاح الدولي.'
      );
      return;
    }

    setIsConfirmingDirectBooking(true);
    try {
      const booked = await DirectTrialBookingService.parentBookTrial({
        slotId: selectedTrialSlot.id,
        guardianName: cleanGuardian,
        whatsapp: phoneValidation.displayPhone,
      });
      clearPendingDirectTrialDraft();
      clearDirectTrialReturnTarget();
      setConfirmedDirectBooking(booked);
      setIsDirectPanelOpen(false);
      await refreshTrialSlots().catch(() => {});
    } catch (err: any) {
      setDirectBookingError(
        err?.message || 'تعذر تأكيد الحجز المجاني حالياً. يرجى المحاولة مرة أخرى.'
      );
      if (err?.isSlotUnavailable) {
        await refreshTrialSlots().catch(() => {});
      }
    } finally {
      setIsConfirmingDirectBooking(false);
    }
  };

  const navigateToMyTrials = () => {
    if (onNavigateToMyTrials) {
      onNavigateToMyTrials();
    } else if (typeof window !== 'undefined') {
      window.location.hash = '#my-trials';
    }
  };

  const handleBookPrivateSlot = (slot: TutorPrivateSlot) => {
    if (isUnpublishedProfile || isPreviewMode) {
      setPreviewBookingNotice(
        isUnpublishedProfile
          ? 'ملفك قيد التجهيز وغير ظاهر لأولياء الأمور — هذه معاينة خاصة بك، ويظل الحجز غير متاح للجمهور حتى استكمال متطلبات الملف ونشره.'
          : 'هذه معاينة خاصة لملفك كما يراه ولي الأمر. ملفك منشور حالياً ومتاح للحجز للزوار.'
      );
      return;
    }
    const specs = Array.isArray(slot.allowedSpecializations)
      ? slot.allowedSpecializations
      : [];
    const selectedId = selectedSpecBySlotId[slot.id];
    const chosenSpec = specs.find((s) => s.id === selectedId) || specs[0] || null;
    const chosenLabel = normalizeLegacyAgeGroupText(
      chosenSpec?.label || slot.specializationLabel
    );
    const chosenCode = chosenSpec?.courseOptionId
      ? `school:${chosenSpec.courseOptionId}`
      : chosenSpec?.ageGroupId && chosenSpec?.levelId
      ? `quran:${chosenSpec.ageGroupId}:${chosenSpec.levelId}`
      : undefined;

    const url = buildPrivateSessionBookingWhatsAppUrl({
      slotId: slot.id,
      tutorName: tutor.name,
      tutorHonorific: tutor.honorific,
      specializationLabel: chosenLabel,
      chosenSpecializationCode: chosenCode,
      slotDate: slot.slotDate,
      startTime: `${formatTimeArabic12h(slot.startTime)}`,
      endTime: `${formatTimeArabic12h(slot.endTime)}`,
      timezone: getTimezoneArabicLabel(slot.timezone || 'Africa/Cairo'),
      durationMinutes: slot.durationMinutes,
      priceAmount: slot.priceAmount,
      currency: slot.currency,
    });

    const resolvedCourseOptionId =
      chosenSpec?.courseOptionId ||
      slot.offeringCourseOptionId ||
      (isSchool ? criteria?.courseOptionId || null : null);
    const resolvedAgeGroupId =
      chosenSpec?.ageGroupId ||
      slot.quranAgeGroupId ||
      (!isSchool ? criteria?.ageGroupId || null : null);
    const resolvedLevelId =
      chosenSpec?.levelId ||
      slot.quranLevelId ||
      (!isSchool ? criteria?.levelId || null : null);
    const resolvedTrack: 'school' | 'quran' =
      chosenSpec?.track ||
      (resolvedCourseOptionId ? 'school' : resolvedAgeGroupId ? 'quran' : (detectedTrack as 'school' | 'quran'));

    setModalContext({
      requestType: 'private',
      track: resolvedTrack,
      courseOptionId: resolvedCourseOptionId,
      quranAgeGroupId: resolvedAgeGroupId,
      quranLevelId: resolvedLevelId,
      customWhatsAppUrl: url,
      whatsappAnalyticsSource: 'private_slot_booking',
    });
    setIsWhatsAppModalOpen(true);
  };

  const handleBookGroup = (group: TutorGroup) => {
    if (isUnpublishedProfile || isPreviewMode) {
      setPreviewBookingNotice(
        isUnpublishedProfile
          ? 'ملفك قيد التجهيز وغير ظاهر لأولياء الأمور — هذه معاينة خاصة بك، ويظل الحجز غير متاح للجمهور حتى استكمال متطلبات الملف ونشره.'
          : 'هذه معاينة خاصة لملفك كما يراه ولي الأمر. ملفك منشور حالياً ومتاح للحجز للزوار.'
      );
      return;
    }
    trackBookingSlotSelected({
      tutorId: tutor.id,
      groupId: group.id,
      bookingType: 'group',
    });
    const url = buildGroupClassBookingWhatsAppUrl({
      tutorName: tutor.name,
      tutorHonorific: tutor.honorific,
      groupTitle: group.title,
      specializationLabel: normalizeLegacyAgeGroupText(group.specializationLabel),
      weeklyScheduleSummary: group.weeklyScheduleSummary,
      startDate: group.startDate,
      sessionsCount: group.sessionsCount,
      pricePerStudent: group.pricePerStudent,
      currency: group.currency,
      priceType: group.priceType,
    });

    const groupCourseOptionId =
      (group as any)?.offeringCourseOptionId ||
      (isSchool ? criteria?.courseOptionId || null : null);
    const groupAgeGroupId =
      (group as any)?.quranAgeGroupId ||
      (!isSchool ? criteria?.ageGroupId || null : null);
    const groupLevelId =
      (group as any)?.quranLevelId ||
      (!isSchool ? criteria?.levelId || null : null);

    setModalContext({
      requestType: 'group',
      track: groupCourseOptionId
        ? 'school'
        : groupAgeGroupId
        ? 'quran'
        : (detectedTrack as 'school' | 'quran'),
      courseOptionId: groupCourseOptionId,
      quranAgeGroupId: groupAgeGroupId,
      quranLevelId: groupLevelId,
      customWhatsAppUrl: url,
      whatsappAnalyticsSource: 'group_class_booking',
    });
    setIsWhatsAppModalOpen(true);
  };

  const handleRequestAdminCoordination = (
    contextNote: string,
    reqType: 'private' | 'group' = 'private'
  ) => {
    if (isUnpublishedProfile || isPreviewMode) {
      setPreviewBookingNotice(
        isUnpublishedProfile
          ? 'ملفك قيد التجهيز وغير ظاهر لأولياء الأمور — هذه معاينة خاصة بك، ويظل الحجز غير متاح للجمهور حتى استكمال متطلبات الملف ونشره.'
          : 'هذه معاينة خاصة لملفك كما يراه ولي الأمر. ملفك منشور حالياً ومتاح للحجز للزوار.'
      );
      return;
    }
    const url = buildInterestRegistrationWhatsAppUrl({
      track: detectedTrack as 'school' | 'quran',
      stageName: isSchool ? stageName : undefined,
      gradeName: isSchool ? gradeName : undefined,
      subjectName: isSchool ? primarySubjectName : undefined,
      curriculumName: isSchool ? defaultCurriculumName : undefined,
      quranAgeGroupName: !isSchool
        ? normalizeLegacyAgeGroupText(quranAgeName || specializationInfo.secondaryLabel)
        : undefined,
      quranLevelName: !isSchool
        ? quranLevelName || specializationInfo.primaryLabel
        : undefined,
      customNote: contextNote,
    });

    setModalContext({
      requestType: reqType,
      track: detectedTrack as 'school' | 'quran',
      courseOptionId: isSchool ? criteria?.courseOptionId || null : null,
      quranAgeGroupId: !isSchool ? criteria?.ageGroupId || null : null,
      quranLevelId: !isSchool ? criteria?.levelId || null : null,
      customWhatsAppUrl: url,
      whatsappAnalyticsSource: 'profile_empty_slot_coordination',
    });
    setIsWhatsAppModalOpen(true);
  };

  const scrollToBookingSection = (tab?: BookingTabType) => {
    if (tab) {
      setActiveBookingTab(tab);
    }
    const el = document.getElementById('booking-widget-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  useEffect(() => {
    if (!initialFocusBooking || isUnpublishedProfile) return;
    const timer = window.setTimeout(() => {
      document.getElementById('trial-card')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [initialFocusBooking, tutor.id, isUnpublishedProfile]);

  // ---- Profile layout helpers (redesign) ----
  const profileTeachingGroups = (() => {
    const fromOfferings = buildTutorTeachingGroups(tutor);
    if (fromOfferings.length > 0) return fromOfferings;
    return (tutor.subjectsTaughtSummary || []).map((item) => ({
      title: normalizeLegacyAgeGroupText(item.title || ''),
      detail: [item.gradesRange, item.curriculumNote]
        .filter(Boolean)
        .map((t) => normalizeLegacyAgeGroupText(String(t)))
        .join(' · '),
    }));
  })();
  const profileSharedDetail =
    profileTeachingGroups.length > 1 &&
    profileTeachingGroups.every((g) => g.detail && g.detail === profileTeachingGroups[0].detail)
      ? profileTeachingGroups[0].detail
      : '';
  const profileSpecChips = (() => {
    if (profileTeachingGroups.length > 0) return profileTeachingGroups.map((g) => g.title);
    const fromLabel = String(specializationInfo.primaryLabel || '')
      .split(/\s*[•،]\s*/)
      .map((x) => x.trim())
      .filter(Boolean);
    const fromSummary = (tutor.subjectsTaughtSummary || [])
      .map((i) => normalizeLegacyAgeGroupText(i.title || '').trim())
      .filter(Boolean);
    return Array.from(new Set(fromLabel.length > 0 ? fromLabel : fromSummary));
  })();
  const profileAgeText = String(specializationInfo.secondaryLabel || '')
    .split(/\s*•\s*/)
    .filter(Boolean)
    .join('، ');
  const profilePrice = formatSessionPriceSummary({
    minPrice: tutor.hourlyRateMin,
    maxPrice: tutor.hourlyRateMax,
    currency: tutor.currency,
    durationMinutes: tutor.sessionDurationMinutes,
    useArabicDigits: true,
  });
  const profileNextTrialSlots = validTrialSlots.slice(0, 4);
  const profileCanBookDirect = isDirectBookingEnabled && validTrialSlots.length > 0;

  const [isTrialCardVisible, setIsTrialCardVisible] = useState(true);
  useEffect(() => {
    const el = typeof document !== 'undefined' ? document.getElementById('trial-card') : null;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setIsTrialCardVisible(entry.isIntersecting), {
      threshold: 0.15,
    });
    io.observe(el);
    return () => io.disconnect();
  }, [tutor.id]);

  // «احجز تجربة مجانية» → dedicated booking page (optionally with a preselected slot)
  const goToTrialBooking = (slotId?: string) => {
    if (isPreviewMode || isUnpublishedProfile) {
      setPreviewBookingNotice(
        isUnpublishedProfile
          ? 'دي معاينة خاصة بيك. الحجز هيتفتح لأولياء الأمور بعد نشر ملفك.'
          : 'دي معاينة لملفك. أولياء الأمور بيحجزوا من هنا وبيروحوا لصفحة اختيار الموعد.'
      );
      return;
    }
    window.location.hash = `#book/${tutor.id}${slotId ? `/${slotId}` : ''}`;
  };

  // Bio text combination without fabrication
  const primaryBioText = (tutor.helpChildSummary || tutor.helpChildQuote || '')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
  const secondaryBioText =
    tutor.helpChildQuote &&
    tutor.helpChildQuote.trim() !== primaryBioText
      ? tutor.helpChildQuote.trim()
      : '';
  const hasExpandableBio =
    primaryBioText.length > 180 ||
    Boolean(secondaryBioText) ||
    (Array.isArray(tutor.targetStudentCases) && tutor.targetStudentCases.length > 0);

  // Visible day pills slice (up to 4 days at a time for clean mobile layout)
  const DAYS_WINDOW_SIZE = 4;
  const visibleTrialDates = availableTrialDates.slice(
    trialDayWindowStart,
    trialDayWindowStart + DAYS_WINDOW_SIZE
  );
  const visiblePrivateDates = availablePrivateDates.slice(
    privateDayWindowStart,
    privateDayWindowStart + DAYS_WINDOW_SIZE
  );

  if (!isPreviewMode && isUnpublishedProfile) {
    return (
      <div className="max-w-xl mx-auto my-12 p-6 sm:p-8 bg-white rounded-3xl border border-[#E2E8F0] shadow-xs text-center space-y-4" dir="rtl">
        <Info className="w-10 h-10 text-amber-600 mx-auto" />
        <h2 className="font-['Cairo'] text-lg font-extrabold text-[#1F2A44]">
          ملف المعلم قيد التجهيز وغير متاح للعرض العام أو الحجز حالياً
        </h2>
        <p className="text-xs sm:text-sm text-[#535E7B] leading-relaxed">
          هذا الملف لم يُنشر بعد لأولياء الأمور. يرجى العودة لقائمة المعلمين المنشورين لاختيار معلم متاح للحجز.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="px-5 py-2.5 min-h-[44px] rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs sm:text-sm font-bold transition-colors cursor-pointer"
        >
          العودة لاختيار معلم
        </button>
      </div>
    );
  }

  return (
    <div className="w-full pb-24 lg:pb-16 animate-fade-in">
      {/* Back bar (no repeated specialization text) */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 sm:pt-5">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] -mr-2 px-2 rounded-xl text-[#0D4E8B] hover:bg-[#F0F6FD] text-sm font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          <span>{hasCriteria ? 'نتائج البحث' : 'كل المعلمين'}</span>
        </button>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-2 space-y-4 sm:space-y-6">
        {/* ========================= HEADER ========================= */}
        <section aria-label="ملخص المعلم" className="bg-white rounded-3xl p-5 sm:p-7 border border-[#E2E8F0] shadow-xs">
          <div className="flex flex-row gap-4 sm:gap-6">
            <div className="relative shrink-0 self-start">
              <div className="w-20 h-20 sm:w-32 sm:h-32 rounded-3xl overflow-hidden bg-[#F0F5FA] border border-[#E2E8F0] flex items-center justify-center text-[#0D4E8B] text-3xl font-extrabold font-['Cairo']">
                {tutor.avatarUrl ? (
                  <img
                    src={tutor.avatarUrl}
                    alt={`${tutor.honorific} ${tutor.name}`}
                    className="w-full h-full object-cover object-top"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <span>{tutor.name.charAt(0)}</span>
                )}
              </div>
              {hasVerifiedQualification && (
                <span
                  className="absolute -bottom-1.5 -left-1.5 w-8 h-8 rounded-full bg-[#0D4E8B] text-white flex items-center justify-center border-[3px] border-white"
                  title="تمت مراجعة المؤهلات"
                >
                  <Check className="w-4 h-4" strokeWidth={3} />
                </span>
              )}
            </div>

            <div className="flex-1 min-w-0 space-y-3">
              <div className="space-y-1">
                <h1 className="font-['Cairo'] text-xl sm:text-3xl font-extrabold text-[#1F2A44] leading-tight">
                  {tutor.honorific} {tutor.name}
                </h1>
                {descriptiveHeadline && (
                  <p className="text-sm sm:text-base text-[#475569] leading-relaxed line-clamp-2">{descriptiveHeadline}</p>
                )}
              </div>

              {/* Key facts, one calm row */}
              <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#1F2A44]">
                <li className="flex items-center gap-1.5 font-bold">
                  {hasValidReviews ? (
                    <>
                      <Star className="w-4 h-4 fill-[#FFC629] text-[#FFC629]" />
                      <span>{toArabicDigits(tutor.rating?.toFixed(1) || '')}</span>
                      <span className="text-[#64748B] font-normal">({toArabicDigits(tutor.reviewsCount)} تقييم)</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-[#0D4E8B]" strokeWidth={1.75} />
                      <span>جديد على شاطر</span>
                    </>
                  )}
                </li>
                {experienceText && (
                  <li className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-[#64748B]" strokeWidth={1.75} />
                    <span>{experienceText}</span>
                  </li>
                )}
                {hasVerifiedQualification && (
                  <li className="flex items-center gap-1.5 text-emerald-700 font-bold">
                    <ShieldCheck className="w-4 h-4" strokeWidth={1.75} />
                    <span>مؤهلات تمت مراجعتها</span>
                  </li>
                )}
              </ul>

            </div>
          </div>
          <div className="mt-4 space-y-2.5 sm:pr-[152px]">
              {/* Specializations: first few chips + "+N" */}
              {profileSpecChips.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {profileSpecChips.slice(0, 3).map((label) => (
                    <span
                      key={label}
                      className="px-3 py-1.5 rounded-full bg-[#EBF3FC] text-[#0D4E8B] text-xs sm:text-sm font-bold"
                    >
                      {label}
                    </span>
                  ))}
                  {profileSpecChips.length > 3 && (
                    <a
                      href="#tutor-subjects"
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById('tutor-subjects')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className="px-3 py-1.5 rounded-full bg-[#F1F5F9] text-[#475569] text-xs sm:text-sm font-bold hover:bg-[#E2E8F0]"
                    >
                      +{toArabicDigits(profileSpecChips.length - 3)}
                    </a>
                  )}
                </div>
              )}
              {profileAgeText && (
                <p className="text-xs sm:text-sm text-[#64748B] flex items-center gap-1.5">
                  <Users className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                  <span>{profileAgeText}</span>
                </p>
              )}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
          {/* ========================= TRIAL CARD (sticky on desktop) ========================= */}
          <aside id="trial-card" className="lg:col-span-5 lg:order-2 lg:sticky lg:top-24 space-y-4 scroll-mt-24">
            <section aria-label="احجز تجربة مجانية" className="bg-white rounded-3xl p-5 sm:p-6 border border-[#E2E8F0] shadow-sm space-y-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <span className="block text-xs text-[#64748B]">الحصة الخاصة</span>
                  <span className="font-['Cairo'] text-2xl font-extrabold text-[#1F2A44]">{profilePrice.priceText}</span>
                  <span className="text-sm text-[#64748B]"> / {profilePrice.durationText}</span>
                </div>
                <span className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-800 text-xs font-extrabold flex items-center gap-1">
                  <Gift className="w-3.5 h-3.5" strokeWidth={2} />
                  أول تجربة مجانًا
                </span>
              </div>

              {previewBookingNotice && (
                <p role="status" className="p-3 rounded-2xl bg-amber-50 text-amber-900 text-xs font-bold leading-relaxed">
                  {previewBookingNotice}
                </p>
              )}

              {isLoadingTrialSlots || isLoadingPolicy ? (
                <div className="py-4 flex justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-[#0D4E8B]" />
                </div>
              ) : profileNextTrialSlots.length > 0 ? (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h2 className="font-['Cairo'] text-sm font-extrabold text-[#1F2A44]">أقرب مواعيد التجربة</h2>
                    <span className="text-[11px] text-[#64748B]">{activeTimezoneLabel}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {profileNextTrialSlots.map((slot) => {
                      const d = formatSlotDateArabic(slot.slotDate, slot.timezone || 'Africa/Cairo');
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          data-trial-slot={slot.id}
                          onClick={() => goToTrialBooking(slot.id)}
                          className="p-2.5 rounded-2xl border-2 border-[#E2E8F0] hover:border-[#0D4E8B] text-right transition-colors cursor-pointer"
                        >
                          <span className="block text-xs font-bold text-[#64748B]">{d.relativeBadge || d.dayName} · {d.shortDate}</span>
                          <span className="block font-['Cairo'] text-base font-extrabold text-[#1F2A44]">
                            {formatTimeArabic12h(slot.startTime)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => (profileCanBookDirect ? goToTrialBooking() : openTrialWhatsAppModal())}
                className="w-full min-h-[52px] rounded-2xl bg-[#FFC629] hover:bg-[#F0B517] text-[#1F2A44] font-['Cairo'] text-base font-extrabold shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                {profileCanBookDirect ? <CalendarCheck2 className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
                <span>{profileCanBookDirect ? 'احجز تجربة مجانية' : 'تنسيق التجربة عبر واتساب'}</span>
              </button>
              {profileCanBookDirect && validTrialSlots.length > profileNextTrialSlots.length && (
                <button
                  type="button"
                  onClick={() => goToTrialBooking()}
                  className="w-full text-sm font-bold text-[#0D4E8B] hover:underline cursor-pointer"
                >
                  كل المواعيد ({toArabicDigits(validTrialSlots.length)})
                </button>
              )}

              <p className="pt-3 border-t border-[#F1F5F9] text-xs text-[#64748B] leading-relaxed flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-[#0D4E8B] shrink-0 mt-0.5" strokeWidth={1.75} />
                <span>
                  تجربة {toArabicDigits(tutor.trialDurationMinutes || 20)} دقيقة أونلاين لتقييم مستوى طفلك والاطمئنان لأسلوب المعلم، من غير أي دفع، وفريق شاطر متابع معاك.
                </span>
              </p>
            </section>
          </aside>

          {/* ========================= MAIN COLUMN ========================= */}
          <div className="lg:col-span-7 lg:order-1 space-y-4 sm:space-y-5">
            {/* عن المعلم */}
            {(primaryBioText || hasRealVideo) && (
              <section aria-label="عن المعلم" className="bg-white rounded-3xl p-5 sm:p-6 border border-[#E2E8F0] shadow-xs space-y-3">
                <h2 className="font-['Cairo'] text-lg font-extrabold text-[#1F2A44]">عن المعلم</h2>
                {primaryBioText && (
                  <div className="text-sm sm:text-base text-[#334155] leading-loose space-y-2">
                    <p className="whitespace-pre-line">
                      {isBioExpanded || primaryBioText.length <= 220
                        ? primaryBioText
                        : `${primaryBioText.slice(0, 220).trim()}…`}
                    </p>
                    {isBioExpanded && secondaryBioText && <p className="text-[#475569]">{secondaryBioText}</p>}
                    {isBioExpanded && tutor.targetStudentCases && tutor.targetStudentCases.length > 0 && (
                      <ul className="pt-1 space-y-1.5">
                        {tutor.targetStudentCases.map((c, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm">
                            <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-1" />
                            <span>{normalizeLegacyAgeGroupText(c)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {(primaryBioText.length > 220 || secondaryBioText || (tutor.targetStudentCases || []).length > 0) && (
                      <button
                        type="button"
                        onClick={() => setIsBioExpanded((prev) => !prev)}
                        className="text-sm font-bold text-[#0D4E8B] hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>{isBioExpanded ? 'عرض أقل' : 'اقرأ المزيد'}</span>
                        {isBioExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                )}
                {hasRealVideo && (
                  <button
                    type="button"
                    onClick={() => setIsVideoModalOpen(true)}
                    className="w-full p-3 rounded-2xl bg-[#F0F5FA] flex items-center gap-3 text-right cursor-pointer hover:bg-[#E5EEF8]"
                  >
                    <span className="w-10 h-10 rounded-xl bg-[#0D4E8B] text-[#FFC629] flex items-center justify-center shrink-0">
                      <Play className="w-4 h-4 fill-[#FFC629]" />
                    </span>
                    <span className="font-['Cairo'] text-sm font-extrabold text-[#0D4E8B]">شاهد الفيديو التعريفي</span>
                  </button>
                )}
              </section>
            )}

            {/* بيدرّس إيه */}
            {profileTeachingGroups.length > 0 && (
              <section id="tutor-subjects" aria-label="بيدرّس إيه" className="bg-white rounded-3xl p-5 sm:p-6 border border-[#E2E8F0] shadow-xs space-y-3 scroll-mt-24">
                <h2 className="font-['Cairo'] text-lg font-extrabold text-[#1F2A44]">بيدرّس إيه</h2>
                <ul className="divide-y divide-[#F1F5F9]">
                  {profileTeachingGroups.map((g, idx) => (
                    <li key={idx} className="py-3 first:pt-0 last:pb-0 flex items-start gap-3">
                      <BookOpen className="w-5 h-5 text-[#0D4E8B] shrink-0 mt-0.5" strokeWidth={1.75} />
                      <div className="min-w-0">
                        <p className="text-sm sm:text-base font-bold text-[#1F2A44]">{g.title}</p>
                        {g.detail && !profileSharedDetail && (
                          <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed">{g.detail}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* المؤهلات والخبرة */}
            {((tutor.qualifications && tutor.qualifications.length > 0) || academicDegree) && (
              <section aria-label="المؤهلات والخبرة" className="bg-white rounded-3xl p-5 sm:p-6 border border-[#E2E8F0] shadow-xs space-y-3">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <h2 className="font-['Cairo'] text-lg font-extrabold text-[#1F2A44]">المؤهلات والخبرة</h2>
                  {experienceText && <span className="text-sm text-[#64748B]">{experienceText}</span>}
                </div>
                <ul className="space-y-3">
                  {(tutor.qualifications && tutor.qualifications.length > 0
                    ? tutor.qualifications
                    : [{ title: academicDegree, institution: '', verified: false } as any]
                  ).map((q: any, idx: number) => (
                    <li key={idx} className="flex items-start gap-3">
                      <span
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          q.verified === true ? 'bg-emerald-50 text-emerald-700' : 'bg-[#F1F5F9] text-[#64748B]'
                        }`}
                      >
                        {q.verified === true ? <ShieldCheck className="w-4 h-4" /> : <GraduationCap className="w-4 h-4" />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm sm:text-base font-bold text-[#1F2A44] leading-relaxed">{q.title}</p>
                        {q.institution && <p className="text-xs sm:text-sm text-[#64748B]">{q.institution}</p>}
                        {q.verified === true && <p className="text-xs font-bold text-emerald-700">تمت مراجعته من شاطر</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* طريقة التدريس — only when there is real content */}
            {((tutor.methodologyPillars && tutor.methodologyPillars.length > 0) ||
              (tutor.whatHappensInTrial && tutor.whatHappensInTrial.length > 0)) && (
              <section aria-label="طريقة التدريس" className="bg-white rounded-3xl p-5 sm:p-6 border border-[#E2E8F0] shadow-xs space-y-4">
                <h2 className="font-['Cairo'] text-lg font-extrabold text-[#1F2A44]">طريقة التدريس</h2>
                {tutor.methodologyPillars && tutor.methodologyPillars.length > 0 && (
                  <ul className="space-y-3">
                    {tutor.methodologyPillars.map((pillar, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <span className="w-7 h-7 rounded-lg bg-[#EBF3FC] text-[#0D4E8B] text-xs font-extrabold flex items-center justify-center shrink-0">
                          {toArabicDigits(idx + 1)}
                        </span>
                        <div>
                          <p className="text-sm sm:text-base font-bold text-[#1F2A44]">{pillar.title}</p>
                          {pillar.description && <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed">{pillar.description}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {tutor.whatHappensInTrial && tutor.whatHappensInTrial.length > 0 && (
                  <div className="p-4 rounded-2xl bg-[#F8FAFC] space-y-2">
                    <p className="font-['Cairo'] text-sm font-extrabold text-[#1F2A44]">
                      في التجربة المجانية ({toArabicDigits(tutor.trialDurationMinutes || 20)} دقيقة)
                    </p>
                    <ol className="space-y-1.5">
                      {tutor.whatHappensInTrial.map((step) => (
                        <li key={step.stepNumber} className="text-sm text-[#475569] leading-relaxed">
                          <span className="font-bold text-[#0D4E8B]">{toArabicDigits(step.stepNumber)}. {step.title}</span>
                          {step.description ? ` — ${step.description}` : ''}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </section>
            )}

          {/* ===================================================================== */}
          {/* LEFT COLUMN: COMPACT BOOKING WIDGET (المواعيد والمجموعات) */}
          {/* ===================================================================== */}
          <div id="booking-widget-section" className="space-y-4 scroll-mt-24">
            <section
              aria-label="الحصص الخاصة والمجموعات"
              className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-[#E2E8F0] shadow-sm space-y-4"
            >
              {/* Section Header + Timezone Indicator */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="font-['Cairo'] text-base sm:text-lg font-extrabold text-[#1F2A44] flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-[#0D4E8B]" />
                  <span>الحصص الخاصة والمجموعات</span>
                </h2>
                <span className="text-[11px] font-bold text-[#0D4E8B] bg-[#F0F5FA] px-2.5 py-1 rounded-lg border border-[#D1DCFE]">
                  {activeTimezoneLabel}
                </span>
              </div>

              {isPreviewMode && (
                <div className="p-3 rounded-xl bg-[#F0F5FA] border border-[#D1DCFE] space-y-1.5 text-xs">
                  <div className="font-bold text-[#0D4E8B] flex items-center justify-between flex-wrap gap-1">
                    <span>ملخص مواعيدك المحفوظة في المعاينة الخاصة:</span>
                    <span>
                      {toArabicDigits(validTrialSlots.length)} تجريبي •{' '}
                      {toArabicDigits(validPrivateSlots.length)} خاص •{' '}
                      {toArabicDigits(publicGroups.length)} مجموعة
                    </span>
                  </div>
                  {validPrivateSlots.length > 0 && (
                    <div className="text-[11px] text-[#1F2A44] flex flex-wrap items-center gap-1.5">
                      <span>أقرب حصة خاصة محفوظة:</span>
                      <button
                        type="button"
                        onClick={() => setActiveBookingTab('private')}
                        className="font-bold text-[#0D4E8B] underline cursor-pointer"
                      >
                        {formatSlotDateArabic(validPrivateSlots[0].slotDate).dayName}{' '}
                        {formatSlotDateArabic(validPrivateSlots[0].slotDate).shortDate} —{' '}
                        {formatTimeArabic12h(validPrivateSlots[0].startTime)} بسعر{' '}
                        {validPrivateSlots[0].priceAmount} {validPrivateSlots[0].currency}
                      </button>
                    </div>
                  )}
                  {isUnpublishedProfile && (
                    <p className="text-[11px] text-amber-800 font-bold">
                      ملفك قيد التجهيز وغير ظاهر لأولياء الأمور (الحجز متوقف للجمهور قبل النشر).
                    </p>
                  )}
                </div>
              )}

              {previewBookingNotice && (
                <div
                  role="status"
                  className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold leading-relaxed"
                >
                  {previewBookingNotice}
                </div>
              )}

              {/* 3 Clear Tabs: تجربة مجانية | حصة خاصة | مجموعات */}
              <div
                role="tablist"
                aria-label="خيارات الحجز"
                className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#F8F9FC] border border-[#E2E8F0]"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeBookingTab === 'private'}
                  onClick={() => setActiveBookingTab('private')}
                  className={`py-2 px-2 rounded-lg font-['Cairo'] text-xs font-bold transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                    activeBookingTab === 'private'
                      ? 'bg-[#0D4E8B] text-white shadow-xs'
                      : 'text-[#535E7B] hover:text-[#1F2A44]'
                  }`}
                >
                  <span>حصة خاصة</span>
                  <span
                    className={`text-[10px] ${
                      activeBookingTab === 'private' ? 'text-blue-100' : 'text-[#64748B]'
                    }`}
                  >
                    {validPrivateSlots.length > 0
                      ? `${toArabicDigits(validPrivateSlots.length)} موعد`
                      : 'فردي ١:١'}
                  </span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeBookingTab === 'groups'}
                  onClick={() => setActiveBookingTab('groups')}
                  className={`py-2 px-2 rounded-lg font-['Cairo'] text-xs font-bold transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                    activeBookingTab === 'groups'
                      ? 'bg-[#0D4E8B] text-white shadow-xs'
                      : 'text-[#535E7B] hover:text-[#1F2A44]'
                  }`}
                >
                  <span>مجموعات</span>
                  <span
                    className={`text-[10px] ${
                      activeBookingTab === 'groups' ? 'text-blue-100' : 'text-[#64748B]'
                    }`}
                  >
                    {publicGroups.length > 0
                      ? `${toArabicDigits(publicGroups.length)} متاحة`
                      : 'صغيرة'}
                  </span>
                </button>
              </div>

              {/* =============================================================== */}
              {/* TAB 2: حصة خاصة (Paid Private 1:1 Sessions with Alternatives) */}
              {/* =============================================================== */}
              {activeBookingTab === 'private' && (
                <div className="space-y-4">
                  {isLoadingOffers ? (
                    <div className="py-8 flex flex-col items-center justify-center gap-2 text-xs text-[#64748B]">
                      <Loader2 className="w-6 h-6 text-[#0D4E8B] animate-spin" />
                      <span>جاري تحميل مواعيد الحصص الخاصة...</span>
                    </div>
                  ) : availablePrivateDates.length > 0 ? (
                    <>
                      {/* Step 1: Available Days Strip */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-[#1F2A44]">
                            ١. اختر اليوم المتاح ({toArabicDigits(availablePrivateDates.length)} أيام):
                          </span>
                          <div className="flex items-center gap-1">
                            {availablePrivateDates.length > DAYS_WINDOW_SIZE && (
                              <>
                                <button
                                  type="button"
                                  disabled={privateDayWindowStart === 0}
                                  onClick={() =>
                                    setPrivateDayWindowStart((prev) => Math.max(0, prev - 1))
                                  }
                                  aria-label="الأيام السابقة"
                                  className="p-1 rounded-lg border border-[#E2E8F0] text-[#1F2A44] disabled:opacity-35 hover:bg-[#F8F9FC] cursor-pointer"
                                >
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    privateDayWindowStart + DAYS_WINDOW_SIZE >=
                                    availablePrivateDates.length
                                  }
                                  onClick={() =>
                                    setPrivateDayWindowStart((prev) =>
                                      Math.min(
                                        availablePrivateDates.length - DAYS_WINDOW_SIZE,
                                        prev + 1
                                      )
                                    )
                                  }
                                  aria-label="الأيام التالية"
                                  className="p-1 rounded-lg border border-[#E2E8F0] text-[#1F2A44] disabled:opacity-35 hover:bg-[#F8F9FC] cursor-pointer"
                                >
                                  <ChevronLeft className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => setShowPrivateMiniCalendar((prev) => !prev)}
                              className="px-2 py-1 rounded-lg border border-[#E2E8F0] bg-[#F8F9FC] hover:bg-[#F0F5FA] text-[11px] font-bold text-[#0D4E8B] flex items-center gap-1 cursor-pointer"
                            >
                              <Calendar className="w-3 h-3" />
                              <span>{showPrivateMiniCalendar ? 'إخفاء التقويم' : 'كل الأيام'}</span>
                            </button>
                          </div>
                        </div>

                        {showPrivateMiniCalendar && (
                          <div className="p-3 rounded-xl bg-[#F8F9FC] border border-[#D1DCFE] space-y-2">
                            <span className="text-[11px] font-bold text-[#0D4E8B] block">
                              أيام الحصص الخاصة المتاحة:
                            </span>
                            <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
                              {availablePrivateDates.map((dStr) => {
                                const info = formatSlotDateArabic(dStr);
                                const isSel = dStr === selectedPrivateDate;
                                return (
                                  <button
                                    key={dStr}
                                    type="button"
                                    onClick={() => handleSelectPrivateDay(dStr)}
                                    className={`p-2 rounded-lg border text-right text-[11px] font-bold transition-all cursor-pointer ${
                                      isSel
                                        ? 'bg-[#0D4E8B] text-white border-[#0D4E8B]'
                                        : 'bg-white text-[#1F2A44] border-[#E2E8F0] hover:border-[#0D4E8B]'
                                    }`}
                                  >
                                    <div className="truncate">{info.dayName}</div>
                                    <div
                                      className={`text-[10px] ${
                                        isSel ? 'text-blue-100' : 'text-[#64748B]'
                                      }`}
                                    >
                                      {info.shortDate}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                          {visiblePrivateDates.map((dateStr) => {
                            const info = formatSlotDateArabic(dateStr);
                            const count = (privateSlotsByDate.get(dateStr) || []).length;
                            const isSelected = dateStr === selectedPrivateDate;
                            return (
                              <button
                                key={dateStr}
                                type="button"
                                onClick={() => handleSelectPrivateDay(dateStr)}
                                className={`py-2 px-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                                  isSelected
                                    ? 'bg-[#0D4E8B] text-white border-[#0D4E8B] shadow-xs'
                                    : 'bg-[#F8F9FC] text-[#1F2A44] border-[#E2E8F0] hover:border-[#0D4E8B]/50'
                                }`}
                              >
                                <div className="font-['Cairo'] text-xs font-bold truncate">
                                  {info.dayName}
                                </div>
                                <div
                                  className={`text-[11px] font-medium ${
                                    isSelected ? 'text-blue-100' : 'text-[#535E7B]'
                                  }`}
                                >
                                  {info.shortDate}
                                </div>
                                <div
                                  className={`text-[10px] mt-0.5 font-bold ${
                                    isSelected ? 'text-[#FFC629]' : 'text-[#0D4E8B]'
                                  }`}
                                >
                                  {count === 1 ? 'موعد واحد' : `${toArabicDigits(count)} أوقات`}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Step 2: Compact Time Buttons for Selected Day */}
                      {selectedPrivateDate && (
                        <div className="space-y-2">
                          <span className="text-xs font-bold text-[#1F2A44] block">
                            ٢. اختر الوقت ({activeTimezoneLabel}):
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {(privateSlotsByDate.get(selectedPrivateDate) || []).map((slot) => {
                              const isSelected = slot.id === selectedPrivateSlotId;
                              return (
                                <button
                                  key={slot.id}
                                  type="button"
                                  onClick={() => handleSelectPrivateTime(slot)}
                                  className={`px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                    isSelected
                                      ? 'bg-[#F0F5FA] border-[#0D4E8B] text-[#0D4E8B] ring-1 ring-[#0D4E8B]'
                                      : 'bg-white border-[#E2E8F0] text-[#1F2A44] hover:border-[#0D4E8B]/50'
                                  }`}
                                >
                                  <Clock className="w-3.5 h-3.5 text-[#0D4E8B]" />
                                  <span>
                                    {formatTimeArabic12h(slot.startTime)} –{' '}
                                    {formatTimeArabic12h(slot.endTime)}
                                  </span>
                                  {isSelected && <Check className="w-3.5 h-3.5 text-[#0D4E8B]" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Step 3: Multi-Specialization Selector (if slot has >1 allowed specialization) + ONE Unified Summary */}
                      {selectedPrivateSlot &&
                        (() => {
                          const specs = Array.isArray(
                            selectedPrivateSlot.allowedSpecializations
                          )
                            ? selectedPrivateSlot.allowedSpecializations
                            : [];
                          const isMultiSpec = specs.length > 1;
                          const activeSpecId =
                            selectedSpecBySlotId[selectedPrivateSlot.id] ||
                            specs[0]?.id ||
                            '';
                          const activeSpec =
                            specs.find((s) => s.id === activeSpecId) || specs[0];
                          const chosenLabel = normalizeLegacyAgeGroupText(
                            activeSpec?.label || selectedPrivateSlot.specializationLabel
                          );
                          const dateInfo = formatSlotDateArabic(selectedPrivateSlot.slotDate);

                          return (
                            <div className="space-y-3">
                              {isMultiSpec && (
                                <div className="p-3 rounded-xl bg-[#F0F5FA]/70 border border-[#D1DCFE] space-y-2">
                                  <span className="text-xs font-bold text-[#0D4E8B] block">
                                    ٣. اختر التخصص المطلوب لهذا الموعد ({toArabicDigits(specs.length)} بدائل معتمدة):
                                  </span>
                                  <div className="space-y-1.5">
                                    {specs.map((sp) => {
                                      const isSelected = sp.id === activeSpecId;
                                      const normalizedLabel = normalizeLegacyAgeGroupText(
                                        sp.label
                                      );
                                      return (
                                        <button
                                          key={sp.id}
                                          type="button"
                                          onClick={() => {
                                            setSelectedSpecBySlotId((prev) => ({
                                              ...prev,
                                              [selectedPrivateSlot.id]: sp.id,
                                            }));
                                            trackBookingSlotSelected({
                                              tutorId: tutor.id,
                                              slotId: selectedPrivateSlot.id,
                                              bookingType: 'private_1on1',
                                              specializationId: sp.id,
                                            });
                                          }}
                                          className={`w-full text-right px-3 py-2 rounded-xl border text-xs font-bold transition-all flex items-center justify-between gap-2 cursor-pointer ${
                                            isSelected
                                              ? 'bg-white border-[#0D4E8B] text-[#0D4E8B] shadow-2xs'
                                              : 'bg-white/70 border-[#E2E8F0] text-[#1F2A44] hover:border-[#0D4E8B]/40'
                                          }`}
                                        >
                                          <span className="leading-snug">{normalizedLabel}</span>
                                          <span
                                            className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                                              isSelected
                                                ? 'border-[#0D4E8B] bg-[#0D4E8B] text-white'
                                                : 'border-slate-300 bg-white'
                                            }`}
                                          >
                                            {isSelected && <Check className="w-2.5 h-2.5" />}
                                          </span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <p className="text-[10px] text-[#535E7B] leading-relaxed">
                                    السعر والمدة المحددان ينطبقان على جميع بدائل هذا الموعد، وعند تأكيد الحجز يُخصّص الموعد بالكامل (١:١) للتخصص المختار.
                                  </p>
                                </div>
                              )}

                              {/* ONE Unified Summary Box */}
                              <div className="p-4 rounded-2xl bg-[#F8F9FC] border border-[#D1DCFE] space-y-3">
                                <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2">
                                  <span className="font-['Cairo'] text-xs font-extrabold text-[#0D4E8B]">
                                    ملخص طلب الحصة الخاصة (١:١)
                                  </span>
                                  <span className="text-xs font-extrabold text-[#1F2A44]">
                                    {toArabicDigits(selectedPrivateSlot.priceAmount)}{' '}
                                    {selectedPrivateSlot.currency} للحصة
                                  </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div>
                                    <span className="text-[11px] text-[#64748B] block">التاريخ:</span>
                                    <span className="font-bold text-[#1F2A44]">
                                      {dateInfo.dayName} {dateInfo.shortDate}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-[11px] text-[#64748B] block">الوقت:</span>
                                    <span className="font-bold text-[#0D4E8B]">
                                      {formatTimeArabic12h(selectedPrivateSlot.startTime)} –{' '}
                                      {formatTimeArabic12h(selectedPrivateSlot.endTime)}
                                    </span>
                                  </div>
                                  <div className="col-span-2">
                                    <span className="text-[11px] text-[#64748B] block">
                                      التخصص المختار:
                                    </span>
                                    <span className="font-bold text-[#1F2A44]">
                                      {chosenLabel}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-[11px] text-[#64748B] block">المدة:</span>
                                    <span className="font-bold text-[#1F2A44]">
                                      {toArabicDigits(selectedPrivateSlot.durationMinutes)} دقيقة (فردي ١:١)
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-[11px] text-[#64748B] block">السعر:</span>
                                    <span className="font-bold text-[#0D4E8B]">
                                      {toArabicDigits(selectedPrivateSlot.priceAmount)}{' '}
                                      {selectedPrivateSlot.currency} للحصة
                                    </span>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleBookPrivateSlot(selectedPrivateSlot)}
                                  className="w-full py-3 px-4 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white font-['Cairo'] font-extrabold text-xs sm:text-sm shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                                >
                                  <MessageCircle className="w-4 h-4" />
                                  <span>إرسال طلب حجز الحصة الخاصة</span>
                                </button>

                                <p className="text-[11px] text-[#535E7B] leading-relaxed text-center">
                                  التواصل عبر واتساب هو طلب تنسيق، ولا يُعتبر الموعد مؤكدًا إلا بعد تأكيد الإدارة.
                                </p>
                              </div>
                            </div>
                          );
                        })()}
                    </>
                  ) : (
                    /* Honest Empty State for Private 1:1 Slots */
                    <div className="p-4 rounded-2xl bg-[#F8F9FC] border border-[#E2E8F0] text-center space-y-3">
                      <div className="w-10 h-10 rounded-full bg-blue-50 text-[#0D4E8B] flex items-center justify-center mx-auto">
                        <Clock className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-['Cairo'] text-xs sm:text-sm font-bold text-[#1F2A44]">
                          لا توجد مواعيد حصص خاصة مضافة حاليًا
                        </h3>
                        <p className="text-xs text-[#535E7B] leading-relaxed">
                          السعر المعتمد للمعلم: {sessionPriceText}. يمكنك طلب تنسيق جدول حصص خاصة فردية مباشرة عبر إدارة شاطر.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleRequestAdminCoordination(
                            `طلب تنسيق مواعيد حصص خاصة فردية (1:1) مع ${tutor.honorific} ${tutor.name}`
                          )
                        }
                        className="w-full py-2.5 px-4 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white font-['Cairo'] font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>طلب تنسيق حصة خاصة عبر الإدارة</span>
                      </button>
                      <p className="text-[11px] text-[#64748B]">
                        التواصل عبر واتساب هو طلب تنسيق، ولا يُعتبر الموعد مؤكدًا إلا بعد تأكيد الإدارة.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* =============================================================== */}
              {/* TAB 3: مجموعات (Small Educational Groups) */}
              {/* =============================================================== */}
              {activeBookingTab === 'groups' && (
                <div className="space-y-3">
                  {isLoadingOffers ? (
                    <div className="py-8 flex flex-col items-center justify-center gap-2 text-xs text-[#64748B]">
                      <Loader2 className="w-6 h-6 text-[#0D4E8B] animate-spin" />
                      <span>جاري تحميل المجموعات المتاحة...</span>
                    </div>
                  ) : publicGroups.length > 0 ? (
                    <div className="space-y-3 max-h-[480px] overflow-y-auto pr-0.5">
                      {publicGroups.map((group) => {
                        const remainingSeats =
                          group.remainingSeats !== undefined
                            ? group.remainingSeats
                            : Math.max(0, group.maxStudents - group.enrolledStudents);
                        const groupPriceLabel = formatGroupPriceSummary(group).combinedText;

                        return (
                          <div
                            key={group.id}
                            className="p-4 rounded-2xl bg-[#F8F9FC] border border-[#E2E8F0] space-y-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h3 className="font-['Cairo'] text-xs sm:text-sm font-extrabold text-[#1F2A44]">
                                  {group.title}
                                </h3>
                                <p className="text-xs font-bold text-[#0D4E8B] mt-0.5">
                                  {normalizeLegacyAgeGroupText(group.specializationLabel)}
                                </p>
                              </div>
                              <span className="font-['Cairo'] text-xs font-extrabold text-[#0D4E8B] bg-white px-2.5 py-1 rounded-lg border border-[#D1DCFE] shrink-0">
                                {groupPriceLabel}
                              </span>
                            </div>

                            {group.description && (
                              <p className="text-[11px] text-[#535E7B] leading-relaxed">
                                {group.description}
                              </p>
                            )}

                            <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-white border border-[#E2E8F0] text-[11px]">
                              <div>
                                <span className="text-[#64748B] block">تاريخ البداية وعدد الحصص:</span>
                                <span className="font-bold text-[#1F2A44]">
                                  {toArabicDigits(group.startDate)} ({toArabicDigits(group.sessionsCount)} حصص)
                                </span>
                              </div>
                              <div>
                                <span className="text-[#64748B] block">الجدول المختصر:</span>
                                <span className="font-bold text-[#1F2A44]">
                                  {toArabicDigits(group.weeklyScheduleSummary)}
                                </span>
                              </div>
                              <div>
                                <span className="text-[#64748B] block">نوع السعر:</span>
                                <span className="font-bold text-[#0D4E8B]">
                                  {group.priceType === 'per_session'
                                    ? 'سعر للحصة الواحدة'
                                    : 'سعر للباقة الكاملة'}
                                </span>
                              </div>
                              <div>
                                <span className="text-[#64748B] block">المقاعد المتبقية:</span>
                                <span className="font-bold text-emerald-700">
                                  متبقي {toArabicDigits(remainingSeats)} من {toArabicDigits(group.maxStudents)} مقاعد
                                </span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleBookGroup(group)}
                              className="w-full py-2.5 px-4 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white font-['Cairo'] font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>طلب حجز مقعد عبر واتساب</span>
                            </button>
                          </div>
                        );
                      })}
                      <p className="text-[11px] text-[#64748B] text-center">
                        التواصل عبر واتساب هو طلب تنسيق، ولا يُعتبر المقعد مؤكدًا إلا بعد تأكيد الإدارة.
                      </p>
                    </div>
                  ) : (
                    /* Honest Empty State for Groups */
                    <div className="p-4 rounded-2xl bg-[#F8F9FC] border border-[#E2E8F0] text-center space-y-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 text-[#535E7B] flex items-center justify-center mx-auto">
                        <Users className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-['Cairo'] text-xs sm:text-sm font-bold text-[#1F2A44]">
                          لا توجد مجموعات مفتوحة حاليًا لهذا المعلم
                        </h3>
                        <p className="text-xs text-[#535E7B] leading-relaxed">
                          يمكنك بدء تجربة مجانية فردية ({toArabicDigits(tutor.trialDurationMinutes || 20)} دقيقة) أو طلب إبلاغك عند فتح مجموعة جديدة عبر الإدارة.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleRequestAdminCoordination(
                            `طلب التسجيل في مجموعة تعليمية مع ${tutor.honorific} ${tutor.name}`,
                            'group'
                          )
                        }
                        className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white font-['Cairo'] font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>طلب تنسيق مجموعة عبر الإدارة</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

            </section>
          </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MOBILE STICKY BOTTOM BAR (Rendered via Portal into document.body) */}
      {/* ========================================================================= */}
      {typeof document !== 'undefined' &&
        createPortal(
          <div
            dir="rtl"
            className={`lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E2E8F0] px-4 py-2.5 shadow-lg flex items-center justify-between gap-3 transition-transform duration-200 ${
              isTrialCardVisible ? 'translate-y-full' : 'translate-y-0'
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="font-['Cairo'] font-extrabold text-sm text-[#1F2A44] truncate">
                {profilePrice.priceText} <span className="font-normal text-[#64748B]">/ {profilePrice.durationText}</span>
              </div>
              <div className="text-xs font-bold text-emerald-700 truncate">أول تجربة مجانًا</div>
            </div>

            <button
              type="button"
              onClick={() => (profileCanBookDirect ? goToTrialBooking() : openTrialWhatsAppModal())}
              className="shrink-0 min-h-[48px] py-2.5 px-5 rounded-2xl bg-[#FFC629] hover:bg-[#F0B517] text-[#1F2A44] font-['Cairo'] font-extrabold text-sm shadow-xs active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              {profileCanBookDirect ? <CalendarCheck2 className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
              <span>{profileCanBookDirect ? 'احجز تجربة مجانية' : 'تنسيق التجربة'}</span>
            </button>
          </div>,
          document.body
        )}

      {/* Modals */}
      <VideoModal
        tutor={tutor}
        isOpen={isVideoModalOpen}
        onClose={() => setIsVideoModalOpen(false)}
        onBookTrial={openTrialWhatsAppModal}
      />

      <WhatsAppNoticeModal
        payload={bookingPayload}
        customWhatsAppUrl={modalContext?.customWhatsAppUrl}
        requestType={modalContext?.requestType || 'trial'}
        track={modalContext?.track ?? (detectedTrack as 'school' | 'quran')}
        tutorId={tutor.id}
        tutor={tutor}
        isPreview={isPreviewMode || isUnpublishedProfile}
        courseOptionId={
          modalContext ? modalContext.courseOptionId : isSchool ? criteria?.courseOptionId || null : null
        }
        quranAgeGroupId={
          modalContext ? modalContext.quranAgeGroupId : !isSchool ? criteria?.ageGroupId || null : null
        }
        quranLevelId={
          modalContext ? modalContext.quranLevelId : !isSchool ? criteria?.levelId || null : null
        }
        whatsappAnalyticsSource={modalContext?.whatsappAnalyticsSource || 'trial_booking_modal'}
        isOpen={isWhatsAppModalOpen}
        onClose={() => setIsWhatsAppModalOpen(false)}
      />
    </div>
  );
};
