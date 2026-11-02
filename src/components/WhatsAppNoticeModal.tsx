import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { BookingWhatsAppPayload, buildTrialBookingWhatsAppUrl } from '../config/shatirConfig';
import { MessageCircle, Check, Copy, AlertTriangle, X } from 'lucide-react';
import { trackWhatsAppClicked } from '../services/analytics';
import { toArabicDigits } from '../utils/formatters';

interface WhatsAppNoticeModalProps {
  payload: BookingWhatsAppPayload;
  isOpen: boolean;
  onClose: () => void;
}

export const WhatsAppNoticeModal: React.FC<WhatsAppNoticeModalProps> = ({
  payload,
  isOpen,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow || '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const generatedUrl = buildTrialBookingWhatsAppUrl(payload);
  const rawMessageText = decodeURIComponent(generatedUrl.split('text=')[1] || '');

  const handleCopyMessage = () => {
    navigator.clipboard?.writeText(rawMessageText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenWhatsApp = () => {
    trackWhatsAppClicked('trial_booking_modal');
    window.open(generatedUrl, '_blank', 'noopener,noreferrer');
    onClose();
  };

  const modalNode = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="whatsapp-modal-title"
      dir="rtl"
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-[#1F2A44]/80 backdrop-blur-sm overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-xl my-auto max-h-[90dvh] bg-white rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden border border-[#E2E8F0] flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-[#0D4E8B] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
              <MessageCircle className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3
                id="whatsapp-modal-title"
                className="font-['Cairo'] text-sm sm:text-lg font-bold leading-tight truncate"
              >
                التنسيق المباشر عبر واتساب إدارة شاطر
              </h3>
              <span className="text-xs text-[#95C0FF] block">
                خدمة مجانية للتنسيق واختيار الموعد
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق النافذة"
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Important Clarity Notice */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-[#FFF8E7] border border-[#FFE7A3] text-xs text-[#5A4300] space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm text-[#463300]">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>تنبيه هام حول تأكيد الحجز:</span>
            </div>
            <p className="leading-relaxed">
              فتح واتساب لا يعني تأكيد الحجز فوراً، بل يبدأ التنسيق مع مستشار شاطر لتحديد الموعد المناسب لجدولكم، ويتم التثبيت بموافقتك الكاملة.
            </p>
          </div>

          {/* Admin WhatsApp status */}
          <div className="p-3.5 rounded-xl bg-[#F8FAFD] border border-[#E2E8F0] flex items-center justify-between gap-2 text-xs">
            <span className="font-bold text-[#1F2A44]">رقم واتساب إدارة شاطر الموحد:</span>
            <span className="font-mono text-[#0D4E8B] font-bold text-sm tracking-wide" dir="ltr">
              {toArabicDigits('+20 110 788 9984')}
            </span>
          </div>

          {/* Formatted Message Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-[#64748B]">
              <span className="font-bold text-[#1F2A44]">نص الرسالة التلقائية:</span>
              <button
                type="button"
                onClick={handleCopyMessage}
                className="min-h-[44px] px-3 rounded-xl text-[#0D4E8B] hover:bg-[#F0F6FD] hover:underline font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copied ? 'تم النسخ' : 'نسخ النص'}</span>
              </button>
            </div>
            <pre className="p-3.5 rounded-xl bg-[#F8F9FC] border border-[#E2E8F0] text-xs text-[#1F2A44] whitespace-pre-wrap font-['Tajawal'] leading-relaxed max-h-36 overflow-y-auto">
              {toArabicDigits(rawMessageText)}
            </pre>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="p-3.5 sm:p-5 bg-[#F8F9FC] border-t border-[#E2E8F0] flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl border border-[#CBD5E1] hover:bg-[#E2E8F0] text-xs sm:text-sm font-bold text-[#64748B] transition-colors cursor-pointer"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleOpenWhatsApp}
            className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#1EBE5D] text-white text-xs sm:text-sm font-bold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <MessageCircle className="w-4 h-4" />
            <span>متابعة في واتساب</span>
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalNode, document.body) : modalNode;
};
