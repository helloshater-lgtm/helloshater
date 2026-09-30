import React, { useState, useRef } from 'react';
import { SearchCriteria, Tutor } from '../types';
import {
  DataService,
  STAGES_DATA,
  GRADES_DATA,
  SUBJECTS_DATA,
  CURRICULUM_OPTIONS,
  QURAN_AGE_GROUPS,
  QURAN_LEVELS,
} from '../services/dataService';
import { TutorSelector } from './TutorSelector';
import { SearchResults } from './SearchResults';
import {
  ShieldCheck,
  GraduationCap,
  RotateCcw,
  MessageCircle,
  CheckCircle2,
  ChevronDown,
  ArrowLeft,
  ArrowDown,
  Sparkles,
  Phone,
} from 'lucide-react';
import { SHATIR_CONFIG } from '../config/shatirConfig';
import heroBannerImg from '../assets/hero-banner.png';

interface HomeViewProps {
  onSelectTutor: (tutorId: string) => void;
  onNavigateToJoin: () => void;
  savedCriteria?: SearchCriteria | null;
  savedResults?: Tutor[] | null;
  onSaveCriteria?: (criteria: SearchCriteria, results: Tutor[]) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  onSelectTutor,
  onNavigateToJoin,
  savedCriteria,
  savedResults,
  onSaveCriteria,
}) => {
  // Only consider searched if we have a valid criteria AND results returned from previous search
  const [hasSearched, setHasSearched] = useState(
    Boolean(savedCriteria && savedResults && savedResults.length > 0)
  );
  const [activeCriteria, setActiveCriteria] = useState<SearchCriteria | null>(
    savedCriteria || null
  );
  const [searchResults, setSearchResults] = useState<Tutor[]>(savedResults || []);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const selectorRef = useRef<HTMLDivElement>(null);

  const handleScrollToSelector = () => {
    selectorRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Called whenever the user alters any dropdown in the selector
  const handleCriteriaChange = () => {
    setHasSearched(false);
    setSearchError(null);
    setSearchResults([]);
    setActiveCriteria(null);
  };

  const executeSearch = async (criteria: SearchCriteria, simulateError = false) => {
    setIsLoading(true);
    setSearchError(null);
    setActiveCriteria(criteria);
    setHasSearched(true);

    try {
      const results = await DataService.searchTutors(criteria, simulateError);
      setSearchResults(results);
      onSaveCriteria?.(criteria, results);
      setTimeout(() => {
        document.getElementById('search-results-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err: any) {
      setSearchError(err?.message || 'حدث خطأ في جلب النتائج.');
      setSearchResults([]);
      onSaveCriteria?.(criteria, []);
    } finally {
      setIsLoading(false);
    }
  };

  const whatsappDirectUrl = `https://wa.me/${SHATIR_CONFIG.adminWhatsAppNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
    'السلام عليكم، أود المساعدة في اختيار المعلم المناسب لطفلي عبر منصة شاطر كلاسيز.'
  )}`;

  // Human readable label helpers for summary
  const stageName = STAGES_DATA.find((s) => s.id === activeCriteria?.stageId)?.name;
  const gradeName = GRADES_DATA.find((g) => g.id === activeCriteria?.gradeId)?.name;
  const subjectName = SUBJECTS_DATA.find((s) => s.id === activeCriteria?.subjectId)?.name;
  const curriculumName = CURRICULUM_OPTIONS.find((c) => c.id === activeCriteria?.curriculumType)?.name;
  const quranAgeName = QURAN_AGE_GROUPS.find((a) => a.id === activeCriteria?.ageGroupId)?.name;
  const quranLevelName = QURAN_LEVELS.find((l) => l.id === activeCriteria?.levelId)?.name;

  return (
    <div className="w-full animate-fade-in">
      {/* 1. Hero Section */}
      <section className="relative w-full overflow-hidden border-b border-[#E2E8F0] bg-[#F0F6FD]">
        {/* DESKTOP HERO (md and above): Full-width background, 420-480px height, mother & child visible on left, HTML typography on right */}
        <div className="hidden md:block relative w-full h-[440px] lg:h-[460px]">
          {/* Background Image Container with local downloaded asset */}
          <div className="absolute inset-0 w-full h-full overflow-hidden">
            <img
              src={heroBannerImg}
              alt="أم وطفل يتعلمان مع منصة شاطر كلاسيز"
              className="w-full h-full object-cover object-left md:object-[left_center]"
            />
            {/* Subtle soft gradient overlay on the right (RTL text area) for optimal typography readability while leaving the mother & child on left completely visible */}
            <div className="absolute inset-0 bg-gradient-to-l from-[#F0F6FD]/95 via-[#F0F6FD]/80 via-40% to-transparent pointer-events-none" />
          </div>

          {/* Foreground Content Container */}
          <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8 h-full flex items-center">
            <div className="max-w-xl lg:max-w-2xl text-right space-y-5">
              {/* Headline */}
              <h1 className="font-['Cairo'] text-3xl sm:text-4xl lg:text-5xl font-black text-[#0D4E8B] leading-[1.25] tracking-tight">
                معلم تثق به،
                <span className="block text-[#1F2A44] font-extrabold text-2xl sm:text-3xl lg:text-4xl mt-1">
                  ويتعلّم معه طفلك بثقة
                </span>
              </h1>

              {/* Subtext */}
              <p className="text-base lg:text-lg text-[#535E7B] leading-relaxed max-w-lg">
                اختر المرحلة والمادة، وتعرّف على المعلمين المناسبين لطفلك. ابدأ بحصة تجريبية مجانية، وسننسّق معك التفاصيل عبر واتساب.
              </p>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleScrollToSelector}
                  className="px-8 py-3.5 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white font-['Cairo'] font-bold text-sm sm:text-base shadow-md hover:shadow-lg active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>اختر معلم طفلك</span>
                  <ArrowDown className="w-4 h-4 text-[#FFC629]" />
                </button>

                <a
                  href={whatsappDirectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-3.5 rounded-xl bg-white hover:bg-[#F2F3F6] text-[#0D4E8B] border border-[#CBD5E1] font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  <MessageCircle className="w-4 h-4 text-emerald-600" />
                  <span>نساعدك تختار عبر واتساب</span>
                </a>
              </div>

              {/* Reassurance Subtext */}
              <div className="flex items-center gap-2 text-xs text-[#535E7B] pt-1">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-medium">حصة تجريبية مجانية • دون التزام مالي</span>
              </div>
            </div>
          </div>
        </div>

        {/* MOBILE HERO (md:hidden): Compact vertical layout, prominent primary button, subtle WhatsApp link, and 180-220px image */}
        <div className="block md:hidden bg-[#F0F6FD] pt-4 pb-3.5 px-4">
          <div className="max-w-md mx-auto space-y-2.5 text-right">
            {/* Headline */}
            <h1 className="font-['Cairo'] text-2xl sm:text-3xl font-black text-[#0D4E8B] leading-[1.2] tracking-tight">
              معلم تثق به،
              <span className="block text-[#1F2A44] font-extrabold text-xl sm:text-2xl mt-0.5">
                ويتعلّم معه طفلك بثقة
              </span>
            </h1>

            {/* Subtext */}
            <p className="text-xs sm:text-sm text-[#535E7B] leading-relaxed">
              اختر المرحلة والمادة، وتعرّف على المعلمين المناسبين لطفلك. ابدأ بحصة تجريبية مجانية، وسننسّق معك التفاصيل عبر واتساب.
            </p>

            {/* Action Area: Prominent 50px Primary Button + Subtle Secondary WhatsApp Link & Guarantee */}
            <div className="space-y-2 pt-0.5">
              <button
                type="button"
                onClick={handleScrollToSelector}
                className="w-full h-[50px] rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white font-['Cairo'] font-bold text-base shadow-md active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>اختر معلم طفلك</span>
                <ArrowDown className="w-4 h-4 text-[#FFC629]" />
              </button>

              <div className="flex items-center justify-between px-1 text-xs">
                <a
                  href={whatsappDirectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0D4E8B] hover:text-[#003767] underline decoration-[#0D4E8B]/40 hover:decoration-[#0D4E8B] transition-colors py-0.5"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>نساعدك تختار عبر واتساب</span>
                </a>

                {/* Reassurance Subtext */}
                <div className="flex items-center gap-1 text-[11px] text-[#535E7B]">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="font-medium">تجربة مجانية • دون التزام</span>
                </div>
              </div>
            </div>

            {/* Short cropped image (190-210px) keeping mother & child without distortion */}
            <div className="relative w-full h-[190px] sm:h-[210px] rounded-2xl overflow-hidden shadow-sm border border-[#E2E8F0] mt-2.5 bg-[#E2E8F0]">
              <img
                src={heroBannerImg}
                alt="أم وطفل يتعلمان عبر شاطر كلاسيز"
                className="w-full h-full object-cover object-[15%_center]"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 2. Interactive Tutor Selector Tool (Closer to hero section) */}
      <section ref={selectorRef} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-3 sm:mt-5 mb-10 sm:mb-14">
        <TutorSelector
          onSearch={(criteria) => executeSearch(criteria, false)}
          initialCriteria={activeCriteria || savedCriteria || undefined}
          isSearching={isLoading}
          onCriteriaChange={handleCriteriaChange}
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

      {/* 4. Section: كيف تعمل منصة شاطر؟ (How it Works) */}
      <section id="how-it-works" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-2">
        <div className="text-center max-w-xl mx-auto mb-8 space-y-2">
          <h2 className="font-['Cairo'] text-xl sm:text-2xl font-bold text-[#0D4E8B]">
            كيف تبدأ رحلة التعلم مع شاطر؟
          </h2>
          <p className="text-xs sm:text-sm text-[#64748B]">
            خطوات بسيطة تمنحك الأمان الكامل وتضمن اختيار المعلم الأنسب لطفلك.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Step 1 */}
          <div className="p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm space-y-2">
            <span className="w-8 h-8 rounded-xl bg-[#0D4E8B] text-white flex items-center justify-center font-['Cairo'] font-bold text-sm shadow-sm">
              ١
            </span>
            <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#1F2A44]">
              اختر مواصفات طفلك
            </h3>
            <p className="text-xs text-[#535E7B] leading-relaxed">
              حدد المرحلة والصف ونوع الدراسة لتظهر لك قائمة المعلمين المناسبين لاختياراتك.
            </p>
          </div>

          {/* Step 2 */}
          <div className="p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm space-y-2">
            <span className="w-8 h-8 rounded-xl bg-[#0D4E8B] text-white flex items-center justify-center font-['Cairo'] font-bold text-sm shadow-sm">
              ٢
            </span>
            <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#1F2A44]">
              تصفح ملفات المعلمين
            </h3>
            <p className="text-xs text-[#535E7B] leading-relaxed">
              شاهد الفيديو التعريفي وتعرف على مؤهلات المعلم وطريقة شرحه قبل الاختيار.
            </p>
          </div>

          {/* Step 3 */}
          <div className="p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm space-y-2">
            <span className="w-8 h-8 rounded-xl bg-[#0D4E8B] text-white flex items-center justify-center font-['Cairo'] font-bold text-sm shadow-sm">
              ٣
            </span>
            <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#1F2A44]">
              اطلب حصة تجريبية مجانية
            </h3>
            <p className="text-xs text-[#535E7B] leading-relaxed">
              ننسّق معك مباشرة عبر واتساب لتحديد موعد الحصة المجانية دون أي التزام مالي.
            </p>
          </div>

          {/* Step 4 */}
          <div className="p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm space-y-2">
            <span className="w-8 h-8 rounded-xl bg-[#0D4E8B] text-white flex items-center justify-center font-['Cairo'] font-bold text-sm shadow-sm">
              ٤
            </span>
            <h3 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#1F2A44]">
              قيّم التجربة وابدأ المتابعة
            </h3>
            <p className="text-xs text-[#535E7B] leading-relaxed">
              إن ارتاح طفلك نبدأ خطة المتابعة، وبإمكانك تجربة معلم آخر مجاناً في أي وقت.
            </p>
          </div>
        </div>
      </section>

      {/* 5. Section: قسم الثقة الأزرق (Full Container Width, Compact Height, Balanced Cards) */}
      <section id="guarantee" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="w-full bg-[#0D4E8B] rounded-3xl p-6 sm:p-8 text-white shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/15">
            <div>
              <h2 className="font-['Cairo'] text-xl sm:text-2xl font-bold">
                ضمان شاطر لراحة أولياء الأمور
              </h2>
              <p className="text-xs sm:text-sm text-white/80 mt-0.5">
                بيئة تعليمية منضبطة ترتكز على الشفافية والمتابعة المستمرة
              </p>
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-[#FFC629] text-xs font-bold shrink-0 self-start md:self-auto border border-white/10">
              <ShieldCheck className="w-4 h-4 text-[#FFC629]" />
              <span>حصة تجريبية مجانية أولى</span>
            </div>
          </div>

          {/* 4 Balanced Cards Distributed Across Full Width */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-6">
            <div className="p-4 rounded-2xl bg-white/10 border border-white/10 space-y-1.5">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-[#FFC629]" />
                <h4 className="font-['Cairo'] font-bold text-sm text-white">تدقيق المؤهلات الأكاديمية</h4>
              </div>
              <p className="text-xs text-white/75 leading-relaxed">
                مراجعة دقيقة للمؤهل الجامعي وسنوات التدريس الفعلية في المدارس.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white/10 border border-white/10 space-y-1.5">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-[#FFC629]" />
                <h4 className="font-['Cairo'] font-bold text-sm text-white">استبدال المعلم مجاناً</h4>
              </div>
              <p className="text-xs text-white/75 leading-relaxed">
                لم يناسب أسلوب المعلم طفلك؟ نتيح لك تجربة معلم آخر دون أي تكلفة.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white/10 border border-white/10 space-y-1.5">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-[#FFC629]" />
                <h4 className="font-['Cairo'] font-bold text-sm text-white">تنسيق مباشر عبر واتساب</h4>
              </div>
              <p className="text-xs text-white/75 leading-relaxed">
                فريق إدارة شاطر معك خطوة بخطوة لترتيب المواعيد والمتابعة.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white/10 border border-white/10 space-y-1.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#FFC629]" />
                <h4 className="font-['Cairo'] font-bold text-sm text-white">مرونة تامة دون التزام</h4>
              </div>
              <p className="text-xs text-white/75 leading-relaxed">
                لا باقات إجبارية ولا خصم مسبق من البطاقة الائتمانية.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Section: Call to action for Teachers */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="p-6 sm:p-8 rounded-3xl bg-[#F2F3F6] border border-[#CBD5E1] flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-1 text-right">
            <h3 className="font-['Cairo'] text-lg sm:text-xl font-bold text-[#1F2A44]">
              هل أنت معلم متخصص وشغوف بالتدريس؟
            </h3>
            <p className="text-xs sm:text-sm text-[#535E7B] max-w-xl leading-relaxed">
              انضم إلى نخبة معلّمي شاطر. نصلك بأولياء أمور يبحثون عن الكفاءة والالتزام، مع مرونة تامة في أوقاتك.
            </p>
          </div>

          <button
            onClick={onNavigateToJoin}
            className="w-full md:w-auto px-7 py-3 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white font-['Cairo'] font-bold text-xs sm:text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <span>انضم كمعلم في شاطر</span>
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

        <div className="space-y-3">
          <details className="p-4 sm:p-5 rounded-2xl bg-white border border-[#E2E8F0] group cursor-pointer">
            <summary className="font-['Cairo'] font-bold text-sm sm:text-base text-[#1F2A44] list-none flex items-center justify-between">
              <span>هل الحصة التجريبية الأولى مجانية فعلاً؟</span>
              <ChevronDown className="w-4 h-4 text-[#0D4E8B] group-open:rotate-180 transition-transform" />
            </summary>
            <p className="text-xs sm:text-sm text-[#535E7B] pt-3 leading-relaxed border-t border-[#F2F3F6] mt-3">
              نعم، تهدف الحصة التجريبية (مدتها 30 إلى 50 دقيقة حسب المعلم) إلى قياس مدى تفاعل الطفل مع أسلوب الشرح والتأكد من ارتياحه قبل أي التزام مالي.
            </p>
          </details>

          <details className="p-4 sm:p-5 rounded-2xl bg-white border border-[#E2E8F0] group cursor-pointer">
            <summary className="font-['Cairo'] font-bold text-sm sm:text-base text-[#1F2A44] list-none flex items-center justify-between">
              <span>ماذا يحدث بعد طلب حجز الحصة عبر واتساب؟</span>
              <ChevronDown className="w-4 h-4 text-[#0D4E8B] group-open:rotate-180 transition-transform" />
            </summary>
            <p className="text-xs sm:text-sm text-[#535E7B] pt-3 leading-relaxed border-t border-[#F2F3F6] mt-3">
              تصل رسالتك مباشرة إلى إدارة شاطر متضمنة اسم المعلم والمادة والمرحلة. يتواصل معك مستشارنا لتحديد موعد الحصة بما يناسب جدولكم. فتح واتساب لا يعني تأكيد الحجز فوراً إلا بعد اتفاقك الكامل.
            </p>
          </details>

          <details className="p-4 sm:p-5 rounded-2xl bg-white border border-[#E2E8F0] group cursor-pointer">
            <summary className="font-['Cairo'] font-bold text-sm sm:text-base text-[#1F2A44] list-none flex items-center justify-between">
              <span>ماذا إذا لم يناسب أسلوب المعلم طفلي بعد الحصة التجريبية؟</span>
              <ChevronDown className="w-4 h-4 text-[#0D4E8B] group-open:rotate-180 transition-transform" />
            </summary>
            <p className="text-xs sm:text-sm text-[#535E7B] pt-3 leading-relaxed border-t border-[#F2F3F6] mt-3">
              تساعدك إدارة شاطر على تجربة معلم آخر مجاناً حتى تجد المعلم الأنسب لطفلك دون أي رسوم إضافية.
            </p>
          </details>
        </div>
      </section>
      </div>
    </div>
  );
};
