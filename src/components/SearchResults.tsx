import React from 'react';
import { Tutor, SearchCriteria } from '../types';
import { TutorCard } from './TutorCard';
import { toArabicDigits } from '../utils/formatters';
import { Edit3, RotateCcw, AlertCircle, Sparkles, MessageCircle, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import { buildInterestRegistrationWhatsAppUrl } from '../config/shatirConfig';
import { trackWhatsAppClicked } from '../services/analytics';

interface SearchResultsProps {
  tutors: Tutor[];
  isLoading: boolean;
  error: string | null;
  criteria: SearchCriteria;
  onSelectTutor: (tutorId: string) => void;
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
  onModifySearch,
  onRetry,
  stageName,
  gradeName,
  subjectName,
  curriculumName,
  quranAgeName,
  quranLevelName,
}) => {
  return (
    <motion.section
      id="search-results-section"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
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
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-lg">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>تجربة مجانية ٢٠ دقيقة</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <span className="font-bold text-[#64748B] shrink-0">ملخص اختيارك:</span>

            {criteria.track === 'school' ? (
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
                {subjectName && (
                  <span className="px-2.5 py-1 rounded-lg bg-[#EBF3FC] text-[#0D4E8B] font-bold border border-[#0D4E8B]/20">
                    {subjectName}
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
          className="self-start md:self-auto px-3.5 py-2 rounded-xl border border-[#CBD5E1] hover:bg-[#F8F9FC] text-xs font-bold text-[#0D4E8B] transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <Edit3 className="w-3.5 h-3.5" />
          <span>تعديل الاختيارات</span>
        </button>
      </div>

      {/* 2. Loading State */}
      {isLoading && (
        <div className="w-full bg-white rounded-2xl border border-[#E2E8F0] p-10 text-center flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-3 border-[#0D4E8B]/20 border-t-[#0D4E8B] rounded-full animate-spin" />
          <div className="space-y-1">
            <h3 className="font-['Cairo'] text-base font-bold text-[#0D4E8B]">
              جاري البحث عن المعلمين المناسبين...
            </h3>
            <p className="text-xs text-[#64748B]">
              نستعرض المعلمين المعتمدين لاختياراتك الحالية مع مواعيدهم المتاحة.
            </p>
          </div>
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
            className="px-5 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700 text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
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
              لا يوجد معلم منشور يطابق هذا الاختيار حاليًا
            </h3>
            <p className="text-xs sm:text-sm text-[#535E7B] leading-relaxed">
              تواصل مع فريق شاطر عبر واتساب لتسجيل احتياج طفلك، وسنرشح لك المعلم المناسب ونساعدك في
              تنسيق حصة تجريبية مجانية.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <a
              href={buildInterestRegistrationWhatsAppUrl({
                track: criteria.track,
                stageName,
                gradeName,
                subjectName,
                curriculumName,
                quranAgeGroupName: quranAgeName,
                quranLevelName,
              })}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackWhatsAppClicked('empty_search_interest')}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              <span>تواصل معنا لترشيح معلم مناسب</span>
            </a>
            <button
              type="button"
              onClick={onModifySearch}
              className="px-5 py-2.5 rounded-xl border border-[#CBD5E1] text-[#1F2A44] hover:bg-[#F8F9FC] text-xs font-bold transition-all cursor-pointer"
            >
              تعديل الاختيارات
            </button>
          </div>
        </div>
      )}

      {/* 5. Matching Results Cards (Fast Side-by-Side Comparison on Desktop, Clean Stack on Mobile) */}
      {!isLoading && !error && tutors.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
          {tutors.map((tutor) => (
            <TutorCard key={tutor.id} tutor={tutor} onSelect={onSelectTutor} />
          ))}
        </div>
      )}
    </motion.section>
  );
};
