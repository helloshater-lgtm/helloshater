import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BarChart3,
  Users,
  UserCheck,
  FileSpreadsheet,
  BookOpen,
  Layers,
  GraduationCap,
  AlertTriangle,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Award,
  TrendingUp,
  Filter,
  ArrowUpDown,
  X,
  ExternalLink,
  UserPlus,
  BookmarkCheck,
  Sparkles,
  ShieldAlert,
  Info,
  HelpCircle,
  Loader2,
  FolderSearch,
} from 'lucide-react';
import { AdminService } from '../../services/adminService';
import {
  AdminPlatformStatistics,
  AdminSubjectStatItem,
  AdminDetailedSpecializationStatItem,
  AdminQuranProgramStatItem,
  AdminStatisticsDrilldownRequest,
  AdminStatisticsDrilldownResponse,
} from '../../types';

export interface AdminStatisticsViewProps {
  onEditTutor?: (tutorId: string) => void;
  onNavigateTab?: (tab: 'tutors' | 'applications' | 'classes' | 'statistics') => void;
  onSelectTutor?: (tutorId: string) => void;
  onNavigateToApplications?: () => void;
  onNavigateToBookings?: () => void;
}

type SubViewTab = 'subjects' | 'specializations' | 'quran' | 'stages_curricula';
type SortOption =
  | 'display_order'
  | 'tutors_desc'
  | 'tutors_asc'
  | 'applicants_desc'
  | 'subscriptions_desc'
  | 'coverage_asc';

type SubjectQuickFilter =
  | 'all'
  | 'without_tutors'
  | 'with_pending_applicants'
  | 'with_confirmed_subscriptions'
  | 'with_completed_subscriptions'
  | 'with_pending_subscriptions'
  | 'with_cancelled_subscriptions';

type SpecQuickFilter =
  | 'all'
  | 'no_published_tutors'
  | 'has_pending_applicants'
  | 'has_confirmed_subscriptions'
  | 'has_completed_subscriptions'
  | 'has_pending_subscriptions'
  | 'has_cancelled_subscriptions'
  | 'high_demand_low_supply';

interface DrilldownModalTarget {
  title: string;
  subtitle?: string;
  badgeText?: string;
  codeLabel?: string;
  scopeRequest: Omit<AdminStatisticsDrilldownRequest, 'entityType' | 'page' | 'pageSize' | 'statusFilter'>;
  subjectItem?: AdminSubjectStatItem;
  specializationItem?: AdminDetailedSpecializationStatItem;
  quranLevelItem?: AdminQuranProgramStatItem;
  isUnclassifiedMode?: boolean;
}

