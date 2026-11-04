import React, { useState, useEffect } from 'react';
import {
  AdminUser,
  AdminTutorFullDetail,
  Tutor,
  AdminTutorProfileEditRecord,
  AdminProfileDraftItem,
} from '../../types';
import { AdminAuthService } from '../../services/adminAuthService';
import { AdminService, AdminTutorListItem } from '../../services/adminService';
import { AdminLoginView } from './AdminLoginView';
import { AdminTutorsListView } from './AdminTutorsListView';
import { AdminTutorEditorView } from './AdminTutorEditorView';
import { AdminApplicationsListView } from './AdminApplicationsListView';
import { AdminApplicationDetailView } from './AdminApplicationDetailView';
import { AdminClassesManagementView } from './AdminClassesManagementView';
import { AdminStatisticsView } from './AdminStatisticsView';
import { TutorProfileView } from '../TutorProfileView';
import {
  ShieldCheck,
  LogOut,
  ExternalLink,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Eye,
  ArrowRight,
  Users,
  FileCheck2,
  Calendar,
  BarChart3,
  History,
  RotateCcw,
  RefreshCw,
} from 'lucide-react';

interface AdminDashboardViewProps {
  onNavigateHome: () => void;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({ onNavigateHome }) => {
  const [currentAdmin, setCurrentAdmin] = useState<AdminUser | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Top Nav Tab: 'tutors' | 'recent-edits' | 'applications' | 'classes' | 'statistics'
  const [activeTab, setActiveTab] = useState<
    'tutors' | 'recent-edits' | 'applications' | 'classes' | 'statistics'
  >('tutors');
  const [pendingApplicationsCount, setPendingApplicationsCount] = useState<number>(0);

  // Sub-Views: 'list' | 'edit' | 'new' | 'preview' | 'app-detail'
  const [currentMode, setCurrentMode] = useState<'list' | 'edit' | 'new' | 'preview' | 'app-detail'>('list');
  const [selectedTutorId, setSelectedTutorId] = useState<string | null>(null);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);

  // Data states
  const [tutorsList, setTutorsList] = useState<AdminTutorListItem[]>([]);
  const [isTutorsLoading, setIsTutorsLoading] = useState(false);
  const [editorDetail, setEditorDetail] = useState<AdminTutorFullDetail | null>(null);
  const [isEditorLoading, setIsEditorLoading] = useState(false);
  const [previewTutor, setPreviewTutor] = useState<Tutor | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Recent tutor profile edits & pending avatar/profile drafts state
  const [recentEdits, setRecentEdits] = useState<AdminTutorProfileEditRecord[]>([]);
  const [pendingDrafts, setPendingDrafts] = useState<AdminProfileDraftItem[]>([]);
  const [isLoadingEdits, setIsLoadingEdits] = useState(false);
  const [editsError, setEditsError] = useState<string | null>(null);
  const [editsSuccessMsg, setEditsSuccessMsg] = useState<string | null>(null);
  const [confirmRevertId, setConfirmRevertId] = useState<string | null>(null);
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [draftNotesMap, setDraftNotesMap] = useState<Record<string, string>>({});
  const [reviewingDraftId, setReviewingDraftId] = useState<string | null>(null);

  // Check initial auth on mount
  useEffect(() => {
    AdminAuthService.getCurrentAdmin()
      .then((admin) => {
        setCurrentAdmin(admin);
      })
      .finally(() => {
        setIsCheckingAuth(false);
      });

    const unsubscribe = AdminAuthService.onAuthStateChange((admin) => {
      setCurrentAdmin(admin);
    });

    return () => unsubscribe();
  }, []);

  // Load tutors list whenever admin is logged in and mode is 'list'
  const loadTutors = async () => {
    setIsTutorsLoading(true);
    setGlobalError(null);
    try {
      const list = await AdminService.getTutorsList();
      setTutorsList(list);
    } catch (err: any) {
      setGlobalError(err?.message || 'تعذر تحميل قائمة المعلمين.');
    } finally {
      setIsTutorsLoading(false);
    }
  };

