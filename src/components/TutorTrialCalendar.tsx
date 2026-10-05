import React, { useState, useMemo } from 'react';
import { Tutor, TutorAvailableSlot } from '../types';
import {
  CalendarDays,
  ChevronRight,
  ChevronLeft,
  Clock,
  Check,
  CheckCircle2,
  Info,
  Calendar as CalendarIcon,
  Sparkles,
} from 'lucide-react';

export interface SelectedTrialSlotData {
  id: string;
  dateStr: string; // YYYY-MM-DD
  dayName: string; // e.g. "الجمعة"
  formattedDate: string; // e.g. "9 أكتوبر 2026"
  startTime: string; // e.g. "16:00"
  endTime: string; // e.g. "16:20"
  timeRange: string; // e.g. "04:00 م – 04:20 م"
  timezone: string; // e.g. "بتوقيت القاهرة"
  isPublishedSlot: boolean;
}

interface TutorTrialCalendarProps {
  tutor: Tutor;
  availableSlots: TutorAvailableSlot[];
  isLoadingSlots?: boolean;
  selectedSlot: SelectedTrialSlotData | null;
  onSelectSlot: (slot: SelectedTrialSlotData) => void;
}

const ARABIC_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

const WEEKDAY_NAMES = [
  { key: 0, full: 'الأحد', short: 'أحد' },
  { key: 1, full: 'الإثنين', short: 'إثنين' },
  { key: 2, full: 'الثلاثاء', short: 'ثلاثاء' },
  { key: 3, full: 'الأربعاء', short: 'أربعاء' },
  { key: 4, full: 'الخميس', short: 'خميس' },
  { key: 5, full: 'الجمعة', short: 'جمعة' },
  { key: 6, full: 'السبت', short: 'سبت' },
];

// Flexible trial time templates (20-minute sessions)
const DEFAULT_TRIAL_PERIODS = [
  { start: '15:00', end: '15:20', label: 'بعد الظهر', period: 'afternoon' },
  { start: '16:00', end: '16:20', label: 'بعد الظهر', period: 'afternoon' },
  { start: '17:00', end: '17:20', label: 'بعد الظهر', period: 'afternoon' },
  { start: '18:00', end: '18:20', label: 'مساءً', period: 'evening' },
  { start: '19:00', end: '19:20', label: 'مساءً', period: 'evening' },
  { start: '20:00', end: '20:20', label: 'مساءً', period: 'evening' },
  { start: '21:00', end: '21:20', label: 'مساءً', period: 'evening' },
];

