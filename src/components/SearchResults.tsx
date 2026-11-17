import React, { useState } from 'react';
import { Tutor, SearchCriteria } from '../types';
import { TutorCard } from './TutorCard';
import { toArabicDigits } from '../utils/formatters';
import { Edit3, RotateCcw, AlertCircle, Sparkles, MessageCircle, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import { buildInterestRegistrationWhatsAppUrl } from '../config/shatirConfig';
import { WhatsAppNoticeModal } from './WhatsAppNoticeModal';

interface SearchResultsProps {
  tutors: Tutor[];
  isLoading: boolean;
  error: string | null;
  criteria: SearchCriteria;
  onSelectTutor: (tutorId: string) => void;
  onBookTrial?: (tutorId: string) => void;
  onModifySearch: () => void;
  onRetry: () => void;
  stageName?: string;
  gradeName?: string;
  subjectName?: string;
  curriculumName?: string;
  quranAgeName?: string;
  quranLevelName?: string;
}

export const SearchResults: React.FC<SearchResultsProps> = ({
  tutors,
  isLoading,
  error,
  criteria,
  onSelectTutor,
  onBookTrial,
  onModifySearch,
  onRetry,
  stageName,
  gradeName,
  subjectName,
  curriculumName,
  quranAgeName,
  quranLevelName,
}) => {
  const [isRecommendationModalOpen, setIsRecommendationModalOpen] = useState(false);

  const resolvedTrackForWhatsApp = criteria.track === 'quran' ? 'quran' : 'school';
  const resolvedSubjectDisplay = criteria.subjectDisplayLabel || subjectName;

  const emptySearchWhatsAppUrl = buildInterestRegistrationWhatsAppUrl({
    track: resolvedTrackForWhatsApp,
    stageName,
    gradeName,
    subjectName: resolvedSubjectDisplay,
    curriculumName,
    quranAgeGroupName: quranAgeName,
    quranLevelName,
  });

  return (
    <motion.section
      id="search-results-section"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="w-full mt-6 sm:mt-8 scroll-mt-24 space-y-5"
    >
      {/* 1. Active Filter Summary Bar + Result Count + Modify Action */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-['Cairo'] text-sm sm:text-base font-extrabold text-[#1F2A44]">
              {isLoading
                ? 'جاري تحديث المعلمين...'
                : `عدد المعلمين المتاحين: ${toArabicDigits(tutors.length)}`}
            </span>
            {!isLoading && !error && tutors.length > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-[#0B5D38] bg-[#EAF7F0] border border-[#CBEAD9] px-2.5 py-0.5 rounded-lg">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>تجربة مجانية ٢٠ دقيقة</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <span className="font-bold text-[#64748B] shrink-0">ملخص اختيارك:</span>

            {criteria.track === 'all' ? (
              <>
                <span className="px-2.5 py-1 rounded-lg bg-[#EBF3FC] text-[#0D4E8B] font-bold border border-[#0D4E8B]/20">
                  {resolvedSubjectDisplay || 'جميع المواد والبرامج'}
                </span>
                {stageName && (
                  <span className="px-2.5 py-1 rounded-lg bg-[#F8F9FC] text-[#1F2A44] font-semibold border border-[#E2E8F0]">
                    {stageName}
                  </span>
                )}
                {curriculumName && (
                  <span className="px-2.5 py-1 rounded-lg bg-[#F8F9FC] text-[#1F2A44] font-semibold border border-[#E2E8F0]">
                    {curriculumName}
                  </span>
                )}
              </>
            ) : criteria.track === 'school' ? (
              <>
                {stageName && (
                  <span className="px-2.5 py-1 rounded-lg bg-[#F8F9FC] text-[#1F2A44] font-semibold border border-[#E2E8F0]">
                    {stageName}
                  </span>
                )}
                {gradeName && (
                  <span className="px-2.5 py-1 rounded-lg bg-[#F8F9FC] text-[#1F2A44] font-semibold border border-[#E2E8F0]">
                    {gradeName}
                  </span>
                )}
                {curriculumName && (
                  <span className="px-2.5 py-1 rounded-lg bg-[#F8F9FC] text-[#1F2A44] font-semibold border border-[#E2E8F0]">
                    {curriculumName}
                  </span>
                )}
                {resolvedSubjectDisplay && (
                  <span className="px-2.5 py-1 rounded-lg bg-[#EBF3FC] text-[#0D4E8B] font-bold border border-[#0D4E8B]/20">
                    {resolvedSubjectDisplay}
                  </span>
                )}
                {!stageName && !gradeName && !curriculumName && !resolvedSubjectDisplay && (
                  <span className="px-2.5 py-1 rounded-lg bg-[#EBF3FC] text-[#0D4E8B] font-bold border border-[#0D4E8B]/20">
                    المناهج الدراسية
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="px-2.5 py-1 rounded-lg bg-[#EBF3FC] text-[#0D4E8B] font-bold border border-[#0D4E8B]/20">
                  مسار القرآن والتأسيس
                </span>
                {quranAgeName && (
                  <span className="px-2.5 py-1 rounded-lg bg-[#F8F9FC] text-[#1F2A44] font-semibold border border-[#E2E8F0]">
                    {quranAgeName}
                  </span>
                )}
                {quranLevelName && (
                  <span className="px-2.5 py-1 rounded-lg bg-[#F8F9FC] text-[#1F2A44] font-semibold border border-[#E2E8F0]">
                    {quranLevelName}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onModifySearch}
          className="self-start md:self-auto min-h-[44px] px-4 py-2 rounded-xl border border-[#CBD5E1] hover:bg-[#F8F9FC] text-xs font-bold text-[#0D4E8B] transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <Edit3 className="w-3.5 h-3.5" />
          <span>تغيير البحث</span>
        </button>
      </div>

      {/* 2. Loading State */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-white rounded-[22px] border border-[#E2E8F0] p-5 space-y-4 animate-pulse"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-16 h-16 rounded-2xl bg-slate-200 shrink-0" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-slate-200 rounded w-2/3" />
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-3 bg-slate-100 rounded w-full" />
                <div className="h-3 bg-slate-100 rounded w-5/6" />
              </div>
              <div className="h-10 bg-slate-100 rounded-xl w-full" />
              <div className="h-11 bg-slate-200 rounded-xl w-full" />
            </div>
          ))}
        </div>
      )}

      {/* 3. Error State with Retry Button */}
      {!isLoading && error && (
        <div className="w-full bg-red-50/70 border border-red-200 rounded-2xl p-6 text-center flex flex-col items-center justify-center gap-3">
          <AlertCircle className="w-10 h-10 text-red-600" />
          <div className="space-y-1 max-w-md">
            <h3 className="font-['Cairo'] text-base font-bold text-red-800">
              تعذر استرجاع النتائج
            </h3>
            <p className="text-xs text-red-900/80">{error}</p>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="min-h-[44px] px-5 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700 text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>إعادة المحاولة الآن</span>
          </button>
        </div>
      )}

      {/* 4. Empty State with WhatsApp Coordination Option */}
      {!isLoading && !error && tutors.length === 0 && (
        <div className="w-full bg-white rounded-2xl border border-[#E2E8F0] p-8 sm:p-10 text-center flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#F0F6FD] border border-[#D1DCFE] flex items-center justify-center text-[#0D4E8B]">
            <Sparkles className="w-6 h-6 text-[#0D4E8B]" />
          </div>
          <div className="space-y-1.5 max-w-md">
            <h3 className="font-['Cairo'] text-lg sm:text-xl font-bold text-[#1F2A44]">
              لا يوجد معلمون متاحون لهذا الاختيار حاليًا
            </h3>
            <p className="text-xs sm:text-sm text-[#535E7B] leading-relaxed">
              تواصل مع فريق شاطر عبر واتساب لتسجيل احتياج طفلك، وسنرشح لك المعلم المناسب ونساعدك في
              تنسيق حصة تجريبية مجانية.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => setIsRecommendationModalOpen(true)}
              className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#0D4E8B] hover:bg-[#083D77] text-white text-xs sm:text-sm font-bold shadow-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <MessageCircle className="w-4 h-4 text-[#FFC629]" />
              <span>ساعدني أختار عبر واتساب</span>
            </button>
            <button
              type="button"
              onClick={onModifySearch}
              className="min-h-[44px] px-5 py-2.5 rounded-xl border border-[#CBD5E1] text-[#1F2A44] hover:bg-[#F8F9FC] text-xs font-bold transition-all cursor-pointer"
            >
              تغيير البحث
            </button>
          </div>
        </div>
      )}

      {/* 5. Matching Results Cards */}
      {!isLoading && !error && tutors.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {tutors.map((tutor) => (
            <TutorCard
              key={tutor.id}
              tutor={tutor}
              criteria={criteria}
              onSelect={onSelectTutor}
              onBookTrial={onBookTrial}
            />
          ))}
        </div>
      )}

      <WhatsAppNoticeModal
        isOpen={isRecommendationModalOpen}
        onClose={() => setIsRecommendationModalOpen(false)}
        requestType="recommendation"
        track={criteria.track === 'all' ? null : criteria.track}
        tutorId={null}
        courseOptionId={criteria.track === 'school' ? criteria.courseOptionId || null : null}
        quranAgeGroupId={criteria.track === 'quran' ? criteria.ageGroupId || null : null}
        quranLevelId={criteria.track === 'quran' ? criteria.levelId || null : null}
        customWhatsAppUrl={emptySearchWhatsAppUrl}
        whatsappAnalyticsSource="empty_search_interest"
      />
    </motion.section>
  );
};
