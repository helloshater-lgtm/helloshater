import React, { useState, useMemo } from 'react';
import { DirectTrialBooking } from '../../types';
import { DirectTrialBookingService } from '../../services/directTrialBookingService';
import {
  formatBookingInOwnTimezone,
  getDirectTrialStatusMeta,
  hasBookingEnded,
  validateMeetingUrl,
} from '../../utils/directTrialBooking';
import { toArabicDigits } from '../../utils/formatters';
import {
  Video,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  RefreshCw,
  ExternalLink,
  CalendarCheck2,
  Link2,
} from 'lucide-react';

interface TutorDirectTrialsTabProps {
  bookings: DirectTrialBooking[];
  isLoading: boolean;
  loadError: string | null;
  onRefresh: () => Promise<void> | void;
}

type TutorDirectTrialFilter = 'all' | 'needs_link' | 'confirmed' | 'completed' | 'cancelled';

export const TutorDirectTrialsTab: React.FC<TutorDirectTrialsTabProps> = ({
  bookings,
  isLoading,
  loadError,
  onRefresh,
}) => {
  const [filter, setFilter] = useState<TutorDirectTrialFilter>('all');
  const [meetingInputs, setMeetingInputs] = useState<Record<string, string>>({});
  const [savingLinkId, setSavingLinkId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [confirmCompleteId, setConfirmCompleteId] = useState<string | null>(null);
  const [rowErrorMap, setRowErrorMap] = useState<Record<string, string>>({});
  const [rowSuccessMap, setRowSuccessMap] = useState<Record<string, string>>({});

  const counts = useMemo(() => {
    const confirmed = bookings.filter((b) => b.status === 'confirmed');
    return {
      all: bookings.length,
      needsLink: confirmed.filter((b) => !b.meetingUrl).length,
      confirmed: confirmed.length,
      completed: bookings.filter((b) => b.status === 'completed').length,
      cancelled: bookings.filter((b) => b.status === 'cancelled').length,
    };
  }, [bookings]);

  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (filter === 'needs_link') return b.status === 'confirmed' && !b.meetingUrl;
      if (filter === 'confirmed') return b.status === 'confirmed';
      if (filter === 'completed') return b.status === 'completed';
      if (filter === 'cancelled') return b.status === 'cancelled';
      return true;
    });
  }, [bookings, filter]);

  const handleSaveMeetingLink = async (booking: DirectTrialBooking) => {
    const rawValue = meetingInputs[booking.id] ?? booking.meetingUrl ?? '';
    const validation = validateMeetingUrl(rawValue);

    setRowErrorMap((prev) => ({ ...prev, [booking.id]: '' }));
    setRowSuccessMap((prev) => ({ ...prev, [booking.id]: '' }));

    if (!validation.isValid) {
      setRowErrorMap((prev) => ({
        ...prev,
        [booking.id]: validation.error || 'يرجى إدخال رابط Google Meet أو Zoom صحيح.',
      }));
      return;
    }

    setSavingLinkId(booking.id);
    try {
      await DirectTrialBookingService.tutorSetDirectTrialMeeting({
        bookingId: booking.id,
        meetingUrl: validation.normalizedUrl,
      });
      setMeetingInputs((prev) => ({
        ...prev,
        [booking.id]: validation.normalizedUrl,
      }));
      setRowSuccessMap((prev) => ({
        ...prev,
        [booking.id]: `تم حفظ رابط ${validation.providerLabel} بنجاح وسيظهر لولي الأمر فوراً في «حجوزاتي».`,
      }));
      await onRefresh();
    } catch (err: any) {
      setRowErrorMap((prev) => ({
        ...prev,
        [booking.id]: err?.message || 'تعذر حفظ رابط الحصة. يرجى المحاولة مرة أخرى.',
      }));
    } finally {
      setSavingLinkId(null);
    }
  };

  const handleMarkCompleted = async (booking: DirectTrialBooking) => {
    setRowErrorMap((prev) => ({ ...prev, [booking.id]: '' }));
    setRowSuccessMap((prev) => ({ ...prev, [booking.id]: '' }));
    setCompletingId(booking.id);
    try {
      await DirectTrialBookingService.tutorMarkDirectTrialCompleted(booking.id);
      setConfirmCompleteId(null);
      setRowSuccessMap((prev) => ({
        ...prev,
        [booking.id]: 'تم تسجيل إتمام الحصة التجريبية بنجاح.',
      }));
      await onRefresh();
    } catch (err: any) {
      setRowErrorMap((prev) => ({
        ...prev,
        [booking.id]: err?.message || 'تعذر تسجيل إتمام الحصة حالياً.',
      }));
    } finally {
      setCompletingId(null);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Section Header */}
      <div className="bg-white rounded-3xl border border-[#E2E8F0] p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#F0F5FA] border border-[#D1DCFE] text-[#0D4E8B] flex items-center justify-center shrink-0">
              <CalendarCheck2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-['Cairo'] text-base sm:text-lg font-extrabold text-[#1F2A44]">
                الحجوزات التجريبية المباشرة
              </h2>
              <p className="text-xs text-[#64748B] leading-relaxed mt-0.5">
                تابع الحصص التجريبية المحجوزة مباشرة معك، وأضف رابط Google Meet أو Zoom ليظهر لولي الأمر في صفحة «حجوزاتي».
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onRefresh()}
            disabled={isLoading}
            className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#1F2A44] text-xs font-bold transition-colors inline-flex items-center gap-1.5 self-end sm:self-auto cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>تحديث الحجوزات</span>
          </button>
        </div>

        {/* Summary Filter Chips */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {[
            { id: 'all' as const, label: 'الكل', count: counts.all },
            { id: 'needs_link' as const, label: 'بانتظار رابط الحصة', count: counts.needsLink },
            { id: 'confirmed' as const, label: 'مؤكدة', count: counts.confirmed },
            { id: 'completed' as const, label: 'مكتملة', count: counts.completed },
            { id: 'cancelled' as const, label: 'ملغاة', count: counts.cancelled },
          ].map((item) => {
            const active = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                  active
                    ? 'bg-[#0D4E8B] text-white border-[#0D4E8B]'
                    : item.id === 'needs_link' && item.count > 0
                    ? 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
                    : 'bg-[#F8F9FC] text-[#535E7B] border-[#E2E8F0] hover:border-[#0D4E8B]/40'
                }`}
              >
                <span>{item.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-md text-[10px] ${
                    active ? 'bg-white/20 text-white' : 'bg-white text-[#1F2A44]'
                  }`}
                >
                  {toArabicDigits(item.count)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {loadError && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <span>{loadError}</span>
        </div>
      )}

      {isLoading && bookings.length === 0 ? (
        <div className="bg-white rounded-3xl border border-[#E2E8F0] p-12 text-center flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-7 h-7 text-[#0D4E8B] animate-spin" />
          <p className="text-xs sm:text-sm text-[#64748B]">جاري تحميل الحجوزات التجريبية...</p>
        </div>
      ) : filteredBookings.length === 0 ? (
        <div className="bg-white rounded-3xl border border-[#E2E8F0] p-8 text-center space-y-2">
          <Clock className="w-8 h-8 text-[#94A3B8] mx-auto" />
          <h3 className="font-['Cairo'] text-sm font-bold text-[#1F2A44]">
            {bookings.length === 0
              ? 'لا توجد حجوزات تجريبية مباشرة حتى الآن'
              : 'لا توجد حجوزات ضمن هذا التصنيف'}
          </h3>
          <p className="text-xs text-[#64748B] max-w-md mx-auto leading-relaxed">
            عندما يحجز ولي الأمر موعدًا من مواعيد التجارب المجانية المنشورة لديك، سيظهر هنا لإضافة رابط Google Meet أو Zoom.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredBookings.map((booking) => {
            const timeInfo = formatBookingInOwnTimezone(
              booking.startsAt,
              booking.endsAt,
              booking.timezone
            );
            const statusMeta = getDirectTrialStatusMeta(booking.status);
            const currentInputValue =
              meetingInputs[booking.id] !== undefined
                ? meetingInputs[booking.id]
                : booking.meetingUrl || '';
            const ended = hasBookingEnded(booking.endsAt);
            const rowError = rowErrorMap[booking.id];
            const rowSuccess = rowSuccessMap[booking.id];
            const isSavingLink = savingLinkId === booking.id;
            const isCompleting = completingId === booking.id;
            const isConfirmingComplete = confirmCompleteId === booking.id;

            return (
              <div
                key={booking.id}
                className="bg-white rounded-2xl sm:rounded-3xl border border-[#E2E8F0] p-5 shadow-xs space-y-4"
              >
                {/* Booking Top Summary */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-['Cairo'] text-sm sm:text-base font-extrabold text-[#1F2A44]">
                        حصة تجريبية مجانية
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-md border text-[11px] font-bold ${statusMeta.badgeClassName}`}
                      >
                        {statusMeta.label}
                      </span>
                      {booking.status === 'confirmed' && !booking.meetingUrl && (
                        <span className="px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-bold">
                          ينقصها رابط الحصة
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#64748B]">{timeInfo.timezoneLabel}</p>
                  </div>

                  <div className="bg-[#F8F9FC] border border-[#E2E8F0] rounded-xl px-3.5 py-2 space-y-0.5">
                    <div className="font-['Cairo'] text-xs font-extrabold text-[#1F2A44]">
                      {timeInfo.fullDateLabel}
                    </div>
                    <div className="text-xs font-bold text-[#0D4E8B] flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span>{timeInfo.timeRangeLabel}</span>
                    </div>
                  </div>
                </div>

                {/* Meeting URL Form for Confirmed Bookings */}
                {booking.status === 'confirmed' && (
                  <div className="p-4 rounded-2xl bg-[#F8F9FC] border border-[#E2E8F0] space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label
                        htmlFor={`meeting-url-${booking.id}`}
                        className="font-['Cairo'] text-xs font-bold text-[#1F2A44] flex items-center gap-1.5"
                      >
                        <Video className="w-4 h-4 text-[#0D4E8B]" />
                        <span>رابط Google Meet أو Zoom للحصة</span>
                      </label>
                      {booking.meetingUrl && (
                        <a
                          href={booking.meetingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-bold text-emerald-700 hover:underline inline-flex items-center gap-1"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>فتح الرابط المحفوظ</span>
                        </a>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <input
                        id={`meeting-url-${booking.id}`}
                        type="url"
                        dir="ltr"
                        value={currentInputValue}
                        onChange={(e) =>
                          setMeetingInputs((prev) => ({
                            ...prev,
                            [booking.id]: e.target.value,
                          }))
                        }
                        placeholder="https://meet.google.com/xxx-xxxx-xxx أو https://zoom.us/j/..."
                        className="flex-1 min-h-[42px] px-3.5 py-2 rounded-xl border border-[#CBD5E1] bg-white text-xs sm:text-sm text-[#1F2A44] focus:outline-hidden focus:border-[#0D4E8B]"
                      />
                      <button
                        type="button"
                        disabled={isSavingLink}
                        onClick={() => handleSaveMeetingLink(booking)}
                        className="min-h-[42px] px-4 py-2 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white font-['Cairo'] font-bold text-xs transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 shrink-0"
                      >
                        {isSavingLink ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>جاري الحفظ...</span>
                          </>
                        ) : (
                          <>
                            <Link2 className="w-3.5 h-3.5" />
                            <span>{booking.meetingUrl ? 'تحديث الرابط' : 'حفظ رابط الحصة'}</span>
                          </>
                        )}
                      </button>
                    </div>

                    {rowError && (
                      <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-start gap-1.5">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{rowError}</span>
                      </div>
                    )}

                    {rowSuccess && (
                      <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-start gap-1.5">
                        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{rowSuccess}</span>
                      </div>
                    )}

                    {/* Mark Completed Action */}
                    <div className="pt-2 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2">
                      {!ended ? (
                        <span className="text-[11px] text-[#64748B]">
                          يتاح زر «تسجيل إتمام الحصة» تلقائياً بعد انتهاء وقت الحصة.
                        </span>
                      ) : !isConfirmingComplete ? (
                        <>
                          <span className="text-[11px] text-emerald-800 font-medium">
                            انتهى وقت الموعد — يمكنك تأكيد إتمام الحصة الآن.
                          </span>
                          <button
                            type="button"
                            onClick={() => setConfirmCompleteId(booking.id)}
                            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>تسجيل إتمام الحصة</span>
                          </button>
                        </>
                      ) : (
                        <div className="w-full flex flex-wrap items-center justify-between gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                          <span className="text-xs font-bold text-emerald-900">
                            هل تم تقديم الحصة التجريبية بالكامل؟
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={isCompleting}
                              onClick={() => handleMarkCompleted(booking)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                            >
                              {isCompleting && <Loader2 className="w-3 h-3 animate-spin" />}
                              <span>نعم، تم الإتمام</span>
                            </button>
                            <button
                              type="button"
                              disabled={isCompleting}
                              onClick={() => setConfirmCompleteId(null)}
                              className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold cursor-pointer"
                            >
                              إلغاء
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {booking.status === 'completed' && (
                  <div className="p-3 rounded-xl bg-[#F0F5FA] border border-[#D1DCFE] text-xs font-bold text-[#0D4E8B] flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>تم تسجيل إتمام هذه الحصة التجريبية.</span>
                  </div>
                )}

                {booking.status === 'cancelled' && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-800">
                    تم إلغاء هذا الحجز من الإدارة.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
