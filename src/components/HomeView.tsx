import React, { useState, useRef, useEffect } from 'react';
import {
  SearchCriteria,
  Tutor,
  Stage,
  Grade,
  Subject,
  CurriculumOption,
  QuranAgeGroup,
  QuranLevel,
} from '../types';
import { DataService } from '../services/dataService';
import { TutorSelector } from './TutorSelector';
import { SearchResults } from './SearchResults';
import {
  ShieldCheck,
  GraduationCap,
  RotateCcw,
  MessageCircle,
  CheckCircle2,
  CalendarClock,
  ChevronDown,
  ArrowLeft,
  ArrowDown,
} from 'lucide-react';
import { SHATIR_CONFIG } from '../config/shatirConfig';
import { trackNoTutorsShown, trackWhatsAppClicked } from '../services/analytics';

interface HomeViewProps {
  onSelectTutor: (tutorId: string) => void;
  onNavigateToJoin: () => void;
  savedCriteria?: SearchCriteria | null;
  savedResults?: Tutor[] | null;
  onSaveCriteria?: (criteria: SearchCriteria, results: Tutor[]) => void;
}

const FAQ_ITEMS = [
  {
    q: 'هل الحصة التجريبية مجانية؟',
    a: 'نعم، الحصة التجريبية الأولى مجانية، دون التزام مالي أو إدخال بيانات بطاقة.',
  },
  {
    q: 'كيف أختار موعد الحصة؟',
    a: 'افتح ملف المعلم، واختر من مواعيده المتاحة، ثم أرسل طلبك عبر واتساب. يُؤكَّد الموعد بعد مراجعة الطلب.',
  },
  {
    q: 'هل فتح واتساب يؤكد الحجز؟',
    a: 'فتح واتساب يجهّز رسالة الطلب. اضغط إرسال لإكمال الطلب، ثم انتظر تأكيد فريق شاطر.',
  },
  {
    q: 'ماذا لو لم يناسب طفلي أسلوب المعلم؟',
    a: 'بعد الحصة التجريبية، يمكنك طلب تجربة معلم آخر مجانًا.',
  },
  {
    q: 'ماذا لو لم أجد معلمًا أو موعدًا مناسبًا؟',
    a: 'تواصل معنا عبر واتساب لتسجيل احتياجك، وسننسّق معك عند توفر خيار مناسب.',
  },
];

