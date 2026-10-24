import React, { useState, useEffect, useMemo } from 'react';
import {
  Tutor,
  SearchCriteria,
  TutorAvailableSlot,
  TutorPrivateSlot,
  TutorGroup,
} from '../types';
import { DataService } from '../services/dataService';
import { VideoModal } from './VideoModal';
import { WhatsAppNoticeModal } from './WhatsAppNoticeModal';
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
} from 'lucide-react';

interface TutorProfileViewProps {
  tutor: Tutor;
  criteria?: SearchCriteria;
  onBack: () => void;
  stageName?: string;
  gradeName?: string;
  subjectName?: string;
  curriculumName?: string;
  quranAgeName?: string;
  quranLevelName?: string;
}

type BookingTabType = 'trial' | 'private' | 'groups';

export const TutorProfileView: React.FC<TutorProfileViewProps> = ({
  tutor,
  criteria,
  onBack,
  stageName,
  gradeName,
  subjectName,
  curriculumName,
  quranAgeName,
  quranLevelName,
}) => {
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [isBioExpanded, setIsBioExpanded] = useState(false);

  // Active tab in the compact booking widget
  const [activeBookingTab, setActiveBookingTab] = useState<BookingTabType>('trial');

  // Trial slots state (strictly real future available slots)
  const [rawTrialSlots, setRawTrialSlots] = useState<TutorAvailableSlot[]>([]);
  const [isLoadingTrialSlots, setIsLoadingTrialSlots] = useState(true);
  const [selectedTrialDate, setSelectedTrialDate] = useState<string>('');
  const [selectedTrialSlotId, setSelectedTrialSlotId] = useState<string>('');
  const [trialDayWindowStart, setTrialDayWindowStart] = useState<number>(0);
  const [showTrialMiniCalendar, setShowTrialMiniCalendar] = useState<boolean>(false);

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

  const hasRealVideo = Boolean(tutor.videoPreview?.available);

  // Filter strictly valid future available trial slots (no fabricated fallback slots)
  const validTrialSlots = useMemo(
    () => filterValidAvailableTrialSlots(rawTrialSlots),
    [rawTrialSlots]
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

  // Fetch Trial Slots
  useEffect(() => {
    let isMounted = true;
    setIsLoadingTrialSlots(true);
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
    return () => {
      isMounted = false;
    };
  }, [tutor.id]);

  // Initialize earliest trial date & first slot automatically when validTrialSlots load
  useEffect(() => {
    if (availableTrialDates.length > 0) {
      const firstDate = availableTrialDates[0];
      setSelectedTrialDate(firstDate);
      setTrialDayWindowStart(0);
      const firstDaySlots = trialSlotsByDate.get(firstDate) || [];
      if (firstDaySlots.length > 0) {
        setSelectedTrialSlotId(firstDaySlots[0].id);
      }
    } else {
      setSelectedTrialDate('');
      setSelectedTrialSlotId('');
    }
  }, [availableTrialDates, trialSlotsByDate]);

  // Fetch Private Slots & Groups
  useEffect(() => {
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
  }, [tutor.id, subjectName, gradeName, quranLevelName]);

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
  const detectedTrack =
    criteria?.track ||
    (tutor.offerings.some((o) => o.track === 'school') ? 'school' : 'quran');
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
      setSelectedTrialSlotId(firstSlot.id);
      trackTrialSlotSelected(tutor.id, firstSlot.id);
    }
  };

  const handleSelectTrialTime = (slot: TutorAvailableSlot) => {
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

  const handleBookPrivateSlot = (slot: TutorPrivateSlot) => {
    trackWhatsAppClicked('private_slot_booking');
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
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleBookGroup = (group: TutorGroup) => {
    trackBookingSlotSelected({
      tutorId: tutor.id,
      groupId: group.id,
      bookingType: 'group',
    });
    trackWhatsAppClicked('group_class_booking');
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
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleRequestAdminCoordination = (contextNote: string) => {
    trackWhatsAppClicked('profile_empty_slot_coordination');
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
    window.open(url, '_blank', 'noopener,noreferrer');
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

  // Bio text combination without fabrication
  const primaryBioText = (tutor.helpChildSummary || tutor.helpChildQuote || '').trim();
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

  return (
    <div className="w-full pb-24 lg:pb-16 animate-fade-in">
      {/* Top Breadcrumb & Back Bar */}
      <div className="w-full py-3 mb-4 sm:mb-6 border-b border-[#E2E8F0] bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between flex-wrap gap-2 text-xs sm:text-sm">
          <div className="flex items-center gap-2 flex-wrap text-[#535E7B]">
            <button
              type="button"
              onClick={onBack}
              className="text-[#0D4E8B] hover:text-[#003767] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" />
              <span>{hasCriteria ? 'العودة إلى نتائج البحث' : 'العودة لاختيار معلم'}</span>
            </button>
            <span className="text-slate-300">/</span>
            <span className="font-bold text-[#1F2A44]">
              {specializationInfo.primaryLabel}
            </span>
            {specializationInfo.secondaryLabel && (
              <>
                <span className="text-slate-300">•</span>
                <span className="text-[#535E7B]">{specializationInfo.secondaryLabel}</span>
              </>
            )}
          </div>

          <span className="text-[11px] font-bold text-[#0D4E8B] bg-[#F0F5FA] px-2.5 py-1 rounded-lg border border-[#D1DCFE]">
            ملف المعلم المعتمد
          </span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {/* ========================================================================= */}
        {/* 1. CONCISE PROFILE HEADER (رأس ملف مختصر يجمع العناصر الأساسية للقرار) */}
        {/* ========================================================================= */}
        <section
          aria-label="ملخص المعلم"
          className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-[#E2E8F0] shadow-xs"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            {/* Right side: Avatar, Name, Specialization, Headline, Badges */}
            <div className="flex items-start gap-3.5 sm:gap-5 flex-1 min-w-0">
              <div className="relative shrink-0">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden bg-[#F0F5FA] border-2 border-[#E2E8F0] flex items-center justify-center text-[#0D4E8B] text-xl sm:text-2xl font-bold font-['Cairo']">
                  {tutor.avatarUrl ? (
                    <img
                      src={tutor.avatarUrl}
                      alt={`${tutor.honorific} ${tutor.name}`}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <span>{tutor.name.charAt(0)}</span>
                  )}
                </div>
                {tutor.verifiedCredentials && (
                  <span
                    className="absolute -bottom-1 -left-1 w-6 h-6 rounded-full bg-[#0D4E8B] text-white flex items-center justify-center shadow-xs border-2 border-white"
                    title="تمت مراجعة المؤهلات"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-['Cairo'] text-lg sm:text-2xl font-extrabold text-[#1F2A44] leading-snug">
                    {tutor.honorific} {tutor.name}
                  </h1>

                  {/* Verified Credentials Badge: strictly only when verifiedCredentials === true */}
                  {tutor.verifiedCredentials && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>تمت مراجعة المؤهلات</span>
                    </span>
                  )}

                  {/* Honest Rating or New Badge without star */}
                  {hasValidReviews ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-bold">
                      <Star className="w-3 h-3 fill-[#FFC629] text-[#FFC629]" />
                      <span>{tutor.rating?.toFixed(1)}</span>
                      <span className="text-[#64748B] font-normal">({tutor.reviewsCount})</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-[#535E7B] text-[11px] font-bold">
                      جديد على شاطر
                    </span>
                  )}
                </div>

                {/* Approved Specialization & Age Group / Grade */}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="inline-flex items-center gap-1 font-bold text-[#0D4E8B] bg-[#F0F5FA] px-2.5 py-0.5 rounded-md border border-[#D1DCFE]">
                    <BookOpen className="w-3.5 h-3.5 shrink-0" />
                    <span>{specializationInfo.primaryLabel}</span>
                  </span>
                  {specializationInfo.secondaryLabel && (
                    <span className="inline-flex items-center font-bold text-[#1F2A44] bg-[#F8F9FC] px-2.5 py-0.5 rounded-md border border-[#E2E8F0]">
                      {specializationInfo.secondaryLabel}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 font-medium text-[#535E7B] bg-[#F8F9FC] px-2.5 py-0.5 rounded-md border border-[#E2E8F0]">
                    <Clock className="w-3 h-3 text-[#0D4E8B] shrink-0" />
                    <span>{experienceText}</span>
                  </span>
                </div>

                {/* Descriptive Headline */}
                <p className="text-xs sm:text-sm font-bold text-[#1F2A44] leading-relaxed pt-0.5">
                  {descriptiveHeadline}
                </p>
              </div>
            </div>

            {/* Left side: Clear Session Price + Primary Trial CTA */}
            <div className="pt-3 lg:pt-0 border-t lg:border-t-0 lg:border-r border-[#E2E8F0] lg:pr-6 flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end justify-between gap-3 shrink-0">
              <div className="text-right lg:text-left space-y-0.5">
                <span className="text-[11px] text-[#64748B] block">سعر الحصة الخاصة (1:1)</span>
                <div className="font-['Cairo'] text-sm sm:text-base font-extrabold text-[#1F2A44]">
                  {sessionPriceText}
                </div>
                <span className="text-[11px] font-bold text-emerald-700 block">
                  التجربة الأولى مجانًا — {tutor.trialDurationMinutes || 20} دقيقة
                </span>
              </div>

              <button
                type="button"
                onClick={() => scrollToBookingSection('trial')}
                className="py-2.5 px-5 rounded-xl bg-[#FFC629] hover:bg-[#F0B517] text-[#1F2A44] font-['Cairo'] font-extrabold text-xs sm:text-sm shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>اطلب تجربة مجانية</span>
                <span className="text-[11px] font-bold bg-[#1F2A44]/10 px-2 py-0.5 rounded-md">
                  {tutor.trialDurationMinutes || 20} دقيقة
                </span>
              </button>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* MAIN 2-COLUMN RESPONSIVE GRID */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ===================================================================== */}
          {/* RIGHT COLUMN: DECISION SECTIONS (عن المعلم • طريقة التدريس • المؤهلات) */}
          {/* ===================================================================== */}
          <div className="lg:col-span-7 space-y-5 order-2 lg:order-1">
            {/* SECTION 1: عن المعلم (About the Tutor & Approved Specializations) */}
            <section
              aria-label="عن المعلم"
              className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 border border-[#E2E8F0] shadow-xs space-y-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-['Cairo'] text-base sm:text-lg font-extrabold text-[#0D4E8B] flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-[#0D4E8B]" />
                  <span>عن المعلم</span>
                </h2>
                {academicDegree && (
                  <span className="text-[11px] font-medium text-[#535E7B] bg-[#F8F9FC] px-2.5 py-1 rounded-lg border border-[#E2E8F0]">
                    {academicDegree}
                  </span>
                )}
              </div>

              {/* Tutor's own words preserved without italic distortion */}
              {primaryBioText && (
                <div className="text-xs sm:text-sm text-[#1F2A44] leading-relaxed space-y-2">
                  <p>
                    {isBioExpanded || primaryBioText.length <= 180
                      ? primaryBioText
                      : `${primaryBioText.slice(0, 180).trim()}...`}
                  </p>

                  {isBioExpanded && secondaryBioText && (
                    <p className="text-[#535E7B] pt-1">{secondaryBioText}</p>
                  )}

                  {isBioExpanded &&
                    tutor.targetStudentCases &&
                    tutor.targetStudentCases.length > 0 && (
                      <div className="pt-2 space-y-1.5">
                        <span className="text-xs font-bold text-[#0D4E8B] block">
                          الحالات التعليمية التي يركز عليها المعلم:
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {tutor.targetStudentCases.map((c, idx) => (
                            <div
                              key={idx}
                              className="flex items-start gap-1.5 text-xs text-[#1F2A44] bg-[#F8F9FC] p-2.5 rounded-xl border border-[#E2E8F0]"
                            >
                              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                              <span>{normalizeLegacyAgeGroupText(c)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {hasExpandableBio && (
                    <button
                      type="button"
                      onClick={() => setIsBioExpanded((prev) => !prev)}
                      className="text-xs font-bold text-[#0D4E8B] hover:underline inline-flex items-center gap-1 pt-1 cursor-pointer"
                    >
                      <span>{isBioExpanded ? 'عرض أقل' : 'اقرأ المزيد'}</span>
                      {isBioExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              )}

              {/* Approved Specializations & Suitable Ages/Grades */}
              {tutor.subjectsTaughtSummary && tutor.subjectsTaughtSummary.length > 0 && (
                <div className="pt-3 border-t border-[#F2F3F6] space-y-2.5">
                  <h3 className="font-['Cairo'] text-xs sm:text-sm font-bold text-[#1F2A44]">
                    التخصصات والفئات العمرية / الصفوف المعتمدة:
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {tutor.subjectsTaughtSummary.map((item, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-[#F8F9FC] border border-[#E2E8F0] flex flex-col justify-between gap-2"
                      >
                        <div>
                          <div className="font-['Cairo'] text-xs sm:text-sm font-bold text-[#1F2A44]">
                            {normalizeLegacyAgeGroupText(item.title)}
                          </div>
                          {item.curriculumNote && (
                            <p className="text-[11px] text-[#535E7B] mt-0.5 leading-relaxed">
                              {normalizeLegacyAgeGroupText(item.curriculumNote)}
                            </p>
                          )}
                        </div>
                        {item.gradesRange && (
                          <div>
                            <span className="inline-block px-2 py-0.5 rounded-md bg-white border border-[#E2E8F0] text-[#0D4E8B] font-bold text-[11px]">
                              {normalizeLegacyAgeGroupText(item.gradesRange)}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Conditional Video Preview (only when real videoUrl exists) */}
              {hasRealVideo && (
                <div className="pt-3 border-t border-[#F2F3F6]">
                  <div className="p-3.5 rounded-xl bg-[#F0F5FA] border border-[#D1DCFE] flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#0D4E8B] text-[#FFC629] flex items-center justify-center shrink-0">
                        <Play className="w-4 h-4 fill-[#FFC629]" />
                      </div>
                      <div>
                        <h4 className="font-['Cairo'] text-xs sm:text-sm font-bold text-[#0D4E8B]">
                          فيديو تعريفي للمعلم
                        </h4>
                        {tutor.videoPreview?.description && (
                          <p className="text-[11px] text-[#535E7B]">
                            {tutor.videoPreview.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsVideoModalOpen(true)}
                      className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-[#0D4E8B] hover:text-white text-[#0D4E8B] text-xs font-bold border border-[#CBD5E1] transition-colors cursor-pointer"
                    >
                      مشاهدة الفيديو
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* SECTION 2: طريقة التدريس (Teaching Methodology & Trial Session Goal) */}
            <section
              aria-label="طريقة التدريس"
              className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 border border-[#E2E8F0] shadow-xs space-y-4"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="font-['Cairo'] text-base sm:text-lg font-extrabold text-[#0D4E8B] flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-[#0D4E8B]" />
                  <span>طريقة التدريس</span>
                </h2>
                <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
                  تقييم المستوى خلال التجربة المجانية
                </span>
              </div>

              {tutor.methodologyPillars && tutor.methodologyPillars.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {tutor.methodologyPillars.map((pillar, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-[#F8F9FC] border border-[#E2E8F0] space-y-1"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-md bg-[#0D4E8B] text-white flex items-center justify-center text-[11px] font-bold">
                          {idx + 1}
                        </span>
                        <h3 className="font-['Cairo'] text-xs sm:text-sm font-bold text-[#1F2A44]">
                          {pillar.title}
                        </h3>
                      </div>
                      <p className="text-xs text-[#535E7B] leading-relaxed">
                        {pillar.description}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* What happens in the 20-min free trial */}
              {tutor.whatHappensInTrial && tutor.whatHappensInTrial.length > 0 && (
                <div className="pt-3 border-t border-[#F2F3F6] space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-['Cairo'] text-xs sm:text-sm font-bold text-[#1F2A44]">
                      ماذا يحدث في التجربة المجانية ({tutor.trialDurationMinutes || 20} دقيقة)؟
                    </h3>
                  </div>
                  <p className="text-xs text-[#535E7B] leading-relaxed">
                    العمر أو الصف يحدد الفئة المناسبة، وتساعد الحصة التجريبية على تقييم المستوى الفعلي للطفل ووضع خطة تناسبه قبل أي التزام مالي.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                    {tutor.whatHappensInTrial.map((step) => (
                      <div
                        key={step.stepNumber}
                        className="p-3 rounded-xl bg-[#F8F9FC] border border-[#E2E8F0] space-y-1"
                      >
                        <div className="font-['Cairo'] text-xs font-bold text-[#0D4E8B]">
                          {step.stepNumber}. {step.title}
                        </div>
                        <p className="text-[11px] text-[#535E7B] leading-relaxed">
                          {step.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* SECTION 3: المؤهلات (Qualifications & Experience) */}
            <section
              aria-label="المؤهلات"
              className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 border border-[#E2E8F0] shadow-xs space-y-4"
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="font-['Cairo'] text-base sm:text-lg font-extrabold text-[#0D4E8B] flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-[#0D4E8B]" />
                  <span>المؤهلات</span>
                </h2>
                <span className="text-xs font-bold text-[#1F2A44] bg-[#F8F9FC] px-2.5 py-1 rounded-lg border border-[#E2E8F0]">
                  {experienceText}
                </span>
              </div>

              {tutor.qualifications && tutor.qualifications.length > 0 ? (
                <div className="space-y-2.5">
                  {tutor.qualifications.map((q, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-[#F8F9FC] border border-[#E2E8F0] flex items-start gap-2.5"
                    >
                      <span className="w-5 h-5 rounded-full bg-[#0D4E8B]/10 text-[#0D4E8B] flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3 h-3" />
                      </span>
                      <div className="space-y-0.5">
                        <h3 className="font-['Cairo'] text-xs sm:text-sm font-bold text-[#1F2A44]">
                          {q.title}
                        </h3>
                        {q.institution && (
                          <p className="text-xs text-[#0D4E8B] font-medium">{q.institution}</p>
                        )}
                        {q.notes && (
                          <p className="text-[11px] text-[#64748B] leading-relaxed">{q.notes}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#535E7B]">
                  {academicDegree || 'معلم معتمد في منصة شاطر كلاسيز.'}
                </p>
              )}
            </section>
          </div>

          {/* ===================================================================== */}
          {/* LEFT COLUMN: COMPACT BOOKING WIDGET (المواعيد والمجموعات) */}
          {/* ===================================================================== */}
          <div
            id="booking-widget-section"
            className="lg:col-span-5 lg:sticky lg:top-24 space-y-4 order-1 lg:order-2 scroll-mt-20"
          >
            <section
              aria-label="المواعيد والمجموعات"
              className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-[#E2E8F0] shadow-sm space-y-4"
            >
              {/* Section Header + Timezone Indicator */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="font-['Cairo'] text-base sm:text-lg font-extrabold text-[#1F2A44] flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-[#0D4E8B]" />
                  <span>المواعيد والمجموعات</span>
                </h2>
                <span className="text-[11px] font-bold text-[#0D4E8B] bg-[#F0F5FA] px-2.5 py-1 rounded-lg border border-[#D1DCFE]">
                  {activeTimezoneLabel}
                </span>
              </div>

              {/* 3 Clear Tabs: تجربة مجانية | حصة خاصة | مجموعات */}
              <div
                role="tablist"
                aria-label="خيارات الحجز"
                className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#F8F9FC] border border-[#E2E8F0]"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeBookingTab === 'trial'}
                  onClick={() => setActiveBookingTab('trial')}
                  className={`py-2 px-2 rounded-lg font-['Cairo'] text-xs font-bold transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                    activeBookingTab === 'trial'
                      ? 'bg-[#0D4E8B] text-white shadow-xs'
                      : 'text-[#535E7B] hover:text-[#1F2A44]'
                  }`}
                >
                  <span>تجربة مجانية</span>
                  <span
                    className={`text-[10px] ${
                      activeBookingTab === 'trial' ? 'text-[#FFC629]' : 'text-emerald-700'
                    }`}
                  >
                    {tutor.trialDurationMinutes || 20} دقيقة
                  </span>
                </button>

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
                    {validPrivateSlots.length > 0 ? `${validPrivateSlots.length} موعد` : 'فردي 1:1'}
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
                    {publicGroups.length > 0 ? `${publicGroups.length} متاحة` : 'صغيرة'}
                  </span>
                </button>
              </div>

              {/* =============================================================== */}
              {/* TAB 1: تجربة مجانية (Free 20-Minute Trial Session) */}
              {/* =============================================================== */}
              {activeBookingTab === 'trial' && (
                <div className="space-y-4">
                  {isLoadingTrialSlots ? (
                    <div className="py-8 flex flex-col items-center justify-center gap-2 text-xs text-[#64748B]">
                      <Loader2 className="w-6 h-6 text-[#0D4E8B] animate-spin" />
                      <span>جاري تحميل المواعيد التجريبية المتاحة...</span>
                    </div>
                  ) : availableTrialDates.length > 0 ? (
                    <>
                      {/* Step 1: Available Days Strip + Next/Prev + Mini Calendar Toggle */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-[#1F2A44]">
                            ١. اختر اليوم المتاح ({availableTrialDates.length} أيام):
                          </span>
                          <div className="flex items-center gap-1">
                            {availableTrialDates.length > DAYS_WINDOW_SIZE && (
                              <>
                                <button
                                  type="button"
                                  disabled={trialDayWindowStart === 0}
                                  onClick={() =>
                                    setTrialDayWindowStart((prev) => Math.max(0, prev - 1))
                                  }
                                  aria-label="الأيام السابقة"
                                  className="p-1 rounded-lg border border-[#E2E8F0] text-[#1F2A44] disabled:opacity-35 hover:bg-[#F8F9FC] cursor-pointer"
                                >
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    trialDayWindowStart + DAYS_WINDOW_SIZE >=
                                    availableTrialDates.length
                                  }
                                  onClick={() =>
                                    setTrialDayWindowStart((prev) =>
                                      Math.min(
                                        availableTrialDates.length - DAYS_WINDOW_SIZE,
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
                              onClick={() => setShowTrialMiniCalendar((prev) => !prev)}
                              className="px-2 py-1 rounded-lg border border-[#E2E8F0] bg-[#F8F9FC] hover:bg-[#F0F5FA] text-[11px] font-bold text-[#0D4E8B] flex items-center gap-1 cursor-pointer"
                            >
                              <Calendar className="w-3 h-3" />
                              <span>{showTrialMiniCalendar ? 'إخفاء التقويم' : 'كل الأيام'}</span>
                            </button>
                          </div>
                        </div>

                        {/* Compact Mini Calendar Picker (All Available Dates) */}
                        {showTrialMiniCalendar && (
                          <div className="p-3 rounded-xl bg-[#F8F9FC] border border-[#D1DCFE] space-y-2">
                            <span className="text-[11px] font-bold text-[#0D4E8B] block">
                              الأيام المتاحة في جدول المعلم:
                            </span>
                            <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
                              {availableTrialDates.map((dStr) => {
                                const info = formatSlotDateArabic(dStr);
                                const isSel = dStr === selectedTrialDate;
                                return (
                                  <button
                                    key={dStr}
                                    type="button"
                                    onClick={() => handleSelectTrialDay(dStr)}
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

                        {/* Horizontal Day Pills */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                          {visibleTrialDates.map((dateStr) => {
                            const info = formatSlotDateArabic(dateStr);
                            const count = (trialSlotsByDate.get(dateStr) || []).length;
                            const isSelected = dateStr === selectedTrialDate;
                            return (
                              <button
                                key={dateStr}
                                type="button"
                                onClick={() => handleSelectTrialDay(dateStr)}
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
                                    isSelected ? 'text-[#FFC629]' : 'text-emerald-700'
                                  }`}
                                >
                                  {count === 1 ? 'موعد واحد' : `${count} أوقات`}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Step 2: Compact Time Buttons for Selected Day */}
                      {selectedTrialDate && (
                        <div className="space-y-2">
                          <span className="text-xs font-bold text-[#1F2A44] block">
                            ٢. اختر الوقت المناسب ({activeTimezoneLabel}):
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {(trialSlotsByDate.get(selectedTrialDate) || []).map((slot) => {
                              const isSelected = slot.id === selectedTrialSlotId;
                              return (
                                <button
                                  key={slot.id}
                                  type="button"
                                  onClick={() => handleSelectTrialTime(slot)}
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

                      {/* Step 3: ONE Unified Booking Summary Box */}
                      {selectedTrialSlot && selectedTrialSlotPayload && (
                        <div className="p-4 rounded-2xl bg-[#F8F9FC] border border-[#D1DCFE] space-y-3">
                          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2">
                            <span className="font-['Cairo'] text-xs font-extrabold text-[#0D4E8B]">
                              ملخص طلب التجربة المجانية
                            </span>
                            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                              مجانًا — ٠ ج.م
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-[11px] text-[#64748B] block">التاريخ:</span>
                              <span className="font-bold text-[#1F2A44]">
                                {selectedTrialSlotPayload.dayName} {selectedTrialSlotPayload.date}
                              </span>
                            </div>
                            <div>
                              <span className="text-[11px] text-[#64748B] block">الوقت:</span>
                              <span className="font-bold text-[#0D4E8B]">
                                {selectedTrialSlotPayload.timeRange}
                              </span>
                            </div>
                            <div>
                              <span className="text-[11px] text-[#64748B] block">التخصص:</span>
                              <span className="font-bold text-[#1F2A44]">
                                {specializationInfo.primaryLabel}
                                {specializationInfo.secondaryLabel
                                  ? ` (${specializationInfo.secondaryLabel})`
                                  : ''}
                              </span>
                            </div>
                            <div>
                              <span className="text-[11px] text-[#64748B] block">المدة والسعر:</span>
                              <span className="font-bold text-emerald-700">
                                {tutor.trialDurationMinutes || 20} دقيقة • مجانًا
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => setIsWhatsAppModalOpen(true)}
                            className="w-full py-3 px-4 rounded-xl bg-[#FFC629] hover:bg-[#F0B517] text-[#1F2A44] font-['Cairo'] font-extrabold text-xs sm:text-sm shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <MessageCircle className="w-4 h-4 text-[#1F2A44]" />
                            <span>إرسال طلب التجربة عبر واتساب</span>
                          </button>

                          <p className="text-[11px] text-[#535E7B] leading-relaxed text-center">
                            التواصل عبر واتساب هو طلب تنسيق، ولا يُعتبر الموعد مؤكدًا إلا بعد تأكيد الإدارة.
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    /* Honest Empty State when no trial slots exist */
                    <div className="p-4 rounded-2xl bg-[#F8F9FC] border border-[#E2E8F0] text-center space-y-3">
                      <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center mx-auto">
                        <Calendar className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-['Cairo'] text-xs sm:text-sm font-bold text-[#1F2A44]">
                          لا توجد مواعيد تجريبية مضافة حاليًا
                        </h3>
                        <p className="text-xs text-[#535E7B] leading-relaxed">
                          يمكنك إرسال طلب تنسيق عبر إدارة شاطر لتحديد أقرب موعد تجربة مجانية ({tutor.trialDurationMinutes || 20} دقيقة) يناسب جدولكم مع المعلم.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsWhatsAppModalOpen(true)}
                        className="w-full py-2.5 px-4 rounded-xl bg-[#FFC629] hover:bg-[#F0B517] text-[#1F2A44] font-['Cairo'] font-extrabold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>طلب تنسيق تجربة مجانية عبر الإدارة</span>
                      </button>
                      <p className="text-[11px] text-[#64748B]">
                        التواصل عبر واتساب هو طلب تنسيق، ولا يُعتبر الموعد مؤكدًا إلا بعد تأكيد الإدارة.
                      </p>
                    </div>
                  )}
                </div>
              )}

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
                            ١. اختر اليوم المتاح ({availablePrivateDates.length} أيام):
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
                                  {count === 1 ? 'موعد واحد' : `${count} أوقات`}
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
                                    ٣. اختر التخصص المطلوب لهذا الموعد ({specs.length} بدائل معتمدة):
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
                                    السعر والمدة المحددان ينطبقان على جميع بدائل هذا الموعد، وعند تأكيد الحجز يُخصّص الموعد بالكامل (1:1) للتخصص المختار.
                                  </p>
                                </div>
                              )}

                              {/* ONE Unified Summary Box */}
                              <div className="p-4 rounded-2xl bg-[#F8F9FC] border border-[#D1DCFE] space-y-3">
                                <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2">
                                  <span className="font-['Cairo'] text-xs font-extrabold text-[#0D4E8B]">
                                    ملخص طلب الحصة الخاصة (1:1)
                                  </span>
                                  <span className="text-xs font-extrabold text-[#1F2A44]">
                                    {selectedPrivateSlot.priceAmount}{' '}
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
                                      {selectedPrivateSlot.durationMinutes} دقيقة (فردي 1:1)
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-[11px] text-[#64748B] block">السعر:</span>
                                    <span className="font-bold text-[#0D4E8B]">
                                      {selectedPrivateSlot.priceAmount}{' '}
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
                                  {group.startDate} ({group.sessionsCount} حصص)
                                </span>
                              </div>
                              <div>
                                <span className="text-[#64748B] block">الجدول المختصر:</span>
                                <span className="font-bold text-[#1F2A44]">
                                  {group.weeklyScheduleSummary}
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
                                  متبقي {remainingSeats} من {group.maxStudents} مقاعد
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
                          يمكنك بدء تجربة مجانية فردية ({tutor.trialDurationMinutes || 20} دقيقة) أو طلب إبلاغك عند فتح مجموعة جديدة عبر الإدارة.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleRequestAdminCoordination(
                            `طلب التسجيل في مجموعة تعليمية مع ${tutor.honorific} ${tutor.name}`
                          )
                        }
                        className="w-full py-2.5 px-4 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white font-['Cairo'] font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>طلب تنسيق مجموعة عبر الإدارة</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Trust & Reassurance Footer inside Widget */}
              <div className="pt-3 border-t border-[#E2E8F0] space-y-1.5 text-[11px] text-[#535E7B]">
                <div className="flex items-center gap-1.5 text-[#0D4E8B] font-bold">
                  <ShieldCheck className="w-4 h-4 text-[#0D4E8B] shrink-0" />
                  <span>ضمان شاطر لراحة ولي الأمر</span>
                </div>
                <p className="leading-relaxed">
                  تجربة مجانية لمدة {tutor.trialDurationMinutes || 20} دقيقة لتقييم مستوى الطفل والاطمئنان لأسلوب المعلم، مع متابعة مباشرة من فريق شاطر.
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MOBILE STICKY BOTTOM BAR (< 15% viewport height, no collision with FAB) */}
      {/* ========================================================================= */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E2E8F0] px-4 py-2.5 shadow-lg flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-['Cairo'] font-extrabold text-xs text-[#1F2A44] truncate">
            {sessionPriceText}
          </div>
          <div className="text-[11px] font-bold text-emerald-700 truncate">
            {selectedTrialSlotPayload
              ? `تجربة مجانية: ${selectedTrialSlotPayload.dayName} ${selectedTrialSlotPayload.timeRange.split('–')[0]}`
              : `تجربة مجانية — ${tutor.trialDurationMinutes || 20} دقيقة`}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsWhatsAppModalOpen(true)}
          className="shrink-0 py-2.5 px-4 rounded-xl bg-[#FFC629] hover:bg-[#F0B517] text-[#1F2A44] font-['Cairo'] font-extrabold text-xs shadow-xs active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
        >
          <MessageCircle className="w-3.5 h-3.5 text-[#1F2A44]" />
          <span>اطلب تجربة مجانية</span>
        </button>
      </div>

      {/* Modals */}
      <VideoModal
        tutor={tutor}
        isOpen={isVideoModalOpen}
        onClose={() => setIsVideoModalOpen(false)}
        onBookTrial={() => setIsWhatsAppModalOpen(true)}
      />

      <WhatsAppNoticeModal
        payload={bookingPayload}
        isOpen={isWhatsAppModalOpen}
        onClose={() => setIsWhatsAppModalOpen(false)}
      />
    </div>
  );
};
