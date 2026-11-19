/**
 * Admin console (migration 024_admin_console.sql):
 * overview, unified search, parents CRM + notes, quality, funnel, activity log, team.
 *
 * When the migration is not applied yet every call throws
 * AdminConsoleUnavailableError, so the UI can show a calm notice instead of a crash.
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  AdminAuditEntry,
  AdminFunnelReport,
  AdminOverview,
  AdminParentDetail,
  AdminParentListItem,
  AdminQualityReport,
  AdminRole,
  AdminSearchResults,
  AdminTeam,
} from '../types/adminConsole';
import { isMissingRpcError, normalizeChild, normalizeReport } from './parentDashboardService';

let testClient: SupabaseClient | null = null;
export const __setAdminConsoleSupabaseForTests = (c: SupabaseClient | null) => {
  testClient = c;
};
const db = (): SupabaseClient => testClient || supabase;

export class AdminConsoleUnavailableError extends Error {
  constructor() {
    super('الميزة دي محتاجة تحديث قاعدة البيانات 024 الأول.');
    this.name = 'AdminConsoleUnavailableError';
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  ADMIN_FORBIDDEN: 'صلاحياتك ما تسمحش بالعملية دي.',
  ADMIN_INVALID_INPUT: 'البيانات مش مظبوطة.',
  PARENT_NOT_FOUND: 'وليّ الأمر ده مش موجود.',
  NOTE_INVALID: 'اكتب الملاحظة (لحد ٢٠٠٠ حرف).',
  NOTE_NOT_FOUND: 'الملاحظة مش موجودة أو مش من حقك تحذفها.',
  TEAM_EMAIL_INVALID: 'اكتب إيميل صحيح.',
  TEAM_ROLE_INVALID: 'اختار صلاحية صحيحة.',
  TEAM_SELF_CHANGE: 'مينفعش تغيّر صلاحيتك أنت بنفسك.',
  TEAM_MEMBER_NOT_FOUND: 'العضو ده مش موجود.',
};

export const toConsoleError = (error: any, fallback: string): Error => {
  if (isMissingRpcError(error)) return new AdminConsoleUnavailableError();
  const raw = String(error?.message || '');
  const key = Object.keys(ERROR_MESSAGES).find((k) => raw.includes(k));
  return new Error(key ? ERROR_MESSAGES[key] : fallback);
};

const num = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: any): string | null => (v === null || v === undefined || v === '' ? null : String(v));
const arr = (v: any): any[] => (Array.isArray(v) ? v : []);

async function call<T = any>(fn: string, args: Record<string, any> | undefined, fallback: string): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw toConsoleError(error, fallback);
  return data as T;
}

export function normalizeOverview(raw: any): AdminOverview {
  const t = raw?.todo || {};
  const k = raw?.kpis || {};
  return {
    role: (raw?.role as AdminRole) || null,
    todo: {
      missingLinks: num(t.missingLinks),
      missingReports: num(t.missingReports),
      pendingApplications: num(t.pendingApplications),
      pendingDrafts: num(t.pendingDrafts),
      newLeads: num(t.newLeads),
      pendingReviews: num(t.pendingReviews),
      pendingGroups: num(t.pendingGroups),
    },
    sessions: arr(raw?.sessions).map((s) => ({
      id: String(s.id),
      startsAt: String(s.startsAt),
      endsAt: String(s.endsAt),
      tutorId: String(s.tutorId ?? ''),
      tutorName: str(s.tutorName),
      guardianUserId: String(s.guardianUserId ?? ''),
      guardianName: String(s.guardianName ?? ''),
      guardianWhatsapp: String(s.guardianWhatsapp ?? ''),
      childName: str(s.childName),
      hasLink: Boolean(s.hasLink),
    })),
    kpis: {
      newBookings7d: num(k.newBookings7d),
      newBookingsPrev7d: num(k.newBookingsPrev7d),
      completed7d: num(k.completed7d),
      newLeads7d: num(k.newLeads7d),
      newParents7d: num(k.newParents7d),
      publishedTutors: num(k.publishedTutors),
      reports30d: num(k.reports30d),
      attendanceRate30d: k.attendanceRate30d === null || k.attendanceRate30d === undefined ? null : num(k.attendanceRate30d),
    },
  };
}

export function normalizeParentListItem(p: any): AdminParentListItem {
  return {
    userId: String(p.userId),
    email: str(p.email),
    name: str(p.name),
    whatsapp: str(p.whatsapp),
    joinedAt: str(p.joinedAt),
    lastSignInAt: str(p.lastSignInAt),
    childrenCount: num(p.childrenCount),
    bookingsCount: num(p.bookingsCount),
    completedCount: num(p.completedCount),
    lastSessionAt: str(p.lastSessionAt),
    nextSessionAt: str(p.nextSessionAt),
  };
}

export function normalizeParentDetail(raw: any): AdminParentDetail {
  const p = raw?.profile || {};
  return {
    profile: {
      userId: String(p.userId ?? ''),
      email: str(p.email),
      name: str(p.name),
      whatsapp: str(p.whatsapp),
      joinedAt: str(p.joinedAt),
      lastSignInAt: str(p.lastSignInAt),
    },
    children: arr(raw?.children).map(normalizeChild),
    bookings: arr(raw?.bookings).map((b) => ({
      id: String(b.id),
      tutorId: String(b.tutorId ?? ''),
      tutorName: str(b.tutorName),
      startsAt: String(b.startsAt),
      endsAt: String(b.endsAt),
      status: String(b.status ?? ''),
      meetingUrl: str(b.meetingUrl),
      childName: str(b.childName),
      report: normalizeReport(b.report),
      createdAt: str(b.createdAt),
    })),
    notes: arr(raw?.notes).map((n) => ({
      id: String(n.id),
      body: String(n.body ?? ''),
      authorEmail: str(n.authorEmail),
      createdAt: String(n.createdAt ?? ''),
      canDelete: Boolean(n.canDelete),
    })),
    leads: arr(raw?.leads).map((l) => ({
      id: String(l.id),
      referenceCode: str(l.referenceCode),
      status: String(l.status ?? ''),
      name: str(l.name),
      utmSource: str(l.utmSource),
      createdAt: String(l.createdAt ?? ''),
    })),
  };
}

export const AdminConsoleService = {
  async getOverview(): Promise<AdminOverview> {
    return normalizeOverview(await call('admin_console_overview', undefined, 'تعذر تحميل ملخص النهارده.'));
  },

  async search(query: string): Promise<AdminSearchResults> {
    const data: any = await call('admin_console_search', { p_query: query }, 'تعذر البحث حاليًا.');
    return {
      tutors: arr(data?.tutors).map((t) => ({ id: String(t.id), name: String(t.name ?? ''), isPublished: Boolean(t.isPublished) })),
      parents: arr(data?.parents).map((p) => ({ userId: String(p.userId), name: str(p.name), email: str(p.email), whatsapp: str(p.whatsapp) })),
      leads: arr(data?.leads).map((l) => ({ id: String(l.id), referenceCode: str(l.referenceCode), name: str(l.name), status: String(l.status ?? ''), createdAt: String(l.createdAt ?? '') })),
      applications: arr(data?.applications).map((a) => ({ id: String(a.id), referenceCode: str(a.referenceCode), name: str(a.name), status: String(a.status ?? ''), createdAt: String(a.createdAt ?? '') })),
    };
  },

  async listParents(search = '', limit = 50, offset = 0): Promise<{ total: number; items: AdminParentListItem[] }> {
    const data: any = await call(
      'admin_list_parents',
      { p_search: search.trim() || null, p_limit: limit, p_offset: offset },
      'تعذر تحميل أولياء الأمور.'
    );
    return { total: num(data?.total), items: arr(data?.items).map(normalizeParentListItem) };
  },

  async getParent(userId: string): Promise<AdminParentDetail> {
    return normalizeParentDetail(await call('admin_get_parent', { p_user_id: userId }, 'تعذر تحميل ملف وليّ الأمر.'));
  },

  async addParentNote(userId: string, body: string): Promise<void> {
    await call('admin_add_parent_note', { p_user_id: userId, p_body: body }, 'تعذر حفظ الملاحظة.');
  },

  async deleteParentNote(noteId: string): Promise<void> {
    await call('admin_delete_parent_note', { p_note_id: noteId }, 'تعذر حذف الملاحظة.');
  },

  async getQuality(days = 30): Promise<AdminQualityReport> {
    const d: any = await call('admin_console_quality', { p_days: days }, 'تعذر تحميل تقرير الجودة.');
    return {
      days: num(d?.days),
      publishedTutors: num(d?.publishedTutors),
      publishedWithoutBookings: num(d?.publishedWithoutBookings),
      tutors: arr(d?.tutors).map((t) => ({
        tutorId: String(t.tutorId),
        tutorName: str(t.tutorName),
        isPublished: Boolean(t.isPublished),
        rating: t.rating === null || t.rating === undefined ? null : num(t.rating),
        reviewsCount: num(t.reviewsCount),
        pendingReviews: num(t.pendingReviews),
        bookings: num(t.bookings),
        completed: num(t.completed),
        cancelled: num(t.cancelled),
        reports: num(t.reports),
        missingReports: num(t.missingReports),
        absences: num(t.absences),
        upcomingMissingLink: num(t.upcomingMissingLink),
        lateLinks: num(t.lateLinks),
      })),
    };
  },

  async getFunnel(days = 30): Promise<AdminFunnelReport> {
    const d: any = await call('admin_console_funnel', { p_days: days }, 'تعذر تحميل تقرير الأداء.');
    const l = d?.leads || {};
    const x = d?.direct || {};
    return {
      days: num(d?.days),
      leads: { total: num(l.total), contacted: num(l.contacted), trial: num(l.trial), subscribed: num(l.subscribed), lost: num(l.lost), new: num(l.new) },
      direct: { booked: num(x.booked), cancelled: num(x.cancelled), held: num(x.held), attended: num(x.attended), reported: num(x.reported), upcoming: num(x.upcoming) },
      sources: arr(d?.sources).map((s) => ({ source: String(s.source ?? 'direct'), total: num(s.total), subscribed: num(s.subscribed) })),
      weeks: arr(d?.weeks).map((w) => ({ weekStart: String(w.weekStart), leads: num(w.leads), bookings: num(w.bookings) })),
    };
  },

  async listAuditLog(limit = 50, beforeId: number | null = null, entityType: string | null = null): Promise<AdminAuditEntry[]> {
    const data = await call<any[]>(
      'admin_list_audit_log',
      { p_limit: limit, p_before_id: beforeId, p_entity_type: entityType },
      'تعذر تحميل سجل النشاط.'
    );
    return arr(data).map((e) => ({
      id: num(e.id),
      actorEmail: str(e.actorEmail),
      action: String(e.action ?? ''),
      entityType: String(e.entityType ?? ''),
      entityId: str(e.entityId),
      tutorId: str(e.tutorId),
      tutorName: str(e.tutorName),
      summary: str(e.summary),
      details: e.details && typeof e.details === 'object' ? e.details : {},
      createdAt: String(e.createdAt ?? ''),
    }));
  },

  /** Fire-and-forget: never blocks the UI (e.g. CSV export). */
  async logEvent(action: string, summary: string, details?: Record<string, any>): Promise<void> {
    try {
      await db().rpc('admin_log_event', { p_action: action, p_summary: summary, p_details: details ?? null });
    } catch {
      // ignore
    }
  },

  async getTeam(): Promise<AdminTeam> {
    const d: any = await call('admin_list_team', undefined, 'تعذر تحميل فريق الإدارة.');
    return {
      members: arr(d?.members).map((m) => ({
        userId: String(m.userId),
        email: String(m.email ?? ''),
        role: m.role as AdminRole,
        isActive: Boolean(m.isActive),
        createdAt: str(m.createdAt),
        lastSignInAt: str(m.lastSignInAt),
        isMe: Boolean(m.isMe),
      })),
      invites: arr(d?.invites).map((i) => ({ email: String(i.email), role: i.role as AdminRole, createdAt: String(i.createdAt ?? '') })),
    };
  },

  async inviteTeamMember(email: string, role: AdminRole): Promise<'added' | 'invited'> {
    const d: any = await call('admin_invite_team_member', { p_email: email, p_role: role }, 'تعذر إضافة العضو.');
    return d?.status === 'added' ? 'added' : 'invited';
  },

  async updateTeamMember(userId: string, role: AdminRole, isActive: boolean): Promise<void> {
    await call('admin_update_team_member', { p_user_id: userId, p_role: role, p_is_active: isActive }, 'تعذر تحديث العضو.');
  },

  async cancelInvite(email: string): Promise<void> {
    await call('admin_cancel_team_invite', { p_email: email }, 'تعذر إلغاء الدعوة.');
  },

  /** After sign-in: turns a pending invite for this verified email into staff access. */
  async claimInvite(): Promise<boolean> {
    try {
      const { data, error } = await db().rpc('admin_claim_team_invite');
      if (error) return false;
      return Boolean((data as any)?.claimed);
    } catch {
      return false;
    }
  },
};
