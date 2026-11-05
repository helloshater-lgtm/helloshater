import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { BookingWhatsAppPayload, buildTrialBookingWhatsAppUrl } from '../config/shatirConfig';
import {
  MessageCircle,
  Check,
  Copy,
  AlertTriangle,
  AlertCircle,
  X,
  Loader2,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react';
import {
  trackWhatsAppClicked,
  trackParentLeadFormOpened,
  trackParentLeadSubmitted,
  trackParentLeadSubmitFailed,
} from '../services/analytics';
import {
  ParentLeadService,
  ParentLeadRequestType,
  ParentLeadTrack,
  PARENT_LEAD_COUNTRY_OPTIONS,
  appendReferenceCodeToWhatsAppUrl,
} from '../services/parentLeadService';
import { toArabicDigits } from '../utils/formatters';

interface WhatsAppNoticeModalProps {
  payload?: BookingWhatsAppPayload;
  customWhatsAppUrl?: string;
  requestType?: ParentLeadRequestType;
  track?: ParentLeadTrack;
  tutorId?: string | null;
  courseOptionId?: string | null;
  quranAgeGroupId?: string | null;
  quranLevelId?: string | null;
  whatsappAnalyticsSource?: string;
  isOpen: boolean;
  onClose: () => void;
}

export const WhatsAppNoticeModal: React.FC<WhatsAppNoticeModalProps> = ({
  payload,
  customWhatsAppUrl,
  requestType = 'trial',
  track,
  tutorId = null,
  courseOptionId = null,
  quranAgeGroupId = null,
  quranLevelId = null,
  whatsappAnalyticsSource = 'trial_booking_modal',
  isOpen,
  onClose,
}) => {
  const [step, setStep] = useState<'form' | 'whatsapp'>('form');
  const [guardianName, setGuardianName] = useState('');
  const [countryCode, setCountryCode] = useState('+20');
  const [phone, setPhone] = useState('');
  const [childAge, setChildAge] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(''); // Honeypot field

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [referenceCode, setReferenceCode] = useState<string | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const hasTrackedOpenRef = useRef(false);
  const resolvedTrack: ParentLeadTrack = track !== undefined ? track : payload?.track ?? null;

  useEffect(() => {
    if (!isOpen) {
      hasTrackedOpenRef.current = false;
      return;
    }

    setStep('form');
    setConsent(false);
    setWebsite('');
    setFormError(null);
    setReferenceCode(null);
    setFallbackNotice(null);
    setIsSubmitting(false);

    if (!hasTrackedOpenRef.current) {
      hasTrackedOpenRef.current = true;
      trackParentLeadFormOpened({
        track: resolvedTrack,
        request_type: requestType,
      });
    }
  }, [isOpen, requestType, resolvedTrack]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow || '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const baseWhatsAppUrl =
    customWhatsAppUrl || (payload ? buildTrialBookingWhatsAppUrl(payload) : '');
  const { url: finalWhatsAppUrl, messageText: rawMessageText } = appendReferenceCodeToWhatsAppUrl(
    baseWhatsAppUrl,
    referenceCode
  );

  const handleCopyMessage = () => {
    navigator.clipboard?.writeText(rawMessageText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Honeypot check: if website is filled, do not call RPC and show normal WhatsApp step
    if (website.trim().length > 0) {
      setReferenceCode(null);
      setStep('whatsapp');
      return;
    }

    const trimmedName = guardianName.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName) {
      setFormError('يرجى إدخال اسم ولي الأمر.');
      return;
    }

    if (!trimmedPhone) {
      setFormError('يرجى إدخال رقم الموبايل.');
      return;
    }

    let parsedChildAge: number | null = null;
    if (childAge.trim() !== '') {
      const num = Number(childAge.trim());
      if (Number.isNaN(num) || num < 3 || num > 25) {
        setFormError('يرجى إدخال سن الطفل بشكل صحيح (أو تركه فارغًا).');
        return;
      }
      parsedChildAge = Math.round(num);
    }

    if (!consent) {
      setFormError('يرجى الموافقة على استخدام البيانات للتواصل بخصوص هذا الطلب.');
      return;
    }

    setIsSubmitting(true);

    const outcome = await ParentLeadService.submitParentLead({
      guardianName: trimmedName,
      countryCode,
      phone: trimmedPhone,
      childAge: parsedChildAge,
      consent: true,
      requestType,
      track: resolvedTrack,
      tutorId,
      courseOptionId,
      quranAgeGroupId,
      quranLevelId,
    });

    setIsSubmitting(false);

    if (outcome.status === 'validation_error') {
      trackParentLeadSubmitFailed({
        track: resolvedTrack,
        request_type: requestType,
      });
      setFormError(outcome.message);
      return;
    }

    if (outcome.status === 'network_or_server_error') {
      trackParentLeadSubmitFailed({
        track: resolvedTrack,
        request_type: requestType,
      });
      setReferenceCode(null);
      setFallbackNotice(outcome.message);
      setStep('whatsapp');
      return;
    }

    trackParentLeadSubmitted({
      track: resolvedTrack,
      request_type: requestType,
    });
    setReferenceCode(outcome.referenceCode);
    setFallbackNotice(null);
    setStep('whatsapp');
  };

  const handleOpenWhatsApp = () => {
    if (referenceCode) {
      ParentLeadService.markWhatsAppOpened(referenceCode);
    }
    trackWhatsAppClicked(whatsappAnalyticsSource);
    setTimeout(() => {
      onClose();
    }, 150);
  };

  const getHeaderSubtitle = () => {
    if (requestType === 'private') return 'تنسيق وحجز حصة خاصة (١:١)';
    if (requestType === 'group') return 'تنسيق وحجز مقعد في مجموعة تعليمية';
    if (requestType === 'recommendation') return 'ترشيح المعلم الأنسب لطفلك مجانًا';
    return 'خدمة مجانية للتنسيق واختيار الموعد';
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
      <div className="relative w-full max-w-xl my-auto max-h-[92dvh] bg-white rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden border border-[#E2E8F0] flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-[#0D4E8B] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
              <MessageCircle className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3
                id="whatsapp-modal-title"
                className="font-['Cairo'] text-sm sm:text-lg font-bold leading-tight truncate"
              >
                {step === 'form'
                  ? 'بيانات التواصل السريع لولي الأمر'
                  : 'التنسيق المباشر عبر واتساب إدارة شاطر'}
              </h3>
              <span className="text-xs text-[#95C0FF] block">{getHeaderSubtitle()}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق النافذة"
            className="min-w-[44px] min-h-[44px] rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === 'form' ? (
          /* ================= STEP 1: SHORT PARENT LEAD FORM ================= */
          <form onSubmit={handleFormSubmit} className="flex flex-col flex-1 overflow-hidden" noValidate>
            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
              <p className="text-xs sm:text-sm text-[#535E7B] leading-relaxed">
                أدخل بياناتك ليتم تسجيل طلبك وإظهار رسالة واتساب جاهزة لفريق التنسيق في شاطر.
              </p>

              {formError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span className="font-bold leading-relaxed">{formError}</span>
                </div>
              )}

              {/* Honeypot field for bots */}
              <div className="hidden" aria-hidden="true">
                <label htmlFor="parent-lead-website">Website</label>
                <input
                  id="parent-lead-website"
                  type="text"
                  name="website"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>

              {/* 1. Guardian Name (Required) */}
              <div className="space-y-1.5">
                <label
                  htmlFor="parent-lead-guardian-name"
                  className="block font-['Cairo'] text-xs sm:text-sm font-bold text-[#1F2A44]"
                >
                  اسم ولي الأمر <span className="text-rose-600">*</span>
                </label>
                <input
                  id="parent-lead-guardian-name"
                  type="text"
                  required
                  value={guardianName}
                  onChange={(e) => setGuardianName(e.target.value)}
                  placeholder="مثال: أحمد محمد"
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] focus:border-[#0D4E8B] focus:outline-none text-xs sm:text-sm text-[#1F2A44] bg-white"
                />
              </div>

              {/* 2. Phone Number with Country Code (Required, Default +20) */}
              <div className="space-y-1.5">
                <label
                  htmlFor="parent-lead-phone"
                  className="block font-['Cairo'] text-xs sm:text-sm font-bold text-[#1F2A44]"
                >
                  رقم الموبايل (واتساب) <span className="text-rose-600">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-5">
                    <select
                      aria-label="كود الدولة"
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      className="w-full min-h-[44px] px-3 py-2.5 rounded-xl border border-[#CBD5E1] focus:border-[#0D4E8B] focus:outline-none text-xs sm:text-sm font-bold text-[#1F2A44] bg-[#F8F9FC] cursor-pointer"
                    >
                      {PARENT_LEAD_COUNTRY_OPTIONS.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-7">
                    <input
                      id="parent-lead-phone"
                      type="tel"
                      inputMode="tel"
                      required
                      dir="ltr"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="01012345678"
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] focus:border-[#0D4E8B] focus:outline-none text-xs sm:text-sm font-mono text-right text-[#1F2A44] bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* 3. Child Age (Optional) */}
              <div className="space-y-1.5">
                <label
                  htmlFor="parent-lead-child-age"
                  className="block font-['Cairo'] text-xs sm:text-sm font-bold text-[#1F2A44]"
                >
                  سن الطفل <span className="text-xs font-normal text-[#64748B]">(اختياري)</span>
                </label>
                <input
                  id="parent-lead-child-age"
                  type="number"
                  inputMode="numeric"
                  min={3}
                  max={25}
                  value={childAge}
                  onChange={(e) => setChildAge(e.target.value)}
                  placeholder="مثال: 9"
                  className="w-full sm:w-44 min-h-[44px] px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] focus:border-[#0D4E8B] focus:outline-none text-xs sm:text-sm text-[#1F2A44] bg-white"
                />
              </div>

              {/* 4. Consent Checkbox (Unchecked by default) */}
              <div className="pt-1">
                <label className="min-h-[44px] p-3 rounded-xl bg-[#F8FAFD] border border-[#E2E8F0] flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="w-5 h-5 mt-0.5 rounded border-[#CBD5E1] text-[#0D4E8B] focus:ring-[#0D4E8B] shrink-0 cursor-pointer"
                  />
                  <span className="text-xs text-[#1F2A44] leading-relaxed">
                    أوافق على استخدام بياناتي للتواصل معي بخصوص هذا الطلب، وفق{' '}
                    <a
                      href="#privacy"
                      onClick={() => onClose()}
                      className="font-bold text-[#0D4E8B] underline underline-offset-2 hover:text-[#003767]"
                    >
                      سياسة الخصوصية
                    </a>
                    .
                  </span>
                </label>
              </div>
            </div>

            {/* Form Footer Actions */}
            <div className="p-3.5 sm:p-5 bg-[#F8F9FC] border-t border-[#E2E8F0] flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 sm:gap-3 shrink-0">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl border border-[#CBD5E1] hover:bg-[#E2E8F0] text-xs sm:text-sm font-bold text-[#64748B] transition-colors cursor-pointer disabled:opacity-50"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs sm:text-sm font-['Cairo'] font-bold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري الحفظ...</span>
                  </>
                ) : (
                  <>
                    <span>متابعة</span>
                    <ArrowLeft className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          /* ================= STEP 2: WHATSAPP NOTICE & CONFIRMATION ================= */
          <>
            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
              {referenceCode && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>تم تسجيل طلبك بنجاح. اضغط «متابعة في واتساب» لإرسال الرسالة.</span>
                  </div>
                  <span className="font-mono font-bold bg-white px-2.5 py-1 rounded-lg border border-emerald-200 text-emerald-800 shrink-0" dir="ltr">
                    {referenceCode}
                  </span>
                </div>
              )}

              {fallbackNotice && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span className="font-bold leading-relaxed">{fallbackNotice}</span>
                </div>
              )}

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
                إغلاق
              </button>
              <a
                href={finalWhatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleOpenWhatsApp}
                className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#1EBE5D] text-white text-xs sm:text-sm font-bold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <MessageCircle className="w-4 h-4" />
                <span>متابعة في واتساب</span>
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalNode, document.body) : modalNode;
};

