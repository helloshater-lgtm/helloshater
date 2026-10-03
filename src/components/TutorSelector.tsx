import React, { useState, useEffect, useMemo } from 'react';
import {
  TrackType,
  StageId,
  CurriculumType,
  SearchCriteria,
  Stage,
  Grade,
  Subject,
  CurriculumOption,
  QuranAgeGroup,
  QuranLevel,
} from '../types';
import { DataService } from '../services/dataService';
import { DatabaseSchoolCourseOption } from '../services/supabaseDataService';
import { buildInterestRegistrationWhatsAppUrl } from '../config/shatirConfig';
import {
  trackParentSelectorStarted,
  resetSelectorStartedTracking,
  trackParentSearchSubmitted,
  trackNoCourseOptionsShown,
  trackWhatsAppClicked,
} from '../services/analytics';
import {
  BookOpen,
  Sparkles,
  ChevronDown,
  Check,
  ArrowLeft,
  RotateCcw,
  MessageCircle,
  AlertCircle,
  Loader2,
  Info,
  SlidersHorizontal,
} from 'lucide-react';

interface TutorSelectorProps {
  onSearch: (criteria: SearchCriteria) => void;
  initialCriteria?: SearchCriteria;
  isSearching?: boolean;
  onCriteriaChange?: () => void;
  onTaxonomyLoaded?: (taxonomy: {
    stages: Stage[];
    grades: Grade[];
    subjects: Subject[];
    curricula: CurriculumOption[];
    quranAges: QuranAgeGroup[];
    quranLevels: QuranLevel[];
  }) => void;
}

