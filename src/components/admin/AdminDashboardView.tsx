import React, { useState, useEffect } from 'react';
import { AdminUser, AdminTutorFullDetail, Tutor } from '../../types';
import { AdminAuthService } from '../../services/adminAuthService';
import { AdminService, AdminTutorListItem } from '../../services/adminService';
import { AdminLoginView } from './AdminLoginView';
import { AdminTutorsListView } from './AdminTutorsListView';
import { AdminTutorEditorView } from './AdminTutorEditorView';
import { AdminApplicationsListView } from './AdminApplicationsListView';
import { AdminApplicationDetailView } from './AdminApplicationDetailView';
import { TutorProfileView } from '../TutorProfileView';
import {
  ShieldCheck,
  LogOut,
  ExternalLink,
  Loader2,
  AlertCircle,
  Eye,
  ArrowRight,
  Users,
  FileCheck2,
} from 'lucide-react';

interface AdminDashboardViewProps {
  onNavigateHome: () => void;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({ onNavigateHome }) => {
  const [currentAdmin, setCurrentAdmin] = useState<AdminUser | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Top Nav Tab: 'tutors' | 'applications'
  const [activeTab, setActiveTab] = useState<'tutors' | 'applications'>('tutors');
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

  useEffect(() => {
    if (currentAdmin && currentMode === 'list') {
      loadTutors();
    }
  }, [currentAdmin, currentMode]);

  // Handle Edit Tutor
  const handleEditTutor = async (tutorId: string) => {
    setSelectedTutorId(tutorId);
    setIsEditorLoading(true);
    setGlobalError(null);
    try {
      const detail = await AdminService.getTutorForEdit(tutorId);
      setEditorDetail(detail);
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
      <div className="flex items-center gap-2 border-b border-[#E2E8F0] pb-2">
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
        <AdminTutorsListView
          tutors={tutorsList}
          isLoading={isTutorsLoading}
          onRefresh={loadTutors}
          onEditTutor={handleEditTutor}
          onNewTutor={handleNewTutor}
          onPreviewTutor={handlePreviewTutor}
          onTogglePublish={handleTogglePublish}
        />
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
