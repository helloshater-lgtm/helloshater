import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { SHATIR_CONFIG } from '../config/shatirConfig';
import {
  getConsentPreferences,
  needsConsentPrompt,
  saveConsentPreferences,
  subscribeOpenConsentSettings,
} from '../services/consentService';
import { MetaPixelService } from '../services/metaPixelService';
import { ShieldCheck, X } from 'lucide-react';

export const ConsentBanner: React.FC = () => {
  const metaPixelEnabled = Boolean(SHATIR_CONFIG.metaPixelEnabled);
  const [isVisible, setIsVisible] = useState(false);
  const [isSettingsMode, setIsSettingsMode] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [marketingEnabled, setMarketingEnabled] = useState(false);

  useEffect(() => {
    const prefs = getConsentPreferences();
    setAnalyticsEnabled(prefs.analytics === 'granted');
    setMarketingEnabled(metaPixelEnabled && prefs.marketing === 'granted');
    MetaPixelService.syncConsentState(metaPixelEnabled && prefs.marketing === 'granted');

    if (needsConsentPrompt()) {
      setIsSettingsMode(false);
      setIsVisible(true);
    }

    const unsubscribe = subscribeOpenConsentSettings(() => {
      const latest = getConsentPreferences();
      setAnalyticsEnabled(latest.analytics === 'granted');
      setMarketingEnabled(metaPixelEnabled && latest.marketing === 'granted');
      setIsSettingsMode(true);
      setIsVisible(true);
    });

    return () => {
      unsubscribe();
    };
  }, [metaPixelEnabled]);

  const handleSaveCustom = () => {
    saveConsentPreferences({
      analytics: analyticsEnabled ? 'granted' : 'denied',
      marketing: metaPixelEnabled && marketingEnabled ? 'granted' : 'denied',
    });
    setIsVisible(false);
    setIsSettingsMode(false);
  };

  const handleAcceptAll = () => {
    setAnalyticsEnabled(true);
    setMarketingEnabled(metaPixelEnabled);
    saveConsentPreferences({
      analytics: 'granted',
      marketing: metaPixelEnabled ? 'granted' : 'denied',
    });
    setIsVisible(false);
    setIsSettingsMode(false);
  };

  const handleRejectOrWithdrawAll = () => {
    setAnalyticsEnabled(false);
    setMarketingEnabled(false);
    saveConsentPreferences({
      analytics: 'denied',
      marketing: 'denied',
    });
    setIsVisible(false);
    setIsSettingsMode(false);
  };

  if (!isVisible) return null;

  const bannerNode = (
    <div
      role="region"
      aria-label="إعدادات الخصوصية وملفات تعريف الارتباط"
      dir="rtl"
      className="fixed bottom-24 lg:bottom-4 right-3 left-3 sm:left-auto sm:max-w-md z-50 bg-white/98 backdrop-blur-md border border-[#CBD5E1] rounded-2xl shadow-xl p-4 sm:p-5 text-xs text-[#1F2A44]"
    >
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-[#F0F6FD] border border-[#D1DCFE] text-[#0D4E8B] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </span>
            <div>
              <h3 className="font-['Cairo'] font-extrabold text-xs sm:text-sm text-[#1F2A44]">
                تفضيلات الخصوصية والقياس
              </h3>
            </div>
          </div>

          {isSettingsMode && (
            <button
              type="button"
              onClick={() => setIsVisible(false)}
              aria-label="إغلاق إعدادات الخصوصية"
              className="min-w-[32px] min-h-[32px] rounded-lg hover:bg-[#F8FAFC] text-[#64748B] hover:text-[#1F2A44] flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <p className="leading-relaxed text-[#535E7B]">
          {metaPixelEnabled
            ? 'نحترم خصوصيتك. يمكنك التحكم بصورة مستقلة في تفعيل الإحصاءات وقياس الإعلانات دون إرسال أي بيانات شخصية، والاطلاع على '
            : 'نحترم خصوصيتك. يمكنك التحكم في تفعيل إحصاءات الاستخدام غير الشخصية لتحسين تجربة المنصة، والاطلاع على '}
          <a
            href="#privacy"
            onClick={() => {
              if (isSettingsMode) setIsVisible(false);
            }}
            className="font-bold text-[#0D4E8B] underline underline-offset-2 hover:text-[#003767]"
          >
            سياسة الخصوصية
          </a>
          .
        </p>

        {/* Toggles */}
        <div className="space-y-2 pt-0.5">
          <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#F8FAFD] border border-[#E2E8F0] hover:border-[#CBD5E1] cursor-pointer select-none transition-colors">
            <input
              type="checkbox"
              checked={analyticsEnabled}
              onChange={(e) => setAnalyticsEnabled(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded border-[#CBD5E1] text-[#0D4E8B] focus:ring-[#0D4E8B] shrink-0 cursor-pointer"
            />
            <span className="flex-1 leading-snug">
              <span className="block font-['Cairo'] font-bold text-[#1F2A44]">
                إحصاءات الاستخدام (Google Analytics)
              </span>
              <span className="block text-[11px] text-[#64748B] mt-0.5">
                إحصاءات تصفح غير شخصية لتحسين تجربة أولياء الأمور.
              </span>
            </span>
          </label>

          {metaPixelEnabled ? (
            <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#F8FAFD] border border-[#E2E8F0] hover:border-[#CBD5E1] cursor-pointer select-none transition-colors">
              <input
                type="checkbox"
                checked={marketingEnabled}
                onChange={(e) => setMarketingEnabled(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-[#CBD5E1] text-[#0D4E8B] focus:ring-[#0D4E8B] shrink-0 cursor-pointer"
              />
              <span className="flex-1 leading-snug">
                <span className="block font-['Cairo'] font-bold text-[#1F2A44]">
                  قياس الإعلانات (Meta Pixel)
                </span>
                <span className="block text-[11px] text-[#64748B] mt-0.5">
                  قياس فاعلية الإعلانات بأحداث محدودة دون أسماء أو هواتف أو بيانات أطفال.
                </span>
              </span>
            </label>
          ) : isSettingsMode ? (
            <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-[11px] text-[#64748B] leading-snug">
              <span className="block font-['Cairo'] font-bold text-[#1F2A44]">
                قياس الإعلانات (Meta Pixel) — متوقف مؤقتًا
              </span>
              <span className="block mt-0.5">
                التتبع الإعلاني عبر Meta متوقف حاليًا من إعدادات المنصة ولا يتم تحميله أو إرسال أي بيانات أو أحداث عبره.
              </span>
            </div>
          ) : null}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={handleRejectOrWithdrawAll}
            className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[#CBD5E1] hover:bg-[#F8F9FC] text-[#64748B] hover:text-[#1F2A44] font-['Cairo'] font-bold text-xs transition-colors cursor-pointer"
          >
            {isSettingsMode ? 'رفض / سحب الكل' : metaPixelEnabled ? 'رفض الكل' : 'رفض'}
          </button>

          <button
            type="button"
            onClick={handleSaveCustom}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-[#0D4E8B] bg-white hover:bg-[#F0F6FD] text-[#0D4E8B] font-['Cairo'] font-bold text-xs transition-colors cursor-pointer"
          >
            حفظ الاختيارات
          </button>

          <button
            type="button"
            onClick={handleAcceptAll}
            className="min-h-[38px] px-4 py-1.5 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white font-['Cairo'] font-bold text-xs shadow-2xs transition-colors cursor-pointer"
          >
            {metaPixelEnabled ? 'موافق على الكل' : 'موافق'}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(bannerNode, document.body) : bannerNode;
};
