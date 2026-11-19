import { AdminConsoleTab, AdminRole, AdminAuditEntry, AdminQualityTutorRow } from '../types/adminConsole';
import { toArabicDigits } from './formatters';

// ---------------------------------------------------------------------------
// Roles & permissions
// ---------------------------------------------------------------------------

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'مدير عام',
  admin: 'مشرف',
  support: 'دعم (عرض فقط)',
};

export const ADMIN_ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  super_admin: 'كل الصلاحيات + إدارة الفريق وسجل النشاط.',
  admin: 'كل شغل التشغيل: المعلمين والحجوزات والطلبات.',
  support: 'يشوف النهارده وأولياء الأمور والجودة، ويكتب ملاحظات. مايقدرش يعدّل أو ينشر.',
};

const SUPPORT_TABS: AdminConsoleTab[] = ['home', 'parents', 'quality'];
const ADMIN_TABS: AdminConsoleTab[] = [
  'home', 'direct-trials', 'parent-leads', 'parents', 'classes',
  'tutors', 'applications', 'recent-edits', 'quality', 'statistics', 'activity',
];

export function allowedAdminTabs(role: AdminRole | null | undefined): AdminConsoleTab[] {
  if (role === 'super_admin') return [...ADMIN_TABS, 'team'];
  if (role === 'admin') return ADMIN_TABS;
  if (role === 'support') return SUPPORT_TABS;
  return [];
}

export function canAccessAdminTab(role: AdminRole | null | undefined, tab: AdminConsoleTab): boolean {
  return allowedAdminTabs(role).includes(tab);
}

/** Full admins can edit tutors / bookings; support is read-only. */
export const canEditPlatform = (role: AdminRole | null | undefined) => role === 'super_admin' || role === 'admin';

// ---------------------------------------------------------------------------
// Deep links: #admin/<tab>[/<id>]
// ---------------------------------------------------------------------------

const TAB_SET = new Set<AdminConsoleTab>([...ADMIN_TABS, 'team']);

export function parseAdminHash(hash: string): { tab: AdminConsoleTab | null; id: string | null } {
  const m = /^#admin(?:\/([a-z-]+))?(?:\/([A-Za-z0-9_-]{1,80}))?\/?$/.exec(String(hash || '').trim());
  if (!m) return { tab: null, id: null };
  const tab = (m[1] || '') as AdminConsoleTab;
  return { tab: TAB_SET.has(tab) ? tab : null, id: m[2] || null };
}

export function buildAdminHash(tab: AdminConsoleTab, id?: string | null): string {
  return `#admin/${tab}${id ? `/${id}` : ''}`;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const CAIRO = 'Africa/Cairo';

export function formatAdminDateTime(iso: string | null | undefined, opts: { withTime?: boolean } = {}): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-EG', {
    timeZone: CAIRO,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(opts.withTime === false ? {} : { hour: 'numeric', minute: '2-digit' }),
  }).format(d);
}

export function formatAdminTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-EG', { timeZone: CAIRO, hour: 'numeric', minute: '2-digit' }).format(d);
}

/** «النهارده» / «بكرة» / date, in Cairo time. */
export function adminDayLabel(iso: string, now: Date = new Date()): string {
  const key = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: CAIRO }).format(d);
  const k = key(new Date(iso));
  if (k === key(now)) return 'النهارده';
  if (k === key(new Date(now.getTime() + 86400000))) return 'بكرة';
  return formatAdminDateTime(iso, { withTime: false });
}

export function relativeTimeAr(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Math.round((now.getTime() - t) / 60000);
  const abs = Math.abs(diff);
  const pre = diff >= 0 ? 'من' : 'بعد';
  if (abs < 1) return 'دلوقتي';
  if (abs < 60) return `${pre} ${toArabicDigits(abs)} دقيقة`;
  const h = Math.round(abs / 60);
  if (h < 24) return `${pre} ${toArabicDigits(h)} ساعة`;
  const d = Math.round(h / 24);
  if (d < 30) return d === 1 ? (diff >= 0 ? 'إمبارح' : 'بكرة') : `${pre} ${toArabicDigits(d)} يوم`;
  return formatAdminDateTime(iso, { withTime: false });
}

export function whatsappLink(phone: string | null | undefined, text?: string): string | null {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 8) return null;
  const normalized = digits.startsWith('00') ? digits.slice(2) : digits.startsWith('0') ? `20${digits.slice(1)}` : digits;
  return `https://wa.me/${normalized}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export function percent(part: number, total: number): number | null {
  if (!total) return null;
  return Math.round((100 * part) / total);
}

export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${toArabicDigits(value)}٪`;
}

export const TRIAL_STATUS_LABELS: Record<string, string> = {
  confirmed: 'مؤكدة',
  completed: 'اتعملت',
  cancelled: 'ملغية',
};

export const LEAD_STATUS_LABELS: Record<string, string> = {
  new: 'جديد',
  contacted: 'اتكلمنا معاه',
  trial: 'حصة تجريبية',
  subscribed: 'اشترك',
  lost: 'مش مهتم',
};

export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  submitted: 'جديد',
  pending_review: 'تحت المراجعة',
  interview_scheduled: 'مقابلة',
  needs_info: 'محتاج بيانات',
  approved: 'مقبول',
  rejected: 'مرفوض',
  draft: 'مسودة',
};

