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
  rating: number | null;
  reviewsCount: number;
  totalStudentsTaught: number;
  isPublished?: boolean;
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

export interface SchoolSpecializationItem {
  id: string;
  subjectId: string;
  teachingLanguage: 'arabic' | 'english';
  curriculumType: CurriculumType;
  stageId: StageId;
  gradeIds: string[];
}

export interface TutorApplicationFormData {
  fullName: string;
  countryCode: string;
  phone: string;
  track: TrackType;
  // School Track Specializations
  schoolSpecializations: SchoolSpecializationItem[];
  schoolCourseOptionIds?: string[];
  // Quran & Foundation Track
  quranAgeGroups: string[];
  quranLevels: string[];
  quranOfferings?: Array<{ ageGroupId: string; levelId: string }>;
  quranNotes?: string;
  // Legacy arrays kept for compatibility
  subjects: string[];
  stages: StageId[];
  curricula: CurriculumType[];
  // Qualifications & Experience
  academicDegree: string;
  institution?: string;
  experienceYears: string;
  hasOnlineExperience: 'yes' | 'no' | '';
  onlineExperienceDetails: string;
  bioAndMethodology: string;
  portfolioUrl: string;
  // Pricing & Availability
  suggestedHourlyRate: string;
  currency: string;
  sessionDurationMinutes: number;
  availableDays: string[];
  preferredTimes: string[];
  timezone: string;
  interviewAvailability: string;
  // Policy Agreement
  termsAccepted: boolean;
  termsPolicyVersion?: string;
  policyAcceptedAt?: string;
}

export type TutorApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'needs_info'
  | 'approved'
  | 'rejected'
  | 'pending_review'
  | 'interview_scheduled';

export interface TutorApplicationRecord extends TutorApplicationFormData {
  id: string;
  userId?: string;
  referenceCode: string;
  whatsappNumber?: string;
  email?: string;
  institution?: string;
  schoolCourseOptionIds?: string[];
  quranOfferings?: Array<{ ageGroupId: string; levelId: string }>;
  suggestedHourlyRateNum?: number;
  policyVersion?: string;
  policyAcceptedAt?: string;
  status: TutorApplicationStatus;
  adminNotes?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  applicantTutorId?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface TutorAvailableSlot {
  id: string;
  tutorId: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
  isAvailable: boolean;
  isBooked?: boolean;
  bookedAt?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminUser {
  userId: string;
  email: string;
  role: 'super_admin' | 'admin';
  isActive: boolean;
  createdAt?: string;
}

export interface TutorPrivateInfo {
  tutorId: string;
  fullLegalName?: string | null;
  nationalIdNumber?: string | null;
  countryCode: string;
  phoneNumber: string;
  whatsappNumber?: string | null;
  email?: string | null;
  payoutMethod?: string | null;
  payoutDetails?: string | null;
  internalNotes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface SchoolCourseOptionDetail {
  id: string; // UUID of school_course_options
  gradeId: string;
  gradeName: string;
  stageId: string;
  stageName: string;
  subjectId: string;
  subjectName: string;
  curriculumId: string;
  curriculumName: string;
  isActive: boolean;
}

export interface AdminTutorFullDetail {
  tutor: Tutor;
  privateInfo?: TutorPrivateInfo | null;
  qualifications: TutorQualification[];
  methodologyPillars: MethodologyPillar[];
  trialSteps: TrialStep[];
  schoolOfferingOptionIds: string[]; // course_option_id UUIDs
  quranOfferings: Array<{ ageGroupId: string; levelId: string }>;
  slots: TutorAvailableSlot[];
}

export interface AdminTutorSavePayload {
  // Basics
  id: string;
  isNew?: boolean;
  name: string;
  honorific: string;
  headline: string;
  avatarUrl: string;
  yearsOfExperience: number;
  experienceBadgeText: string;
  verifiedCredentials: boolean;
  helpChildQuote: string;
  helpChildSummary: string;
  targetStudentCases: string[];
  curriculumTags: string[];
  isPublished: boolean;
  // Rates & duration (displayed as session rate in UI)
  hourlyRateMin: number;
  hourlyRateMax: number;
  currency: string;
  sessionDurationMinutes: number;
  trialDurationMinutes: number;
  // Sub-entities
  qualifications: Array<{
    id?: string;
    title: string;
    institution: string;
    verified: boolean;
    notes?: string;
    displayOrder?: number;
  }>;
  methodologyPillars: Array<{
    id?: string;
    title: string;
    description: string;
    iconName?: string;
    displayOrder?: number;
  }>;
  trialSteps: Array<{
    id?: string;
    stepNumber: number;
    title: string;
    description: string;
  }>;
  schoolOfferingOptionIds: string[]; // array of course_option_id UUIDs
  quranOfferings?: Array<{ ageGroupId: string; levelId: string }>;
  privateInfo?: {
    fullLegalName?: string;
    nationalIdNumber?: string;
    countryCode: string;
    phoneNumber: string;
    whatsappNumber?: string;
    email?: string;
    internalNotes?: string;
  };
}


