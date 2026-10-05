import React, { useState, useEffect } from 'react';
import { SHATIR_CONFIG } from '../config/shatirConfig';
import { trackWhatsAppClicked } from '../services/analytics';
import { Menu, X, MessageCircle } from 'lucide-react';

interface HeaderProps {
  currentView: 'home' | 'tutor-profile' | 'join-as-tutor' | 'admin';
  onNavigate: (view: 'home' | 'tutor-profile' | 'join-as-tutor' | 'admin') => void;
  onScrollToSelector?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ currentView, onNavigate }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const whatsappContactUrl = `https://wa.me/${SHATIR_CONFIG.adminWhatsAppNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
    'السلام عليكم ورحمة الله، أود الاستفسار عن منصة شاطر كلاسيز والخدمات المتاحة.'
  )}`;

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

  const handleHowItWorksClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsMobileMenuOpen(false);
    if (currentView !== 'home') {
      onNavigate('home');
      setTimeout(() => {
        document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else {
      document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleJoinTutorClick = () => {
    setIsMobileMenuOpen(false);
    onNavigate('join-as-tutor');
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-[#E2E8F0]/80 shadow-[0_1px_4px_rgba(13,78,139,0.03)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <button
          onClick={() => {
            setIsMobileMenuOpen(false);
            onNavigate('home');
          }}
          className="flex items-center gap-2.5 text-right focus:outline-none group text-inherit cursor-pointer select-none"
          aria-label="الرئيسية - شاطر كلاسيز"
        >
          <img
            src="https://lh3.googleusercontent.com/aida/AEtjO1UolB2EZg5wI-hdvQk-DgSs34vjBDfqtw6OgT1GEuYaj1E4RQhBB4TuVRd10UsVfiqY4KzIMhPXYEUjrDImcT7u4roLgWtr43n62oIP7BKAd1jjluVdsrQ9K7L1Z2ra_YYN6jQWhYQ012_17GBZXBV5OIbZVOPG3GE39F-m7z1AynGUU02TBmDzkj-a8YCMUNnoBnpncqN6Au1kHrFFGvJCnzV4pe7gAhv_6DSQoJ2SUCHlhkKHxl8-zz5fo_ExWQbNa7LvILPfgw"
            alt="شعار شاطر"
            className="w-9 h-9 rounded-full object-cover shadow-xs border border-[#E2E8F0]"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const fallback = e.currentTarget.parentElement?.querySelector('.logo-fallback');
              if (fallback) fallback.classList.remove('hidden');
            }}
          />
          <div className="logo-fallback hidden w-9 h-9 rounded-full bg-[#0D4E8B] text-white flex items-center justify-center font-bold text-sm font-['Cairo'] shadow-xs border border-[#FFC629]">
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

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-['Cairo'] font-bold text-[#1F2A44]">
          <a
            href="#how-it-works"
            onClick={handleHowItWorksClick}
            className="text-[#1F2A44] hover:text-[#0D4E8B] transition-colors py-1 cursor-pointer"
          >
            كيف تعمل شاطر؟
          </a>

          <button
            type="button"
            onClick={handleJoinTutorClick}
            className={`transition-colors py-1 cursor-pointer ${
              currentView === 'join-as-tutor'
                ? 'text-[#0D4E8B] border-b-2 border-[#0D4E8B]'
                : 'text-[#1F2A44] hover:text-[#0D4E8B]'
            }`}
          >
            انضم كمعلم
          </button>

          <a
            href={whatsappContactUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackWhatsAppClicked('header')}
            className="inline-flex items-center gap-1.5 text-[#0D4E8B] hover:text-[#003767] bg-[#F0F6FD] hover:bg-[#E3EFFD] px-3.5 py-1.5 rounded-xl transition-all font-bold"
          >
            <MessageCircle className="w-4 h-4 text-emerald-600" />
            <span>تواصل معنا</span>
          </a>
        </nav>

        {/* Mobile Hamburger Button */}
        <div className="md:hidden flex items-center">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded-xl text-[#0D4E8B] hover:bg-[#F0F6FD] transition-colors focus:outline-none focus:ring-2 focus:ring-[#0D4E8B]/20 cursor-pointer"
            aria-label={isMobileMenuOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-[#E2E8F0] bg-white/98 backdrop-blur-md px-5 py-4 space-y-2 shadow-lg animate-fade-in">
          <a
            href="#how-it-works"
            onClick={handleHowItWorksClick}
            className="block px-3 py-2.5 rounded-xl text-sm font-['Cairo'] font-bold text-[#1F2A44] hover:bg-[#F0F6FD] hover:text-[#0D4E8B] transition-colors"
          >
            كيف تعمل شاطر؟
          </a>

          <button
            type="button"
            onClick={handleJoinTutorClick}
            className={`w-full text-right block px-3 py-2.5 rounded-xl text-sm font-['Cairo'] font-bold transition-colors cursor-pointer ${
              currentView === 'join-as-tutor'
                ? 'bg-[#F0F6FD] text-[#0D4E8B]'
                : 'text-[#1F2A44] hover:bg-[#F0F6FD] hover:text-[#0D4E8B]'
            }`}
          >
            انضم كمعلم
          </button>

          <a
            href={whatsappContactUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              setIsMobileMenuOpen(false);
              trackWhatsAppClicked('header');
            }}
            className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-['Cairo'] font-bold text-[#0D4E8B] bg-[#F0F6FD] hover:bg-[#E3EFFD] transition-colors"
          >
            <span>تواصل معنا</span>
            <MessageCircle className="w-4 h-4 text-emerald-600" />
          </a>
        </div>
      )}
    </header>
  );
};