export const SOURCE_LABELS: Record<string, string> = {
  direct: 'مباشر / غير معروف',
  facebook: 'فيسبوك',
  fb: 'فيسبوك',
  instagram: 'إنستجرام',
  ig: 'إنستجرام',
  google: 'جوجل',
  whatsapp: 'واتساب',
  tiktok: 'تيك توك',
  youtube: 'يوتيوب',
};

export const sourceLabel = (s: string) => SOURCE_LABELS[s.toLowerCase()] || s;

// ---------------------------------------------------------------------------
// Activity log wording
// ---------------------------------------------------------------------------

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  tutors: 'ملف معلم',
  tutor_private_info: 'بيانات معلم الخاصة',
  tutor_applications: 'طلب انضمام',
  tutor_profile_drafts: 'تعديل ملف معلم',
  tutor_quality_reviews: 'مراجعة جودة',
  tutor_reviews: 'تقييم',
  tutor_groups: 'مجموعة',
  tutor_private_bookings: 'حجز حصة خاصة',
  tutor_group_enrollments: 'اشتراك في مجموعة',
  parent_leads: 'طلب وليّ أمر',
  direct_trial_bookings: 'حجز تجريبي',
  direct_trial_booking_policy: 'سياسة الحجز',
  direct_trial_reports: 'تقرير حصة',
  tutor_account_links: 'حساب معلم',
  admin_users: 'عضو فريق',
  admin_team_invites: 'دعوة فريق',
  parent_admin_notes: 'ملاحظة على وليّ أمر',
  console: 'لوحة الإدارة',
};

const FIELD_LABELS: Record<string, string> = {
  status: 'الحالة',
  is_published: 'النشر',
  role: 'الصلاحية',
  is_active: 'التفعيل',
  admin_suspended: 'الإيقاف',
  review_status: 'المراجعة',
  attended: 'الحضور',
  meeting_url: 'رابط الحصة',
  name: 'الاسم',
  headline: 'العنوان',
  avatar_url: 'الصورة',
  hourly_rate_min: 'السعر',
  hourly_rate_max: 'السعر',
  admin_notes: 'ملاحظات الإدارة',
  phone_number: 'الموبايل',
  whatsapp_number: 'الواتساب',
  national_id_number: 'الرقم القومي',
  payout_details: 'بيانات الدفع',
};

const VALUE_LABELS: Record<string, string> = {
  ...TRIAL_STATUS_LABELS,
  ...LEAD_STATUS_LABELS,
  ...APPLICATION_STATUS_LABELS,
  ...ADMIN_ROLE_LABELS,
  true: 'نعم',
  false: 'لا',
};

const valueLabel = (v: any) => (v === null || v === undefined ? '—' : VALUE_LABELS[String(v)] || String(v));

/** One short Arabic line describing an activity entry. */
export function describeAuditEntry(e: AdminAuditEntry): string {
  if (e.entityType === 'console') {
    return e.summary || (e.action === 'export_csv' ? 'صدّر ملف Excel' : e.action);
  }
  const what = AUDIT_ENTITY_LABELS[e.entityType] || e.entityType;
  const subject = e.tutorName ? ` — ${e.tutorName}` : '';
  if (e.action === 'insert') return `أضاف ${what}${subject}`;
  if (e.action === 'delete') return `حذف ${what}${subject}`;

  const values = e.details?.values || {};
  if (e.entityType === 'tutors' && values.is_published) {
    return `${values.is_published.to ? 'نشر' : 'أخفى'} ملف المعلم${subject}`;
  }
  const keys = Object.keys(values);
  if (keys.length) {
    const k = keys[0];
    const v = values[k];
    return `غيّر ${FIELD_LABELS[k] || k} في ${what}${subject}: ${valueLabel(v?.from)} ← ${valueLabel(v?.to)}`;
  }
  const changed = (e.details?.changed || []).map((c: string) => FIELD_LABELS[c] || c);
  const uniq = Array.from(new Set(changed)).slice(0, 3);
  return `عدّل ${what}${subject}${uniq.length ? ` (${uniq.join('، ')})` : ''}`;
}

// ---------------------------------------------------------------------------
// Quality flags
// ---------------------------------------------------------------------------

export interface QualityFlag {
  tone: 'rose' | 'amber';
  label: string;
}

export function qualityFlags(row: AdminQualityTutorRow): QualityFlag[] {
  const flags: QualityFlag[] = [];
  if (row.upcomingMissingLink > 0) flags.push({ tone: 'rose', label: `${toArabicDigits(row.upcomingMissingLink)} حصة قريبة من غير رابط` });
  if (row.missingReports > 0) flags.push({ tone: 'amber', label: `${toArabicDigits(row.missingReports)} تقرير ناقص` });
  if (row.lateLinks > 0) flags.push({ tone: 'amber', label: `${toArabicDigits(row.lateLinks)} رابط اتحط متأخر` });
  const held = row.reports;
  if (held >= 3 && row.absences / held >= 0.3) flags.push({ tone: 'amber', label: 'غياب عالي' });
  if (row.bookings >= 3 && row.cancelled / row.bookings >= 0.3) flags.push({ tone: 'amber', label: 'إلغاء عالي' });
  if (row.pendingReviews > 0) flags.push({ tone: 'amber', label: `${toArabicDigits(row.pendingReviews)} تقييم مستني مراجعة` });
  return flags;
}
