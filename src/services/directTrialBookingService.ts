/**
 * Shatir Classes (شاطر كلاسيز)
 * Direct Free Trial Booking Service (Migration 022)
 *
 * Strictly invokes the RPCs defined in 022_direct_trial_booking.sql:
 * - get_direct_trial_booking_policy({ p_tutor_id })
 * - parent_book_trial({ p_slot_id, p_guardian_name, p_whatsapp })
 * - parent_get_my_trial_bookings()
 * - tutor_get_my_direct_trials()
 * - tutor_set_direct_trial_meeting({ p_booking_id, p_meeting_url })
 * - tutor_mark_direct_trial_completed({ p_booking_id })
 * - admin_get_direct_trial_bookings()
 * - admin_cancel_direct_trial({ p_booking_id })
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  AdminDirectTrialBooking,
  DirectTrialBooking,
  DirectTrialBookingPolicy,
  DirectTrialBookingStatus,
} from '../types';

let customSupabaseForTests: SupabaseClient | null = null;

export const __setDirectTrialSupabaseForTests = (client: SupabaseClient | null): void => {
  customSupabaseForTests = client;
};

const getDbClient = (): SupabaseClient => customSupabaseForTests || supabase;

export class DirectTrialBookingError extends Error {
  public readonly isSlotUnavailable: boolean;
  public readonly code?: string;

  constructor(message: string, options?: { isSlotUnavailable?: boolean; code?: string }) {
    super(message);
    this.name = 'DirectTrialBookingError';
    this.isSlotUnavailable = Boolean(options?.isSlotUnavailable);
    this.code = options?.code;
  }
}

function normalizeStatus(raw: unknown): DirectTrialBookingStatus {
  const clean = String(raw || '').trim().toLowerCase();
  if (clean === 'completed') return 'completed';
  if (clean === 'cancelled' || clean === 'canceled') return 'cancelled';
  return 'confirmed';
}

export function normalizeDirectTrialPolicy(raw: any): DirectTrialBookingPolicy {
  const obj = Array.isArray(raw) ? raw[0] || {} : raw || {};
  const minNoticeRaw =
    obj.minimumNoticeMinutes ?? obj.minimum_notice_minutes ?? 240;
  const trialDurationRaw =
    obj.trialDurationMinutes ?? obj.trial_duration_minutes ?? 20;
  const availableRaw =
    obj.directBookingAvailable ?? obj.direct_booking_available ?? false;

  return {
    minimumNoticeMinutes: Math.max(0, Number(minNoticeRaw) || 0),
    trialDurationMinutes: Math.max(10, Number(trialDurationRaw) || 20),
    directBookingAvailable: Boolean(availableRaw),
  };
}

export function normalizeDirectTrialBooking(raw: any): DirectTrialBooking {
  const row = Array.isArray(raw) ? raw[0] || {} : raw || {};
  return {
    id: String(row.id ?? ''),
    slotId: row.slotId ?? row.slot_id ?? null,
    tutorId: String(row.tutorId ?? row.tutor_id ?? ''),
    tutorName: String(row.tutorName ?? row.tutor_name ?? ''),
    startsAt: String(row.startsAt ?? row.starts_at ?? ''),
    endsAt: String(row.endsAt ?? row.ends_at ?? ''),
    timezone: String(row.timezone ?? 'Africa/Cairo') || 'Africa/Cairo',
    status: normalizeStatus(row.status),
    meetingUrl: row.meetingUrl ?? row.meeting_url ?? null,
    createdAt: String(row.createdAt ?? row.created_at ?? ''),
  };
}

export function normalizeAdminDirectTrialBooking(raw: any): AdminDirectTrialBooking {
  const base = normalizeDirectTrialBooking(raw);
  const row = Array.isArray(raw) ? raw[0] || {} : raw || {};
  return {
    ...base,
    guardianName: String(row.guardianName ?? row.guardian_name ?? ''),
    guardianWhatsApp: String(
      row.guardianWhatsApp ?? row.guardian_whatsapp ?? row.whatsapp ?? ''
    ),
  };
}

function isSlotConflictError(error: any): boolean {
  const code = String(error?.code || '').trim();
  const combined = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  if (code === '23505') return true;
  if (
    combined.includes('slot') ||
    combined.includes('booked') ||
    combined.includes('unavailable') ||
    combined.includes('notice') ||
    combined.includes('taken') ||
    combined.includes('already') ||
    combined.includes('past') ||
    combined.includes('suspended') ||
    combined.includes('محجوز') ||
    combined.includes('متاح')
  ) {
    return true;
  }
  return false;
}

function mapDirectTrialRpcError(
  error: any,
  fallbackMessage: string
): DirectTrialBookingError {
  const rawMessage = String(error?.message || '').trim();
  const lower = rawMessage.toLowerCase();
  const code = error?.code ? String(error.code) : undefined;

  if (
    lower.includes('not authenticated') ||
    lower.includes('jwt') ||
    lower.includes('auth') ||
    code === '42501'
  ) {
    return new DirectTrialBookingError(
      'يرجى تسجيل الدخول بحسابك أولاً لإتمام هذه العملية.',
      { isSlotUnavailable: false, code }
    );
  }

  if (isSlotConflictError(error)) {
    return new DirectTrialBookingError(
      'عذراً، هذا الموعد لم يعد متاحاً للحجز المباشر (ربما تم حجزه للتو أو اقترب من وقت البدء). تم تحديث قائمة المواعيد لتختار موعداً آخر.',
      { isSlotUnavailable: true, code }
    );
  }

  return new DirectTrialBookingError(rawMessage || fallbackMessage, {
    isSlotUnavailable: false,
    code,
  });
}

export const DirectTrialBookingService = {
  /**
   * Checks whether a published tutor allows direct trial booking and returns notice rules.
   */
  async getDirectTrialBookingPolicy(
    tutorId: string
  ): Promise<DirectTrialBookingPolicy> {
    const client = getDbClient();
    const { data, error } = await client.rpc('get_direct_trial_booking_policy', {
      p_tutor_id: tutorId,
    });

    if (error) {
      throw mapDirectTrialRpcError(
        error,
        'تعذر التحقق من سياسة الحجز المباشر لهذا المعلم.'
      );
    }

    return normalizeDirectTrialPolicy(data);
  },

  /**
   * Sends a Supabase Magic Link (OTP) email for parent sign-in before booking or viewing #my-trials.
   */
  async signInParentWithOtp(email: string, emailRedirectTo: string): Promise<void> {
    const cleanEmail = String(email || '').trim();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new DirectTrialBookingError('يرجى إدخال بريد إلكتروني صحيح.');
    }

    const client = getDbClient();
    const { error } = await client.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        emailRedirectTo,
      },
    });

    if (error) {
      throw new DirectTrialBookingError(
        error.message || 'تعذر إرسال رابط الدخول إلى البريد الإلكتروني. حاول مرة أخرى.'
      );
    }
  },

  async verifyParentEmailCode(email: string, code: string): Promise<void> {
    const cleanEmail = String(email || '').trim();
    const cleanCode = String(code || '').trim();
    if (!cleanEmail || !cleanCode) {
      throw new DirectTrialBookingError('يرجى إدخال الكود المرسل إلى بريدك.');
    }
    const client = getDbClient();
    const { error } = await client.auth.verifyOtp({ email: cleanEmail, token: cleanCode, type: 'email' });
    if (error) {
      const lower = String(error.message || '').toLowerCase();
      if (lower.includes('expired') || lower.includes('invalid')) {
        throw new DirectTrialBookingError('الكود غير صحيح أو انتهت صلاحيته. تأكد من آخر رسالة وصلتك أو اطلب كودًا جديدًا.');
      }
      if (lower.includes('rate') || error.status === 429) {
        throw new DirectTrialBookingError('محاولات كثيرة خلال وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.');
      }
      throw new DirectTrialBookingError('تعذر التحقق من الكود حاليًا. حاول مرة أخرى.');
    }
  },

  /**
   * Returns current authenticated Supabase user (if any).
   */
  async getCurrentSessionUser(): Promise<{ id: string; email?: string | null } | null> {
    try {
      const client = getDbClient();
      const { data, error } = await client.auth.getUser();
      if (error || !data?.user) return null;
      return {
        id: data.user.id,
        email: data.user.email ?? null,
      };
    } catch {
      return null;
    }
  },

  onAuthStateChange(
    callback: (user: { id: string; email?: string | null } | null) => void
  ): () => void {
    const client = getDbClient();
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        callback({
          id: session.user.id,
          email: session.user.email ?? null,
        });
      } else {
        callback(null);
      }
    });
    return () => {
      data?.subscription?.unsubscribe();
    };
  },

  async signOutSession(): Promise<void> {
    const client = getDbClient();
    await client.auth.signOut();
  },

  /**
   * Confirms a parent's free direct trial booking atomically via Supabase RPC.
   * Must ONLY be called when the user explicitly clicks "تأكيد الحجز المجاني".
   */
  async parentBookTrial(params: {
    slotId: string;
    guardianName: string;
    whatsapp: string;
  }): Promise<DirectTrialBooking> {
    const client = getDbClient();
    const { data, error } = await client.rpc('parent_book_trial', {
      p_slot_id: params.slotId,
      p_guardian_name: params.guardianName.trim(),
      p_whatsapp: params.whatsapp.trim(),
    });

    if (error) {
      throw mapDirectTrialRpcError(
        error,
        'تعذر إتمام الحجز المجاني حالياً. يرجى المحاولة مرة أخرى.'
      );
    }

    return normalizeDirectTrialBooking(data);
  },

  /**
   * Fetches the signed-in parent's confirmed/past trial bookings for #my-trials.
   */
  async parentGetMyTrialBookings(): Promise<DirectTrialBooking[]> {
    const client = getDbClient();
    const { data, error } = await client.rpc('parent_get_my_trial_bookings');

    if (error) {
      throw mapDirectTrialRpcError(
        error,
        'تعذر تحميل حجوزاتك حالياً.'
      );
    }

    const list = Array.isArray(data) ? data : [];
    return list.map(normalizeDirectTrialBooking);
  },

  /**
   * Fetches the signed-in tutor's direct trial bookings for TutorDashboardView.
   */
  async tutorGetMyDirectTrials(): Promise<DirectTrialBooking[]> {
    const client = getDbClient();
    const { data, error } = await client.rpc('tutor_get_my_direct_trials');

    if (error) {
      throw mapDirectTrialRpcError(
        error,
        'تعذر تحميل الحجوزات التجريبية الخاصة بك.'
      );
    }

    const list = Array.isArray(data) ? data : [];
    return list.map(normalizeDirectTrialBooking);
  },

  /**
   * Saves or updates the Google Meet / Zoom link for a confirmed direct trial booking.
   */
  async tutorSetDirectTrialMeeting(params: {
    bookingId: string;
    meetingUrl: string;
  }): Promise<DirectTrialBooking | void> {
    const client = getDbClient();
    const { data, error } = await client.rpc('tutor_set_direct_trial_meeting', {
      p_booking_id: params.bookingId,
      p_meeting_url: params.meetingUrl.trim(),
    });

    if (error) {
      throw mapDirectTrialRpcError(
        error,
        'تعذر حفظ رابط الحصة حالياً.'
      );
    }

    if (data) {
      return normalizeDirectTrialBooking(data);
    }
  },

  /**
   * Marks a direct trial booking as completed after the session ends.
   */
  async tutorMarkDirectTrialCompleted(
    bookingId: string
  ): Promise<DirectTrialBooking | void> {
    const client = getDbClient();
    const { data, error } = await client.rpc('tutor_mark_direct_trial_completed', {
      p_booking_id: bookingId,
    });

    if (error) {
      throw mapDirectTrialRpcError(
        error,
        'تعذر تسجيل إتمام الحصة التجريبية.'
      );
    }

    if (data) {
      return normalizeDirectTrialBooking(data);
    }
  },

  /**
   * Admin-only list of all direct trial bookings including guardian contact details.
   */
  async adminGetDirectTrialBookings(): Promise<AdminDirectTrialBooking[]> {
    const client = getDbClient();
    const { data, error } = await client.rpc('admin_get_direct_trial_bookings');

    if (error) {
      throw mapDirectTrialRpcError(
        error,
        'تعذر تحميل الحجوزات التجريبية المباشرة في لوحة الإدارة.'
      );
    }

    const list = Array.isArray(data) ? data : [];
    return list.map(normalizeAdminDirectTrialBooking);
  },

  /**
   * Admin-only cancellation of a direct trial booking.
   */
  async adminCancelDirectTrial(
    bookingId: string
  ): Promise<AdminDirectTrialBooking | void> {
    const client = getDbClient();
    const { data, error } = await client.rpc('admin_cancel_direct_trial', {
      p_booking_id: bookingId,
    });

    if (error) {
      throw mapDirectTrialRpcError(
        error,
        'تعذر إلغاء الحجز التجريبي حالياً.'
      );
    }

    if (data) {
      return normalizeAdminDirectTrialBooking(data);
    }
  },
};
