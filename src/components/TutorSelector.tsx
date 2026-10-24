import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  formatQuranAgeGroupDisplay,
  normalizeQuranAgeGroup,
  normalizeQuranLevel,
  CANONICAL_QURAN_LEVELS,
} from '../utils/formatters';
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
  RotateCcw,
  MessageCircle,
  AlertCircle,
  Loader2,
  Info,
  SlidersHorizontal,
  CheckCircle2,
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

  // Deduplicate auto-search per completed selection key
  const lastAutoSearchedKeyRef = useRef<string | null>(null);

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

      const normalizedQuranAges = loadedQuranAges.map(normalizeQuranAgeGroup);
      const normalizedQuranLevels = loadedQuranLevels.map(normalizeQuranLevel);

      setStages(loadedStages);
      setCurriculumOptions(loadedCurricula);
      setAllSubjects(loadedSubjects);
      setQuranAgeGroups(normalizedQuranAges);
      setQuranLevels(normalizedQuranLevels);
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
        quranAges: normalizedQuranAges,
        quranLevels: normalizedQuranLevels,
      });
    } catch (err: any) {
      setTaxonomyError(
        err?.message || 'تعذر تحميل الخيارات والتصنيفات حالياً. يرجى المحاولة مرة أخرى.'
      );
    } finally {
      setIsLoadingTaxonomy(false);
    }
  };

  useEffect(() => {
    loadTaxonomy();
  }, []);

  // Sync with initialCriteria when provided or updated externally
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

  // If the currently selected subject is not valid for a newly changed grade/curriculum, clear it
  useEffect(() => {
    if (
      track === 'school' &&
      gradeId &&
      curriculumType &&
      subjectId &&
      !isLoadingTaxonomy &&
      !availableSubjectsForSelection.some((s) => s.id === subjectId)
    ) {
      setSubjectId('');
    }
  }, [
    track,
    gradeId,
    curriculumType,
    subjectId,
    availableSubjectsForSelection,
    isLoadingTaxonomy,
  ]);

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

  // Abbreviate stage names to «ابتدائي»، «إعدادي / متوسط»، «ثانوي» while keeping Supabase ID
  const getStageShortName = (stg: Stage): string => {
    const name = stg.name || '';
    const id = String(stg.id).toLowerCase();
    if (id.includes('prim') || id.includes('elem') || name.includes('ابتدائ')) return 'ابتدائي';
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

  // Names for WhatsApp messaging and labels
  const selectedStage = stages.find((s) => s.id === stageId);
  const selectedStageShort = selectedStage ? getStageShortName(selectedStage) : '';
  const selectedGradeName = allGrades.find((g) => g.id === gradeId)?.name;
  const selectedCurriculumName = curriculumOptions.find((c) => c.id === curriculumType)?.name;
  const selectedSubjectName = allSubjects.find((s) => s.id === subjectId)?.name;

  const selectedQuranAgeObj = quranAgeGroups.find((a) => a.id === ageGroupId);
  const selectedQuranAgeDisplay = selectedQuranAgeObj
    ? formatQuranAgeGroupDisplay(selectedQuranAgeObj)
    : null;
  const selectedQuranAgeFormatted = selectedQuranAgeDisplay
    ? `${selectedQuranAgeDisplay.title} (${selectedQuranAgeDisplay.rangeText})`
    : '';
  const selectedQuranLevelName = quranLevels.find((l) => l.id === levelId)?.name;

  // Readiness checks
  const isSchoolReady = Boolean(stageId && gradeId && curriculumType && subjectId);
  const isQuranReady = Boolean(ageGroupId && levelId);
  const isReady = track === 'school' ? isSchoolReady : isQuranReady;
  const noSchoolCoursesAvailable = Boolean(
    track === 'school' && gradeId && curriculumType && !hasCoursesConfigured
  );

  // Automatic Search Execution as soon as selections are complete (or modified while complete)
  useEffect(() => {
    if (isLoadingTaxonomy) return;

    if (!isReady || noSchoolCoursesAvailable) {
      lastAutoSearchedKeyRef.current = null;
      return;
    }

    const currentKey =
      track === 'school'
        ? `school:${stageId}:${gradeId}:${curriculumType}:${subjectId}`
        : `quran:${ageGroupId}:${levelId}`;

    if (lastAutoSearchedKeyRef.current === currentKey) {
      return;
    }

    lastAutoSearchedKeyRef.current = currentKey;
    const criteria: SearchCriteria =
      track === 'school'
        ? {
            track: 'school',
            stageId,
            gradeId,
            curriculumType,
            subjectId,
          }
        : {
            track: 'quran',
            ageGroupId,
            levelId,
          };

    trackParentSearchSubmitted(criteria);
    onSearch(criteria);
  }, [
    isLoadingTaxonomy,
    isReady,
    noSchoolCoursesAvailable,
    track,
    stageId,
    gradeId,
    curriculumType,
    subjectId,
    ageGroupId,
    levelId,
    onSearch,
  ]);

  // Handlers
  const handleTrackChange = (newTrack: TrackType) => {
    trackParentSelectorStarted(newTrack);
    if (track !== newTrack) {
      lastAutoSearchedKeyRef.current = null;
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
      lastAutoSearchedKeyRef.current = null;
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
      // If curriculum + subject aren't still valid, onCriteriaChange clears old results
      if (!curriculumType || !subjectId) {
        onCriteriaChange?.();
      }
    }
  };

  const handleCurriculumSelect = (newCurriculum: CurriculumType) => {
    trackParentSelectorStarted(track);
    if (curriculumType !== newCurriculum) {
      setCurriculumType(newCurriculum);
      if (!subjectId) {
        onCriteriaChange?.();
      }
    }
  };

  const handleSubjectSelect = (newSubject: string) => {
    trackParentSelectorStarted(track);
    if (subjectId !== newSubject) {
      setSubjectId(newSubject);
    }
  };

  const handleAgeGroupSelect = (newAgeGroup: string) => {
    trackParentSelectorStarted(track);
    if (ageGroupId !== newAgeGroup) {
      setAgeGroupId(newAgeGroup);
      if (!levelId) {
        onCriteriaChange?.();
      }
    }
  };

  const handleLevelSelect = (newLevel: string) => {
    trackParentSelectorStarted(track);
    if (levelId !== newLevel) {
      setLevelId(newLevel);
    }
  };

  const handleReset = () => {
    resetSelectorStartedTracking();
    lastAutoSearchedKeyRef.current = null;
    setStageId('');
    setGradeId('');
    setCurriculumType('');
    setSubjectId('');
    setAgeGroupId('');
    setLevelId('');
    onCriteriaChange?.();
  };

  // WhatsApp interest URL when a combination has no courses configured yet
  const noCourseWhatsAppUrl = buildInterestRegistrationWhatsAppUrl({
    track: 'school',
    stageName: selectedStage?.name,
    gradeName: selectedGradeName,
    curriculumName: selectedCurriculumName,
  });

  // Helper text for remaining step
  const getNextStepHint = (): string => {
    if (track === 'school') {
      if (!stageId) return 'اختر المرحلة الدراسية للبدء';
      if (!gradeId) return 'اختر الصف الدراسي';
      if (!curriculumType) return 'اختر نوع المنهج الدراسي';
      if (!subjectId) return 'اختر المادة الدراسية لعرض المعلمين تلقائيًا';
      return 'تم اكتمال الاختيار — يتم تحديث المعلمين تلقائيًا';
    } else {
      if (!ageGroupId) return 'اختر الفئة العمرية المناسبة لطفلك';
      if (!levelId) return 'اختر البرنامج التعليمي لعرض المعلمين تلقائيًا';
      return 'تم اكتمال الاختيار — يتم تحديث المعلمين تلقائيًا';
    }
  };

  return (
    <div id="tutor-selector-card" className="w-full max-w-4xl mx-auto">
      <div className="bg-white rounded-3xl shadow-xl shadow-slate-900/5 border border-[#E2E8F0] overflow-hidden">
        {/* Card Header & Track Switcher */}
        <div className="p-4 sm:p-6 bg-[#F8F9FC] border-b border-[#E2E8F0]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#0D4E8B] text-white flex items-center justify-center shadow-xs shrink-0">
                <SlidersHorizontal className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-['Cairo'] text-base sm:text-lg font-extrabold text-[#1F2A44]">
                  حدد احتياج طفلك التعليمي
                </h2>
                <p className="text-xs text-[#64748B]">
                  اختر المسار والتفاصيل ليظهر لك المعلمون المتاحون تلقائيًا في نفس الصفحة
                </p>
              </div>
            </div>

            {(stageId || ageGroupId) && (
              <button
                type="button"
                onClick={handleReset}
                className="self-start sm:self-auto inline-flex items-center gap-1.5 text-xs font-bold text-[#64748B] hover:text-[#0D4E8B] bg-white hover:bg-blue-50/60 px-3 py-1.5 rounded-xl border border-[#E2E8F0] transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>إعادة تعيين</span>
              </button>
            )}
          </div>

          {/* 2-Tab Track Toggle */}
          <div
            className="grid grid-cols-2 gap-2 p-1.5 bg-[#E8EEF5] rounded-2xl"
            role="tablist"
            aria-label="اختيار المسار التعليمي"
          >
            <button
              type="button"
              role="tab"
              aria-selected={track === 'school'}
              onClick={() => handleTrackChange('school')}
              className={`flex items-center justify-center gap-2 py-2.5 sm:py-3 px-3 rounded-xl font-['Cairo'] font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                track === 'school'
                  ? 'bg-[#0D4E8B] text-white shadow-sm'
                  : 'text-[#1F2A44] hover:bg-white/60'
              }`}
            >
              <BookOpen
                className={`w-4 h-4 shrink-0 ${
                  track === 'school' ? 'text-[#FFC629]' : 'text-[#0D4E8B]'
                }`}
              />
              <span>المناهج الدراسية</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={track === 'quran'}
              onClick={() => handleTrackChange('quran')}
              className={`flex items-center justify-center gap-2 py-2.5 sm:py-3 px-3 rounded-xl font-['Cairo'] font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                track === 'quran'
                  ? 'bg-[#0D4E8B] text-white shadow-sm'
                  : 'text-[#1F2A44] hover:bg-white/60'
              }`}
            >
              <Sparkles
                className={`w-4 h-4 shrink-0 ${
                  track === 'quran' ? 'text-[#FFC629]' : 'text-[#0D4E8B]'
                }`}
              />
              <span>القرآن الكريم والتأسيس</span>
            </button>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-4 sm:p-6 md:p-7">
          {isLoadingTaxonomy ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="w-8 h-8 text-[#0D4E8B] animate-spin" />
              <p className="text-sm font-bold text-[#1F2A44]">
                جاري تحميل المراحل والبرامج التعليمية...
              </p>
            </div>
          ) : taxonomyError ? (
            <div className="p-6 rounded-2xl bg-red-50 border border-red-200 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-red-600 mx-auto" />
              <p className="text-sm font-bold text-red-900">{taxonomyError}</p>
              <button
                type="button"
                onClick={loadTaxonomy}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                إعادة المحاولة
              </button>
            </div>
          ) : (
            <div>
              {track === 'school' ? (
                /* ================= SCHOOL TRACK ================= */
                <div className="space-y-5">
                  {/* Step 1: Stage Selection */}
                  <div>
                    <label className="block font-['Cairo'] text-xs sm:text-sm font-bold text-[#1F2A44] mb-2.5">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#0D4E8B] text-white text-[11px] font-bold ml-1.5">
                        ١
                      </span>
                      اختر المرحلة الدراسية
                    </label>
                    <div className="grid grid-cols-3 gap-2 sm:gap-3">
                      {stages.map((stg) => {
                        const isSelected = stageId === stg.id;
                        const shortName = getStageShortName(stg);
                        return (
                          <button
                            key={stg.id}
                            type="button"
                            onClick={() => handleStageSelect(stg.id)}
                            className={`relative p-3 sm:p-3.5 rounded-2xl border-2 text-right transition-all cursor-pointer flex flex-col justify-between min-h-[72px] ${
                              isSelected
                                ? 'border-[#0D4E8B] bg-[#EBF3FC]/70 shadow-xs'
                                : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1] hover:bg-slate-50/60'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1 w-full">
                              <span
                                className={`font-['Cairo'] font-bold text-xs sm:text-sm leading-snug ${
                                  isSelected ? 'text-[#0D4E8B]' : 'text-[#1F2A44]'
                                }`}
                              >
                                {shortName}
                              </span>
                              <div
                                className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                                  isSelected
                                    ? 'bg-[#0D4E8B] text-white'
                                    : 'border border-[#CBD5E1] bg-white'
                                }`}
                              >
                                {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                              </div>
                            </div>
                            <span className="text-[11px] text-[#64748B] mt-1 line-clamp-1">
                              {stg.gradesDesc}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Step 2 & 3: Grade + Curriculum */}
                  {stageId && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-[#F1F5F9] animate-fadeIn">
                      {/* Step 2: Grade */}
                      <div>
                        <label
                          htmlFor="grade-select"
                          className="block font-['Cairo'] text-xs sm:text-sm font-bold text-[#1F2A44] mb-2"
                        >
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#0D4E8B] text-white text-[11px] font-bold ml-1.5">
                            ٢
                          </span>
                          حدد الصف الدراسي
                        </label>
                        <div className="relative">
                          <select
                            id="grade-select"
                            value={gradeId}
                            onChange={(e) => handleGradeSelect(e.target.value)}
                            className={`w-full appearance-none rounded-2xl border-2 px-4 py-3 pr-4 pl-10 text-xs sm:text-sm font-bold transition-all focus:outline-none cursor-pointer ${
                              gradeId
                                ? 'border-[#0D4E8B] bg-[#EBF3FC]/50 text-[#0D4E8B]'
                                : 'border-[#E2E8F0] bg-[#F8F9FC] text-[#1F2A44] hover:border-[#CBD5E1]'
                            }`}
                          >
                            <option value="">-- اختر الصف الدراسي --</option>
                            {availableGrades.map((grd) => (
                              <option key={grd.id} value={grd.id}>
                                {grd.name}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                      </div>

                      {/* Step 3: Curriculum */}
                      <div>
                        <label
                          htmlFor="curriculum-select"
                          className="block font-['Cairo'] text-xs sm:text-sm font-bold text-[#1F2A44] mb-2"
                        >
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#0D4E8B] text-white text-[11px] font-bold ml-1.5">
                            ٣
                          </span>
                          اختر نوع المنهج الدراسي
                        </label>
                        <div className="relative">
                          <select
                            id="curriculum-select"
                            value={curriculumType}
                            onChange={(e) =>
                              handleCurriculumSelect(e.target.value as CurriculumType)
                            }
                            className={`w-full appearance-none rounded-2xl border-2 px-4 py-3 pr-4 pl-10 text-xs sm:text-sm font-bold transition-all focus:outline-none cursor-pointer ${
                              curriculumType
                                ? 'border-[#0D4E8B] bg-[#EBF3FC]/50 text-[#0D4E8B]'
                                : 'border-[#E2E8F0] bg-[#F8F9FC] text-[#1F2A44] hover:border-[#CBD5E1]'
                            }`}
                          >
                            <option value="">-- اختر نوع المنهج --</option>
                            {curriculumOptions.map((curr) => (
                              <option key={curr.id} value={curr.id}>
                                {curr.name}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 4: Subject Selection */}
                  {stageId && gradeId && curriculumType && (
                    <div className="pt-4 border-t border-[#F1F5F9] animate-fadeIn">
                      <div className="flex items-center justify-between mb-2.5">
                        <label className="block font-['Cairo'] text-xs sm:text-sm font-bold text-[#1F2A44]">
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#0D4E8B] text-white text-[11px] font-bold ml-1.5">
                            ٤
                          </span>
                          اختر المادة الدراسية المطلوبة
                        </label>
                        <span className="text-[11px] font-semibold text-[#0D4E8B] bg-blue-50 px-2.5 py-0.5 rounded-lg">
                          تظهر النتائج فور اختيار المادة
                        </span>
                      </div>

                      {hasCoursesConfigured ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-2.5">
                          {availableSubjectsForSelection.map((subj) => {
                            const isSelected = subjectId === subj.id;
                            return (
                              <button
                                key={subj.id}
                                type="button"
                                onClick={() => handleSubjectSelect(subj.id)}
                                className={`p-3 rounded-xl border-2 text-right transition-all flex items-center justify-between gap-2 cursor-pointer ${
                                  isSelected
                                    ? 'border-[#0D4E8B] bg-[#0D4E8B] text-white shadow-xs'
                                    : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1] text-[#1F2A44]'
                                }`}
                              >
                                <div className="min-w-0">
                                  <div className="font-['Cairo'] font-bold text-xs sm:text-sm truncate">
                                    {subj.name}
                                  </div>
                                  {subj.englishName && (
                                    <div
                                      className={`text-[10px] truncate ${
                                        isSelected ? 'text-blue-100' : 'text-[#64748B]'
                                      }`}
                                    >
                                      {subj.englishName}
                                    </div>
                                  )}
                                </div>
                                <div
                                  className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                                    isSelected
                                      ? 'bg-[#FFC629] text-[#1F2A44]'
                                      : 'border border-[#CBD5E1]'
                                  }`}
                                >
                                  {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="p-5 rounded-2xl bg-amber-50/90 border border-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                          <div className="space-y-1">
                            <h4 className="font-['Cairo'] font-bold text-sm text-amber-950 flex items-center gap-1.5">
                              <Info className="w-4 h-4 text-amber-600 shrink-0" />
                              <span>جاري استكمال إتاحة مواد هذا المنهج قريباً</span>
                            </h4>
                            <p className="text-xs text-amber-900/80 leading-relaxed">
                              يمكنك إرسال طلبك مباشرة لفريق التنسيق في شاطر لترشيح المعلم المناسب
                              لطفلك في أسرع وقت.
                            </p>
                          </div>
                          <a
                            href={noCourseWhatsAppUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => trackWhatsAppClicked('no_course_options_interest')}
                            className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1F2A44] hover:bg-[#0D4E8B] text-white font-['Cairo'] font-bold text-xs transition-colors shadow-xs"
                          >
                            <MessageCircle className="w-4 h-4 text-[#FFC629]" />
                            <span>اطلب ترشيح معلم عبر واتساب</span>
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* ================= QURAN & FOUNDATION TRACK ================= */
                <div className="space-y-5">
                  {/* Educational Guidance Banner: Age vs Level */}
                  <div className="p-3.5 rounded-2xl bg-[#F0F6FD] border border-blue-200/80 flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-[#0D4E8B] shrink-0 mt-0.5" />
                    <p className="text-xs text-[#1F2A44] leading-relaxed">
                      <strong className="font-bold text-[#0D4E8B]">كيف نختار البداية المناسبة؟ </strong>
                      العمر يحدد الفئة العمرية المناسبة لطفلك، بينما تساعد{' '}
                      <span className="font-bold">الحصة التجريبية المجانية (٢٠ دقيقة)</span> على
                      تقييم مستواه الفعلي في القراءة أو الحفظ دون افتراض أن العمر يساوي المستوى
                      التعليمي.
                    </p>
                  </div>

                  {/* Step 1: Standardized Age Groups */}
                  <div>
                    <label className="block font-['Cairo'] text-xs sm:text-sm font-bold text-[#1F2A44] mb-2.5">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#0D4E8B] text-white text-[11px] font-bold ml-1.5">
                        ١
                      </span>
                      اختر الفئة العمرية للطفل
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
                      {quranAgeGroups.map((ag) => {
                        const isSelected = ageGroupId === ag.id;
                        const { title, rangeText } = formatQuranAgeGroupDisplay(ag);
                        return (
                          <button
                            key={ag.id}
                            type="button"
                            onClick={() => handleAgeGroupSelect(ag.id)}
                            className={`p-3.5 sm:p-4 rounded-2xl border-2 text-right transition-all cursor-pointer flex items-center sm:items-start justify-between gap-2 ${
                              isSelected
                                ? 'border-[#0D4E8B] bg-[#EBF3FC]/75 shadow-xs'
                                : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1] hover:bg-slate-50/60'
                            }`}
                          >
                            <div className="space-y-1">
                              <div
                                className={`font-['Cairo'] font-extrabold text-sm sm:text-base ${
                                  isSelected ? 'text-[#0D4E8B]' : 'text-[#1F2A44]'
                                }`}
                              >
                                {title}
                              </div>
                              <div className="inline-block text-xs font-bold text-[#475569] bg-slate-100 px-2.5 py-0.5 rounded-lg">
                                {rangeText}
                              </div>
                            </div>
                            <div
                              className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                                isSelected
                                  ? 'bg-[#0D4E8B] text-white'
                                  : 'border border-[#CBD5E1] bg-white'
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Step 2: Educational Programs with Clear Names & Goal Descriptions */}
                  <div className="pt-4 border-t border-[#F1F5F9]">
                    <div className="flex items-center justify-between mb-2.5">
                      <label className="block font-['Cairo'] text-xs sm:text-sm font-bold text-[#1F2A44]">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#0D4E8B] text-white text-[11px] font-bold ml-1.5">
                          ٢
                        </span>
                        اختر البرنامج التعليمي المطلوب
                      </label>
                      <span className="text-[11px] font-semibold text-[#0D4E8B] bg-blue-50 px-2.5 py-0.5 rounded-lg">
                        تظهر النتائج فور اكتمال الاختيار
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5">
                      {quranLevels.map((lvl) => {
                        const isSelected = levelId === lvl.id;
                        const canonical = CANONICAL_QURAN_LEVELS[lvl.id];
                        const programName = canonical?.name || lvl.name;
                        const programDesc = canonical?.description || lvl.description;

                        return (
                          <button
                            key={lvl.id}
                            type="button"
                            onClick={() => handleLevelSelect(lvl.id)}
                            className={`p-3.5 sm:p-4 rounded-2xl border-2 text-right transition-all cursor-pointer flex items-start justify-between gap-3 ${
                              isSelected
                                ? 'border-[#0D4E8B] bg-[#EBF3FC]/75 shadow-xs'
                                : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1] hover:bg-slate-50/60'
                            }`}
                          >
                            <div className="space-y-1 flex-1 min-w-0">
                              <div
                                className={`font-['Cairo'] font-bold text-xs sm:text-sm md:text-base ${
                                  isSelected ? 'text-[#0D4E8B]' : 'text-[#1F2A44]'
                                }`}
                              >
                                {programName}
                              </div>
                              {programDesc && (
                                <p className="text-xs text-[#475569] leading-relaxed">
                                  {programDesc}
                                </p>
                              )}
                            </div>

                            <div
                              className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-1 ${
                                isSelected
                                  ? 'bg-[#0D4E8B] text-white'
                                  : 'border border-[#CBD5E1] bg-white'
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Live Selection Summary & Auto-Results Status Bar */}
          {!isLoadingTaxonomy && !taxonomyError && !noSchoolCoursesAvailable && (
            <div className="mt-5 pt-4 border-t border-[#E2E8F0] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* Breadcrumb / Next Step Hint */}
              <div className="flex items-center gap-2 text-xs text-[#475569] flex-wrap">
                {isReady ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-bold text-[#1F2A44]">اختيارك الحالي:</span>
                    {track === 'school' ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="bg-[#EBF3FC] text-[#0D4E8B] px-2.5 py-0.5 rounded-lg font-bold">
                          {selectedStageShort}
                        </span>
                        <span>•</span>
                        <span className="bg-[#EBF3FC] text-[#0D4E8B] px-2.5 py-0.5 rounded-lg font-bold">
                          {selectedGradeName}
                        </span>
                        <span>•</span>
                        <span className="bg-[#EBF3FC] text-[#0D4E8B] px-2.5 py-0.5 rounded-lg font-bold">
                          {selectedCurriculumName}
                        </span>
                        <span>•</span>
                        <span className="bg-[#0D4E8B] text-white px-2.5 py-0.5 rounded-lg font-bold">
                          {selectedSubjectName}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="bg-[#EBF3FC] text-[#0D4E8B] px-2.5 py-0.5 rounded-lg font-bold">
                          {selectedQuranAgeFormatted}
                        </span>
                        <span>•</span>
                        <span className="bg-[#0D4E8B] text-white px-2.5 py-0.5 rounded-lg font-bold">
                          {selectedQuranLevelName}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-xs font-medium text-[#64748B] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#FFC629] inline-block" />
                    {getNextStepHint()}
                  </span>
                )}
              </div>

              {/* Status pill when ready or loading */}
              {isReady && (
                <div className="shrink-0 flex items-center gap-2">
                  {isSearching ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0D4E8B] bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-200">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>جاري تحديث قائمة المعلمين...</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const resultsEl = document.getElementById('search-results-section');
                        if (resultsEl) {
                          resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      }}
                      className="inline-flex items-center justify-center gap-1.5 text-xs font-bold text-[#0D4E8B] bg-emerald-50 hover:bg-emerald-100/80 text-emerald-900 px-3.5 py-2 rounded-xl border border-emerald-200 transition-colors cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>تم تحديث النتائج بالأسفل</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
