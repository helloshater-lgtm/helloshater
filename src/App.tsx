/**
 * Shatir Classes (شاطر كلاسيز)
 * Main Application Orchestrator
 */

import React, { useState, useEffect } from 'react';
import { SearchCriteria, Tutor } from './types';
import { DataService, STAGES_DATA, GRADES_DATA, SUBJECTS_DATA, CURRICULUM_OPTIONS, QURAN_AGE_GROUPS, QURAN_LEVELS } from './services/dataService';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { HomeView } from './components/HomeView';
import { TutorProfileView } from './components/TutorProfileView';
import { TutorRegistrationView } from './components/TutorRegistrationView';

type AppView = 'home' | 'tutor-profile' | 'join-as-tutor';

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>('home');
  const [selectedTutorId, setSelectedTutorId] = useState<string | null>(null);
  const [currentTutor, setCurrentTutor] = useState<Tutor | null>(null);
  const [savedCriteria, setSavedCriteria] = useState<SearchCriteria | null>(null);
  const [savedResults, setSavedResults] = useState<Tutor[]>([]);
  const [savedScrollPosition, setSavedScrollPosition] = useState<number>(0);

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
      } else {
        setCurrentView('home');
        // Restore scroll position when returning to home view via browser back
        if (savedScrollPosition > 0) {
          setTimeout(() => {
            window.scrollTo({ top: savedScrollPosition, behavior: 'smooth' });
          }, 60);
        }
      }
    };

    // Initial check on load
    handleHashChange();

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [savedScrollPosition]);

  // Fetch tutor data whenever selectedTutorId changes
  useEffect(() => {
    if (selectedTutorId) {
      DataService.getTutorById(selectedTutorId).then((tutor) => {
        if (tutor) {
          setCurrentTutor(tutor);
        } else {
          // Default to first tutor (Nada El-Minshawy) if invalid ID
          DataService.getTutorById('nada-elminshawy').then(setCurrentTutor);
        }
      });
    }
  }, [selectedTutorId]);

  // Navigate to Tutor Profile
  const handleSelectTutor = (tutorId: string) => {
    setSavedScrollPosition(window.scrollY);
    setSelectedTutorId(tutorId);
    setCurrentView('tutor-profile');
    window.location.hash = `#tutor/${tutorId}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Back from profile to search results
  const handleBackToResults = () => {
    setCurrentView('home');
    window.location.hash = '';
    // Restore scroll position
    setTimeout(() => {
      if (savedCriteria && savedScrollPosition > 0) {
        window.scrollTo({ top: savedScrollPosition, behavior: 'smooth' });
      } else {
        document.getElementById('tutor-selector-section')?.scrollIntoView({ behavior: 'smooth' });
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
    }
  };

  const handleScrollToSelector = () => {
    document.getElementById('tutor-selector-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSaveSearchState = (criteria: SearchCriteria, results: Tutor[]) => {
    setSavedCriteria(criteria);
    setSavedResults(results);
  };

  // Human readable label helpers for Profile View Breadcrumbs (authentic labels, no fake fallback defaults)
  const stageName = STAGES_DATA.find((s) => s.id === savedCriteria?.stageId)?.name;
  const gradeName = GRADES_DATA.find((g) => g.id === savedCriteria?.gradeId)?.name;
  const subjectName = SUBJECTS_DATA.find((s) => s.id === savedCriteria?.subjectId)?.name;
  const curriculumName = CURRICULUM_OPTIONS.find((c) => c.id === savedCriteria?.curriculumType)?.name;
  const quranAgeName = QURAN_AGE_GROUPS.find((a) => a.id === savedCriteria?.ageGroupId)?.name;
  const quranLevelName = QURAN_LEVELS.find((l) => l.id === savedCriteria?.levelId)?.name;

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

        {currentView === 'tutor-profile' && currentTutor && (
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
        )}

        {currentView === 'join-as-tutor' && (
          <TutorRegistrationView />
        )}
      </main>

      {/* Educational Trust Footer */}
      <Footer onNavigate={handleNavigate} />
    </div>
  );
}
