import React, { useState, useEffect } from 'react';
import { TutorAccountNavStatus } from '../services/tutorApplicationService';
import { Menu, X, Loader2 } from 'lucide-react';

interface HeaderProps {
  currentView: 'home' | 'tutor-profile' | 'join-as-tutor' | 'admin' | 'tutor-dashboard' | 'privacy' | 'terms';
  onNavigate: (view: 'home' | 'tutor-profile' | 'join-as-tutor' | 'admin' | 'tutor-dashboard' | 'privacy' | 'terms') => void;
  onScrollToSelector?: () => void;
  onOpenHelpModal?: () => void;
  tutorNavStatus: TutorAccountNavStatus;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onNavigate,
  onOpenHelpModal,
  tutorNavStatus,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close mobile menu on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMobileMenuOpen(false);
      }
    };
    if (isMobileMenuOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileMenuOpen]);

  const scrollToHomeSection = (sectionId: string) => {
    setIsMobileMenuOpen(false);
    if (currentView !== 'home') {
      onNavigate('home');
      setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    } else {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const getTutorButtonLabel = (): string => {
    switch (tutorNavStatus) {
      case 'approved_tutor':
        return 'لوحة المعلم';
      case 'unapproved_application':
        return 'متابعة طلبي';
      case 'no_application':
        return 'استكمال التقديم';
      case 'unauthenticated':
      default:
        return 'انضم كمعلم';
    }
  };

  const isTutorButtonActive =
    (tutorNavStatus === 'approved_tutor' && currentView === 'tutor-dashboard') ||
    (tutorNavStatus !== 'approved_tutor' && currentView === 'join-as-tutor');

  const handleTutorButtonClick = () => {
    setIsMobileMenuOpen(false);
    if (tutorNavStatus === 'loading') return;

    if (tutorNavStatus === 'approved_tutor') {
      onNavigate('tutor-dashboard');
    } else {
      onNavigate('join-as-tutor');
    }
  };

  const handleHelpClick = () => {
    setIsMobileMenuOpen(false);
    onOpenHelpModal?.();
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-[#E2E8F0] shadow-[0_1px_4px_rgba(13,78,139,0.03)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Zone 1 (Right in RTL): Brand Logo */}
        <button
          type="button"
          onClick={() => {
            setIsMobileMenuOpen(false);
            onNavigate('home');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="flex items-center gap-2.5 text-right focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D4E8B] rounded-xl group text-inherit cursor-pointer select-none shrink-0"
          aria-label="الرئيسية - شاطر كلاسيز"
        >
          <img
            src="/logo.png"
            alt="شعار شاطر كلاسيز"
            className="w-9 h-9 rounded-full object-cover shadow-xs border border-[#E2E8F0] shrink-0"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const fallback = e.currentTarget.parentElement?.querySelector('.logo-fallback');
              if (fallback) fallback.classList.remove('hidden');
            }}
          />
          <div className="logo-fallback hidden w-9 h-9 rounded-full bg-[#0D4E8B] text-white flex items-center justify-center font-bold text-sm font-['Cairo'] shadow-xs border border-[#FFC629] shrink-0">
            شاطر
          </div>
          <div className="flex flex-col text-right">
            <span className="font-['Cairo'] font-extrabold text-base sm:text-lg text-[#0D4E8B] leading-tight whitespace-nowrap">
              شاطر كلاسيز
            </span>
            <span className="text-[11px] text-[#64748B] font-medium leading-none mt-0.5 whitespace-nowrap">
              بداية مطمئنة لتعلّم طفلك
            </span>
          </div>
        </button>

        {/* Zone 2 (Center): Desktop Navigation Links */}
        <nav
          aria-label="التنقل الرئيسي"
          className="hidden md:flex items-center gap-6 lg:gap-8 text-sm font-['Cairo'] font-bold text-[#1F2A44]"
        >
          <a
            href="#tutor-selector"
            onClick={(e) => {
              e.preventDefault();
              scrollToHomeSection('tutor-selector');
            }}
            className="text-[#1F2A44] hover:text-[#0D4E8B] transition-colors py-1.5 whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D4E8B] rounded-md"
          >
            اختَر معلمك
          </a>

          <a
            href="#how-it-works"
            onClick={(e) => {
              e.preventDefault();
              scrollToHomeSection('how-it-works');
            }}
            className="text-[#1F2A44] hover:text-[#0D4E8B] transition-colors py-1.5 whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D4E8B] rounded-md"
          >
            كيف نبدأ؟
          </a>

          <a
            href="#faq-section"
            onClick={(e) => {
              e.preventDefault();
              scrollToHomeSection('faq-section');
            }}
            className="text-[#1F2A44] hover:text-[#0D4E8B] transition-colors py-1.5 whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D4E8B] rounded-md"
          >
            أسئلة تهمّك
          </a>

          {tutorNavStatus === 'loading' ? (
            <span
              className="inline-flex items-center gap-1.5 text-[#64748B] py-1 text-xs font-bold select-none whitespace-nowrap shrink-0"
              aria-live="polite"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0D4E8B]" />
              <span>جاري التحقق...</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={handleTutorButtonClick}
              className={`transition-colors py-1.5 whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D4E8B] rounded-md ${
                isTutorButtonActive
                  ? 'text-[#0D4E8B] underline underline-offset-8 decoration-2'
                  : 'text-[#535E7B] hover:text-[#0D4E8B]'
              }`}
            >
              {getTutorButtonLabel()}
            </button>
          )}
        </nav>

        {/* Zone 3 (Left in RTL): Desktop CTA + Mobile Menu Button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleHelpClick}
            className="hidden md:inline-flex items-center justify-center min-h-[40px] px-4 py-2 rounded-xl bg-[#F0F6FD] hover:bg-[#E1EEFC] border border-[#D1DCFE] text-[#0D4E8B] font-['Cairo'] font-bold text-xs sm:text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D4E8B]"
          >
            ساعدني أختار
          </button>

          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            className="md:hidden min-h-[44px] px-3.5 rounded-xl border border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] text-xs font-['Cairo'] font-bold text-[#1F2A44] inline-flex items-center gap-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D4E8B] cursor-pointer whitespace-nowrap"
            aria-label={isMobileMenuOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? (
              <>
                <X className="w-4 h-4 text-[#0D4E8B]" />
                <span>إغلاق</span>
              </>
            ) : (
              <>
                <Menu className="w-4 h-4 text-[#0D4E8B]" />
                <span>القائمة</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-[#E2E8F0] bg-white px-4 py-4 space-y-2 shadow-lg animate-fade-in">
          <a
            href="#tutor-selector"
            onClick={(e) => {
              e.preventDefault();
              scrollToHomeSection('tutor-selector');
            }}
            className="flex items-center min-h-[44px] px-3.5 rounded-xl text-sm font-['Cairo'] font-bold text-[#1F2A44] hover:bg-[#F0F6FD] hover:text-[#0D4E8B] transition-colors"
          >
            اختَر معلمك
          </a>

          <a
            href="#how-it-works"
            onClick={(e) => {
              e.preventDefault();
              scrollToHomeSection('how-it-works');
            }}
            className="flex items-center min-h-[44px] px-3.5 rounded-xl text-sm font-['Cairo'] font-bold text-[#1F2A44] hover:bg-[#F0F6FD] hover:text-[#0D4E8B] transition-colors"
          >
            كيف نبدأ؟
          </a>

          <a
            href="#faq-section"
            onClick={(e) => {
              e.preventDefault();
              scrollToHomeSection('faq-section');
            }}
            className="flex items-center min-h-[44px] px-3.5 rounded-xl text-sm font-['Cairo'] font-bold text-[#1F2A44] hover:bg-[#F0F6FD] hover:text-[#0D4E8B] transition-colors"
          >
            أسئلة تهمّك
          </a>

          {tutorNavStatus === 'loading' ? (
            <div
              className="w-full text-right flex items-center gap-2 min-h-[44px] px-3.5 rounded-xl text-xs font-['Cairo'] font-bold text-[#64748B]"
              aria-live="polite"
            >
              <Loader2 className="w-4 h-4 animate-spin text-[#0D4E8B]" />
              <span>جاري التحقق من حالة الحساب...</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleTutorButtonClick}
              className={`w-full text-right flex items-center min-h-[44px] px-3.5 rounded-xl text-sm font-['Cairo'] font-bold transition-colors cursor-pointer ${
                isTutorButtonActive
                  ? 'bg-[#F0F6FD] text-[#0D4E8B]'
                  : 'text-[#535E7B] hover:bg-[#F0F6FD] hover:text-[#0D4E8B]'
              }`}
            >
              {getTutorButtonLabel()}
            </button>
          )}

          <button
            type="button"
            onClick={handleHelpClick}
            className="w-full flex items-center justify-center min-h-[44px] px-4 rounded-xl text-sm font-['Cairo'] font-bold text-[#0D4E8B] bg-[#F0F6FD] hover:bg-[#E1EEFC] border border-[#D1DCFE] transition-colors cursor-pointer"
          >
            ساعدني أختار
          </button>
        </div>
      )}
    </header>
  );
};
