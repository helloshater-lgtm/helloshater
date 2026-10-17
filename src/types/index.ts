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
  // Personal Photo / Avatar (Optional at application submission)
  avatarPath?: string | null;
  avatarUrl?: string | null;
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
  adminSuspended?: boolean;
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

export interface TutorProfileDraft {
  id: string;
  tutorId: string;
  headline: string;
  avatarUrl?: string | null;
  helpChildQuote?: string | null;
  helpChildSummary?: string | null;
  status: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'needs_revision';
  adminNotes?: string | null;
  submittedAt?: string;
  reviewedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TutorPortalContext {
  tutor: {
    id: string;
    name: string;
    honorific?: string;
    headline: string;
    avatarUrl: string;
    helpChildQuote?: string;
    helpChildSummary?: string;
    isPublished: boolean;
    yearsOfExperience: number;
    experienceBadgeText?: string;
    verifiedCredentials: boolean;
    hourlyRateMin: number;
    hourlyRateMax: number;
    currency: string;
    sessionDurationMinutes: number;
    trialDurationMinutes: number;
    rating?: number;
    reviewsCount?: number;
    curriculumTags?: string[];
  };
  pendingDraft: TutorProfileDraft | null;
  application: {
    id: string;
    referenceCode: string;
    status: string;
    adminNotes?: string | null;
    approvedAt?: string;
  } | null;
}

export interface ApprovedSpecializationItem {
  id: string; // unique key in UI
  track: TrackType;
  label: string;
  // School fields
  courseOptionId?: string;
  stageId?: string;
  stageName?: string;
  gradeId?: string;
  gradeName?: string;
  subjectId?: string;
  subjectName?: string;
  curriculumId?: string;
  curriculumName?: string;
  // Quran fields
  ageGroupId?: string;
  ageGroupName?: string;
  levelId?: string;
  levelName?: string;
}

export interface TutorPrivateSlot {
  id: string;
  tutorId?: string;
  specializationLabel: string;
  slotDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
  durationMinutes: number;
  priceAmount: number;
  currency: string;
  isAvailable: boolean;
  adminSuspended?: boolean;
  isBooked: boolean;
  bookedAt?: string | null;
  createdAt?: string;
}

export interface TutorGroupSessionItem {
  id?: string;
  sessionNumber: number;
  sessionDate: string;
  startTime: string;
  endTime: string;
  timezone?: string;
  title?: string;
}

export interface TutorGroup {
  id: string;
  tutorId?: string;
  title: string;
  description?: string;
  specializationLabel: string;
  maxStudents: number;
  enrolledStudents: number;
  remainingSeats?: number;
  pricePerStudent: number;
  priceType?: 'per_session' | 'full_package';
  currency: string;
  sessionsCount: number;
  sessionDurationMinutes: number;
  startDate: string;
  endDate?: string | null;
  weeklyScheduleSummary: string;
  reviewStatus?: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'needs_revision';
  adminReviewNotes?: string | null;
  adminSuspended?: boolean;
  adminSuspensionReason?: string | null;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  isPublished: boolean;
  sessions?: TutorGroupSessionItem[];
  createdAt?: string;
}

export interface TutorPrivateBooking {
  id: string;
  slotId: string;
  tutorId: string;
  studentName: string;
  guardianName: string;
  phoneNumber: string;
  agreedPrice: number;
  currency: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  notes?: string;
  cancellationReason?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  confirmedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TutorGroupEnrollment {
  id: string;
  groupId: string;
  tutorId: string;
  studentName: string;
  guardianName: string;
  phoneNumber: string;
  agreedPrice: number;
  currency: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  notes?: string;
  cancellationReason?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  confirmedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminStatTutorRef {
  id: string;
  name: string;
  honorific: string;
  headline?: string;
  isPublished: boolean;
  createdAt?: string;
}

export interface AdminStatApplicantRef {
  id: string;
  referenceCode?: string;
  fullName: string;
  phone: string;
  track?: TrackType;
  status: string;
  createdAt: string;
}

export interface AdminStatSubscriptionRef {
  id: string;
  kind: 'private' | 'group';
  studentName: string;
  tutorId: string;
  tutorName?: string;
  specializationLabel?: string;
  groupTitle?: string | null;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  createdAt: string;
}

export interface AdminStatUnclassifiedRef {
  id: string;
  category:
    | 'unassigned_tutor'
    | 'tutor_offering'
    | 'application'
    | 'group'
    | 'private_slot'
    | 'private_booking'
    | 'group_enrollment';
  title: string;
  subtitle?: string;
  reason: string;
  createdAt?: string;
  entityId?: string;
}

export interface AdminUnclassifiedSummary {
  unassignedTutorsCount: number;
  unclassifiedTutorOfferingsCount: number;
  unclassifiedApplicationsCount: number;
  unclassifiedGroupsCount: number;
  unclassifiedPrivateSlotsCount: number;
  unclassifiedPrivateBookingsCount: number;
  unclassifiedGroupEnrollmentsCount: number;
  totalUnclassifiedCount: number;
}

export interface AdminStatisticsDataHealthError {
  source: string;
  message: string;
  affectedMetrics: string;
}

export interface AdminStatisticsDataHealth {
  mode: 'rpc' | 'partial_sources';
  rpcMigrationApplied: boolean;
  isComplete: boolean;
  tutorsAvailable: boolean;
  applicationsAvailable: boolean;
  subscriptionsAvailable: boolean;
  supplySlotsAvailable: boolean;
  errors: AdminStatisticsDataHealthError[];
}

export interface AdminSubjectStatItem {
  subjectId: string;
  subjectName: string;
  englishName?: string;
  category: 'core' | 'languages' | 'sciences' | 'social' | 'quran';
  track: TrackType;
  isActive?: boolean;
  // Tutors (distinct per subject)
  totalTutors: number;
  publishedTutors: number;
  unpublishedTutors: number;
  tutorsList?: AdminStatTutorRef[];
  approvedOfferingsCount: number;
  coveredCourseOptionsCount: number;
  publishedCoveredCourseOptionsCount: number;
  totalCourseOptionsCount: number;
  // Applicants (distinct per subject)
  totalApplicants: number; // submitted + needs_info + approved + rejected (excludes drafts)
  pendingApplicants: number; // submitted + needs_info
  submittedApplicants: number;
  needsInfoApplicants: number;
  approvedApplicants: number;
  rejectedApplicants: number;
  draftApplicants: number;
  // Subscriptions & Bookings (strictly separated by status)
  confirmedPrivateBookings: number;
  completedPrivateBookings: number;
  pendingPrivateBookings: number;
  cancelledPrivateBookings: number;
  totalPrivateBookings: number;
  confirmedGroupEnrollments: number;
  completedGroupEnrollments: number;
  pendingGroupEnrollments: number;
  cancelledGroupEnrollments: number;
  totalGroupEnrollments: number;
  confirmedSubscriptions: number;
  completedSubscriptions: number;
  pendingSubscriptions: number;
  cancelledSubscriptions: number;
  // Unique students (null when no reliable student identity exists)
  uniqueConfirmedStudents: number | null;
  // Available supply
  activeGroupsCount: number;
  totalGroupsCount: number;
  availablePrivateSlotsCount: number;
}

export interface AdminQuranProgramStatItem {
  levelId: string;
  levelName: string;
  description: string;
  isActive?: boolean;
  totalTutors: number;
  publishedTutors: number;
  unpublishedTutors: number;
  tutorsList?: AdminStatTutorRef[];
  totalApplicants: number;
  pendingApplicants: number;
  submittedApplicants: number;
  needsInfoApplicants: number;
  approvedApplicants: number;
  rejectedApplicants: number;
  draftApplicants: number;
  confirmedPrivateBookings: number;
  completedPrivateBookings: number;
  pendingPrivateBookings: number;
  cancelledPrivateBookings: number;
  confirmedGroupEnrollments: number;
  completedGroupEnrollments: number;
  pendingGroupEnrollments: number;
  cancelledGroupEnrollments: number;
  confirmedSubscriptions: number;
  completedSubscriptions: number;
  pendingSubscriptions: number;
  cancelledSubscriptions: number;
  uniqueConfirmedStudents: number | null;
  activeGroupsCount: number;
  availablePrivateSlotsCount: number;
}

export interface AdminQuranAgeGroupStatItem {
  ageGroupId: string;
  ageGroupName: string;
  ageRange: string;
  isActive?: boolean;
  totalTutors: number;
  publishedTutors: number;
  unpublishedTutors: number;
  totalApplicants: number;
  pendingApplicants: number;
  approvedApplicants: number;
  rejectedApplicants: number;
  confirmedSubscriptions: number;
  completedSubscriptions: number;
  pendingSubscriptions: number;
  cancelledSubscriptions: number;
  uniqueConfirmedStudents: number | null;
}

export interface AdminStageStatItem {
  stageId: string;
  stageName: string;
  gradesDesc: string;
  isActive?: boolean;
  totalTutors: number;
  publishedTutors: number;
  unpublishedTutors: number;
  totalApplicants: number;
  pendingApplicants: number;
  approvedApplicants: number;
  rejectedApplicants: number;
  confirmedSubscriptions: number;
  completedSubscriptions: number;
  pendingSubscriptions: number;
  cancelledSubscriptions: number;
  uniqueConfirmedStudents: number | null;
  activeGroupsCount: number;
  availablePrivateSlotsCount: number;
}

export interface AdminCurriculumStatItem {
  curriculumId: string;
  curriculumName: string;
  isActive?: boolean;
  totalTutors: number;
  publishedTutors: number;
  unpublishedTutors: number;
  totalApplicants: number;
  pendingApplicants: number;
  approvedApplicants: number;
  rejectedApplicants: number;
  confirmedSubscriptions: number;
  completedSubscriptions: number;
  pendingSubscriptions: number;
  cancelledSubscriptions: number;
  uniqueConfirmedStudents: number | null;
}

export interface AdminDetailedSpecializationStatItem {
  id: string;
  track: TrackType;
  label: string;
  isActive?: boolean;
  // School taxonomy
  stageId?: string;
  stageName?: string;
  gradeId?: string;
  gradeName?: string;
  subjectId?: string;
  subjectName?: string;
  curriculumId?: string;
  curriculumName?: string;
  // Quran taxonomy
  levelId?: string;
  levelName?: string;
  ageGroupId?: string;
  ageGroupName?: string;
  // Tutors
  totalTutors: number;
  publishedTutors: number;
  unpublishedTutors: number;
  tutorsList?: AdminStatTutorRef[];
  // Applicants
  totalApplicants: number;
  pendingApplicants: number;
  submittedApplicants: number;
  needsInfoApplicants: number;
  approvedApplicants: number;
  rejectedApplicants: number;
  draftApplicants: number;
  // Subscriptions (strictly separated by status)
  confirmedPrivateBookings: number;
  completedPrivateBookings: number;
  pendingPrivateBookings: number;
  cancelledPrivateBookings: number;
  confirmedGroupEnrollments: number;
  completedGroupEnrollments: number;
  pendingGroupEnrollments: number;
  cancelledGroupEnrollments: number;
  confirmedSubscriptions: number;
  completedSubscriptions: number;
  pendingSubscriptions: number;
  cancelledSubscriptions: number;
  uniqueConfirmedStudents: number | null;
  activeGroupsCount: number;
  availablePrivateSlotsCount: number;
}

export interface AdminStatisticsDrilldownRequest {
  entityType: 'tutors' | 'applicants' | 'subscriptions' | 'unclassified';
  title?: string;
  track?: 'all' | 'school' | 'quran';
  subjectId?: string | null;
  stageId?: string | null;
  gradeId?: string | null;
  curriculumId?: string | null;
  courseOptionId?: string | null;
  quranLevelId?: string | null;
  quranAgeGroupId?: string | null;
  statusFilter?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminStatisticsDrilldownResponse {
  entityType: 'tutors' | 'applicants' | 'subscriptions' | 'unclassified';
  totalCount: number;
  page: number;
  pageSize: number;
  tutors?: AdminStatTutorRef[];
  applicants?: AdminStatApplicantRef[];
  subscriptions?: AdminStatSubscriptionRef[];
  unclassifiedItems?: AdminStatUnclassifiedRef[];
}

export interface AdminPlatformStatistics {
  overview: {
    // Tutors
    totalTutors: number;
    publishedTutors: number;
    unpublishedTutors: number;
    schoolTutorsCount: number;
    quranTutorsCount: number;
    unassignedTutorsCount: number;
    // Applications
    totalSubmittedApplications: number; // excludes drafts
    totalAllApplications: number; // includes drafts
    pendingApplications: number; // submitted + needs_info
    submittedOnlyApplications: number;
    needsInfoApplications: number;
    approvedApplications: number;
    rejectedApplications: number;
    draftApplications: number;
    schoolSubmittedApplications: number;
    quranSubmittedApplications: number;
    // Subscriptions & Bookings (strictly separated by status)
    confirmedSubscriptions: number;
    completedSubscriptions: number;
    pendingSubscriptions: number;
    cancelledSubscriptions: number;
    confirmedPrivateBookings: number;
    completedPrivateBookings: number;
    pendingPrivateBookings: number;
    cancelledPrivateBookings: number;
    confirmedGroupEnrollments: number;
    completedGroupEnrollments: number;
    pendingGroupEnrollments: number;
    cancelledGroupEnrollments: number;
    // Unique Students (null when no reliable student identity exists)
    uniqueConfirmedStudents: number | null;
    uniqueStudentsAvailable: boolean;
    uniqueStudentsUnavailableReason?: string;
    // Supply & Slots
    activeGroupsCount: number;
    totalGroupsCount: number;
    availablePrivateSlotsCount: number;
    availableTrialSlotsCount: number;
    bookedTrialSlotsCount: number;
    // Coverage & Classification alerts
    subjectsWithoutPublishedTutors: number;
    specializationsWithoutPublishedTutors: number;
    subjectsWithPendingApplicants: number;
    unmappedBookingsCount: number;
    unclassifiedSummary: AdminUnclassifiedSummary;
  };
  dataHealth?: AdminStatisticsDataHealth;
  subjectsStats: AdminSubjectStatItem[];
  quranSummary: AdminSubjectStatItem;
  quranLevelsStats: AdminQuranProgramStatItem[];
  quranAgeGroupsStats: AdminQuranAgeGroupStatItem[];
  stagesStats: AdminStageStatItem[];
  curriculaStats: AdminCurriculumStatItem[];
  detailedSpecializations: AdminDetailedSpecializationStatItem[];
  generatedAt: string;
}



