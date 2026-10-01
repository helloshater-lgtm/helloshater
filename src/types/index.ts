/**
 * Shatir Classes (شاطر كلاسيز)
 * Core Domain Types & Data Contracts
 */

export type TrackType = 'school' | 'quran';

export type StageId = 'elementary' | 'preparatory' | 'secondary';

export interface Stage {
  id: StageId;
  name: string;
  gradesDesc: string;
  order: number;
}

export interface Grade {
  id: string;
  stageId: StageId;
  name: string;
  order: number;
}

export interface Subject {
  id: string;
  name: string;
  englishName?: string;
  category: 'core' | 'languages' | 'sciences' | 'social';
}

export type CurriculumType = 'national_arabic' | 'languages_experimental' | 'international';

export interface CurriculumOption {
  id: CurriculumType;
  name: string;
  description: string;
}

// Quran & Foundation Track
export interface QuranAgeGroup {
  id: string;
  name: string;
  ageRange: string;
}

export interface QuranLevel {
  id: string;
  name: string;
  description: string;
}

// Precise teaching offering mapping (Subject + Grade + Curriculum)
export interface SchoolOffering {
  track: 'school';
  stageId: StageId;
  gradeId: string;
  subjectId: string;
  curriculumType: CurriculumType;
}

export interface QuranOffering {
  track: 'quran';
  ageGroupId: string;
  levelId: string;
}

export type TutorOffering = SchoolOffering | QuranOffering;

export interface TutorQualification {
  title: string;
  institution: string;
  verified: boolean;
  notes?: string;
}

export interface MethodologyPillar {
  title: string;
  description: string;
  iconName: string;
}

export interface TrialStep {
  stepNumber: number;
  title: string;
  description: string;
}

export interface Tutor {
  id: string;
  name: string;
  honorific: string; // e.g. "أ." or "د."
  headline: string;
  avatarUrl: string;
  verifiedCredentials: boolean;
  yearsOfExperience: number;
  experienceBadgeText: string;
  curriculumTags: string[];
  hourlyRateMin: number;
  hourlyRateMax: number;
  currency: string;
  sessionDurationMinutes: number;
  trialDurationMinutes: number;
  rating: number;
  reviewsCount: number;
  totalStudentsTaught: number;
  videoPreview?: {
    available: boolean;
    title: string;
    durationText: string;
    description: string;
    thumbnailUrl?: string;
  };
  helpChildQuote: string;
  helpChildSummary: string;
  methodologyPillars: MethodologyPillar[];
  targetStudentCases?: string[];
  subjectsTaughtSummary: {
    title: string;
    gradesRange: string;
    curriculumNote: string;
    icon: 'math' | 'shapes' | 'arabic' | 'science' | 'book';
  }[];
  whatHappensInTrial: TrialStep[];
  qualifications: TutorQualification[];
  offerings: TutorOffering[];
}

export interface SearchCriteria {
  track: TrackType;
  // School parameters
  stageId?: StageId | '';
  gradeId?: string;
  subjectId?: string;
  curriculumType?: CurriculumType | '';
  // Quran parameters
  ageGroupId?: string;
  levelId?: string;
}

export interface TutorApplicationFormData {
  fullName: string;
  countryCode: string;
  phone: string;
  track: TrackType;
  subjects: string[];
  stages: StageId[];
  curricula: CurriculumType[];
  quranAgeGroups: string[];
  quranLevels: string[];
  experienceYears: string;
  academicDegree: string;
  portfolioUrl: string;
  termsAccepted: boolean;
  termsPolicyVersion?: string;
}

export interface TutorApplicationRecord extends TutorApplicationFormData {
  id: string;
  referenceCode: string;
  createdAt: string;
  status: 'pending_review' | 'interview_scheduled' | 'approved' | 'rejected';
}

export interface TutorAvailableSlot {
  id: string;
  tutorId: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
  isAvailable: boolean;
  createdAt?: string;
  updatedAt?: string;
}
