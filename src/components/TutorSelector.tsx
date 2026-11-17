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
import { WhatsAppNoticeModal } from './WhatsAppNoticeModal';
import {
  formatQuranAgeGroupDisplay,
  normalizeQuranAgeGroup,
  normalizeQuranLevel,
  CANONICAL_QURAN_LEVELS,
  formatParentSubjectCardDisplay,
  toArabicDigits,
} from '../utils/formatters';
import {
  trackParentSelectorStarted,
  resetSelectorStartedTracking,
  trackParentSearchSubmitted,
  trackNoCourseOptionsShown,
} from '../services/analytics';
import {
  BookOpen,
  Sparkles,
  ChevronDown,
  ChevronLeft,
  Check,
  RotateCcw,
  MessageCircle,
  AlertCircle,
  Loader2,
  Info,
  Search,
} from 'lucide-react';

interface TutorSelectorProps {
  onSearch: (criteria: SearchCriteria, scrollToResults?: boolean) => void;
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
  // Primary simplified bar state
  const [selectedProgramValue, setSelectedProgramValue] = useState<string>('all'); // 'all' | 'math_group' | 'subject:<id>' | 'quran:all' | 'quran:<levelId>'
  const [isAdvancedOpen, setIsAdvancedOpen] = useState<boolean>(false);

  // Full DB taxonomy state (preserved completely)
  const [track, setTrack] = useState<TrackType>(
    initialCriteria?.track === 'quran' ? 'quran' : 'school'
  );
  const [stageId, setStageId] = useState<StageId | ''>(initialCriteria?.stageId || '');
  const [gradeId, setGradeId] = useState<string>(initialCriteria?.gradeId || '');
  const [curriculumType, setCurriculumType] = useState<CurriculumType | ''>(
    initialCriteria?.curriculumType || ''
  );
  const [subjectId, setSubjectId] = useState<string>(initialCriteria?.subjectId || '');
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
  const [isRecommendationModalOpen, setIsRecommendationModalOpen] = useState(false);

