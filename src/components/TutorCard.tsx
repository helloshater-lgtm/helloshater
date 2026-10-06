import React from 'react';
import { Tutor, SearchCriteria } from '../types';
import { Clock, Play, Star, Check, ArrowLeft } from 'lucide-react';

interface TutorCardProps {
  tutor: Tutor;
  onSelect: (tutorId: string) => void;
  criteria?: SearchCriteria;
}

export const TutorCard: React.FC<TutorCardProps> = ({ tutor, onSelect }) => {
  return (
    <div className="w-full bg-white rounded-2xl border border-[#E2E8F0] shadow-sm hover:shadow-md hover:border-[#CBD5E1] transition-all p-5 flex flex-col justify-between gap-4 group">
      <div>
        {/* Top Header: Avatar + Info */}
        <div className="flex items-start gap-4">
          {/* Avatar with fallback container */}
          <div className="relative shrink-0">
            <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl overflow-hidden bg-[#F2F3F6] border-2 border-white shadow-sm flex items-center justify-center text-[#0D4E8B] text-xl font-bold font-['Cairo']">
              {tutor.avatarUrl ? (
                <img
                  src={tutor.avatarUrl}
                  alt={`${tutor.honorific} ${tutor.name}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : null}
              <span>{tutor.name.charAt(0)}</span>
            </div>
            {tutor.verifiedCredentials && (
              <span
                className="absolute -bottom-1 -left-1 w-5 h-5 rounded-full bg-[#0D4E8B] text-white flex items-center justify-center text-xs shadow-sm"
                title="تم تدقيق المؤهلات"
              >
                <Check className="w-3 h-3 text-white" />
              </span>
            )}
          </div>

          {/* Name & Headline */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#D1DCFE]/50 text-[#0D4E8B] font-bold">
                تمت مراجعة المؤهلات
              </span>

              {/* Rating */}
              <div className="flex items-center gap-1 text-xs font-bold text-[#1F2A44] bg-[#FFF8E7] px-2 py-0.5 rounded-full border border-[#FFE7A3]">
                <Star className="w-3.5 h-3.5 text-[#FFC629] fill-[#FFC629]" />
                {tutor.rating !== null && tutor.rating !== undefined ? (
                  <>
                    <span>{Number(tutor.rating).toFixed(1)}</span>
                    <span className="text-[#64748B] font-normal">({tutor.reviewsCount})</span>
                  </>
                ) : (
                  <span className="text-[#64748B] font-normal">جديد</span>
                )}
              </div>
            </div>

            <h3 className="font-['Cairo'] text-base sm:text-lg font-bold text-[#1F2A44] mt-1 group-hover:text-[#0D4E8B] transition-colors truncate">
              {tutor.honorific} {tutor.name}
            </h3>

            <p className="text-xs text-[#535E7B] mt-0.5 line-clamp-2 leading-relaxed">
              {tutor.headline}
            </p>
          </div>
        </div>

        {/* Badges / Taxonomy Info */}
        <div className="flex flex-wrap items-center gap-2 mt-3.5 pt-3 border-t border-[#F2F3F6] text-xs text-[#535E7B]">
          <span className="px-2.5 py-1 rounded-lg bg-[#F8F9FC] border border-[#E2E8F0] font-medium flex items-center gap-1">
            <Clock className="w-3 h-3 text-[#64748B]" />
            <span>{tutor.experienceBadgeText}</span>
          </span>
          {tutor.curriculumTags.map((tag, idx) => (
            <span
              key={idx}
              className="px-2.5 py-1 rounded-lg bg-[#F8F9FC] border border-[#E2E8F0] font-medium"
            >
              {tag}
            </span>
          ))}
          {tutor.videoPreview?.available && (
            <span className="px-2.5 py-1 rounded-lg bg-[#EBF3FC] text-[#0D4E8B] font-bold flex items-center gap-1">
              <Play className="w-3 h-3 fill-[#0D4E8B]" />
              <span>فيديو تعريفي متاح</span>
            </span>
          )}
        </div>

        {/* Bio Quote */}
        {tutor.helpChildQuote && (
          <p className="mt-2.5 text-xs text-[#64748B] italic bg-[#F8F9FC] p-2.5 rounded-xl border-r-2 border-[#0D4E8B] line-clamp-2">
            "{tutor.helpChildQuote}"
          </p>
        )}
      </div>

      {/* Pricing & Actions */}
      <div className="pt-3 border-t border-[#E2E8F0] flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Trial & Regular Price Breakdown */}
        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
          <div>
            <span className="text-[11px] text-[#64748B] block">الحصة الأولى</span>
            <span className="text-xs sm:text-sm font-bold text-emerald-600 flex items-center gap-1">
              <span>مجاناً للتجربة</span>
              <span className="text-xs text-[#64748B] font-normal">({tutor.trialDurationMinutes} دقيقة)</span>
            </span>
          </div>

          <div className="h-6 w-[1px] bg-[#E2E8F0] hidden sm:block"></div>

          <div>
            <span className="text-[11px] text-[#64748B] block">السعر بعد التجربة</span>
            <span className="text-xs sm:text-sm font-bold text-[#1F2A44]">
              {tutor.hourlyRateMin} - {tutor.hourlyRateMax} {tutor.currency}
              <span className="text-xs text-[#64748B] font-normal"> / {tutor.sessionDurationMinutes} د</span>
            </span>
          </div>
        </div>

        {/* CTA Button */}
        <div className="w-full sm:w-auto">
          <button
            onClick={() => onSelect(tutor.id)}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs sm:text-sm font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <span>عرض الملف وحجز التجربة</span>
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