export const AdminStatisticsView: React.FC<AdminStatisticsViewProps> = ({
  onEditTutor,
  onNavigateTab,
  onSelectTutor,
  onNavigateToApplications,
  onNavigateToBookings,
}) => {
  const [stats, setStats] = useState<AdminPlatformStatistics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Active sub-tab
  const [activeSubTab, setActiveSubTab] = useState<SubViewTab>('subjects');

  // Filters for Subjects Tab
  const [subjectSearch, setSubjectSearch] = useState<string>('');
  const [subjectTrackFilter, setSubjectTrackFilter] = useState<'all' | 'school' | 'quran'>('all');
  const [subjectCategoryFilter, setSubjectCategoryFilter] = useState<string>('all');
  const [subjectQuickFilter, setSubjectQuickFilter] = useState<SubjectQuickFilter>('all');
  const [subjectSort, setSubjectSort] = useState<SortOption>('display_order');
  const [subjectDisplayMode, setSubjectDisplayMode] = useState<'cards' | 'table'>('cards');

  // Filters for Detailed Specializations Tab
  const [specSearch, setSpecSearch] = useState<string>('');
  const [specTrackFilter, setSpecTrackFilter] = useState<'all' | 'school' | 'quran'>('all');
  const [specStageFilter, setSpecStageFilter] = useState<string>('all');
  const [specSubjectFilter, setSpecSubjectFilter] = useState<string>('all');
  const [specCurriculumFilter, setSpecCurriculumFilter] = useState<string>('all');
  const [specQuickFilter, setSpecQuickFilter] = useState<SpecQuickFilter>('all');
  const [specSort, setSpecSort] = useState<SortOption>('subscriptions_desc');

  // Drill-down Modal State
  const [drilldownTarget, setDrilldownTarget] = useState<DrilldownModalTarget | null>(null);
  const [drilldownEntityType, setDrilldownEntityType] = useState<
    'tutors' | 'applicants' | 'subscriptions' | 'unclassified'
  >('tutors');
  const [drilldownStatusFilter, setDrilldownStatusFilter] = useState<string>('all');
  const [drilldownPage, setDrilldownPage] = useState<number>(1);
  const [drilldownLoading, setDrilldownLoading] = useState<boolean>(false);
  const [drilldownError, setDrilldownError] = useState<string | null>(null);
  const [drilldownData, setDrilldownData] = useState<AdminStatisticsDrilldownResponse | null>(null);
  const DRILLDOWN_PAGE_SIZE = 15;

  const handleOpenTutor = useCallback(
    (tutorId: string) => {
      if (onEditTutor) {
        onEditTutor(tutorId);
      } else if (onSelectTutor) {
        onSelectTutor(tutorId);
      }
    },
    [onEditTutor, onSelectTutor]
  );

  const handleOpenApplicationsTab = useCallback(() => {
    if (onNavigateTab) {
      onNavigateTab('applications');
    } else if (onNavigateToApplications) {
      onNavigateToApplications();
    }
  }, [onNavigateTab, onNavigateToApplications]);

  const handleOpenClassesTab = useCallback(() => {
    if (onNavigateTab) {
      onNavigateTab('classes');
    } else if (onNavigateToBookings) {
      onNavigateToBookings();
    }
  }, [onNavigateTab, onNavigateToBookings]);

  const loadStatistics = async (isSilentRefresh = false) => {
    try {
      if (isSilentRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      const data = await AdminService.getPlatformStatistics({ forceRefresh: isSilentRefresh });
      setStats(data);
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء تحميل الإحصائيات');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadStatistics(false);
  }, []);

  // Load paginated drilldown records on demand when modal is open
  const fetchDrilldownRecords = useCallback(
    async (
      target: DrilldownModalTarget,
      entityType: 'tutors' | 'applicants' | 'subscriptions' | 'unclassified',
      statusFilter: string,
      page: number
    ) => {
      try {
        setDrilldownLoading(true);
        setDrilldownError(null);
        const res = await AdminService.getStatisticsDrilldown({
          ...target.scopeRequest,
          entityType,
          statusFilter: statusFilter === 'all' ? undefined : statusFilter,
          page,
          pageSize: DRILLDOWN_PAGE_SIZE,
        });
        setDrilldownData(res);
      } catch (err: any) {
        setDrilldownData(null);
        setDrilldownError(err.message || 'تعذر تحميل السجلات التفصيلية المطلوبة');
      } finally {
        setDrilldownLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!drilldownTarget) {
      setDrilldownData(null);
      setDrilldownError(null);
      return;
    }
    fetchDrilldownRecords(drilldownTarget, drilldownEntityType, drilldownStatusFilter, drilldownPage);
  }, [drilldownTarget, drilldownEntityType, drilldownStatusFilter, drilldownPage, fetchDrilldownRecords]);

  const openSubjectDrilldown = (
    item: AdminSubjectStatItem,
    defaultTab: 'tutors' | 'applicants' | 'subscriptions' = 'tutors'
  ) => {
    setDrilldownEntityType(defaultTab);
    setDrilldownStatusFilter('all');
    setDrilldownPage(1);
    setDrilldownTarget({
      title: item.subjectName,
      subtitle: item.track === 'quran' ? 'المسار القرآني والتأسيس' : getCategoryLabel(item.category),
      badgeText: item.track === 'quran' ? 'مسار القرآن والتأسيس' : getCategoryLabel(item.category),
      codeLabel: item.subjectId,
      scopeRequest:
        item.track === 'quran'
          ? { track: 'quran', subjectId: 'quran_track' }
          : { track: 'school', subjectId: item.subjectId },
      subjectItem: item,
    });
  };

  const openSpecializationDrilldown = (
    spec: AdminDetailedSpecializationStatItem,
    defaultTab: 'tutors' | 'applicants' | 'subscriptions' = 'tutors'
  ) => {
    setDrilldownEntityType(defaultTab);
    setDrilldownStatusFilter('all');
    setDrilldownPage(1);
    setDrilldownTarget({
      title: spec.label,
      subtitle:
        spec.track === 'school'
          ? `${spec.stageName || ''} • ${spec.gradeName || ''} • منهج ${spec.curriculumName || ''}`
          : `${spec.levelName || ''} • ${spec.ageGroupName || ''}`,
      badgeText: spec.track === 'quran' ? 'تخصص قرآني' : 'تخصص دراسي',
      codeLabel: spec.id,
      scopeRequest:
        spec.track === 'school'
          ? { track: 'school', courseOptionId: spec.id }
          : { track: 'quran', quranLevelId: spec.levelId, quranAgeGroupId: spec.ageGroupId },
      specializationItem: spec,
    });
  };

  const openQuranLevelDrilldown = (
    level: AdminQuranProgramStatItem,
    defaultTab: 'tutors' | 'applicants' | 'subscriptions' = 'tutors'
  ) => {
    setDrilldownEntityType(defaultTab);
    setDrilldownStatusFilter('all');
    setDrilldownPage(1);
    setDrilldownTarget({
      title: level.levelName,
      subtitle: level.description,
      badgeText: 'برنامج قرآني',
      codeLabel: level.levelId,
      scopeRequest: { track: 'quran', quranLevelId: level.levelId },
      quranLevelItem: level,
    });
  };

  const openUnclassifiedDrilldown = () => {
    setDrilldownEntityType('unclassified');
    setDrilldownStatusFilter('all');
    setDrilldownPage(1);
    setDrilldownTarget({
      title: 'السجلات غير المصنفة مرجعيًا',
      subtitle:
        'سجلات لا تحتوي على معرّف تخصص مرجعي مباشر ولا تطابق تسمية وحيدة غير غامضة لنفس المعلم',
      badgeText: 'تدقيق البيانات المرجعية',
      codeLabel: 'unclassified',
      scopeRequest: { track: 'all' },
      isUnclassifiedMode: true,
    });
  };

  const dataHealth = stats?.dataHealth || {
    mode: 'rpc' as const,
    rpcMigrationApplied: true,
    isComplete: true,
    tutorsAvailable: true,
    applicationsAvailable: true,
    subscriptionsAvailable: true,
    supplySlotsAvailable: true,
    errors: [],
  };

  const tutorsOk = dataHealth.tutorsAvailable;
  const appsOk = dataHealth.applicationsAvailable;
  const subsOk = dataHealth.subscriptionsAvailable;
  const supplyOk = dataHealth.supplySlotsAvailable;

  const renderMetricValue = (available: boolean, value: number, suffix?: string) => {
    if (!available) {
      return (
        <span
          className="inline-block text-[11px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-md border border-red-200"
          title="بيانات هذا المؤشر غير مكتملة بسبب فشل تحميل المصدر أو عدم تطبيق Migration الإحصائيات"
        >
          بيانات غير مكتملة
        </span>
      );
    }
    return suffix ? `${value} ${suffix}` : String(value);
  };

  // All subjects combined (School Subjects + Quran Track Card)
  const combinedSubjects = useMemo<AdminSubjectStatItem[]>(() => {
    if (!stats) return [];
    return [...stats.subjectsStats, stats.quranSummary];
  }, [stats]);

  // Filtered & Sorted Subjects
  const filteredSubjects = useMemo<AdminSubjectStatItem[]>(() => {
    let list = [...combinedSubjects];

    if (subjectTrackFilter !== 'all') {
      list = list.filter((s) => s.track === subjectTrackFilter);
    }

    if (subjectCategoryFilter !== 'all') {
      list = list.filter((s) => s.category === subjectCategoryFilter);
    }

    if (subjectQuickFilter === 'without_tutors' && tutorsOk) {
      list = list.filter((s) => s.publishedTutors === 0);
    } else if (subjectQuickFilter === 'with_pending_applicants' && appsOk) {
      list = list.filter((s) => s.pendingApplicants > 0);
    } else if (subjectQuickFilter === 'with_confirmed_subscriptions' && subsOk) {
      list = list.filter((s) => s.confirmedSubscriptions > 0);
    } else if (subjectQuickFilter === 'with_completed_subscriptions' && subsOk) {
      list = list.filter((s) => s.completedSubscriptions > 0);
    } else if (subjectQuickFilter === 'with_pending_subscriptions' && subsOk) {
      list = list.filter((s) => s.pendingSubscriptions > 0);
    } else if (subjectQuickFilter === 'with_cancelled_subscriptions' && subsOk) {
      list = list.filter((s) => s.cancelledSubscriptions > 0);
    }

    if (subjectSearch.trim()) {
      const q = subjectSearch.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.subjectName.toLowerCase().includes(q) ||
          (s.englishName && s.englishName.toLowerCase().includes(q)) ||
          s.subjectId.toLowerCase().includes(q) ||
          (s.tutorsList || []).some((t) => t.name.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => {
      if (subjectSort === 'tutors_desc' && tutorsOk) {
        return b.publishedTutors - a.publishedTutors || b.totalTutors - a.totalTutors;
      }
      if (subjectSort === 'tutors_asc' && tutorsOk) {
        return a.publishedTutors - b.publishedTutors || a.totalTutors - b.totalTutors;
      }
      if (subjectSort === 'applicants_desc' && appsOk) {
        return b.pendingApplicants - a.pendingApplicants || b.totalApplicants - a.totalApplicants;
      }
      if (subjectSort === 'subscriptions_desc' && subsOk) {
        return (
          b.confirmedSubscriptions - a.confirmedSubscriptions ||
          b.completedSubscriptions - a.completedSubscriptions ||
          b.pendingSubscriptions - a.pendingSubscriptions
        );
      }
      if (subjectSort === 'coverage_asc' && tutorsOk) {
        const covA =
          a.totalCourseOptionsCount > 0
            ? a.publishedCoveredCourseOptionsCount / a.totalCourseOptionsCount
            : 1;
        const covB =
          b.totalCourseOptionsCount > 0
            ? b.publishedCoveredCourseOptionsCount / b.totalCourseOptionsCount
            : 1;
        return covA - covB;
      }
      return 0;
    });

    return list;
  }, [
    combinedSubjects,
    subjectTrackFilter,
    subjectCategoryFilter,
    subjectQuickFilter,
    subjectSearch,
    subjectSort,
    tutorsOk,
    appsOk,
    subsOk,
  ]);

  // Filtered & Sorted Detailed Specializations
  const filteredSpecializations = useMemo<AdminDetailedSpecializationStatItem[]>(() => {
    if (!stats) return [];
    let list = [...stats.detailedSpecializations];

    if (specTrackFilter !== 'all') {
      list = list.filter((sp) => sp.track === specTrackFilter);
    }

    if (specStageFilter !== 'all') {
      list = list.filter((sp) => sp.stageId === specStageFilter);
    }

    if (specSubjectFilter !== 'all') {
      list = list.filter((sp) => sp.subjectId === specSubjectFilter);
    }

    if (specCurriculumFilter !== 'all') {
      list = list.filter((sp) => sp.curriculumId === specCurriculumFilter);
    }

    if (specQuickFilter === 'no_published_tutors' && tutorsOk) {
      list = list.filter((sp) => sp.publishedTutors === 0);
    } else if (specQuickFilter === 'has_pending_applicants' && appsOk) {
      list = list.filter((sp) => sp.pendingApplicants > 0);
    } else if (specQuickFilter === 'has_confirmed_subscriptions' && subsOk) {
      list = list.filter((sp) => sp.confirmedSubscriptions > 0);
    } else if (specQuickFilter === 'has_completed_subscriptions' && subsOk) {
      list = list.filter((sp) => sp.completedSubscriptions > 0);
    } else if (specQuickFilter === 'has_pending_subscriptions' && subsOk) {
      list = list.filter((sp) => sp.pendingSubscriptions > 0);
    } else if (specQuickFilter === 'has_cancelled_subscriptions' && subsOk) {
      list = list.filter((sp) => sp.cancelledSubscriptions > 0);
    } else if (specQuickFilter === 'high_demand_low_supply' && tutorsOk) {
      list = list.filter(
        (sp) =>
          sp.publishedTutors === 0 &&
          ((appsOk && sp.pendingApplicants > 0) ||
            (subsOk && (sp.confirmedSubscriptions > 0 || sp.pendingSubscriptions > 0)))
      );
    }

    if (specSearch.trim()) {
      const q = specSearch.trim().toLowerCase();
      list = list.filter(
        (sp) =>
          sp.label.toLowerCase().includes(q) ||
          sp.id.toLowerCase().includes(q) ||
          (sp.tutorsList || []).some((t) => t.name.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => {
      if (specSort === 'tutors_desc' && tutorsOk) {
        return b.publishedTutors - a.publishedTutors || b.totalTutors - a.totalTutors;
      }
      if (specSort === 'tutors_asc' && tutorsOk) {
        return a.publishedTutors - b.publishedTutors || a.totalTutors - b.totalTutors;
      }
      if (specSort === 'applicants_desc' && appsOk) {
        return b.pendingApplicants - a.pendingApplicants || b.totalApplicants - a.totalApplicants;
      }
      if (specSort === 'subscriptions_desc' && subsOk) {
        return (
          b.confirmedSubscriptions - a.confirmedSubscriptions ||
          b.completedSubscriptions - a.completedSubscriptions ||
          b.pendingSubscriptions - a.pendingSubscriptions ||
          b.publishedTutors - a.publishedTutors
        );
      }
      return a.label.localeCompare(b.label, 'ar');
    });

    return list;
  }, [
    stats,
    specTrackFilter,
    specStageFilter,
    specSubjectFilter,
    specCurriculumFilter,
    specQuickFilter,
    specSearch,
    specSort,
    tutorsOk,
    appsOk,
    subsOk,
  ]);

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'core':
        return 'مواد أساسية';
      case 'languages':
        return 'لغات';
      case 'sciences':
        return 'علوم';
      case 'social':
        return 'دراسات ومهارات';
      case 'quran':
        return 'مسار القرآن والتأسيس';
      default:
        return cat;
    }
  };

  const getCategoryBadgeStyle = (cat: string) => {
    switch (cat) {
      case 'core':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'languages':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'sciences':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'social':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'quran':
        return 'bg-teal-50 text-teal-800 border-teal-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const formatStudentCount = (value: number | null | undefined): string => {
    if (value === null || value === undefined) {
      return 'غير متاح حاليًا';
    }
    return String(value);
  };

  if (loading && !stats) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-sm">
        <div className="w-12 h-12 border-4 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <h3 className="text-lg font-black text-brand-navy mb-1">جاري تجميع إحصائيات المنصة...</h3>
        <p className="text-sm text-slate-500 font-medium">
          يتم حساب أعداد المعلمين، المتقدمين، والاشتراكات حسب كل مادة وتخصص مرجعي بدقة
        </p>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="bg-red-50 rounded-3xl border border-red-200 p-8 text-center">
        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-3" />
        <h3 className="text-lg font-black text-red-900 mb-2">تعذر تحميل الإحصائيات</h3>
        <p className="text-sm text-red-700 mb-6">{error}</p>
        <button
          onClick={() => loadStatistics(false)}
          className="px-6 py-2.5 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 transition-colors inline-flex items-center gap-2"
        >
          <RefreshCw size={16} />
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (!stats) return null;

  const { overview } = stats;
  const unclassifiedSummary = overview.unclassifiedSummary || {
    unassignedTutorsCount: overview.unassignedTutorsCount || 0,
    unclassifiedTutorOfferingsCount: 0,
    unclassifiedApplicationsCount: 0,
    unclassifiedGroupsCount: 0,
    unclassifiedPrivateSlotsCount: 0,
    unclassifiedPrivateBookingsCount: 0,
    unclassifiedGroupEnrollmentsCount: 0,
    totalUnclassifiedCount: (overview.unassignedTutorsCount || 0) + (overview.unmappedBookingsCount || 0),
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Header & Refresh Bar */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-10 h-10 rounded-2xl bg-brand-blue/10 text-brand-blue flex items-center justify-center">
              <BarChart3 size={22} />
            </div>
            <div>
              <h2 className="text-xl font-black text-brand-navy">مركز إحصائيات المواد والتخصصات</h2>
              <p className="text-xs text-slate-500 font-medium">
                رؤية شاملة لتوزيع المعلمين المعتمدين، طلبات الانضمام، والحجوزات والاشتراكات حسب كل مادة وتخصص مرجعي
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-slate-400 font-medium">
            آخر تحديث: {new Date(stats.generatedAt).toLocaleTimeString('ar-EG')}
          </span>
          <button
            onClick={() => loadStatistics(true)}
            disabled={refreshing}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-brand-navy font-bold text-xs flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin text-brand-blue' : ''} />
            <span>{refreshing ? 'جاري التحديث...' : 'تحديث البيانات'}</span>
          </button>
        </div>
      </div>

      {/* Data Completeness & RPC Migration Alert Banner */}
      {(!dataHealth.isComplete || !dataHealth.rpcMigrationApplied || dataHealth.errors.length > 0) && (
        <div className="bg-red-50/90 rounded-3xl border border-red-200 p-5 shadow-sm space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle size={20} />
            </div>
            <div className="space-y-1 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-black text-red-900">
                  {!dataHealth.isComplete
                    ? 'بيانات غير مكتملة — تم تعطيل المؤشرات المتأثرة لمنع عرض أصفار مضللة'
                    : 'تنبيه: لم يتم تطبيق دالة التجميع المرجعية في قاعدة البيانات (Migration RPC)'}
                </h3>
                {!dataHealth.rpcMigrationApplied && (
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-lg bg-red-100 text-red-800 border border-red-300">
                    Migration غير مطبق
                  </span>
                )}
              </div>
              <p className="text-xs text-red-800 font-medium">
                لا يتم استبدال أي مصدر متعذر بصفر أو تخمين التصنيفات نصيًا. يرجى مراجعة المصادر المتأثرة أدناه أو تطبيق ملف الترقية{' '}
                <code className="font-mono bg-white/80 px-1.5 py-0.5 rounded border border-red-200">
                  011_admin_statistics.sql / 012_admin_statistics_corrections.sql
                </code>
                .
              </p>
              <div className="pt-2 space-y-1.5">
                {dataHealth.errors.map((errItem, i) => (
                  <div
                    key={i}
                    className="bg-white/90 rounded-xl px-3.5 py-2 border border-red-200/80 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                  >
                    <div>
                      <strong className="font-black text-red-900">{errItem.source}:</strong>{' '}
                      <span className="text-red-800 font-medium">{errItem.message}</span>
                    </div>
                    <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md shrink-0">
                      المؤشرات المتأثرة: {errItem.affectedMetrics}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Executive Summary Cards (4 Main Pillars) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Card 1: Approved Tutors */}
        <div
          className={`bg-white rounded-3xl border p-5 shadow-sm relative overflow-hidden ${
            !tutorsOk ? 'border-red-200 opacity-80' : 'border-slate-200'
          }`}
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs font-bold text-slate-500 mb-1">المعلمون المعتمدون بالمنصة</p>
              {tutorsOk ? (
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-brand-navy">{overview.totalTutors}</span>
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                    {overview.publishedTutors} منشور
                  </span>
                </div>
              ) : (
                <div className="mt-1">{renderMetricValue(false, 0)}</div>
              )}
            </div>
            <div className="w-11 h-11 rounded-2xl bg-blue-50 text-brand-blue flex items-center justify-center shrink-0">
              <UserCheck size={22} />
            </div>
          </div>
          <div className="pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-center">
            <div className="bg-slate-50 rounded-xl p-2">
              <div className="text-sm font-black text-brand-navy">
                {tutorsOk ? overview.schoolTutorsCount : '—'}
              </div>
              <div className="text-[10px] font-bold text-slate-500">مناهج دراسية</div>
            </div>
            <div className="bg-teal-50/60 rounded-xl p-2">
              <div className="text-sm font-black text-teal-800">
                {tutorsOk ? overview.quranTutorsCount : '—'}
              </div>
              <div className="text-[10px] font-bold text-teal-700">قرآن وتأسيس</div>
            </div>
            <div className="bg-amber-50/60 rounded-xl p-2">
              <div className="text-sm font-black text-amber-800">
                {tutorsOk ? overview.unpublishedTutors : '—'}
              </div>
              <div className="text-[10px] font-bold text-amber-700">مخفي / غير منشور</div>
            </div>
          </div>
        </div>

        {/* Card 2: Tutor Applications */}
        <div
          className={`bg-white rounded-3xl border p-5 shadow-sm relative overflow-hidden ${
            !appsOk ? 'border-red-200 opacity-80' : 'border-slate-200'
          }`}
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs font-bold text-slate-500 mb-1">طلبات انضمام المعلمين</p>
              {appsOk ? (
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-brand-navy">
                    {overview.totalSubmittedApplications}
                  </span>
                  <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                    {overview.pendingApplications} قيد المراجعة
                  </span>
                </div>
              ) : (
                <div className="mt-1">{renderMetricValue(false, 0)}</div>
              )}
            </div>
            <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <UserPlus size={22} />
            </div>
          </div>
          <div className="pt-3 border-t border-slate-100 grid grid-cols-4 gap-1.5 text-center">
            <div className="bg-amber-50/70 rounded-xl p-1.5" title="طلبات مقدمة (submitted)">
              <div className="text-xs font-black text-amber-800">
                {appsOk ? overview.submittedOnlyApplications : '—'}
              </div>
              <div className="text-[10px] font-bold text-amber-700">قيد المراجعة</div>
            </div>
            <div className="bg-orange-50/70 rounded-xl p-1.5" title="مطلوب استكمال بياناتها (needs_info)">
              <div className="text-xs font-black text-orange-800">
                {appsOk ? overview.needsInfoApplications : '—'}
              </div>
              <div className="text-[10px] font-bold text-orange-700">استكمال بيانات</div>
            </div>
            <div className="bg-emerald-50/70 rounded-xl p-1.5" title="طلبات مقبولة (approved)">
              <div className="text-xs font-black text-emerald-800">
                {appsOk ? overview.approvedApplications : '—'}
              </div>
              <div className="text-[10px] font-bold text-emerald-700">مقبول</div>
            </div>
            <div className="bg-slate-50 rounded-xl p-1.5" title="مسودات طلبات الانضمام (draft)">
              <div className="text-xs font-black text-slate-600">
                {appsOk ? overview.draftApplications : '—'}
              </div>
              <div className="text-[10px] font-bold text-slate-500">مسودة</div>
            </div>
          </div>
        </div>

        {/* Card 3: Subscriptions & Bookings (Strictly Separated: المؤكد، المكتمل، قيد الانتظار، الملغي) */}
        <div
          className={`bg-white rounded-3xl border p-5 shadow-sm relative overflow-hidden ${
            !subsOk ? 'border-red-200 opacity-80' : 'border-slate-200'
          }`}
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs font-bold text-slate-500 mb-1">الاشتراكات والحجوزات</p>
              {subsOk ? (
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-3xl font-black text-brand-navy">
                    {overview.confirmedSubscriptions}
                  </span>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                    مؤكد ({overview.confirmedPrivateBookings} خاص • {overview.confirmedGroupEnrollments} مجموعات)
                  </span>
                </div>
              ) : (
                <div className="mt-1">{renderMetricValue(false, 0)}</div>
              )}
            </div>
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <BookmarkCheck size={22} />
            </div>
          </div>
          <div className="pt-3 border-t border-slate-100 grid grid-cols-4 gap-1.5 text-center">
            <div className="bg-emerald-50/60 rounded-xl p-1.5" title="حجوزات واشتراكات مؤكدة (confirmed)">
              <div className="text-xs font-black text-emerald-900">
                {subsOk ? overview.confirmedSubscriptions : '—'}
              </div>
              <div className="text-[10px] font-bold text-emerald-700">مؤكد</div>
            </div>
            <div className="bg-blue-50/60 rounded-xl p-1.5" title="حجوزات واشتراكات مكتملة (completed)">
              <div className="text-xs font-black text-blue-900">
                {subsOk ? overview.completedSubscriptions : '—'}
              </div>
              <div className="text-[10px] font-bold text-blue-700">مكتمل</div>
            </div>
            <div className="bg-amber-50/60 rounded-xl p-1.5" title="حجوزات واشتراكات قيد الانتظار (pending)">
              <div className="text-xs font-black text-amber-800">
                {subsOk ? overview.pendingSubscriptions : '—'}
              </div>
              <div className="text-[10px] font-bold text-amber-700">قيد الانتظار</div>
            </div>
            <div className="bg-red-50/60 rounded-xl p-1.5" title="حجوزات واشتراكات ملغاة (cancelled)">
              <div className="text-xs font-black text-red-800">
                {subsOk ? overview.cancelledSubscriptions : '—'}
              </div>
              <div className="text-[10px] font-bold text-red-700">ملغي</div>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-500 font-bold flex items-center gap-1">
              <HelpCircle size={12} className="text-slate-400" />
              الطلاب الفريدون:
            </span>
            <span
              className="font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md"
              title={
                overview.uniqueStudentsUnavailableReason ||
                'لا يتوفر معرّف طالب ثابت وموثوق في جداول الحجوزات؛ لا يتم استنتاج الهوية من الاسم أو الهاتف'
              }
            >
              {formatStudentCount(overview.uniqueConfirmedStudents)}
            </span>
          </div>
        </div>

        {/* Card 4: Coverage & Supply Health */}
        <div
          className={`bg-white rounded-3xl border p-5 shadow-sm relative overflow-hidden ${
            !supplyOk ? 'border-red-200 opacity-80' : 'border-slate-200'
          }`}
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs font-bold text-slate-500 mb-1">الجاهزية وتغطية المواد</p>
              {supplyOk ? (
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-brand-navy">{overview.activeGroupsCount}</span>
                  <span className="text-xs font-bold text-brand-blue bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                    مجموعة منشورة متاحة
                  </span>
                </div>
              ) : (
                <div className="mt-1">{renderMetricValue(false, 0)}</div>
              )}
            </div>
            <div className="w-11 h-11 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <TrendingUp size={22} />
            </div>
          </div>
          <div className="pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-center">
            <div className="bg-slate-50 rounded-xl p-2">
              <div className="text-sm font-black text-brand-navy">
                {supplyOk ? overview.availablePrivateSlotsCount : '—'}
              </div>
              <div className="text-[10px] font-bold text-slate-500">موعد خاص متاح</div>
            </div>
            <div className="bg-slate-50 rounded-xl p-2">
              <div className="text-sm font-black text-brand-navy">
                {supplyOk ? overview.availableTrialSlotsCount : '—'}
              </div>
              <div className="text-[10px] font-bold text-slate-500">موعد تجريبي</div>
            </div>
            <div
              className={`rounded-xl p-2 ${
                tutorsOk && overview.subjectsWithoutPublishedTutors > 0
                  ? 'bg-red-50/80'
                  : 'bg-emerald-50/80'
              }`}
            >
              <div
                className={`text-sm font-black ${
                  tutorsOk && overview.subjectsWithoutPublishedTutors > 0
                    ? 'text-red-700'
                    : 'text-emerald-700'
                }`}
              >
                {tutorsOk ? overview.subjectsWithoutPublishedTutors : '—'}
              </div>
              <div
                className={`text-[10px] font-bold ${
                  tutorsOk && overview.subjectsWithoutPublishedTutors > 0
                    ? 'text-red-600'
                    : 'text-emerald-600'
                }`}
              >
                مواد بلا معلم
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Student Identity & Reference Classification Notice */}
      {!overview.uniqueStudentsAvailable && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <Info size={16} className="text-brand-blue shrink-0" />
            <span>
              <strong className="font-black text-brand-navy">ملاحظة حول مؤشر الطلاب الفريدين:</strong>{' '}
              {overview.uniqueStudentsUnavailableReason ||
                'غير متاح حاليًا لعدم وجود معرف هوية طالب ثابت وموثوق مرتبط بالسجلات؛ تُعرض أعداد حجوزات الخاص واشتراكات المجموعات بأسمائها الصحيحة دون استنتاج الهوية من الاسم أو الهاتف.'}
            </span>
          </div>
          {subsOk && (
            <div className="flex flex-wrap items-center gap-2 shrink-0 text-[11px] font-bold text-slate-600">
              <span>مؤكد: {overview.confirmedSubscriptions}</span>
              <span>•</span>
              <span>مكتمل: {overview.completedSubscriptions}</span>
              <span>•</span>
              <span>قيد الانتظار: {overview.pendingSubscriptions}</span>
              <span>•</span>
              <span>ملغي: {overview.cancelledSubscriptions}</span>
            </div>
          )}
        </div>
      )}

      {/* Actionable Insights Banner (Supply Gaps, Pending Applicants, or Unclassified Records) */}
      {((tutorsOk && overview.subjectsWithoutPublishedTutors > 0) ||
        (appsOk && overview.subjectsWithPendingApplicants > 0) ||
        unclassifiedSummary.totalUnclassifiedCount > 0) && (
        <div className="bg-gradient-to-l from-amber-50/90 via-white to-blue-50/60 rounded-3xl border border-amber-200/80 p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
              <ShieldAlert size={20} />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-black text-brand-navy">تنبيهات التغطية وتدقيق البيانات المرجعية</h3>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 font-medium">
                {tutorsOk && overview.subjectsWithoutPublishedTutors > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-red-700 font-bold">
                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                    يوجد {overview.subjectsWithoutPublishedTutors} مواد رئيسية ليس بها أي معلم منشور (و{' '}
                    {overview.specializationsWithoutPublishedTutors} تخصص فرعي غير مغطى).
                  </span>
                )}
                {appsOk && overview.subjectsWithPendingApplicants > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-amber-800 font-bold">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    يوجد {overview.pendingApplications} طلب انضمام معلم قيد المراجعة أو استكمال البيانات موزعة على{' '}
                    {overview.subjectsWithPendingApplicants} مواد.
                  </span>
                )}
                {unclassifiedSummary.totalUnclassifiedCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-slate-700 font-bold">
                    <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                    سجلات غير مصنفة مرجعيًا: {unclassifiedSummary.unassignedTutorsCount} معلم بلا تخصص،{' '}
                    {unclassifiedSummary.unclassifiedApplicationsCount} طلب انضمام، و{' '}
                    {unclassifiedSummary.unclassifiedPrivateBookingsCount +
                      unclassifiedSummary.unclassifiedGroupEnrollmentsCount}{' '}
                    حجز/اشتراك غير مربوط بمعرف تخصص مرجعي.
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {tutorsOk && overview.subjectsWithoutPublishedTutors > 0 && (
              <button
                onClick={() => {
                  setActiveSubTab('subjects');
                  setSubjectQuickFilter('without_tutors');
                }}
                className="px-3.5 py-2 rounded-xl bg-red-100 hover:bg-red-200 text-red-800 font-bold text-xs transition-colors"
              >
                عرض المواد غير المغطاة ({overview.subjectsWithoutPublishedTutors})
              </button>
            )}
            {appsOk && overview.pendingApplications > 0 && (onNavigateTab || onNavigateToApplications) && (
              <button
                onClick={handleOpenApplicationsTab}
                className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-colors inline-flex items-center gap-1.5"
              >
                <span>مراجعة طلبات الانضمام ({overview.pendingApplications})</span>
                <ExternalLink size={13} />
              </button>
            )}
            {unclassifiedSummary.totalUnclassifiedCount > 0 && (
              <button
                onClick={openUnclassifiedDrilldown}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs transition-colors inline-flex items-center gap-1.5"
              >
                <FolderSearch size={14} />
                <span>فحص السجلات غير المصنفة ({unclassifiedSummary.totalUnclassifiedCount})</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Sub-navigation Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 p-1.5 flex flex-wrap gap-1.5 shadow-sm">
        <button
          onClick={() => setActiveSubTab('subjects')}
          className={`flex-1 min-w-[170px] py-3 px-4 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
            activeSubTab === 'subjects'
              ? 'bg-brand-navy text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <BookOpen size={17} />
          <span>إحصائيات المواد الرئيسية</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] ${
              activeSubTab === 'subjects' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {combinedSubjects.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('specializations')}
          className={`flex-1 min-w-[190px] py-3 px-4 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
            activeSubTab === 'specializations'
              ? 'bg-brand-navy text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Layers size={17} />
          <span>التخصصات الدقيقة (صف + مادة + منهج)</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] ${
              activeSubTab === 'specializations' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {stats.detailedSpecializations.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('quran')}
          className={`flex-1 min-w-[170px] py-3 px-4 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
            activeSubTab === 'quran'
              ? 'bg-teal-800 text-white shadow-sm'
              : 'text-slate-600 hover:bg-teal-50/50 hover:text-teal-800'
          }`}
        >
          <Sparkles size={17} />
          <span>تفصيل المسار القرآني والتأسيس</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] ${
              activeSubTab === 'quran' ? 'bg-white/20 text-white' : 'bg-teal-50 text-teal-700'
            }`}
          >
            {stats.quranLevelsStats.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('stages_curricula')}
          className={`flex-1 min-w-[170px] py-3 px-4 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
            activeSubTab === 'stages_curricula'
              ? 'bg-brand-navy text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <GraduationCap size={17} />
          <span>المراحل الدراسية والمناهج</span>
        </button>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: SUBJECTS OVERVIEW (CARDS & TABLE)                              */}
      {/* ===================================================================== */}
      {activeSubTab === 'subjects' && (
        <div className="space-y-5">
          {/* Filters Toolbar */}
          <div className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 shadow-sm space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              {/* Search */}
              <div className="md:col-span-4 relative">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={subjectSearch}
                  onChange={(e) => setSubjectSearch(e.target.value)}
                  placeholder="ابحث باسم المادة أو اسم المعلم..."
                  className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-brand-navy focus:outline-none focus:border-brand-blue"
                />
                {subjectSearch && (
                  <button
                    onClick={() => setSubjectSearch('')}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Track Filter */}
              <div className="md:col-span-2">
                <select
                  value={subjectTrackFilter}
                  onChange={(e) => setSubjectTrackFilter(e.target.value as any)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-brand-navy bg-white focus:outline-none focus:border-brand-blue"
                >
                  <option value="all">كل المسارات</option>
                  <option value="school">المواد الدراسية</option>
                  <option value="quran">القرآن والتأسيس</option>
                </select>
              </div>

              {/* Category Filter */}
              <div className="md:col-span-2">
                <select
                  value={subjectCategoryFilter}
                  onChange={(e) => setSubjectCategoryFilter(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-brand-navy bg-white focus:outline-none focus:border-brand-blue"
                >
                  <option value="all">كل التصنيفات</option>
                  <option value="core">مواد أساسية</option>
                  <option value="languages">لغات</option>
                  <option value="sciences">علوم</option>
                  <option value="social">دراسات ومهارات</option>
                  <option value="quran">القرآن والتأسيس</option>
                </select>
              </div>

              {/* Sort */}
              <div className="md:col-span-2">
                <select
                  value={subjectSort}
                  onChange={(e) => setSubjectSort(e.target.value as SortOption)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-brand-navy bg-white focus:outline-none focus:border-brand-blue"
                >
                  <option value="display_order">الترتيب الافتراضي</option>
                  <option value="tutors_desc" disabled={!tutorsOk}>
                    الأكثر معلمين منشورين
                  </option>
                  <option value="tutors_asc" disabled={!tutorsOk}>
                    الأقل معلمين (نقص التغطية)
                  </option>
                  <option value="applicants_desc" disabled={!appsOk}>
                    الأكثر متقدمين قيد المراجعة
                  </option>
                  <option value="subscriptions_desc" disabled={!subsOk}>
                    الأعلى اشتراكات مؤكدة
                  </option>
                  <option value="coverage_asc" disabled={!tutorsOk}>
                    الأقل نسبة تغطية للصفوف
                  </option>
                </select>
              </div>

              {/* Display Mode Toggle */}
              <div className="md:col-span-2 flex bg-slate-100 p-1 rounded-xl">
                <button
                  onClick={() => setSubjectDisplayMode('cards')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    subjectDisplayMode === 'cards' ? 'bg-white text-brand-navy shadow-sm' : 'text-slate-500'
                  }`}
                >
                  بطاقات
                </button>
                <button
                  onClick={() => setSubjectDisplayMode('table')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    subjectDisplayMode === 'table' ? 'bg-white text-brand-navy shadow-sm' : 'text-slate-500'
                  }`}
                >
                  جدول شامل
                </button>
              </div>
            </div>

            {/* Quick Filter Chips */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-400 ml-1 inline-flex items-center gap-1">
                  <Filter size={13} />
                  فلترة سريعة:
                </span>
                <button
                  onClick={() => setSubjectQuickFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    subjectQuickFilter === 'all'
                      ? 'bg-brand-navy text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  الكل ({combinedSubjects.length})
                </button>
                <button
                  onClick={() => setSubjectQuickFilter('without_tutors')}
                  disabled={!tutorsOk}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40 ${
                    subjectQuickFilter === 'without_tutors'
                      ? 'bg-red-600 text-white'
                      : 'bg-red-50 text-red-700 hover:bg-red-100'
                  }`}
                >
                  مواد بدون معلم منشور (
                  {tutorsOk ? combinedSubjects.filter((s) => s.publishedTutors === 0).length : '—'})
                </button>
                <button
                  onClick={() => setSubjectQuickFilter('with_pending_applicants')}
                  disabled={!appsOk}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40 ${
                    subjectQuickFilter === 'with_pending_applicants'
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                  }`}
                >
                  مواد عليها متقدمون قيد المراجعة (
                  {appsOk ? combinedSubjects.filter((s) => s.pendingApplicants > 0).length : '—'})
                </button>
                <button
                  onClick={() => setSubjectQuickFilter('with_confirmed_subscriptions')}
                  disabled={!subsOk}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40 ${
                    subjectQuickFilter === 'with_confirmed_subscriptions'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  }`}
                >
                  بها اشتراكات مؤكدة (
                  {subsOk ? combinedSubjects.filter((s) => s.confirmedSubscriptions > 0).length : '—'})
                </button>
                <button
                  onClick={() => setSubjectQuickFilter('with_completed_subscriptions')}
                  disabled={!subsOk}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40 ${
                    subjectQuickFilter === 'with_completed_subscriptions'
                      ? 'bg-blue-600 text-white'
                      : 'bg-blue-50 text-blue-800 hover:bg-blue-100'
                  }`}
                >
                  بها اشتراكات مكتملة (
                  {subsOk ? combinedSubjects.filter((s) => s.completedSubscriptions > 0).length : '—'})
                </button>
                <button
                  onClick={() => setSubjectQuickFilter('with_pending_subscriptions')}
                  disabled={!subsOk}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40 ${
                    subjectQuickFilter === 'with_pending_subscriptions'
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                  }`}
                >
                  بها اشتراكات قيد الانتظار (
                  {subsOk ? combinedSubjects.filter((s) => s.pendingSubscriptions > 0).length : '—'})
                </button>
                <button
                  onClick={() => setSubjectQuickFilter('with_cancelled_subscriptions')}
                  disabled={!subsOk}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40 ${
                    subjectQuickFilter === 'with_cancelled_subscriptions'
                      ? 'bg-slate-700 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  بها اشتراكات ملغاة (
                  {subsOk ? combinedSubjects.filter((s) => s.cancelledSubscriptions > 0).length : '—'})
                </button>
              </div>

              <div className="text-xs font-bold text-slate-500">
                النتائج المعروضة: <span className="text-brand-navy font-black">{filteredSubjects.length}</span> مادة
              </div>
            </div>
          </div>

          {filteredSubjects.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center">
              <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-base font-black text-brand-navy mb-1">لا توجد مواد مطابقة للفلتر المحدد</p>
              <p className="text-xs text-slate-500 mb-4">جرّب تغيير شروط البحث أو إعادة ضبط الفلاتر</p>
              <button
                onClick={() => {
                  setSubjectSearch('');
                  setSubjectTrackFilter('all');
                  setSubjectCategoryFilter('all');
                  setSubjectQuickFilter('all');
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-brand-navy rounded-xl text-xs font-bold"
              >
                إعادة ضبط الفلاتر
              </button>
            </div>
          ) : subjectDisplayMode === 'cards' ? (
            /* Cards Grid View */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredSubjects.map((sub) => {
                const coveragePct =
                  tutorsOk && sub.totalCourseOptionsCount > 0
                    ? Math.round((sub.publishedCoveredCourseOptionsCount / sub.totalCourseOptionsCount) * 100)
                    : 0;
                const tutorsList = sub.tutorsList || [];

                return (
                  <div
                    key={sub.subjectId}
                    className={`bg-white rounded-3xl border p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between ${
                      sub.track === 'quran'
                        ? 'border-teal-200 bg-gradient-to-b from-teal-50/30 to-white'
                        : tutorsOk && sub.publishedTutors === 0
                        ? 'border-red-200/80'
                        : 'border-slate-200'
                    }`}
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-2 mb-4">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span
                              className={`text-[10px] font-bold px-2.5 py-0.5 rounded-lg border ${getCategoryBadgeStyle(
                                sub.category
                              )}`}
                            >
                              {getCategoryLabel(sub.category)}
                            </span>
                            {sub.isActive === false && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 border border-slate-300">
                                غير نشط
                              </span>
                            )}
                            {tutorsOk && sub.publishedTutors === 0 && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-red-50 text-red-700 border border-red-200">
                                غير مغطاة بمعلم منشور
                              </span>
                            )}
                          </div>
                          <h3 className="text-base font-black text-brand-navy">{sub.subjectName}</h3>
                          {sub.englishName && (
                            <p className="text-[11px] font-semibold text-slate-400">{sub.englishName}</p>
                          )}
                        </div>

                        <button
                          onClick={() => openSubjectDrilldown(sub, 'tutors')}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-brand-navy hover:text-white text-brand-navy text-xs font-bold transition-colors flex items-center gap-1 shrink-0"
                        >
                          <span>التفاصيل</span>
                          <ChevronLeft size={14} />
                        </button>
                      </div>

                      {/* 3 Pillars Grid inside Subject Card */}
                      <div className="grid grid-cols-3 gap-2.5 mb-4">
                        {/* Pillar 1: Approved Tutors */}
                        <div className="bg-slate-50/90 rounded-2xl p-3 border border-slate-100">
                          <div className="flex items-center justify-between text-slate-400 mb-1">
                            <span className="text-[10px] font-bold text-slate-500">المعلمون</span>
                            <UserCheck size={13} className="text-brand-blue" />
                          </div>
                          {tutorsOk ? (
                            <>
                              <div className="text-xl font-black text-brand-navy">{sub.publishedTutors}</div>
                              <div className="text-[10px] font-bold text-slate-500 mt-0.5">
                                منشور (المعتمد {sub.totalTutors})
                              </div>
                              {sub.unpublishedTutors > 0 && (
                                <div className="text-[10px] font-bold text-amber-700 mt-0.5">
                                  +{sub.unpublishedTutors} مخفي
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="mt-1">{renderMetricValue(false, 0)}</div>
                          )}
                        </div>

                        {/* Pillar 2: Applicants */}
                        <div className="bg-amber-50/50 rounded-2xl p-3 border border-amber-100/80">
                          <div className="flex items-center justify-between text-amber-600 mb-1">
                            <span className="text-[10px] font-bold text-amber-800">المتقدمون</span>
                            <UserPlus size={13} />
                          </div>
                          {appsOk ? (
                            <>
                              <div className="text-xl font-black text-amber-900">
                                {sub.submittedApplicants}
                              </div>
                              <div className="text-[10px] font-bold text-amber-700 mt-0.5">
                                قيد المراجعة (استكمال: {sub.needsInfoApplicants})
                              </div>
                              <div className="text-[10px] font-bold text-slate-500 mt-0.5">
                                إجمالي: {sub.totalApplicants}
                              </div>
                            </>
                          ) : (
                            <div className="mt-1">{renderMetricValue(false, 0)}</div>
                          )}
                        </div>

                        {/* Pillar 3: Subscriptions (Separated by Status) */}
                        <div className="bg-emerald-50/50 rounded-2xl p-3 border border-emerald-100/80">
                          <div className="flex items-center justify-between text-emerald-600 mb-1">
                            <span className="text-[10px] font-bold text-emerald-800">الاشتراكات</span>
                            <BookmarkCheck size={13} />
                          </div>
                          {subsOk ? (
                            <>
                              <div className="text-xl font-black text-emerald-900">
                                {sub.confirmedSubscriptions}
                              </div>
                              <div className="text-[10px] font-bold text-emerald-700 mt-0.5">
                                مؤكد • مكتمل: {sub.completedSubscriptions}
                              </div>
                              <div className="text-[10px] font-bold text-slate-600 mt-0.5">
                                انتظار: {sub.pendingSubscriptions} • ملغي: {sub.cancelledSubscriptions}
                              </div>
                            </>
                          ) : (
                            <div className="mt-1">{renderMetricValue(false, 0)}</div>
                          )}
                        </div>
                      </div>

                      {/* Subscription Breakdown Bar (Private vs Group & Supply) */}
                      <div className="bg-slate-50 rounded-2xl px-3.5 py-2.5 mb-3 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-slate-600">
                        {subsOk ? (
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span>
                              خاص مؤكد:{' '}
                              <strong className="text-brand-navy">{sub.confirmedPrivateBookings}</strong>
                              <span className="text-slate-500 text-[10px]">
                                {' '}
                                (مكتمل {sub.completedPrivateBookings} • انتظار {sub.pendingPrivateBookings} • ملغي{' '}
                                {sub.cancelledPrivateBookings})
                              </span>
                            </span>
                            <span className="text-slate-300">|</span>
                            <span>
                              مجموعات مؤكدة:{' '}
                              <strong className="text-brand-navy">{sub.confirmedGroupEnrollments}</strong>
                              <span className="text-slate-500 text-[10px]">
                                {' '}
                                (مكتمل {sub.completedGroupEnrollments} • انتظار {sub.pendingGroupEnrollments} • ملغي{' '}
                                {sub.cancelledGroupEnrollments})
                              </span>
                            </span>
                          </div>
                        ) : (
                          <span>الاشتراكات والحجوزات: {renderMetricValue(false, 0)}</span>
                        )}
                        <div className="flex items-center gap-2 text-[10px] text-slate-500">
                          <span>{supplyOk ? `${sub.activeGroupsCount} مجموعة متاحة` : 'مجموعات: غير مكتمل'}</span>
                          <span>•</span>
                          <span>{supplyOk ? `${sub.availablePrivateSlotsCount} موعد متاح` : 'مواعيد: غير مكتمل'}</span>
                        </div>
                      </div>

                      {/* Course Options Coverage Progress */}
                      {tutorsOk && (
                        <div className="mb-3">
                          <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                            <span className="text-slate-500">تغطية التخصصات الفرعية بمعلمين منشورين</span>
                            <span className="text-brand-navy">
                              {sub.publishedCoveredCourseOptionsCount} من {sub.totalCourseOptionsCount} ({coveragePct}%)
                            </span>
                          </div>
                          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                coveragePct === 0
                                  ? 'bg-red-400'
                                  : coveragePct < 50
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.max(coveragePct, coveragePct > 0 ? 6 : 0)}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Tutors Pills Preview */}
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      {!tutorsOk ? (
                        <span className="text-[11px] font-bold text-red-700">
                          بيانات المعلمين غير مكتملة
                        </span>
                      ) : tutorsList.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {tutorsList.slice(0, 3).map((t) => (
                            <button
                              key={t.id}
                              onClick={() => handleOpenTutor(t.id)}
                              className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors inline-flex items-center gap-1 ${
                                t.isPublished
                                  ? 'bg-white border-slate-200 text-brand-navy hover:border-brand-blue'
                                  : 'bg-slate-50 border-dashed border-slate-300 text-slate-500'
                              }`}
                              title={t.isPublished ? 'معلم منشور - اضغط لفتح ملفه' : 'معلم غير منشور'}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  t.isPublished ? 'bg-emerald-500' : 'bg-amber-400'
                                }`}
                              />
                              <span>
                                {t.honorific} {t.name}
                              </span>
                            </button>
                          ))}
                          {tutorsList.length > 3 && (
                            <button
                              onClick={() => openSubjectDrilldown(sub, 'tutors')}
                              className="text-[11px] font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
                            >
                              +{tutorsList.length - 3} آخرين
                            </button>
                          )}
                        </div>
                      ) : sub.totalTutors > 0 ? (
                        <button
                          onClick={() => openSubjectDrilldown(sub, 'tutors')}
                          className="text-[11px] font-bold text-brand-blue hover:underline flex items-center gap-1"
                        >
                          <span>استعراض قائمة المعلمين ({sub.totalTutors})</span>
                          <ChevronLeft size={13} />
                        </button>
                      ) : (
                        <span className="text-[11px] font-bold text-red-600 flex items-center gap-1">
                          <AlertTriangle size={13} />
                          لا يوجد معلمون مسجلون في هذه المادة بعد
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Comprehensive Table View */
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-600">
                      <th className="py-3.5 px-4">المادة / المسار</th>
                      <th className="py-3.5 px-3 text-center">المعلمون المنشورون</th>
                      <th className="py-3.5 px-3 text-center">المعلمون المعتمدون</th>
                      <th className="py-3.5 px-3 text-center">متقدمون قيد المراجعة</th>
                      <th className="py-3.5 px-3 text-center">مطلوب استكمال بيانات</th>
                      <th className="py-3.5 px-3 text-center">مؤكد (خاص / مجموعات)</th>
                      <th className="py-3.5 px-3 text-center">مكتمل</th>
                      <th className="py-3.5 px-3 text-center">قيد الانتظار</th>
                      <th className="py-3.5 px-3 text-center">ملغي</th>
                      <th className="py-3.5 px-4 text-center">إجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredSubjects.map((sub) => (
                      <tr key={sub.subjectId} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-black text-brand-navy flex items-center gap-1.5">
                            <span>{sub.subjectName}</span>
                            {sub.isActive === false && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                                غير نشط
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-bold text-slate-400">{getCategoryLabel(sub.category)}</div>
                        </td>
                        <td className="py-3.5 px-3 text-center">
                          {tutorsOk ? (
                            <span
                              className={`inline-flex items-center justify-center px-2.5 py-1 rounded-lg font-black ${
                                sub.publishedTutors > 0
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-red-50 text-red-700'
                              }`}
                            >
                              {sub.publishedTutors}
                            </span>
                          ) : (
                            renderMetricValue(false, 0)
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-center font-bold text-slate-700">
                          {tutorsOk ? (
                            <>
                              {sub.totalTutors}
                              {sub.unpublishedTutors > 0 && (
                                <span className="block text-[10px] text-amber-600">
                                  ({sub.unpublishedTutors} مخفي)
                                </span>
                              )}
                            </>
                          ) : (
                            renderMetricValue(false, 0)
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-center">
                          {appsOk ? (
                            <span
                              className={`inline-flex items-center justify-center px-2.5 py-1 rounded-lg font-black ${
                                sub.submittedApplicants > 0
                                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                  : 'text-slate-400'
                              }`}
                            >
                              {sub.submittedApplicants}
                            </span>
                          ) : (
                            renderMetricValue(false, 0)
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-center font-bold text-orange-700">
                          {appsOk ? sub.needsInfoApplicants : renderMetricValue(false, 0)}
                        </td>
                        <td className="py-3.5 px-3 text-center">
                          {subsOk ? (
                            <div>
                              <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg font-black bg-emerald-50 text-emerald-800">
                                {sub.confirmedSubscriptions}
                              </span>
                              <span className="block text-[10px] font-bold text-slate-500 mt-0.5">
                                {sub.confirmedPrivateBookings} خاص • {sub.confirmedGroupEnrollments} مجموعات
                              </span>
                            </div>
                          ) : (
                            renderMetricValue(false, 0)
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-center font-bold text-blue-700">
                          {subsOk ? (
                            <div>
                              <span>{sub.completedSubscriptions}</span>
                              {sub.completedSubscriptions > 0 && (
                                <span className="block text-[10px] text-slate-400">
                                  ({sub.completedPrivateBookings} خاص • {sub.completedGroupEnrollments} مجموعات)
                                </span>
                              )}
                            </div>
                          ) : (
                            renderMetricValue(false, 0)
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-center font-bold text-amber-700">
                          {subsOk ? sub.pendingSubscriptions : renderMetricValue(false, 0)}
                        </td>
                        <td className="py-3.5 px-3 text-center font-bold text-red-700">
                          {subsOk ? sub.cancelledSubscriptions : renderMetricValue(false, 0)}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={() => openSubjectDrilldown(sub, 'tutors')}
                            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-brand-navy hover:text-white text-brand-navy font-bold text-[11px] transition-colors"
                          >
                            عرض التفصيل
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: DETAILED SPECIALIZATIONS (COURSE OPTIONS + QURAN PAIRS)        */}
      {/* ===================================================================== */}
      {activeSubTab === 'specializations' && (
        <div className="space-y-5">
          {/* Filters Toolbar */}
          <div className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 shadow-sm space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              {/* Search */}
              <div className="sm:col-span-2 relative">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={specSearch}
                  onChange={(e) => setSpecSearch(e.target.value)}
                  placeholder="ابحث بالتخصص (مثال: رياضيات - الصف الرابع)..."
                  className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-brand-navy focus:outline-none focus:border-brand-blue"
                />
              </div>

              {/* Track Filter */}
              <div>
                <select
                  value={specTrackFilter}
                  onChange={(e) => {
                    setSpecTrackFilter(e.target.value as any);
                    if (e.target.value === 'quran') {
                      setSpecStageFilter('all');
                      setSpecSubjectFilter('all');
                      setSpecCurriculumFilter('all');
                    }
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-brand-navy bg-white"
                >
                  <option value="all">كل المسارات</option>
                  <option value="school">التخصصات الدراسية</option>
                  <option value="quran">تخصصات القرآن والتأسيس</option>
                </select>
              </div>

              {/* Stage Filter */}
              <div>
                <select
                  value={specStageFilter}
                  onChange={(e) => setSpecStageFilter(e.target.value)}
                  disabled={specTrackFilter === 'quran'}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-brand-navy bg-white disabled:opacity-50"
                >
                  <option value="all">كل المراحل الدراسية</option>
                  {stats.stagesStats.map((st) => (
                    <option key={st.stageId} value={st.stageId}>
                      {st.stageName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Subject Filter */}
              <div>
                <select
                  value={specSubjectFilter}
                  onChange={(e) => setSpecSubjectFilter(e.target.value)}
                  disabled={specTrackFilter === 'quran'}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-brand-navy bg-white disabled:opacity-50"
                >
                  <option value="all">كل المواد الدراسية</option>
                  {stats.subjectsStats.map((sb) => (
                    <option key={sb.subjectId} value={sb.subjectId}>
                      {sb.subjectName}
                    </option>
                  ))}
                </select>
              </div>

              {/* Curriculum Filter */}
              <div>
                <select
                  value={specCurriculumFilter}
                  onChange={(e) => setSpecCurriculumFilter(e.target.value)}
                  disabled={specTrackFilter === 'quran'}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-brand-navy bg-white disabled:opacity-50"
                >
                  <option value="all">كل المناهج</option>
                  {stats.curriculaStats.map((cr) => (
                    <option key={cr.curriculumId} value={cr.curriculumId}>
                      منهج {cr.curriculumName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick Filters & Sort */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setSpecQuickFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    specQuickFilter === 'all'
                      ? 'bg-brand-navy text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  كل التخصصات ({stats.detailedSpecializations.length})
                </button>
                <button
                  onClick={() => setSpecQuickFilter('no_published_tutors')}
                  disabled={!tutorsOk}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40 ${
                    specQuickFilter === 'no_published_tutors'
                      ? 'bg-red-600 text-white'
                      : 'bg-red-50 text-red-700 hover:bg-red-100'
                  }`}
                >
                  تخصصات بلا معلم منشور (
                  {tutorsOk
                    ? stats.detailedSpecializations.filter((sp) => sp.publishedTutors === 0).length
                    : '—'}
                  )
                </button>
                <button
                  onClick={() => setSpecQuickFilter('has_pending_applicants')}
                  disabled={!appsOk}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40 ${
                    specQuickFilter === 'has_pending_applicants'
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                  }`}
                >
                  عليها متقدمون قيد المراجعة (
                  {appsOk
                    ? stats.detailedSpecializations.filter((sp) => sp.pendingApplicants > 0).length
                    : '—'}
                  )
                </button>
                <button
                  onClick={() => setSpecQuickFilter('has_confirmed_subscriptions')}
                  disabled={!subsOk}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40 ${
                    specQuickFilter === 'has_confirmed_subscriptions'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  }`}
                >
                  بها اشتراكات مؤكدة (
                  {subsOk
                    ? stats.detailedSpecializations.filter((sp) => sp.confirmedSubscriptions > 0).length
                    : '—'}
                  )
                </button>
                <button
                  onClick={() => setSpecQuickFilter('has_completed_subscriptions')}
                  disabled={!subsOk}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40 ${
                    specQuickFilter === 'has_completed_subscriptions'
                      ? 'bg-blue-600 text-white'
                      : 'bg-blue-50 text-blue-800 hover:bg-blue-100'
                  }`}
                >
                  بها اشتراكات مكتملة (
                  {subsOk
                    ? stats.detailedSpecializations.filter((sp) => sp.completedSubscriptions > 0).length
                    : '—'}
                  )
                </button>
                <button
                  onClick={() => setSpecQuickFilter('has_pending_subscriptions')}
                  disabled={!subsOk}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40 ${
                    specQuickFilter === 'has_pending_subscriptions'
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                  }`}
                >
                  بها اشتراكات قيد الانتظار (
                  {subsOk
                    ? stats.detailedSpecializations.filter((sp) => sp.pendingSubscriptions > 0).length
                    : '—'}
                  )
                </button>
                <button
                  onClick={() => setSpecQuickFilter('has_cancelled_subscriptions')}
                  disabled={!subsOk}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40 ${
                    specQuickFilter === 'has_cancelled_subscriptions'
                      ? 'bg-slate-700 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  بها اشتراكات ملغاة (
                  {subsOk
                    ? stats.detailedSpecializations.filter((sp) => sp.cancelledSubscriptions > 0).length
                    : '—'}
                  )
                </button>
                <button
                  onClick={() => setSpecQuickFilter('high_demand_low_supply')}
                  disabled={!tutorsOk}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40 ${
                    specQuickFilter === 'high_demand_low_supply'
                      ? 'bg-purple-700 text-white'
                      : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
                  }`}
                >
                  فرص توسع فورية (متقدمون لتخصص غير مغطى)
                </button>
              </div>

              <div className="flex items-center gap-2">
                <ArrowUpDown size={14} className="text-slate-400" />
                <select
                  value={specSort}
                  onChange={(e) => setSpecSort(e.target.value as SortOption)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-brand-navy bg-slate-50"
                >
                  <option value="subscriptions_desc" disabled={!subsOk}>
                    الأعلى اشتراكات مؤكدة ثم المعلمين
                  </option>
                  <option value="tutors_desc" disabled={!tutorsOk}>
                    الأكثر معلمين منشورين
                  </option>
                  <option value="tutors_asc" disabled={!tutorsOk}>
                    الأقل معلمين منشورين
                  </option>
                  <option value="applicants_desc" disabled={!appsOk}>
                    الأكثر متقدمين قيد المراجعة
                  </option>
                  <option value="display_order">الترتيب الأبجدي</option>
                </select>
              </div>
            </div>
          </div>

          {/* Specializations Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-black text-brand-navy">
                قائمة التخصصات الفرعية المطابقة ({filteredSpecializations.length} تخصص)
              </span>
              <span className="text-[11px] font-bold text-slate-500">
                انقر على «سجل السجلات» لاستعراض المعلمين والمتقدمين والحجوزات مع التصفح الصفحي
              </span>
            </div>

            {filteredSpecializations.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-sm font-black text-brand-navy mb-1">لا توجد تخصصات مطابقة للبحث</p>
                <p className="text-xs text-slate-500">جرّب تخفيف الفلاتر المختارة</p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[650px]">
                <table className="w-full text-right border-collapse">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10 text-[11px] font-black text-slate-600">
                    <tr>
                      <th className="py-3.5 px-4">التخصص الدقيق</th>
                      <th className="py-3.5 px-3">المرحلة / المسار</th>
                      <th className="py-3.5 px-3 text-center">معلمون منشورون</th>
                      <th className="py-3.5 px-3 text-center">متقدمون (مراجعة / استكمال)</th>
                      <th className="py-3.5 px-3 text-center">مؤكد (خاص / مجموعات)</th>
                      <th className="py-3.5 px-3 text-center">مكتمل</th>
                      <th className="py-3.5 px-3 text-center">قيد الانتظار</th>
                      <th className="py-3.5 px-3 text-center">ملغي</th>
                      <th className="py-3.5 px-4">المعلمون المعتمدون بالتخصص</th>
                      <th className="py-3.5 px-3 text-center">التفاصيل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredSpecializations.map((sp) => {
                      const spTutors = sp.tutorsList || [];
                      return (
                        <tr key={sp.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-black text-brand-navy flex items-center gap-1.5">
                              <span>{sp.label}</span>
                              {sp.isActive === false && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                                  غير نشط
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">{sp.id}</div>
                          </td>
                          <td className="py-3 px-3">
                            {sp.track === 'school' ? (
                              <div className="space-y-0.5">
                                <span className="inline-block px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-[10px]">
                                  {sp.stageName}
                                </span>
                                <div className="text-[10px] text-slate-500 font-bold">منهج {sp.curriculumName}</div>
                              </div>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 font-bold text-[10px]">
                                مسار القرآن والتأسيس
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {tutorsOk ? (
                              <>
                                <span
                                  className={`inline-flex items-center justify-center px-2.5 py-1 rounded-lg font-black ${
                                    sp.publishedTutors > 0
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : 'bg-red-50 text-red-700'
                                  }`}
                                >
                                  {sp.publishedTutors}
                                </span>
                                {sp.unpublishedTutors > 0 && (
                                  <span className="block text-[10px] font-bold text-amber-600 mt-0.5">
                                    +{sp.unpublishedTutors} مخفي
                                  </span>
                                )}
                              </>
                            ) : (
                              renderMetricValue(false, 0)
                            )}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {appsOk ? (
                              <>
                                <span
                                  className={`inline-flex items-center justify-center px-2.5 py-1 rounded-lg font-black ${
                                    sp.pendingApplicants > 0
                                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  {sp.submittedApplicants} / {sp.needsInfoApplicants}
                                </span>
                                {sp.totalApplicants > 0 && (
                                  <span className="block text-[10px] text-slate-400 mt-0.5">
                                    إجمالي {sp.totalApplicants}
                                  </span>
                                )}
                              </>
                            ) : (
                              renderMetricValue(false, 0)
                            )}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {subsOk ? (
                              <div>
                                <span
                                  className={`inline-flex items-center justify-center px-2.5 py-1 rounded-lg font-black ${
                                    sp.confirmedSubscriptions > 0
                                      ? 'bg-emerald-50 text-emerald-800'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  {sp.confirmedSubscriptions}
                                </span>
                                <span className="block text-[10px] font-bold text-slate-500 mt-0.5">
                                  {sp.confirmedPrivateBookings} خاص • {sp.confirmedGroupEnrollments} مجموعات
                                </span>
                              </div>
                            ) : (
                              renderMetricValue(false, 0)
                            )}
                          </td>
                          <td className="py-3 px-3 text-center font-bold text-blue-700">
                            {subsOk ? sp.completedSubscriptions : renderMetricValue(false, 0)}
                          </td>
                          <td className="py-3 px-3 text-center font-bold text-amber-700">
                            {subsOk ? sp.pendingSubscriptions : renderMetricValue(false, 0)}
                          </td>
                          <td className="py-3 px-3 text-center font-bold text-red-700">
                            {subsOk ? sp.cancelledSubscriptions : renderMetricValue(false, 0)}
                          </td>
                          <td className="py-3 px-4">
                            {!tutorsOk ? (
                              renderMetricValue(false, 0)
                            ) : spTutors.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {spTutors.slice(0, 3).map((t) => (
                                  <button
                                    key={t.id}
                                    onClick={() => handleOpenTutor(t.id)}
                                    className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-brand-blue hover:text-white text-brand-navy font-bold text-[10px] transition-colors"
                                  >
                                    {t.honorific} {t.name}
                                  </button>
                                ))}
                                {spTutors.length > 3 && (
                                  <button
                                    onClick={() => openSpecializationDrilldown(sp, 'tutors')}
                                    className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 font-bold text-[10px]"
                                  >
                                    +{spTutors.length - 3}
                                  </button>
                                )}
                              </div>
                            ) : sp.totalTutors > 0 ? (
                              <button
                                onClick={() => openSpecializationDrilldown(sp, 'tutors')}
                                className="text-[11px] font-bold text-brand-blue hover:underline"
                              >
                                عرض ({sp.totalTutors}) معلم
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400 font-medium">لا يوجد معلمون</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button
                              onClick={() => openSpecializationDrilldown(sp, 'tutors')}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-brand-navy hover:text-white text-brand-navy font-bold text-[11px] transition-colors"
                            >
                              سجل السجلات
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: QURAN & NOOR AL-BAYAN TRACK BREAKDOWN                          */}
      {/* ===================================================================== */}
      {activeSubTab === 'quran' && (
        <div className="space-y-6">
          {/* Quran Track Top Banner */}
          <div className="bg-gradient-to-l from-teal-900 to-teal-800 rounded-3xl p-6 text-white shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="inline-block px-3 py-1 rounded-full bg-white/15 text-teal-100 text-xs font-bold mb-2">
                  المسار القرآني والتأسيس
                </span>
                <h3 className="text-xl font-black mb-1">{stats.quranSummary.subjectName}</h3>
                <p className="text-xs text-teal-100/90 font-medium">
                  تفصيل أعداد المحفظين والمعلمين، المتقدمين، والاشتراكات حسب كل برنامج قرآني وكل فئة عمرية
                </p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                <div className="bg-white/10 rounded-2xl px-4 py-3">
                  <div className="text-2xl font-black">
                    {tutorsOk ? stats.quranSummary.publishedTutors : '—'}
                  </div>
                  <div className="text-[11px] text-teal-100 font-bold">
                    معلم منشور ({tutorsOk ? stats.quranSummary.totalTutors : '—'} معتمد)
                  </div>
                </div>
                <div className="bg-white/10 rounded-2xl px-4 py-3">
                  <div className="text-2xl font-black">
                    {appsOk ? stats.quranSummary.pendingApplicants : '—'}
                  </div>
                  <div className="text-[11px] text-teal-100 font-bold">متقدم قيد المراجعة</div>
                </div>
                <div className="bg-white/10 rounded-2xl px-4 py-3">
                  <div className="text-2xl font-black">
                    {subsOk ? stats.quranSummary.confirmedSubscriptions : '—'}
                  </div>
                  <div className="text-[11px] text-teal-100 font-bold">اشتراك مؤكد</div>
                </div>
                <div className="bg-white/10 rounded-2xl px-4 py-3">
                  <div className="text-2xl font-black">
                    {subsOk ? stats.quranSummary.completedSubscriptions : '—'}
                  </div>
                  <div className="text-[11px] text-teal-100 font-bold">اشتراك مكتمل</div>
                </div>
                <div className="bg-white/10 rounded-2xl px-4 py-3">
                  <div className="text-lg font-black">
                    {subsOk
                      ? `${stats.quranSummary.pendingSubscriptions} / ${stats.quranSummary.cancelledSubscriptions}`
                      : '—'}
                  </div>
                  <div className="text-[11px] text-teal-100 font-bold">قيد الانتظار / ملغي</div>
                </div>
              </div>
            </div>
          </div>

          {/* Quran Programs / Levels Grid */}
          <div>
            <h4 className="text-base font-black text-brand-navy mb-3 flex items-center gap-2">
              <Award size={18} className="text-teal-700" />
              <span>أولًا: الإحصائيات حسب البرنامج / المستوى القرآني</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {stats.quranLevelsStats.map((ql) => {
                const qlTutors = ql.tutorsList || [];
                return (
                  <div
                    key={ql.levelId}
                    className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <h5 className="text-base font-black text-brand-navy flex items-center gap-1.5">
                            <span>{ql.levelName}</span>
                            {ql.isActive === false && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                                غير نشط
                              </span>
                            )}
                          </h5>
                          <p className="text-xs text-slate-500 font-medium">{ql.description}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openQuranLevelDrilldown(ql, 'tutors')}
                            className="px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-700 hover:text-white text-teal-800 text-[11px] font-bold transition-colors"
                          >
                            عرض السجلات
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2.5 my-4">
                        <div className="bg-slate-50 rounded-2xl p-3 text-center">
                          <div className="text-lg font-black text-brand-navy">
                            {tutorsOk ? ql.publishedTutors : '—'}
                          </div>
                          <div className="text-[10px] font-bold text-slate-500">
                            معلم منشور (من {tutorsOk ? ql.totalTutors : '—'})
                          </div>
                        </div>
                        <div className="bg-amber-50/70 rounded-2xl p-3 text-center">
                          <div className="text-lg font-black text-amber-900">
                            {appsOk ? ql.pendingApplicants : '—'}
                          </div>
                          <div className="text-[10px] font-bold text-amber-700">
                            قيد المراجعة (من {appsOk ? ql.totalApplicants : '—'})
                          </div>
                        </div>
                        <div className="bg-emerald-50/70 rounded-2xl p-3 text-center">
                          <div className="text-lg font-black text-emerald-900">
                            {subsOk ? ql.confirmedSubscriptions : '—'}
                          </div>
                          <div className="text-[10px] font-bold text-emerald-700">
                            مؤكد • مكتمل: {subsOk ? ql.completedSubscriptions : '—'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                      {subsOk ? (
                        <div className="flex flex-wrap items-center gap-2.5 font-bold text-slate-600">
                          <span>خاص مؤكد: {ql.confirmedPrivateBookings}</span>
                          <span>•</span>
                          <span>مجموعات مؤكدة: {ql.confirmedGroupEnrollments}</span>
                          <span>•</span>
                          <span className="text-blue-700">مكتمل: {ql.completedSubscriptions}</span>
                          <span>•</span>
                          <span className="text-amber-700">قيد الانتظار: {ql.pendingSubscriptions}</span>
                          <span>•</span>
                          <span className="text-red-700">ملغي: {ql.cancelledSubscriptions}</span>
                        </div>
                      ) : (
                        <div>{renderMetricValue(false, 0)}</div>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {qlTutors.slice(0, 3).map((t) => (
                          <button
                            key={t.id}
                            onClick={() => handleOpenTutor(t.id)}
                            className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 hover:bg-teal-100"
                          >
                            {t.honorific} {t.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quran Age Groups Table */}
          <div>
            <h4 className="text-base font-black text-brand-navy mb-3 flex items-center gap-2">
              <Users size={18} className="text-teal-700" />
              <span>ثانيًا: الإحصائيات حسب الفئات العمرية بالمسار القرآني</span>
            </h4>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-600">
                      <th className="py-3.5 px-4">الفئة العمرية</th>
                      <th className="py-3.5 px-3">النطاق العمري</th>
                      <th className="py-3.5 px-3 text-center">المعلمون المنشورون</th>
                      <th className="py-3.5 px-3 text-center">المعلمون المعتمدون</th>
                      <th className="py-3.5 px-3 text-center">متقدمون قيد المراجعة</th>
                      <th className="py-3.5 px-3 text-center">إجمالي المتقدمين</th>
                      <th className="py-3.5 px-3 text-center">مؤكد</th>
                      <th className="py-3.5 px-3 text-center">مكتمل</th>
                      <th className="py-3.5 px-3 text-center">قيد الانتظار</th>
                      <th className="py-3.5 px-3 text-center">ملغي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {stats.quranAgeGroupsStats.map((qa) => (
                      <tr key={qa.ageGroupId} className="hover:bg-slate-50/70">
                        <td className="py-3.5 px-4 font-black text-brand-navy">{qa.ageGroupName}</td>
                        <td className="py-3.5 px-3 font-bold text-slate-500">{qa.ageRange}</td>
                        <td className="py-3.5 px-3 text-center font-black text-emerald-700">
                          {tutorsOk ? qa.publishedTutors : renderMetricValue(false, 0)}
                        </td>
                        <td className="py-3.5 px-3 text-center font-bold text-slate-700">
                          {tutorsOk ? qa.totalTutors : renderMetricValue(false, 0)}
                        </td>
                        <td className="py-3.5 px-3 text-center font-black text-amber-700">
                          {appsOk ? qa.pendingApplicants : renderMetricValue(false, 0)}
                        </td>
                        <td className="py-3.5 px-3 text-center font-bold text-slate-600">
                          {appsOk ? qa.totalApplicants : renderMetricValue(false, 0)}
                        </td>
                        <td className="py-3.5 px-3 text-center font-black text-emerald-800">
                          {subsOk ? qa.confirmedSubscriptions : renderMetricValue(false, 0)}
                        </td>
                        <td className="py-3.5 px-3 text-center font-bold text-blue-700">
                          {subsOk ? qa.completedSubscriptions : renderMetricValue(false, 0)}
                        </td>
                        <td className="py-3.5 px-3 text-center font-bold text-amber-700">
                          {subsOk ? qa.pendingSubscriptions : renderMetricValue(false, 0)}
                        </td>
                        <td className="py-3.5 px-3 text-center font-bold text-red-700">
                          {subsOk ? qa.cancelledSubscriptions : renderMetricValue(false, 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: EDUCATIONAL STAGES & CURRICULA BREAKDOWN                       */}
      {/* ===================================================================== */}
      {activeSubTab === 'stages_curricula' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Educational Stages */}
          <div className="space-y-3">
            <h4 className="text-base font-black text-brand-navy flex items-center gap-2">
              <GraduationCap size={18} className="text-brand-blue" />
              <span>التوزيع حسب المراحل الدراسية</span>
            </h4>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-600">
                      <th className="py-3.5 px-4">المرحلة الدراسية</th>
                      <th className="py-3.5 px-3 text-center">معلمون منشورون</th>
                      <th className="py-3.5 px-3 text-center">متقدمون قيد المراجعة</th>
                      <th className="py-3.5 px-3 text-center">مؤكد</th>
                      <th className="py-3.5 px-3 text-center">مكتمل</th>
                      <th className="py-3.5 px-3 text-center">قيد الانتظار</th>
                      <th className="py-3.5 px-3 text-center">ملغي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {stats.stagesStats.map((st) => (
                      <tr key={st.stageId} className="hover:bg-slate-50/70">
                        <td className="py-3.5 px-4">
                          <div className="font-black text-brand-navy">{st.stageName}</div>
                          <div className="text-[10px] font-bold text-slate-400">{st.gradesDesc}</div>
                        </td>
                        <td className="py-3.5 px-3 text-center">
                          {tutorsOk ? (
                            <>
                              <span className="font-black text-emerald-700">{st.publishedTutors}</span>
                              <span className="text-[10px] text-slate-400 block">من {st.totalTutors}</span>
                            </>
                          ) : (
                            renderMetricValue(false, 0)
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-center">
                          {appsOk ? (
                            <>
                              <span className="font-black text-amber-700">{st.pendingApplicants}</span>
                              <span className="text-[10px] text-slate-400 block">من {st.totalApplicants}</span>
                            </>
                          ) : (
                            renderMetricValue(false, 0)
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-center font-black text-brand-navy">
                          {subsOk ? st.confirmedSubscriptions : renderMetricValue(false, 0)}
                        </td>
                        <td className="py-3.5 px-3 text-center font-bold text-blue-700">
                          {subsOk ? st.completedSubscriptions : renderMetricValue(false, 0)}
                        </td>
                        <td className="py-3.5 px-3 text-center font-bold text-amber-700">
                          {subsOk ? st.pendingSubscriptions : renderMetricValue(false, 0)}
                        </td>
                        <td className="py-3.5 px-3 text-center font-bold text-red-700">
                          {subsOk ? st.cancelledSubscriptions : renderMetricValue(false, 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Curricula */}
          <div className="space-y-3">
            <h4 className="text-base font-black text-brand-navy flex items-center gap-2">
              <FileSpreadsheet size={18} className="text-brand-blue" />
              <span>التوزيع حسب المناهج التعليمية</span>
            </h4>
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-600">
                      <th className="py-3.5 px-4">المنهج الدراسي</th>
                      <th className="py-3.5 px-3 text-center">معلمون منشورون</th>
                      <th className="py-3.5 px-3 text-center">متقدمون قيد المراجعة</th>
                      <th className="py-3.5 px-3 text-center">مؤكد</th>
                      <th className="py-3.5 px-3 text-center">مكتمل</th>
                      <th className="py-3.5 px-3 text-center">قيد الانتظار</th>
                      <th className="py-3.5 px-3 text-center">ملغي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {stats.curriculaStats.map((cr) => (
                      <tr key={cr.curriculumId} className="hover:bg-slate-50/70">
                        <td className="py-3.5 px-4 font-black text-brand-navy">منهج {cr.curriculumName}</td>
                        <td className="py-3.5 px-3 text-center">
                          {tutorsOk ? (
                            <>
                              <span className="font-black text-emerald-700">{cr.publishedTutors}</span>
                              <span className="text-[10px] text-slate-400 block">من {cr.totalTutors}</span>
                            </>
                          ) : (
                            renderMetricValue(false, 0)
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-center">
                          {appsOk ? (
                            <>
                              <span className="font-black text-amber-700">{cr.pendingApplicants}</span>
                              <span className="text-[10px] text-slate-400 block">من {cr.totalApplicants}</span>
                            </>
                          ) : (
                            renderMetricValue(false, 0)
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-center font-black text-brand-navy">
                          {subsOk ? cr.confirmedSubscriptions : renderMetricValue(false, 0)}
                        </td>
                        <td className="py-3.5 px-3 text-center font-bold text-blue-700">
                          {subsOk ? cr.completedSubscriptions : renderMetricValue(false, 0)}
                        </td>
                        <td className="py-3.5 px-3 text-center font-bold text-amber-700">
                          {subsOk ? cr.pendingSubscriptions : renderMetricValue(false, 0)}
                        </td>
                        <td className="py-3.5 px-3 text-center font-bold text-red-700">
                          {subsOk ? cr.cancelledSubscriptions : renderMetricValue(false, 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* DRILL-DOWN MODAL FOR SUBJECT / SPECIALIZATION / UNCLASSIFIED RECORDS   */}
      {/* ===================================================================== */}
      {drilldownTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {drilldownTarget.badgeText && (
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-lg border bg-blue-50 text-blue-700 border-blue-200">
                      {drilldownTarget.badgeText}
                    </span>
                  )}
                  {drilldownTarget.codeLabel && (
                    <span className="text-[11px] font-mono text-slate-400">{drilldownTarget.codeLabel}</span>
                  )}
                </div>
                <h3 className="text-lg sm:text-xl font-black text-brand-navy">{drilldownTarget.title}</h3>
                {drilldownTarget.subtitle && (
                  <p className="text-xs font-bold text-slate-500 mt-0.5">{drilldownTarget.subtitle}</p>
                )}
              </div>
              <button
                onClick={() => setDrilldownTarget(null)}
                className="w-10 h-10 rounded-2xl bg-white border border-slate-200 text-slate-500 hover:text-brand-navy flex items-center justify-center transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
              {/* Summary Metrics if Subject */}
              {drilldownTarget.subjectItem && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100">
                    <div className="text-[11px] font-bold text-slate-500 mb-1">المعلمون المعتمدون</div>
                    {tutorsOk ? (
                      <>
                        <div className="text-2xl font-black text-brand-navy">
                          {drilldownTarget.subjectItem.publishedTutors}
                        </div>
                        <div className="text-[11px] font-bold text-slate-500 mt-1">
                          منشور من أصل {drilldownTarget.subjectItem.totalTutors} (
                          {drilldownTarget.subjectItem.unpublishedTutors} مخفي)
                        </div>
                      </>
                    ) : (
                      renderMetricValue(false, 0)
                    )}
                  </div>

                  <div className="bg-amber-50/70 rounded-2xl p-3.5 border border-amber-100">
                    <div className="text-[11px] font-bold text-amber-800 mb-1">طلبات الانضمام</div>
                    {appsOk ? (
                      <>
                        <div className="text-2xl font-black text-amber-900">
                          {drilldownTarget.subjectItem.submittedApplicants}
                        </div>
                        <div className="text-[11px] font-bold text-amber-700 mt-1">
                          قيد المراجعة • {drilldownTarget.subjectItem.needsInfoApplicants} استكمال •{' '}
                          {drilldownTarget.subjectItem.approvedApplicants} مقبول
                        </div>
                      </>
                    ) : (
                      renderMetricValue(false, 0)
                    )}
                  </div>

                  <div className="bg-indigo-50/70 rounded-2xl p-3.5 border border-indigo-100">
                    <div className="text-[11px] font-bold text-indigo-800 mb-1">حجوزات الحصص الخاصة</div>
                    {subsOk ? (
                      <>
                        <div className="text-2xl font-black text-indigo-900">
                          {drilldownTarget.subjectItem.confirmedPrivateBookings}
                        </div>
                        <div className="text-[11px] font-bold text-indigo-700 mt-1">
                          مؤكد • {drilldownTarget.subjectItem.completedPrivateBookings} مكتمل •{' '}
                          {drilldownTarget.subjectItem.pendingPrivateBookings} قيد الانتظار •{' '}
                          {drilldownTarget.subjectItem.cancelledPrivateBookings} ملغي
                        </div>
                      </>
                    ) : (
                      renderMetricValue(false, 0)
                    )}
                  </div>

                  <div className="bg-purple-50/70 rounded-2xl p-3.5 border border-purple-100">
                    <div className="text-[11px] font-bold text-purple-800 mb-1">اشتراكات المجموعات</div>
                    {subsOk ? (
                      <>
                        <div className="text-2xl font-black text-purple-900">
                          {drilldownTarget.subjectItem.confirmedGroupEnrollments}
                        </div>
                        <div className="text-[11px] font-bold text-purple-700 mt-1">
                          مؤكد • {drilldownTarget.subjectItem.completedGroupEnrollments} مكتمل •{' '}
                          {drilldownTarget.subjectItem.pendingGroupEnrollments} قيد الانتظار •{' '}
                          {drilldownTarget.subjectItem.cancelledGroupEnrollments} ملغي
                        </div>
                      </>
                    ) : (
                      renderMetricValue(false, 0)
                    )}
                  </div>

                  <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200">
                    <div className="text-[11px] font-bold text-slate-500 mb-1">الطلاب الفريدون</div>
                    <div className="text-sm font-black text-slate-700 mt-1">
                      {formatStudentCount(drilldownTarget.subjectItem.uniqueConfirmedStudents)}
                    </div>
                    <div className="text-[10px] font-medium text-slate-400 mt-1">
                      بدون استنتاج من الاسم أو الهاتف
                    </div>
                  </div>
                </div>
              )}

              {/* Sub-Specializations Table when inspecting a Subject */}
              {drilldownTarget.subjectItem && (
                <div>
                  <h4 className="text-sm font-black text-brand-navy mb-2.5 flex items-center gap-2">
                    <Layers size={16} className="text-brand-blue" />
                    <span>تفصيل التخصصات الفرعية داخل {drilldownTarget.subjectItem.subjectName}</span>
                  </h4>
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto max-h-60">
                      <table className="w-full text-right border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-600 sticky top-0">
                          <tr>
                            <th className="py-2.5 px-3">التخصص الفرعي</th>
                            <th className="py-2.5 px-3 text-center">معلمون منشورون</th>
                            <th className="py-2.5 px-3 text-center">متقدمون قيد المراجعة</th>
                            <th className="py-2.5 px-3 text-center">مؤكد (خاص / مجموعات)</th>
                            <th className="py-2.5 px-3 text-center">مكتمل</th>
                            <th className="py-2.5 px-3 text-center">قيد الانتظار</th>
                            <th className="py-2.5 px-3 text-center">ملغي</th>
                            <th className="py-2.5 px-3 text-center">فحص</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {stats.detailedSpecializations
                            .filter((sp) =>
                              drilldownTarget.subjectItem?.track === 'quran'
                                ? sp.track === 'quran'
                                : sp.subjectId === drilldownTarget.subjectItem?.subjectId
                            )
                            .map((sp) => (
                              <tr key={sp.id} className="hover:bg-slate-50">
                                <td className="py-2.5 px-3 font-bold text-brand-navy">{sp.label}</td>
                                <td className="py-2.5 px-3 text-center">
                                  {tutorsOk ? (
                                    <span
                                      className={`px-2 py-0.5 rounded font-black ${
                                        sp.publishedTutors > 0
                                          ? 'bg-emerald-50 text-emerald-700'
                                          : 'bg-red-50 text-red-700'
                                      }`}
                                    >
                                      {sp.publishedTutors}
                                    </span>
                                  ) : (
                                    renderMetricValue(false, 0)
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center font-bold text-amber-700">
                                  {appsOk ? sp.pendingApplicants : renderMetricValue(false, 0)}
                                </td>
                                <td className="py-2.5 px-3 text-center font-bold text-emerald-700">
                                  {subsOk ? (
                                    <>
                                      {sp.confirmedSubscriptions}{' '}
                                      <span className="text-[10px] text-slate-400">
                                        ({sp.confirmedPrivateBookings} خاص / {sp.confirmedGroupEnrollments} مجموعة)
                                      </span>
                                    </>
                                  ) : (
                                    renderMetricValue(false, 0)
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-center font-bold text-blue-700">
                                  {subsOk ? sp.completedSubscriptions : renderMetricValue(false, 0)}
                                </td>
                                <td className="py-2.5 px-3 text-center font-bold text-amber-700">
                                  {subsOk ? sp.pendingSubscriptions : renderMetricValue(false, 0)}
                                </td>
                                <td className="py-2.5 px-3 text-center font-bold text-red-700">
                                  {subsOk ? sp.cancelledSubscriptions : renderMetricValue(false, 0)}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <button
                                    onClick={() => openSpecializationDrilldown(sp, 'tutors')}
                                    className="px-2 py-1 rounded bg-slate-100 hover:bg-brand-navy hover:text-white text-[10px] font-bold"
                                  >
                                    سجل التخصص
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Paginated Drilldown Explorer (On-Demand Server-Side / Paginated Records) */}
              <div className="bg-slate-50/70 rounded-3xl border border-slate-200 p-4 sm:p-5 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-black text-brand-navy flex items-center gap-2">
                      <FolderSearch size={17} className="text-brand-blue" />
                      <span>استعراض السجلات التفصيلية عند الطلب (Paginated Drilldown)</span>
                    </h4>
                    <p className="text-[11px] font-medium text-slate-500">
                      يتم جلب السجلات المرتبطة بهذا البند على دفعات دون تحميل الجداول الخام مسبقًا
                    </p>
                  </div>

                  {/* Status Filter inside drilldown */}
                  <div>
                    <select
                      value={drilldownStatusFilter}
                      onChange={(e) => {
                        setDrilldownStatusFilter(e.target.value);
                        setDrilldownPage(1);
                      }}
                      className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-brand-navy focus:outline-none focus:border-brand-blue"
                    >
                      <option value="all">كل الحالات</option>
                      {drilldownEntityType === 'tutors' && (
                        <>
                          <option value="published">منشور فقط</option>
                          <option value="unpublished">مخفي فقط</option>
                        </>
                      )}
                      {drilldownEntityType === 'applicants' && (
                        <>
                          <option value="pending_review">قيد المراجعة + استكمال البيانات</option>
                          <option value="submitted">قيد المراجعة (submitted)</option>
                          <option value="needs_info">مطلوب استكمال بيانات (needs_info)</option>
                          <option value="approved">مقبول (approved)</option>
                          <option value="rejected">مرفوض (rejected)</option>
                        </>
                      )}
                      {drilldownEntityType === 'subscriptions' && (
                        <>
                          <option value="confirmed">مؤكد (confirmed)</option>
                          <option value="completed">مكتمل (completed)</option>
                          <option value="pending">قيد الانتظار (pending)</option>
                          <option value="cancelled">ملغي (cancelled)</option>
                        </>
                      )}
                      {drilldownEntityType === 'unclassified' && (
                        <>
                          <option value="unassigned_tutor">معلم بلا تخصص</option>
                          <option value="application">طلب انضمام غير مصنف</option>
                          <option value="group">مجموعة غير مصنفة</option>
                          <option value="private_slot">موعد خاص غير مصنف</option>
                          <option value="private_booking">حجز خاص غير مصنف</option>
                          <option value="group_enrollment">اشتراك مجموعة غير مصنف</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>

                {/* Category Selector Tabs */}
                {!drilldownTarget.isUnclassifiedMode && (
                  <div className="flex flex-wrap gap-1.5 bg-white p-1.5 rounded-2xl border border-slate-200">
                    {(
                      [
                        { id: 'tutors', label: 'المعلمون المعتمدون' },
                        { id: 'applicants', label: 'طلبات الانضمام' },
                        { id: 'subscriptions', label: 'الاشتراكات والحجوزات' },
                      ] as { id: 'tutors' | 'applicants' | 'subscriptions'; label: string }[]
                    ).map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => {
                          setDrilldownEntityType(cat.id);
                          setDrilldownStatusFilter('all');
                          setDrilldownPage(1);
                        }}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                          drilldownEntityType === cat.id
                            ? 'bg-brand-navy text-white shadow-sm'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Paginated Records Table */}
                {drilldownLoading ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                    <Loader2 className="w-6 h-6 text-brand-blue animate-spin mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-500">جاري جلب السجلات...</p>
                  </div>
                ) : drilldownError ? (
                  <div className="bg-red-50 rounded-2xl border border-red-200 p-6 text-center space-y-2">
                    <AlertTriangle className="w-6 h-6 text-red-600 mx-auto" />
                    <p className="text-xs font-black text-red-900">بيانات غير مكتملة — تعذر تحميل السجلات</p>
                    <p className="text-xs font-medium text-red-700">{drilldownError}</p>
                  </div>
                ) : !drilldownData || drilldownData.totalCount === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                    <p className="text-xs font-bold text-slate-500">لا توجد سجلات مطابقة في هذا التصنيف</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-right border-collapse text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-600">
                          {drilldownEntityType === 'tutors' && (
                            <tr>
                              <th className="py-2.5 px-3">المعلم</th>
                              <th className="py-2.5 px-3">العنوان التعريفي</th>
                              <th className="py-2.5 px-3 text-center">حالة النشر</th>
                              <th className="py-2.5 px-3 text-center">إجراء</th>
                            </tr>
                          )}
                          {drilldownEntityType === 'applicants' && (
                            <tr>
                              <th className="py-2.5 px-3">اسم المتقدم</th>
                              <th className="py-2.5 px-3">رقم المرجع / الهاتف</th>
                              <th className="py-2.5 px-3 text-center">المسار</th>
                              <th className="py-2.5 px-3 text-center">الحالة</th>
                              <th className="py-2.5 px-3 text-center">التاريخ</th>
                            </tr>
                          )}
                          {drilldownEntityType === 'subscriptions' && (
                            <tr>
                              <th className="py-2.5 px-3">اسم الطالب</th>
                              <th className="py-2.5 px-3">النوع</th>
                              <th className="py-2.5 px-3">المعلم / المجموعة</th>
                              <th className="py-2.5 px-3">التخصص المسجل</th>
                              <th className="py-2.5 px-3 text-center">الحالة</th>
                              <th className="py-2.5 px-3 text-center">التاريخ</th>
                            </tr>
                          )}
                          {drilldownEntityType === 'unclassified' && (
                            <tr>
                              <th className="py-2.5 px-3">الفئة</th>
                              <th className="py-2.5 px-3">البيان الرئيسي</th>
                              <th className="py-2.5 px-3">التفاصيل</th>
                              <th className="py-2.5 px-3">سبب عدم التصنيف المرجعي</th>
                            </tr>
                          )}
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {drilldownEntityType === 'tutors' &&
                            (drilldownData.tutors || []).map((item, idx) => (
                              <tr key={item.id || idx} className="hover:bg-slate-50">
                                <td className="py-2.5 px-3 font-black text-brand-navy">
                                  {item.honorific || 'أ.'} {item.name}
                                </td>
                                <td className="py-2.5 px-3 text-slate-600 font-medium">{item.headline || '—'}</td>
                                <td className="py-2.5 px-3 text-center">
                                  <span
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                      item.isPublished
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : 'bg-amber-50 text-amber-700'
                                    }`}
                                  >
                                    {item.isPublished ? 'منشور' : 'مخفي'}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <button
                                    onClick={() => {
                                      setDrilldownTarget(null);
                                      handleOpenTutor(item.id);
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-brand-blue/10 hover:bg-brand-blue hover:text-white text-brand-blue font-bold text-[11px] transition-colors"
                                  >
                                    فتح ملف المعلم
                                  </button>
                                </td>
                              </tr>
                            ))}

                          {drilldownEntityType === 'applicants' &&
                            (drilldownData.applicants || []).map((item, idx) => (
                              <tr key={item.id || idx} className="hover:bg-slate-50">
                                <td className="py-2.5 px-3 font-black text-brand-navy">{item.fullName}</td>
                                <td className="py-2.5 px-3 text-slate-600">
                                  <div className="font-mono text-[11px]">{item.referenceCode || item.id}</div>
                                  <div className="text-[10px] text-slate-400">{item.phone}</div>
                                </td>
                                <td className="py-2.5 px-3 text-center font-bold text-slate-600">
                                  {item.track === 'quran' ? 'قرآن وتأسيس' : 'مناهج دراسية'}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 font-bold text-[10px]">
                                    {item.status === 'submitted'
                                      ? 'قيد المراجعة'
                                      : item.status === 'needs_info'
                                      ? 'مطلوب استكمال بيانات'
                                      : item.status === 'approved'
                                      ? 'مقبول'
                                      : item.status === 'rejected'
                                      ? 'مرفوض'
                                      : item.status}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-center text-[11px] text-slate-500">
                                  {item.createdAt ? new Date(item.createdAt).toLocaleDateString('ar-EG') : '—'}
                                </td>
                              </tr>
                            ))}

                          {drilldownEntityType === 'subscriptions' &&
                            (drilldownData.subscriptions || []).map((item, idx) => (
                              <tr key={item.id || idx} className="hover:bg-slate-50">
                                <td className="py-2.5 px-3 font-black text-brand-navy">{item.studentName}</td>
                                <td className="py-2.5 px-3">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      item.kind === 'private'
                                        ? 'bg-indigo-50 text-indigo-700'
                                        : 'bg-purple-50 text-purple-700'
                                    }`}
                                  >
                                    {item.kind === 'private' ? 'حصة خاصة' : 'مجموعة'}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 font-bold text-slate-700">
                                  <div>{item.tutorName || item.tutorId}</div>
                                  {item.groupTitle && (
                                    <div className="text-[10px] text-purple-700">{item.groupTitle}</div>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-slate-600 font-medium">
                                  {item.specializationLabel || '—'}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <span
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                      item.status === 'confirmed'
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : item.status === 'completed'
                                        ? 'bg-blue-50 text-blue-700'
                                        : item.status === 'cancelled'
                                        ? 'bg-red-50 text-red-700'
                                        : 'bg-amber-50 text-amber-800'
                                    }`}
                                  >
                                    {item.status === 'confirmed'
                                      ? 'مؤكد'
                                      : item.status === 'completed'
                                      ? 'مكتمل'
                                      : item.status === 'cancelled'
                                      ? 'ملغي'
                                      : 'قيد الانتظار'}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-center text-[11px] text-slate-500">
                                  {item.createdAt ? new Date(item.createdAt).toLocaleDateString('ar-EG') : '—'}
                                </td>
                              </tr>
                            ))}

                          {drilldownEntityType === 'unclassified' &&
                            (drilldownData.unclassifiedItems || []).map((item, idx) => (
                              <tr key={item.id || idx} className="hover:bg-slate-50">
                                <td className="py-2.5 px-3 font-bold text-slate-700">{item.category}</td>
                                <td className="py-2.5 px-3 font-black text-brand-navy">{item.title}</td>
                                <td className="py-2.5 px-3 text-slate-600">{item.subtitle || '—'}</td>
                                <td className="py-2.5 px-3 text-red-700 font-bold text-[11px]">{item.reason}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Footer */}
                    {(() => {
                      const currentItemsCount =
                        (drilldownData.tutors?.length || 0) +
                        (drilldownData.applicants?.length || 0) +
                        (drilldownData.subscriptions?.length || 0) +
                        (drilldownData.unclassifiedItems?.length || 0);
                      const startRow = (drilldownData.page - 1) * drilldownData.pageSize + 1;
                      const endRow = Math.min(startRow + currentItemsCount - 1, drilldownData.totalCount);
                      const hasNextPage = endRow < drilldownData.totalCount;

                      return (
                        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-slate-600">
                          <span>
                            إجمالي السجلات: <strong className="text-brand-navy">{drilldownData.totalCount}</strong>{' '}
                            (عرض {startRow} - {endRow})
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setDrilldownPage((p) => Math.max(1, p - 1))}
                              disabled={drilldownPage <= 1 || drilldownLoading}
                              className="px-3 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 inline-flex items-center gap-1"
                            >
                              <ChevronRight size={14} />
                              <span>السابق</span>
                            </button>
                            <button
                              onClick={() => setDrilldownPage((p) => p + 1)}
                              disabled={!hasNextPage || drilldownLoading}
                              className="px-3 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 inline-flex items-center gap-1"
                            >
                              <span>التالي</span>
                              <ChevronLeft size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {(onNavigateTab || onNavigateToApplications) && (
                  <button
                    onClick={() => {
                      setDrilldownTarget(null);
                      handleOpenApplicationsTab();
                    }}
                    className="px-3.5 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs transition-colors inline-flex items-center gap-1.5"
                  >
                    <span>الانتقال لطلبات الانضمام</span>
                    <ExternalLink size={13} />
                  </button>
                )}
                {(onNavigateTab || onNavigateToBookings) && (
                  <button
                    onClick={() => {
                      setDrilldownTarget(null);
                      handleOpenClassesTab();
                    }}
                    className="px-3.5 py-2 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-900 font-bold text-xs transition-colors inline-flex items-center gap-1.5"
                  >
                    <span>الانتقال للحجوزات والمجموعات</span>
                    <ExternalLink size={13} />
                  </button>
                )}
              </div>
              <button
                onClick={() => setDrilldownTarget(null)}
                className="px-5 py-2 rounded-xl bg-brand-navy text-white font-bold text-xs hover:bg-slate-800 transition-colors"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
