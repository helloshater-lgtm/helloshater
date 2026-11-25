/** Automatic publication (migration 027). Read calls return null before it is applied. */
import { supabase } from '../lib/supabase';
import { isMissingRpcError } from './parentDashboardService';

export const MISSING_LABELS: Record<string, string> = {
  avatar: 'صورة شخصية واضحة',
  headline: 'العنوان التعريفي',
  bio: 'نبذة عنك وطريقتك',
  price: 'سعر الحصة',
  duration: 'مدة الحصة',
  subject: 'المواد أو المراحل اللي بتدرّسها',
  trial_slots: 'مواعيد حصص تجريبية',
  private_slots: 'مواعيد ثابتة للحصص الخاصة',
};
export const SLOT_ITEMS = ['trial_slots', 'private_slots'];
export const missingLabel = (code: string) => MISSING_LABELS[code] || code;

export interface TutorPublicationStatus {
  isPublished: boolean;
  approvedOnce: boolean;
  adminLocked: boolean;
  autoHidden: boolean;
  autoReason: 'missing' | 'no_slots' | null;
  missing: string[];
  hasTrialSlot: boolean;
  noSlotsSince: string | null;
  hideAt: string | null;
  notifications: Array<{ id: string; kind: string; title: string; body: string; createdAt: string; read: boolean }>;
}

export interface AdminAutoPublicationRow {
  tutorId: string;
  name: string;
  honorific: string;
  isPublished: boolean;
  adminLocked: boolean;
  autoHidden: boolean;
  autoReason: string | null;
  missing: string[];
  noSlotsSince: string | null;
  lastCheckedAt: string | null;
  whatsapp: string | null;
}

const arr = (v: any): any[] => (Array.isArray(v) ? v : []);

export const PublicationService = {
  async getMyStatus(): Promise<TutorPublicationStatus | null> {
    const { data, error } = await supabase.rpc('tutor_get_my_publication_status');
    if (error) {
      if (isMissingRpcError(error)) return null;
      throw new Error('تعذر تحميل حالة النشر.');
    }
    const d: any = data || {};
    return {
      isPublished: Boolean(d.isPublished),
      approvedOnce: Boolean(d.approvedOnce),
      adminLocked: Boolean(d.adminLocked),
      autoHidden: Boolean(d.autoHidden),
      autoReason: d.autoReason || null,
      missing: arr(d.missing).map(String),
      hasTrialSlot: Boolean(d.hasTrialSlot),
      noSlotsSince: d.noSlotsSince || null,
      hideAt: d.hideAt || null,
      notifications: arr(d.notifications).map((n) => ({
        id: String(n.id), kind: String(n.kind), title: String(n.title), body: String(n.body),
        createdAt: String(n.createdAt), read: Boolean(n.read),
      })),
    };
  },
  async markRead(): Promise<void> {
    await supabase.rpc('tutor_mark_notifications_read');
  },
  async adminList(): Promise<AdminAutoPublicationRow[] | null> {
    const { data, error } = await supabase.rpc('admin_get_auto_publication');
    if (error) {
      if (isMissingRpcError(error)) return null;
      throw new Error('تعذر تحميل حالة النشر التلقائي.');
    }
    return arr(data).map((r) => ({
      tutorId: String(r.tutorId), name: String(r.name ?? ''), honorific: String(r.honorific ?? ''),
      isPublished: Boolean(r.isPublished), adminLocked: Boolean(r.adminLocked), autoHidden: Boolean(r.autoHidden),
      autoReason: r.autoReason || null, missing: arr(r.missing).map(String), noSlotsSince: r.noSlotsSince || null,
      lastCheckedAt: r.lastCheckedAt || null, whatsapp: r.whatsapp || null,
    }));
  },
  async adminRunNow(): Promise<{ hidden: number; published: number; warned: number }> {
    const { data, error } = await supabase.rpc('admin_run_auto_publication');
    if (error) throw new Error('تعذر تشغيل الفحص.');
    return { hidden: Number((data as any)?.hidden || 0), published: Number((data as any)?.published || 0), warned: Number((data as any)?.warned || 0) };
  },
  async adminSetLock(tutorId: string, locked: boolean): Promise<void> {
    const { error } = await supabase.rpc('admin_set_tutor_auto_lock', { p_tutor_id: tutorId, p_locked: locked });
    if (error) throw new Error('تعذر الحفظ.');
  },
};
