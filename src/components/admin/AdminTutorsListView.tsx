import React, { useState, useEffect, useMemo } from 'react';
import { AdminService, AdminTutorListItem } from '../../services/adminService';
import {
  AdminEditorTabTarget,
  ReadinessRequirementKey,
  TutorProfileReadinessEvaluation,
  TutorReadinessPolicyConfig,
  evaluateTutorProfileReadiness,
  buildTutorWhatsAppUrl,
  buildTutorProfileCompletionWhatsAppDraft,
} from '../../utils/tutorReadinessAndContact';
import {
  Search,
  Plus,
  Edit3,
  Eye,
  Globe,
  GlobeLock,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Calendar,
  Clock,
  User,
  RefreshCw,
  MessageCircle,
  SlidersHorizontal,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  ExternalLink,
  X,
  Send,
  PhoneOff,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

interface AdminTutorsListViewProps {
  tutors: AdminTutorListItem[];
  isLoading: boolean;
  onRefresh: () => void;
  onEditTutor: (tutorId: string, initialTab?: AdminEditorTabTarget) => void;
  onNewTutor: () => void;
  onPreviewTutor: (tutorId: string) => void;
  onTogglePublish: (tutorId: string, currentStatus: boolean) => void;
}

interface PersistedTutorFiltersState {
  searchQuery: string;
  trackFilter: 'all' | 'school' | 'quran';
  schoolSubjectId: string;
  schoolStageId: string;
  schoolGradeId: string;
  schoolCurriculumId: string;
  quranLevelId: string;
  quranAgeGroupId: string;
  publishFilter: 'all' | 'published' | 'unpublished';
  readinessFilter:
    | 'all'
    | 'data_complete_6_6'
    | 'ready_for_first_publish'
    | 'incomplete_data'
    | 'published_needs_slots'
    | 'evaluation_error';
  missingRequirementFilter: 'all' | ReadinessRequirementKey | 'quality_review' | 'contact_missing';
  page: number;
  showAllPages: boolean;
}

const FILTERS_STORAGE_KEY = 'shatir_admin_tutors_filters_v1';
const PAGE_SIZE = 12;

const DEFAULT_FILTERS: PersistedTutorFiltersState = {
  searchQuery: '',
  trackFilter: 'all',
  schoolSubjectId: '',
  schoolStageId: '',
  schoolGradeId: '',
  schoolCurriculumId: '',
  quranLevelId: '',
  quranAgeGroupId: '',
  publishFilter: 'all',
  readinessFilter: 'all',
  missingRequirementFilter: 'all',
  page: 1,
  showAllPages: false,
};

function loadInitialFilters(): PersistedTutorFiltersState {
  if (typeof window === 'undefined') return DEFAULT_FILTERS;
  try {
    const raw = window.sessionStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) return DEFAULT_FILTERS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_FILTERS,
      ...parsed,
      page: Number(parsed?.page) >= 1 ? Number(parsed.page) : 1,
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

export const AdminTutorsListView: React.FC<AdminTutorsListViewProps> = ({
  tutors,
  isLoading,
  onRefresh,
  onEditTutor,
  onNewTutor,
  onPreviewTutor,
  onTogglePublish,
}) => {
  // Persisted Filter State
  const [filters, setFilters] = useState<PersistedTutorFiltersState>(loadInitialFilters);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters));
    } catch {
      // Ignore storage quota issues
    }
  }, [filters]);

  // Track runtime broken avatar images by tutor.id
  const [brokenAvatarMap, setBrokenAvatarMap] = useState<Record<string, boolean>>({});

  // Configurable readiness policy state
  const [policy, setPolicy] = useState<TutorReadinessPolicyConfig>(() =>
    AdminService.getReadinessPolicy()
  );
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState(false);
  const [draftPolicy, setDraftPolicy] = useState<TutorReadinessPolicyConfig>(policy);

  // WhatsApp Completion Request Modal State
  const [whatsAppModalTutor, setWhatsAppModalTutor] = useState<{
    tutor: AdminTutorListItem;
    effectiveReadiness: TutorProfileReadinessEvaluation;
    draftMessage: string;
  } | null>(null);

  // Readiness & Quality Review Details Modal State
  const [inspectModalTutorId, setInspectModalTutorId] = useState<string | null>(null);
  const [qrAvatarApproved, setQrAvatarApproved] = useState(false);
  const [qrPriceApproved, setQrPriceApproved] = useState(false);
  const [qrNotes, setQrNotes] = useState('');
  const [isSavingQuality, setIsSavingQuality] = useState(false);
  const [qualityFeedback, setQualityFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Compute effective readiness for each tutor (accounting for runtime broken avatar or updated policy)
  const tutorsWithEffectiveReadiness = useMemo(() => {
    return tutors.map((t) => {
      const isBrokenRuntime = Boolean(brokenAvatarMap[t.id]);
      if (!isBrokenRuntime) {
        return { tutor: t, readiness: t.readiness };
      }
      // Re-evaluate with broken runtime avatar
      const reEvaluated = evaluateTutorProfileReadiness({
        tutor: {
          id: t.id,
          name: t.name,
          headline: t.headline,
          avatarUrl: t.avatarUrl,
          helpChildQuote: t.helpChildQuote,
          helpChildSummary: t.helpChildSummary,
          hourlyRateMin: t.hourlyRateMin,
          hourlyRateMax: t.hourlyRateMax,
          currency: t.currency,
          sessionDurationMinutes: t.sessionDurationMinutes,
          trialDurationMinutes: t.trialDurationMinutes,
          isPublished: t.isPublished,
        },
        activeSpecializationsCount: t.offeringsCount,
        specializations: t.activeSpecializations,
        trialSlots: t.validTrialSlots,
        privateSlots: t.validPaidPrivateSlots,
        isAvatarBrokenAtRuntime: true,
        evaluationError: t.readiness.evaluationError,
        evaluationErrorMessage: t.readiness.evaluationErrorMessage,
        qualityReview: t.qualityReview,
        policy,
      });
      return { tutor: t, readiness: reEvaluated };
    });
  }, [tutors, brokenAvatarMap, policy]);

  // Extract distinct taxonomy options strictly from active approved relational offerings
  const taxonomyOptions = useMemo(() => {
    const subjectsMap = new Map<string, string>();
    const stagesMap = new Map<string, string>();
    const gradesMap = new Map<string, { name: string; stageId: string }>();
    const curriculumsMap = new Map<string, string>();
    const quranLevelsMap = new Map<string, string>();
    const quranAgesMap = new Map<string, string>();

    for (const { tutor } of tutorsWithEffectiveReadiness) {
      for (const spec of tutor.activeSpecializations) {
        if (spec.track === 'school') {
          if (spec.subjectId && spec.subjectName) {
            subjectsMap.set(spec.subjectId, spec.subjectName);
          }
          if (spec.stageId && spec.stageName) {
            stagesMap.set(spec.stageId, spec.stageName);
          }
          if (spec.gradeId && spec.gradeName) {
            gradesMap.set(spec.gradeId, { name: spec.gradeName, stageId: spec.stageId || '' });
          }
          if (spec.curriculumId && spec.curriculumName) {
            curriculumsMap.set(spec.curriculumId, spec.curriculumName);
          }
        } else if (spec.track === 'quran') {
          if (spec.levelId && spec.levelName) {
            quranLevelsMap.set(spec.levelId, spec.levelName);
          }
          if (spec.ageGroupId && spec.ageGroupName) {
            quranAgesMap.set(spec.ageGroupId, spec.ageGroupName);
          }
        }
      }
    }

    return {
      subjects: Array.from(subjectsMap.entries()).map(([id, name]) => ({ id, name })),
      stages: Array.from(stagesMap.entries()).map(([id, name]) => ({ id, name })),
      grades: Array.from(gradesMap.entries())
        .filter(([_, val]) => !filters.schoolStageId || val.stageId === filters.schoolStageId)
        .map(([id, val]) => ({ id, name: val.name, stageId: val.stageId })),
      curriculums: Array.from(curriculumsMap.entries()).map(([id, name]) => ({ id, name })),
      quranLevels: Array.from(quranLevelsMap.entries()).map(([id, name]) => ({ id, name })),
      quranAges: Array.from(quranAgesMap.entries()).map(([id, name]) => ({ id, name })),
    };
  }, [tutorsWithEffectiveReadiness, filters.schoolStageId]);

  // Apply Cross-Filters (Deduplicated per tutor)
  const filteredList = useMemo(() => {
    const q = filters.searchQuery.trim().toLowerCase();

    return tutorsWithEffectiveReadiness.filter(({ tutor, readiness }) => {
      // 1. Search Query
      if (q) {
        const inName = tutor.name.toLowerCase().includes(q);
        const inId = tutor.id.toLowerCase().includes(q);
        const inHeadline = (tutor.headline || '').toLowerCase().includes(q);
        const inPhone =
          (tutor.contact.e164Digits || '').includes(q) ||
          (tutor.contact.displayPhone || '').includes(q);
        const inSpec = tutor.activeSpecializations.some(
          (o) =>
            (o.label || '').toLowerCase().includes(q) ||
            (o.subjectName || '').toLowerCase().includes(q) ||
            (o.gradeName || '').toLowerCase().includes(q) ||
            (o.stageName || '').toLowerCase().includes(q) ||
            (o.curriculumName || '').toLowerCase().includes(q) ||
            (o.levelName || '').toLowerCase().includes(q) ||
            (o.ageGroupName || '').toLowerCase().includes(q)
        );
        if (!inName && !inId && !inHeadline && !inPhone && !inSpec) {
          return false;
        }
      }

      // 2. Track Filter
      if (filters.trackFilter === 'school' && !tutor.tracks.includes('school')) {
        return false;
      }
      if (filters.trackFilter === 'quran' && !tutor.tracks.includes('quran')) {
        return false;
      }

      // 3. School Sub-Filters (Relational intersection on activeSpecializations)
      if (
        filters.schoolSubjectId ||
        filters.schoolStageId ||
        filters.schoolGradeId ||
        filters.schoolCurriculumId
      ) {
        const hasMatchingSchoolOffering = tutor.activeSpecializations.some((off) => {
          if (off.track !== 'school') return false;
          if (filters.schoolSubjectId && off.subjectId !== filters.schoolSubjectId) return false;
          if (filters.schoolStageId && off.stageId !== filters.schoolStageId) return false;
          if (filters.schoolGradeId && off.gradeId !== filters.schoolGradeId) return false;
          if (filters.schoolCurriculumId && off.curriculumId !== filters.schoolCurriculumId)
            return false;
          return true;
        });
        if (!hasMatchingSchoolOffering) return false;
      }

      // 4. Quran Sub-Filters (Relational intersection on activeSpecializations)
      if (filters.quranLevelId || filters.quranAgeGroupId) {
        const hasMatchingQuranOffering = tutor.activeSpecializations.some((off) => {
          if (off.track !== 'quran') return false;
          if (filters.quranLevelId && off.levelId !== filters.quranLevelId) return false;
          if (filters.quranAgeGroupId && off.ageGroupId !== filters.quranAgeGroupId) return false;
          return true;
        });
        if (!hasMatchingQuranOffering) return false;
      }

      // 5. Publication Filter
      if (filters.publishFilter === 'published' && !tutor.isPublished) return false;
      if (filters.publishFilter === 'unpublished' && tutor.isPublished) return false;

      // 6. Readiness Status Filter
      if (filters.readinessFilter !== 'all') {
        if (filters.readinessFilter === 'evaluation_error' && !readiness.evaluationError) {
          return false;
        }
        if (filters.readinessFilter === 'data_complete_6_6' && !readiness.isDataComplete6of6) {
          return false;
        }
        if (
          filters.readinessFilter === 'ready_for_first_publish' &&
          !readiness.isReadyForInitialPublish
        ) {
          return false;
        }
        if (
          filters.readinessFilter === 'incomplete_data' &&
          (readiness.evaluationError || readiness.isDataComplete6of6)
        ) {
          return false;
        }
        if (
          filters.readinessFilter === 'published_needs_slots' &&
          readiness.overallStatus !== 'published_needs_slots'
        ) {
          return false;
        }
      }

      // 7. Specific Missing Requirement Filter
      if (filters.missingRequirementFilter !== 'all') {
        if (filters.missingRequirementFilter === 'contact_missing') {
          if (tutor.contact.hasValidContact) return false;
        } else if (filters.missingRequirementFilter === 'quality_review') {
          if (
            readiness.evaluationError ||
            tutor.isPublished ||
            !readiness.isDataComplete6of6 ||
            readiness.initialQualityReview.isQualityReviewComplete
          ) {
            return false;
          }
        } else {
          if (
            readiness.evaluationError ||
            !readiness.missingRequirements.some((r) => r.key === filters.missingRequirementFilter)
          ) {
            return false;
          }
        }
      }

      return true;
    });
  }, [tutorsWithEffectiveReadiness, filters]);

  // Summary Counts
  const summaryStats = useMemo(() => {
    let publishedCount = 0;
    let unpublishedCount = 0;
    let dataCompleteCount = 0;
    let readyForFirstPublishCount = 0;
    let needsCompletionCount = 0;
    let publishedNeedsSlotsCount = 0;
    let evaluationErrorCount = 0;
    let validContactCount = 0;

    for (const { tutor, readiness } of tutorsWithEffectiveReadiness) {
      if (tutor.isPublished) publishedCount++;
      else unpublishedCount++;

      if (tutor.contact.hasValidContact) validContactCount++;

      if (readiness.evaluationError) {
        evaluationErrorCount++;
      } else {
        if (readiness.isDataComplete6of6) dataCompleteCount++;
        else needsCompletionCount++;

        if (!tutor.isPublished && readiness.isReadyForInitialPublish) {
          readyForFirstPublishCount++;
        }
        if (readiness.overallStatus === 'published_needs_slots') {
          publishedNeedsSlotsCount++;
        }
      }
    }

    return {
      total: tutorsWithEffectiveReadiness.length,
      publishedCount,
      unpublishedCount,
      dataCompleteCount,
      readyForFirstPublishCount,
      needsCompletionCount,
      publishedNeedsSlotsCount,
      evaluationErrorCount,
      validContactCount,
    };
  }, [tutorsWithEffectiveReadiness]);

  const hasActiveFilters = useMemo(() => {
    return (
      filters.searchQuery.trim() !== '' ||
      filters.trackFilter !== 'all' ||
      filters.schoolSubjectId !== '' ||
      filters.schoolStageId !== '' ||
      filters.schoolGradeId !== '' ||
      filters.schoolCurriculumId !== '' ||
      filters.quranLevelId !== '' ||
      filters.quranAgeGroupId !== '' ||
      filters.publishFilter !== 'all' ||
      filters.readinessFilter !== 'all' ||
      filters.missingRequirementFilter !== 'all'
    );
  }, [filters]);

  const resetAllFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  // Pagination logic
  const totalPages = Math.max(1, Math.ceil(filteredList.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(filters.page, totalPages);
  const displayedList = useMemo(() => {
    if (filters.showAllPages) return filteredList;
    const startIdx = (safeCurrentPage - 1) * PAGE_SIZE;
    return filteredList.slice(startIdx, startIdx + PAGE_SIZE);
  }, [filteredList, filters.showAllPages, safeCurrentPage]);

  // Open Inspect / Quality Review Modal
  const inspectedItem = useMemo(() => {
    if (!inspectModalTutorId) return null;
    return (
      tutorsWithEffectiveReadiness.find((entry) => entry.tutor.id === inspectModalTutorId) || null
    );
  }, [inspectModalTutorId, tutorsWithEffectiveReadiness]);

  const handleOpenInspectModal = (tutorId: string) => {
    const entry = tutorsWithEffectiveReadiness.find((e) => e.tutor.id === tutorId);
    if (!entry) return;
    setInspectModalTutorId(tutorId);
    setQrAvatarApproved(entry.readiness.initialQualityReview.avatarApprovalMatchesCurrentUrl);
    setQrPriceApproved(entry.readiness.initialQualityReview.priceApprovalMatchesCurrentPricing);
    setQrNotes(entry.readiness.initialQualityReview.reviewNotes || '');
    setQualityFeedback(null);
  };

  const handleSaveQualityFromModal = async (andPublishAfter?: boolean) => {
    if (!inspectedItem) return;
    const { tutor } = inspectedItem;
    setIsSavingQuality(true);
    setQualityFeedback(null);

    try {
      await AdminService.saveTutorInitialQualityReview({
        tutorId: tutor.id,
        avatarQualityApproved: qrAvatarApproved,
        approvedAvatarUrl: tutor.avatarUrl,
        priceQualityApproved: qrPriceApproved,
        approvedPriceAmount: tutor.hourlyRateMin,
        approvedCurrency: tutor.currency,
        approvedDurationMinutes: tutor.sessionDurationMinutes,
        reviewNotes: qrNotes.trim() || undefined,
      });

      if (andPublishAfter && !tutor.isPublished) {
        await AdminService.toggleTutorPublish(tutor.id, true);
        setQualityFeedback({
          type: 'success',
          text: 'تم اعتماد الجودة الأولية ونشر ملف المعلم في الموقع بنجاح!',
        });
      } else {
        setQualityFeedback({
          type: 'success',
          text: 'تم حفظ اعتماد مراجعة الجودة الأولية بنجاح.',
        });
      }

      onRefresh();
    } catch (err: any) {
      setQualityFeedback({
        type: 'error',
        text: err?.message || 'فشل حفظ مراجعة الجودة أو النشر.',
      });
    } finally {
      setIsSavingQuality(false);
    }
  };

  const handleSavePolicyConfig = () => {
    const saved = AdminService.saveReadinessPolicy(draftPolicy);
    setPolicy(saved);
    setIsPolicyModalOpen(false);
    onRefresh();
  };

  return (
    <div className="space-y-6">
      {/* Summary KPI Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <button
          type="button"
          onClick={() =>
            setFilters((prev) => ({
              ...prev,
              publishFilter: 'all',
              readinessFilter: 'all',
              page: 1,
            }))
          }
          className={`p-3.5 rounded-2xl border text-right transition-all cursor-pointer ${
            filters.publishFilter === 'all' && filters.readinessFilter === 'all'
              ? 'bg-[#F0F6FD] border-[#0D4E8B] shadow-2xs'
              : 'bg-white border-[#E2E8F0] hover:border-slate-300'
          }`}
        >
          <span className="text-[11px] font-bold text-[#64748B] block">إجمالي المعلمين</span>
          <span className="font-['Cairo'] text-xl font-extrabold text-[#1F2A44] tabular-nums">
            {summaryStats.total}
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            setFilters((prev) => ({
              ...prev,
              publishFilter: 'published',
              readinessFilter: 'all',
              page: 1,
            }))
          }
          className={`p-3.5 rounded-2xl border text-right transition-all cursor-pointer ${
            filters.publishFilter === 'published'
              ? 'bg-emerald-50 border-emerald-500 shadow-2xs'
              : 'bg-white border-[#E2E8F0] hover:border-slate-300'
          }`}
        >
          <span className="text-[11px] font-bold text-emerald-700 block">منشور للجمهور</span>
          <span className="font-['Cairo'] text-xl font-extrabold text-emerald-800 tabular-nums">
            {summaryStats.publishedCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            setFilters((prev) => ({
              ...prev,
              publishFilter: 'all',
              readinessFilter: 'data_complete_6_6',
              page: 1,
            }))
          }
          className={`p-3.5 rounded-2xl border text-right transition-all cursor-pointer ${
            filters.readinessFilter === 'data_complete_6_6'
              ? 'bg-blue-50 border-[#0D4E8B] shadow-2xs'
              : 'bg-white border-[#E2E8F0] hover:border-slate-300'
          }`}
        >
          <span className="text-[11px] font-bold text-[#0D4E8B] block">مكتمل البيانات (6/6)</span>
          <span className="font-['Cairo'] text-xl font-extrabold text-[#0D4E8B] tabular-nums">
            {summaryStats.dataCompleteCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            setFilters((prev) => ({
              ...prev,
              publishFilter: 'unpublished',
              readinessFilter: 'ready_for_first_publish',
              page: 1,
            }))
          }
          className={`p-3.5 rounded-2xl border text-right transition-all cursor-pointer ${
            filters.readinessFilter === 'ready_for_first_publish'
              ? 'bg-teal-50 border-teal-600 shadow-2xs'
              : 'bg-white border-[#E2E8F0] hover:border-slate-300'
          }`}
        >
          <span className="text-[11px] font-bold text-teal-700 block">جاهز للنشر الأول</span>
          <span className="font-['Cairo'] text-xl font-extrabold text-teal-800 tabular-nums">
            {summaryStats.readyForFirstPublishCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            setFilters((prev) => ({
              ...prev,
              publishFilter: 'all',
              readinessFilter: 'incomplete_data',
              page: 1,
            }))
          }
          className={`p-3.5 rounded-2xl border text-right transition-all cursor-pointer ${
            filters.readinessFilter === 'incomplete_data'
              ? 'bg-amber-50 border-amber-500 shadow-2xs'
              : 'bg-white border-[#E2E8F0] hover:border-slate-300'
          }`}
        >
          <span className="text-[11px] font-bold text-amber-700 block">بحاجة لاستكمال</span>
          <span className="font-['Cairo'] text-xl font-extrabold text-amber-800 tabular-nums">
            {summaryStats.needsCompletionCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            setFilters((prev) => ({
              ...prev,
              publishFilter: 'published',
              readinessFilter: 'published_needs_slots',
              page: 1,
            }))
          }
          className={`p-3.5 rounded-2xl border text-right transition-all cursor-pointer ${
            filters.readinessFilter === 'published_needs_slots'
              ? 'bg-orange-50 border-orange-500 shadow-2xs'
              : 'bg-white border-[#E2E8F0] hover:border-slate-300'
          }`}
        >
          <span className="text-[11px] font-bold text-orange-700 block">منشور يحتاج مواعيد</span>
          <span className="font-['Cairo'] text-xl font-extrabold text-orange-800 tabular-nums">
            {summaryStats.publishedNeedsSlotsCount}
          </span>
        </button>
      </div>

      {/* Main Filter & Organization Panel */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#E2E8F0] shadow-xs space-y-4">
        {/* Top Row: Search + Track Tabs + Actions */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#94A3B8] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={filters.searchQuery}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, searchQuery: e.target.value, page: 1 }))
              }
              placeholder="ابحث باسم المعلم، المعرّف، العنوان، المادة، أو رقم الهاتف..."
              className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm text-[#1F2A44] focus:border-[#0D4E8B] outline-none transition-all"
            />
          </div>

          {/* Track Segmented Selector */}
          <div className="flex items-center bg-[#F1F5F9] p-1 rounded-xl text-xs font-bold shrink-0">
            <button
              type="button"
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  trackFilter: 'all',
                  page: 1,
                }))
              }
              className={`min-h-[38px] px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                filters.trackFilter === 'all'
                  ? 'bg-white text-[#1F2A44] shadow-2xs'
                  : 'text-[#64748B] hover:text-[#1F2A44]'
              }`}
            >
              الكل ({tutors.length})
            </button>
            <button
              type="button"
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  trackFilter: 'school',
                  quranLevelId: '',
                  quranAgeGroupId: '',
                  page: 1,
                }))
              }
              className={`min-h-[38px] px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                filters.trackFilter === 'school'
                  ? 'bg-white text-[#0D4E8B] shadow-2xs'
                  : 'text-[#64748B] hover:text-[#1F2A44]'
              }`}
            >
              المناهج الدراسية ({tutors.filter((t) => t.tracks.includes('school')).length})
            </button>
            <button
              type="button"
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  trackFilter: 'quran',
                  schoolSubjectId: '',
                  schoolStageId: '',
                  schoolGradeId: '',
                  schoolCurriculumId: '',
                  page: 1,
                }))
              }
              className={`min-h-[38px] px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                filters.trackFilter === 'quran'
                  ? 'bg-white text-emerald-700 shadow-2xs'
                  : 'text-[#64748B] hover:text-[#1F2A44]'
              }`}
            >
              القرآن والتأسيس ({tutors.filter((t) => t.tracks.includes('quran')).length})
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setDraftPolicy(AdminService.getReadinessPolicy());
                setIsPolicyModalOpen(true);
              }}
              className="min-h-[42px] px-3 py-2 rounded-xl border border-[#CBD5E1] hover:bg-slate-50 text-[#1F2A44] text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
              title="إعدادات سياسة الجاهزية والنطاقات السعرية الاسترشادية"
            >
              <SlidersHorizontal className="w-4 h-4 text-[#0D4E8B]" />
              <span className="hidden sm:inline">سياسة الجاهزية</span>
            </button>

            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="min-h-[42px] p-2.5 rounded-xl border border-[#CBD5E1] hover:bg-slate-50 text-[#64748B] hover:text-[#1F2A44] transition-colors cursor-pointer disabled:opacity-50"
              title="تحديث القائمة وإعادة تقييم الجاهزية"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            <button
              type="button"
              onClick={onNewTutor}
              className="min-h-[42px] px-4 py-2.5 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs sm:text-sm font-bold shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة معلم</span>
            </button>
          </div>
        </div>

        {/* Second Row: Publication Status + Readiness Status + Missing Item Filter */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-[11px] font-bold text-[#64748B] mb-1">حالة النشر</label>
            <select
              value={filters.publishFilter}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  publishFilter: e.target.value as PersistedTutorFiltersState['publishFilter'],
                  page: 1,
                }))
              }
              className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs font-bold text-[#1F2A44] focus:border-[#0D4E8B] outline-none bg-white"
            >
              <option value="all">جميع حالات النشر ({summaryStats.total})</option>
              <option value="published">منشور للجمهور ({summaryStats.publishedCount})</option>
              <option value="unpublished">
                غير منشور — قيد التجهيز ({summaryStats.unpublishedCount})
              </option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#64748B] mb-1">
              حالة الجاهزية (المصدر الموحد 6/6)
            </label>
            <select
              value={filters.readinessFilter}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  readinessFilter: e.target.value as PersistedTutorFiltersState['readinessFilter'],
                  page: 1,
                }))
              }
              className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs font-bold text-[#1F2A44] focus:border-[#0D4E8B] outline-none bg-white"
            >
              <option value="all">كل مستويات الجاهزية</option>
              <option value="data_complete_6_6">
                مكتمل البيانات 6/6 ({summaryStats.dataCompleteCount})
              </option>
              <option value="ready_for_first_publish">
                جاهز للنشر النهائي (مكتمل + معتمد الجودة) ({summaryStats.readyForFirstPublishCount})
              </option>
              <option value="incomplete_data">
                بحاجة لاستكمال بيانات ({summaryStats.needsCompletionCount})
              </option>
              <option value="published_needs_slots">
                منشور — يحتاج تحديث المواعيد ({summaryStats.publishedNeedsSlotsCount})
              </option>
              {summaryStats.evaluationErrorCount > 0 && (
                <option value="evaluation_error">
                  تعذر تقييم الجاهزية ({summaryStats.evaluationErrorCount})
                </option>
              )}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#64748B] mb-1">
              تصفية حسب البند الناقص
            </label>
            <select
              value={filters.missingRequirementFilter}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  missingRequirementFilter:
                    e.target.value as PersistedTutorFiltersState['missingRequirementFilter'],
                  page: 1,
                }))
              }
              className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] text-xs font-bold text-[#1F2A44] focus:border-[#0D4E8B] outline-none bg-white"
            >
              <option value="all">جميع البنود (بدون تصفية)</option>
              <option value="avatar">ناقص: الصورة الشخصية</option>
              <option value="bio">ناقص: العنوان والنبذة التعريفية</option>
              <option value="pricing">ناقص: السعر ومدة الحصة</option>
              <option value="specializations">ناقص: التخصصات المعتمدة</option>
              <option value="paidPrivateSlot">ناقص: موعد حصة خاصة مدفوعة متاح</option>
              <option value="trialSlot">ناقص: موعد حصة تجريبية متاح (20 دقيقة)</option>
              <option value="quality_review">بانتظار: مراجعة الجودة الأولية قبل النشر</option>
              <option value="contact_missing">ناقص: رقم تواصل واتساب صالح</option>
            </select>
          </div>
        </div>

        {/* Third Row: Dynamic Relational Taxonomy Sub-Filters */}
        {(filters.trackFilter === 'all' || filters.trackFilter === 'school') && (
          <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
            <span className="text-[11px] font-bold text-[#0D4E8B] block">
              فلاتر المناهج الدراسية المعتمدة (تقاطعية من عروض المعلم المفعلة):
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <select
                value={filters.schoolSubjectId}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, schoolSubjectId: e.target.value, page: 1 }))
                }
                className="px-2.5 py-1.5 rounded-xl border border-[#CBD5E1] bg-white text-xs text-[#1F2A44] focus:border-[#0D4E8B] outline-none"
              >
                <option value="">كل المواد الدراسية ({taxonomyOptions.subjects.length})</option>
                {taxonomyOptions.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              <select
                value={filters.schoolStageId}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    schoolStageId: e.target.value,
                    schoolGradeId: '',
                    page: 1,
                  }))
                }
                className="px-2.5 py-1.5 rounded-xl border border-[#CBD5E1] bg-white text-xs text-[#1F2A44] focus:border-[#0D4E8B] outline-none"
              >
                <option value="">كل المراحل الدراسية ({taxonomyOptions.stages.length})</option>
                {taxonomyOptions.stages.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>

              <select
                value={filters.schoolGradeId}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, schoolGradeId: e.target.value, page: 1 }))
                }
                className="px-2.5 py-1.5 rounded-xl border border-[#CBD5E1] bg-white text-xs text-[#1F2A44] focus:border-[#0D4E8B] outline-none"
              >
                <option value="">كل الصفوف الدراسية ({taxonomyOptions.grades.length})</option>
                {taxonomyOptions.grades.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>

              <select
                value={filters.schoolCurriculumId}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, schoolCurriculumId: e.target.value, page: 1 }))
                }
                className="px-2.5 py-1.5 rounded-xl border border-[#CBD5E1] bg-white text-xs text-[#1F2A44] focus:border-[#0D4E8B] outline-none"
              >
                <option value="">كل المناهج ({taxonomyOptions.curriculums.length})</option>
                {taxonomyOptions.curriculums.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {(filters.trackFilter === 'all' || filters.trackFilter === 'quran') && (
          <div className="p-3 rounded-xl bg-emerald-50/40 border border-emerald-200/80 space-y-2">
            <span className="text-[11px] font-bold text-emerald-800 block">
              فلاتر القرآن الكريم والتأسيس المعتمدة:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value={filters.quranLevelId}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, quranLevelId: e.target.value, page: 1 }))
                }
                className="px-2.5 py-1.5 rounded-xl border border-emerald-200 bg-white text-xs text-[#1F2A44] focus:border-emerald-600 outline-none"
              >
                <option value="">كل البرامج القرآنية ({taxonomyOptions.quranLevels.length})</option>
                {taxonomyOptions.quranLevels.map((lvl) => (
                  <option key={lvl.id} value={lvl.id}>
                    {lvl.name}
                  </option>
                ))}
              </select>

              <select
                value={filters.quranAgeGroupId}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, quranAgeGroupId: e.target.value, page: 1 }))
                }
                className="px-2.5 py-1.5 rounded-xl border border-emerald-200 bg-white text-xs text-[#1F2A44] focus:border-emerald-600 outline-none"
              >
                <option value="">كل الفئات العمرية ({taxonomyOptions.quranAges.length})</option>
                {taxonomyOptions.quranAges.map((age) => (
                  <option key={age.id} value={age.id}>
                    {age.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Filter Status Bar & Reset Button */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
          <div className="flex flex-wrap items-center gap-2 text-[#64748B]">
            <span>
              نتائج البحث والتصفية:{' '}
              <strong className="text-[#1F2A44] tabular-nums">{filteredList.length}</strong> من أصل{' '}
              <strong className="text-[#1F2A44] tabular-nums">{tutors.length}</strong> معلم
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>إعادة ضبط الفلاتر</span>
              </button>
            )}
          </div>

          {filteredList.length > PAGE_SIZE && (
            <button
              type="button"
              onClick={() =>
                setFilters((prev) => ({ ...prev, showAllPages: !prev.showAllPages, page: 1 }))
              }
              className="text-xs font-bold text-[#0D4E8B] hover:underline cursor-pointer"
            >
              {filters.showAllPages
                ? `تقسيم لصفحات (${PAGE_SIZE} لكل صفحة)`
                : `عرض كل النتائج (${filteredList.length})`}
            </button>
          )}
        </div>
      </div>

      {/* Tutors List */}
      {isLoading ? (
        <div className="bg-white p-12 rounded-2xl border border-[#E2E8F0] text-center space-y-3">
          <div className="w-8 h-8 border-3 border-[#0D4E8B] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs sm:text-sm text-[#64748B] font-medium">
            جاري تحميل قائمة المعلمين وتقييم جاهزية الملفات (6/6)...
          </p>
        </div>
      ) : filteredList.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-[#E2E8F0] text-center space-y-3">
          <p className="text-sm font-bold text-[#1F2A44]">
            لا يوجد معلمون يطابقون معايير البحث أو الفلاتر المحددة
          </p>
          <p className="text-xs text-[#64748B]">
            جرّب تغيير الفلاتر التقاطعية أو اضغط على إعادة ضبط الفلاتر لعرض جميع المعلمين.
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="px-4 py-2 rounded-xl bg-[#0D4E8B] text-white text-xs font-bold cursor-pointer"
            >
              إعادة ضبط الفلاتر
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {displayedList.map(({ tutor, readiness }) => {
              const isBrokenAvatar = Boolean(brokenAvatarMap[tutor.id]);
              const directWhatsAppUrl = tutor.contact.directWhatsAppUrl;

              const schoolSpecs = tutor.activeSpecializations.filter((s) => s.track === 'school');
              const quranSpecs = tutor.activeSpecializations.filter((s) => s.track === 'quran');

              const distinctSubjectNames = Array.from(
                new Set(schoolSpecs.map((s) => s.subjectName).filter(Boolean) as string[])
              );
              const distinctStageNames = Array.from(
                new Set(schoolSpecs.map((s) => s.stageName).filter(Boolean) as string[])
              );
              const distinctQuranNames = Array.from(
                new Set(quranSpecs.map((q) => q.levelName).filter(Boolean) as string[])
              );

              return (
                <div
                  key={tutor.id}
                  className="bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-5 shadow-2xs hover:border-[#CBD5E1] transition-all space-y-4"
                >
                  {/* Top Section: Tutor Identity + Readiness Badge + Primary Actions */}
                  <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                    {/* Right: Avatar & Identity */}
                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                      <div className="relative shrink-0">
                        {tutor.avatarUrl && !isBrokenAvatar ? (
                          <img
                            src={tutor.avatarUrl}
                            alt={tutor.name}
                            onError={() =>
                              setBrokenAvatarMap((prev) => ({ ...prev, [tutor.id]: true }))
                            }
                            className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover border border-[#E2E8F0] bg-slate-50"
                          />
                        ) : (
                          <div
                            className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col items-center justify-center text-amber-700"
                            title={
                              isBrokenAvatar
                                ? 'تعذر تحميل الصورة الشخصية'
                                : 'لا توجد صورة شخصية مرفوعة'
                            }
                          >
                            <User className="w-6 h-6" />
                            <span className="text-[9px] font-bold">
                              {isBrokenAvatar ? 'تالفة' : 'بلا صورة'}
                            </span>
                          </div>
                        )}
                        <span
                          className={`w-3.5 h-3.5 rounded-full border-2 border-white absolute -bottom-1 -left-1 ${
                            tutor.isPublished ? 'bg-emerald-500' : 'bg-slate-400'
                          }`}
                          title={tutor.isPublished ? 'منشور للجمهور' : 'غير منشور للجمهور'}
                        />
                      </div>

                      <div className="space-y-1.5 min-w-0 flex-1">
                        {/* Name + Status Badges */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-[#0D4E8B]">
                            {tutor.honorific}
                          </span>
                          <h3 className="font-['Cairo'] text-base font-bold text-[#1F2A44] truncate">
                            {tutor.name}
                          </h3>

                          {/* Publish Badge */}
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-bold inline-flex items-center gap-1 ${
                              tutor.isPublished
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                tutor.isPublished ? 'bg-emerald-500' : 'bg-slate-400'
                              }`}
                            />
                            {tutor.isPublished ? 'منشور' : 'غير منشور'}
                          </span>

                          {/* Unified 6/6 Readiness Status Badge */}
                          {readiness.evaluationError ? (
                            <span className="px-2.5 py-0.5 rounded-md bg-rose-50 text-rose-800 border border-rose-200 text-[11px] font-bold inline-flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                              <span>تعذر تقييم الجاهزية</span>
                            </span>
                          ) : readiness.overallStatus === 'published_needs_slots' ? (
                            <span className="px-2.5 py-0.5 rounded-md bg-orange-50 text-orange-800 border border-orange-200 text-[11px] font-bold inline-flex items-center gap-1 tabular-nums">
                              <AlertCircle className="w-3.5 h-3.5 text-orange-600" />
                              <span>
                                منشور — يحتاج تحديث المواعيد ({readiness.completedRequirementsCount}/6)
                              </span>
                            </span>
                          ) : readiness.isReadyForInitialPublish ? (
                            <span className="px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold inline-flex items-center gap-1 tabular-nums">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>
                                {tutor.isPublished
                                  ? 'مكتمل ومعتمد (6/6 · 100%)'
                                  : 'جاهز للنشر النهائي (6/6 · 100%)'}
                              </span>
                            </span>
                          ) : readiness.isDataComplete6of6 ? (
                            <span className="px-2.5 py-0.5 rounded-md bg-blue-50 text-[#0D4E8B] border border-blue-200 text-[11px] font-bold inline-flex items-center gap-1 tabular-nums">
                              <ShieldCheck className="w-3.5 h-3.5 text-[#0D4E8B]" />
                              <span>مكتمل البيانات (6/6) — بانتظار اعتماد الجودة</span>
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-bold inline-flex items-center gap-1 tabular-nums">
                              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                              <span>
                                بحاجة لاستكمال ({readiness.completedRequirementsCount}/6 ·{' '}
                                {readiness.completionPercentage}%)
                              </span>
                            </span>
                          )}

                          <span
                            className="text-[11px] text-[#94A3B8] font-mono hidden sm:inline"
                            dir="ltr"
                          >
                            #{tutor.id}
                          </span>
                        </div>

                        {/* Headline */}
                        <p className="text-xs text-[#64748B] line-clamp-1">
                          {tutor.headline || '— لا يوجد عنوان تعريفي قصير —'}
                        </p>

                        {/* Pricing & Separate Slot Counts Row */}
                        <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px]">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[#1F2A44] font-bold tabular-nums">
                            السعر: {tutor.hourlyRateMin}
                            {tutor.hourlyRateMax !== tutor.hourlyRateMin
                              ? ` - ${tutor.hourlyRateMax}`
                              : ''}{' '}
                            {tutor.currency} / {tutor.sessionDurationMinutes} د
                          </span>

                          {/* Separate Trial vs Paid Private Slot Counts */}
                          <span
                            className={`px-2 py-0.5 rounded-md font-bold inline-flex items-center gap-1 tabular-nums ${
                              readiness.validTrialSlotsCount > 0
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            <Calendar className="w-3 h-3" />
                            <span>تجريبي متاح: {readiness.validTrialSlotsCount}</span>
                            {readiness.earliestTrialSlot && (
                              <span className="text-[10px] font-normal opacity-80">
                                (أقرب: {readiness.earliestTrialSlot.slotDate})
                              </span>
                            )}
                          </span>

                          <span
                            className={`px-2 py-0.5 rounded-md font-bold inline-flex items-center gap-1 tabular-nums ${
                              readiness.validPaidPrivateSlotsCount > 0
                                ? 'bg-blue-50 text-[#0D4E8B] border border-blue-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            <Clock className="w-3 h-3" />
                            <span>خاص مدفوع متاح: {readiness.validPaidPrivateSlotsCount}</span>
                            {readiness.earliestPaidPrivateSlot && (
                              <span className="text-[10px] font-normal opacity-80">
                                (أقرب: {readiness.earliestPaidPrivateSlot.slotDate})
                              </span>
                            )}
                          </span>

                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[#64748B] font-bold tabular-nums">
                            تغطية الأيام: {readiness.distinctUpcomingDaysCount} يوم
                          </span>

                          {/* Taxonomy Tags */}
                          {distinctSubjectNames.length > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-[#F0F6FD] text-[#0D4E8B] font-bold inline-flex items-center gap-1">
                              <BookOpen className="w-3 h-3" />
                              <span>
                                {distinctSubjectNames.slice(0, 2).join('، ')}
                                {distinctSubjectNames.length > 2
                                  ? ` +${distinctSubjectNames.length - 2}`
                                  : ''}
                              </span>
                              {distinctStageNames.length > 0 && (
                                <span className="text-[10px] opacity-80">
                                  ({distinctStageNames.join('، ')})
                                </span>
                              )}
                            </span>
                          )}

                          {distinctQuranNames.length > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 font-bold">
                              قرآن: {distinctQuranNames.slice(0, 2).join('، ')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Left: Primary Admin Controls */}
                    <div className="flex flex-wrap items-center gap-2 self-end lg:self-center shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenInspectModal(tutor.id)}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#1F2A44] text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                        title="عرض تفاصيل الجاهزية ومراجعة الجودة الأولية"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-[#0D4E8B]" />
                        <span>تفاصيل الجاهزية</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onPreviewTutor(tutor.id)}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl text-[#64748B] hover:text-[#0D4E8B] hover:bg-[#F0F6FD] border border-[#E2E8F0] text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                        title="معاينة الملف كما يراه ولي الأمر"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>معاينة</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onEditTutor(tutor.id, 'basics')}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl text-[#0D4E8B] bg-[#F0F6FD] hover:bg-[#E2EFFD] text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>تعديل</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (!tutor.isPublished && !readiness.isReadyForInitialPublish) {
                            handleOpenInspectModal(tutor.id);
                            return;
                          }
                          onTogglePublish(tutor.id, tutor.isPublished);
                        }}
                        className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer ${
                          tutor.isPublished
                            ? 'text-slate-600 bg-slate-100 hover:bg-rose-50 hover:text-rose-700'
                            : readiness.isReadyForInitialPublish
                            ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200'
                            : 'text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200'
                        }`}
                        title={
                          tutor.isPublished
                            ? 'إيقاف نشر المعلم وإخفاؤه من العرض العام'
                            : readiness.isReadyForInitialPublish
                            ? 'نشر المعلم في الموقع العام'
                            : 'استكمل البنود الناقصة أو اعتمد الجودة الأولية قبل النشر'
                        }
                      >
                        {tutor.isPublished ? (
                          <>
                            <GlobeLock className="w-3.5 h-3.5" />
                            <span>إيقاف النشر</span>
                          </>
                        ) : (
                          <>
                            <Globe className="w-3.5 h-3.5" />
                            <span>
                              {readiness.isReadyForInitialPublish ? 'نشر الآن' : 'مراجعة ونشر'}
                            </span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Bottom Bar: Missing Items Quick Jump + Admin-Only WhatsApp Actions */}
                  <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
                    {/* Missing Requirements / Readiness Error Banner */}
                    <div className="flex flex-wrap items-center gap-1.5 flex-1">
                      {readiness.evaluationError ? (
                        <div className="flex items-center gap-2 text-rose-700 font-bold">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>
                            {readiness.evaluationErrorMessage ||
                              'تعذر جلب بيانات الجاهزية كاملة.'}
                          </span>
                          <button
                            type="button"
                            onClick={onRefresh}
                            className="px-2.5 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 text-[11px] font-bold cursor-pointer"
                          >
                            إعادة المحاولة
                          </button>
                        </div>
                      ) : readiness.missingRequirements.length > 0 ? (
                        <>
                          <span className="text-[11px] font-bold text-amber-800">
                            البنود الناقصة ({readiness.missingRequirements.length}):
                          </span>
                          {readiness.missingRequirements.map((item) => (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => onEditTutor(tutor.id, item.adminTargetTab)}
                              className="px-2 py-0.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-[11px] font-bold transition-colors cursor-pointer"
                              title={`${item.missingReason || item.statusText} — اضغط لفتح قسم الإصلاح`}
                            >
                              {item.shortLabel} ↗
                            </button>
                          ))}
                        </>
                      ) : !tutor.isPublished &&
                        !readiness.initialQualityReview.isQualityReviewComplete ? (
                        <div className="flex flex-wrap items-center gap-2 text-[#0D4E8B]">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span className="text-[11px] font-bold">
                            البيانات التقنية مكتملة 6/6 — يتبقى تأكيد مراجعة الجودة الأولية (الصورة والسعر) للنشر الأول:
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOpenInspectModal(tutor.id)}
                            className="px-2.5 py-0.5 rounded-lg bg-[#0D4E8B] text-white text-[11px] font-bold cursor-pointer"
                          >
                            اعتماد الجودة الآن
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-emerald-700 font-bold inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>جميع متطلبات الجاهزية الستة مكتملة (6/6)</span>
                        </span>
                      )}
                    </div>

                    {/* Admin-Only WhatsApp Contact Section */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0 bg-[#F8FAFC] px-3 py-1.5 rounded-xl border border-[#E2E8F0]">
                      {tutor.contact.hasValidContact && directWhatsAppUrl ? (
                        <>
                          <div className="text-[11px] text-[#64748B] flex items-center gap-1.5">
                            <span
                              className="font-mono font-bold text-[#1F2A44] tabular-nums"
                              dir="ltr"
                            >
                              {tutor.contact.displayPhone}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-700">
                              {tutor.contact.sourceLabel}
                            </span>
                          </div>

                          <a
                            href={directWhatsAppUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-h-[36px] px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-colors inline-flex items-center gap-1"
                            title="فتح محادثة واتساب مباشرة مع المعلم (للمشرف فقط)"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>فتح واتساب</span>
                          </a>

                          <button
                            type="button"
                            onClick={() => {
                              const draftMessage = buildTutorProfileCompletionWhatsAppDraft({
                                tutorName: tutor.name,
                                honorific: tutor.honorific,
                                evaluation: readiness,
                                portalUrl:
                                  typeof window !== 'undefined'
                                    ? `${window.location.origin}/#tutor-portal`
                                    : '/#tutor-portal',
                              });
                              setWhatsAppModalTutor({
                                tutor,
                                effectiveReadiness: readiness,
                                draftMessage,
                              });
                            }}
                            className="min-h-[36px] px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 text-[11px] font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                            title="تجهيز رسالة واتساب قابلة للتعديل بطلب استكمال بيانات الملف"
                          >
                            <Send className="w-3 h-3" />
                            <span>طلب استكمال الملف</span>
                          </button>
                        </>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] text-rose-700 font-bold inline-flex items-center gap-1">
                            <PhoneOff className="w-3.5 h-3.5" />
                            <span>{tutor.contact.invalidReason || 'لا يوجد رقم واتساب صالح'}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => onEditTutor(tutor.id, 'private')}
                            className="min-h-[34px] px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 text-[11px] font-bold transition-colors cursor-pointer"
                          >
                            استكمال بيانات التواصل
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {!filters.showAllPages && totalPages > 1 && (
            <div className="bg-white p-3.5 rounded-2xl border border-[#E2E8F0] flex items-center justify-between gap-2 text-xs">
              <span className="text-[#64748B] font-bold tabular-nums">
                صفحة {safeCurrentPage} من {totalPages} (إجمالي {filteredList.length} معلم)
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={safeCurrentPage <= 1}
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      page: Math.max(1, safeCurrentPage - 1),
                    }))
                  }
                  className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[#CBD5E1] hover:bg-slate-50 disabled:opacity-40 font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                  <span>السابق</span>
                </button>
                <button
                  type="button"
                  disabled={safeCurrentPage >= totalPages}
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      page: Math.min(totalPages, safeCurrentPage + 1),
                    }))
                  }
                  className="min-h-[38px] px-3 py-1.5 rounded-xl border border-[#CBD5E1] hover:bg-slate-50 disabled:opacity-40 font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>التالي</span>
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: Editable WhatsApp Profile Completion Request */}
      {whatsAppModalTutor && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E2E8F0] max-w-lg w-full p-5 sm:p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-['Cairo'] text-base font-bold text-[#1F2A44]">
                    إرسال رسالة واتساب للمعلم
                  </h3>
                  <p className="text-xs text-[#64748B]">
                    {whatsAppModalTutor.tutor.honorific} {whatsAppModalTutor.tutor.name} ·{' '}
                    <span dir="ltr" className="font-mono">
                      {whatsAppModalTutor.tutor.contact.displayPhone}
                    </span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWhatsAppModalTutor(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {whatsAppModalTutor.effectiveReadiness.missingRequirements.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs space-y-1">
                <span className="font-bold text-amber-900 block">
                  البنود الناقصة المضمّنة في المسودة:
                </span>
                <ul className="list-disc list-inside text-amber-800 space-y-0.5">
                  {whatsAppModalTutor.effectiveReadiness.missingRequirements.map((req) => (
                    <li key={req.key}>
                      {req.title}: {req.missingReason || req.statusText}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#1F2A44]">
                نص الرسالة (يمكنك تعديله قبل فتح واتساب):
              </label>
              <textarea
                rows={7}
                value={whatsAppModalTutor.draftMessage}
                onChange={(e) =>
                  setWhatsAppModalTutor((prev) =>
                    prev ? { ...prev, draftMessage: e.target.value } : null
                  )
                }
                className="w-full p-3 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm text-[#1F2A44] leading-relaxed focus:border-emerald-600 outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setWhatsAppModalTutor(null)}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-[#CBD5E1] text-xs font-bold text-[#64748B] hover:text-[#1F2A44] cursor-pointer"
              >
                إلغاء
              </button>
              {whatsAppModalTutor.tutor.contact.e164Digits && (
                <a
                  href={
                    buildTutorWhatsAppUrl(
                      whatsAppModalTutor.tutor.contact.e164Digits,
                      whatsAppModalTutor.tutor.contact.countryCode,
                      whatsAppModalTutor.draftMessage
                    ) || '#'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setWhatsAppModalTutor(null)}
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 shadow-xs"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>فتح واتساب بالرسالة</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Readiness Checklist (6/6) & Initial Quality Review */}
      {inspectedItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-[#E2E8F0] max-w-2xl w-full p-5 sm:p-6 shadow-xl space-y-5 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-['Cairo'] text-base sm:text-lg font-bold text-[#1F2A44]">
                  تفاصيل جاهزية الملف ومراجعة الجودة: {inspectedItem.tutor.honorific}{' '}
                  {inspectedItem.tutor.name}
                </h3>
                <p className="text-xs text-[#64748B]">
                  الحالة الحالية: {inspectedItem.readiness.statusBadgeLabel} · اكتمال البيانات:{' '}
                  {inspectedItem.readiness.completedRequirementsCount ?? 0}/6 (
                  {inspectedItem.readiness.completionPercentage ?? 0}%)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectModalTutorId(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {qualityFeedback && (
              <div
                className={`p-3.5 rounded-xl border text-xs flex items-start gap-2 ${
                  qualityFeedback.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                {qualityFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                )}
                <span className="whitespace-pre-line leading-relaxed">{qualityFeedback.text}</span>
              </div>
            )}

            {/* 6 Independent Requirements List */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold text-[#1F2A44]">
                أولاً: متطلبات اكتمال البيانات الأساسية (6 متطلبات مستقلة):
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {inspectedItem.readiness.requirements.map((item) => (
                  <div
                    key={item.key}
                    className={`p-3 rounded-xl border text-xs flex flex-col justify-between gap-2 ${
                      item.completed
                        ? 'bg-emerald-50/40 border-emerald-200'
                        : 'bg-amber-50/60 border-amber-200'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-[#1F2A44]">{item.title}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            item.completed
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {item.completed ? 'مكتمل ✓' : 'ناقص'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#64748B] leading-relaxed">
                        {item.completed ? item.statusText : item.missingReason || item.statusText}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const targetTutorId = inspectedItem.tutor.id;
                        setInspectModalTutorId(null);
                        onEditTutor(targetTutorId, item.adminTargetTab);
                      }}
                      className="self-start px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 text-[#0D4E8B] border border-[#CBD5E1] text-[11px] font-bold cursor-pointer"
                    >
                      {item.adminActionLabel} ↗
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Slot Coverage Summary */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-[#1F2A44]">
                  تغطية المواعيد المستقبلية (مقابل سياسة الجاهزية):
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    inspectedItem.readiness.meetsSlotPolicyThresholds
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {inspectedItem.readiness.meetsSlotPolicyThresholds
                    ? 'مستوفٍ لسياسة التغطية'
                    : 'أقل من الحد الموصى به في السياسة'}
                </span>
              </div>
              <p className="text-[11px] text-[#64748B]">
                مواعيد تجريبية متاحة:{' '}
                <strong className="text-[#1F2A44] tabular-nums">
                  {inspectedItem.readiness.validTrialSlotsCount}
                </strong>{' '}
                (الحد الأدنى بالسياسة: {policy.minTrialSlots}) · مواعيد خاصة مدفوعة متاحة:{' '}
                <strong className="text-[#1F2A44] tabular-nums">
                  {inspectedItem.readiness.validPaidPrivateSlotsCount}
                </strong>{' '}
                (الحد الأدنى بالسياسة: {policy.minPaidPrivateSlots}) · تغطية الأيام:{' '}
                <strong className="text-[#1F2A44] tabular-nums">
                  {inspectedItem.readiness.distinctUpcomingDaysCount}
                </strong>{' '}
                يوم (الحد الموصى به: {policy.minDistinctCoverageDays})
              </p>
            </div>

            {/* Initial Human Quality Review Section */}
            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold text-[#1F2A44]">
                    ثانياً: مراجعة الجودة البشرية الأولية (قبل النشر لأول مرة):
                  </h4>
                  <p className="text-[11px] text-[#64748B]">
                    يرتبط الاعتماد بالصورة الحالية وبالسعر الحالي ({inspectedItem.tutor.hourlyRateMin}{' '}
                    - {inspectedItem.tutor.hourlyRateMax} {inspectedItem.tutor.currency} /{' '}
                    {inspectedItem.tutor.sessionDurationMinutes} د).
                  </p>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                    inspectedItem.readiness.initialQualityReview.isQualityReviewComplete
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {inspectedItem.readiness.initialQualityReview.isQualityReviewComplete
                    ? 'معتمد الجودة'
                    : 'يتطلب تأكيد المشرف'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={qrAvatarApproved}
                    onChange={(e) => setQrAvatarApproved(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded text-[#0D4E8B] cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-[#1F2A44] block">
                      تأكيد وضوح وملاءمة الصورة الشخصية
                    </span>
                    <span className="text-[11px] text-[#64748B]">
                      الصورة الحالية حقيقية وواضحة ومناسبة للظهور لأولياء الأمور
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={qrPriceApproved}
                    onChange={(e) => setQrPriceApproved(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded text-[#0D4E8B] cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-[#1F2A44] block">
                      تأكيد ملاءمة سعر الحصة ومدتها
                    </span>
                    <span
                      className={`text-[11px] block ${
                        inspectedItem.readiness.initialQualityReview.indicativePriceGuidance
                          .status === 'within_range'
                          ? 'text-emerald-700'
                          : 'text-amber-700 font-medium'
                      }`}
                    >
                      {
                        inspectedItem.readiness.initialQualityReview.indicativePriceGuidance
                          .summaryText
                      }
                    </span>
                  </div>
                </label>
              </div>

              <input
                type="text"
                value={qrNotes}
                onChange={(e) => setQrNotes(e.target.value)}
                placeholder="ملاحظات مراجعة الجودة الأولية للإدارة (اختياري)..."
                className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] bg-white text-xs"
              />

              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={isSavingQuality}
                  onClick={() => handleSaveQualityFromModal(false)}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {isSavingQuality ? 'جاري الحفظ...' : 'حفظ اعتماد الجودة'}
                </button>

                {!inspectedItem.tutor.isPublished &&
                  inspectedItem.readiness.isDataComplete6of6 &&
                  qrAvatarApproved &&
                  qrPriceApproved && (
                    <button
                      type="button"
                      disabled={isSavingQuality}
                      onClick={() => handleSaveQualityFromModal(true)}
                      className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>اعتماد الجودة ونشر المعلم الآن</span>
                    </button>
                  )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Configurable Readiness Policy & Indicative Price Ranges */}
      {isPolicyModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-[#E2E8F0] max-w-xl w-full p-5 sm:p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="font-['Cairo'] text-base font-bold text-[#1F2A44]">
                  إعدادات سياسة الجاهزية والنطاقات السعرية الاسترشادية
                </h3>
                <p className="text-xs text-[#64748B]">
                  تتحكم هذه القيم في مؤشرات التغطية والنطاقات الاسترشادية لمراجعة تسعير المعلمين
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPolicyModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-[#1F2A44] block">
                  الحد الأدنى للمواعيد التجريبية
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={draftPolicy.minTrialSlots}
                  onChange={(e) =>
                    setDraftPolicy((prev) => ({
                      ...prev,
                      minTrialSlots: Math.max(1, Number(e.target.value) || 1),
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] tabular-nums"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#1F2A44] block">
                  الحد الأدنى للمواعيد الخاصة المدفوعة
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={draftPolicy.minPaidPrivateSlots}
                  onChange={(e) =>
                    setDraftPolicy((prev) => ({
                      ...prev,
                      minPaidPrivateSlots: Math.max(1, Number(e.target.value) || 1),
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] tabular-nums"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#1F2A44] block">
                  تغطية الأيام الموصى بها
                </label>
                <input
                  type="number"
                  min="1"
                  max="14"
                  value={draftPolicy.minDistinctCoverageDays}
                  onChange={(e) =>
                    setDraftPolicy((prev) => ({
                      ...prev,
                      minDistinctCoverageDays: Math.max(1, Number(e.target.value) || 1),
                    }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[#CBD5E1] tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-2.5 pt-2 border-t border-slate-100 text-xs">
              <span className="font-bold text-[#1F2A44] block">
                النطاق السعري الاسترشادي للحصة (توجيهي للمشرف دون منع الأسعار الصحيحة مثل 6$ أو 127):
              </span>
              {(['ج.م', 'ر.س', 'د.إ', '$'] as const).map((curr) => {
                const range = draftPolicy.indicativeRangesByCurrency[curr] || {
                  min: 1,
                  max: 1000,
                };
                return (
                  <div key={curr} className="grid grid-cols-3 items-center gap-2">
                    <span className="font-bold text-[#0D4E8B]">العملة: {curr}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-[#64748B]">من:</span>
                      <input
                        type="number"
                        min="1"
                        value={range.min}
                        onChange={(e) =>
                          setDraftPolicy((prev) => ({
                            ...prev,
                            indicativeRangesByCurrency: {
                              ...prev.indicativeRangesByCurrency,
                              [curr]: {
                                ...range,
                                min: Math.max(1, Number(e.target.value) || 1),
                              },
                            },
                          }))
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg border border-[#CBD5E1] tabular-nums"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-[#64748B]">إلى:</span>
                      <input
                        type="number"
                        min="1"
                        value={range.max}
                        onChange={(e) =>
                          setDraftPolicy((prev) => ({
                            ...prev,
                            indicativeRangesByCurrency: {
                              ...prev.indicativeRangesByCurrency,
                              [curr]: {
                                ...range,
                                max: Math.max(1, Number(e.target.value) || 1),
                              },
                            },
                          }))
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg border border-[#CBD5E1] tabular-nums"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsPolicyModalOpen(false)}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-[#CBD5E1] text-xs font-bold text-[#64748B] cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSavePolicyConfig}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs font-bold cursor-pointer"
              >
                حفظ السياسة وتحديث التقييم
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
