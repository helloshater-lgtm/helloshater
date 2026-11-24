import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { TutorCard } from './TutorCard';
import { TutorDirectory } from './TutorDirectory';
import { TutorDirectoryService } from '../services/tutorDirectoryService';
import { DirectoryData, parseDirectoryFilters } from '../utils/tutorDirectory';
import {
  formatEarliestTrialSlotBadge,
  formatSessionPriceSummary,
  toArabicDigits,
} from '../utils/formatters';
import {
  getAvatarInitials,
  getTutorPrimaryTrackTitle,
} from '../utils/publicShowcase';
import {
  ShieldCheck,
  GraduationCap,
  RotateCcw,
  CalendarClock,
  ChevronDown,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  MessageCircle,
  ArrowLeft,
} from 'lucide-react';

interface HomeViewProps {
  onSelectTutor: (tutorId: string, options?: { focusBooking?: boolean }) => void;
  onNavigateToJoin: () => void;
  onOpenHelpModal: () => void;
  savedCriteria?: SearchCriteria | null;
  savedResults?: Tutor[] | null;
  onSaveCriteria?: (criteria: SearchCriteria, results: Tutor[]) => void;
}

const FAQ_ITEMS = [
  {
    q: 'هل التجربة مجانية فعلًا؟',
    a: 'نعم، التجربة الأولى ٢٠ دقيقة مجانًا، دون بطاقة بنكية أو التزام بالاستمرار. تتعرف خلالها على أسلوب المعلم واحتياج طفلك.',
  },
  {
    q: 'هل اختيار الموعد يؤكد الحجز؟',
    a: 'اختيار الموعد وفتح واتساب يبدأ طلب التنسيق مع فريق شاطر، ولا يُعتبر الحجز مؤكدًا إلا بعد مراجعة الطلب وتأكيد الموعد معك ومع المعلم.',
  },
  {
    q: 'إيه اللي بيحصل بعد التجربة؟',
    a: 'بعد انتهاء التجربة، إذا ناسبك أسلوب المعلم يمكنك حجز حصص خاصة فردية (١:١) أو الانضمام لمجموعة صغيرة؛ وإذا لم يناسب طفلك يمكنك طلب تجربة معلم آخر مجانًا.',
  },
  {
    q: 'كيف يتم الدفع أو تأجيل الحصة؟',
    a: 'التجربة الأولى مجانية دون أي بيانات دفع. وعند الرغبة في الاستمرار، يوضح لك فريق شاطر السعر الكامل ووسيلة الدفع المعتمدة وسياسة التأجيل قبل بدء الاشتراك.',
  },
  {
    q: 'ماذا لو لم أجد معلمًا أو موعدًا مناسبًا؟',
    a: 'اضغط «ساعدني أختار» وأرسل احتياج طفلك عبر واتساب؛ نُسجّل طلبك وننسّق لك ترشيحًا مناسبًا عند توفر الموعد أو المعلم المطلوب.',
  },
];

