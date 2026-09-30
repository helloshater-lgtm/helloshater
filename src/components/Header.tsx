import React from 'react';

interface HeaderProps {
  currentView: 'home' | 'tutor-profile' | 'join-as-tutor';
  onNavigate: (view: 'home' | 'tutor-profile' | 'join-as-tutor') => void;
  onScrollToSelector?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ currentView, onNavigate, onScrollToSelector }) => {
  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-[#E2E8F0] shadow-[0_1px_6px_rgba(13,78,139,0.04)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Zone 1: Official Shatir Logo from Stitch */}
        <button
          onClick={() => onNavigate('home')}
          className="flex items-center gap-2.5 text-right focus:outline-none group text-inherit cursor-pointer"
          aria-label="الرئيسية - شاطر"
        >
          <img
            src="https://lh3.googleusercontent.com/aida/AEtjO1UolB2EZg5wI-hdvQk-DgSs34vjBDfqtw6OgT1GEuYaj1E4RQhBB4TuVRd10UsVfiqY4KzIMhPXYEUjrDImcT7u4roLgWtr43n62oIP7BKAd1jjluVdsrQ9K7L1Z2ra_YYN6jQWhYQ012_17GBZXBV5OIbZVOPG3GE39F-m7z1AynGUU02TBmDzkj-a8YCMUNnoBnpncqN6Au1kHrFFGvJCnzV4pe7gAhv_6DSQoJ2SUCHlhkKHxl8-zz5fo_ExWQbNa7LvILPfgw"
            alt="شعار شاطر"
            className="w-9 h-9 rounded-full object-cover shadow-sm border border-[#E2E8F0]"
            onError={(e) => {
              // Graceful SVG fallback showing circular Shatir mark if external CDN is blocked
              e.currentTarget.style.display = 'none';
              const fallback = e.currentTarget.parentElement?.querySelector('.logo-fallback');
              if (fallback) fallback.classList.remove('hidden');
            }}
          />
          <div className="logo-fallback hidden w-9 h-9 rounded-full bg-[#0D4E8B] text-white flex items-center justify-center font-bold text-sm font-['Cairo'] shadow-sm border border-[#FFC629]">
            شاطر
          </div>
          <div className="flex flex-col text-right">
            <span className="font-['Cairo'] font-bold text-lg text-[#0D4E8B] leading-tight">
              شاطر
            </span>
            <span className="text-[11px] text-[#64748B] font-medium leading-none">
              منصة أولياء الأمور
            </span>
          </div>
        </button>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#1F2A44]">
          <button
            onClick={() => onNavigate('home')}
            className={`transition-colors hover:text-[#0D4E8B] cursor-pointer ${
              currentView === 'home' ? 'text-[#0D4E8B] font-bold' : 'text-[#64748B]'
            }`}
          >
            الرئيسية
          </button>

          <a
            href="#how-it-works"
            onClick={(e) => {
              if (currentView !== 'home') {
                e.preventDefault();
                onNavigate('home');
                setTimeout(() => {
                  document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
                }, 100);
              }
            }}
            className="text-[#64748B] hover:text-[#0D4E8B] transition-colors"
          >
            كيف تبدأ؟
          </a>

          <a
            href="#faq-section"
            onClick={(e) => {
              if (currentView !== 'home') {
                e.preventDefault();
                onNavigate('home');
                setTimeout(() => {
                  document.getElementById('faq-section')?.scrollIntoView({ behavior: 'smooth' });
                }, 100);
              }
            }}
            className="text-[#64748B] hover:text-[#0D4E8B] transition-colors"
          >
            الأسئلة الشائعة
          </a>

          <button
            onClick={() => onNavigate('join-as-tutor')}
            className={`transition-colors hover:text-[#0D4E8B] cursor-pointer ${
              currentView === 'join-as-tutor' ? 'text-[#0D4E8B] font-bold' : 'text-[#64748B]'
            }`}
          >
            انضم كمعلم
          </button>
        </nav>

        {/* Zone 3: Primary Action Button */}
        <div className="flex items-center gap-3">
          {currentView === 'join-as-tutor' ? (
            <button
              onClick={() => onNavigate('home')}
              className="px-3.5 py-2 text-xs font-bold text-[#0D4E8B] hover:bg-[#F2F3F6] rounded-xl transition-colors cursor-pointer"
            >
              العودة للرئيسية
            </button>
          ) : (
            <button
              onClick={() => onNavigate('join-as-tutor')}
              className="hidden sm:inline-flex md:hidden px-3.5 py-2 text-xs font-bold text-[#0D4E8B] hover:bg-[#F2F3F6] rounded-xl transition-colors cursor-pointer"
            >
              انضم كمعلم
            </button>
          )}

          <button
            onClick={() => {
              if (currentView !== 'home') {
                onNavigate('home');
                setTimeout(() => onScrollToSelector?.(), 100);
              } else {
                onScrollToSelector?.();
              }
            }}
            className="px-5 py-2.5 text-xs sm:text-sm font-bold text-white bg-[#0D4E8B] hover:bg-[#003767] rounded-xl shadow-sm transition-all flex items-center justify-center cursor-pointer whitespace-nowrap"
          >
            اختر معلم طفلك
          </button>
        </div>
      </div>
    </header>
  );
};
