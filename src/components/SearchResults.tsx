import React from 'react';
import { Tutor, SearchCriteria } from '../types';
import { TutorCard } from './TutorCard';
import { Edit3, RotateCcw, AlertCircle, Search, Sparkles, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SHATIR_CONFIG } from '../config/shatirConfig';

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
      initial={{ opacity: 0, y: 25 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="w-full mt-8 scroll-mt-24 space-y-5"
    >
      {/* 1. Active Filter Summary Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        className="bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3"
      >
        <div className="flex items-center gap-2 flex-wrap text-xs sm:text-sm">
          <span className="font-bold text-[#0D4E8B] shrink-0">
            المعايير المحددة:
          </span>

          {criteria.track === 'school' ? (
            <>
              {stageName && (
                <span className="px-3 py-1 rounded-full bg-[#F2F3F6] text-[#1F2A44] font-medium border border-[#E2E8F0]">
                  {stageName}
                </span>
              )}
              {gradeName && (
                <span className="px-3 py-1 rounded-full bg-[#F2F3F6] text-[#1F2A44] font-medium border border-[#E2E8F0]">
                  {gradeName}
                </span>
              )}
              {subjectName && (
                <span className="px-3 py-1 rounded-full bg-[#D1DCFE]/60 text-[#0D4E8B] font-bold border border-[#0D4E8B]/20">
                  {subjectName}
                </span>
              )}
              {curriculumName && (
                <span className="px-3 py-1 rounded-full bg-[#F2F3F6] text-[#1F2A44] font-medium border border-[#E2E8F0]">
                  {curriculumName}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="px-3 py-1 rounded-full bg-[#D1DCFE]/60 text-[#0D4E8B] font-bold border border-[#0D4E8B]/20">
                مسار القرآن والتأسيس
              </span>
              {quranAgeName && (
                <span className="px-3 py-1 rounded-full bg-[#F2F3F6] text-[#1F2A44] font-medium border border-[#E2E8F0]">
                  {quranAgeName}
                </span>
              )}
              {quranLevelName && (
                <span className="px-3 py-1 rounded-full bg-[#F2F3F6] text-[#1F2A44] font-medium border border-[#E2E8F0]">
                  {quranLevelName}
                </span>
              )}
            </>
          )}
        </div>

        <button
          onClick={onModifySearch}
          className="self-start md:self-auto px-3.5 py-1.5 rounded-xl border border-[#CBD5E1] hover:bg-[#F2F3F6] text-xs font-bold text-[#0D4E8B] transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <Edit3 className="w-3.5 h-3.5" />
          <span>تعديل الاختيارات</span>
        </button>
      </motion.div>

      {/* 2. Loading State */}
      {isLoading && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="w-full bg-white rounded-2xl border border-[#E2E8F0] p-10 text-center flex flex-col items-center justify-center gap-3"
        >
          <div className="w-10 h-10 border-3 border-[#0D4E8B]/20 border-t-[#0D4E8B] rounded-full animate-spin"></div>
          <div className="space-y-1">
            <h3 className="font-['Cairo'] text-base font-bold text-[#0D4E8B]">
              جاري البحث عن المعلمين المناسبين...
            </h3>
            <p className="text-xs text-[#64748B]">
              نبحث في قاعدة بيانات شاطر عن المعلمين المتاحين للمرحلة والمادة المحددة.
            </p>
          </div>
        </motion.div>
      )}

      {/* 3. Error State with Retry Button */}
      {!isLoading && error && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full bg-[#FFDAD6]/30 border border-[#BA1A1A]/30 rounded-2xl p-6 text-center flex flex-col items-center justify-center gap-3"
        >
          <AlertCircle className="w-10 h-10 text-[#BA1A1A]" />
          <div className="space-y-1 max-w-md">
            <h3 className="font-['Cairo'] text-base font-bold text-[#BA1A1A]">
              تعذر استرجاع النتائج
            </h3>
            <p className="text-xs text-[#424750]">{error}</p>
          </div>
          <button
            onClick={onRetry}
            className="px-5 py-2 rounded-xl bg-[#BA1A1A] text-white hover:bg-[#93000A] text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>إعادة المحاولة الآن</span>
          </button>
        </motion.div>
      )}

      {/* 4. Empty State */}
      {!isLoading && !error && tutors.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full bg-white rounded-2xl border border-[#E2E8F0] p-10 text-center flex flex-col items-center justify-center gap-4"
        >
          <Search className="w-10 h-10 text-[#94A3B8]" />
          <div className="space-y-1 max-w-md">
            <h3 className="font-['Cairo'] text-lg font-bold text-[#1F2A44]">
              لم نعثر على معلمين مناسبين لهذه المعايير حالياً
            </h3>
            <p className="text-xs text-[#64748B] leading-relaxed">
              يمكنك تعديل الاختيار أو التواصل مع إدارة شاطر عبر واتساب لمساعدتك في ترشيح معلم مناسب.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={onModifySearch}
              className="px-5 py-2.5 rounded-xl bg-[#0D4E8B] text-white hover:bg-[#003767] text-xs font-bold shadow-sm transition-all cursor-pointer"
            >
              تعديل معايير البحث
            </button>
            <a
              href={`https://wa.me/${SHATIR_CONFIG.adminWhatsAppNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent('السلام عليكم، أود المساعدة في ترشيح معلم مناسب لمواصفات طفلي عبر منصة شاطر.')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-2.5 rounded-xl border border-emerald-600 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
            >
              <MessageCircle className="w-4 h-4 text-emerald-600" />
              <span>ترشيح معلم عبر واتساب</span>
            </a>
          </div>
        </motion.div>
      )}

      {/* 5. Matching Results Cards with Staggered Entrance */}
      {!isLoading && !error && tutors.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="space-y-4"
        >
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.08 }}
            className="flex items-center justify-between px-1"
          >
            <span className="font-['Cairo'] text-base font-bold text-[#1F2A44]">
              المعلمون المناسبون لاختياراتك ({tutors.length})
            </span>
            <span className="text-xs text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              حصة أولى مجانية للتجربة
            </span>
          </motion.div>

          <div className="grid grid-cols-1 gap-4">
            {tutors.map((tutor, index) => (
              <motion.div
                key={tutor.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.4,
                  delay: 0.12 + index * 0.09,
                  ease: [0.21, 1, 0.36, 1],
                }}
              >
                <TutorCard
                  tutor={tutor}
                  onSelect={onSelectTutor}
                  criteria={criteria}
                />
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </motion.section>
  );
};
