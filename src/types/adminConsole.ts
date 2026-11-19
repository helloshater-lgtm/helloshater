import { AdminUser, DirectTrialReport, ParentChild } from './index';

export type AdminRole = AdminUser['role'];

/** Every page of the admin console. */
export type AdminConsoleTab =
  | 'home'
  | 'direct-trials'
  | 'parent-leads'
  | 'parents'
  | 'classes'
  | 'tutors'
  | 'applications'
  | 'recent-edits'
  | 'quality'
  | 'statistics'
  | 'activity'
  | 'team';

export interface AdminOverviewSession {
  id: string;
  startsAt: string;
  endsAt: string;
  tutorId: string;
  tutorName: string | null;
  guardianUserId: string;
  guardianName: string;
  guardianWhatsapp: string;
  childName: string | null;
  hasLink: boolean;
}

export interface AdminOverviewTodo {
  missingLinks: number;
  missingReports: number;
  pendingApplications: number;
  pendingDrafts: number;
  newLeads: number;
  pendingReviews: number;
  pendingGroups: number;
}

export interface AdminOverview {
  role: AdminRole | null;
  todo: AdminOverviewTodo;
  sessions: AdminOverviewSession[];
  kpis: {
    newBookings7d: number;
    newBookingsPrev7d: number;
    completed7d: number;
    newLeads7d: number;
    newParents7d: number;
    publishedTutors: number;
    reports30d: number;
    attendanceRate30d: number | null;
  };
}

export interface AdminSearchResults {
  tutors: Array<{ id: string; name: string; isPublished: boolean }>;
  parents: Array<{ userId: string; name: string | null; email: string | null; whatsapp: string | null }>;
  leads: Array<{ id: string; referenceCode: string | null; name: string | null; status: string; createdAt: string }>;
  applications: Array<{ id: string; referenceCode: string | null; name: string | null; status: string; createdAt: string }>;
}

export interface AdminParentListItem {
  userId: string;
  email: string | null;
  name: string | null;
  whatsapp: string | null;
  joinedAt: string | null;
  lastSignInAt: string | null;
  childrenCount: number;
  bookingsCount: number;
  completedCount: number;
  lastSessionAt: string | null;
  nextSessionAt: string | null;
}

export interface AdminParentBooking {
  id: string;
  tutorId: string;
  tutorName: string | null;
  startsAt: string;
  endsAt: string;
  status: 'confirmed' | 'completed' | 'cancelled' | string;
  meetingUrl: string | null;
  childName: string | null;
  report: DirectTrialReport | null;
  createdAt: string | null;
}

export interface AdminParentNote {
  id: string;
  body: string;
  authorEmail: string | null;
  createdAt: string;
  canDelete: boolean;
}

export interface AdminParentDetail {
  profile: {
    userId: string;
    email: string | null;
    name: string | null;
    whatsapp: string | null;
    joinedAt: string | null;
    lastSignInAt: string | null;
  };
  children: ParentChild[];
  bookings: AdminParentBooking[];
  notes: AdminParentNote[];
  leads: Array<{ id: string; referenceCode: string | null; status: string; name: string | null; utmSource: string | null; createdAt: string }>;
}

export interface AdminQualityTutorRow {
  tutorId: string;
  tutorName: string | null;
  isPublished: boolean;
  rating: number | null;
  reviewsCount: number;
  pendingReviews: number;
  bookings: number;
  completed: number;
  cancelled: number;
  reports: number;
  missingReports: number;
  absences: number;
  upcomingMissingLink: number;
  lateLinks: number;
}

export interface AdminQualityReport {
  days: number;
  publishedTutors: number;
  publishedWithoutBookings: number;
  tutors: AdminQualityTutorRow[];
}

export interface AdminFunnelReport {
  days: number;
  leads: { total: number; contacted: number; trial: number; subscribed: number; lost: number; new: number };
  direct: { booked: number; cancelled: number; held: number; attended: number; reported: number; upcoming: number };
  sources: Array<{ source: string; total: number; subscribed: number }>;
  weeks: Array<{ weekStart: string; leads: number; bookings: number }>;
}

export interface AdminAuditEntry {
  id: number;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  tutorId: string | null;
  tutorName: string | null;
  summary: string | null;
  details: { changed?: string[]; values?: Record<string, any> } & Record<string, any>;
  createdAt: string;
}

export interface AdminTeamMember {
  userId: string;
  email: string;
  role: AdminRole;
  isActive: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
  isMe: boolean;
}

export interface AdminTeam {
  members: AdminTeamMember[];
  invites: Array<{ email: string; role: AdminRole; createdAt: string }>;
}
