import React, { useState } from 'react';
import { Tutor } from '../types';
import {
  formatTutorExperience,
  formatSessionPriceSummary,
  getTutorHeadlineAndDegree,
  getTutorSpecializationSummary,
  formatEarliestTrialSlotBadge,
  toArabicDigits,
  normalizeLegacyAgeGroupText,
} from '../utils/formatters';
import {
  ShieldCheck,
  Briefcase,
  GraduationCap,
  CalendarClock,
  Star,
  BookOpen,
  Users,
  ArrowLeft,
  Clock,
} from 'lucide-react';

interface TutorCardProps {
  tutor: Tutor;
  onSelect: (tutorId: string) => void;
}

export const TutorCard: React.FC<TutorCardProps> = ({ tutor, onSelect }) => {
  const [isBioExpanded, setIsBioExpanded] = useState(false);

  // 1. Reviews check: never show a star for tutors without actual reviews
  const hasRealReviews =
    typeof tutor.reviewsCount === 'number' &&
    tutor.reviewsCount > 0 &&
    tutor.rating !== null &&
    tutor.rating > 0;

  // 2. Specialization & age/grade summary
  const { primarySpecialization, suitableAgesOrGrades, secondaryTags } =
    getTutorSpecializationSummary(tutor);

  // 3. Descriptive headline vs academic degree in its proper place
  const { descriptiveHeadline, academicDegree } = getTutorHeadlineAndDegree(tutor);

  // 4. Readable non-italic bio with clean word-boundary "المزيد"
  const rawBio = normalizeLegacyAgeGroupText(
    (tutor.helpChildQuote || tutor.helpChildSummary || '').trim()
  );
  const BIO_CHAR_LIMIT = 135;
  const needsBioTruncation = rawBio.length > BIO_CHAR_LIMIT;
  const displayedBio =
    !needsBioTruncation || isBioExpanded
      ? rawBio
      : `${rawBio.slice(0, rawBio.lastIndexOf(' ', BIO_CHAR_LIMIT) || BIO_CHAR_LIMIT).trim()}...`;

  // 5. Unified experience text & strict verified credentials check
  const experienceText = formatTutorExperience(
    tutor.yearsOfExperience,
    tutor.experienceBadgeText
  );
  const isCredentialsVerified = Boolean(tutor.verifiedCredentials);

  // 6. Unified session price & duration (150 ج.م للحصة — 50 دقيقة when min === max)
  const priceSummary = formatSessionPriceSummary({
    minPrice: tutor.hourlyRateMin,
    maxPrice: tutor.hourlyRateMax,
    currency: tutor.currency,
    durationMinutes: tutor.sessionDurationMinutes,
    useArabicDigits: true,
  });

  // 7. Earliest available trial slot (only if an actual future available slot exists)
  const earliestTrialText = formatEarliestTrialSlotBadge(tutor.earliestTrialSlot);
  const trialDurationText = toArabicDigits(tutor.trialDurationMinutes || 20);

  return (
    <article
      dir="rtl"
      className="bg-white rounded-2xl sm:rounded-3xl border border-[#E2E8F0] hover:border-[#CBD5E1] shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between overflow-hidden"
    >
      <div className="p-4 sm:p-5 space-y-3.5">
        {/* 1. Avatar & Name (Clear typography without exaggeration) + Review / New Status */}
        <div className="flex items-start justify-between gap-3">
          <div
            onClick={() => onSelect(tutor.id)}
            className="flex items-center gap-3 cursor-pointer group min-w-0"
          >
            <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden bg-[#F8F9FC] border border-[#E2E8F0] shrink-0">
              <img
                src={tutor.avatarUrl}
                alt={`${tutor.honorific} ${tutor.name}`}
                className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
            </div>

            <div className="min-w-0 space-y-1">
              <h3 className="font-['Cairo'] text-base sm:text-lg font-extrabold text-[#1F2A44] group-hover:text-[#0D4E8B] transition-colors truncate">
                {tutor.honorific} {tutor.name}
              </h3>

              {/* Rating or "جديد على شاطر" badge without star */}
              <div className="flex items-center gap-2 flex-wrap">
                {hasRealReviews ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-[#1F2A44] bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-lg">
                    <Star className="w-3.5 h-3.5 text-[#F59E0B] fill-[#F59E0B] shrink-0" />
                    <span>{toArabicDigits(Number(tutor.rating).toFixed(1))}</span>
                    <span className="text-[#64748B] font-normal">
                      ({toArabicDigits(tutor.reviewsCount)} تقييم)
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center text-[11px] font-bold text-[#0D4E8B] bg-[#EBF3FC] px-2.5 py-0.5 rounded-lg">
                    جديد على شاطر
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 2. Educational Specialization & Suitable Age Group / Grade */}
        <div className="p-3 rounded-xl bg-[#F8F9FC] border border-[#E2E8F0]/80 space-y-1.5">
          <div className="flex items-start gap-2 text-xs font-bold text-[#0D4E8B]">
            <BookOpen className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#0D4E8B]" />
            <span className="leading-snug">{primarySpecialization}</span>
          </div>
          <div className="flex items-start gap-2 text-xs text-[#475569]">
            <Users className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#64748B]" />
            <span className="leading-snug">
              <strong className="font-bold text-[#1F2A44]">مناسب لـ: </strong>
              {suitableAgesOrGrades}
            </span>
          </div>
          {secondaryTags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              {secondaryTags.map((tag, idx) => (
                <span
                  key={idx}
                  className="text-[11px] font-semibold text-[#475569] bg-white border border-[#E2E8F0] px-2 py-0.5 rounded-md"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 3. Descriptive Headline */}
        <div className="space-y-1">
          <p className="font-['Cairo'] text-xs sm:text-sm font-bold text-[#1F2A44] leading-relaxed">
            {descriptiveHeadline}
          </p>

          {/* 4. Readable Short Bio (No italic, clean expand with "المزيد") */}
          {rawBio && (
            <p className="text-xs text-[#475569] not-italic leading-relaxed">
              <span>{displayedBio}</span>
              {needsBioTruncation && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsBioExpanded((prev) => !prev);
                  }}
                  className="mr-1.5 font-['Cairo'] font-bold text-[#0D4E8B] hover:underline cursor-pointer inline"
                >
                  {isBioExpanded ? 'أقل' : 'المزيد'}
                </button>
              )}
            </p>
          )}
        </div>

        {/* 5. Actual Experience, Academic Qualification (in its proper place), & Verified Badge (ONLY when supported) */}
        {(experienceText || isCredentialsVerified || academicDegree) && (
          <div className="flex items-center gap-2 flex-wrap pt-0.5">
            {experienceText && (
              <span className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-bold text-[#1F2A44] bg-slate-100 px-2.5 py-1 rounded-lg">
                <Briefcase className="w-3.5 h-3.5 text-[#0D4E8B] shrink-0" />
                <span>{experienceText}</span>
              </span>
            )}

            {isCredentialsVerified && (
              <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-lg">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>تمت مراجعة المؤهلات</span>
              </span>
            )}

            {academicDegree && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-[#475569] bg-[#F8F9FC] border border-[#E2E8F0] px-2.5 py-1 rounded-lg max-w-full">
                <GraduationCap className="w-3.5 h-3.5 text-[#64748B] shrink-0" />
                <span className="truncate">{academicDegree}</span>
              </span>
            )}
          </div>
        )}

        {/* 6. Unified Session Price & Duration + 7. Earliest Available Trial Slot */}
        <div className="pt-3 border-t border-[#F1F5F9] space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs text-[#64748B] font-medium">سعر الحصة الخاصة (١:١):</span>
            <span className="font-['Cairo'] text-xs sm:text-sm font-extrabold text-[#0D4E8B] bg-[#EBF3FC]/70 px-2.5 py-1 rounded-lg">
              {priceSummary.combinedText}
            </span>
          </div>

          {earliestTrialText && (
            <div className="flex items-center justify-between gap-2 text-xs bg-emerald-50/70 border border-emerald-200/70 text-emerald-950 px-3 py-1.5 rounded-xl">
              <span className="inline-flex items-center gap-1.5 font-bold text-emerald-800 shrink-0">
                <CalendarClock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>أقرب موعد تجربة:</span>
              </span>
              <span className="font-bold text-left truncate">{earliestTrialText}</span>
            </div>
          )}
        </div>
      </div>

      {/* 8. Primary CTA ("اطلب تجربة مجانية — ٢٠ دقيقة") & Secondary Link ("عرض الملف") */}
      <div className="px-4 sm:px-5 py-3.5 bg-[#F8F9FC] border-t border-[#E2E8F0] flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onSelect(tutor.id)}
          className="flex-1 py-2.5 px-4 rounded-xl bg-[#FFC629] hover:bg-[#F5BC18] active:scale-[0.99] text-[#1F2A44] font-['Cairo'] font-extrabold text-xs sm:text-sm shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Clock className="w-3.5 h-3.5 text-[#0D4E8B] shrink-0" />
          <span>اطلب تجربة مجانية</span>
          <span className="text-[11px] font-bold text-[#0D4E8B] bg-white/75 px-1.5 py-0.5 rounded-md">
            {trialDurationText} دقيقة
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelect(tutor.id)}
          className="shrink-0 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-['Cairo'] font-bold text-[#0D4E8B] hover:bg-blue-50/80 transition-colors inline-flex items-center gap-1 cursor-pointer"
        >
          <span>عرض الملف</span>
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
      </div>
    </article>
  );
};