export const HomeView: React.FC<HomeViewProps> = ({
  onSelectTutor,
  onNavigateToJoin,
  onOpenHelpModal,
  savedCriteria,
  savedResults,
  onSaveCriteria,
}) => {
  // Featured ready tutors state (strictly live data)
  const [featuredTutors, setFeaturedTutors] = useState<Tutor[]>([]);
  const [featuredTotalReadyCount, setFeaturedTotalReadyCount] = useState<number>(0);
  const [isFeaturedLoading, setIsFeaturedLoading] = useState(true);
  const [featuredError, setFeaturedError] = useState<string | null>(null);
  const [heroImageError, setHeroImageError] = useState(false);
  // Tutors-first directory (migration 025). null = not available → classic hero.
  const [directory, setDirectory] = useState<DirectoryData | null>(null);
  const [directoryChecked, setDirectoryChecked] = useState(false);
  const [directoryFilters] = useState(() =>
    parseDirectoryFilters(typeof window !== 'undefined' ? window.location.search : '')
  );

  useEffect(() => {
    let active = true;
    TutorDirectoryService.getDirectory()
      .then((d) => active && setDirectory(d && d.tutors.length > 0 ? d : null))
      .catch(() => active && setDirectory(null))
      .finally(() => active && setDirectoryChecked(true));
    return () => {
      active = false;
    };
  }, []);

  // Search state
  const [hasSearched, setHasSearched] = useState(Boolean(savedCriteria));
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
  const searchRequestIdRef = useRef<number>(0);
  const hasAutoScrolledRef = useRef<boolean>(Boolean(savedCriteria));

  const loadFeaturedTutors = useCallback(async () => {
    setIsFeaturedLoading(true);
    setFeaturedError(null);
    setHeroImageError(false);
    try {
      const ready = await DataService.getFeaturedReadyTutors(3);
      setFeaturedTutors(ready.tutors || []);
      setFeaturedTotalReadyCount(ready.totalReadyCount || 0);
    } catch (err: any) {
      setFeaturedError(
        err?.message || 'تعذر تحميل المعلمين الجاهزين حاليًا. يرجى المحاولة مرة أخرى.'
      );
      setFeaturedTutors([]);
      setFeaturedTotalReadyCount(0);
    } finally {
      setIsFeaturedLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFeaturedTutors();
  }, [loadFeaturedTutors]);

  const handleTaxonomyLoaded = useCallback(
    (loaded: {
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
    },
    []
  );

  const handleScrollToSelector = useCallback(() => {
    selectorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleCriteriaChange = useCallback(() => {
    searchRequestIdRef.current += 1;
    setIsLoading(false);
    setHasSearched(false);
    setSearchError(null);
    setSearchResults([]);
    setActiveCriteria(null);
  }, []);

  const executeSearch = useCallback(
    async (criteria: SearchCriteria, scrollToResults = false) => {
      const requestId = ++searchRequestIdRef.current;
      setIsLoading(true);
      setSearchError(null);
      setActiveCriteria(criteria);
      setHasSearched(true);

      if (scrollToResults || !hasAutoScrolledRef.current) {
        hasAutoScrolledRef.current = true;
        setTimeout(() => {
          document.getElementById('search-results-section')?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          });
        }, 120);
      }

      try {
        const results = await DataService.searchTutors(criteria, false);
        if (requestId !== searchRequestIdRef.current) return;

        setSearchResults(results);
        onSaveCriteria?.(criteria, results);
      } catch (err: any) {
        if (requestId !== searchRequestIdRef.current) return;
        setSearchError(err?.message || 'تعذر جلب المعلمين حاليًا. يرجى المحاولة مرة أخرى.');
        setSearchResults([]);
        onSaveCriteria?.(criteria, []);
      } finally {
        if (requestId === searchRequestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [onSaveCriteria]
  );

  // Human readable label helpers from live Supabase taxonomy
  const stageName = stages.find((s) => s.id === activeCriteria?.stageId)?.name;
  const gradeName = grades.find((g) => g.id === activeCriteria?.gradeId)?.name;
  const subjectName =
    activeCriteria?.subjectDisplayLabel ||
    subjects.find((s) => s.id === activeCriteria?.subjectId)?.name;
  const curriculumName = curricula.find((c) => c.id === activeCriteria?.curriculumType)?.name;
  const activeQuranAge = quranAges.find((a) => a.id === activeCriteria?.ageGroupId);
  const quranAgeName = activeQuranAge
    ? activeQuranAge.ageRange
      ? `${activeQuranAge.name} (${activeQuranAge.ageRange})`
      : activeQuranAge.name
    : undefined;
  const quranLevelName = quranLevels.find((l) => l.id === activeCriteria?.levelId)?.name;

  const heroTutor = featuredTutors[0] || null;
  const heroTutorTitle = heroTutor ? getTutorPrimaryTrackTitle(heroTutor) : '';
  const heroEarliestTrial = heroTutor
    ? formatEarliestTrialSlotBadge(heroTutor.earliestTrialSlot)
    : null;
  const heroPriceSummary = heroTutor
    ? formatSessionPriceSummary({
        minPrice: heroTutor.hourlyRateMin,
        maxPrice: heroTutor.hourlyRateMax,
        currency: heroTutor.currency,
        durationMinutes: heroTutor.sessionDurationMinutes,
        useArabicDigits: true,
      })
    : null;

  return (
    <div className="w-full animate-fade-in">
      {directory && (
        <TutorDirectory
          data={directory}
          initialFilters={directoryFilters}
          onBook={(id) => onSelectTutor(id, { focusBooking: true })}
          onOpenProfile={(id) => onSelectTutor(id)}
          onHelp={onOpenHelpModal}
        />
      )}
      {!directory && !directoryChecked && (
        <div className="max-w-7xl mx-auto px-4 pt-8 pb-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-56 rounded-3xl bg-[#F0F6FD] animate-pulse" />
          ))}
        </div>
      )}
      {/* ===================================================================== */}
      {/* 1. HERO SECTION (Desktop 2-col with real tutor preview | Mobile clean) */}
      {/* ===================================================================== */}
      {!directory && directoryChecked && <section className="relative w-full overflow-hidden border-b border-[#E2E8F0] bg-gradient-to-b from-[#F0F6FD] via-[#F7FAFF] to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-8 sm:pt-12 sm:pb-12 lg:py-14">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Right Side (Copy + Trial Promise + CTAs) */}
            <div className="lg:col-span-7 text-center lg:text-right space-y-4 sm:space-y-5">
              <p className="inline-flex items-center justify-center lg:justify-start gap-2 text-xs sm:text-sm font-['Cairo'] font-bold text-[#0D4E8B]">
                <span className="w-2 h-2 rounded-full bg-[#FFC629] shrink-0" aria-hidden="true" />
                <span>تعليم مباشر أونلاين لطفلك</span>
              </p>

              <h1 className="font-['Cairo'] font-black text-[#1F2A44] text-[34px] sm:text-[42px] lg:text-[52px] leading-[1.22] tracking-tight">
                <span>معلم تثق به.</span>
                <span className="block text-[#0D4E8B] mt-1">وطفلك يتعلّم بثقة.</span>
              </h1>

              <p className="text-sm sm:text-base lg:text-[17px] text-[#535E7B] leading-relaxed max-w-xl mx-auto lg:mx-0">
                اختَر معلمًا مناسبًا لطفلك، وشاهد السعر والمواعيد قبل طلبك. في المناهج الدراسية
                والقرآن والتأسيس، البداية مع شاطر أسهل.
              </p>

              {/* Highlighted Free Trial Phrase */}
              <div className="pt-1 flex justify-center lg:justify-start">
                <p className="inline-flex items-center gap-2 text-xs sm:text-sm font-['Cairo'] font-extrabold text-[#0B5D38] bg-[#EAF7F0] border border-[#CBEAD9] px-3.5 py-1.5 rounded-xl">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>تجربة مجانية ٢٠ دقيقة · دون بطاقة أو التزام</span>
                </p>
              </div>

              {/* Hero CTAs */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleScrollToSelector}
                  className="min-h-[48px] px-7 py-3 rounded-[14px] bg-[#FFC629] hover:bg-[#F5BC18] active:scale-[0.99] text-[#1F2A44] font-['Cairo'] font-extrabold text-sm sm:text-base shadow-xs transition-all flex items-center justify-center cursor-pointer whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D4E8B]"
                >
                  ابحث عن معلم لطفلك
                </button>

                <button
                  type="button"
                  onClick={onOpenHelpModal}
                  className="min-h-[48px] px-6 py-3 rounded-[14px] bg-[#F0F6FD] hover:bg-[#E1EEFC] border border-[#D1DCFE] text-[#0D4E8B] font-['Cairo'] font-bold text-sm sm:text-base transition-colors flex items-center justify-center cursor-pointer whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D4E8B]"
                >
                  ساعدني أختار
                </button>
              </div>

              <p className="text-xs text-[#64748B] font-medium">
                تختار المعلم والموعد، وفريق شاطر يؤكد معك التفاصيل.
              </p>
            </div>

            {/* Left Side (Desktop Only Showcase Frame — strictly real tutor data or honest fallback) */}
            <div className="hidden lg:block lg:col-span-5">
              <div className="relative bg-white rounded-[26px] border border-[#E2E8F0] shadow-[0_14px_38px_rgba(13,78,139,0.08)] p-4">
                {/* Frame header dots */}
                <div className="flex items-center justify-between px-1 pb-3">
                  <span className="text-[11px] font-bold text-[#64748B]">
                    بداية واضحة مع معلمك
                  </span>
                  <div className="flex items-center gap-1" aria-hidden="true">
                    <span className="w-2 h-2 rounded-full bg-[#CBD5E1]" />
                    <span className="w-2 h-2 rounded-full bg-[#CBD5E1]" />
                    <span className="w-2 h-2 rounded-full bg-[#CBD5E1]" />
                  </div>
                </div>

                {isFeaturedLoading ? (
                  <div className="h-[290px] rounded-2xl bg-[#F0F6FD] animate-pulse flex flex-col justify-end p-5 space-y-2.5">
                    <div className="h-4 bg-white/80 rounded w-1/2" />
                    <div className="h-3 bg-white/70 rounded w-2/3" />
                  </div>
                ) : heroTutor ? (
                  <div
                    onClick={() => onSelectTutor(heroTutor.id)}
                    className="relative h-[290px] rounded-2xl overflow-hidden bg-gradient-to-br from-[#0D4E8B] to-[#083D77] cursor-pointer group"
                  >
                    {heroTutor.avatarUrl && !heroImageError ? (
                      <img
                        src={heroTutor.avatarUrl}
                        alt={`${heroTutor.honorific} ${heroTutor.name}`}
                        className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                        referrerPolicy="no-referrer"
                        onError={() => setHeroImageError(true)}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="font-['Cairo'] font-black text-5xl text-white/90">
                          {getAvatarInitials(heroTutor.name)}
                        </span>
                      </div>
                    )}

                    {/* Top badge */}
                    <div className="absolute top-3 left-3 bg-[#1F2A44]/85 backdrop-blur-xs text-white text-[11px] font-bold px-3 py-1 rounded-lg">
                      نتعرف على احتياج طفلك أولًا
                    </div>

                    {/* Bottom gradient caption */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0B1E36]/95 via-[#0B1E36]/65 to-transparent p-4 pt-12 text-white flex items-end justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-['Cairo'] font-extrabold text-base truncate">
                          {heroTutor.honorific} {heroTutor.name}
                        </p>
                        <p className="text-xs text-blue-100 truncate">{heroTutorTitle}</p>
                      </div>
                      <span className="text-[11px] font-bold text-[#FFC629] shrink-0">
                        {heroPriceSummary?.priceText}
                      </span>
                    </div>
                  </div>
                ) : (
                  /* Honest fallback when zero ready showcase tutors exist */
                  <div className="h-[290px] rounded-2xl bg-gradient-to-br from-[#F0F6FD] to-[#E4EEFA] border border-[#D1DCFE] p-6 flex flex-col justify-between">
                    <div className="space-y-3">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0D4E8B] bg-white px-3 py-1 rounded-lg border border-[#D1DCFE]">
                        <Sparkles className="w-3.5 h-3.5 text-[#F59E0B]" />
                        <span>معلمون مراجعون بعناية</span>
                      </span>
                      <h3 className="font-['Cairo'] font-extrabold text-xl text-[#1F2A44] leading-snug">
                        اختَر التخصص المناسب، وتعرّف على المعلمين المتاحين لجدول طفلك
                      </h3>
                      <p className="text-xs text-[#535E7B] leading-relaxed">
                        كل ملف منشور يوضح التخصص والسعر والمواعيد المتاحة قبل أن تطلب الحصة
                        التجريبية المجانية.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleScrollToSelector}
                      className="self-start min-h-[42px] px-4 py-2 rounded-xl bg-[#0D4E8B] hover:bg-[#083D77] text-white font-['Cairo'] font-bold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <span>ابدأ البحث الآن</span>
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Floating Detail Bar at Bottom of Hero Preview */}
                <div className="mt-3 p-3 rounded-xl bg-[#F8FAFD] border border-[#E2E8F0] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[#EAF7F0] text-[#0B5D38] flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-['Cairo'] text-xs font-extrabold text-[#1F2A44] truncate">
                        اختيار يناسب جدولكم
                      </p>
                      <p className="text-[11px] text-[#64748B] truncate">
                        {heroEarliestTrial
                          ? `أقرب تجربة: ${heroEarliestTrial}`
                          : 'السعر والموعد واضحان قبل الطلب'}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-['Cairo'] font-extrabold text-[#0B5D38] shrink-0">
                    ٢٠ دقيقة مجانًا
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom 3-item Trust Strip */}
        <div className="border-t border-[#E2E8F0]/80 bg-white/85">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-xs sm:text-sm font-medium text-[#535E7B]">
            <span>ملفات تُراجع قبل النشر</span>
            <span className="text-[#CBD5E1] hidden sm:inline" aria-hidden="true">
              •
            </span>
            <span>تجربة قبل الاستمرار</span>
            <span className="text-[#CBD5E1] hidden sm:inline" aria-hidden="true">
              •
            </span>
            <span>فريق يساعدك في الاختيار</span>
          </div>
        </div>
      </section>}

      {/* ===================================================================== */}
      {/* 2. SIMPLIFIED SEARCH SECTION + SEARCH RESULTS                         */}
      {/* ===================================================================== */}
      <section
        id="tutor-selector"
        ref={selectorRef}
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 sm:mt-8 mb-12 sm:mb-14 scroll-mt-20"
      >
        <TutorSelector
          onSearch={executeSearch}
          initialCriteria={activeCriteria || savedCriteria || undefined}
          isSearching={isLoading}
          onCriteriaChange={handleCriteriaChange}
          onTaxonomyLoaded={handleTaxonomyLoaded}
        />

        {hasSearched && activeCriteria && (
          <div className="w-full animate-fade-in">
            <SearchResults
              tutors={searchResults}
              isLoading={isLoading}
              error={searchError}
              criteria={activeCriteria}
              onSelectTutor={(id) => onSelectTutor(id)}
              onBookTrial={(id) => onSelectTutor(id, { focusBooking: true })}
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

      {/* Main Content Flow */}
      <div className="space-y-12 sm:space-y-16">
        {/* =================================================================== */}
        {/* 3. CURATED READY TUTORS SECTION («تعرّف على معلم طفلك القادم»)     */}
        {/* =================================================================== */}
        {!directory && <section
          id="featured-tutors"
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 scroll-mt-20"
        >
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div className="space-y-1 text-right">
              <h2 className="font-['Cairo'] text-xl sm:text-2xl lg:text-[26px] font-black text-[#1F2A44]">
                تعرّف على معلم طفلك القادم
              </h2>
              <p className="text-xs sm:text-sm text-[#535E7B]">
                تخصص واضح، وسعر معروف، وموعد تختاره بنفسك
              </p>
            </div>

            {!isFeaturedLoading && !featuredError && featuredTutors.length > 0 && (
              <span className="text-xs font-bold text-[#64748B] shrink-0">
                {featuredTotalReadyCount === 1
                  ? 'معلم واحد جاهز للتجربة الآن'
                  : featuredTotalReadyCount === 2
                  ? 'معلمان جاهزان للتجربة الآن'
                  : `${toArabicDigits(featuredTotalReadyCount)} معلمين جاهزين للتجربة الآن`}
              </span>
            )}
          </div>

          {isFeaturedLoading ? (
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
                    <div className="h-3 bg-slate-100 rounded w-4/5" />
                  </div>
                  <div className="h-10 bg-slate-100 rounded-xl w-full" />
                  <div className="h-11 bg-slate-200 rounded-xl w-full" />
                </div>
              ))}
            </div>
          ) : featuredError ? (
            <div className="bg-red-50/70 border border-red-200 rounded-2xl p-6 text-center space-y-3">
              <AlertCircle className="w-9 h-9 text-red-600 mx-auto" />
              <div className="space-y-1">
                <h3 className="font-['Cairo'] text-base font-bold text-red-900">
                  تعذر تحميل المعلمين الجاهزين
                </h3>
                <p className="text-xs sm:text-sm text-red-800">{featuredError}</p>
              </div>
              <button
                type="button"
                onClick={loadFeaturedTutors}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>إعادة المحاولة</span>
              </button>
            </div>
          ) : featuredTutors.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#E2E8F0] p-7 sm:p-9 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-[#F0F6FD] border border-[#D1DCFE] flex items-center justify-center mx-auto text-[#0D4E8B]">
                <CalendarClock className="w-6 h-6" />
              </div>
              <div className="space-y-1.5 max-w-lg mx-auto">
                <h3 className="font-['Cairo'] text-base sm:text-lg font-extrabold text-[#1F2A44]">
                  لا توجد ملفات مستوفية لجميع مواعيد التجربة والحصص الخاصة حاليًا
                </h3>
                <p className="text-xs sm:text-sm text-[#535E7B] leading-relaxed">
                  يمكنك البحث باستخدام أداة الاختيار أعلاه أو مراسلة فريق شاطر عبر واتساب لنرشح
                  لك المعلم المناسب وننسّق المواعيد المتاحة لطفلك.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={onOpenHelpModal}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#0D4E8B] hover:bg-[#083D77] text-white font-['Cairo'] font-bold text-xs sm:text-sm inline-flex items-center gap-2 cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4 text-[#FFC629]" />
                  <span>ساعدني أختار عبر واتساب</span>
                </button>
                <button
                  type="button"
                  onClick={handleScrollToSelector}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl border border-[#CBD5E1] hover:bg-[#F8FAFC] text-[#1F2A44] font-['Cairo'] font-bold text-xs sm:text-sm cursor-pointer"
                >
                  تصفّح البحث المتخصص
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {featuredTutors.map((tutor) => (
                  <TutorCard
                    key={tutor.id}
                    tutor={tutor}
                    onSelect={(id) => onSelectTutor(id)}
                    onBookTrial={(id) => onSelectTutor(id, { focusBooking: true })}
                  />
                ))}
              </div>
              <p className="text-[11px] sm:text-xs text-[#64748B] text-center leading-relaxed">
                البيانات والأسعار والمواعيد المعروضة مأخوذة مباشرة من ملفات المعلمين النشطة. إرسال
                الطلب عبر واتساب يبدأ التنسيق مع فريق شاطر، وتتوفر مواعيد الحصص الخاصة المدفوعة داخل
                ملف كل معلم.
              </p>
            </>
          )}
        </section>}

        {/* =================================================================== */}
        {/* 4. HOW IT WORKS («من أول اختيار... لأول حصة»)                     */}
        {/* =================================================================== */}
        <section
          id="how-it-works"
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-2 scroll-mt-20"
        >
          <div className="text-center max-w-xl mx-auto mb-7 sm:mb-9 space-y-1.5">
            <h2 className="font-['Cairo'] text-xl sm:text-2xl font-black text-[#1F2A44]">
              من أول اختيار... لأول حصة
            </h2>
            <p className="text-xs sm:text-sm text-[#535E7B]">
              خطوات بسيطة، وتفاصيل واضحة في كل مرحلة
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
            <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs flex items-start gap-3.5 transition-colors hover:border-[#0D4E8B]/30">
              <span className="w-8 h-8 rounded-xl bg-[#F0F6FD] border border-[#D1DCFE] text-[#0D4E8B] flex items-center justify-center font-['Cairo'] font-extrabold text-sm shrink-0">
                ١
              </span>
              <div className="space-y-1 text-right">
                <h3 className="font-['Cairo'] text-sm sm:text-base font-extrabold text-[#1F2A44]">
                  اختَر المعلم المناسب
                </h3>
                <p className="text-xs sm:text-[13px] text-[#535E7B] leading-relaxed">
                  شاهد التخصص وطريقة الشرح والسعر، وقارن ما يناسب احتياج طفلك.
                </p>
              </div>
            </div>

            <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs flex items-start gap-3.5 transition-colors hover:border-[#0D4E8B]/30">
              <span className="w-8 h-8 rounded-xl bg-[#F0F6FD] border border-[#D1DCFE] text-[#0D4E8B] flex items-center justify-center font-['Cairo'] font-extrabold text-sm shrink-0">
                ٢
              </span>
              <div className="space-y-1 text-right">
                <h3 className="font-['Cairo'] text-sm sm:text-base font-extrabold text-[#1F2A44]">
                  اطلب تجربة مجانية
                </h3>
                <p className="text-xs sm:text-[13px] text-[#535E7B] leading-relaxed">
                  اختر موعدًا مناسبًا، ثم أرسل طلب التنسيق عبر واتساب.
                </p>
              </div>
            </div>

            <div className="p-5 sm:p-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-xs flex items-start gap-3.5 transition-colors hover:border-[#0D4E8B]/30">
              <span className="w-8 h-8 rounded-xl bg-[#F0F6FD] border border-[#D1DCFE] text-[#0D4E8B] flex items-center justify-center font-['Cairo'] font-extrabold text-sm shrink-0">
                ٣
              </span>
              <div className="space-y-1 text-right">
                <h3 className="font-['Cairo'] text-sm sm:text-base font-extrabold text-[#1F2A44]">
                  نؤكد معك... وتبدأ التجربة
                </h3>
                <p className="text-xs sm:text-[13px] text-[#535E7B] leading-relaxed">
                  يؤكد الفريق الموعد وتفاصيل الانضمام، وبعد التجربة تختار الاستمرار.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* =================================================================== */}
        {/* 5. PEACE OF MIND («راحة بالك جزء من التجربة · اختيار أوضح. وبداية على مهل.») */}
        {/* =================================================================== */}
        <section id="guarantee" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 scroll-mt-20">
          <div className="bg-white rounded-2xl sm:rounded-3xl border border-[#E2E8F0] shadow-xs p-6 sm:p-9 lg:p-10">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 lg:gap-10 items-center">
              {/* Right Title Column */}
              <div className="lg:col-span-5 space-y-3 text-right">
                <p className="inline-flex items-center gap-2 text-xs font-['Cairo'] font-bold text-[#0D4E8B]">
                  <span className="w-2 h-2 rounded-full bg-[#FFC629] shrink-0" aria-hidden="true" />
                  <span>راحة بالك جزء من التجربة</span>
                </p>
                <h2 className="font-['Cairo'] text-2xl sm:text-[28px] font-black text-[#1F2A44] leading-[1.3]">
                  اختيار أوضح.
                  <span className="block">وبداية على مهل.</span>
                </h2>
                <p className="text-xs sm:text-sm text-[#535E7B] leading-relaxed">
                  طفلك له احتياج وطريقة تعلّم مختلفة. عشان كده، تعرف المعلم وتشوف التفاصيل قبل ما
                  تقرر الاستمرار.
                </p>
              </div>

              {/* Left 3 Feature Rows */}
              <div className="lg:col-span-7 space-y-3">
                <div className="p-4 sm:p-5 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-start gap-3.5">
                  <span className="w-9 h-9 rounded-xl bg-[#FFF8E7] border border-[#FFE7A3] text-amber-700 flex items-center justify-center shrink-0">
                    <GraduationCap className="w-4 h-4" />
                  </span>
                  <div className="space-y-0.5 text-right">
                    <h3 className="font-['Cairo'] text-sm sm:text-base font-extrabold text-[#1F2A44]">
                      مراجعة قبل نشر الملف
                    </h3>
                    <p className="text-xs sm:text-[13px] text-[#535E7B] leading-relaxed">
                      مراجعة المؤهلات والتخصصات ووضوح بيانات المعلم، لتختار بمعلومات أفضل.
                    </p>
                  </div>
                </div>

                <div className="p-4 sm:p-5 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-start gap-3.5">
                  <span className="w-9 h-9 rounded-xl bg-[#FFF8E7] border border-[#FFE7A3] text-amber-700 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </span>
                  <div className="space-y-0.5 text-right">
                    <h3 className="font-['Cairo'] text-sm sm:text-base font-extrabold text-[#1F2A44]">
                      السعر والمدة والموعد أمامك
                    </h3>
                    <p className="text-xs sm:text-[13px] text-[#535E7B] leading-relaxed">
                      تعرف تكلفة الحصة الخاصة ومدتها، وتختار من المواعيد المعروضة بوضوح.
                    </p>
                  </div>
                </div>

                <div className="p-4 sm:p-5 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-start gap-3.5">
                  <span className="w-9 h-9 rounded-xl bg-[#FFF8E7] border border-[#FFE7A3] text-amber-700 flex items-center justify-center shrink-0">
                    <RotateCcw className="w-4 h-4" />
                  </span>
                  <div className="space-y-0.5 text-right">
                    <h3 className="font-['Cairo'] text-sm sm:text-base font-extrabold text-[#1F2A44]">
                      أسلوب المعلم مش مناسب؟
                    </h3>
                    <p className="text-xs sm:text-[13px] text-[#535E7B] leading-relaxed">
                      تقدر تطلب تجربة معلم آخر مجانًا، حتى تصل لاختيار يناسب طفلك.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =================================================================== */}
        {/* 6. FAQ SECTION («قبل ما تبدأ · أسئلة تهمّ كل ولي أمر»)            */}
        {/* =================================================================== */}
        <section id="faq-section" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 scroll-mt-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 lg:gap-10 items-start">
            <div className="lg:col-span-4 space-y-2 text-right">
              <p className="inline-flex items-center gap-2 text-xs font-['Cairo'] font-bold text-[#0D4E8B]">
                <span className="w-2 h-2 rounded-full bg-[#FFC629] shrink-0" aria-hidden="true" />
                <span>قبل ما تبدأ</span>
              </p>
              <h2 className="font-['Cairo'] text-2xl sm:text-[28px] font-black text-[#1F2A44] leading-[1.3]">
                أسئلة تهمّ
                <span className="block">كل ولي أمر</span>
              </h2>
              <p className="text-xs sm:text-sm text-[#535E7B]">اعرف الخطوة القادمة بوضوح.</p>
            </div>

            <div className="lg:col-span-8 bg-white rounded-2xl border border-[#E2E8F0] shadow-xs divide-y divide-[#E2E8F0] overflow-hidden">
              {FAQ_ITEMS.map((faq, idx) => {
                const isOpen = openFaqIndex === idx;
                return (
                  <div key={idx}>
                    <button
                      type="button"
                      onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                      aria-expanded={isOpen}
                      aria-controls={`faq-answer-${idx}`}
                      id={`faq-question-${idx}`}
                      className="w-full min-h-[54px] px-5 py-4 text-right font-['Cairo'] font-extrabold text-sm sm:text-base text-[#1F2A44] hover:text-[#0D4E8B] flex items-center justify-between gap-3 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0D4E8B] transition-colors"
                    >
                      <span className="leading-snug">{faq.q}</span>
                      <ChevronDown
                        className={`w-4 h-4 text-[#0D4E8B] shrink-0 transition-transform duration-200 ${
                          isOpen ? 'rotate-180' : ''
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                    {isOpen && (
                      <div
                        id={`faq-answer-${idx}`}
                        role="region"
                        aria-labelledby={`faq-question-${idx}`}
                        className="px-5 pb-4 text-xs sm:text-sm text-[#535E7B] leading-relaxed animate-fade-in"
                      >
                        <p>{faq.a}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* =================================================================== */}
        {/* 7. BOTTOM NAVY CTA BANNER                                           */}
        {/* =================================================================== */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-gradient-to-l from-[#0D4E8B] to-[#083D77] text-white p-6 sm:p-10 shadow-[0_12px_32px_rgba(13,78,139,0.18)] flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 text-center md:text-right">
              <h2 className="font-['Cairo'] text-xl sm:text-2xl lg:text-[26px] font-black leading-snug">
                أول خطوة... ممكن تفرق مع طفلك.
              </h2>
              <p className="text-xs sm:text-sm text-blue-100 leading-relaxed">
                اختر معلمًا، واطلب تجربة مجانية ٢٠ دقيقة، ثم قرّر براحتك.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 shrink-0">
              <button
                type="button"
                onClick={handleScrollToSelector}
                className="min-h-[48px] px-7 py-3 rounded-[14px] bg-[#FFC629] hover:bg-[#F5BC18] active:scale-[0.99] text-[#1F2A44] font-['Cairo'] font-extrabold text-sm sm:text-base shadow-xs transition-all cursor-pointer whitespace-nowrap"
              >
                شوف المعلمين
              </button>
              <button
                type="button"
                onClick={onNavigateToJoin}
                className="min-h-[48px] px-5 py-3 rounded-[14px] bg-white/10 hover:bg-white/20 border border-white/20 text-white font-['Cairo'] font-bold text-xs sm:text-sm transition-colors cursor-pointer whitespace-nowrap"
              >
                التدريس مع شاطر
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
