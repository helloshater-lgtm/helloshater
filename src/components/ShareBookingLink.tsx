import React, { useState } from 'react';
import { Check, Copy, Link2, MessageCircle } from 'lucide-react';
import { BookingLinkSource, buildTrialBookingUrl, buildTrialBookingWhatsAppShareUrl } from '../utils/bookingLinks';

interface ShareBookingLinkProps {
  tutorId: string;
  tutorDisplayName: string;
  source: BookingLinkSource;
  compact?: boolean;
  title?: string;
  subtitle?: string;
}

/** «انسخ رابط الحجز» + «شارك على واتساب»: the link opens the booking page directly. */
export const ShareBookingLink: React.FC<ShareBookingLinkProps> = ({
  tutorId,
  tutorDisplayName,
  source,
  compact = false,
  title = 'رابط الحجز',
  subtitle = 'بيفتح صفحة حجز التجربة المجانية على طول.',
}) => {
  const [copied, setCopied] = useState(false);
  const url = buildTrialBookingUrl(tutorId, { source });
  if (!url) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement('textarea');
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      el.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const buttons = (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={copy}
        className="flex-1 min-h-[44px] px-3 rounded-2xl border border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] text-[#0D4E8B] text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer"
      >
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        <span>{copied ? 'اتنسخ' : 'انسخ الرابط'}</span>
      </button>
      <a
        href={buildTrialBookingWhatsAppShareUrl(tutorId, tutorDisplayName, source === 'admin' ? 'whatsapp' : source)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 min-h-[44px] px-3 rounded-2xl bg-[#25D366] hover:bg-[#1EBE5A] text-white text-sm font-bold flex items-center justify-center gap-1.5"
      >
        <MessageCircle className="w-4 h-4" />
        <span>واتساب</span>
      </a>
    </div>
  );

  if (compact) return buttons;

  return (
    <section aria-label={title} className="bg-white rounded-3xl border border-[#E2E8F0] shadow-xs p-4 sm:p-5 space-y-3">
      <div className="flex items-start gap-3.5">
        <span className="w-11 h-11 rounded-2xl bg-[#EBF3FC] text-[#0D4E8B] flex items-center justify-center shrink-0">
          <Link2 className="w-5 h-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h3 className="font-['Cairo'] text-base font-extrabold text-[#1F2A44]">{title}</h3>
          <p className="text-sm text-[#64748B]">{subtitle}</p>
        </div>
      </div>
      <p dir="ltr" className="px-3 py-2 rounded-xl bg-[#F8FAFC] text-xs text-[#475569] truncate" data-booking-link={url}>
        {url}
      </p>
      {buttons}
    </section>
  );
};
