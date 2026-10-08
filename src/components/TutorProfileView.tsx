import React, { useState, useEffect } from 'react';
import { Tutor, SearchCriteria, TutorAvailableSlot } from '../types';
import { DataService } from '../services/dataService';
import { VideoModal } from './VideoModal';
import { WhatsAppNoticeModal } from './WhatsAppNoticeModal';
import { TutorTrialCalendar, SelectedTrialSlotData } from './TutorTrialCalendar';
import { trackTrialSlotSelected, trackWhatsAppClicked } from '../services/analytics';
import {
  buildPrivateSessionBookingWhatsAppUrl,
  buildGroupClassBookingWhatsAppUrl,
} from '../config/shatirConfig';
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
  CalendarX,
  CreditCard,
  ShieldCheck,
  MessageCircle,
  CheckCircle2,
  Bookmark,
  Info,
  Users,
  DollarSign,
  Loader2,
  Lock,
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

  // Available appointment slots state
  const [availableSlots, setAvailableSlots] = useState<TutorAvailableSlot[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(true);
  const [selectedSlotData, setSelectedSlotData] = useState<SelectedTrialSlotData | null>(null);

  // Paid Private Slots & Educational Groups for public display
  const [publicPrivateSlots, setPublicPrivateSlots] = useState<any[]>([]);
  const [publicGroups, setPublicGroups] = useState<any[]>([]);
  const [isLoadingOffers, setIsLoadingOffers] = useState(false);

  // Helpers for slot formatting in natural Arabic
  const formatSlotDay = (dateStr: string): string => {
    try {
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString('ar-EG', { weekday: 'long' });
    } catch {
      return 'موعد محدد';
    }
  };

  const formatSlotDate = (dateStr: string): string => {
    try {
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const formatSlotTime = (start: string, end: string): string => {
    try {
      const parseTime = (t: string) => {
        const parts = t.split(':');
        const h = Number(parts[0]);
        const m = Number(parts[1] || 0);
        const period = h >= 12 ? 'م' : 'ص';
        const adjustedHour = h % 12 === 0 ? 12 : h % 12;
        const formattedMinute = String(m).padStart(2, '0');
        return `${adjustedHour}:${formattedMinute} ${period}`;
      };
      return `${parseTime(start)} – ${parseTime(end)}`;
    } catch {
      return `${start} – ${end}`;
    }
  };

  const formatTimezone = (tz?: string): string => {
    if (!tz) return 'بتوقيت القاهرة';
    if (tz.includes('Cairo') || tz.includes('Egypt')) return 'بتوقيت القاهرة';
    if (tz.includes('Riyadh') || tz.includes('Saudi') || tz.includes('Mecca')) return 'بتوقيت مكة المكرمة';
    return tz;
  };

  useEffect(() => {
    let isMounted = true;
    setIsLoadingSlots(true);
    DataService.getTutorAvailableSlots(tutor.id)
      .then((slots) => {
        if (isMounted) {
          setAvailableSlots(slots);
          setIsLoadingSlots(false);
          if (slots.length > 0) {
            const first = slots[0];
            setSelectedSlotData({
              id: first.id,
              dateStr: first.slotDate,
              dayName: formatSlotDay(first.slotDate),
              formattedDate: formatSlotDate(first.slotDate),
              startTime: first.startTime,
              endTime: first.endTime,
              timeRange: formatSlotTime(first.startTime, first.endTime),
              timezone: formatTimezone(first.timezone),
              isPublishedSlot: true,
            });
          } else {
            // Default to tomorrow 4:00 PM for instant convenience
            const tmrw = new Date();
            tmrw.setDate(tmrw.getDate() + 1);
            const y = tmrw.getFullYear();
            const m = String(tmrw.getMonth() + 1).padStart(2, '0');
            const d = String(tmrw.getDate()).padStart(2, '0');
            const dStr = `${y}-${m}-${d}`;
            setSelectedSlotData({
              id: `suggested-${dStr}-16:00`,
              dateStr: dStr,
              dayName: formatSlotDay(dStr),
              formattedDate: formatSlotDate(dStr),
              startTime: '16:00',
              endTime: '16:20',
              timeRange: '٠٤:٠٠ م – ٠٤:٢٠ م',
              timezone: 'بتوقيت القاهرة',
              isPublishedSlot: false,
            });
          }
        }
      })
      .catch(() => {
        if (isMounted) {
          setAvailableSlots([]);
          setIsLoadingSlots(false);
          const tmrw = new Date();
          tmrw.setDate(tmrw.getDate() + 1);
          const y = tmrw.getFullYear();
          const m = String(tmrw.getMonth() + 1).padStart(2, '0');
          const d = String(tmrw.getDate()).padStart(2, '0');
          const dStr = `${y}-${m}-${d}`;
          setSelectedSlotData({
            id: `suggested-${dStr}-16:00`,
            dateStr: dStr,
            dayName: formatSlotDay(dStr),
            formattedDate: formatSlotDate(dStr),
            startTime: '16:00',
            endTime: '16:20',
            timeRange: '٠٤:٠٠ م – ٠٤:٢٠ م',
            timezone: 'بتوقيت القاهرة',
            isPublishedSlot: false,
          });
        }
      });
    return () => {
      isMounted = false;
    };
  }, [tutor.id]);

  useEffect(() => {
    let isMounted = true;
    setIsLoadingOffers(true);
    Promise.allSettled([
      DataService.getTutorPrivateSlots(tutor.id),
      DataService.getTutorGroups(tutor.id),
    ]).then(([privateRes, groupsRes]) => {
      if (!isMounted) return;
      if (privateRes.status === 'fulfilled') {
        setPublicPrivateSlots(privateRes.value || []);
      }
      if (groupsRes.status === 'fulfilled') {
        setPublicGroups(groupsRes.value || []);
      }
      setIsLoadingOffers(false);
    });
    return () => {
      isMounted = false;
    };
  }, [tutor.id]);

  const handleBookPrivateSlot = (slot: any) => {
    trackWhatsAppClicked('private_slot_booking');
    const url = buildPrivateSessionBookingWhatsAppUrl({
      tutorName: tutor.name,
      tutorHonorific: tutor.honorific,
      specializationLabel: slot.specializationLabel,
      slotDate: slot.slotDate,
      startTime: slot.startTime,
      endTime: slot.endTime,
      timezone: slot.timezone || 'بتوقيت القاهرة',
      durationMinutes: slot.durationMinutes,
      priceAmount: slot.priceAmount,
      currency: slot.currency,
    });
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleBookGroup = (group: any) => {
    trackWhatsAppClicked('group_class_booking');
    const url = buildGroupClassBookingWhatsAppUrl({
      tutorName: tutor.name,
      tutorHonorific: tutor.honorific,
      groupTitle: group.title,
      specializationLabel: group.specializationLabel,
      weeklyScheduleSummary: group.weeklyScheduleSummary,
      startDate: group.startDate,
      sessionsCount: group.sessionsCount,
      pricePerStudent: group.pricePerStudent,
      currency: group.currency,
    });
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleSelectCalendarSlot = (slot: SelectedTrialSlotData) => {
    setSelectedSlotData(slot);
    trackTrialSlotSelected(tutor.id, slot.id);
  };

  const selectedSlotPayload = selectedSlotData
    ? {
        date: selectedSlotData.formattedDate,
        dayName: selectedSlotData.dayName,
        timeRange: selectedSlotData.timeRange,
        timezone: selectedSlotData.timezone,
      }
    : undefined;

  // If criteria exists, use its track. Otherwise detect from tutor's offerings.
  const hasCriteria = Boolean(criteria);
  const detectedTrack = criteria?.track || (tutor.offerings.some((o) => o.track === 'school') ? 'school' : 'quran');
  const isSchool = detectedTrack === 'school';

  const primarySubjectName =
    subjectName ||
    tutor.subjectsTaughtSummary?.[0]?.title ||
    (isSchool ? 'المناهج المدرسية' : 'القرآن الكريم والتأسيس');

  const defaultCurriculumName =
    curriculumName ||
    tutor.curriculumTags?.[0] ||
    'لغات وتجريبي وعربي';

  const bookingPayload = {
    tutorName: tutor.name,
    tutorHonorific: tutor.honorific,
    track: detectedTrack,
    subjectName: primarySubjectName,
    stageName: isSchool ? stageName : undefined,
    gradeName: isSchool ? gradeName : undefined,
    curriculumName: isSchool ? (curriculumName || (hasCriteria ? undefined : defaultCurriculumName)) : undefined,
    quranAgeGroupName: !isSchool ? quranAgeName : undefined,
    quranLevelName: !isSchool ? quranLevelName : undefined,
    selectedSlot: selectedSlotPayload,
  };

  const handleStartBooking = () => {
    setIsWhatsAppModalOpen(true);
  };

  const previewQuickMessage = hasCriteria
    ? isSchool
      ? `أود حجز حصة تجريبية مع ${tutor.honorific} ${tutor.name} (${primarySubjectName}${gradeName ? ` - ${gradeName}` : ''}${curriculumName ? ` - ${curriculumName}` : ''})`
      : `أود حجز حصة تجريبية مع ${tutor.honorific} ${tutor.name} (قرآن وتأسيس${quranAgeName ? ` - ${quranAgeName}` : ''}${quranLevelName ? ` - ${quranLevelName}` : ''})`
    : `أود حجز حصة تجريبية مع ${tutor.honorific} ${tutor.name} (تخصص: ${primarySubjectName})`;

  return (
    <div className="w-full pb-28 lg:pb-16 animate-fade-in">
      {/* 1. Breadcrumbs Bar (Matching Desktop Stitch Image 3) */}
      <div className="w-full py-3.5 mb-6 border-b border-[#E2E8F0] bg-white/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between flex-wrap gap-2 text-xs sm:text-sm">
          <div className="flex items-center gap-2 flex-wrap text-[#535E7B]">
            <button
              onClick={onBack}
              className="text-[#0D4E8B] hover:text-[#003767] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" />
              <span>{hasCriteria ? 'العودة إلى نتائج البحث' : 'العودة لاختيار معلم'}</span>
            </button>
            <span>/</span>
            {hasCriteria ? (
              isSchool ? (
                <>
                  {stageName && <span>{stageName}</span>}
                  {gradeName && (
                    <>
                      <span>/</span>
                      <span>{gradeName}</span>
                    </>
                  )}
                  <span>/</span>
                  <span>{primarySubjectName}</span>
                  {curriculumName && (
                    <>
                      <span>/</span>
                      <span className="font-medium text-[#1F2A44]">{curriculumName}</span>
                    </>
                  )}
                </>
              ) : (
                <>
                  <span>مسار القرآن والتأسيس</span>
                  {quranAgeName && (
                    <>
                      <span>/</span>
                      <span>{quranAgeName}</span>
                    </>
                  )}
                  {quranLevelName && (
                    <>
                      <span>/</span>
                      <span className="font-medium text-[#1F2A44]">{quranLevelName}</span>
                    </>
                  )}
                </>
              )
            ) : (
              <>
                <span>معلمو شاطر</span>
                <span>/</span>
                <span className="font-medium text-[#1F2A44]">{primarySubjectName}</span>
              </>
            )}
          </div>

          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
            <Bookmark className="w-3 h-3 text-[#0D4E8B]" />
            <span>ملف المعلم التعريفي</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* ========================================================================= */}
          {/* COLUMN 1: RIGHT / MAIN CONTENT (Tutor Profile Details) - 8 cols on desktop */}
          {/* ========================================================================= */}
          <div className="lg:col-span-8 space-y-6 sm:space-y-8">
            {/* Tutor Header Card */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E2E8F0] shadow-sm relative overflow-hidden">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 sm:gap-6">
                {/* Avatar with Verified Badge */}
                <div className="relative shrink-0">
                  <div className="w-22 h-22 sm:w-26 sm:h-26 rounded-full overflow-hidden bg-[#F2F3F6] border-4 border-white shadow-md flex items-center justify-center text-[#0D4E8B] text-2xl font-bold font-['Cairo']">
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
                    ) : null}
                    <span>{tutor.name.charAt(0)}</span>
                  </div>
                  {tutor.verifiedCredentials && (
                    <span
                      className="absolute bottom-0 left-0 w-7 h-7 rounded-full bg-[#0D4E8B] text-white flex items-center justify-center text-xs shadow-md border-2 border-white"
                      title="معلم معتمد وموثق"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>

                {/* Name & Headline */}
                <div className="flex-1 space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-[#D1DCFE]/60 text-[#0D4E8B] text-xs font-bold">
                    <GraduationCap className="w-3.5 h-3.5" />
                    <span>تمت مراجعة المؤهلات</span>
                  </div>

                  <h1 className="font-['Cairo'] text-2xl sm:text-3xl font-extrabold text-[#1F2A44]">
                    {tutor.honorific} {tutor.name}
                  </h1>

                  <p className="text-sm sm:text-base text-[#535E7B] leading-relaxed">
                    {tutor.headline}
                  </p>

                  {/* Taxonomy Tags */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                    <span className="px-2.5 py-1 rounded-lg bg-[#F8F9FC] border border-[#E2E8F0] font-medium text-[#1F2A44] flex items-center gap-1">
                      <BookOpen className="w-3 h-3 text-[#64748B]" />
                      <span>{isSchool ? `${stageName} (${tutor.subjectsTaughtSummary[0]?.gradesRange || 'الصفوف ١ - ٦'})` : 'مسار التأسيس والقرآن'}</span>
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-[#F8F9FC] border border-[#E2E8F0] font-medium text-[#1F2A44]">
                      {curriculumName}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-[#F8F9FC] border border-[#E2E8F0] font-medium text-[#1F2A44] flex items-center gap-1">
                      <Clock className="w-3 h-3 text-[#64748B]" />
                      <span>خبرة {tutor.yearsOfExperience} سنوات تدريس فعلي</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Video Preview Banner */}
              {tutor.videoPreview?.available && (
                <div className="mt-6 pt-6 border-t border-[#F2F3F6]">
                  <div className="p-4 sm:p-5 rounded-2xl bg-[#F0F5FA] border border-[#D1DCFE] flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5 text-center sm:text-right">
                      <div className="w-11 h-11 rounded-xl bg-[#0D4E8B] text-[#FFC629] flex items-center justify-center text-lg shrink-0 shadow-sm">
                        <Play className="w-5 h-5 fill-[#FFC629]" />
                      </div>
                      <div>
                        <h4 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#0D4E8B]">
                          فيديو تعريفي قصير: كيف أدير الحصة مع طفلك؟
                        </h4>
                        <p className="text-xs text-[#535E7B] mt-0.5">
                          {tutor.videoPreview.description}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => setIsVideoModalOpen(true)}
                      className="px-4 py-2 rounded-xl bg-white hover:bg-[#0D4E8B] hover:text-white text-[#0D4E8B] text-xs font-bold border border-[#CBD5E1] transition-all shadow-sm flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <span>مشاهدة الفيديو</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Section: كيف أساعد طفلك؟ */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E2E8F0] shadow-sm space-y-5">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-[#0D4E8B]" />
                <h2 className="font-['Cairo'] text-lg sm:text-xl font-bold text-[#0D4E8B]">
                  كيف أساعد طفلك؟
                </h2>
              </div>

              {/* Quote */}
              <div className="p-4 sm:p-5 rounded-2xl bg-[#F8F9FC] border-r-4 border-[#0D4E8B] text-[#1F2A44] leading-relaxed text-xs sm:text-sm">
                <p className="font-medium italic">"{tutor.helpChildSummary}"</p>
              </div>

              {/* Methodology Pillars */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
                {tutor.methodologyPillars.map((pillar, idx) => (
                  <div key={idx} className="p-4 rounded-2xl bg-[#F8F9FC] border border-[#E2E8F0] space-y-1.5">
                    <div className="w-7 h-7 rounded-lg bg-[#D1DCFE]/60 text-[#0D4E8B] flex items-center justify-center text-xs font-bold">
                      {idx + 1}
                    </div>
                    <h3 className="font-['Cairo'] text-xs sm:text-sm font-bold text-[#1F2A44]">
                      {pillar.title}
                    </h3>
                    <p className="text-xs text-[#535E7B] leading-relaxed">
                      {pillar.description}
                    </p>
                  </div>
                ))}
              </div>

              {/* Target Student Cases */}
              {tutor.targetStudentCases && tutor.targetStudentCases.length > 0 && (
                <div className="mt-2 p-4 rounded-2xl bg-[#F2F3F6]/70 border border-[#E2E8F0]">
                  <h4 className="font-['Cairo'] text-xs sm:text-sm font-bold text-[#0D4E8B] mb-2.5">
                    الحالات التعليمية الأكثر استفادة من هذا المنهج:
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {tutor.targetStudentCases.map((c, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-[#1F2A44]">
                        <Check className="w-3.5 h-3.5 text-emerald-600 font-bold shrink-0 mt-0.5" />
                        <span className="leading-snug">{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Section: المواد والصفوف التي أدرّسها */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E2E8F0] shadow-sm space-y-5">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#0D4E8B]" />
                <h2 className="font-['Cairo'] text-lg sm:text-xl font-bold text-[#0D4E8B]">
                  المواد والصفوف التي أدرّسها
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {tutor.subjectsTaughtSummary.map((item, idx) => (
                  <div key={idx} className="p-4 sm:p-5 rounded-2xl bg-[#F8F9FC] border border-[#E2E8F0] flex flex-col justify-between gap-3">
                    <div className="space-y-1.5">
                      <h4 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#1F2A44]">
                        {item.title}
                      </h4>
                      <p className="text-xs text-[#535E7B] leading-relaxed">
                        {item.curriculumNote}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-[#E2E8F0]">
                      <span className="inline-block px-2.5 py-1 rounded-md bg-[#E2E8F0]/70 text-[#1F2A44] font-bold text-xs">
                        {item.gradesRange}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Section: ماذا يحدث في الحصة التجريبية؟ */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E2E8F0] shadow-sm space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-[#0D4E8B]" />
                  <h2 className="font-['Cairo'] text-lg sm:text-xl font-bold text-[#0D4E8B]">
                    ماذا يحدث في الحصة التجريبية؟
                  </h2>
                </div>
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                  بدون التزام مالي
                </span>
              </div>

              <p className="text-xs sm:text-sm text-[#535E7B]">
                الحصة التجريبية مصممة خصيصاً لتمنح ولي الأمر والطالب راحة تامة وتقييماً واقعياً قبل اتخاذ أي قرار.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {tutor.whatHappensInTrial.map((step) => (
                  <div key={step.stepNumber} className="p-4 sm:p-5 rounded-2xl bg-[#F8F9FC] border border-[#E2E8F0] space-y-1.5">
                    <span className="w-6 h-6 rounded-full bg-[#0D4E8B] text-white flex items-center justify-center text-xs font-bold font-['Cairo']">
                      {step.stepNumber}
                    </span>
                    <h4 className="font-['Cairo'] text-xs sm:text-sm font-bold text-[#1F2A44]">
                      {step.title}
                    </h4>
                    <p className="text-xs text-[#535E7B] leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Section: الخبرة والمؤهلات الأكاديمية */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E2E8F0] shadow-sm space-y-5">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-[#0D4E8B]" />
                <h2 className="font-['Cairo'] text-lg sm:text-xl font-bold text-[#0D4E8B]">
                  الخبرة والمؤهلات الأكاديمية
                </h2>
              </div>

              <div className="space-y-3">
                {tutor.qualifications.map((q, idx) => (
                  <div key={idx} className="p-4 rounded-2xl bg-[#F8F9FC] border border-[#E2E8F0] flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                    <div className="space-y-0.5">
                      <h4 className="font-['Cairo'] text-xs sm:text-sm font-bold text-[#1F2A44]">
                        {q.title}
                      </h4>
                      <p className="text-xs text-[#0D4E8B] font-medium">
                        {q.institution}
                      </p>
                      {q.notes && (
                        <p className="text-xs text-[#64748B] pt-0.5 leading-relaxed">
                          {q.notes}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Section: التقويم التفاعلي لمواعيد الحصة التجريبية */}
            <div className="bg-white rounded-3xl p-5 sm:p-7 border border-[#E2E8F0] shadow-sm">
              <TutorTrialCalendar
                tutor={tutor}
                availableSlots={availableSlots}
                isLoadingSlots={isLoadingSlots}
                selectedSlot={selectedSlotData}
                onSelectSlot={handleSelectCalendarSlot}
              />
            </div>

            {/* Section: تفاصيل التسعير والمتابعة بعد الحصة المجانية */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E2E8F0] shadow-sm space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-[#0D4E8B]" />
                  <h2 className="font-['Cairo'] text-lg sm:text-xl font-bold text-[#0D4E8B]">
                    تفاصيل التسعير والمتابعة
                  </h2>
                </div>
                <span className="text-xs font-bold text-[#64748B] bg-[#F2F3F6] px-3 py-1 rounded-full">
                  بعد الحصة المجانية
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-4 rounded-2xl bg-[#F8F9FC] border border-[#E2E8F0] space-y-1">
                  <span className="text-xs text-[#64748B] block">سعر الحصة الاعتيادية</span>
                  <span className="font-['Cairo'] text-xl font-bold text-[#1F2A44]">
                    {tutor.hourlyRateMin} - {tutor.hourlyRateMax} {tutor.currency}
                  </span>
                  <span className="text-xs text-[#535E7B] block">حسب عدد الحصص بالأسبوع</span>
                </div>

                <div className="p-4 rounded-2xl bg-[#F8F9FC] border border-[#E2E8F0] space-y-1">
                  <span className="text-xs text-[#64748B] block">مدة الحصة</span>
                  <span className="font-['Cairo'] text-xl font-bold text-[#0D4E8B]">
                    {tutor.sessionDurationMinutes} دقيقة
                  </span>
                  <span className="text-xs text-[#535E7B] block">شرح فردي مباشر 1:1</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F2F3F6] text-xs text-[#1F2A44] flex items-center gap-2">
                <span className="text-[#0D4E8B] font-bold">المحدد لاختيارك:</span>
                <span>
                  {isSchool ? `${subjectName} • ${gradeName} • ${curriculumName}` : `${quranAgeName} • ${quranLevelName}`}
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm space-y-1">
                <span className="font-bold flex items-center gap-1.5 text-emerald-800">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <span>ضمان شاطر لراحة ولي الأمر:</span>
                </span>
                <p className="leading-relaxed">
                  لم يناسب طفلك المعلم بعد التجربة؟ نساعدك على تجربة معلم آخر مجاناً دون أي رسوم إضافية.
                </p>
              </div>
            </div>

            {/* Section: الحصص الخاصة المدفوعة (1:1) المتاحة للحجز المباشر */}
            {publicPrivateSlots.length > 0 && (
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E2E8F0] shadow-sm space-y-5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-[#0D4E8B]" />
                    <h2 className="font-['Cairo'] text-lg sm:text-xl font-bold text-[#0D4E8B]">
                      مواعيد الحصص الخاصة الفردية المتاحة (1:1)
                    </h2>
                  </div>
                  <span className="text-xs font-bold text-[#0D4E8B] bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
                    {publicPrivateSlots.length} موعد متاح
                  </span>
                </div>

                <p className="text-xs text-[#64748B] leading-relaxed">
                  حصص خصوصية مباشرة فردية مع المعلم، محددة بالتخصص والمدة والسعر لتثبيت الموعد مباشرة مع مستشار شاطر.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {publicPrivateSlots.map((slot) => (
                    <div
                      key={slot.id}
                      className="p-4 rounded-2xl bg-[#F8F9FC] border border-[#E2E8F0] hover:border-[#CBD5E1] transition-all flex flex-col justify-between gap-3"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-['Cairo'] text-xs sm:text-sm font-bold text-[#1F2A44]">
                            {new Date(slot.slotDate).toLocaleDateString('ar-EG', {
                              weekday: 'long',
                              day: 'numeric',
                              month: 'short',
                            })}
                          </span>
                          <span className="font-mono text-xs text-[#0D4E8B] font-bold" dir="ltr">
                            {slot.startTime.substring(0, 5)} - {slot.endTime.substring(0, 5)}
                          </span>
                        </div>

                        <p className="text-xs text-[#0D4E8B] font-bold">
                          {slot.specializationLabel}
                        </p>

                        <div className="flex items-center gap-2 text-[11px] text-[#64748B]">
                          <span>المدة: {slot.durationMinutes} دقيقة</span>
                          <span>•</span>
                          <span className="font-bold text-[#1F2A44]">{slot.priceAmount} {slot.currency}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleBookPrivateSlot(slot)}
                        className="w-full py-2 px-3 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>طلب تثبيت هذا الموعد الخاص</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section: المجموعات التعليمية المفتوحة للتسجيل */}
            {publicGroups.length > 0 && (
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E2E8F0] shadow-sm space-y-5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-[#0D4E8B]" />
                    <h2 className="font-['Cairo'] text-lg sm:text-xl font-bold text-[#0D4E8B]">
                      المجموعات التعليمية المتاحة (Small Groups)
                    </h2>
                  </div>
                  <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                    مجموعات صغيرة تفاعلية
                  </span>
                </div>

                <p className="text-xs text-[#64748B] leading-relaxed">
                  مجموعات دراسية صغيرة يشرف عليها المعلم مباشرة وتتيح للطالب التفاعل الإيجابي مع زملائه باشتراك مخفض.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {publicGroups.map((group) => (
                    <div
                      key={group.id}
                      className="p-5 rounded-2xl bg-[#F8F9FC] border border-[#E2E8F0] hover:border-[#CBD5E1] transition-all flex flex-col justify-between gap-4"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                            {group.status === 'open' ? 'متاح التسجيل' : 'جارية'}
                          </span>
                          <span className="font-['Cairo'] text-sm font-extrabold text-[#0D4E8B]">
                            {group.pricePerStudent} {group.currency} / {group.priceType === 'per_session' ? 'للحصة' : 'للباقة'}
                          </span>
                        </div>

                        <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#1F2A44]">
                          {group.title}
                        </h3>

                        <p className="text-xs text-[#0D4E8B] font-bold">
                          {group.specializationLabel}
                        </p>

                        {group.description && (
                          <p className="text-xs text-[#64748B] line-clamp-2 leading-relaxed">
                            {group.description}
                          </p>
                        )}

                        <div className="p-3 rounded-xl bg-white border border-[#E2E8F0] text-xs text-[#535E7B] space-y-1">
                          <div className="flex items-center justify-between">
                            <span>الجدول:</span>
                            <span className="font-bold text-[#1F2A44]">{group.weeklyScheduleSummary}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>البدء:</span>
                            <span className="font-mono">{group.startDate} ({group.sessionsCount} حصص)</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>المقاعد المتبقية:</span>
                            <span className="font-bold text-emerald-700">
                              متبقي {group.remainingSeats !== undefined ? group.remainingSeats : Math.max(0, group.maxStudents - group.enrolledStudents)} مقاعد من {group.maxStudents}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleBookGroup(group)}
                        className="w-full py-2.5 px-4 rounded-xl bg-[#25D366] hover:bg-[#1EBE5D] text-white text-xs sm:text-sm font-bold shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>حجز مقعد في هذه المجموعة</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* COLUMN 2: LEFT / STICKY BOOKING CARD (Desktop Stitch Image 3) - 4 cols */}
          {/* ========================================================================= */}
          <div className="hidden lg:block lg:col-span-4 sticky top-24 space-y-4">
            <div className="bg-white rounded-3xl p-6 border border-[#E2E8F0] shadow-lg space-y-5">
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-50 text-amber-800 text-xs font-bold border border-amber-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-700" />
                <span>عرض ترحيبي لأولياء الأمور</span>
              </div>

              <div>
                <h3 className="font-['Cairo'] text-lg font-extrabold text-[#1F2A44]">
                  ابدأ بحصة تجريبية مجانية
                </h3>
                <p className="text-xs text-[#64748B] mt-1 leading-relaxed">
                  تعرّف على أسلوب المعلم وتأكد من ارتياح طفلك قبل أي التزام مالي.
                </p>
              </div>

              {/* Parameter Chips */}
              <div className="p-3 rounded-2xl bg-[#F8F9FC] border border-[#E2E8F0] space-y-1.5 text-xs">
                <span className="text-[11px] font-bold text-[#64748B] block">بيانات البحث المحددة:</span>
                <div className="grid grid-cols-3 gap-1.5 text-center font-bold text-[#1F2A44]">
                  <div className="p-2 bg-white rounded-xl border border-[#E2E8F0]">
                    <span className="text-[10px] text-[#64748B] block font-normal">المادة</span>
                    <span className="truncate block">{isSchool ? subjectName : 'قرآن'}</span>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-[#E2E8F0]">
                    <span className="text-[10px] text-[#64748B] block font-normal">الصف</span>
                    <span className="truncate block">{isSchool ? gradeName : quranAgeName || 'براعم'}</span>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-[#E2E8F0]">
                    <span className="text-[10px] text-[#64748B] block font-normal">المسار</span>
                    <span className="truncate block">{isSchool ? curriculumName : 'تأسيس'}</span>
                  </div>
                </div>
              </div>

              {/* Selected Slot Information */}
              {selectedSlotPayload && (
                <div className="p-3 rounded-2xl bg-[#F0F6FD] border border-[#D1DCFE] space-y-1 text-xs">
                  <div className="flex items-center gap-1.5 text-[#0D4E8B] font-bold">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>الموعد المحدد للحصة:</span>
                  </div>
                  <div className="font-bold text-[#1F2A44] pt-0.5">
                    {selectedSlotPayload.dayName} {selectedSlotPayload.date}
                  </div>
                  <div className="text-[11px] text-[#535E7B]">
                    {selectedSlotPayload.timeRange} ({selectedSlotPayload.timezone})
                  </div>
                  <span className="text-[10px] font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/80 inline-block mt-0.5">
                    يُؤكَّد الموعد بعد مراجعة طلبك
                  </span>
                </div>
              )}

              {/* Pricing breakdown */}
              <div className="space-y-2.5 pt-1">
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs">
                  <span className="font-bold text-emerald-900">الحصة التجريبية الأولى</span>
                  <span className="font-['Cairo'] font-extrabold text-sm text-emerald-700">
                    0 ج.م (مجاناً)
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-[#535E7B]">
                  <span>المدة المعتادة للحصة</span>
                  <span className="font-bold text-[#1F2A44]">{tutor.sessionDurationMinutes} دقيقة</span>
                </div>

                <div className="flex items-center justify-between text-xs text-[#535E7B]">
                  <span>السعر التقديري بعد التجربة</span>
                  <span className="font-bold text-[#1F2A44]">
                    {tutor.hourlyRateMin} - {tutor.hourlyRateMax} {tutor.currency} / للحصة
                  </span>
                </div>
              </div>

              {/* Booking Button */}
              <button
                onClick={handleStartBooking}
                className="w-full py-3.5 px-5 rounded-2xl bg-[#FFC629] hover:bg-[#F0B517] text-[#1F2A44] font-['Cairo'] font-extrabold text-sm sm:text-base shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <MessageCircle className="w-4 h-4 text-[#1F2A44]" />
                <span>احجز حصة تجريبية مجانية</span>
              </button>

              <p className="text-[11px] text-center text-[#64748B] leading-tight">
                إرسال الطلب لا يؤكد الحجز تلقائيًا؛ يُؤكَّد الموعد بعد مراجعة طلبكم والتنسيق المباشر معكم دون أي التزام.
              </p>

              {/* Ready Message Preview */}
              <div className="p-3 rounded-xl bg-[#F8F9FC] border border-[#E2E8F0] space-y-1">
                <span className="text-[10px] font-bold text-[#64748B] block">
                  الرسالة الجاهزة التي ستُرسل للمستشار:
                </span>
                <p className="text-xs text-[#1F2A44] italic font-['Tajawal'] leading-snug">
                  "{previewQuickMessage}"
                </p>
              </div>

              {/* Reassurance Footer */}
              <div className="pt-2 border-t border-[#E2E8F0] space-y-1.5 text-[11px] text-[#64748B]">
                <div className="flex items-center gap-1.5 text-[#0D4E8B] font-bold">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#0D4E8B]" />
                  <span>ضمان شاطر لراحة البال</span>
                </div>
                <p className="leading-relaxed">
                  لم يناسب طفلك المعلم بعد الحصة التجريبية؟ نساعدك على تجربة معلم آخر مجاناً.
                </p>

                <div className="flex items-center justify-between pt-1 text-[10px] text-[#535E7B]">
                  <span>• بدون بطاقات بنكية</span>
                  <span>• بدون تسجيل حساب</span>
                  <span>• دفع مباشر بعد الرضا</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MOBILE STICKY BOTTOM BAR (Strictly matching Stitch Image 1) */}
      {/* ========================================================================= */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E2E8F0] p-3.5 shadow-2xl flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-[11px] text-[#64748B]">الحصة التجريبية</span>
          <span className="font-['Cairo'] font-extrabold text-xs sm:text-sm text-emerald-600">
            مجاناً / {tutor.trialDurationMinutes} دقيقة
          </span>
          {selectedSlotPayload && (
            <span className="text-[10px] text-[#0D4E8B] font-bold truncate max-w-[140px]">
              {selectedSlotPayload.dayName} {selectedSlotPayload.timeRange.split('–')[0]}
            </span>
          )}
        </div>

        <button
          onClick={handleStartBooking}
          className="flex-1 max-w-[200px] py-2.5 px-4 rounded-xl bg-[#FFC629] text-[#1F2A44] font-['Cairo'] font-bold text-xs sm:text-sm shadow-sm active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <MessageCircle className="w-4 h-4 text-[#1F2A44]" />
          <span>حجز جلسة تجريبية</span>
        </button>
      </div>

      {/* Modals */}
      <VideoModal
        tutor={tutor}
        isOpen={isVideoModalOpen}
        onClose={() => setIsVideoModalOpen(false)}
        onBookTrial={handleStartBooking}
      />

      <WhatsAppNoticeModal
        payload={bookingPayload}
        isOpen={isWhatsAppModalOpen}
        onClose={() => setIsWhatsAppModalOpen(false)}
      />
    </div>
  );
};
