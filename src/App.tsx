/**
 * Shatir Classes (شاطر كلاسيز)
 * Main Application Orchestrator
 */

import React, { useState, useEffect } from 'react';
import {
  SearchCriteria,
  Tutor,
  Stage,
  Grade,
  Subject,
  CurriculumOption,
  QuranAgeGroup,
  QuranLevel,
} from './types';
import { DataService } from './services/dataService';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { WhatsAppFloatingButton } from './components/WhatsAppFloatingButton';
import { HomeView } from './components/HomeView';
import { TutorProfileView } from './components/TutorProfileView';
import { TutorRegistrationView } from './components/TutorRegistrationView';
import { AdminDashboardView } from './components/admin/AdminDashboardView';
import { AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import {
  trackPageView,
  trackTutorProfileOpened,
  resetTutorProfileTracking,
} from './services/analytics';

type AppView = 'home' | 'tutor-profile' | 'join-as-tutor' | 'admin';

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>('home');
  const [selectedTutorId, setSelectedTutorId] = useState<string | null>(null);
  const [currentTutor, setCurrentTutor] = useState<Tutor | null>(null);
  const [isTutorLoading, setIsTutorLoading] = useState<boolean>(false);
  const [tutorNotFound, setTutorNotFound] = useState<boolean>(false);

  const [savedCriteria, setSavedCriteria] = useState<SearchCriteria | null>(null);
  const [savedResults, setSavedResults] = useState<Tutor[]>([]);
  const [savedScrollPosition, setSavedScrollPosition] = useState<number>(0);

  // Taxonomy for profile breadcrumbs
  const [stages, setStages] = useState<Stage[]>([]);
  const [curricula, setCurricula] = useState<CurriculumOption[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [quranAges, setQuranAges] = useState<QuranAgeGroup[]>([]);
  const [quranLevels, setQuranLevels] = useState<QuranLevel[]>([]);

  useEffect(() => {
    Promise.all([
      DataService.getStages().catch(() => []),
      DataService.getCurriculumOptions().catch(() => []),
      DataService.getSubjects().catch(() => []),
      DataService.getQuranAgeGroups().catch(() => []),
      DataService.getQuranLevels().catch(() => []),
    ]).then(([stgs, currs, subjs, qAges, qLvls]) => {
      setStages(stgs);
      setCurricula(currs);
      setSubjects(subjs);
      setQuranAges(qAges);
      setQuranLevels(qLvls);
    });
  }, []);

  // Sync with window.location.hash for shareable links & browser back navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#tutor/')) {
        const id = hash.replace('#tutor/', '');
        setSelectedTutorId(id);
        setCurrentView('tutor-profile');
      } else if (hash === '#join-as-tutor') {
        setCurrentView('join-as-tutor');
      } else if (hash.startsWith('#admin')) {
        setCurrentView('admin');
      } else {
        setCurrentView('home');
        if (savedScrollPosition > 0) {
          setTimeout(() => {
            window.scrollTo({ top: savedScrollPosition, behavior: 'smooth' });
          }, 60);
        }
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [savedScrollPosition]);

  // Central Google Analytics 4 page_view and profile opened tracking
  useEffect(() => {
    if (currentView === 'home') {
      trackPageView('/', 'شاطر كلاسيز — منصة أولياء الأمور لاختيار أفضل المعلمين الخصوصيين');
      resetTutorProfileTracking();
    } else if (currentView === 'join-as-tutor') {
      trackPageView('/#join-as-tutor', 'انضم كمعلم | شاطر كلاسيز');
      resetTutorProfileTracking();
    } else if (currentView === 'admin') {
      trackPageView('/#admin', 'لوحة إدارة شاطر كلاسيز');
      resetTutorProfileTracking();
    } else if (currentView === 'tutor-profile' && selectedTutorId) {
      trackPageView(`/#tutor/${selectedTutorId}`, 'ملف المعلم | شاطر كلاسيز');
      trackTutorProfileOpened(selectedTutorId);
    }
  }, [currentView, selectedTutorId]);

  // Fetch tutor from Supabase. If old mock tutor or unpublished, show "ملف المعلم غير متاح"
  useEffect(() => {
    if (selectedTutorId) {
      setIsTutorLoading(true);
      setTutorNotFound(false);
      DataService.getTutorById(selectedTutorId)
        .then((tutor) => {
          if (tutor) {
            setCurrentTutor(tutor);
          } else {
            setCurrentTutor(null);
            setTutorNotFound(true);
          }
        })
        .catch(() => {
          setCurrentTutor(null);
          setTutorNotFound(true);
        })
        .finally(() => {
          setIsTutorLoading(false);
        });
    } else {
      setCurrentTutor(null);
      setIsTutorLoading(false);
      setTutorNotFound(false);
    }
  }, [selectedTutorId]);

  // Handle Tutor Card Click from Search Results
  const handleSelectTutor = (tutorId: string) => {
    setSavedScrollPosition(window.scrollY);
    setSelectedTutorId(tutorId);
    setCurrentView('tutor-profile');
    window.location.hash = `#tutor/${tutorId}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Back button in Tutor Profile View returns to preserved search state
  const handleBackToResults = () => {
    setSelectedTutorId(null);
    setCurrentTutor(null);
    setCurrentView('home');
    window.location.hash = '';

    setTimeout(() => {
      if (savedScrollPosition > 0) {
        window.scrollTo({ top: savedScrollPosition, behavior: 'smooth' });
      } else {
        const resultsEl = document.getElementById('results-section');
        if (resultsEl) {
          resultsEl.scrollIntoView({ behavior: 'smooth' });
        }
      }
    }, 50);
  };

  // View navigation helper
  const handleNavigate = (view: AppView) => {
    setCurrentView(view);
    if (view === 'home') {
      window.location.hash = '';
    } else if (view === 'join-as-tutor') {
      window.location.hash = '#join-as-tutor';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (view === 'admin') {
      window.location.hash = '#admin';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleScrollToSelector = () => {
    document.getElementById('tutor-selector-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSaveSearchState = (criteria: SearchCriteria, results: Tutor[]) => {
    setSavedCriteria(criteria);
    setSavedResults(results);
  };

  // Labels for Profile View Breadcrumbs
  const stageName = stages.find((s) => s.id === savedCriteria?.stageId)?.name;
  const gradeName = savedCriteria?.gradeId;
  const subjectName = subjects.find((s) => s.id === savedCriteria?.subjectId)?.name;
  const curriculumName = curricula.find((c) => c.id === savedCriteria?.curriculumType)?.name;
  const quranAgeName = quranAges.find((a) => a.id === savedCriteria?.ageGroupId)?.name;
  const quranLevelName = quranLevels.find((l) => l.id === savedCriteria?.levelId)?.name;

  return (
    <div className="min-h-screen bg-[#F8F9FC] text-[#1F2A44] flex flex-col font-['Tajawal'] antialiased selection:bg-[#0D4E8B]/15 selection:text-[#0D4E8B]">
      {/* Top Navigation */}
      <Header
        currentView={currentView}
        onNavigate={handleNavigate}
        onScrollToSelector={handleScrollToSelector}
      />

      {/* Main View Router */}
      <main className="flex-1 w-full">
        {currentView === 'home' && (
          <HomeView
            onSelectTutor={handleSelectTutor}
            onNavigateToJoin={() => handleNavigate('join-as-tutor')}
            savedCriteria={savedCriteria}
            savedResults={savedResults}
            onSaveCriteria={handleSaveSearchState}
          />
        )}

        {currentView === 'tutor-profile' && (
          <div className="w-full">
            {isTutorLoading ? (
              <div className="max-w-md mx-auto my-20 p-10 bg-white rounded-3xl border border-[#E2E8F0] shadow-sm text-center flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 text-[#0D4E8B] animate-spin" />
                <p className="text-sm font-medium text-[#64748B]">جاري تحميل ملف المعلم...</p>
              </div>
            ) : currentTutor ? (
              <TutorProfileView
                tutor={currentTutor}
                criteria={savedCriteria || undefined}
                onBack={handleBackToResults}
                stageName={stageName}
                gradeName={gradeName}
                subjectName={subjectName}
                curriculumName={curriculumName}
                quranAgeName={quranAgeName}
                quranLevelName={quranLevelName}
              />
            ) : tutorNotFound ? (
              <div className="max-w-md mx-auto my-16 px-6 py-10 bg-white rounded-3xl border border-[#E2E8F0] shadow-sm text-center space-y-4">
                <div className="w-14 h-14 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                  <AlertCircle className="w-7 h-7 text-slate-500" />
                </div>
                <div className="space-y-1">
                  <h2 className="font-['Cairo'] text-xl font-bold text-[#1F2A44]">
                    ملف المعلم غير متاح
                  </h2>
                  <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed">
                    هذا الملف غير متوفر حالياً أو لم يتم نشره بعد. يمكنك العودة للصفحة الرئيسية واستعراض التخصصات المتاحة.
                  </p>
                </div>
                <div className="pt-2">
                  <button
                    onClick={handleBackToResults}
                    className="px-6 py-2.5 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs sm:text-sm font-bold shadow-sm transition-all inline-flex items-center gap-2 cursor-pointer"
                  >
                    <span>العودة إلى الصفحة الرئيسية</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {currentView === 'join-as-tutor' && <TutorRegistrationView />}

        {currentView === 'admin' && (
          <AdminDashboardView onNavigateHome={() => handleNavigate('home')} />
        )}
      </main>

      {/* Global Footer */}
      <Footer onNavigate={handleNavigate} />

      {/* Persistent Floating WhatsApp Action Button */}
      <WhatsAppFloatingButton />
    </div>
  );
}
