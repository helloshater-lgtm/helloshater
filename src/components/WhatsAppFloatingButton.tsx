import React, { useState, useEffect } from 'react';
import { SHATIR_CONFIG } from '../config/shatirConfig';

export const WhatsAppFloatingButton: React.FC = () => {
  const [isHidden, setIsHidden] = useState(false);
  const cleanNumber = SHATIR_CONFIG.adminWhatsAppNumber.replace(/[^0-9]/g, '');
  const greetingText = 'السلام عليكم ورحمة الله، أود الاستفسار عن منصة شاطر كلاسيز والخدمات التعليمية المتاحة.';
  const whatsappUrl = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(greetingText)}`;

  useEffect(() => {
    let observer: IntersectionObserver | null = null;

    const setupObserver = () => {
      const target = document.getElementById('tutor-selector');
      if (!target) {
        setIsHidden(false);
        return;
      }

      if (observer) {
        observer.disconnect();
      }

      observer = new IntersectionObserver(
        ([entry]) => {
          // Hide floating button when selector section is visible in viewport
          setIsHidden(entry.isIntersecting);
        },
        {
          rootMargin: '0px 0px -50px 0px',
          threshold: [0, 0.05, 0.1],
        }
      );

      observer.observe(target);
    };

    setupObserver();

    // Check periodically or on scroll in case DOM elements render asynchronously
    const scrollHandler = () => {
      const target = document.getElementById('tutor-selector');
      if (!target) {
        setIsHidden(false);
        return;
      }
      const rect = target.getBoundingClientRect();
      const windowHeight = window.innerHeight || document.documentElement.clientHeight;
      const isVisible = rect.top < windowHeight - 40 && rect.bottom > 80;
      setIsHidden(isVisible);
    };

    window.addEventListener('scroll', scrollHandler, { passive: true });
    window.addEventListener('resize', scrollHandler, { passive: true });

    return () => {
      if (observer) observer.disconnect();
      window.removeEventListener('scroll', scrollHandler);
      window.removeEventListener('resize', scrollHandler);
    };
  }, []);

  return (
    <aside
      aria-label="تواصل مباشر عبر واتساب"
      className={`fixed left-3.5 sm:left-6 z-40 flex items-center transition-all duration-300 ${
        isHidden
          ? 'opacity-0 pointer-events-none translate-y-4 scale-90'
          : 'opacity-100 pointer-events-auto translate-y-0 scale-100'
      }`}
      style={{ bottom: 'max(14px, env(safe-area-inset-bottom, 14px))' }}
    >
      {/* Floating Action Button: 48px circle on mobile, neat pill on desktop */}
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="w-12 h-12 sm:w-auto sm:h-auto sm:px-4 sm:py-2.5 bg-[#25D366] hover:bg-[#20ba5a] text-white rounded-full shadow-md hover:shadow-lg transition-colors duration-150 active:scale-95 cursor-pointer flex items-center justify-center sm:gap-2 focus:outline-none focus:ring-2 focus:ring-[#25D366]/60 focus:ring-offset-2"
        aria-label="تواصل مع إدارة شاطر عبر واتساب"
        title="تواصل معنا عبر واتساب"
      >
        {/* Clean WhatsApp Icon */}
        <svg
          className="w-6 h-6 fill-current shrink-0"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path d="M17.472 14.382c-.301-.15-1.78-.878-2.056-.978-.276-.1-.476-.15-.676.15-.2.301-.776.978-.952 1.179-.175.2-.351.226-.652.075-.301-.15-1.27-.468-2.42-1.493-.895-.798-1.5-1.784-1.676-2.085-.175-.301-.019-.464.132-.614.136-.135.301-.351.451-.527.151-.175.2-.301.301-.502.101-.2.05-.376-.025-.526-.075-.15-.676-1.63-.927-2.234-.244-.588-.492-.508-.676-.517l-.577-.01c-.2 0-.527.075-.802.376s-1.054 1.03-1.054 2.511c0 1.482 1.079 2.912 1.23 3.113.15.201 2.123 3.242 5.143 4.547.718.311 1.279.497 1.716.636.721.23 1.378.197 1.898.12.579-.087 1.78-.727 2.03-1.43.251-.703.251-1.304.176-1.43-.075-.126-.276-.201-.577-.351zM12.042 21.84a9.774 9.774 0 0 1-4.992-1.365l-.358-.213-3.712.973.99-3.618-.233-.371a9.805 9.805 0 0 1-1.503-5.215C2.234 6.643 6.634 2.24 12.044 2.24c2.617 0 5.078 1.02 6.927 2.872a9.756 9.756 0 0 1 2.868 6.928c-.002 5.399-4.402 9.8-9.797 9.8zm0-17.6c-4.301 0-7.8 3.499-7.8 7.801 0 1.374.358 2.715 1.038 3.896l.162.28-.614 2.244 2.298-.603.272.162a7.77 7.77 0 0 0 4.644 1.521c4.3 0 7.8-3.5 7.8-7.801 0-2.083-.812-4.043-2.285-5.516A7.747 7.747 0 0 0 12.042 4.24z" />
        </svg>

        {/* Text Label on desktop */}
        <span className="font-['Cairo'] font-bold text-xs sm:text-sm whitespace-nowrap hidden sm:inline-block pr-0.5">
          تواصل معنا عبر واتساب
        </span>
      </a>
    </aside>
  );
};