export const HomeView: React.FC<HomeViewProps> = ({
  onSelectTutor,
  onNavigateToJoin,
  savedCriteria,
  savedResults,
  onSaveCriteria,
}) => {
  // Requirement 4: Results section does NOT appear before user selects and searches
  const [hasSearched, setHasSearched] = useState(
    Boolean(savedCriteria && savedResults && savedResults.length > 0)
  );
  const [activeCriteria, setActiveCriteria] = useState<SearchCriteria | null>(
    savedCriteria || null
  );
  const [searchResults, setSearchResults] = useState<Tutor[]>(savedResults || []);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  // Live taxonomy metadata for accurate labels
  const [stages, setStages] = useState<Stage[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [curricula, setCurricula] = useState<CurriculumOption[]>([]);
  const [quranAges, setQuranAges] = useState<QuranAgeGroup[]>([]);
  const [quranLevels, setQuranLevels] = useState<QuranLevel[]>([]);

  const selectorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initial fetch of taxonomy for label lookups
    Promise.all([
      DataService.getStages().catch(() => []),
      DataService.getCurriculumOptions().catch(() => []),
      DataService.getSubjects().catch(() => []),
      DataService.getQuranAgeGroups().catch(() => []),
      DataService.getQuranLevels().catch(() => []),
    ]).then(([stgs, currs, subjs, qAges, qLvls]) => {
      setStages(stgs);
      setCurricula(currs);
      setSubjects(subjs);
      setQuranAges(qAges);
      setQuranLevels(qLvls);
    });
  }, []);

  const handleTaxonomyLoaded = (loaded: {
    stages: Stage[];
    grades: Grade[];
    subjects: Subject[];
    curricula: CurriculumOption[];
    quranAges: QuranAgeGroup[];
    quranLevels: QuranLevel[];
  }) => {
    setStages(loaded.stages);
    setGrades(loaded.grades);
    setSubjects(loaded.subjects);
    setCurricula(loaded.curricula);
    setQuranAges(loaded.quranAges);
    setQuranLevels(loaded.quranLevels);
  };

  const handleScrollToSelector = () => {
    selectorRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Called whenever user alters any criteria
  const handleCriteriaChange = () => {
    setHasSearched(false);
    setSearchError(null);
    setSearchResults([]);
    setActiveCriteria(null);
  };

  // Requirement 3: Search tutors from Supabase database ONLY. No mock fallbacks.
  const executeSearch = async (criteria: SearchCriteria, simulateError = false) => {
    setIsLoading(true);
    setSearchError(null);
    setActiveCriteria(criteria);
    setHasSearched(true);

    try {
      const results = await DataService.searchTutors(criteria, simulateError);
      setSearchResults(results);
      onSaveCriteria?.(criteria, results);

      // Track no_tutors_shown if search returned 0 results
      if (results.length === 0) {
        trackNoTutorsShown(criteria);
      }

      setTimeout(() => {
        document.getElementById('search-results-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err: any) {
      setSearchError(err?.message || 'تعذر جلب المعلمين حالياً. يرجى المحاولة مرة أخرى.');
      setSearchResults([]);
      onSaveCriteria?.(criteria, []);
    } finally {
      setIsLoading(false);
    }
  };

  const whatsappDirectUrl = `https://wa.me/${SHATIR_CONFIG.adminWhatsAppNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
    'السلام عليكم، أود المساعدة في اختيار المعلم المناسب لطفلي عبر منصة شاطر كلاسيز.'
  )}`;

  // Human readable label helpers from live Supabase taxonomy
  const stageName = stages.find((s) => s.id === activeCriteria?.stageId)?.name;
  const gradeName = grades.find((g) => g.id === activeCriteria?.gradeId)?.name;
  const subjectName = subjects.find((s) => s.id === activeCriteria?.subjectId)?.name;
  const curriculumName = curricula.find((c) => c.id === activeCriteria?.curriculumType)?.name;
  const quranAgeName = quranAges.find((a) => a.id === activeCriteria?.ageGroupId)?.name;
  const quranLevelName = quranLevels.find((l) => l.id === activeCriteria?.levelId)?.name;

  return (
    <div className="w-full animate-fade-in">
      {/* 1. Redesigned Text-Focused Hero Section */}
      <section className="relative w-full overflow-hidden border-b border-[#E2E8F0]/70 bg-gradient-to-b from-[#F0F6FD]/80 via-[#F8FAFD]/40 to-white py-6 sm:py-12 md:py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center space-y-3 sm:space-y-5">
          {/* Small phrase above title */}
          <p className="text-xs sm:text-sm font-bold text-[#0D4E8B] tracking-wide inline-flex items-center justify-center gap-1.5 font-['Cairo']">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FFC629] shrink-0" aria-hidden="true" />
            <span>تعليم مباشر أونلاين لطفلك</span>
          </p>

          {/* Main Title */}
          <h1 className="font-['Cairo'] font-black text-[#1F2A44] text-[32px] sm:text-[36px] md:text-[52px] lg:text-[58px] leading-[1.25] tracking-tight">
            <span>معلم تثق به.</span>
            <span className="block mt-1 sm:mt-2 text-[#0D4E8B]">
              <span>وطفلك يتعلّم </span>
              <span className="relative inline-block whitespace-nowrap">
                <span>بثقة.</span>
                {/* Simple yellow underline SVG */}
                <svg
                  className="absolute -bottom-1.5 sm:-bottom-2.5 right-0 w-full h-2.5 sm:h-3 text-[#FFC629] pointer-events-none select-none overflow-visible"
                  viewBox="0 0 100 12"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    d="M2 9C28 3.5 72 3.5 98 8.5"
                    stroke="currentColor"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                </svg>
                {/* Decorative small star inspired by Shatir logo */}
                <svg
                  className="absolute -top-1 sm:-top-2 -left-4 sm:-left-6 w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#FFC629] fill-current pointer-events-none select-none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
                </svg>
              </span>
            </span>
          </h1>

          {/* Description */}
          <p className="text-base sm:text-lg text-[#535E7B] font-normal leading-relaxed max-w-xl mx-auto pt-0.5">
            حدّد احتياج طفلك، ونساعدك في الوصول إلى معلم مناسب. والتنسيق كله عبر واتساب.
          </p>

          {/* Action Area: Primary Button & Secondary WhatsApp Link */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 sm:gap-6 pt-1.5 sm:pt-3">
            {/* Primary Button */}
            <button
              type="button"
              onClick={handleScrollToSelector}
              className="w-full sm:w-auto h-[48px] sm:h-[50px] px-8 sm:px-9 rounded-[14px] bg-[#FFC629] hover:bg-[#F5BC18] active:scale-[0.98] text-[#0D4E8B] font-['Cairo'] font-extrabold text-sm sm:text-base shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <span>حدّد احتياج طفلك</span>
              <ArrowDown className="w-4 h-4 text-[#0D4E8B]" />
            </button>

            {/* Secondary Link */}
            <a
              href={whatsappDirectUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackWhatsAppClicked('hero_cta')}
              className="inline-flex items-center gap-2 text-sm sm:text-base font-['Cairo'] font-bold text-[#0D4E8B] hover:text-[#003767] underline underline-offset-4 decoration-[#0D4E8B]/30 hover:decoration-[#0D4E8B] transition-colors py-1"
            >
              <MessageCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>محتاج مساعدة؟ تواصل معنا</span>
            </a>
          </div>
        </div>
      </section>

      {/* 2. Interactive Tutor Selector Tool */}
      <section id="tutor-selector" ref={selectorRef} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-2 sm:mt-5 mb-10 sm:mb-14">
        <TutorSelector
          onSearch={(criteria) => executeSearch(criteria, false)}
          initialCriteria={activeCriteria || savedCriteria || undefined}
          isSearching={isLoading}
          onCriteriaChange={handleCriteriaChange}
          onTaxonomyLoaded={handleTaxonomyLoaded}
        />

        {/* 3. Search Results (Only shown after user clicks search!) */}
        {hasSearched && activeCriteria && (
          <div className="w-full animate-fade-in transition-opacity duration-500 ease-out">
            <SearchResults
              tutors={searchResults}
              isLoading={isLoading}
              error={searchError}
              criteria={activeCriteria}
              onSelectTutor={onSelectTutor}
              onModifySearch={handleScrollToSelector}
              onRetry={() => executeSearch(activeCriteria, false)}
              stageName={stageName}
              gradeName={gradeName}
              subjectName={subjectName}
              curriculumName={curriculumName}
              quranAgeName={quranAgeName}
              quranLevelName={quranLevelName}
            />
          </div>
        )}
      </section>

      {/* Subsequent Sections Container */}
      <div className="space-y-10 sm:space-y-14">
        {/* 4. Section: كيف تعمل منصة شاطر؟ */}
        <section id="how-it-works" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-2">
          <div className="text-center max-w-xl mx-auto mb-8 space-y-2">
            <h2 className="font-['Cairo'] text-xl sm:text-2xl font-bold text-[#0D4E8B]">
              كيف تبدأ رحلة التعلم مع شاطر؟
            </h2>
            <p className="text-xs sm:text-sm text-[#64748B]">
              من تحديد احتياج طفلك إلى اختيار المعلم والموعد وإرسال الطلب.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 sm:gap-4">
            <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-white border border-[#E2E8F0] shadow-xs flex md:flex-col items-start gap-3 transition-all hover:border-[#0D4E8B]/30">
              <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-[#0D4E8B] text-white flex items-center justify-center font-['Cairo'] font-bold text-xs shrink-0 shadow-xs">
                ١
              </span>
              <div className="space-y-0.5 sm:space-y-1 text-right">
                <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#1F2A44]">
                  حدّد احتياج طفلك
                </h3>
                <p className="text-xs text-[#535E7B] leading-relaxed font-normal">
                  اختَر المسار والتفاصيل الدراسية المناسبة.
                </p>
              </div>
            </div>

            <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-white border border-[#E2E8F0] shadow-xs flex md:flex-col items-start gap-3 transition-all hover:border-[#0D4E8B]/30">
              <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-[#0D4E8B] text-white flex items-center justify-center font-['Cairo'] font-bold text-xs shrink-0 shadow-xs">
                ٢
              </span>
              <div className="space-y-0.5 sm:space-y-1 text-right">
                <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#1F2A44]">
                  اختَر معلمك
                </h3>
                <p className="text-xs text-[#535E7B] leading-relaxed font-normal">
                  تعرّف على مؤهلات المعلم وطريقة تدريسه من ملفه.
                </p>
              </div>
            </div>

            <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-white border border-[#E2E8F0] shadow-xs flex md:flex-col items-start gap-3 transition-all hover:border-[#0D4E8B]/30">
              <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-[#0D4E8B] text-white flex items-center justify-center font-['Cairo'] font-bold text-xs shrink-0 shadow-xs">
                ٣
              </span>
              <div className="space-y-0.5 sm:space-y-1 text-right">
                <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#1F2A44]">
                  اختَر موعدًا مناسبًا
                </h3>
                <p className="text-xs text-[#535E7B] leading-relaxed font-normal">
                  شاهد المواعيد المتاحة في ملف المعلم واختر ما يناسب طفلك.
                </p>
              </div>
            </div>

            <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-white border border-[#E2E8F0] shadow-xs flex md:flex-col items-start gap-3 transition-all hover:border-[#0D4E8B]/30">
              <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-[#0D4E8B] text-white flex items-center justify-center font-['Cairo'] font-bold text-xs shrink-0 shadow-xs">
                ٤
              </span>
              <div className="space-y-0.5 sm:space-y-1 text-right">
                <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#1F2A44]">
                  أرسل طلب الحصة التجريبية
                </h3>
                <p className="text-xs text-[#535E7B] leading-relaxed font-normal">
                  أرسل تفاصيل المعلم والموعد عبر واتساب لإتمام تأكيد الطلب.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Section: ابدأ مع شاطر باطمئنان */}
        <section id="guarantee" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="w-full bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-8 border border-[#E2E8F0] shadow-xs">
            {/* Header */}
            <div className="text-center max-w-xl mx-auto mb-6 sm:mb-8 space-y-1.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200/80 text-amber-800 text-[11px] sm:text-xs font-bold mb-0.5">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>ضمان الجودة وراحة البال</span>
              </div>
              <h2 className="font-['Cairo'] text-xl sm:text-2xl font-bold text-[#0D4E8B]">
                ابدأ مع شاطر باطمئنان
              </h2>
              <p className="text-xs sm:text-sm text-[#64748B]">
                تجربة مجانية، واختيار واضح، ومتابعة قريبة.
              </p>
            </div>

            {/* Items: 4 compact rows on mobile with light dividers, 4 balanced columns on desktop */}
            <div className="divide-y divide-[#E2E8F0] md:divide-y-0 md:grid md:grid-cols-4 md:gap-4">
              {/* Item 1 */}
              <div className="py-3.5 first:pt-0 last:pb-0 md:py-0 md:p-4 md:rounded-2xl md:bg-[#F8FAFD] md:border md:border-[#E2E8F0] flex md:flex-col items-start gap-3 transition-all hover:border-[#0D4E8B]/30">
                <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-700 flex items-center justify-center shrink-0 mt-0.5 md:mt-0">
                  <GraduationCap className="w-4 h-4 text-amber-700" />
                </span>
                <div className="space-y-0.5 sm:space-y-1 text-right flex-1">
                  <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#0D4E8B]">
                    مراجعة المعلمين قبل النشر
                  </h3>
                  <p className="text-xs text-[#535E7B] leading-relaxed font-normal">
                    نراجع مؤهلات المعلم وكفاءته التعليمية قبل إتاحة ملفه.
                  </p>
                </div>
              </div>

              {/* Item 2 */}
              <div className="py-3.5 first:pt-0 last:pb-0 md:py-0 md:p-4 md:rounded-2xl md:bg-[#F8FAFD] md:border md:border-[#E2E8F0] flex md:flex-col items-start gap-3 transition-all hover:border-[#0D4E8B]/30">
                <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-700 flex items-center justify-center shrink-0 mt-0.5 md:mt-0">
                  <CheckCircle2 className="w-4 h-4 text-amber-700" />
                </span>
                <div className="space-y-0.5 sm:space-y-1 text-right flex-1">
                  <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#0D4E8B]">
                    حصة تجريبية مجانية
                  </h3>
                  <p className="text-xs text-[#535E7B] leading-relaxed font-normal">
                    تعرّف على أسلوب المعلم قبل اتخاذ قرار الاستمرار.
                  </p>
                </div>
              </div>

              {/* Item 3 */}
              <div className="py-3.5 first:pt-0 last:pb-0 md:py-0 md:p-4 md:rounded-2xl md:bg-[#F8FAFD] md:border md:border-[#E2E8F0] flex md:flex-col items-start gap-3 transition-all hover:border-[#0D4E8B]/30">
                <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-700 flex items-center justify-center shrink-0 mt-0.5 md:mt-0">
                  <RotateCcw className="w-4 h-4 text-amber-700" />
                </span>
                <div className="space-y-0.5 sm:space-y-1 text-right flex-1">
                  <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#0D4E8B]">
                    جرّب معلمًا آخر مجانًا
                  </h3>
                  <p className="text-xs text-[#535E7B] leading-relaxed font-normal">
                    إذا لم يناسب طفلك أسلوب المعلم في الحصة التجريبية، يمكنك تجربة معلم آخر مجانًا.
                  </p>
                </div>
              </div>

              {/* Item 4 */}
              <div className="py-3.5 first:pt-0 last:pb-0 md:py-0 md:p-4 md:rounded-2xl md:bg-[#F8FAFD] md:border md:border-[#E2E8F0] flex md:flex-col items-start gap-3 transition-all hover:border-[#0D4E8B]/30">
                <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-700 flex items-center justify-center shrink-0 mt-0.5 md:mt-0">
                  <CalendarClock className="w-4 h-4 text-amber-700" />
                </span>
                <div className="space-y-0.5 sm:space-y-1 text-right flex-1">
                  <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#0D4E8B]">
                    اختَر الموعد وتابع عبر واتساب
                  </h3>
                  <p className="text-xs text-[#535E7B] leading-relaxed font-normal">
                    اختَر من مواعيد المعلم المتاحة، وأرسل الطلب عبر واتساب للتأكيد والمتابعة.
                  </p>
                </div>
              </div>
            </div>

            {/* Bottom phrase */}
            <div className="mt-5 sm:mt-6 pt-3.5 sm:pt-4 border-t border-[#E2E8F0] text-center">
              <p className="text-xs sm:text-sm font-semibold text-[#0D4E8B] inline-flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#0D4E8B] shrink-0" />
                <span>الحصة التجريبية دون التزام مالي أو إدخال بيانات بطاقة.</span>
              </p>
            </div>
          </div>
        </section>

        {/* 6. Section: بطاقة انضمام المعلم */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="p-4 sm:p-5 rounded-2xl bg-[#F0F6FD] border border-[#D1DCFE] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1 text-right flex-1">
              <h3 className="font-['Cairo'] text-base sm:text-lg font-bold text-[#0D4E8B]">
                علّم مع شاطر
              </h3>
              <p className="text-xs sm:text-sm text-[#535E7B] leading-relaxed">
                هل لديك الخبرة والشغف بالتدريس؟ تقدّم للانضمام، وسنتواصل معك لمراجعة مؤهلاتك والتعرّف على أسلوبك.
              </p>
            </div>

            <button
              type="button"
              onClick={onNavigateToJoin}
              className="w-full sm:w-auto h-[44px] px-6 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] active:scale-[0.98] text-white font-['Cairo'] font-bold text-xs sm:text-sm shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
            >
              <span>تقدّم كمعلم</span>
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>
        </section>

        {/* 7. Section: FAQs */}
        <section id="faq-section" className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-4 space-y-6">
          <div className="text-center space-y-1">
            <h2 className="font-['Cairo'] text-xl sm:text-2xl font-bold text-[#0D4E8B]">
              الأسئلة الشائعة لأولياء الأمور
            </h2>
            <p className="text-xs sm:text-sm text-[#64748B]">إجابات واضحة ومباشرة عن الحصص وآلية العمل</p>
          </div>

          <div className="space-y-2.5 sm:space-y-3">
            {FAQ_ITEMS.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div
                  key={idx}
                  className="rounded-xl sm:rounded-2xl bg-white border border-[#E2E8F0] shadow-xs overflow-hidden transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-answer-${idx}`}
                    id={`faq-question-${idx}`}
                    className="w-full p-4 sm:p-5 text-right font-['Cairo'] font-bold text-xs sm:text-sm md:text-base text-[#1F2A44] hover:text-[#0D4E8B] flex items-center justify-between gap-3 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D4E8B] transition-colors"
                  >
                    <span className="leading-snug">{faq.q}</span>
                    <span
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[#0D4E8B] transition-transform duration-200 ${
                        isOpen
                          ? 'rotate-180 bg-[#F0F6FD] border border-[#CBD5E1] text-[#0D4E8B]'
                          : 'bg-[#F8FAFD] border border-[#CBD5E1]/60 text-[#0D4E8B]'
                      }`}
                      aria-hidden="true"
                    >
                      <ChevronDown className="w-4 h-4 text-[#0D4E8B]" />
                    </span>
                  </button>
                  {isOpen && (
                    <div
                      id={`faq-answer-${idx}`}
                      role="region"
                      aria-labelledby={`faq-question-${idx}`}
                      className="px-4 pb-4 sm:px-5 sm:pb-5 text-xs sm:text-sm text-[#535E7B] leading-relaxed border-t border-[#F2F3F6] pt-3 animate-fade-in"
                    >
                      <p>{faq.a}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};