export const TutorSelector: React.FC<TutorSelectorProps> = ({
  onSearch,
  initialCriteria,
  isSearching = false,
  onCriteriaChange,
  onTaxonomyLoaded,
}) => {
  // Track toggle
  const [track, setTrack] = useState<TrackType>(initialCriteria?.track || 'school');

  // School track state
  const [stageId, setStageId] = useState<StageId | ''>(initialCriteria?.stageId || '');
  const [gradeId, setGradeId] = useState<string>(initialCriteria?.gradeId || '');
  const [curriculumType, setCurriculumType] = useState<CurriculumType | ''>(
    initialCriteria?.curriculumType || ''
  );
  const [subjectId, setSubjectId] = useState<string>(initialCriteria?.subjectId || '');

  // Quran track state
  const [ageGroupId, setAgeGroupId] = useState<string>(initialCriteria?.ageGroupId || '');
  const [levelId, setLevelId] = useState<string>(initialCriteria?.levelId || '');

  // Live options from Supabase Data Layer
  const [stages, setStages] = useState<Stage[]>([]);
  const [allGrades, setAllGrades] = useState<Grade[]>([]);
  const [availableGrades, setAvailableGrades] = useState<Grade[]>([]);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [curriculumOptions, setCurriculumOptions] = useState<CurriculumOption[]>([]);
  const [quranAgeGroups, setQuranAgeGroups] = useState<QuranAgeGroup[]>([]);
  const [quranLevels, setQuranLevels] = useState<QuranLevel[]>([]);
  const [schoolCourseOptions, setSchoolCourseOptions] = useState<DatabaseSchoolCourseOption[]>([]);

  // Loading & error states
  const [isLoadingTaxonomy, setIsLoadingTaxonomy] = useState(true);
  const [taxonomyError, setTaxonomyError] = useState<string | null>(null);

  const loadTaxonomy = async () => {
    setIsLoadingTaxonomy(true);
    setTaxonomyError(null);
    try {
      const [
        loadedStages,
        loadedCurricula,
        loadedSubjects,
        loadedQuranAges,
        loadedQuranLevels,
        loadedCourseOptions,
      ] = await Promise.all([
        DataService.getStages(),
        DataService.getCurriculumOptions(),
        DataService.getSubjects(),
        DataService.getQuranAgeGroups(),
        DataService.getQuranLevels(),
        DataService.getSchoolCourseOptions(),
      ]);

      setStages(loadedStages);
      setCurriculumOptions(loadedCurricula);
      setAllSubjects(loadedSubjects);
      setQuranAgeGroups(loadedQuranAges);
      setQuranLevels(loadedQuranLevels);
      setSchoolCourseOptions(loadedCourseOptions);

      // Pre-fetch all grades for easy lookup
      const gradesPromises = loadedStages.map((s) => DataService.getGradesByStage(s.id));
      const gradesResults = await Promise.all(gradesPromises);
      const flatGrades = gradesResults.flat();
      setAllGrades(flatGrades);

      onTaxonomyLoaded?.({
        stages: loadedStages,
        grades: flatGrades,
        subjects: loadedSubjects,
        curricula: loadedCurricula,
        quranAges: loadedQuranAges,
        quranLevels: loadedQuranLevels,
      });
    } catch (err: any) {
      setTaxonomyError(err?.message || 'تعذر تحميل الخيارات والتصنيفات حالياً. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsLoadingTaxonomy(false);
    }
  };

  useEffect(() => {
    loadTaxonomy();
  }, []);

  // Sync with initialCriteria when provided or updated
  useEffect(() => {
    if (initialCriteria) {
      setTrack(initialCriteria.track || 'school');
      setStageId(initialCriteria.stageId || '');
      setGradeId(initialCriteria.gradeId || '');
      setCurriculumType(initialCriteria.curriculumType || '');
      setSubjectId(initialCriteria.subjectId || '');
      setAgeGroupId(initialCriteria.ageGroupId || '');
      setLevelId(initialCriteria.levelId || '');
    }
  }, [initialCriteria]);

  // Cascading Grade update when stage changes
  useEffect(() => {
    if (stageId) {
      DataService.getGradesByStage(stageId).then((grades) => {
        setAvailableGrades(grades);
        if (gradeId && !grades.some((g) => g.id === gradeId)) {
          setGradeId('');
          setSubjectId('');
        }
      });
    } else {
      setAvailableGrades([]);
      setGradeId('');
      setSubjectId('');
    }
  }, [stageId]);

  // Extract available subjects strictly based on active school_course_options in Supabase
  // Filtered by selected grade and selected curriculum
  const availableSubjectsForSelection = useMemo(() => {
    if (!gradeId || !curriculumType) return [];

    const matchingOptions = schoolCourseOptions.filter((opt) => {
      if (opt.grade_id !== gradeId) return false;
      if (opt.curriculum_id !== curriculumType) return false;
      if (opt.is_active === false) return false;
      return true;
    });

    const allowedSubjectIds = new Set(matchingOptions.map((opt) => opt.subject_id));
    return allSubjects.filter((s) => allowedSubjectIds.has(s.id));
  }, [gradeId, curriculumType, schoolCourseOptions, allSubjects]);

  // Whether courses are configured for the chosen grade + curriculum
  const hasCoursesConfigured = useMemo(() => {
    if (!gradeId || !curriculumType) return true;
    return availableSubjectsForSelection.length > 0;
  }, [gradeId, curriculumType, availableSubjectsForSelection]);

  // Track no_course_options_shown when grade + curriculum have no active configured subjects
  useEffect(() => {
    if (track === 'school' && gradeId && curriculumType && !hasCoursesConfigured) {
      trackNoCourseOptionsShown(stageId, gradeId, curriculumType);
    }
  }, [track, stageId, gradeId, curriculumType, hasCoursesConfigured]);

  // Helper 1: Abbreviate stage names to «ابتدائي»، «إعدادي / متوسط»، «ثانوي» while keeping Supabase ID
  const getStageShortName = (stg: Stage): string => {
    const name = stg.name || '';
    const id = String(stg.id).toLowerCase();
    if (id.includes('prim') || name.includes('ابتدائ')) return 'ابتدائي';
    if (
      id.includes('mid') ||
      id.includes('prep') ||
      name.includes('متوسط') ||
      name.includes('إعداد')
    ) {
      return 'إعدادي / متوسط';
    }
    if (id.includes('sec') || id.includes('high') || name.includes('ثانوي')) return 'ثانوي';
    return name;
  };

  // Helper 2: Format age range clearly without hyphens that flip in RTL
  const formatQuranAge = (ag: QuranAgeGroup) => {
    const name = ag.name || '';
    const range = (ag.ageRange || '').trim();
    const id = String(ag.id).toLowerCase();

    let formattedRange = '';
    if (
      id.includes('young') ||
      name.includes('صغار') ||
      range.includes('4') ||
      range.includes('٤')
    ) {
      formattedRange = 'من ٤ إلى ٧ سنوات';
    } else if (
      id.includes('bud') ||
      name.includes('براعم') ||
      range.includes('7') ||
      range.includes('٧') ||
      range.includes('8') ||
      range.includes('٨')
    ) {
      formattedRange = 'من ٨ إلى ١٢ سنة';
    } else if (
      id.includes('youth') ||
      id.includes('teen') ||
      name.includes('يافع') ||
      name.includes('فتيان') ||
      range.includes('10') ||
      range.includes('13') ||
      range.includes('١٣')
    ) {
      formattedRange = 'من ١٣ إلى ١٨ سنة';
    } else {
      const match = range.match(/([0-9\u0660-\u0669]+)\s*[-–—]\s*([0-9\u0660-\u0669]+)/);
      if (match) {
        formattedRange = `من ${match[1]} إلى ${match[2]} سنة`;
      } else {
        formattedRange = range;
      }
    }

    return { name, formattedRange };
  };

  // Names for WhatsApp messaging and labels
  const selectedStage = stages.find((s) => s.id === stageId);
  const selectedStageShort = selectedStage ? getStageShortName(selectedStage) : '';
  const selectedGradeName = allGrades.find((g) => g.id === gradeId)?.name;
  const selectedCurriculumName = curriculumOptions.find((c) => c.id === curriculumType)?.name;
  const selectedSubjectName = allSubjects.find((s) => s.id === subjectId)?.name;

  const selectedQuranAgeObj = quranAgeGroups.find((a) => a.id === ageGroupId);
  const selectedQuranAgeFormatted = selectedQuranAgeObj
    ? `${selectedQuranAgeObj.name} (${formatQuranAge(selectedQuranAgeObj).formattedRange})`
    : '';
  const selectedQuranLevelName = quranLevels.find((l) => l.id === levelId)?.name;

  // Handlers with cascading resets and hiding old results
  const handleTrackChange = (newTrack: TrackType) => {
    trackParentSelectorStarted(newTrack);
    if (track !== newTrack) {
      setTrack(newTrack);
      setStageId('');
      setGradeId('');
      setCurriculumType('');
      setSubjectId('');
      setAgeGroupId('');
      setLevelId('');
      onCriteriaChange?.();
    }
  };

  const handleStageSelect = (newStage: StageId) => {
    trackParentSelectorStarted(track);
    if (stageId !== newStage) {
      setStageId(newStage);
      setGradeId('');
      setCurriculumType('');
      setSubjectId('');
      onCriteriaChange?.();
    }
  };

  const handleGradeSelect = (newGrade: string) => {
    trackParentSelectorStarted(track);
    if (gradeId !== newGrade) {
      setGradeId(newGrade);
      setSubjectId('');
      onCriteriaChange?.();
    }
  };

  const handleCurriculumSelect = (newCurriculum: CurriculumType) => {
    trackParentSelectorStarted(track);
    if (curriculumType !== newCurriculum) {
      setCurriculumType(newCurriculum);
      setSubjectId('');
      onCriteriaChange?.();
    }
  };

  const handleSubjectSelect = (newSubject: string) => {
    trackParentSelectorStarted(track);
    setSubjectId(newSubject);
    onCriteriaChange?.();
  };

  const handleAgeGroupSelect = (newAgeGroup: string) => {
    trackParentSelectorStarted(track);
    if (ageGroupId !== newAgeGroup) {
      setAgeGroupId(newAgeGroup);
      setLevelId('');
      onCriteriaChange?.();
    }
  };

  const handleLevelSelect = (newLevel: string) => {
    trackParentSelectorStarted(track);
    setLevelId(newLevel);
    onCriteriaChange?.();
  };

  const handleReset = () => {
    resetSelectorStartedTracking();
    setStageId('');
    setGradeId('');
    setCurriculumType('');
    setSubjectId('');
    setAgeGroupId('');
    setLevelId('');
    onCriteriaChange?.();
  };

  // Determine readiness
  const isSchoolComplete = Boolean(
    stageId && gradeId && curriculumType && subjectId && hasCoursesConfigured
  );
  const isQuranComplete = Boolean(ageGroupId && levelId);
  const isFormComplete = track === 'school' ? isSchoolComplete : isQuranComplete;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormComplete) return;

    if (track === 'school') {
      const criteria: SearchCriteria = {
        track: 'school',
        stageId,
        gradeId,
        subjectId,
        curriculumType,
      };
      trackParentSearchSubmitted(criteria);
      onSearch(criteria);
    } else {
      const criteria: SearchCriteria = {
        track: 'quran',
        ageGroupId,
        levelId,
      };
      trackParentSearchSubmitted(criteria);
      onSearch(criteria);
    }
  };

  if (isLoadingTaxonomy) {
    return (
      <div className="w-full bg-white rounded-2xl sm:rounded-3xl border border-[#E2E8F0] p-8 text-center flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-[#0D4E8B] animate-spin" />
        <p className="text-xs sm:text-sm font-medium text-[#64748B]">
          جاري تحميل الخيارات التعليمية المتاحة...
        </p>
      </div>
    );
  }

  if (taxonomyError) {
    return (
      <div className="w-full bg-[#FFDAD6]/30 border border-[#BA1A1A]/30 rounded-2xl sm:rounded-3xl p-6 text-center flex flex-col items-center justify-center gap-3">
        <AlertCircle className="w-8 h-8 text-[#BA1A1A]" />
        <p className="text-xs sm:text-sm font-medium text-[#BA1A1A]">{taxonomyError}</p>
        <button
          onClick={loadTaxonomy}
          className="px-5 py-2.5 rounded-xl bg-[#BA1A1A] text-white hover:bg-[#93000A] text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>إعادة المحاولة</span>
        </button>
      </div>
    );
  }

  return (
    <div
      id="tutor-selector-section"
      className="w-full bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-[#E2E8F0] p-4 sm:p-5 md:p-6 transition-all scroll-mt-20"
    >
      {/* 1. Header & Title */}
      <div className="space-y-1 pb-3.5 sm:pb-4 border-b border-[#E2E8F0]/80">
        <h2 className="font-['Cairo'] text-xl sm:text-2xl font-black text-[#0D4E8B]">
          ما الذي يحتاجه طفلك؟
        </h2>
        <p className="text-xs sm:text-sm text-[#535E7B] font-normal">
          اختَر المسار، ثم حدّد التفاصيل المناسبة لطفلك.
        </p>
      </div>

      {/* 2. Track Selector (Balanced & Accessible) */}
      <div className="pt-3 sm:pt-4">
        <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-[#F1F5F9] rounded-2xl border border-[#E2E8F0]/80 w-full max-w-md mx-auto">
          <button
            type="button"
            onClick={() => handleTrackChange('school')}
            className={`min-h-[46px] sm:min-h-[48px] px-3 py-2 rounded-xl font-['Cairo'] font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer text-center select-none ${
              track === 'school'
                ? 'bg-[#0D4E8B] text-white shadow-sm'
                : 'text-[#1F2A44] hover:text-[#0D4E8B] hover:bg-white/60'
            }`}
          >
            <BookOpen
              className={`w-4 h-4 shrink-0 ${track === 'school' ? 'text-[#FFC629]' : 'text-[#64748B]'}`}
            />
            <span className="whitespace-nowrap">المناهج المدرسية</span>
          </button>
          <button
            type="button"
            onClick={() => handleTrackChange('quran')}
            className={`min-h-[46px] sm:min-h-[48px] px-3 py-2 rounded-xl font-['Cairo'] font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer text-center select-none ${
              track === 'quran'
                ? 'bg-[#0D4E8B] text-white shadow-sm'
                : 'text-[#1F2A44] hover:text-[#0D4E8B] hover:bg-white/60'
            }`}
          >
            <Sparkles
              className={`w-4 h-4 shrink-0 ${track === 'quran' ? 'text-[#FFC629]' : 'text-[#64748B]'}`}
            />
            <span className="whitespace-nowrap">القرآن والتأسيس</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 sm:mt-5 space-y-4 sm:space-y-5">
        {/* ========================================================= */}
        {/* TRACK A: School Curriculum (المرحلة ← الصف ← المنهج ← المادة) */}
        {/* ========================================================= */}
        {track === 'school' && (
          <div className="space-y-4 sm:space-y-5">
            {/* Step 1: المرحلة الدراسية (مختصرة: ابتدائي، إعدادي / متوسط، ثانوي) */}
            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-bold text-[#1F2A44] flex items-center gap-2 font-['Cairo']">
                <span className="w-5 h-5 rounded-full bg-[#0D4E8B] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                  ١
                </span>
                <span>المرحلة الدراسية</span>
              </label>

              <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                {stages.map((stg) => {
                  const isSelected = stageId === stg.id;
                  const shortName = getStageShortName(stg);
                  return (
                    <button
                      key={stg.id}
                      type="button"
                      onClick={() => handleStageSelect(stg.id)}
                      className={`min-h-[46px] sm:h-[48px] px-2.5 py-2 rounded-xl text-xs sm:text-sm font-['Cairo'] font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center ${
                        isSelected
                          ? 'bg-[#0D4E8B] text-white border-[#0D4E8B] shadow-sm'
                          : 'bg-[#F8FAFD] text-[#1F2A44] border-[#CBD5E1]/70 hover:border-[#0D4E8B]/50 hover:bg-white'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-[#FFC629]" />}
                      <span>{shortName}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2: الصف الدراسي (قائمة منسدلة بارتفاع 50px) */}
            {stageId && (
              <div className="space-y-2 pt-1 border-t border-[#E2E8F0]/60 animate-fade-in">
                <label className="text-xs sm:text-sm font-bold text-[#1F2A44] flex items-center gap-2 font-['Cairo']">
                  <span className="w-5 h-5 rounded-full bg-[#0D4E8B] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                    ٢
                  </span>
                  <span>الصف الدراسي</span>
                </label>

                <div className="relative">
                  <select
                    value={gradeId}
                    onChange={(e) => handleGradeSelect(e.target.value)}
                    className="w-full h-[50px] px-4 pl-10 rounded-xl bg-[#F8FAFD] border border-[#CBD5E1]/80 text-[#1F2A44] font-['Cairo'] font-bold text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#0D4E8B] focus:bg-white transition-all appearance-none cursor-pointer"
                  >
                    <option value="">اختر الصف الدراسي...</option>
                    {availableGrades.map((grd) => (
                      <option key={grd.id} value={grd.id}>
                        {grd.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            )}

            {/* Step 3: نوع الدراسة والمنهج (يظهر بعد اختيار الصف) */}
            {stageId && gradeId && (
              <div className="space-y-2 pt-1 border-t border-[#E2E8F0]/60 animate-fade-in">
                <label className="text-xs sm:text-sm font-bold text-[#1F2A44] flex items-center gap-2 font-['Cairo']">
                  <span className="w-5 h-5 rounded-full bg-[#0D4E8B] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                    ٣
                  </span>
                  <span>نوع الدراسة والمنهج</span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-2.5">
                  {curriculumOptions.map((opt) => {
                    const isSelected = curriculumType === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleCurriculumSelect(opt.id as CurriculumType)}
                        className={`min-h-[46px] sm:h-[48px] px-4 py-2 rounded-xl text-xs sm:text-sm font-['Cairo'] font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center ${
                          isSelected
                            ? 'bg-[#0D4E8B] text-white border-[#0D4E8B] shadow-sm'
                            : 'bg-[#F8FAFD] text-[#1F2A44] border-[#CBD5E1]/70 hover:border-[#0D4E8B]/50 hover:bg-white'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-[#FFC629]" />}
                        <span>{opt.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 4: المادة التعليمية (تستخرج حصراً من school_course_options) */}
            {stageId && gradeId && curriculumType && (
              <div className="pt-1 border-t border-[#E2E8F0]/60 animate-fade-in">
                {availableSubjectsForSelection.length > 0 ? (
                  <div className="space-y-2">
                    <label className="text-xs sm:text-sm font-bold text-[#1F2A44] flex items-center gap-2 font-['Cairo']">
                      <span className="w-5 h-5 rounded-full bg-[#0D4E8B] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                        ٤
                      </span>
                      <span>المادة التعليمية</span>
                    </label>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-2.5">
                      {availableSubjectsForSelection.map((sbj) => {
                        const isSelected = subjectId === sbj.id;
                        return (
                          <button
                            key={sbj.id}
                            type="button"
                            onClick={() => handleSubjectSelect(sbj.id)}
                            className={`min-h-[46px] sm:h-[48px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-['Cairo'] font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center ${
                              isSelected
                                ? 'bg-[#0D4E8B] text-white border-[#0D4E8B] shadow-sm'
                                : 'bg-[#F8FAFD] text-[#1F2A44] border-[#CBD5E1]/70 hover:border-[#0D4E8B]/50 hover:bg-white'
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-[#FFC629]" />}
                            <span>{sbj.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* حالة عدم وجود تركيبات معتمدة لهذا الصف والمنهج */
                  <div className="p-4 rounded-2xl bg-[#F0F6FD] border border-[#D1DCFE] text-right space-y-2.5">
                    <div className="flex items-start gap-2.5">
                      <Info className="w-5 h-5 text-[#0D4E8B] shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <h4 className="font-['Cairo'] text-sm sm:text-base font-bold text-[#0D4E8B]">
                          نعمل على تجهيز التخصصات المتاحة
                        </h4>
                        <p className="text-xs sm:text-sm text-[#535E7B] leading-relaxed">
                          نعمل على تجهيز التخصصات المتاحة لهذا الاختيار حالياً. تواصل معنا وأخبرنا باحتياجك وسنساعدك في التنسيق فوراً.
                        </p>
                      </div>
                    </div>
                    <div className="pt-0.5 flex flex-wrap items-center gap-2 justify-start">
                      <a
                        href={buildInterestRegistrationWhatsAppUrl({
                          track: 'school',
                          stageName: selectedStage?.name,
                          gradeName: selectedGradeName,
                          curriculumName: selectedCurriculumName,
                          subjectName: selectedSubjectName,
                        })}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => trackWhatsAppClicked('no_courses_interest')}
                        className="min-h-[46px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-sm transition-all inline-flex items-center gap-2 cursor-pointer"
                      >
                        <MessageCircle className="w-4 h-4 shrink-0" />
                        <span>تواصل معنا عبر واتساب لتسجيل طلبك</span>
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TRACK B: Quran Track (الفئة العمرية ← البرنامج والمستوى) */}
        {/* ========================================================= */}
        {track === 'quran' && (
          <div className="space-y-4 sm:space-y-5">
            {/* Step 1: الفئة العمرية للطفل (ارتفاع مخفض وصيغة نصية واضحة) */}
            <div className="space-y-2">
              <label className="text-xs sm:text-sm font-bold text-[#1F2A44] flex items-center gap-2 font-['Cairo']">
                <span className="w-5 h-5 rounded-full bg-[#0D4E8B] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                  ١
                </span>
                <span>الفئة العمرية للطفل</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {quranAgeGroups.map((ag) => {
                  const isSelected = ageGroupId === ag.id;
                  const { name, formattedRange } = formatQuranAge(ag);
                  return (
                    <button
                      key={ag.id}
                      type="button"
                      onClick={() => handleAgeGroupSelect(ag.id)}
                      className={`min-h-[44px] sm:h-[46px] px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-['Cairo'] font-bold border transition-all flex items-center justify-between gap-2 cursor-pointer text-right ${
                        isSelected
                          ? 'bg-[#0D4E8B] text-white border-[#0D4E8B] shadow-sm'
                          : 'bg-[#F8FAFD] text-[#1F2A44] border-[#CBD5E1]/70 hover:border-[#0D4E8B]/50 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-[#FFC629]" />}
                        <span className="truncate">{name}</span>
                      </div>
                      <span
                        className={`text-[11px] shrink-0 font-medium ${
                          isSelected ? 'text-white/90' : 'text-[#64748B]'
                        }`}
                      >
                        {formattedRange}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2: البرنامج والهدف المطلوب (يظهر بعد اختيار الفئة العمرية) */}
            {ageGroupId && (
              <div className="space-y-2 pt-1 border-t border-[#E2E8F0]/60 animate-fade-in">
                <label className="text-xs sm:text-sm font-bold text-[#1F2A44] flex items-center gap-2 font-['Cairo']">
                  <span className="w-5 h-5 rounded-full bg-[#0D4E8B] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                    ٢
                  </span>
                  <span>البرنامج والهدف المطلوب</span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {quranLevels.map((lvl) => {
                    const isSelected = levelId === lvl.id;
                    return (
                      <button
                        key={lvl.id}
                        type="button"
                        onClick={() => handleLevelSelect(lvl.id)}
                        className={`min-h-[44px] sm:min-h-[46px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-['Cairo'] font-bold border transition-all flex items-center justify-center gap-2 cursor-pointer text-center ${
                          isSelected
                            ? 'bg-[#0D4E8B] text-white border-[#0D4E8B] shadow-sm'
                            : 'bg-[#F8FAFD] text-[#1F2A44] border-[#CBD5E1]/70 hover:border-[#0D4E8B]/50 hover:bg-white'
                        }`}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-[#FFC629]" />}
                        <span>{lvl.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* 5. ملخص مختصر للاختيارات مع إمكانية تعديلها وزر البحث */}
        {/* ========================================================= */}
        {isFormComplete && (
          <div className="pt-3 border-t border-[#E2E8F0] space-y-3 animate-fade-in">
            {/* ملخص الاختيارات الأنيق والمختصر */}
            <div className="p-3 bg-[#F0F6FD] border border-[#CBD5E1]/70 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs sm:text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-['Cairo'] font-bold text-[#0D4E8B] flex items-center gap-1.5 shrink-0">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>ملخص اختيارك:</span>
                </span>
                <div className="flex flex-wrap items-center gap-1.5 text-[#1F2A44]">
                  {track === 'school' ? (
                    <>
                      <span className="bg-white px-2 py-0.5 rounded-lg border border-[#E2E8F0] font-bold text-[#0D4E8B]">
                        {selectedStageShort}
                      </span>
                      <span>•</span>
                      <span className="bg-white px-2 py-0.5 rounded-lg border border-[#E2E8F0] font-bold text-[#0D4E8B]">
                        {selectedGradeName}
                      </span>
                      <span>•</span>
                      <span className="bg-white px-2 py-0.5 rounded-lg border border-[#E2E8F0] font-bold text-[#0D4E8B]">
                        {selectedCurriculumName}
                      </span>
                      <span>•</span>
                      <span className="bg-white px-2 py-0.5 rounded-lg border border-[#E2E8F0] font-bold text-[#0D4E8B]">
                        {selectedSubjectName}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="bg-white px-2 py-0.5 rounded-lg border border-[#E2E8F0] font-bold text-[#0D4E8B]">
                        {selectedQuranAgeFormatted}
                      </span>
                      <span>•</span>
                      <span className="bg-white px-2 py-0.5 rounded-lg border border-[#E2E8F0] font-bold text-[#0D4E8B]">
                        {selectedQuranLevelName}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={handleReset}
                className="text-xs font-bold text-[#64748B] hover:text-[#0D4E8B] flex items-center gap-1 underline underline-offset-2 transition-colors cursor-pointer self-start sm:self-auto shrink-0"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>تعديل الاختيارات</span>
              </button>
            </div>

            {/* أزرار الإجراء: عرض المعلمين المناسبين */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={handleReset}
                className="text-xs text-[#64748B] hover:text-[#0D4E8B] font-['Cairo'] font-bold flex items-center gap-1.5 order-2 sm:order-1 transition-colors cursor-pointer py-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>إعادة ضبط الاختيارات</span>
              </button>

              <button
                type="submit"
                disabled={isSearching}
                className="w-full sm:w-auto min-h-[48px] sm:min-h-[50px] px-8 py-3 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] active:scale-[0.99] text-white font-['Cairo'] font-extrabold text-sm sm:text-base shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer order-1 sm:order-2"
              >
                {isSearching ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    <span>جاري البحث عن المعلمين...</span>
                  </>
                ) : (
                  <>
                    <span>اعرض المعلمين المناسبين</span>
                    <ArrowLeft className="w-4 h-4 text-[#FFC629]" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};
