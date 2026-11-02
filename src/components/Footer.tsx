import React from 'react';
import { SHATIR_CONFIG } from '../config/shatirConfig';
import { trackWhatsAppClicked } from '../services/analytics';
import { toArabicDigits } from '../utils/formatters';
import { MessageCircle } from 'lucide-react';

interface FooterProps {
  onNavigate: (view: 'home' | 'tutor-profile' | 'join-as-tutor' | 'admin' | 'tutor-dashboard' | 'privacy' | 'terms') => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  const cleanNumber = SHATIR_CONFIG.adminWhatsAppNumber.replace(/[^0-9]/g, '');
  const whatsappUrl = `https://wa.me/${cleanNumber}?text=${encodeURIComponent('السلام عليكم ورحمة الله، أود التواصل مع فريق إدارة شاطر كلاسيز.')}`;

  const handleNavClick = (sectionId: string) => {
    onNavigate('home');
    setTimeout(() => {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }, 50);
  };

  return (
    <footer className="w-full bg-[#1F2A44] text-[#F8F9FC] border-t border-[#0D4E8B]/20 pt-8 pb-6 mt-8 sm:mt-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 pb-6 border-b border-white/10">
          {/* Brand & Description */}
          <div className="space-y-3 max-w-md">
            <div className="flex items-center gap-2.5">
              <img
                src="/logo.png"
                alt="شعار شاطر"
                className="w-8 h-8 rounded-full object-cover border border-white/20"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const fallback = e.currentTarget.parentElement?.querySelector('.logo-fallback');
                  if (fallback) fallback.classList.remove('hidden');
                }}
              />
              <div className="logo-fallback hidden w-8 h-8 rounded-full bg-[#0D4E8B] text-white flex items-center justify-center font-bold text-xs font-['Cairo'] border border-[#FFC629]">
                شاطر
              </div>
              <span className="font-['Cairo'] font-bold text-lg text-white">
                شاطر <span className="text-[#FFC629]">كلاسيز</span>
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#E1E2E5] leading-relaxed">
              شاطر تربط ولي الأمر بمعلم مناسب لاحتياج طفله، مع حصة تجريبية مجانية ومتابعة عبر واتساب.
            </p>
            <div>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackWhatsAppClicked('footer')}
                className="inline-flex items-center gap-2 text-xs sm:text-sm text-[#C2C6D1] hover:text-[#FFC629] transition-colors py-0.5"
              >
                <MessageCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>تواصل مع فريق شاطر عبر واتساب</span>
              </a>
            </div>
          </div>

          {/* Quick Links: 2 columns on mobile for compactness, clean grid on desktop */}
          <div className="space-y-2 md:min-w-[280px]">
            <h4 className="font-['Cairo'] text-xs sm:text-sm font-bold text-white tracking-wide">
              روابط سريعة
            </h4>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-xs sm:text-sm text-[#C2C6D1]">
              <button
                type="button"
                onClick={() => handleNavClick('tutor-selector')}
                className="text-right hover:text-white transition-colors cursor-pointer py-1"
              >
                اختَر احتياج طفلك
              </button>
              <button
                type="button"
                onClick={() => handleNavClick('how-it-works')}
                className="text-right hover:text-white transition-colors cursor-pointer py-1"
              >
                كيف تعمل شاطر؟
              </button>
              <button
                type="button"
                onClick={() => handleNavClick('faq-section')}
                className="text-right hover:text-white transition-colors cursor-pointer py-1"
              >
                الأسئلة الشائعة
              </button>
              <button
                type="button"
                onClick={() => onNavigate('join-as-tutor')}
                className="text-right hover:text-white transition-colors cursor-pointer py-1"
              >
                تقدّم كمعلم
              </button>
              <a
                href="#privacy"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate('privacy');
                }}
                className="text-right hover:text-white transition-colors cursor-pointer py-1"
              >
                سياسة الخصوصية
              </a>
              <a
                href="#terms"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate('terms');
                }}
                className="text-right hover:text-white transition-colors cursor-pointer py-1"
              >
                الشروط والأحكام
              </a>
            </div>
          </div>
        </div>

        {/* Bottom Bar: Copyright with auto-updating year */}
        <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#C2C6D1]">
          <span>© {toArabicDigits(new Date().getFullYear())} شاطر (Shatir Classes). جميع الحقوق محفوظة.</span>
          <div className="flex items-center gap-4 text-[11px] text-[#C2C6D1]">
            <a
              href="#privacy"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('privacy');
              }}
              className="hover:text-white transition-colors"
            >
              سياسة الخصوصية
            </a>
            <span>•</span>
            <a
              href="#terms"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('terms');
              }}
              className="hover:text-white transition-colors"
            >
              الشروط والأحكام
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