  // Deduplicate auto-search in advanced precision panel
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
        flatGrades,
      ] = await Promise.all([
        DataService.getStages(),
        DataService.getCurriculumOptions(),
        DataService.getSubjects(),
        DataService.getQuranAgeGroups(),
        DataService.getQuranLevels(),
        DataService.getSchoolCourseOptions(),
        DataService.getAllGrades(),
      ]);

      const normalizedQuranAges = loadedQuranAges.map(normalizeQuranAgeGroup);
      const normalizedQuranLevels = loadedQuranLevels.map(normalizeQuranLevel);

      setStages(loadedStages);
      setCurriculumOptions(loadedCurricula);
      setAllSubjects(loadedSubjects);
      setQuranAgeGroups(normalizedQuranAges);
      setQuranLevels(normalizedQuranLevels);
      setSchoolCourseOptions(loadedCourseOptions);
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

  // Sync with initialCriteria when restored
  useEffect(() => {
    if (!initialCriteria) return;
    if (initialCriteria.track === 'quran') {
      setTrack('quran');
      setAgeGroupId(initialCriteria.ageGroupId || '');
      setLevelId(initialCriteria.levelId || '');
      setSelectedProgramValue(
        initialCriteria.levelId ? `quran:${initialCriteria.levelId}` : 'quran:all'
      );
    } else if (initialCriteria.track === 'school') {
      setTrack('school');
      setStageId(initialCriteria.stageId || '');
      setGradeId(initialCriteria.gradeId || '');
      setCurriculumType(initialCriteria.curriculumType || '');
      setSubjectId(initialCriteria.subjectId || '');
      if (initialCriteria.subjectIds && initialCriteria.subjectIds.length > 1) {
        setSelectedProgramValue('math_group');
      } else if (initialCriteria.subjectId) {
        setSelectedProgramValue(`subject:${initialCriteria.subjectId}`);
      } else {
        setSelectedProgramValue('all');
      }
      if (initialCriteria.gradeId) {
        setIsAdvancedOpen(true);
      }
    } else {
      setSelectedProgramValue('all');
      setStageId(initialCriteria.stageId || '');
      setCurriculumType(initialCriteria.curriculumType || '');
    }
  }, [initialCriteria]);

  // Cascading Grade update when stage changes
  useEffect(() => {
    if (stageId) {
      const preloadedStageGrades = allGrades.filter((g) => g.stageId === stageId);
      if (preloadedStageGrades.length > 0) {
        setAvailableGrades(preloadedStageGrades);
        if (gradeId && !preloadedStageGrades.some((g) => g.id === gradeId)) {
          setGradeId('');
        }
      } else {
        DataService.getGradesByStage(stageId).then((grades) => {
          setAvailableGrades(grades);
          if (gradeId && !grades.some((g) => g.id === gradeId)) {
            setGradeId('');
          }
        });
      }
    } else {
      setAvailableGrades([]);
      setGradeId('');
    }
  }, [stageId, allGrades]);

  // Extract available subjects strictly based on active school_course_options in Supabase when grade + curriculum chosen
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

  // Clear invalid subject ONLY when in exact school grade + curriculum mode
  useEffect(() => {
    if (
      isAdvancedOpen &&
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
    isAdvancedOpen,
    track,
    gradeId,
    curriculumType,
    subjectId,
    availableSubjectsForSelection,
    isLoadingTaxonomy,
  ]);

  const hasCoursesConfigured = useMemo(() => {
    if (!gradeId || !curriculumType) return true;
    return availableSubjectsForSelection.length > 0;
  }, [gradeId, curriculumType, availableSubjectsForSelection]);

  useEffect(() => {
    if (track === 'school' && gradeId && curriculumType && !hasCoursesConfigured) {
      trackNoCourseOptionsShown(stageId, gradeId, curriculumType);
    }
  }, [track, stageId, gradeId, curriculumType, hasCoursesConfigured]);

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

  // Resolve math & english subject IDs dynamically from live DB subjects
  const mathSubjectIds = useMemo(() => {
    const ids = allSubjects
      .filter((s) => s.id === 'math' || s.id === 'math_en' || s.id.includes('math'))
      .map((s) => s.id);
    return ids.length > 0 ? ids : ['math', 'math_en'];
  }, [allSubjects]);

  const englishSubjectId = useMemo(() => {
    const found = allSubjects.find((s) => s.id === 'english' || s.id === 'subj_english');
    return found?.id || 'english';
  }, [allSubjects]);

  const isQuranSelected = selectedProgramValue.startsWith('quran:');

  // Build SearchCriteria from current UI state
  const buildCriteriaFromState = (overrideProgram?: string): SearchCriteria => {
    const prog = overrideProgram ?? selectedProgramValue;

    if (prog.startsWith('quran:')) {
      const lvl = prog.replace('quran:', '');
      return {
        track: 'quran',
        ageGroupId: ageGroupId || undefined,
        levelId: lvl !== 'all' ? lvl : undefined,
      };
    }

    if (prog === 'math_group') {
      return {
        track: 'school',
        stageId: stageId || undefined,
        gradeId: gradeId || undefined,
        curriculumType: curriculumType || undefined,
        subjectIds: mathSubjectIds,
        subjectDisplayLabel: 'الرياضيات',
      };
    }

    if (prog.startsWith('subject:')) {
      const sId = prog.replace('subject:', '');
      const matchedOpt =
        gradeId && curriculumType
          ? schoolCourseOptions.find(
              (opt) =>
                opt.grade_id === gradeId &&
                opt.curriculum_id === curriculumType &&
                opt.subject_id === sId &&
                opt.is_active !== false
            )
          : undefined;
      const subjObj = allSubjects.find((s) => s.id === sId);
      const displayLabel = subjObj
        ? formatParentSubjectCardDisplay(subjObj, curriculumType || undefined).title
        : undefined;
      return {
        track: 'school',
        stageId: stageId || undefined,
        gradeId: gradeId || undefined,
        curriculumType: curriculumType || undefined,
        subjectId: sId,
        subjectDisplayLabel: displayLabel,
        courseOptionId: matchedOpt?.id || null,
      };
    }

    // 'all': if stage or curriculum selected without subject, search school; if nothing selected, search all
    if (stageId || gradeId || curriculumType) {
      return {
        track: 'school',
        stageId: stageId || undefined,
        gradeId: gradeId || undefined,
        curriculumType: curriculumType || undefined,
      };
    }

    return {
      track: 'all',
    };
  };

  // Automatic search ONLY when user completes exact selection inside the advanced precision drawer
  const isAdvancedExactReady =
    isAdvancedOpen &&
    ((track === 'school' && Boolean(stageId && gradeId && curriculumType && subjectId)) ||
      (track === 'quran' && Boolean(ageGroupId && levelId)));

  useEffect(() => {
    if (isLoadingTaxonomy || !isAdvancedExactReady || !hasCoursesConfigured) {
      if (!isAdvancedExactReady) {
        lastAutoSearchedKeyRef.current = null;
      }
      return;
    }

    const currentKey =
      track === 'school'
        ? `school:${stageId}:${gradeId}:${curriculumType}:${subjectId}`
        : `quran:${ageGroupId}:${levelId}`;

    if (lastAutoSearchedKeyRef.current === currentKey) return;
    lastAutoSearchedKeyRef.current = currentKey;

    const matchedCourseOption =
      track === 'school'
        ? schoolCourseOptions.find(
            (opt) =>
              opt.grade_id === gradeId &&
              opt.curriculum_id === curriculumType &&
              opt.subject_id === subjectId &&
              opt.is_active !== false
          )
        : undefined;

    const criteria: SearchCriteria =
      track === 'school'
        ? {
            track: 'school',
            stageId,
            gradeId,
            curriculumType,
            subjectId,
            courseOptionId: matchedCourseOption?.id || null,
          }
        : {
            track: 'quran',
            ageGroupId,
            levelId,
          };

    trackParentSearchSubmitted(criteria);
    onSearch(criteria, false);
  }, [
    isLoadingTaxonomy,
    isAdvancedExactReady,
    hasCoursesConfigured,
    track,
    stageId,
    gradeId,
    curriculumType,
    subjectId,
    ageGroupId,
    levelId,
    schoolCourseOptions,
    onSearch,
  ]);

  // Program dropdown handler
  const handleProgramChange = (value: string) => {
    trackParentSelectorStarted(value.startsWith('quran:') ? 'quran' : 'school');
    setSelectedProgramValue(value);

    if (value.startsWith('quran:')) {
      setTrack('quran');
      const lvl = value.replace('quran:', '');
      setLevelId(lvl !== 'all' ? lvl : '');
      setStageId('');
      setGradeId('');
      setCurriculumType('');
      setSubjectId('');
    } else {
      setTrack('school');
      setAgeGroupId('');
      setLevelId('');
      if (value.startsWith('subject:')) {
        setSubjectId(value.replace('subject:', ''));
      } else {
        setSubjectId('');
      }
    }
  };

  // Explicit Submit button ("شاهد المعلمين")
  const handlePrimarySearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const criteria = buildCriteriaFromState();
    trackParentSelectorStarted(criteria.track === 'quran' ? 'quran' : 'school');
    trackParentSearchSubmitted(criteria);
    onSearch(criteria, true);
  };

  // Quick-select pill handlers
  const activeQuickKey = useMemo(() => {
    if (selectedProgramValue === 'all' && !stageId && !curriculumType && !gradeId && !ageGroupId) {
      return 'all';
    }
    if (
      selectedProgramValue === 'math_group' ||
      selectedProgramValue === 'subject:math' ||
      selectedProgramValue === 'subject:math_en'
    ) {
      return 'math';
    }
    if (selectedProgramValue === `subject:${englishSubjectId}`) {
      return 'english';
    }
    if (selectedProgramValue.startsWith('quran:')) {
      return 'quran';
    }
    return '';
  }, [selectedProgramValue, stageId, curriculumType, gradeId, ageGroupId, englishSubjectId]);

  const handleQuickSelect = (key: 'all' | 'math' | 'english' | 'quran') => {
    trackParentSelectorStarted(key === 'quran' ? 'quran' : 'school');

    if (key === 'all') {
      setSelectedProgramValue('all');
      setTrack('school');
      setStageId('');
      setGradeId('');
      setCurriculumType('');
      setSubjectId('');
      setAgeGroupId('');
      setLevelId('');
      const criteria: SearchCriteria = { track: 'all' };
      trackParentSearchSubmitted(criteria);
      onSearch(criteria, true);
      return;
    }

    if (key === 'math') {
      setSelectedProgramValue('math_group');
      setTrack('school');
      setSubjectId('');
      setAgeGroupId('');
      setLevelId('');
      const criteria = buildCriteriaFromState('math_group');
      trackParentSearchSubmitted(criteria);
      onSearch(criteria, true);
      return;
    }

    if (key === 'english') {
      const nextVal = `subject:${englishSubjectId}`;
      setSelectedProgramValue(nextVal);
      setTrack('school');
      setSubjectId(englishSubjectId);
      setAgeGroupId('');
      setLevelId('');
      const criteria = buildCriteriaFromState(nextVal);
      trackParentSearchSubmitted(criteria);
      onSearch(criteria, true);
      return;
    }

    if (key === 'quran') {
      setSelectedProgramValue('quran:all');
      setTrack('quran');
      setStageId('');
      setGradeId('');
      setCurriculumType('');
      setSubjectId('');
      const criteria = buildCriteriaFromState('quran:all');
      trackParentSearchSubmitted(criteria);
      onSearch(criteria, true);
    }
  };

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
      setSelectedProgramValue(newTrack === 'quran' ? 'quran:all' : 'all');
      onCriteriaChange?.();
    }
  };

  const handleReset = () => {
    resetSelectorStartedTracking();
    lastAutoSearchedKeyRef.current = null;
    setSelectedProgramValue('all');
    setTrack('school');
    setStageId('');
    setGradeId('');
    setCurriculumType('');
    setSubjectId('');
    setAgeGroupId('');
    setLevelId('');
    onCriteriaChange?.();
  };

  const selectedStage = stages.find((s) => s.id === stageId);
  const selectedGradeName = allGrades.find((g) => g.id === gradeId)?.name;
  const selectedCurriculumName = curriculumOptions.find((c) => c.id === curriculumType)?.name;

  const noCourseWhatsAppUrl = buildInterestRegistrationWhatsAppUrl({
    track: 'school',
    stageName: selectedStage?.name,
    gradeName: selectedGradeName,
    curriculumName: selectedCurriculumName,
  });

  const hasAnyFilterSet =
    selectedProgramValue !== 'all' ||
    Boolean(stageId) ||
    Boolean(gradeId) ||
    Boolean(curriculumType) ||
    Boolean(ageGroupId) ||
    Boolean(levelId);

  return (
    <div id="tutor-selector-card" className="w-full max-w-5xl mx-auto">
      <div className="bg-white rounded-[24px] shadow-[0_8px_30px_rgba(13,78,139,0.06)] border border-[#E2E8F0] p-5 sm:p-7 space-y-5">
        {/* Card Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-['Cairo'] text-lg sm:text-xl font-extrabold text-[#1F2A44]">
              نبدأ باحتياج طفلك
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <p className="text-xs text-[#64748B] font-medium">
              اختر المادة، وشاهد المعلمين المناسبين
            </p>
            {hasAnyFilterSet && (
              <button
                type="button"
                onClick={handleReset}
                className="min-h-[36px] inline-flex items-center gap-1.5 text-xs font-bold text-[#0D4E8B] hover:text-[#083D77] bg-[#F0F6FD] hover:bg-[#E1EEFC] px-3 py-1.5 rounded-xl border border-[#D1DCFE] transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>إعادة تعيين</span>
              </button>
            )}
          </div>
        </div>

        {/* Loading or Error */}
        {isLoadingTaxonomy ? (
          <div className="py-8 flex flex-col items-center justify-center gap-2.5 text-center">
            <Loader2 className="w-7 h-7 text-[#0D4E8B] animate-spin" />
            <p className="text-xs sm:text-sm font-bold text-[#1F2A44]">
              جاري تحميل المواد والمراحل من قاعدة البيانات...
            </p>
          </div>
        ) : taxonomyError ? (
          <div className="p-5 rounded-2xl bg-red-50 border border-red-200 text-center space-y-3">
            <AlertCircle className="w-7 h-7 text-red-600 mx-auto" />
            <p className="text-xs sm:text-sm font-bold text-red-900">{taxonomyError}</p>
            <button
              type="button"
              onClick={loadTaxonomy}
              className="min-h-[44px] px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              إعادة المحاولة
            </button>
          </div>
        ) : (
          <form onSubmit={handlePrimarySearchSubmit} className="space-y-4">
            {/* Primary Simplified Search Bar (Desktop 4-col, Mobile clean stack) */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              {/* 1. Subject or Program */}
              <div className="md:col-span-5 space-y-1.5">
                <label
                  htmlFor="simple-program-select"
                  className="block font-['Cairo'] text-xs font-bold text-[#535E7B]"
                >
                  المادة أو البرنامج
                </label>
                <div className="relative">
                  <select
                    id="simple-program-select"
                    value={selectedProgramValue}
                    onChange={(e) => handleProgramChange(e.target.value)}
                    className="w-full min-h-[46px] appearance-none rounded-xl border border-[#CBD5E1] bg-white hover:border-[#94A3B8] focus:border-[#0D4E8B] focus:outline-none px-4 pl-10 text-xs sm:text-sm font-bold text-[#1F2A44] cursor-pointer transition-colors"
                  >
                    <option value="all">كل المواد والبرامج</option>
                    <optgroup label="المواد الدراسية">
                      <option value="math_group">الرياضيات (بالعربية والإنجليزية)</option>
                      {allSubjects.map((subj) => {
                        const { title } = formatParentSubjectCardDisplay(subj);
                        return (
                          <option key={subj.id} value={`subject:${subj.id}`}>
                            {title}
                          </option>
                        );
                      })}
                    </optgroup>
                    <optgroup label="القرآن الكريم والتأسيس">
                      <option value="quran:all">جميع برامج القرآن والتأسيس</option>
                      {quranLevels.map((lvl) => {
                        const canonical = CANONICAL_QURAN_LEVELS[lvl.id];
                        return (
                          <option key={lvl.id} value={`quran:${lvl.id}`}>
                            {canonical?.name || lvl.name}
                          </option>
                        );
                      })}
                    </optgroup>
                  </select>
                  <ChevronDown className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* 2. Stage OR Quran Age Group */}
              <div className="md:col-span-3 space-y-1.5">
                <label
                  htmlFor="simple-stage-or-age-select"
                  className="block font-['Cairo'] text-xs font-bold text-[#535E7B]"
                >
                  {isQuranSelected ? 'الفئة العمرية' : 'المرحلة الدراسية'}
                </label>
                <div className="relative">
                  {isQuranSelected ? (
                    <select
                      id="simple-stage-or-age-select"
                      value={ageGroupId}
                      onChange={(e) => setAgeGroupId(e.target.value)}
                      className="w-full min-h-[46px] appearance-none rounded-xl border border-[#CBD5E1] bg-white hover:border-[#94A3B8] focus:border-[#0D4E8B] focus:outline-none px-4 pl-10 text-xs sm:text-sm font-bold text-[#1F2A44] cursor-pointer transition-colors"
                    >
                      <option value="">كل الفئات العمرية</option>
                      {quranAgeGroups.map((ag) => {
                        const display = formatQuranAgeGroupDisplay(ag);
                        return (
                          <option key={ag.id} value={ag.id}>
                            {display.title} ({display.rangeText})
                          </option>
                        );
                      })}
                    </select>
                  ) : (
                    <select
                      id="simple-stage-or-age-select"
                      value={stageId}
                      onChange={(e) => {
                        setStageId((e.target.value as StageId) || '');
                        setGradeId('');
                      }}
                      className="w-full min-h-[46px] appearance-none rounded-xl border border-[#CBD5E1] bg-white hover:border-[#94A3B8] focus:border-[#0D4E8B] focus:outline-none px-4 pl-10 text-xs sm:text-sm font-bold text-[#1F2A44] cursor-pointer transition-colors"
                    >
                      <option value="">كل المراحل</option>
                      {stages.map((stg) => (
                        <option key={stg.id} value={stg.id}>
                          {getStageShortName(stg)}
                        </option>
                      ))}
                    </select>
                  )}
                  <ChevronDown className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* 3. Teaching Language / Curriculum */}
              <div className="md:col-span-2 space-y-1.5">
                <label
                  htmlFor="simple-curriculum-select"
                  className="block font-['Cairo'] text-xs font-bold text-[#535E7B]"
                >
                  لغة التدريس
                </label>
                <div className="relative">
                  <select
                    id="simple-curriculum-select"
                    value={isQuranSelected ? '' : curriculumType}
                    disabled={isQuranSelected}
                    onChange={(e) =>
                      setCurriculumType((e.target.value as CurriculumType) || '')
                    }
                    className={`w-full min-h-[46px] appearance-none rounded-xl border px-3.5 pl-9 text-xs sm:text-sm font-bold transition-colors ${
                      isQuranSelected
                        ? 'border-[#E2E8F0] bg-[#F8FAFC] text-[#94A3B8] cursor-not-allowed'
                        : 'border-[#CBD5E1] bg-white hover:border-[#94A3B8] focus:border-[#0D4E8B] focus:outline-none text-[#1F2A44] cursor-pointer'
                    }`}
                  >
                    <option value="">
                      {isQuranSelected ? 'مسار القرآن' : 'كل الخيارات'}
                    </option>
                    {!isQuranSelected &&
                      curriculumOptions.map((curr) => (
                        <option key={curr.id} value={curr.id}>
                          {curr.name}
                        </option>
                      ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* 4. Primary Search Submit Button */}
              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={isSearching}
                  className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[#0D4E8B] hover:bg-[#083D77] active:scale-[0.99] text-white font-['Cairo'] font-bold text-xs sm:text-sm shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
                >
                  {isSearching ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4 text-[#FFC629] shrink-0 hidden sm:inline lg:hidden" />
                  )}
                  <span>شاهد المعلمين</span>
                </button>
              </div>
            </div>

            {/* Expandable Precision Filter Link ("◀ تحديد الصف والمنهج") */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setIsAdvancedOpen((prev) => !prev)}
                aria-expanded={isAdvancedOpen}
                className="min-h-[40px] inline-flex items-center gap-1.5 text-xs font-['Cairo'] font-bold text-[#535E7B] hover:text-[#0D4E8B] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D4E8B] rounded-lg px-1"
              >
                {isAdvancedOpen ? (
                  <ChevronDown className="w-3.5 h-3.5 text-[#0D4E8B]" />
                ) : (
                  <ChevronLeft className="w-3.5 h-3.5 text-[#0D4E8B]" />
                )}
                <span>تحديد الصف والمنهج وبرامج القرآن بدقة</span>
              </button>
            </div>

            {/* Expandable Full Precision Drawer (Preserves 100% of existing School & Quran selections) */}
            {isAdvancedOpen && (
              <div className="p-4 sm:p-5 rounded-2xl bg-[#F8FAFD] border border-[#E2E8F0] space-y-5 animate-fade-in">
                {/* Track Tabs */}
                <div
                  className="grid grid-cols-2 gap-2 p-1.5 bg-[#E8EEF5] rounded-xl"
                  role="tablist"
                  aria-label="اختيار المسار التعليمي"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={track === 'school'}
                    onClick={() => handleTrackChange('school')}
                    className={`min-h-[42px] flex items-center justify-center gap-2 py-2 px-3 rounded-lg font-['Cairo'] font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                      track === 'school'
                        ? 'bg-[#0D4E8B] text-white shadow-xs'
                        : 'text-[#1F2A44] hover:bg-white/70'
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
                    className={`min-h-[42px] flex items-center justify-center gap-2 py-2 px-3 rounded-lg font-['Cairo'] font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                      track === 'quran'
                        ? 'bg-[#0D4E8B] text-white shadow-xs'
                        : 'text-[#1F2A44] hover:bg-white/70'
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

                {track === 'school' ? (
                  <div className="space-y-4">
                    {/* 1. Stage */}
                    <div>
                      <span className="block font-['Cairo'] text-xs font-bold text-[#1F2A44] mb-2">
                        ١. المرحلة الدراسية
                      </span>
                      <div className="grid grid-cols-3 gap-2">
                        {stages.map((stg) => {
                          const isSelected = stageId === stg.id;
                          return (
                            <button
                              key={stg.id}
                              type="button"
                              onClick={() => {
                                setStageId(stg.id);
                                setGradeId('');
                              }}
                              className={`min-h-[54px] p-2.5 sm:p-3 rounded-xl border text-right transition-all cursor-pointer flex flex-col justify-between ${
                                isSelected
                                  ? 'border-[#0D4E8B] bg-[#EBF3FC] text-[#0D4E8B]'
                                  : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1] text-[#1F2A44]'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-['Cairo'] font-bold text-xs sm:text-sm">
                                  {getStageShortName(stg)}
                                </span>
                                {isSelected && <Check className="w-3.5 h-3.5 text-[#0D4E8B]" />}
                              </div>
                              <span className="text-[11px] text-[#64748B] line-clamp-1">
                                {toArabicDigits(stg.gradesDesc)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 2. Grade & 3. Curriculum */}
                    {stageId && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-[#E2E8F0]">
                        <div>
                          <label
                            htmlFor="adv-grade-select"
                            className="block font-['Cairo'] text-xs font-bold text-[#1F2A44] mb-1.5"
                          >
                            ٢. الصف الدراسي
                          </label>
                          <div className="relative">
                            <select
                              id="adv-grade-select"
                              value={gradeId}
                              onChange={(e) => setGradeId(e.target.value)}
                              className="w-full min-h-[44px] appearance-none rounded-xl border border-[#CBD5E1] bg-white px-3.5 pl-9 text-xs sm:text-sm font-bold text-[#1F2A44] cursor-pointer focus:border-[#0D4E8B] focus:outline-none"
                            >
                              <option value="">-- كل صفوف المرحلة --</option>
                              {availableGrades.map((grd) => (
                                <option key={grd.id} value={grd.id}>
                                  {grd.name}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </div>

                        <div>
                          <label
                            htmlFor="adv-curriculum-select"
                            className="block font-['Cairo'] text-xs font-bold text-[#1F2A44] mb-1.5"
                          >
                            ٣. نوع المنهج الدراسي
                          </label>
                          <div className="relative">
                            <select
                              id="adv-curriculum-select"
                              value={curriculumType}
                              onChange={(e) =>
                                setCurriculumType((e.target.value as CurriculumType) || '')
                              }
                              className="w-full min-h-[44px] appearance-none rounded-xl border border-[#CBD5E1] bg-white px-3.5 pl-9 text-xs sm:text-sm font-bold text-[#1F2A44] cursor-pointer focus:border-[#0D4E8B] focus:outline-none"
                            >
                              <option value="">-- كل المناهج --</option>
                              {curriculumOptions.map((curr) => (
                                <option key={curr.id} value={curr.id}>
                                  {curr.name}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 4. Exact Subject (when Grade + Curriculum selected) */}
                    {stageId && gradeId && curriculumType && (
                      <div className="pt-3 border-t border-[#E2E8F0]">
                        <span className="block font-['Cairo'] text-xs font-bold text-[#1F2A44] mb-2">
                          ٤. المادة الدراسية
                        </span>
                        {hasCoursesConfigured ? (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                            {availableSubjectsForSelection.map((subj) => {
                              const isSelected = subjectId === subj.id;
                              const { title: cardTitle, subtitle: cardSubtitle } =
                                formatParentSubjectCardDisplay(subj, curriculumType || undefined);
                              return (
                                <button
                                  key={subj.id}
                                  type="button"
                                  onClick={() => {
                                    setSubjectId(subj.id);
                                    setSelectedProgramValue(`subject:${subj.id}`);
                                  }}
                                  className={`min-h-[46px] p-2.5 rounded-xl border text-right transition-all flex items-center justify-between gap-2 cursor-pointer ${
                                    isSelected
                                      ? 'border-[#0D4E8B] bg-[#0D4E8B] text-white'
                                      : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1] text-[#1F2A44]'
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <div className="font-['Cairo'] font-bold text-xs truncate">
                                      {cardTitle}
                                    </div>
                                    {cardSubtitle && (
                                      <div
                                        className={`text-[10px] truncate ${
                                          isSelected ? 'text-blue-100' : 'text-[#64748B]'
                                        }`}
                                      >
                                        {cardSubtitle}
                                      </div>
                                    )}
                                  </div>
                                  {isSelected && <Check className="w-3.5 h-3.5 text-[#FFC629] shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            <div className="space-y-1">
                              <h4 className="font-['Cairo'] font-bold text-xs sm:text-sm text-amber-950 flex items-center gap-1.5">
                                <Info className="w-4 h-4 text-amber-600 shrink-0" />
                                <span>جاري استكمال إتاحة مواد هذا المنهج قريباً</span>
                              </h4>
                              <p className="text-xs text-amber-900/80">
                                أرسل طلبك لفريق شاطر لترشيح المعلم المناسب لطفلك.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setIsRecommendationModalOpen(true)}
                              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#1F2A44] hover:bg-[#0D4E8B] text-white font-['Cairo'] font-bold text-xs inline-flex items-center gap-2 cursor-pointer shrink-0"
                            >
                              <MessageCircle className="w-4 h-4 text-[#FFC629]" />
                              <span>اطلب ترشيح معلم عبر واتساب</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Quran Precision Drawer */
                  <div className="space-y-4">
                    <div>
                      <span className="block font-['Cairo'] text-xs font-bold text-[#1F2A44] mb-2">
                        ١. الفئة العمرية للطفل
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {quranAgeGroups.map((ag) => {
                          const isSelected = ageGroupId === ag.id;
                          const { title, rangeText } = formatQuranAgeGroupDisplay(ag);
                          return (
                            <button
                              key={ag.id}
                              type="button"
                              onClick={() => setAgeGroupId(ag.id)}
                              className={`min-h-[54px] p-3 rounded-xl border text-right transition-all cursor-pointer flex items-center justify-between gap-2 ${
                                isSelected
                                  ? 'border-[#0D4E8B] bg-[#EBF3FC] text-[#0D4E8B]'
                                  : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1] text-[#1F2A44]'
                              }`}
                            >
                              <div>
                                <div className="font-['Cairo'] font-bold text-xs sm:text-sm">
                                  {title}
                                </div>
                                <div className="text-[11px] text-[#64748B]">{rangeText}</div>
                              </div>
                              {isSelected && <Check className="w-4 h-4 text-[#0D4E8B] shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-[#E2E8F0]">
                      <span className="block font-['Cairo'] text-xs font-bold text-[#1F2A44] mb-2">
                        ٢. البرنامج القرآني أو التأسيسي
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {quranLevels.map((lvl) => {
                          const isSelected = levelId === lvl.id;
                          const canonical = CANONICAL_QURAN_LEVELS[lvl.id];
                          return (
                            <button
                              key={lvl.id}
                              type="button"
                              onClick={() => {
                                setLevelId(lvl.id);
                                setSelectedProgramValue(`quran:${lvl.id}`);
                              }}
                              className={`min-h-[54px] p-3 rounded-xl border text-right transition-all cursor-pointer flex items-start justify-between gap-2 ${
                                isSelected
                                  ? 'border-[#0D4E8B] bg-[#EBF3FC] text-[#0D4E8B]'
                                  : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1] text-[#1F2A44]'
                              }`}
                            >
                              <div className="space-y-0.5">
                                <div className="font-['Cairo'] font-bold text-xs sm:text-sm">
                                  {canonical?.name || lvl.name}
                                </div>
                                {(canonical?.description || lvl.description) && (
                                  <p className="text-[11px] text-[#64748B] line-clamp-2">
                                    {canonical?.description || lvl.description}
                                  </p>
                                )}
                              </div>
                              {isSelected && <Check className="w-4 h-4 text-[#0D4E8B] shrink-0 mt-0.5" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Quick Select Strip ("اختيار سريع: الكل | الرياضيات | الإنجليزية | القرآن والتأسيس") */}
            <div className="pt-2 border-t border-[#F1F5F9] flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-[#64748B] ml-1">اختيار سريع:</span>

              <button
                type="button"
                onClick={() => handleQuickSelect('all')}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-['Cairo'] font-bold transition-colors cursor-pointer ${
                  activeQuickKey === 'all'
                    ? 'bg-[#0D4E8B] text-white'
                    : 'bg-white border border-[#E2E8F0] text-[#1F2A44] hover:border-[#0D4E8B]/40 hover:bg-[#F8FAFC]'
                }`}
              >
                الكل
              </button>

              <button
                type="button"
                onClick={() => handleQuickSelect('math')}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-['Cairo'] font-bold transition-colors cursor-pointer ${
                  activeQuickKey === 'math'
                    ? 'bg-[#0D4E8B] text-white'
                    : 'bg-white border border-[#E2E8F0] text-[#1F2A44] hover:border-[#0D4E8B]/40 hover:bg-[#F8FAFC]'
                }`}
              >
                الرياضيات
              </button>

              <button
                type="button"
                onClick={() => handleQuickSelect('english')}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-['Cairo'] font-bold transition-colors cursor-pointer ${
                  activeQuickKey === 'english'
                    ? 'bg-[#0D4E8B] text-white'
                    : 'bg-white border border-[#E2E8F0] text-[#1F2A44] hover:border-[#0D4E8B]/40 hover:bg-[#F8FAFC]'
                }`}
              >
                الإنجليزية
              </button>

              <button
                type="button"
                onClick={() => handleQuickSelect('quran')}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-['Cairo'] font-bold transition-colors cursor-pointer ${
                  activeQuickKey === 'quran'
                    ? 'bg-[#0D4E8B] text-white'
                    : 'bg-white border border-[#E2E8F0] text-[#1F2A44] hover:border-[#0D4E8B]/40 hover:bg-[#F8FAFC]'
                }`}
              >
                القرآن والتأسيس
              </button>
            </div>
          </form>
        )}
      </div>

      <WhatsAppNoticeModal
        isOpen={isRecommendationModalOpen}
        onClose={() => setIsRecommendationModalOpen(false)}
        requestType="recommendation"
        track="school"
        tutorId={null}
        courseOptionId={null}
        customWhatsAppUrl={noCourseWhatsAppUrl}
        whatsappAnalyticsSource="no_course_options"
      />
    </div>
  );
};
