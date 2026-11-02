import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

const CONSENT_STORAGE_KEY = 'shatir_ga_consent';

export const ConsentBanner: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CONSENT_STORAGE_KEY);
      if (saved === 'granted' || saved === 'denied') {
        if (typeof window.gtag === 'function') {
          window.gtag('consent', 'update', {
            analytics_storage: saved,
          });
        }
        setIsVisible(false);
      } else {
        setIsVisible(true);
      }
    } catch {
      setIsVisible(false);
    }
  }, []);

  const handleDecision = (decision: 'granted' | 'denied') => {
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, decision);
    } catch {
      // ignore storage errors
    }
    if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        analytics_storage: decision,
      });
    }
    setIsVisible(false);
  };

  if (!isVisible) return null;

  const bannerNode = (
    <div
      role="region"
      aria-label="إشعار ملفات تعريف الارتباط والخصوصية"
      dir="rtl"
      className="fixed bottom-20 lg:bottom-3 right-3 left-3 sm:left-auto sm:max-w-md z-50 bg-white/98 backdrop-blur-md border border-[#CBD5E1] rounded-2xl shadow-lg p-3.5 sm:p-4 text-xs text-[#1F2A44]"
    >
      <div className="space-y-2.5">
        <p className="leading-relaxed text-[#535E7B]">
          نستخدم إحصاءات تصفح غير شخصية لتحسين تجربة أولياء الأمور على منصة شاطر. يمكنك القبول أو الرفض، والاطلاع على{' '}
          <a
            href="#privacy"
            className="font-bold text-[#0D4E8B] underline underline-offset-2 hover:text-[#003767]"
          >
            سياسة الخصوصية
          </a>
          .
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => handleDecision('denied')}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-[#CBD5E1] hover:bg-[#F8F9FC] text-[#64748B] hover:text-[#1F2A44] font-['Cairo'] font-bold text-xs transition-colors cursor-pointer"
          >
            رفض
          </button>
          <button
            type="button"
            onClick={() => handleDecision('granted')}
            className="min-h-[38px] px-4 py-1.5 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white font-['Cairo'] font-bold text-xs shadow-2xs transition-colors cursor-pointer"
          >
            موافق
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(bannerNode, document.body) : bannerNode;
};
