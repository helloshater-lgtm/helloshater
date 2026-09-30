import React, { useState, useEffect } from 'react';
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
import { BookOpen, Sparkles, ChevronDown, Check, ArrowLeft, RotateCcw, Info } from 'lucide-react';

interface TutorSelectorProps {
  onSearch: (criteria: SearchCriteria) => void;
  initialCriteria?: SearchCriteria;
  isSearching?: boolean;
  onCriteriaChange?: () => void;
}

export const TutorSelector: React.FC<TutorSelectorProps> = ({
  onSearch,
  initialCriteria,
  isSearching = false,
  onCriteriaChange,
}) => {
  // Track toggle
  const [track, setTrack] = useState<TrackType>(initialCriteria?.track || 'school');

  // School track state (starts empty per requirement)
  const [stageId, setStageId] = useState<StageId | ''>(initialCriteria?.stageId || '');
  const [gradeId, setGradeId] = useState<string>(initialCriteria?.gradeId || '');
  const [subjectId, setSubjectId] = useState<string>(initialCriteria?.subjectId || '');
  const [curriculumType, setCurriculumType] = useState<CurriculumType | ''>(
    initialCriteria?.curriculumType || ''
  );

  // Quran track state (starts empty)
  const [ageGroupId, setAgeGroupId] = useState<string>(initialCriteria?.ageGroupId || '');
  const [levelId, setLevelId] = useState<string>(initialCriteria?.levelId || '');

  // Options from Data Layer
  const [stages, setStages] = useState<Stage[]>([]);
  const [availableGrades, setAvailableGrades] = useState<Grade[]>([]);
  const [availableSubjects, setAvailableSubjects] = useState<Subject[]>([]);
  const [curriculumOptions, setCurriculumOptions] = useState<CurriculumOption[]>([]);
  const [quranAgeGroups, setQuranAgeGroups] = useState<QuranAgeGroup[]>([]);
  const [quranLevels, setQuranLevels] = useState<QuranLevel[]>([]);

  // Sync with initialCriteria when provided or updated
  useEffect(() => {
    if (initialCriteria) {
      setTrack(initialCriteria.track || 'school');
      setStageId(initialCriteria.stageId || '');
      setGradeId(initialCriteria.gradeId || '');
      setSubjectId(initialCriteria.subjectId || '');
      setCurriculumType(initialCriteria.curriculumType || '');
      setAgeGroupId(initialCriteria.ageGroupId || '');
      setLevelId(initialCriteria.levelId || '');
    }
  }, [initialCriteria]);

  // Load static data
  useEffect(() => {
    DataService.getStages().then(setStages);
    DataService.getCurriculumOptions().then(setCurriculumOptions);
    DataService.getSubjects().then(setAvailableSubjects);
    DataService.getQuranAgeGroups().then(setQuranAgeGroups);
    DataService.getQuranLevels().then(setQuranLevels);
  }, []);

  // Cascading Grade update when stage changes
  useEffect(() => {
    if (stageId) {
      DataService.getGradesByStage(stageId).then((grades) => {
        setAvailableGrades(grades);
        if (gradeId && !grades.some((g) => g.id === gradeId)) {
          setGradeId('');
        }
      });
    } else {
      setAvailableGrades([]);
      setGradeId('');
    }
  }, [stageId]);

  // Adjust subjects visibility based on stage
  const filteredSubjects = availableSubjects.filter((subj) => {
    if (stageId === 'elementary') {
      return !['physics', 'chemistry', 'biology'].includes(subj.id);
    }
    if (stageId === 'preparatory') {
      return !['physics', 'chemistry', 'biology'].includes(subj.id);
    }
    if (stageId === 'secondary') {
      return subj.id !== 'social';
    }
    return true;
  });

  // Verify if current subject is still valid after stage change
  useEffect(() => {
    if (subjectId && stageId) {
      const isValid = filteredSubjects.some((s) => s.id === subjectId);
      if (!isValid) {
        setSubjectId('');
      }
    } else if (!stageId && subjectId) {
      setSubjectId('');
    }
  }, [stageId, filteredSubjects, subjectId]);

  // Handlers for selection changes (immediately notifying parent to hide outdated results)
  const handleTrackChange = (newTrack: TrackType) => {
    if (track !== newTrack) {
      setTrack(newTrack);
      onCriteriaChange?.();
    }
  };

  const handleStageChange = (newStage: StageId | '') => {
    setStageId(newStage);
    setGradeId(''); // Always clear grade when stage changes
    if (!newStage) {
      setSubjectId('');
    } else {
      // Validate subject against new stage
      const invalidInNewStage =
        (newStage === 'elementary' || newStage === 'preparatory') &&
        ['physics', 'chemistry', 'biology'].includes(subjectId);
      const invalidInSecondary = newStage === 'secondary' && subjectId === 'social';
      if (invalidInNewStage || invalidInSecondary) {
        setSubjectId('');
      }
    }
    onCriteriaChange?.();
  };

  const handleGradeChange = (newGrade: string) => {
    setGradeId(newGrade);
    onCriteriaChange?.();
  };

  const handleSubjectChange = (newSubject: string) => {
    setSubjectId(newSubject);
    onCriteriaChange?.();
  };

  const handleCurriculumChange = (newCurriculum: CurriculumType | '') => {
    setCurriculumType(newCurriculum);
    onCriteriaChange?.();
  };

  const handleAgeGroupChange = (newAgeGroup: string) => {
    setAgeGroupId(newAgeGroup);
    onCriteriaChange?.();
  };

  const handleLevelChange = (newLevel: string) => {
    setLevelId(newLevel);
    onCriteriaChange?.();
  };

  // Determine readiness
  const isSchoolComplete = Boolean(stageId && gradeId && subjectId && curriculumType);
  const isQuranComplete = Boolean(ageGroupId && levelId);
  const isFormComplete = track === 'school' ? isSchoolComplete : isQuranComplete;

  const getMissingStepMessage = () => {
    if (track === 'school') {
      if (!stageId) return 'الخطوة المطلوبة: يرجى تحديد المرحلة الدراسية أولاً.';
      if (!gradeId) return 'الخطوة المطلوبة: يرجى اختيار الصف الدراسي.';
      if (!subjectId) return 'الخطوة المطلوبة: يرجى اختيار المادة التعليمية.';
      if (!curriculumType) return 'الخطوة المطلوبة: يرجى تحديد نوع الدراسة والمنهج.';
    } else {
      if (!ageGroupId) return 'الخطوة المطلوبة: يرجى تحديد الفئة العمرية للطفل.';
      if (!levelId) return 'الخطوة المطلوبة: يرجى اختيار البرنامج أو المستوى المطلوب.';
    }
    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormComplete) return;

    if (track === 'school') {
      onSearch({
        track: 'school',
        stageId,
        gradeId,
        subjectId,
        curriculumType,
      });
    } else {
      onSearch({
        track: 'quran',
        ageGroupId,
        levelId,
      });
    }
  };

  const handleReset = () => {
    setStageId('');
    setGradeId('');
    setSubjectId('');
    setCurriculumType('');
    setAgeGroupId('');
    setLevelId('');
    onCriteriaChange?.();
  };

  return (
    <div
      id="tutor-selector-section"
      className="w-full bg-white rounded-2xl sm:rounded-3xl shadow-[0_2px_16px_rgba(13,78,139,0.05)] border border-[#E2E8F0] p-5 sm:p-7 md:p-8 transition-all scroll-mt-24"
    >
      {/* Header & Track Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-[#E2E8F0]">
        <div>
          <h2 className="font-['Cairo'] text-xl sm:text-2xl font-bold text-[#0D4E8B]">
            اختر ما يناسب طفلك
          </h2>
          <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">
            حدد المرحلة والمادة ونوع الدراسة لنعرض لك المعلمين المناسبين لاختياراتك.
          </p>
        </div>

        {/* Track Switcher (Clean Segmented Control) */}
        <div className="flex items-center gap-1 p-1 bg-[#F2F3F6] rounded-xl border border-[#E2E8F0] self-start md:self-auto shrink-0">
          <button
            type="button"
            onClick={() => handleTrackChange('school')}
            className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              track === 'school'
                ? 'bg-[#0D4E8B] text-white shadow-sm'
                : 'text-[#1F2A44] hover:text-[#0D4E8B]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>المناهج المدرسية</span>
          </button>
          <button
            type="button"
            onClick={() => handleTrackChange('quran')}
            className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              track === 'quran'
                ? 'bg-[#0D4E8B] text-white shadow-sm'
                : 'text-[#1F2A44] hover:text-[#0D4E8B]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>مسار القرآن والتأسيس</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        {/* TRACK A: School Curriculum */}
        {track === 'school' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 1. Stage */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[#1F2A44] flex items-center justify-between">
                  <span>المرحلة الدراسية <span className="text-red-500">*</span></span>
                </label>
                <div className="relative">
                  <select
                    value={stageId}
                    onChange={(e) => handleStageChange(e.target.value as StageId)}
                    className="w-full h-11 px-3.5 pl-8 rounded-xl bg-[#F8F9FC] border border-[#CBD5E1] text-[#1F2A44] font-medium text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#0D4E8B] focus:bg-white transition-all appearance-none cursor-pointer"
                  >
                    <option value="">اختر المرحلة الدراسية</option>
                    {stages.map((stg) => (
                      <option key={stg.id} value={stg.id}>
                        {stg.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-[#64748B] absolute left-3 top-3.5 pointer-events-none" />
                </div>
              </div>

              {/* 2. Grade (Cascades from Stage) */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[#1F2A44] flex items-center justify-between">
                  <span>الصف الدراسي <span className="text-red-500">*</span></span>
                </label>
                <div className="relative">
                  <select
                    value={gradeId}
                    onChange={(e) => handleGradeChange(e.target.value)}
                    disabled={!stageId}
                    className={`w-full h-11 px-3.5 pl-8 rounded-xl border font-medium text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#0D4E8B] transition-all appearance-none ${
                      !stageId
                        ? 'bg-[#E2E8F0]/50 border-[#E2E8F0] text-[#94A3B8] cursor-not-allowed'
                        : 'bg-[#F8F9FC] border-[#CBD5E1] text-[#1F2A44] focus:bg-white cursor-pointer'
                    }`}
                  >
                    <option value="">
                      {!stageId ? 'اختر المرحلة الدراسية أولاً لتحديد الصف' : 'اختر الصف الدراسي'}
                    </option>
                    {availableGrades.map((grd) => (
                      <option key={grd.id} value={grd.id}>
                        {grd.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-[#64748B] absolute left-3 top-3.5 pointer-events-none" />
                </div>
              </div>

              {/* 3. Subject (Cascades from Stage) */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[#1F2A44] flex items-center justify-between">
                  <span>المادة التعليمية <span className="text-red-500">*</span></span>
                </label>
                <div className="relative">
                  <select
                    value={subjectId}
                    onChange={(e) => handleSubjectChange(e.target.value)}
                    disabled={!stageId}
                    className={`w-full h-11 px-3.5 pl-8 rounded-xl border font-medium text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#0D4E8B] transition-all appearance-none ${
                      !stageId
                        ? 'bg-[#E2E8F0]/50 border-[#E2E8F0] text-[#94A3B8] cursor-not-allowed'
                        : 'bg-[#F8F9FC] border-[#CBD5E1] text-[#1F2A44] focus:bg-white cursor-pointer'
                    }`}
                  >
                    <option value="">
                      {!stageId ? 'اختر المرحلة الدراسية أولاً لعرض المواد' : 'اختر المادة المطلوبة'}
                    </option>
                    {filteredSubjects.map((sbj) => (
                      <option key={sbj.id} value={sbj.id}>
                        {sbj.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-[#64748B] absolute left-3 top-3.5 pointer-events-none" />
                </div>
              </div>

              {/* 4. Curriculum Type */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[#1F2A44] flex items-center justify-between">
                  <span>نوع الدراسة والمنهج <span className="text-red-500">*</span></span>
                </label>
                <div className="relative">
                  <select
                    value={curriculumType}
                    onChange={(e) => handleCurriculumChange(e.target.value as CurriculumType)}
                    className="w-full h-11 px-3.5 pl-8 rounded-xl bg-[#F8F9FC] border border-[#CBD5E1] text-[#1F2A44] font-medium text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#0D4E8B] focus:bg-white transition-all appearance-none cursor-pointer"
                  >
                    <option value="">اختر نوع الدراسة والمنهج</option>
                    {curriculumOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-[#64748B] absolute left-3 top-3.5 pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="p-2.5 bg-[#F2F3F6] rounded-xl text-xs text-[#535E7B] flex items-center gap-2">
              <Info className="w-4 h-4 text-[#0D4E8B] shrink-0" />
              <span>
                لمدارس اللغات والتجريبي (Math / Science)، اختر «لغات / تجريبي» لعرض معلمين يشرحون المصطلحات بالإنجليزية.
              </span>
            </div>
          </div>
        )}

        {/* TRACK B: Quran & Foundation Track */}
        {track === 'quran' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Age Group */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[#1F2A44] flex items-center justify-between">
                  <span>الفئة العمرية للطفل <span className="text-red-500">*</span></span>
                </label>
                <div className="relative">
                  <select
                    value={ageGroupId}
                    onChange={(e) => handleAgeGroupChange(e.target.value)}
                    className="w-full h-11 px-3.5 pl-8 rounded-xl bg-[#F8F9FC] border border-[#CBD5E1] text-[#1F2A44] font-medium text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#0D4E8B] focus:bg-white transition-all appearance-none cursor-pointer"
                  >
                    <option value="">اختر الفئة العمرية</option>
                    {quranAgeGroups.map((ag) => (
                      <option key={ag.id} value={ag.id}>
                        {ag.name} ({ag.ageRange})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-[#64748B] absolute left-3 top-3.5 pointer-events-none" />
                </div>
              </div>

              {/* Program / Level */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[#1F2A44] flex items-center justify-between">
                  <span>البرنامج والهدف المطلوب <span className="text-red-500">*</span></span>
                </label>
                <div className="relative">
                  <select
                    value={levelId}
                    onChange={(e) => handleLevelChange(e.target.value)}
                    className="w-full h-11 px-3.5 pl-8 rounded-xl bg-[#F8F9FC] border border-[#CBD5E1] text-[#1F2A44] font-medium text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#0D4E8B] focus:bg-white transition-all appearance-none cursor-pointer"
                  >
                    <option value="">اختر البرنامج أو المستوى</option>
                    {quranLevels.map((lvl) => (
                      <option key={lvl.id} value={lvl.id}>
                        {lvl.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-[#64748B] absolute left-3 top-3.5 pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="p-2.5 bg-[#F2F3F6] rounded-xl text-xs text-[#535E7B] flex items-center gap-2">
              <Info className="w-4 h-4 text-[#0D4E8B] shrink-0" />
              <span>
                معلمات ومعلمون متمرسون في منهج نور البيان التأسيسي وحفظ وتجويد القرآن الكريم للأطفال.
              </span>
            </div>
          </div>
        )}

        {/* Actions Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-[#E2E8F0]">
          <div className="text-xs text-[#64748B] order-2 sm:order-1 text-center sm:text-right">
            {!isFormComplete ? (
              <span className="text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 inline-block font-medium">
                {getMissingStepMessage()}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-emerald-600 font-bold">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>جاهز لعرض المعلمين المناسبين لاختياراتك (اضغط زر «اعرض المعلمين المناسبين»).</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto order-1 sm:order-2">
            {(stageId || gradeId || subjectId || curriculumType || ageGroupId || levelId) && (
              <button
                type="button"
                onClick={handleReset}
                className="px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] text-[#64748B] hover:text-[#1F2A44] hover:bg-[#F2F3F6] text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>إعادة ضبط</span>
              </button>
            )}

            <button
              type="submit"
              disabled={!isFormComplete || isSearching}
              className={`flex-1 sm:flex-initial px-7 py-3 rounded-xl font-['Cairo'] font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer ${
                !isFormComplete || isSearching
                  ? 'bg-[#E2E8F0] text-[#94A3B8] cursor-not-allowed shadow-none'
                  : 'bg-[#0D4E8B] hover:bg-[#003767] text-white hover:shadow-md active:scale-[0.99]'
              }`}
            >
              {isSearching ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  <span>جاري البحث...</span>
                </>
              ) : (
                <>
                  <span>اعرض المعلمين المناسبين</span>
                  <ArrowLeft className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
