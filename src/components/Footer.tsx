import React from 'react';
import { SHATIR_CONFIG } from '../config/shatirConfig';

interface FooterProps {
  onNavigate: (view: 'home' | 'tutor-profile' | 'join-as-tutor') => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer className="w-full bg-[#1F2A44] text-[#F8F9FC] border-t border-[#0D4E8B]/20 pt-10 pb-8 mt-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-8 border-b border-white/10">
          {/* Brand Col */}
          <div className="space-y-3 md:col-span-2">
            <div className="flex items-center gap-2.5">
              <img
                src="https://lh3.googleusercontent.com/aida/AEtjO1UolB2EZg5wI-hdvQk-DgSs34vjBDfqtw6OgT1GEuYaj1E4RQhBB4TuVRd10UsVfiqY4KzIMhPXYEUjrDImcT7u4roLgWtr43n62oIP7BKAd1jjluVdsrQ9K7L1Z2ra_YYN6jQWhYQ012_17GBZXBV5OIbZVOPG3GE39F-m7z1AynGUU02TBmDzkj-a8YCMUNnoBnpncqN6Au1kHrFFGvJCnzV4pe7gAhv_6DSQoJ2SUCHlhkKHxl8-zz5fo_ExWQbNa7LvILPfgw"
                alt="شعار شاطر"
                className="w-8 h-8 rounded-full object-cover border border-white/20"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <span className="font-['Cairo'] font-bold text-lg text-white">
                شاطر <span className="text-[#FFC629]">كلاسيز</span>
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#E1E2E5] leading-relaxed max-w-md">
              بيئة تعليمية مريحة وشفافة تجمع نخبة المعلمين الخصوصيين برعاية أولياء الأمور.
              هدفنا تمكين طفلك من فهم عميق وتفوق دراسي مستمر مع حصة تجريبية أولى مجاناً.
            </p>
            <div className="flex items-center gap-4 text-xs text-[#C2C6D1] pt-1">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>{SHATIR_CONFIG.supportHoursText}</span>
              </span>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-2.5">
            <h4 className="font-['Cairo'] text-xs sm:text-sm font-bold text-white tracking-wide">
              أولياء الأمور
            </h4>
            <ul className="space-y-2 text-xs sm:text-sm text-[#C2C6D1]">
              <li>
                <button
                  onClick={() => onNavigate('home')}
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  اختيار المعلم المناسب
                </button>
              </li>
              <li>
                <a href="#how-it-works" className="hover:text-white transition-colors">
                  خطوات الحصة التجريبية
                </a>
              </li>
              <li>
                <a href="#guarantee" className="hover:text-white transition-colors">
                  ضمان شاطر لراحة البال
                </a>
              </li>
              <li>
                <a href="#faq-section" className="hover:text-white transition-colors">
                  الأسئلة الشائعة
                </a>
              </li>
            </ul>
          </div>

          {/* Teachers Link */}
          <div className="space-y-2.5">
            <h4 className="font-['Cairo'] text-xs sm:text-sm font-bold text-white tracking-wide">
              المعلمون والكوادر
            </h4>
            <ul className="space-y-2 text-xs sm:text-sm text-[#C2C6D1]">
              <li>
                <button
                  onClick={() => onNavigate('join-as-tutor')}
                  className="hover:text-white transition-colors text-right cursor-pointer"
                >
                  انضم كمعلم في شاطر
                </button>
              </li>
              <li>
                <span className="text-xs text-[#94A3B8]">
                  مراجعة أكاديمية دقيقة لجميع الطلبات
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#C2C6D1]">
          <span>© {new Date().getFullYear()} شاطر (Shatir Classes). جميع الحقوق محفوظة.</span>

          <div className="flex items-center gap-4">
            <a href="#privacy" className="hover:text-white transition-colors">
              سياسة الخصوصية
            </a>
            <span className="text-amber-300 font-medium">
              فتح واتساب لا يعني تأكيد الحجز المسبق
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