  // Load recent profile text edits & pending profile drafts
  const loadRecentEditsAndDrafts = async () => {
    setIsLoadingEdits(true);
    setEditsError(null);
    try {
      const [edits, drafts] = await Promise.all([
        AdminService.getRecentTutorProfileEdits(50),
        AdminService.getPendingProfileDrafts().catch(() => [] as AdminProfileDraftItem[]),
      ]);
      setRecentEdits(edits);
      setPendingDrafts(drafts);
    } catch (err: any) {
      setEditsError(err?.message || 'تعذر تحميل سجل آخر تعديلات المعلمين.');
    } finally {
      setIsLoadingEdits(false);
    }
  };

  useEffect(() => {
    if (currentAdmin && currentMode === 'list') {
      loadTutors();
      loadRecentEditsAndDrafts();
    }
  }, [currentAdmin, currentMode]);

  useEffect(() => {
    if (currentAdmin && activeTab === 'recent-edits') {
      loadRecentEditsAndDrafts();
    }
  }, [currentAdmin, activeTab]);

  // Handle revert tutor profile edit after confirmation
  const handleConfirmRevertEdit = async (historyId: string) => {
    setRevertingId(historyId);
    setEditsError(null);
    setEditsSuccessMsg(null);
    try {
      await AdminService.revertTutorProfileEdit(historyId);
      setConfirmRevertId(null);
      setEditsSuccessMsg('تم استرجاع النسخة السابقة بنجاح وتحديث ملف المعلم.');
      await Promise.all([loadRecentEditsAndDrafts(), loadTutors()]);
      setTimeout(() => setEditsSuccessMsg(null), 4000);
    } catch (err: any) {
      setEditsError(err?.message || 'فشل استرجاع النسخة السابقة.');
    } finally {
      setRevertingId(null);
    }
  };

  // Handle reviewing a pending profile draft (such as avatar-only draft)
  const handleReviewDraftItem = async (
    draftId: string,
    action: 'approve' | 'needs_revision' | 'reject'
  ) => {
    const notes = (draftNotesMap[draftId] || '').trim();
    if ((action === 'needs_revision' || action === 'reject') && !notes) {
      setEditsError('يرجى كتابة سبب طلب التعديل أو الرفض قبل الإرسال للمعلم.');
      return;
    }

    setReviewingDraftId(draftId);
    setEditsError(null);
    setEditsSuccessMsg(null);

    try {
      await AdminService.reviewProfileDraft(draftId, action, notes || undefined);
      setEditsSuccessMsg(
        action === 'approve'
          ? 'تم اعتماد الصورة/المسودة وتحديث ملف المعلم.'
          : action === 'needs_revision'
          ? 'تم إرسال طلب التعديل إلى المعلم.'
          : 'تم رفض المسودة.'
      );
      await Promise.all([loadRecentEditsAndDrafts(), loadTutors()]);
      setTimeout(() => setEditsSuccessMsg(null), 4000);
    } catch (err: any) {
      setEditsError(err?.message || 'فشل تنفيذ قرار مراجعة المسودة.');
    } finally {
      setReviewingDraftId(null);
    }
  };

  // Handle Edit Tutor
  const handleEditTutor = async (tutorId: string) => {
    setSelectedTutorId(tutorId);
    setIsEditorLoading(true);
    setGlobalError(null);
    try {
      const detail = await AdminService.getTutorForEdit(tutorId);
      setEditorDetail(detail);
      setActiveTab('tutors');
      setCurrentMode('edit');
    } catch (err: any) {
      setGlobalError(err?.message || 'فشل تحميل بيانات المعلم للتعديل.');
    } finally {
      setIsEditorLoading(false);
    }
  };

  // Handle New Tutor
  const handleNewTutor = () => {
    setSelectedTutorId(null);
    setEditorDetail(null);
    setActiveTab('tutors');
    setCurrentMode('new');
  };

  // Handle Preview Tutor
  const handlePreviewTutor = async (tutorId: string) => {
    try {
      const detail = await AdminService.getTutorForEdit(tutorId);
      setPreviewTutor(detail.tutor);
      setCurrentMode('preview');
    } catch (err: any) {
      setGlobalError(err?.message || 'تعذر تحميل ملف المعلم للمعاينة.');
    }
  };

