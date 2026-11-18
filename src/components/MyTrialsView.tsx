import React, { useState, useEffect, useCallback } from 'react';
import { DirectTrialBooking } from '../types';
import { DirectTrialBookingService } from '../services/directTrialBookingService';
import {
  formatBookingInOwnTimezone,
  getDirectTrialStatusMeta,
  saveDirectTrialReturnTarget,
  loadDirectTrialReturnTarget,
  clearDirectTrialReturnTarget,
} from '../utils/directTrialBooking';
import {
  CalendarCheck2,
  Clock,
  ExternalLink,
  Mail,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Video,
  Copy,
  Check,
  RefreshCw,
  LogOut,
  ArrowRight,
  User,
} from 'lucide-react';

interface MyTrialsViewProps {
  onNavigateHome: () => void;
  onSelectTutor: (tutorId: string) => void;
}

export const MyTrialsView: React.FC<MyTrialsViewProps> = ({
  onNavigateHome,
  onSelectTutor,
}) => {
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id: string; email?: string | null } | null>(null);

  // OTP Login state
  const [emailInput, setEmailInput] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [otpSentEmail, setOtpSentEmail] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);

  // Bookings state
  const [bookings, setBookings] = useState<DirectTrialBooking[]>([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState(false);
  const [bookingsError, setBookingsError] = useState<string | null>(null);
  const [copiedBookingId, setCopiedBookingId] = useState<string | null>(null);

  const loadBookings = useCallback(async () => {
    setIsLoadingBookings(true);
    setBookingsError(null);
    try {
      const list = await DirectTrialBookingService.parentGetMyTrialBookings();
      setBookings(list);
    } catch (err: any) {
      setBookingsError(err?.message || 'تعذر تحميل حجوزاتك التجريبية حالياً.');
    } finally {
      setIsLoadingBookings(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    DirectTrialBookingService.getCurrentSessionUser()
      .then((user) => {
        if (!isMounted) return;
        setCurrentUser(user);
        setAuthChecked(true);
        if (user) {
          if (loadDirectTrialReturnTarget()?.target === 'my-trials') {
            clearDirectTrialReturnTarget();
          }
          loadBookings();
        }
      })
      .catch(() => {
        if (isMounted) {
          setCurrentUser(null);
          setAuthChecked(true);
        }
      });

    const unsubscribe = DirectTrialBookingService.onAuthStateChange((user) => {
      if (!isMounted) return;
      setCurrentUser(user);
      setAuthChecked(true);
      if (user) {
        if (loadDirectTrialReturnTarget()?.target === 'my-trials') {
          clearDirectTrialReturnTarget();
        }
        loadBookings();
      } else {
        setBookings([]);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [loadBookings]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError(null);
    setIsSendingOtp(true);
    try {
      const redirectUrl = `${window.location.origin}${window.location.pathname}?direct_return=my-trials`;
      saveDirectTrialReturnTarget('my-trials');
      await DirectTrialBookingService.signInParentWithOtp(emailInput, redirectUrl);
      setOtpSentEmail(emailInput.trim());
    } catch (err: any) {
      setOtpError(err?.message || 'تعذر إرسال رابط الدخول إلى بريدك.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleSignOut = async () => {
    await DirectTrialBookingService.signOutSession();
    setCurrentUser(null);
    setBookings([]);
    setOtpSentEmail(null);
  };

  const handleCopyMeetingUrl = (bookingId: string, url: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url).catch(() => {});
      setCopiedBookingId(bookingId);
      setTimeout(() => {
        setCopiedBookingId((prev) => (prev === bookingId ? null : prev));
      }, 2000);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6 animate-fade-in">
      {/* Header Row */}
      <div className="bg-white rounded-3xl border border-[#E2E8F0] p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#F0F5FA] border border-[#D1DCFE] text-[#0D4E8B] flex items-center justify-center shrink-0">
              <CalendarCheck2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-['Cairo'] text-lg sm:text-xl font-extrabold text-[#1F2A44]">
                حجوزاتي التجريبية
              </h1>
              <p className="text-xs text-[#64748B]">
                تابع مواعيد الحصص التجريبية المجانية وروابط الانضمام فور إضافتها من المعلم
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={onNavigateHome}
            className="min-h-[40px] px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8F9FC] hover:bg-[#F0F5FA] text-xs font-bold text-[#0D4E8B] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>تصفح المعلمين</span>
          </button>

          {currentUser && (
            <>
              <button
                type="button"
                onClick={loadBookings}
                disabled={isLoadingBookings}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-[#1F2A44] transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingBookings ? 'animate-spin' : ''}`} />
                <span>تحديث</span>
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="min-h-[40px] px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-xs font-bold text-rose-700 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>خروج</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Auth Gate or Bookings List */}
      {!authChecked ? (
        <div className="bg-white rounded-3xl border border-[#E2E8F0] p-12 text-center flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-[#0D4E8B] animate-spin" />
          <p className="text-xs sm:text-sm text-[#64748B]">جاري التحقق من الجلسة...</p>
        </div>
      ) : !currentUser ? (
        <div className="bg-white rounded-3xl border border-[#E2E8F0] p-6 sm:p-8 shadow-xs max-w-lg mx-auto space-y-5">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-[#F0F5FA] text-[#0D4E8B] border border-[#D1DCFE] flex items-center justify-center mx-auto">
              <Mail className="w-6 h-6" />
            </div>
            <h2 className="font-['Cairo'] text-base sm:text-lg font-extrabold text-[#1F2A44]">
              سجّل الدخول لعرض حجوزاتك
            </h2>
            <p className="text-xs text-[#64748B] leading-relaxed">
              أدخل البريد الإلكتروني الذي استخدمته عند حجز الحصة التجريبية، وسنرسل لك رابط دخول مباشر دون كلمة مرور.
            </p>
          </div>

          {otpSentEmail ? (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-3 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
              <div className="space-y-1">
                <p className="font-['Cairo'] text-sm font-bold text-emerald-900">
                  تم إرسال رابط الدخول بنجاح
                </p>
                <p className="text-xs text-emerald-800 leading-relaxed">
                  افتح بريدك الإلكتروني (<span dir="ltr" className="font-bold">{otpSentEmail}</span>) واضغط على رابط الدخول لتُفتح صفحة «حجوزاتي» تلقائياً.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOtpSentEmail(null)}
                className="text-xs font-bold text-[#0D4E8B] hover:underline cursor-pointer"
              >
                إرسال الرابط لبريد آخر
              </button>
            </div>
          ) : (
            <form onSubmit={handleSendOtp} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#1F2A44] mb-1.5">
                  البريد الإلكتروني لولي الأمر
                </label>
                <input
                  type="email"
                  required
                  dir="ltr"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="parent@example.com"
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] text-sm text-[#1F2A44] focus:outline-hidden focus:border-[#0D4E8B]"
                />
              </div>

              {otpError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{otpError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSendingOtp}
                className="w-full min-h-[44px] py-3 px-4 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white font-['Cairo'] font-bold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isSendingOtp ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري الإرسال...</span>
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4" />
                    <span>إرسال رابط الدخول لبريدك</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Active user banner */}
          <div className="px-4 py-2.5 rounded-2xl bg-[#F0F5FA] border border-[#D1DCFE] flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-[#1F2A44] font-medium flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#0D4E8B]" />
              <span>مسجل الدخول بالحساب:</span>
              <strong dir="ltr" className="text-[#0D4E8B]">{currentUser.email || currentUser.id}</strong>
            </span>
            <span className="text-[11px] text-[#535E7B]">
              يتم عرض جميع المواعيد حسب المنطقة الزمنية لكل حجز
            </span>
          </div>

          {bookingsError && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <span>{bookingsError}</span>
            </div>
          )}

          {isLoadingBookings ? (
            <div className="bg-white rounded-3xl border border-[#E2E8F0] p-12 text-center flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-7 h-7 text-[#0D4E8B] animate-spin" />
              <p className="text-xs sm:text-sm text-[#64748B]">جاري تحميل حجوزاتك...</p>
            </div>
          ) : bookings.length === 0 ? (
            <div className="bg-white rounded-3xl border border-[#E2E8F0] p-8 sm:p-10 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-[#64748B] flex items-center justify-center mx-auto">
                <CalendarCheck2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h2 className="font-['Cairo'] text-base font-extrabold text-[#1F2A44]">
                  لا توجد حجوزات تجريبية مسجلة بعد
                </h2>
                <p className="text-xs sm:text-sm text-[#64748B] max-w-md mx-auto leading-relaxed">
                  اختر معلمًا مناسبًا لطفلك واحجز حصة تجريبية مجانية مباشرة من ملفه لتظهر تفاصيلها ورابط الانضمام هنا.
                </p>
              </div>
              <button
                type="button"
                onClick={onNavigateHome}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#FFC629] hover:bg-[#F0B517] text-[#1F2A44] font-['Cairo'] font-extrabold text-xs sm:text-sm transition-colors cursor-pointer"
              >
                ابحث عن معلم الآن
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {bookings.map((booking) => {
                const timeInfo = formatBookingInOwnTimezone(
                  booking.startsAt,
                  booking.endsAt,
                  booking.timezone
                );
                const statusMeta = getDirectTrialStatusMeta(booking.status);
                const isCopied = copiedBookingId === booking.id;

                return (
                  <div
                    key={booking.id}
                    className="bg-white rounded-2xl sm:rounded-3xl border border-[#E2E8F0] p-5 shadow-xs space-y-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onSelectTutor(booking.tutorId)}
                            className="font-['Cairo'] text-base font-extrabold text-[#0D4E8B] hover:underline cursor-pointer text-right"
                          >
                            {booking.tutorName || 'معلم شاطر كلاسيز'}
                          </button>
                          <span
                            className={`px-2.5 py-0.5 rounded-md border text-[11px] font-bold ${statusMeta.badgeClassName}`}
                          >
                            {statusMeta.label}
                          </span>
                        </div>
                        <p className="text-xs text-[#64748B]">
                          حصة تجريبية مجانية · {timeInfo.timezoneLabel}
                        </p>
                      </div>

                      <div className="text-right sm:text-left bg-[#F8F9FC] border border-[#E2E8F0] rounded-xl px-3.5 py-2 space-y-0.5">
                        <div className="font-['Cairo'] text-xs font-extrabold text-[#1F2A44]">
                          {timeInfo.fullDateLabel}
                        </div>
                        <div className="text-xs font-bold text-[#0D4E8B] flex items-center gap-1.5 sm:justify-end">
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          <span>{timeInfo.timeRangeLabel}</span>
                        </div>
                      </div>
                    </div>

                    {/* Meeting URL / Status Section */}
                    {booking.status === 'confirmed' && (
                      <div
                        className={`p-4 rounded-2xl border ${
                          booking.meetingUrl
                            ? 'bg-emerald-50/70 border-emerald-200'
                            : 'bg-amber-50/70 border-amber-200'
                        }`}
                      >
                        {booking.meetingUrl ? (
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-0.5 min-w-0">
                              <div className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-900 font-['Cairo']">
                                <Video className="w-4 h-4 text-emerald-700 shrink-0" />
                                <span>رابط الحصة التجريبية جاهز</span>
                              </div>
                              <p
                                dir="ltr"
                                className="text-[11px] text-emerald-800 truncate font-mono"
                              >
                                {booking.meetingUrl}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <a
                                href={booking.meetingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-['Cairo'] font-bold text-xs inline-flex items-center gap-1.5 transition-colors"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                <span>دخول الحصة</span>
                              </a>
                              <button
                                type="button"
                                onClick={() =>
                                  handleCopyMeetingUrl(booking.id, booking.meetingUrl!)
                                }
                                className="min-h-[40px] px-3 py-2 rounded-xl bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                              >
                                {isCopied ? (
                                  <>
                                    <Check className="w-3.5 h-3.5" />
                                    <span>تم النسخ</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>نسخ</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2.5 text-xs text-amber-900">
                            <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                              <span className="font-bold block">
                                حجزك مؤكد وبانتظار إضافة رابط الحصة من المعلم
                              </span>
                              <span className="text-[11px] text-amber-800 block leading-relaxed">
                                سيظهر رابط Google Meet أو Zoom هنا تلقائياً فور إضافته من المعلم قبل موعد الحصة.
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {booking.status === 'completed' && (
                      <div className="p-3.5 rounded-2xl bg-[#F0F5FA] border border-[#D1DCFE] text-xs text-[#0D4E8B] flex items-center justify-between flex-wrap gap-2">
                        <span className="font-bold flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>تم إتمام هذه الحصة التجريبية بنجاح.</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => onSelectTutor(booking.tutorId)}
                          className="text-xs font-bold underline cursor-pointer"
                        >
                          الانتقال لملف المعلم لاختيار الباقة المناسبة
                        </button>
                      </div>
                    )}

                    {booking.status === 'cancelled' && (
                      <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center justify-between flex-wrap gap-2">
                        <span className="font-bold">تم إلغاء هذا الحجز التجريبي.</span>
                        <button
                          type="button"
                          onClick={() => onSelectTutor(booking.tutorId)}
                          className="text-xs font-bold underline cursor-pointer"
                        >
                          اختر موعدًا آخر
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
