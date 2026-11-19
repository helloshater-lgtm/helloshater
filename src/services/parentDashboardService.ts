/**
 * Parent dashboard & trial reports (migration 023_parent_children_and_trial_reports.sql)
 * - parent_get_my_dashboard()
 * - parent_upsert_child({ p_child_id, p_name, p_grade_label, p_notes })
 * - parent_delete_child({ p_child_id })
 * - parent_set_trial_child({ p_booking_id, p_child_id })
 * - tutor_get_my_trial_extras()
 * - tutor_submit_trial_report({ p_booking_id, p_attended, p_level_summary, p_covered, p_recommendation, p_homework })
 *
 * Read functions return null / {} when the migration is not applied yet, so the
 * existing pages keep working until it is.
 */
import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  DirectTrialReport,
  ParentChild,
  ParentDashboardBooking,
  ParentDashboardData,
  TutorTrialExtras,
} from '../types';
import { normalizeDirectTrialBooking } from './directTrialBookingService';

let testClient: SupabaseClient | null = null;
export const __setParentDashboardSupabaseForTests = (c: SupabaseClient | null) => {
  testClient = c;
};
const db = (): SupabaseClient => testClient || supabase;

export const isMissingRpcError = (error: any): boolean => {
  const code = String(error?.code || '');
  const msg = String(error?.message || '');
  return code === 'PGRST202' || code === '42883' || /could not find the function/i.test(msg);
};

const ERROR_MESSAGES: Record<string, string> = {
  PARENT_AUTH_REQUIRED: 'سجّل الدخول الأول.',
  CHILD_NAME_INVALID: 'اكتب اسم الطفل (من حرفين لـ ٦٠ حرف).',
  CHILD_LIMIT_REACHED: 'وصلت للحد الأقصى (١٠ أطفال).',
  CHILD_NOT_FOUND: 'الطفل ده مش موجود في حسابك.',
  TRIAL_NOT_FOUND: 'الحجز ده مش موجود.',
  TRIAL_FORBIDDEN: 'مش مسموح بالعملية دي على الحجز ده.',
  TRIAL_NOT_FINISHED: 'التقرير بيتكتب بعد ما الحصة تخلص.',
  REPORT_ATTENDANCE_REQUIRED: 'حدد الطفل حضر ولا لأ.',
};

const toError = (error: any, fallback: string): Error => {
  const raw = String(error?.message || '');
  const key = Object.keys(ERROR_MESSAGES).find((k) => raw.includes(k));
  return new Error(key ? ERROR_MESSAGES[key] : fallback);
};

export function normalizeChild(raw: any): ParentChild {
  return {
    id: String(raw?.id ?? ''),
    name: String(raw?.name ?? ''),
    gradeLabel: raw?.gradeLabel ?? raw?.grade_label ?? null,
    notes: raw?.notes ?? null,
    createdAt: String(raw?.createdAt ?? raw?.created_at ?? ''),
  };
}

export function normalizeReport(raw: any): DirectTrialReport | null {
  if (!raw || typeof raw !== 'object') return null;
  return {
    bookingId: String(raw.bookingId ?? raw.booking_id ?? ''),
    attended: Boolean(raw.attended),
    levelSummary: raw.levelSummary ?? raw.level_summary ?? null,
    covered: raw.covered ?? null,
    recommendation: raw.recommendation ?? null,
    homework: raw.homework ?? null,
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? ''),
  };
}

export const ParentDashboardService = {
  /** null = migration 023 not applied yet (callers fall back to the old list). */
  async getDashboard(): Promise<ParentDashboardData | null> {
    const { data, error } = await db().rpc('parent_get_my_dashboard');
    if (error) {
      if (isMissingRpcError(error)) return null;
      throw toError(error, 'تعذر تحميل بياناتك حاليًا.');
    }
    const children = Array.isArray(data?.children) ? data.children.map(normalizeChild) : [];
    const bookings: ParentDashboardBooking[] = Array.isArray(data?.bookings)
      ? data.bookings.map((b: any) => ({
          ...normalizeDirectTrialBooking(b),
          childId: b.childId ?? null,
          childName: b.childName ?? null,
          report: normalizeReport(b.report),
        }))
      : [];
    return { children, bookings };
  },

  async upsertChild(params: { id?: string | null; name: string; gradeLabel?: string; notes?: string }): Promise<ParentChild> {
    const { data, error } = await db().rpc('parent_upsert_child', {
      p_child_id: params.id || null,
      p_name: params.name.trim(),
      p_grade_label: params.gradeLabel?.trim() || null,
      p_notes: params.notes?.trim() || null,
    });
    if (error) throw toError(error, 'تعذر حفظ بيانات الطفل.');
    return normalizeChild(data);
  },

  async deleteChild(childId: string): Promise<void> {
    const { error } = await db().rpc('parent_delete_child', { p_child_id: childId });
    if (error) throw toError(error, 'تعذر حذف الطفل.');
  },

  async setTrialChild(bookingId: string, childId: string | null): Promise<void> {
    const { error } = await db().rpc('parent_set_trial_child', { p_booking_id: bookingId, p_child_id: childId });
    if (error) throw toError(error, 'تعذر حفظ اختيار الطفل.');
  },

  /** null when the migration is not applied yet (reports not available). */
  async tutorGetTrialExtras(): Promise<Record<string, TutorTrialExtras> | null> {
    const { data, error } = await db().rpc('tutor_get_my_trial_extras');
    if (error) {
      if (isMissingRpcError(error)) return null;
      throw toError(error, 'تعذر تحميل تقارير الحصص.');
    }
    const map: Record<string, TutorTrialExtras> = {};
    (Array.isArray(data) ? data : []).forEach((x: any) => {
      const id = String(x?.bookingId ?? '');
      if (!id) return;
      map[id] = {
        bookingId: id,
        childName: x.childName ?? null,
        childGrade: x.childGrade ?? null,
        report: normalizeReport(x.report),
      };
    });
    return map;
  },

  async tutorSubmitReport(params: {
    bookingId: string;
    attended: boolean;
    levelSummary?: string;
    covered?: string;
    recommendation?: string;
    homework?: string;
  }): Promise<DirectTrialReport | null> {
    const { data, error } = await db().rpc('tutor_submit_trial_report', {
      p_booking_id: params.bookingId,
      p_attended: params.attended,
      p_level_summary: params.levelSummary?.trim() || null,
      p_covered: params.covered?.trim() || null,
      p_recommendation: params.recommendation?.trim() || null,
      p_homework: params.homework?.trim() || null,
    });
    if (error) {
      if (isMissingRpcError(error)) throw new Error('ميزة التقارير لسه ما اتفعّلتش على قاعدة البيانات.');
      throw toError(error, 'تعذر حفظ التقرير.');
    }
    return normalizeReport(data?.report);
  },
};
