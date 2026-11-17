import React from 'react';
import { SHATIR_CONFIG } from '../config/shatirConfig';
import { trackWhatsAppClicked } from '../services/analytics';
import { openConsentSettings } from '../services/consentService';
import { toArabicDigits } from '../utils/formatters';

interface FooterProps {
  onNavigate: (view: 'home' | 'tutor-profile' | 'join-as-tutor' | 'admin' | 'tutor-dashboard' | 'privacy' | 'terms') => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  const cleanNumber = SHATIR_CONFIG.adminWhatsAppNumber.replace(/[^0-9]/g, '');
  const whatsappUrl = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(
    'السلام عليكم ورحمة الله، أود التواصل مع فريق إدارة شاطر كلاسيز.'
  )}`;

  const handleNavClick = (sectionId: string) => {
    onNavigate('home');
    setTimeout(() => {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 60);
  };

  return (
    <footer className="w-full bg-white text-[#1F2A44] border-t border-[#E2E8F0] pt-8 pb-6 mt-10 sm:mt-14">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-[#E2E8F0]">
          {/* Brand & Description */}
          <div className="space-y-2 max-w-md">
            <div className="flex items-center gap-2.5">
              <img
                src="/logo.png"
                alt="شعار شاطر كلاسيز"
                className="w-9 h-9 rounded-full object-cover border border-[#E2E8F0]"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const fallback = e.currentTarget.parentElement?.querySelector('.logo-fallback');
                  if (fallback) fallback.classList.remove('hidden');
                }}
              />
              <div className="logo-fallback hidden w-9 h-9 rounded-full bg-[#0D4E8B] text-white flex items-center justify-center font-bold text-xs font-['Cairo'] border border-[#FFC629]">
                شاطر
              </div>
              <div>
                <span className="font-['Cairo'] font-extrabold text-base sm:text-lg text-[#0D4E8B] block leading-tight">
                  شاطر كلاسيز
                </span>
                <span className="text-[11px] text-[#64748B] font-medium block">
                  معلم مناسب، وبداية مطمئنة.
                </span>
              </div>
            </div>
            <p className="text-xs text-[#64748B] leading-relaxed">
              نربط ولي الأمر بمعلم يناسب احتياج طفله، مع تجربة أولى مجانية وتنسيق عبر فريق شاطر.
            </p>
          </div>

          {/* Primary Navigation Links */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs sm:text-sm font-['Cairo'] font-bold text-[#535E7B]">
            <button
              type="button"
              onClick={() => handleNavClick('tutor-selector')}
              className="min-h-[40px] px-1 hover:text-[#0D4E8B] transition-colors cursor-pointer"
            >
              اختَر معلمك
            </button>
            <button
              type="button"
              onClick={() => handleNavClick('how-it-works')}
              className="min-h-[40px] px-1 hover:text-[#0D4E8B] transition-colors cursor-pointer"
            >
              كيف نبدأ؟
            </button>
            <button
              type="button"
              onClick={() => onNavigate('join-as-tutor')}
              className="min-h-[40px] px-1 hover:text-[#0D4E8B] transition-colors cursor-pointer"
            >
              التدريس مع شاطر
            </button>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackWhatsAppClicked('footer')}
              className="min-h-[40px] px-1 inline-flex items-center hover:text-[#0D4E8B] transition-colors"
            >
              واتساب الدعم
            </a>
          </div>
        </div>

        {/* Bottom Legal & Copyright Row */}
        <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#64748B]">
          <span>© {toArabicDigits(new Date().getFullYear())} شاطر كلاسيز</span>
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-5 text-xs">
            <button
              type="button"
              onClick={openConsentSettings}
              className="py-1 hover:text-[#0D4E8B] transition-colors cursor-pointer"
            >
              إعدادات الخصوصية والتتبع
            </button>
            <a
              href="#privacy"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('privacy');
              }}
              className="py-1 hover:text-[#0D4E8B] transition-colors"
            >
              الخصوصية
            </a>
            <a
              href="#terms"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('terms');
              }}
              className="py-1 hover:text-[#0D4E8B] transition-colors"
            >
              الشروط والأحكام
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