  // Handle Toggle Publish from list
  const handleTogglePublish = async (tutorId: string, currentStatus: boolean) => {
    setGlobalError(null);
    try {
      await AdminService.toggleTutorPublish(tutorId, !currentStatus);
      await loadTutors();
    } catch (err: any) {
      setGlobalError(err?.message || 'فشل تحديث حالة النشر.');
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    await AdminAuthService.signOut();
    setCurrentAdmin(null);
    setCurrentMode('list');
  };

  const renderRecentTutorProfileEditsSection = () => (
    <div className="space-y-6">
      {/* Feedback Banners */}
      {editsSuccessMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm flex items-center gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{editsSuccessMsg}</span>
        </div>
      )}

      {editsError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold block">خطأ:</span>
            <span>{editsError}</span>
          </div>
        </div>
      )}

      {/* Pending Profile Drafts (Image-only drafts with headline === null are rendered without empty text fields) */}
      {pendingDrafts.length > 0 && (
        <div className="bg-amber-50/70 rounded-2xl border border-amber-200 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-['Cairo'] text-base font-bold text-[#1F2A44]">
              صور ومسودات معلمين بانتظار المراجعة ({pendingDrafts.length})
            </h2>
          </div>

          <div className="space-y-4">
            {pendingDrafts.map((draft) => {
              const isImageOnly =
                draft.headline === null &&
                !draft.helpChildQuote &&
                !draft.helpChildSummary;

              return (
                <div
                  key={draft.id}
                  className="bg-white rounded-xl border border-amber-200 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-['Cairo'] text-sm font-bold text-[#1F2A44]">
                        {draft.tutorName}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[11px] font-bold">
                        {isImageOnly ? 'صورة شخصية جديدة' : 'مسودة ملف شخصي'}
                      </span>
                    </div>
                    {draft.submittedAt && (
                      <span className="text-[11px] text-[#64748B]">
                        {new Date(draft.submittedAt).toLocaleString('ar-EG')}
                      </span>
                    )}
                  </div>

                  {/* Image Preview */}
                  {(draft.avatarUrl || draft.pendingAvatarSignedUrl || isImageOnly) && (
                    <div className="flex flex-wrap items-center gap-6 py-2">
                      {draft.currentAvatarUrl && (
                        <div className="flex items-center gap-2.5">
                          <img
                            src={draft.currentAvatarUrl}
                            alt="الصورة الحالية"
                            className="w-14 h-14 rounded-2xl object-cover border border-slate-200"
                          />
                          <span className="text-xs text-[#64748B]">الصورة الحالية</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2.5">
                        {draft.pendingAvatarSignedUrl ? (
                          <img
                            src={draft.pendingAvatarSignedUrl}
                            alt="الصورة الجديدة"
                            className="w-16 h-16 rounded-2xl object-cover border-2 border-amber-400"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] text-[#64748B] text-center p-1">
                            صورة مرفوعة
                          </div>
                        )}
                        <span className="text-xs font-bold text-amber-800">
                          الصورة الجديدة المقترحة
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Only show text fields if they are NOT null (do not show empty text fields when headline === null) */}
                  {!isImageOnly && (
                    <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
                      {draft.headline !== null && (
                        <div>
                          <span className="font-bold text-[#64748B]">الجملة القصيرة: </span>
                          <span className="text-[#1F2A44]">{draft.headline}</span>
                        </div>
                      )}
                      {draft.helpChildQuote !== null && (
                        <div>
                          <span className="font-bold text-[#64748B]">جملة مساعدة الطفل: </span>
                          <span className="text-[#1F2A44]">{draft.helpChildQuote}</span>
                        </div>
                      )}
                      {draft.helpChildSummary !== null && (
                        <div>
                          <span className="font-bold text-[#64748B]">النبذة: </span>
                          <p className="text-[#1F2A44] whitespace-pre-line mt-0.5">
                            {draft.helpChildSummary}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2">
                    <input
                      type="text"
                      value={draftNotesMap[draft.id] || ''}
                      onChange={(e) =>
                        setDraftNotesMap((prev) => ({ ...prev, [draft.id]: e.target.value }))
                      }
                      placeholder="سبب طلب التعديل أو الرفض (إن وجد)..."
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs text-[#1F2A44] focus:outline-hidden focus:border-[#0D4E8B]"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={reviewingDraftId === draft.id}
                        onClick={() => handleReviewDraftItem(draft.id, 'approve')}
                        className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                      >
                        اعتماد
                      </button>
                      <button
                        type="button"
                        disabled={reviewingDraftId === draft.id}
                        onClick={() => handleReviewDraftItem(draft.id, 'needs_revision')}
                        className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                      >
                        طلب تعديل
                      </button>
                      <button
                        type="button"
                        disabled={reviewingDraftId === draft.id}
                        onClick={() => handleReviewDraftItem(draft.id, 'reject')}
                        className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                      >
                        رفض
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Section: آخر تعديلات المعلمين */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#F0F6FD] text-[#0D4E8B] flex items-center justify-center shrink-0">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-['Cairo'] text-base sm:text-lg font-bold text-[#1F2A44]">
                آخر تعديلات المعلمين
              </h2>
              <p className="text-xs text-[#64748B]">
                سجل التعديلات الفورية للنصوص في ملفات المعلمين مع إمكانية استرجاع النسخة السابقة
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={loadRecentEditsAndDrafts}
            disabled={isLoadingEdits}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#1F2A44] text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingEdits ? 'animate-spin' : ''}`} />
            <span>تحديث السجل</span>
          </button>
        </div>

        {isLoadingEdits ? (
          <div className="py-10 text-center flex flex-col items-center justify-center gap-2.5">
            <Loader2 className="w-6 h-6 text-[#0D4E8B] animate-spin" />
            <p className="text-xs text-[#64748B]">جاري تحميل آخر تعديلات المعلمين...</p>
          </div>
        ) : recentEdits.length === 0 ? (
          <div className="py-10 text-center text-xs sm:text-sm text-[#64748B] bg-slate-50 rounded-xl border border-slate-100">
            لا توجد تعديلات نصية مسجلة للمعلمين حتى الآن.
          </div>
        ) : (
          <div className="space-y-4">
            {recentEdits.map((edit) => {
              const isAlreadyReverted = Boolean(edit.revertedAt);
              const isAdminRevertSource = edit.source === 'admin_revert';
              const hideRevertButton = isAlreadyReverted || isAdminRevertSource;
              const isConfirmingThis = confirmRevertId === edit.id;
              const isRevertingThis = revertingId === edit.id;

              return (
                <div
                  key={edit.id}
                  className="rounded-xl border border-[#E2E8F0] p-4 space-y-3 bg-[#F8FAFC]/60"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => edit.tutorId && handleEditTutor(edit.tutorId)}
                        className="font-['Cairo'] text-sm font-bold text-[#0D4E8B] hover:underline cursor-pointer"
                      >
                        {edit.tutorName}
                      </button>
                      <span className="text-xs text-[#64748B]">
                        · {new Date(edit.createdAt).toLocaleString('ar-EG')}
                      </span>
                      {isAlreadyReverted && (
                        <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 text-[11px] font-bold">
                          تم استرجاعه
                        </span>
                      )}
                      {isAdminRevertSource && (
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 text-[#0D4E8B] text-[11px] font-bold">
                          استرجاع إداري
                        </span>
                      )}
                    </div>

                    {!hideRevertButton && (
                      <div>
                        {!isConfirmingThis ? (
                          <button
                            type="button"
                            onClick={() => setConfirmRevertId(edit.id)}
                            className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>استرجاع النسخة السابقة</span>
                          </button>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl">
                            <span className="text-xs font-bold text-amber-900">
                              تأكيد استرجاع النسخة السابقة؟
                            </span>
                            <button
                              type="button"
                              disabled={isRevertingThis}
                              onClick={() => handleConfirmRevertEdit(edit.id)}
                              className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50 flex items-center gap-1"
                            >
                              {isRevertingThis && <Loader2 className="w-3 h-3 animate-spin" />}
                              <span>تأكيد</span>
                            </button>
                            <button
                              type="button"
                              disabled={isRevertingThis}
                              onClick={() => setConfirmRevertId(null)}
                              className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold cursor-pointer"
                            >
                              إلغاء
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Changed Fields Before/After */}
                  <div className="space-y-2.5">
                    {edit.changes.map((ch, cIdx) => (
                      <div
                        key={`${edit.id}-${ch.fieldKey}-${cIdx}`}
                        className="bg-white rounded-xl border border-slate-200/80 p-3 space-y-2 text-xs"
                      >
                        <div className="font-bold text-[#1F2A44]">{ch.fieldLabel}</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div className="p-2.5 rounded-lg bg-rose-50/60 border border-rose-100 space-y-1">
                            <span className="text-[11px] font-bold text-rose-700 block">
                              قبل التعديل:
                            </span>
                            <p className="text-[#1F2A44] whitespace-pre-line leading-relaxed">
                              {ch.beforeValue && ch.beforeValue.trim()
                                ? ch.beforeValue
                                : '— فارغ —'}
                            </p>
                          </div>
                          <div className="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-100 space-y-1">
                            <span className="text-[11px] font-bold text-emerald-700 block">
                              بعد التعديل:
                            </span>
                            <p className="text-[#1F2A44] whitespace-pre-line leading-relaxed">
                              {ch.afterValue && ch.afterValue.trim()
                                ? ch.afterValue
                                : '— فارغ —'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  if (isCheckingAuth) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-[#0D4E8B] animate-spin" />
        <p className="text-xs sm:text-sm text-[#64748B]">جاري التحقق من صلاحيات الإدارة...</p>
      </div>
    );
  }

  // Not logged in -> Show Admin Login Screen
  if (!currentAdmin) {
    return (
      <AdminLoginView
        onLoginSuccess={(admin) => {
          setCurrentAdmin(admin);
          setCurrentMode('list');
        }}
        onNavigateHome={onNavigateHome}
      />
    );
  }

  // Preview Mode: Renders public TutorProfileView with an admin banner
  if (currentMode === 'preview' && previewTutor) {
    return (
      <div className="w-full space-y-4 pb-12">
        {/* Admin Preview Top Bar */}
        <div className="bg-[#1F2A44] text-white px-4 py-3 flex items-center justify-between text-xs font-bold sticky top-0 z-50 shadow-md">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-[#FFC629]" />
            <span>معاينة إدارية لملف المعلم: {previewTutor.name}</span>
            <span className="text-slate-400">·</span>
            <span className={previewTutor.isPublished ? 'text-emerald-400' : 'text-amber-400'}>
              ({previewTutor.isPublished ? 'منشور حالياً' : 'غير منشور — معاينة للمشرف فقط'})
            </span>
          </div>

          <button
            type="button"
            onClick={() => setCurrentMode('list')}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span>العودة للوحة الإدارة</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* The Public Tutor Profile View */}
        <TutorProfileView
          tutor={previewTutor}
          onBack={() => setCurrentMode('list')}
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Admin Dashboard Header */}
      <header className="bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0D4E8B] text-white flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-['Cairo'] text-lg font-bold text-[#1F2A44]">
                لوحة إدارة شاطر كلاسيز
              </h1>
              <span className="text-[11px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded font-mono font-bold">
                {currentAdmin.role}
              </span>
            </div>
            <p className="text-xs text-[#64748B]">
              المسؤول: <span dir="ltr">{currentAdmin.email}</span>
            </p>
          </div>
        </div>

        {/* Top Header Actions */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={onNavigateHome}
            className="px-3 py-2 rounded-xl text-xs font-bold text-[#64748B] hover:text-[#0D4E8B] hover:bg-[#F0F6FD] transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>عرض الموقع العام</span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            title="تسجيل الخروج"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>خروج</span>
          </button>
        </div>
      </header>

      {/* Main Section Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#E2E8F0] pb-2">
        <button
          type="button"
          onClick={() => {
            setActiveTab('tutors');
            setCurrentMode('list');
          }}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold font-['Cairo'] transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'tutors'
              ? 'bg-[#0D4E8B] text-white shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2A44] hover:bg-slate-100'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>إدارة المعلمين ({tutorsList.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('recent-edits');
            setCurrentMode('list');
          }}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold font-['Cairo'] transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'recent-edits'
              ? 'bg-[#0D4E8B] text-white shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2A44] hover:bg-slate-100'
          }`}
        >
          <History className="w-4 h-4" />
          <span>آخر تعديلات المعلمين</span>
          {pendingDrafts.length > 0 && (
            <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
              {pendingDrafts.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('applications');
            setCurrentMode('list');
          }}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold font-['Cairo'] transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'applications'
              ? 'bg-[#0D4E8B] text-white shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2A44] hover:bg-slate-100'
          }`}
        >
          <FileCheck2 className="w-4 h-4" />
          <span>طلبات الانضمام</span>
          {pendingApplicationsCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
              {pendingApplicationsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('classes');
            setCurrentMode('list');
          }}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold font-['Cairo'] transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'classes'
              ? 'bg-[#0D4E8B] text-white shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2A44] hover:bg-slate-100'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>الحصص والمجموعات</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('statistics');
            setCurrentMode('list');
          }}
          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold font-['Cairo'] transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'statistics'
              ? 'bg-[#0D4E8B] text-white shadow-xs'
              : 'text-[#64748B] hover:text-[#1F2A44] hover:bg-slate-100'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>الإحصائيات</span>
        </button>
      </div>

      {/* Global Error Banner */}
      {globalError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold block">تنبيه:</span>
            <span>{globalError}</span>
          </div>
        </div>
      )}

      {/* Mode Switcher */}
      {isEditorLoading ? (
        <div className="bg-white p-12 rounded-2xl border border-[#E2E8F0] text-center flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-[#0D4E8B] animate-spin" />
          <p className="text-xs sm:text-sm text-[#64748B] font-medium">جاري تحميل بيانات المعلم بالكامل...</p>
        </div>
      ) : activeTab === 'recent-edits' ? (
        renderRecentTutorProfileEditsSection()
      ) : activeTab === 'statistics' ? (
        <AdminStatisticsView
          onEditTutor={(tutorId) => {
            setActiveTab('tutors');
            handleEditTutor(tutorId);
          }}
          onNavigateTab={(tab) => {
            setActiveTab(tab);
            setCurrentMode('list');
          }}
        />
      ) : activeTab === 'classes' ? (
        <AdminClassesManagementView
          onNotify={(msg, type) => {
            if (type === 'error') setGlobalError(msg);
          }}
        />
      ) : activeTab === 'applications' ? (
        currentMode === 'app-detail' && selectedApplicationId ? (
          <AdminApplicationDetailView
            applicationId={selectedApplicationId}
            onBack={() => {
              setCurrentMode('list');
              setSelectedApplicationId(null);
            }}
            onNavigateToTutorEdit={(tutorId) => {
              setActiveTab('tutors');
              handleEditTutor(tutorId);
            }}
            onDecisionCompleted={() => {
              loadTutors();
              AdminService.getApplications(undefined)
                .then((apps) => {
                  const count = apps.filter(
                    (a) => a.status !== 'draft' && (a.status === 'submitted' || a.status === 'pending_review' || a.status === 'interview_scheduled' || a.status === 'needs_info')
                  ).length;
                  setPendingApplicationsCount(count);
                })
                .catch(() => {});
            }}
          />
        ) : (
          <AdminApplicationsListView
            onSelectApplication={(appId) => {
              setSelectedApplicationId(appId);
              setCurrentMode('app-detail');
            }}
            onUpdatePendingCount={(count) => setPendingApplicationsCount(count)}
          />
        )
      ) : currentMode === 'list' ? (
        <div className="space-y-8">
          <AdminTutorsListView
            tutors={tutorsList}
            isLoading={isTutorsLoading}
            onRefresh={loadTutors}
            onEditTutor={handleEditTutor}
            onNewTutor={handleNewTutor}
            onPreviewTutor={handlePreviewTutor}
            onTogglePublish={handleTogglePublish}
          />
          {renderRecentTutorProfileEditsSection()}
        </div>
      ) : (
        <AdminTutorEditorView
          initialDetail={editorDetail}
          isNew={currentMode === 'new'}
          onBack={() => {
            setCurrentMode('list');
            loadTutors();
          }}
          onSaved={(savedId) => {
            loadTutors();
          }}
          onPreview={(id) => handlePreviewTutor(id)}
        />
      )}
    </div>
  );
};

