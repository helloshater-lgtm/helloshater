import React, { useState } from 'react';
import { Tutor, SearchCriteria } from '../types';
import {
  formatSessionPriceSummary,
  getTutorHeadlineAndDegree,
  formatEarliestTrialSlotBadge,
  toArabicDigits,
  normalizeLegacyAgeGroupText,
} from '../utils/formatters';
import {
  getTutorPrimaryTrackTitle,
  getTutorFeaturedTags,
  getAvatarInitials,
} from '../utils/publicShowcase';
import { Star } from 'lucide-react';

interface TutorCardProps {
  tutor: Tutor;
  criteria?: SearchCriteria;
  onSelect: (tutorId: string) => void;
  onBookTrial?: (tutorId: string) => void;
}

export const TutorCard: React.FC<TutorCardProps> = ({
  tutor,
  criteria,
  onSelect,
  onBookTrial,
}) => {
  const [imageError, setImageError] = useState(false);

  const hasRealReviews =
    typeof tutor.reviewsCount === 'number' &&
    tutor.reviewsCount > 0 &&
    tutor.rating !== null &&
    tutor.rating > 0;

  const primaryTrackTitle = getTutorPrimaryTrackTitle(tutor, criteria);
  const { descriptiveHeadline } = getTutorHeadlineAndDegree(tutor);

  const rawBio = normalizeLegacyAgeGroupText(
    (tutor.helpChildSummary || tutor.helpChildQuote || descriptiveHeadline || '').trim()
  );
  const BIO_LIMIT = 115;
  const displayBio =
    rawBio.length <= BIO_LIMIT
      ? rawBio
      : `${rawBio.slice(0, rawBio.lastIndexOf(' ', BIO_LIMIT) || BIO_LIMIT).trim()}...`;

  const cardTags = getTutorFeaturedTags(tutor);

  const priceSummary = formatSessionPriceSummary({
    minPrice: tutor.hourlyRateMin,
    maxPrice: tutor.hourlyRateMax,
    currency: tutor.currency,
    durationMinutes: tutor.sessionDurationMinutes,
    useArabicDigits: true,
  });

  const earliestTrialText = formatEarliestTrialSlotBadge(tutor.earliestTrialSlot);
  const handleBookClick = () => {
    if (onBookTrial) {
      onBookTrial(tutor.id);
    } else {
      onSelect(tutor.id);
    }
  };

  return (
    <article
      dir="rtl"
      className="bg-white rounded-[22px] border border-[#E2E8F0] hover:border-[#CBD5E1] shadow-[0_2px_10px_rgba(15,23,42,0.03)] hover:shadow-[0_8px_24px_rgba(13,78,139,0.07)] transition-all duration-200 flex flex-col justify-between overflow-hidden"
    >
      <div className="p-5 space-y-4">
        {/* Header: Real Photo + Name + Primary Specialization + Review/Readiness */}
        <div
          onClick={() => onSelect(tutor.id)}
          className="flex items-start gap-3.5 cursor-pointer group"
        >
          <div className="w-16 h-16 rounded-2xl overflow-hidden bg-[#F0F6FD] border border-[#E2E8F0] shrink-0 flex items-center justify-center">
            {tutor.avatarUrl && !imageError ? (
              <img
                src={tutor.avatarUrl}
                alt={`${tutor.honorific} ${tutor.name}`}
                className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setImageError(true)}
              />
            ) : (
              <span className="font-['Cairo'] font-extrabold text-lg text-[#0D4E8B]">
                {getAvatarInitials(tutor.name)}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <h3 className="font-['Cairo'] text-base sm:text-lg font-extrabold text-[#1F2A44] group-hover:text-[#0D4E8B] transition-colors truncate">
              {tutor.honorific} {tutor.name}
            </h3>

            <p className="text-xs sm:text-sm font-bold text-[#0D4E8B] truncate">
              {primaryTrackTitle}
            </p>

            <div className="flex items-center gap-1.5 text-[11px] font-semibold">
              {hasRealReviews ? (
                <span className="inline-flex items-center gap-1 text-[#1F2A44]">
                  <Star className="w-3.5 h-3.5 text-[#F59E0B] fill-[#F59E0B] shrink-0" />
                  <span>{toArabicDigits(Number(tutor.rating).toFixed(1))}</span>
                  <span className="text-[#64748B] font-normal">
                    ({toArabicDigits(tutor.reviewsCount)} تقييم)
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[#0B6E4F]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
                  <span>ملف مكتمل وجاهز للتجربة</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        {displayBio && (
          <p className="text-xs sm:text-[13px] text-[#535E7B] leading-relaxed min-h-[38px]">
            {displayBio}
          </p>
        )}

        {/* Tags (Stage / Age Group + Experience) */}
        {cardTags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {cardTags.map((tag, idx) => (
              <span
                key={idx}
                className="text-[11px] font-semibold text-[#475569] bg-[#F8FAFC] border border-[#E2E8F0] px-2.5 py-1 rounded-lg"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Pricing + Earliest Trial Slot */}
        <div className="pt-3 border-t border-[#F1F5F9] space-y-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-[#64748B] font-medium">
              الحصة الخاصة · {priceSummary.durationText}
            </span>
            <span className="font-['Cairo'] text-base sm:text-lg font-extrabold text-[#1F2A44]">
              {priceSummary.priceText}
            </span>
          </div>

          {earliestTrialText ? (
            <div className="bg-[#EAF7F0] border border-[#CBEAD9] text-[#0B5D38] px-3 py-2 rounded-xl text-xs font-bold text-center truncate">
              أقرب تجربة: {earliestTrialText}
            </div>
          ) : (
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] text-[#535E7B] px-3 py-2 rounded-xl text-xs font-medium text-center">
              المواعيد المتاحة معروضة داخل ملف المعلم
            </div>
          )}
        </div>
      </div>

      {/* Card Actions */}
      <div className="px-5 pb-5 pt-1 flex items-center gap-2.5">
        <button
          type="button"
          onClick={handleBookClick}
          className="flex-1 min-h-[44px] py-2.5 px-4 rounded-xl bg-[#0D4E8B] hover:bg-[#083D77] active:scale-[0.99] text-white font-['Cairo'] font-bold text-xs sm:text-sm transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D4E8B]"
        >
          احجز تجربة مجانية
        </button>

        <button
          type="button"
          onClick={() => onSelect(tutor.id)}
          className="min-h-[44px] px-4 py-2.5 rounded-xl border border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] text-xs sm:text-sm font-['Cairo'] font-bold text-[#1F2A44] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D4E8B]"
        >
          الملف
        </button>
      </div>
    </article>
  );
};
