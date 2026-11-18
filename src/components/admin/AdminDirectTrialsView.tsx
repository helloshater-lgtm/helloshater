import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AdminDirectTrialBooking } from '../../types';
import { AdminTutorListItem } from '../../services/adminService';
import { DirectTrialBookingService } from '../../services/directTrialBookingService';
import {
  buildAdminDirectTrialGuardianWhatsAppDraft,
  buildAdminDirectTrialTutorWhatsAppDraft,
  formatBookingInOwnTimezone,
  getDirectTrialStatusMeta,
} from '../../utils/directTrialBooking';
import { toArabicDigits } from '../../utils/formatters';
import {
  CalendarCheck2,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  MessageCircle,
  Copy,
  Check,
  ExternalLink,
  Search,
  Video,
  XCircle,
  Phone,
  User,
} from 'lucide-react';

interface AdminDirectTrialsViewProps {
  tutorsList: AdminTutorListItem[];
  onCountChange?: (counts: { total: number; missingLink: number; confirmed: number }) => void;
}

type AdminTrialFilter = 'all' | 'missing_link' | 'confirmed' | 'completed' | 'cancelled';

export const AdminDirectTrialsView: React.FC<AdminDirectTrialsViewProps> = ({
  tutorsList,
  onCountChange,
}) => {
  const [bookings, setBookings] = useState<AdminDirectTrialBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [filter, setFilter] = useState<AdminTrialFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Cancel confirmation state
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Manual WhatsApp draft panel per booking
  const [openDraftKey, setOpenDraftKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const tutorContactMap = useMemo(() => {
    const map = new Map<string, AdminTutorListItem>();
    for (const item of tutorsList) {
      map.set(item.id, item);
    }
    return map;
  }, [tutorsList]);

  const loadBookings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await DirectTrialBookingService.adminGetDirectTrialBookings();
      setBookings(list);
      const confirmed = list.filter((b) => b.status === 'confirmed');
      onCountChange?.({
        total: list.length,
        missingLink: confirmed.filter((b) => !b.meetingUrl).length,
        confirmed: confirmed.length,
      });
    } catch (err: any) {
      setError(err?.message || 'تعذر تحميل الحجوزات التجريبية المباشرة.');
    } finally {
      setIsLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  const stats = useMemo(() => {
    const confirmed = bookings.filter((b) => b.status === 'confirmed');
    return {
      total: bookings.length,
      confirmed: confirmed.length,
      missingLink: confirmed.filter((b) => !b.meetingUrl).length,
      completed: bookings.filter((b) => b.status === 'completed').length,
      cancelled: bookings.filter((b) => b.status === 'cancelled').length,
    };
  }, [bookings]);

  const filteredBookings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return bookings.filter((b) => {
      if (filter === 'missing_link' && !(b.status === 'confirmed' && !b.meetingUrl)) {
        return false;
      }
      if (filter === 'confirmed' && b.status !== 'confirmed') return false;
      if (filter === 'completed' && b.status !== 'completed') return false;
      if (filter === 'cancelled' && b.status !== 'cancelled') return false;

      if (!q) return true;
      return (
        b.guardianName.toLowerCase().includes(q) ||
        b.guardianWhatsApp.toLowerCase().includes(q) ||
        b.tutorName.toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q)
      );
    });
  }, [bookings, filter, searchQuery]);

  const handleConfirmCancel = async (bookingId: string) => {
    setCancellingId(bookingId);
    setError(null);
    setSuccessMsg(null);
    try {
      await DirectTrialBookingService.adminCancelDirectTrial(bookingId);
      setConfirmCancelId(null);
      setSuccessMsg('تم إلغاء الحجز التجريبي وتحديث الحالة بنجاح.');
      await loadBookings();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'فشل إلغاء الحجز التجريبي.');
    } finally {
      setCancellingId(null);
    }
  };

  const handleCopyText = (key: string, text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 2000);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header + Stats */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F0F6FD] text-[#0D4E8B] flex items-center justify-center shrink-0">
              <CalendarCheck2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-['Cairo'] text-base sm:text-lg font-bold text-[#1F2A44]">
                متابعة الحجوزات التجريبية المباشرة
              </h2>
              <p className="text-xs text-[#64748B]">
                مراقبة الحجوزات المؤكدة، التنبيه عند نقص رابط الحصة، وتجهيز رسائل واتساب يدوية للمعلم وولي الأمر
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={loadBookings}
            disabled={isLoading}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#1F2A44] text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 self-end sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>تحديث القائمة</span>
          </button>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {[
            { id: 'all' as const, label: 'إجمالي الحجوزات', count: stats.total, tone: 'bg-[#F8F9FC] border-[#E2E8F0] text-[#1F2A44]' },
            { id: 'missing_link' as const, label: 'ينقصها رابط الحصة', count: stats.missingLink, tone: stats.missingLink > 0 ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-[#F8F9FC] border-[#E2E8F0] text-[#1F2A44]' },
            { id: 'confirmed' as const, label: 'مؤكدة', count: stats.confirmed, tone: 'bg-emerald-50/70 border-emerald-200 text-emerald-900' },
            { id: 'completed' as const, label: 'مكتملة', count: stats.completed, tone: 'bg-[#F0F5FA] border-[#D1DCFE] text-[#0D4E8B]' },
            { id: 'cancelled' as const, label: 'ملغاة', count: stats.cancelled, tone: 'bg-rose-50/70 border-rose-200 text-rose-900' },
          ].map((card) => {
            const isSelected = filter === card.id;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => setFilter(card.id)}
                className={`p-3 rounded-xl border text-right transition-all cursor-pointer ${card.tone} ${
                  isSelected ? 'ring-2 ring-[#0D4E8B]' : 'hover:opacity-90'
                }`}
              >
                <div className="text-[11px] font-bold opacity-80">{card.label}</div>
                <div className="font-['Cairo'] text-lg font-extrabold mt-0.5">
                  {toArabicDigits(card.count)}
                </div>
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-[#94A3B8] absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث باسم ولي الأمر، رقم الواتساب، اسم المعلم، أو رقم الحجز..."
            className="w-full min-h-[42px] pr-10 pl-4 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-xs sm:text-sm text-[#1F2A44] focus:outline-hidden focus:border-[#0D4E8B]"
          />
        </div>
      </div>

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm flex items-center gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="font-bold">{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {isLoading && bookings.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-12 text-center flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-7 h-7 text-[#0D4E8B] animate-spin" />
          <p className="text-xs sm:text-sm text-[#64748B]">جاري تحميل الحجوزات التجريبية...</p>
        </div>
      ) : filteredBookings.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-8 text-center text-xs sm:text-sm text-[#64748B]">
          لا توجد حجوزات مطابقة للبحث أو التصفية الحالية.
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
            const tutorItem = tutorContactMap.get(booking.tutorId);
            const guardianDraft = buildAdminDirectTrialGuardianWhatsAppDraft(booking);
            const tutorDraft = buildAdminDirectTrialTutorWhatsAppDraft(
              booking,
              tutorItem?.contact
            );

            const guardianDraftKey = `${booking.id}:guardian`;
            const tutorDraftKey = `${booking.id}:tutor`;
            const activeDraftPanel =
              openDraftKey === guardianDraftKey
                ? { type: 'guardian' as const, label: 'مسودة واتساب ولي الأمر', draft: guardianDraft }
                : openDraftKey === tutorDraftKey
                ? { type: 'tutor' as const, label: 'مسودة واتساب المعلم', draft: tutorDraft }
                : null;

            const isConfirmingCancel = confirmCancelId === booking.id;
            const isCancelling = cancellingId === booking.id;

            return (
              <div
                key={booking.id}
                className="bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-5 shadow-xs space-y-4"
              >
                {/* Header & Date */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-['Cairo'] text-sm sm:text-base font-extrabold text-[#1F2A44]">
                        {booking.tutorName}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-md border text-[11px] font-bold ${statusMeta.badgeClassName}`}
                      >
                        {statusMeta.label}
                      </span>
                      {booking.status === 'confirmed' && !booking.meetingUrl && (
                        <span className="px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-bold">
                          ينقصه رابط الحصة
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#535E7B]">
                      <span className="inline-flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-[#0D4E8B]" />
                        <span>ولي الأمر:</span>
                        <strong className="text-[#1F2A44]">{booking.guardianName}</strong>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-emerald-600" />
                        <span dir="ltr" className="font-mono font-bold text-[#1F2A44]">
                          {booking.guardianWhatsApp || '—'}
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="bg-[#F8F9FC] border border-[#E2E8F0] rounded-xl px-3.5 py-2 space-y-0.5 text-right md:text-left shrink-0">
                    <div className="font-['Cairo'] text-xs font-extrabold text-[#1F2A44]">
                      {timeInfo.fullDateLabel}
                    </div>
                    <div className="text-xs font-bold text-[#0D4E8B]">
                      {timeInfo.timeRangeLabel}
                    </div>
                    <div className="text-[11px] text-[#64748B]">{timeInfo.timezoneLabel}</div>
                  </div>
                </div>

                {/* Meeting Link Status Row */}
                <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2 text-xs">
                  {booking.meetingUrl ? (
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <Video className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="font-bold text-emerald-800">رابط الحصة:</span>
                      <a
                        href={booking.meetingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        dir="ltr"
                        className="font-mono text-[11px] text-[#0D4E8B] hover:underline truncate max-w-xs sm:max-w-md"
                      >
                        {booking.meetingUrl}
                      </a>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-amber-800 font-bold">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>لم يضف المعلم رابط Google Meet أو Zoom بعد.</span>
                    </div>
                  )}

                  {booking.meetingUrl && (
                    <button
                      type="button"
                      onClick={() => handleCopyText(`${booking.id}:link`, booking.meetingUrl!)}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-[#E2E8F0] text-[11px] font-bold text-[#1F2A44] inline-flex items-center gap-1 cursor-pointer"
                    >
                      {copiedKey === `${booking.id}:link` ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>تم نسخ الرابط</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>نسخ الرابط</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Actions Row: Manual WhatsApp Drafts & Cancel Confirmation */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenDraftKey((prev) =>
                          prev === guardianDraftKey ? null : guardianDraftKey
                        )
                      }
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                        openDraftKey === guardianDraftKey
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                      }`}
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>مسودة واتساب ولي الأمر</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setOpenDraftKey((prev) =>
                          prev === tutorDraftKey ? null : tutorDraftKey
                        )
                      }
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                        openDraftKey === tutorDraftKey
                          ? 'bg-[#0D4E8B] text-white border-[#0D4E8B]'
                          : 'bg-[#F0F5FA] hover:bg-[#E1EEFC] text-[#0D4E8B] border-[#D1DCFE]'
                      }`}
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>مسودة واتساب المعلم</span>
                    </button>
                  </div>

                  {booking.status === 'confirmed' && (
                    <div>
                      {!isConfirmingCancel ? (
                        <button
                          type="button"
                          onClick={() => setConfirmCancelId(booking.id)}
                          className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>إلغاء الحجز</span>
                        </button>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-xl">
                          <span className="text-xs font-bold text-rose-900">
                            تأكيد إلغاء الحجز؟
                          </span>
                          <button
                            type="button"
                            disabled={isCancelling}
                            onClick={() => handleConfirmCancel(booking.id)}
                            className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                          >
                            {isCancelling && <Loader2 className="w-3 h-3 animate-spin" />}
                            <span>نعم، إلغاء</span>
                          </button>
                          <button
                            type="button"
                            disabled={isCancelling}
                            onClick={() => setConfirmCancelId(null)}
                            className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold cursor-pointer"
                          >
                            تراجع
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Expanded Manual WhatsApp Draft Box */}
                {activeDraftPanel && (
                  <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#CBD5E1] space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-['Cairo'] text-xs font-bold text-[#1F2A44]">
                        {activeDraftPanel.label} ({' '}
                        <span dir="ltr" className="font-mono">
                          {activeDraftPanel.draft.phoneDisplay}
                        </span>{' '}
                        )
                      </span>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyText(
                              `${booking.id}:draft:${activeDraftPanel.type}`,
                              activeDraftPanel.draft.messageText
                            )
                          }
                          className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-xs font-bold text-[#1F2A44] inline-flex items-center gap-1 cursor-pointer"
                        >
                          {copiedKey === `${booking.id}:draft:${activeDraftPanel.type}` ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span>تم النسخ</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>نسخ النص</span>
                            </>
                          )}
                        </button>

                        {activeDraftPanel.draft.whatsappUrl ? (
                          <a
                            href={activeDraftPanel.draft.whatsappUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>فتح واتساب الآن</span>
                          </a>
                        ) : (
                          <span className="text-[11px] font-bold text-rose-700">
                            {activeDraftPanel.draft.invalidReason || 'رقم واتساب غير صالح'}
                          </span>
                        )}
                      </div>
                    </div>

                    <pre className="p-3 rounded-xl bg-white border border-slate-200 text-xs text-[#1F2A44] whitespace-pre-wrap font-['Tajawal'] leading-relaxed">
                      {activeDraftPanel.draft.messageText}
                    </pre>
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