export const TutorTrialCalendar: React.FC<TutorTrialCalendarProps> = ({
  tutor,
  availableSlots,
  isLoadingSlots = false,
  selectedSlot,
  onSelectSlot,
}) => {
  // Current real date reference
  const now = new Date();
  const todayStr = useMemo(() => {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  // Determine initial calendar month based on earliest available slot or today
  const initialYearMonth = useMemo(() => {
    const validFutureSlot = availableSlots.find((s) => s.slotDate >= todayStr);
    if (validFutureSlot) {
      const parts = validFutureSlot.slotDate.split('-');
      return {
        year: parseInt(parts[0], 10),
        month: parseInt(parts[1], 10) - 1,
      };
    }
    return {
      year: now.getFullYear(),
      month: now.getMonth(),
    };
  }, [availableSlots, todayStr]);

  const [currentYear, setCurrentYear] = useState<number>(initialYearMonth.year);
  const [currentMonth, setCurrentMonth] = useState<number>(initialYearMonth.month);

  // Selected date string (YYYY-MM-DD)
  const [activeDateStr, setActiveDateStr] = useState<string>(() => {
    if (selectedSlot?.dateStr) return selectedSlot.dateStr;
    const firstSlot = availableSlots.find((s) => s.slotDate >= todayStr);
    if (firstSlot) return firstSlot.slotDate;
    // Default to tomorrow
    const tmrw = new Date();
    tmrw.setDate(tmrw.getDate() + 1);
    const y = tmrw.getFullYear();
    const m = String(tmrw.getMonth() + 1).padStart(2, '0');
    const d = String(tmrw.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  // Map slots by date string for quick lookup
  const slotsByDate = useMemo(() => {
    const map = new Map<string, TutorAvailableSlot[]>();
    availableSlots.forEach((slot) => {
      const list = map.get(slot.slotDate) || [];
      list.push(slot);
      map.set(slot.slotDate, list);
    });
    return map;
  }, [availableSlots]);

  // Calendar math for grid
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay(); // 0 is Sunday
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    const days: Array<{
      dateStr: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isPast: boolean;
      isToday: boolean;
      hasPublishedSlots: boolean;
      slotsCount: number;
    }> = [];

    // Previous month filler days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      const dStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      days.push({
        dateStr: dStr,
        dayNumber: dayNum,
        isCurrentMonth: false,
        isPast: dStr < todayStr,
        isToday: dStr === todayStr,
        hasPublishedSlots: (slotsByDate.get(dStr) || []).length > 0,
        slotsCount: (slotsByDate.get(dStr) || []).length,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const slots = slotsByDate.get(dStr) || [];
      days.push({
        dateStr: dStr,
        dayNumber: d,
        isCurrentMonth: true,
        isPast: dStr < todayStr,
        isToday: dStr === todayStr,
        hasPublishedSlots: slots.length > 0,
        slotsCount: slots.length,
      });
    }

    // Next month filler days (fill up to 35 or 42 grid cells)
    const totalFilled = days.length;
    const remaining = totalFilled <= 35 ? 35 - totalFilled : 42 - totalFilled;
    for (let nextDay = 1; nextDay <= remaining; nextDay++) {
      const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
      const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
      const dStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;
      days.push({
        dateStr: dStr,
        dayNumber: nextDay,
        isCurrentMonth: false,
        isPast: dStr < todayStr,
        isToday: dStr === todayStr,
        hasPublishedSlots: (slotsByDate.get(dStr) || []).length > 0,
        slotsCount: (slotsByDate.get(dStr) || []).length,
      });
    }

    return days;
  }, [currentYear, currentMonth, todayStr, slotsByDate]);

  // Handlers for month navigation
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const handleJumpToToday = () => {
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
    setActiveDateStr(todayStr);
  };

  // Helper date formatters in natural Arabic
  const formatArabicDayName = (dateString: string): string => {
    try {
      const d = new Date(dateString + 'T00:00:00');
      return d.toLocaleDateString('ar-EG', { weekday: 'long' });
    } catch {
      return 'اليوم المحدد';
    }
  };

  const formatArabicFullDate = (dateString: string): string => {
    try {
      const d = new Date(dateString + 'T00:00:00');
      return d.toLocaleDateString('ar-EG', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  const formatTime12h = (timeStr: string): string => {
    try {
      const [hStr, mStr] = timeStr.split(':');
      let h = parseInt(hStr, 10);
      const m = parseInt(mStr || '0', 10);
      const period = h >= 12 ? 'م' : 'ص';
      h = h % 12 || 12;
      const formattedM = String(m).padStart(2, '0');
      return `${h}:${formattedM} ${period}`;
    } catch {
      return timeStr;
    }
  };

  const formatTimeRange = (start: string, end: string): string => {
    return `${formatTime12h(start)} – ${formatTime12h(end)}`;
  };

  const formatTimezone = (tz?: string): string => {
    if (!tz || tz.includes('Cairo') || tz.includes('Egypt')) return 'بتوقيت القاهرة';
    if (tz.includes('Riyadh') || tz.includes('Saudi') || tz.includes('Mecca')) return 'بتوقيت مكة المكرمة';
    return tz;
  };

  // Published slots for the currently active/inspected date
  const publishedSlotsForActiveDate = useMemo(() => {
    return slotsByDate.get(activeDateStr) || [];
  }, [slotsByDate, activeDateStr]);

  // Handlers for slot selection
  const handleSelectPublishedSlot = (slot: TutorAvailableSlot) => {
    const dayName = formatArabicDayName(slot.slotDate);
    const formattedDate = formatArabicFullDate(slot.slotDate);
    const timeRange = formatTimeRange(slot.startTime, slot.endTime);
    const timezone = formatTimezone(slot.timezone);

    onSelectSlot({
      id: slot.id,
      dateStr: slot.slotDate,
      dayName,
      formattedDate,
      startTime: slot.startTime,
      endTime: slot.endTime,
      timeRange,
      timezone,
      isPublishedSlot: true,
    });
  };

  const handleSelectFlexibleSlot = (timeTemplate: { start: string; end: string }) => {
    const dayName = formatArabicDayName(activeDateStr);
    const formattedDate = formatArabicFullDate(activeDateStr);
    const timeRange = formatTimeRange(timeTemplate.start, timeTemplate.end);
    const timezone = 'بتوقيت القاهرة';

    onSelectSlot({
      id: `suggested-${activeDateStr}-${timeTemplate.start}`,
      dateStr: activeDateStr,
      dayName,
      formattedDate,
      startTime: timeTemplate.start,
      endTime: timeTemplate.end,
      timeRange,
      timezone,
      isPublishedSlot: false,
    });
  };

  // Active day metadata
  const activeDayName = formatArabicDayName(activeDateStr);
  const activeFullDate = formatArabicFullDate(activeDateStr);

  return (
    <div className="w-full space-y-4">
      {/* 1. Header with clarity and trust notice */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-[#0D4E8B]/10 text-[#0D4E8B] flex items-center justify-center shrink-0">
            <CalendarDays className="w-5 h-5 text-[#0D4E8B]" />
          </div>
          <div>
            <h3 className="font-['Cairo'] text-base sm:text-lg font-bold text-[#0D4E8B] leading-tight">
              التقويم التفاعلي لاختيار موعد الحصة التجريبية
            </h3>
            <p className="text-xs text-[#535E7B] mt-0.5">
              حدّد اليوم والوقت الأنسب لطفلك مباشرة من التقويم
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-bold border border-emerald-200">
            تجربة أولى مجانية ({tutor.trialDurationMinutes} دقيقة)
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-[#F8FAFD] text-[#535E7B] font-medium border border-[#E2E8F0]">
            تنسيق مباشر عبر واتساب
          </span>
        </div>
      </div>

      {/* 2. Interactive Calendar Card Grid */}
      <div className="bg-[#F8FAFD]/60 border border-[#CBD5E1]/80 rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-xs">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ========================================================================= */}
          {/* COLUMN A: Interactive Calendar Widget (7 cols on lg) */}
          {/* ========================================================================= */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-5 shadow-xs space-y-4">
            {/* Calendar Month & Controls Bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-['Cairo'] font-bold text-base sm:text-lg text-[#1F2A44]">
                  {ARABIC_MONTHS[currentMonth]} {currentYear}
                </span>
                <button
                  type="button"
                  onClick={handleJumpToToday}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold text-[#0D4E8B] bg-[#0D4E8B]/10 hover:bg-[#0D4E8B]/20 transition-colors cursor-pointer"
                  title="العودة لشهر اليوم"
                >
                  اليوم
                </button>
              </div>

              {/* Month Navigation Arrows (RTL: Right is Prev, Left is Next) */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  aria-label="الشهر السابق"
                  className="w-8 h-8 rounded-xl border border-[#CBD5E1] hover:bg-[#F2F3F6] text-[#1F2A44] flex items-center justify-center transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  aria-label="الشهر القادم"
                  className="w-8 h-8 rounded-xl border border-[#CBD5E1] hover:bg-[#F2F3F6] text-[#1F2A44] flex items-center justify-center transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Weekday Names Header */}
            <div className="grid grid-cols-7 gap-1 text-center font-['Cairo'] text-xs font-bold text-[#535E7B] pb-1 border-b border-[#F1F5F9]">
              {WEEKDAY_NAMES.map((wd) => (
                <div key={wd.key} className="py-1">
                  <span className="hidden sm:inline">{wd.full}</span>
                  <span className="sm:hidden">{wd.short}</span>
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {calendarDays.map((day, idx) => {
                const isSelectedDate = day.dateStr === activeDateStr;
                const isDisabled = day.isPast;

                return (
                  <button
                    key={`${day.dateStr}-${idx}`}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => {
                      if (!isDisabled) {
                        setActiveDateStr(day.dateStr);
                      }
                    }}
                    className={`relative min-h-[44px] sm:min-h-[48px] rounded-xl flex flex-col items-center justify-center p-1 font-['Cairo'] transition-all cursor-pointer select-none ${
                      isSelectedDate
                        ? 'bg-[#0D4E8B] text-white shadow-md font-bold scale-[1.03] z-10 ring-2 ring-[#0D4E8B]/20'
                        : isDisabled
                        ? 'text-slate-300 bg-slate-50/60 cursor-not-allowed border border-transparent'
                        : day.isCurrentMonth
                        ? 'text-[#1F2A44] bg-white border border-[#E2E8F0] hover:border-[#0D4E8B] hover:bg-[#F0F6FD]'
                        : 'text-slate-400 bg-slate-50/50 border border-slate-100 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-xs sm:text-sm leading-none font-semibold">
                      {day.dayNumber}
                    </span>

                    {/* Today indicator border ring */}
                    {day.isToday && !isSelectedDate && (
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500" title="اليوم الحالي" />
                    )}

                    {/* Published slots indicator */}
                    {day.hasPublishedSlots && (
                      <div className="flex items-center justify-center mt-1">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isSelectedDate ? 'bg-[#FFC629]' : 'bg-emerald-500'
                          }`}
                          title={`يوجد ${day.slotsCount} موعد معتمد`}
                        />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Calendar Legend */}
            <div className="pt-2 border-t border-[#F1F5F9] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#64748B]">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                <span>أيام بمواعيد معتمدة من المعلم</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-md bg-[#0D4E8B] inline-block" />
                <span>اليوم المختار</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                <span>اليوم الحالي</span>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* COLUMN B: Time Slots for Selected Date (5 cols on lg) */}
          {/* ========================================================================= */}
          <div className="lg:col-span-5 flex flex-col space-y-4">
            {/* Active Date Card Header */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-[#0D4E8B]" />
                  <span className="font-['Cairo'] font-bold text-sm text-[#0D4E8B]">
                    المواعيد المتاحة ليوم:
                  </span>
                </div>
                <span className="text-[11px] font-bold text-[#535E7B] bg-[#F1F5F9] px-2 py-0.5 rounded-md">
                  {activeDayName}
                </span>
              </div>
              <p className="font-['Cairo'] font-extrabold text-sm sm:text-base text-[#1F2A44]">
                {activeFullDate}
              </p>
            </div>

            {/* Slots List Container */}
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 shadow-xs space-y-3.5 flex-1">
              {isLoadingSlots ? (
                <div className="p-8 text-center text-xs text-[#64748B] space-y-2">
                  <div className="w-6 h-6 border-2 border-[#0D4E8B]/20 border-t-[#0D4E8B] rounded-full animate-spin mx-auto" />
                  <p>جاري تحديث مواعيد المعلم...</p>
                </div>
              ) : publishedSlotsForActiveDate.length > 0 ? (
                /* 1. If teacher published specific slots on this date */
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-800 bg-emerald-50/80 px-2.5 py-1 rounded-lg border border-emerald-200/80">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                      <span>مواعيد معتمدة مسبقاً من المعلم:</span>
                    </span>
                    <span className="text-[11px]">({publishedSlotsForActiveDate.length} موعد)</span>
                  </div>

                  <div className="space-y-2">
                    {publishedSlotsForActiveDate.map((slot) => {
                      const isSelected = selectedSlot?.id === slot.id;
                      const timeRangeFormatted = formatTimeRange(slot.startTime, slot.endTime);
                      const tz = formatTimezone(slot.timezone);

                      return (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => handleSelectPublishedSlot(slot)}
                          className={`w-full p-3 rounded-xl border text-right transition-all flex items-center justify-between gap-3 cursor-pointer ${
                            isSelected
                              ? 'bg-[#0D4E8B] text-white border-[#0D4E8B] shadow-sm ring-2 ring-[#0D4E8B]/20'
                              : 'bg-[#F8FAFD] text-[#1F2A44] border-[#CBD5E1]/80 hover:border-[#0D4E8B] hover:bg-white'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <Clock className={`w-4 h-4 shrink-0 ${isSelected ? 'text-[#FFC629]' : 'text-[#0D4E8B]'}`} />
                            <div className="text-right">
                              <span className="font-['Cairo'] font-bold text-xs sm:text-sm block">
                                {timeRangeFormatted}
                              </span>
                              <span className={`text-[11px] ${isSelected ? 'text-white/80' : 'text-[#64748B]'}`}>
                                {tz} · مدة الحصة: {tutor.trialDurationMinutes} دقيقة
                              </span>
                            </div>
                          </div>

                          <div
                            className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                              isSelected ? 'border-white bg-white text-[#0D4E8B]' : 'border-[#CBD5E1] bg-white'
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* 2. Flexible suggested slots for any selected date */
                <div className="space-y-3">
                  <div className="p-2.5 rounded-xl bg-[#F0F6FD] border border-[#D1DCFE] text-xs space-y-1">
                    <p className="font-['Cairo'] font-bold text-[#0D4E8B] flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#0D4E8B]" />
                      <span>اختر الفترة الأنسب لطفلك في هذا اليوم:</span>
                    </p>
                    <p className="text-[11px] text-[#535E7B] leading-relaxed">
                      الحصة التجريبية مدتها {tutor.trialDurationMinutes} دقيقة مجاناً. اختر الوقت الملائم لجدول طفلك:
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {DEFAULT_TRIAL_PERIODS.map((p, idx) => {
                      const slotId = `suggested-${activeDateStr}-${p.start}`;
                      const isSelected = selectedSlot?.id === slotId;
                      const timeLabel = formatTimeRange(p.start, p.end);

                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectFlexibleSlot(p)}
                          className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                            isSelected
                              ? 'bg-[#0D4E8B] text-white border-[#0D4E8B] shadow-sm ring-2 ring-[#0D4E8B]/20 font-bold'
                              : 'bg-[#F8FAFD] text-[#1F2A44] border-[#E2E8F0] hover:border-[#0D4E8B] hover:bg-white text-xs font-semibold'
                          }`}
                        >
                          <span className="font-['Cairo'] text-xs sm:text-sm">
                            {timeLabel}
                          </span>
                          <span className={`text-[10px] ${isSelected ? 'text-white/80' : 'text-[#64748B]'}`}>
                            {p.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3. Selected Appointment Instant Feedback Card */}
              {selectedSlot ? (
                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-1.5 mt-2">
                  <div className="flex items-center gap-1.5 font-['Cairo'] font-bold text-emerald-900">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>الموعد المعتمد لاختيارك:</span>
                  </div>
                  <div className="pr-5 space-y-0.5 font-medium text-emerald-900">
                    <p>
                      <strong>{selectedSlot.dayName}</strong>، {selectedSlot.formattedDate}
                    </p>
                    <p className="font-bold text-emerald-800">
                      الساعة: {selectedSlot.timeRange} ({selectedSlot.timezone})
                    </p>
                  </div>
                  <p className="text-[11px] text-emerald-800/80 pr-5 pt-0.5 leading-relaxed">
                    يُدرج هذا الموعد تلقائيًا في رسالة الحجز عبر واتساب للتنسيق المباشر والتثبيت.
                  </p>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs text-amber-900 flex items-start gap-2">
                  <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-relaxed">
                    اضغط على أي وقت أعلاه لتحديده لحصة طفلك التجريبية المجانية.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
