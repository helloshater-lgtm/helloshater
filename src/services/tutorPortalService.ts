/**
 * Shatir Classes (شاطر كلاسيز)
 * Tutor Portal Service (بوابة المعلم المعتمد)
 * 
 * Provides authenticated operations for approved tutors:
 * - Loading portal context (verified via server-side auth.uid() and approved application)
 * - Viewing real-time publication status
 * - Managing upcoming available trial slots (hiding internal notes)
 * - Proposing profile drafts (headline, avatar, methodology) for admin review
 */

import { supabase } from '../lib/supabase';
import {
  CANONICAL_QURAN_AGE_GROUPS,
  CANONICAL_QURAN_LEVELS,
  normalizeLegacyAgeGroupText,
  resolveSpecializationLabel,
} from '../utils/formatters';
import {
  TutorPortalContext,
  TutorAvailableSlot,
  TutorProfileDraft,
  ApprovedSpecializationItem,
  TutorPrivateSlot,
  TutorGroup,
} from '../types';

export function deduplicateSpecializationItems(
  items: ApprovedSpecializationItem[]
): ApprovedSpecializationItem[] {
  const seen = new Set<string>();
  const result: ApprovedSpecializationItem[] = [];

  for (const rawItem of items) {
    if (!rawItem || typeof rawItem !== 'object') continue;
    const item = rawItem as any;
    const courseOptionId = item.courseOptionId || item.offeringCourseOptionId || undefined;
    const ageGroupId = item.ageGroupId || item.quranAgeGroupId || undefined;
    const levelId = item.levelId || item.quranLevelId || undefined;

    const hasSchoolIds = Boolean(courseOptionId);
    const hasQuranIds = Boolean(ageGroupId || levelId);
    const isSchool = item.track === 'school' || hasSchoolIds;
    const isQuran = item.track === 'quran' || hasQuranIds;

    if ((isSchool && isQuran) || (hasSchoolIds && hasQuranIds)) {
      throw new Error('تناقض في بيانات التخصص: لا يمكن الجمع بين المسار المدرسي والقرآني في نفس البديل.');
    }

    let key = '';
    let normalizedItem: ApprovedSpecializationItem | null = null;
    if (isSchool && courseOptionId && !hasQuranIds) {
      key = `school:${courseOptionId}`;
      normalizedItem = {
        ...item,
        id: item.id || `school-${courseOptionId}`,
        track: 'school',
        courseOptionId: String(courseOptionId),
        ageGroupId: undefined,
        levelId: undefined,
      };
    } else if (isQuran && ageGroupId && levelId && !hasSchoolIds) {
      key = `quran:${ageGroupId}:${levelId}`;
      normalizedItem = {
        ...item,
        id: item.id || `quran-${ageGroupId}-${levelId}`,
        track: 'quran',
        courseOptionId: undefined,
        ageGroupId: String(ageGroupId),
        levelId: String(levelId),
      };
    }

    if (normalizedItem && key && !seen.has(key)) {
      seen.add(key);
      result.push(normalizedItem);
    }
  }

  return result;
}

export function normalizeSlotAllowedSpecializations(rawSlot: any): ApprovedSpecializationItem[] {
  if (!rawSlot) return [];

  const primaryCourseId = rawSlot.offering_course_option_id || rawSlot.offeringCourseOptionId || rawSlot.courseOptionId || null;
  const primaryAgeId = rawSlot.quran_age_group_id || rawSlot.quranAgeGroupId || rawSlot.ageGroupId || null;
  const primaryLevelId = rawSlot.quran_level_id || rawSlot.quranLevelId || rawSlot.levelId || null;
  const primaryLabel = resolveSpecializationLabel({
    specializationLabel: rawSlot.specialization_label || rawSlot.specializationLabel || '',
    quranAgeGroupId: primaryAgeId,
    quranLevelId: primaryLevelId,
  });

  let primaryItem: ApprovedSpecializationItem | null = null;
  if (primaryCourseId && !primaryAgeId && !primaryLevelId) {
    primaryItem = {
      id: `school-${primaryCourseId}`,
      track: 'school',
      courseOptionId: String(primaryCourseId),
      label: primaryLabel || 'تخصص مدرسي',
    };
  } else if (!primaryCourseId && primaryAgeId && primaryLevelId) {
    primaryItem = {
      id: `quran-${primaryAgeId}-${primaryLevelId}`,
      track: 'quran',
      ageGroupId: String(primaryAgeId),
      levelId: String(primaryLevelId),
      label: primaryLabel || 'قرآن وتأسيس',
    };
  }

  const rawList = Array.isArray(rawSlot.allowed_specializations)
    ? rawSlot.allowed_specializations
    : Array.isArray(rawSlot.allowedSpecializations)
    ? rawSlot.allowedSpecializations
    : [];

  if (rawList.length > 0) {
    const mapped: ApprovedSpecializationItem[] = [];
    if (primaryItem) {
      mapped.push(primaryItem);
    }
    for (const item of rawList) {
      if (!item || typeof item !== 'object') continue;
      const courseOptionId =
        item.courseOptionId || item.offeringCourseOptionId || item.offering_course_option_id || null;
      const ageGroupId = item.ageGroupId || item.quranAgeGroupId || item.quran_age_group_id || null;
      const levelId = item.levelId || item.quranLevelId || item.quran_level_id || null;
      const track =
        item.track === 'school' || item.track === 'quran'
          ? item.track
          : courseOptionId
          ? 'school'
          : ageGroupId && levelId
          ? 'quran'
          : null;

      if (track === 'school' && courseOptionId && !ageGroupId && !levelId) {
        mapped.push({
          id: item.id || `school-${courseOptionId}`,
          track: 'school',
          courseOptionId: String(courseOptionId),
          label: normalizeLegacyAgeGroupText(item.label || primaryLabel || 'تخصص مدرسي'),
        });
      } else if (track === 'quran' && ageGroupId && levelId && !courseOptionId) {
        mapped.push({
          id: item.id || `quran-${ageGroupId}-${levelId}`,
          track: 'quran',
          ageGroupId: String(ageGroupId),
          levelId: String(levelId),
          label: resolveSpecializationLabel({
            specializationLabel: item.label || primaryLabel || 'قرآن وتأسيس',
            quranAgeGroupId: String(ageGroupId),
            quranLevelId: String(levelId),
          }),
        });
      }
    }
    if (mapped.length > 0) {
      return deduplicateSpecializationItems(mapped);
    }
  }

  return primaryItem ? [primaryItem] : [];
}

export function isMissingMultiSpecRpcError(rpcError: any): boolean {
  if (!rpcError) return false;
  const msg = String(rpcError.message || '');
  return (
    rpcError.code === '42883' ||
    rpcError.code === 'PGRST202' ||
    msg.includes('p_allowed_specializations') ||
    msg.includes('Could not find the function')
  );
}

export const TutorPortalService = {
  /**
   * 1. Get current tutor portal context
   * Resolves tutor strictly from authenticated user session without trusting browser-provided tutor IDs
   */
  async getMyContext(): Promise<TutorPortalContext> {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      throw new Error('يرجى تسجيل الدخول للوصول إلى لوحة المعلم.');
    }

    // Try server-side RPC first
    const { data: rpcData, error: rpcError } = await supabase.rpc('tutor_get_portal_context');

    if (!rpcError && rpcData) {
      return rpcData as TutorPortalContext;
    }

    const isRpcMissing =
      rpcError &&
      (rpcError.code === '42883' ||
        rpcError.code === 'PGRST202' ||
        rpcError.message?.includes('Could not find the function') ||
        rpcError.message?.includes('does not exist'));

    if (rpcError && !isRpcMissing) {
      throw new Error(rpcError.message || 'حسابك غير مرتبط بطلب معتمد أو ملف معلم مفعل في منصة شاطر.');
    }

    // Fallback if migration 007 is not yet applied in remote database
    // Query approved tutor application for current user
    const { data: appData, error: appError } = await supabase
      .from('tutor_applications')
      .select('*')
      .eq('user_id', authData.user.id)
      .eq('status', 'approved')
      .not('applicant_tutor_id', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (appError || !appData || !appData.applicant_tutor_id) {
      // Check if tutor_account_links has a record
      const { data: linkData } = await supabase
        .from('tutor_account_links')
        .select('tutor_id')
        .eq('user_id', authData.user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (!linkData?.tutor_id) {
        throw new Error('حسابك غير مرتبط بطلب معتمد أو ملف معلم مفعل في منصة شاطر.');
      }

      const { data: tutorRow } = await supabase
        .from('tutors')
        .select('*')
        .eq('id', linkData.tutor_id)
        .single();

      if (!tutorRow) {
        throw new Error('ملف المعلم غير موجود في النظام.');
      }

      return {
        tutor: {
          id: tutorRow.id,
          name: tutorRow.name,
          honorific: tutorRow.honorific || 'أ.',
          headline: tutorRow.headline,
          avatarUrl: tutorRow.avatar_url || '',
          helpChildQuote: tutorRow.help_child_quote,
          helpChildSummary: tutorRow.help_child_summary,
          isPublished: Boolean(tutorRow.is_published),
          yearsOfExperience: tutorRow.years_of_experience || 0,
          experienceBadgeText: tutorRow.experience_badge_text,
          verifiedCredentials: Boolean(tutorRow.verified_credentials),
          hourlyRateMin: tutorRow.hourly_rate_min || 0,
          hourlyRateMax: tutorRow.hourly_rate_max || 0,
          currency: tutorRow.currency || 'ج.م',
          sessionDurationMinutes: tutorRow.session_duration_minutes || 50,
          trialDurationMinutes: tutorRow.trial_duration_minutes || 20,
          rating: tutorRow.rating,
          reviewsCount: tutorRow.reviews_count,
          curriculumTags: tutorRow.curriculum_tags || [],
        },
        pendingDraft: null,
        application: null,
      };
    }

    const tutorId = appData.applicant_tutor_id;
    const { data: tutorRow, error: tutorErr } = await supabase
      .from('tutors')
      .select('*')
      .eq('id', tutorId)
      .maybeSingle();

    if (tutorErr || !tutorRow) {
      throw new Error('تعذر تحميل بيانات ملف المعلم المرتبط بالطلب.');
    }

    // Query any pending draft
    let pendingDraft: TutorProfileDraft | null = null;
    try {
      const { data: draftData } = await supabase
        .from('tutor_profile_drafts')
        .select('*')
        .eq('tutor_id', tutorId)
        .in('status', ['pending_review', 'needs_revision', 'draft'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (draftData) {
        pendingDraft = {
          id: draftData.id,
          tutorId: draftData.tutor_id,
          headline: draftData.headline,
          avatarUrl: draftData.avatar_url,
          helpChildQuote: draftData.help_child_quote,
          helpChildSummary: draftData.help_child_summary,
          status: draftData.status,
          adminNotes: draftData.admin_notes,
          submittedAt: draftData.submitted_at,
          reviewedAt: draftData.reviewed_at,
          createdAt: draftData.created_at,
          updatedAt: draftData.updated_at,
        };
      }
    } catch {
      // Table might not exist yet
    }

    return {
      tutor: {
        id: tutorRow.id,
        name: tutorRow.name,
        honorific: tutorRow.honorific || 'أ.',
        headline: tutorRow.headline,
        avatarUrl: tutorRow.avatar_url || '',
        helpChildQuote: tutorRow.help_child_quote,
        helpChildSummary: tutorRow.help_child_summary,
        isPublished: Boolean(tutorRow.is_published),
        yearsOfExperience: tutorRow.years_of_experience || 0,
        experienceBadgeText: tutorRow.experience_badge_text,
        verifiedCredentials: Boolean(tutorRow.verified_credentials),
        hourlyRateMin: tutorRow.hourly_rate_min || 0,
        hourlyRateMax: tutorRow.hourly_rate_max || 0,
        currency: tutorRow.currency || 'ج.م',
        sessionDurationMinutes: tutorRow.session_duration_minutes || 50,
        trialDurationMinutes: tutorRow.trial_duration_minutes || 20,
        rating: tutorRow.rating,
        reviewsCount: tutorRow.reviews_count,
        curriculumTags: tutorRow.curriculum_tags || [],
      },
      pendingDraft,
      application: {
        id: appData.id,
        referenceCode: appData.reference_code,
        status: appData.status,
        adminNotes: appData.admin_notes,
        approvedAt: appData.reviewed_at,
      },
    };
  },

  /**
   * 2. Get tutor's slots without exposing internal notes
   */
  async getMySlots(): Promise<TutorAvailableSlot[]> {
    const { data: rpcData, error: rpcError } = await supabase.rpc('tutor_get_my_slots');

    if (!rpcError && rpcData) {
      return (rpcData as any[]).map((s) => ({
        id: s.id,
        tutorId: '',
        slotDate: s.slot_date,
        startTime: s.start_time,
        endTime: s.end_time,
        timezone: s.timezone || 'Africa/Cairo',
        isAvailable: Boolean(s.is_available),
        adminSuspended: Boolean(s.admin_suspended),
        isBooked: Boolean(s.is_booked),
        bookedAt: s.booked_at,
        notes: null, // Always concealed from tutor
        createdAt: s.created_at,
      }));
    }

    // Fallback: get current tutor ID and query slots
    const context = await this.getMyContext();
    const { data, error } = await supabase
      .from('tutor_available_slots')
      .select('id, slot_date, start_time, end_time, timezone, is_available, admin_suspended, is_booked, booked_at, created_at')
      .eq('tutor_id', context.tutor.id)
      .order('slot_date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) {
      throw new Error(`تعذر تحميل المواعيد: ${error.message}`);
    }

    return (data || []).map((s: any) => ({
      id: s.id,
      tutorId: context.tutor.id,
      slotDate: s.slot_date,
      startTime: s.start_time,
      endTime: s.end_time,
      timezone: s.timezone || 'Africa/Cairo',
      isAvailable: Boolean(s.is_available),
      adminSuspended: Boolean(s.admin_suspended),
      isBooked: Boolean(s.is_booked),
      bookedAt: s.booked_at,
      notes: null, // Concealed
      createdAt: s.created_at,
    }));
  },

  /**
   * 3. Create a future available slot
   * Strictly uses secure server-side RPC tutor_create_slot
   */
  async createSlot(
    slotDate: string,
    startTime: string,
    endTime: string,
    timezone: string = 'Africa/Cairo'
  ): Promise<void> {
    const { error: rpcError } = await supabase.rpc('tutor_create_slot', {
      p_slot_date: slotDate,
      p_start_time: startTime,
      p_end_time: endTime,
      p_timezone: timezone,
    });

    if (rpcError) {
      throw new Error(`تعذر حفظ الموعد: ${rpcError.message}`);
    }
  },

  /**
   * 4. Delete an available slot (strictly uses secure server-side RPC)
   */
  async deleteSlot(slotId: string): Promise<void> {
    const { error: rpcError } = await supabase.rpc('tutor_delete_slot', {
      p_slot_id: slotId,
    });

    if (rpcError) {
      throw new Error(`تعذر حذف الموعد: ${rpcError.message}`);
    }
  },

  /**
   * 5. Upload proposed avatar to private pending storage bucket
   * Path: pending/<auth.uid()>/<unique-filename>
   * Returns storagePath (for persistent DB draft) and previewSignedUrl (for immediate UI preview)
   */
  async uploadDraftAvatar(file: File): Promise<{ storagePath: string; previewSignedUrl: string }> {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      throw new Error('يجب تسجيل الدخول لرفع الصورة المقترحة.');
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      throw new Error('يرجى اختيار صورة بصيغة صالحة (JPEG أو PNG أو WebP).');
    }

    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
      throw new Error('حجم الصورة يجب ألا يتجاوز 2 ميجابايت.');
    }

    const ext = file.type.split('/')[1] || 'jpg';
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const storagePath = `pending/${authData.user.id}/${uniqueSuffix}.${ext}`;

    const { error } = await supabase.storage
      .from('tutor-avatars-pending')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      throw new Error(`تعذر رفع الصورة المقترحة: ${error.message}`);
    }

    // Get signed URL for preview (1 hour)
    const { data: signedData } = await supabase.storage
      .from('tutor-avatars-pending')
      .createSignedUrl(storagePath, 3600);

    return {
      storagePath,
      previewSignedUrl: signedData?.signedUrl || storagePath,
    };
  },

  /**
   * Helper to resolve a signed preview URL for avatar paths in tutor-avatars-pending
   */
  async getSignedAvatarUrl(path: string | null | undefined): Promise<string | null> {
    if (!path) return null;
    if (path.startsWith('pending/')) {
      try {
        const { data } = await supabase.storage
          .from('tutor-avatars-pending')
          .createSignedUrl(path, 3600);
        return data?.signedUrl || null;
      } catch {
        return null;
      }
    }
    return path;
  },

  /**
   * 6. Submit profile draft for administrative review
   * Saves the permanent private storagePath (not temporary Signed URL)
   */
  async submitProfileDraft(payload: {
    headline: string;
    avatarPath?: string | null;
    helpChildQuote?: string | null;
    helpChildSummary?: string | null;
  }): Promise<void> {
    if (!payload.headline.trim() || payload.headline.trim().length < 10) {
      throw new Error('العنوان التعريفي مطلوب ويجب أن يحتوي على 10 أحرف على الأقل.');
    }

    const { error: rpcError } = await supabase.rpc('tutor_submit_profile_draft', {
      p_headline: payload.headline.trim(),
      p_avatar_url: payload.avatarPath || null,
      p_help_child_quote: payload.helpChildQuote?.trim() || null,
      p_help_child_summary: payload.helpChildSummary?.trim() || null,
    });

    if (rpcError) {
      throw new Error(`فشل إرسال مقترح التعديل: ${rpcError.message}`);
    }
  },

  /**
   * 7. Get approved specializations for the current tutor
   * Returns school combinations and quran levels configured in the tutor's approved profile
   */
  async getMySpecializations(): Promise<ApprovedSpecializationItem[]> {
    const { data: rpcData, error: rpcError } = await supabase.rpc('tutor_get_my_specializations');
    if (!rpcError && rpcData) {
      const items: ApprovedSpecializationItem[] = [];
      const schoolList = rpcData.schoolSpecializations || [];
      const quranList = rpcData.quranSpecializations || [];

      schoolList.forEach((s: any) => {
        items.push({
          id: `school-${s.courseOptionId}`,
          track: 'school',
          label: s.label,
          courseOptionId: s.courseOptionId,
          stageId: s.stageId,
          stageName: s.stageName,
          gradeId: s.gradeId,
          gradeName: s.gradeName,
          subjectId: s.subjectId,
          subjectName: s.subjectName,
          curriculumId: s.curriculumId,
          curriculumName: s.curriculumName,
        });
      });

      quranList.forEach((q: any) => {
        const canonicalAg = CANONICAL_QURAN_AGE_GROUPS[q.ageGroupId];
        const canonicalLvl = CANONICAL_QURAN_LEVELS[q.levelId];
        const agName = canonicalAg?.name || normalizeLegacyAgeGroupText(q.ageGroupName);
        const lvlName = canonicalLvl?.name || q.levelName;
        items.push({
          id: `quran-${q.ageGroupId}-${q.levelId}`,
          track: 'quran',
          label:
            canonicalAg && canonicalLvl
              ? `قرآن وتأسيس: ${lvlName} (${agName})`
              : normalizeLegacyAgeGroupText(q.label),
          ageGroupId: q.ageGroupId,
          ageGroupName: agName,
          levelId: q.levelId,
          levelName: lvlName,
        });
      });

      return items;
    }

    // Fallback: query school offerings & quran offerings directly
    const context = await this.getMyContext();
    const tutorId = context.tutor.id;

    const [schoolOfferingsRes, quranOfferingsRes] = await Promise.all([
      supabase
        .from('tutor_school_offerings')
        .select(`
          course_option_id,
          school_course_options (
            id,
            grade_id,
            subject_id,
            curriculum_id,
            educational_grades (id, name, stage_id, educational_stages (id, name)),
            subjects (id, name),
            curriculum_types (id, name)
          )
        `)
        .eq('tutor_id', tutorId),
      supabase
        .from('tutor_quran_offerings')
        .select(`
          age_group_id,
          level_id,
          quran_age_groups (id, name),
          quran_levels (id, name)
        `)
        .eq('tutor_id', tutorId),
    ]);

    const items: ApprovedSpecializationItem[] = [];

    (schoolOfferingsRes.data || []).forEach((row: any) => {
      const sco = row.school_course_options;
      if (!sco) return;
      const subName = sco.subjects?.name || 'مادة دراسية';
      const grName = sco.educational_grades?.name || '';
      const ctName = sco.curriculum_types?.name || '';
      items.push({
        id: `school-${sco.id}`,
        track: 'school',
        label: `${subName} - ${grName} (${ctName})`,
        courseOptionId: sco.id,
        stageId: sco.educational_grades?.stage_id,
        stageName: sco.educational_grades?.educational_stages?.name,
        gradeId: sco.grade_id,
        gradeName: grName,
        subjectId: sco.subject_id,
        subjectName: subName,
        curriculumId: sco.curriculum_id,
        curriculumName: ctName,
      });
    });

    (quranOfferingsRes.data || []).forEach((row: any) => {
      const canonicalAg = CANONICAL_QURAN_AGE_GROUPS[row.age_group_id];
      const canonicalLvl = CANONICAL_QURAN_LEVELS[row.level_id];
      const agName = canonicalAg?.name || normalizeLegacyAgeGroupText(row.quran_age_groups?.name || '');
      const lvlName = canonicalLvl?.name || row.quran_levels?.name || '';
      items.push({
        id: `quran-${row.age_group_id}-${row.level_id}`,
        track: 'quran',
        label: `قرآن وتأسيس: ${lvlName} (${agName})`,
        ageGroupId: row.age_group_id,
        ageGroupName: agName,
        levelId: row.level_id,
        levelName: lvlName,
      });
    });

    return items;
  },

  /**
   * 8. Private slots (1:1) operations
   */
  async getMyPrivateSlots(): Promise<TutorPrivateSlot[]> {
    const { data: rpcData, error: rpcError } = await supabase.rpc('tutor_get_my_private_slots');
    if (rpcError) {
      throw new Error(`تعذر تحميل المواعيد الخاصة: ${rpcError.message}`);
    }

    return ((rpcData as any[]) || []).map((s) => ({
      id: s.id,
      specializationLabel: resolveSpecializationLabel({
        specializationLabel: s.specialization_label,
        quranAgeGroupId: s.quran_age_group_id,
        quranLevelId: s.quran_level_id,
      }),
      offeringCourseOptionId: s.offering_course_option_id ?? null,
      quranAgeGroupId: s.quran_age_group_id ?? null,
      quranLevelId: s.quran_level_id ?? null,
      allowedSpecializations: normalizeSlotAllowedSpecializations(s),
      slotDate: s.slot_date,
      startTime: s.start_time,
      endTime: s.end_time,
      timezone: s.timezone || 'Africa/Cairo',
      durationMinutes: Number(s.duration_minutes),
      priceAmount: Number(s.price_amount),
      currency: s.currency || 'ج.م',
      isAvailable: Boolean(s.is_available),
      adminSuspended: Boolean(s.admin_suspended),
      adminSuspensionNotes: s.admin_suspension_notes ?? null,
      isBooked: Boolean(s.is_booked),
      bookedAt: s.booked_at ?? null,
      createdAt: s.created_at,
    }));
  },

  async createPrivateSlots(params: {
    specialization?: ApprovedSpecializationItem;
    specializations?: ApprovedSpecializationItem[];
    durationMinutes: number;
    priceAmount: number;
    currency?: string;
    timezone?: string;
    slots: Array<{ date: string; startTime: string; endTime: string }>;
  }): Promise<{ insertedCount: number }> {
    const { durationMinutes, priceAmount, currency = 'ج.م', timezone = 'Africa/Cairo', slots } = params;
    const rawSpecs: ApprovedSpecializationItem[] =
      params.specializations && params.specializations.length > 0
        ? params.specializations
        : params.specialization
        ? [params.specialization]
        : [];

    const allSpecs = deduplicateSpecializationItems(rawSpecs);

    if (allSpecs.length === 0) {
      throw new Error('يرجى اختيار تخصص معتمد واحد على الأقل للموعد الخاص.');
    }

    if (!Array.isArray(slots) || slots.length === 0) {
      throw new Error('يرجى تحديد موعد واحد على الأقل للإضافة.');
    }

    if (durationMinutes == null || Number.isNaN(Number(durationMinutes)) || durationMinutes < 30 || durationMinutes > 120) {
      throw new Error('مدة الحصة الخاصة مطلوبة ويجب أن تكون بين 30 و 120 دقيقة.');
    }

    if (priceAmount == null || Number.isNaN(Number(priceAmount)) || priceAmount < 0) {
      throw new Error('سعر الحصة الخاصة مطلوب ويجب أن يكون قيمة موجبة أو صفراً.');
    }

    const primarySpec = allSpecs[0];
    const allowedSpecsPayload = allSpecs.map((s) => ({
      id: s.id,
      track: s.track,
      courseOptionId: s.track === 'school' ? s.courseOptionId || null : null,
      ageGroupId: s.track === 'quran' ? s.ageGroupId || null : null,
      levelId: s.track === 'quran' ? s.levelId || null : null,
      label: s.label,
    }));

    const { data: rpcData, error: rpcError } = await supabase.rpc('tutor_create_private_slots', {
      p_specialization_label: primarySpec.label,
      p_duration_minutes: Math.round(Number(durationMinutes)),
      p_price_amount: Math.round(Number(priceAmount)),
      p_currency: currency,
      p_slots: slots,
      p_offering_course_option_id: primarySpec.track === 'school' ? primarySpec.courseOptionId || null : null,
      p_quran_age_group_id: primarySpec.track === 'quran' ? primarySpec.ageGroupId || null : null,
      p_quran_level_id: primarySpec.track === 'quran' ? primarySpec.levelId || null : null,
      p_timezone: timezone,
      p_allowed_specializations: allowedSpecsPayload,
    });

    if (!rpcError) {
      return { insertedCount: rpcData?.insertedCount || slots.length };
    }

    if (isMissingMultiSpecRpcError(rpcError)) {
      if (allSpecs.length > 1) {
        throw new Error(
          'إتاحة الموعد الخاص لأكثر من تخصص بديل تتطلب تطبيق تحديث قاعدة البيانات (Migration 013) أولاً. يرجى اختيار تخصص واحد فقط حالياً لحين تطبيق التحديث.'
        );
      }

      const { data: fallbackData, error: fallbackError } = await supabase.rpc('tutor_create_private_slots', {
        p_specialization_label: primarySpec.label,
        p_duration_minutes: Math.round(Number(durationMinutes)),
        p_price_amount: Math.round(Number(priceAmount)),
        p_currency: currency,
        p_slots: slots,
        p_offering_course_option_id: primarySpec.track === 'school' ? primarySpec.courseOptionId || null : null,
        p_quran_age_group_id: primarySpec.track === 'quran' ? primarySpec.ageGroupId || null : null,
        p_quran_level_id: primarySpec.track === 'quran' ? primarySpec.levelId || null : null,
        p_timezone: timezone,
      });

      if (fallbackError) {
        throw new Error(`تعذر حفظ المواعيد الخاصة: ${fallbackError.message}`);
      }

      return { insertedCount: fallbackData?.insertedCount || slots.length };
    }

    throw new Error(`تعذر حفظ المواعيد الخاصة: ${rpcError.message}`);
  },

  async deletePrivateSlot(slotId: string): Promise<void> {
    const { error: rpcError } = await supabase.rpc('tutor_delete_private_slot', {
      p_slot_id: slotId,
    });

    if (rpcError) {
      throw new Error(`تعذر حذف الموعد الخاص: ${rpcError.message}`);
    }
  },

  async updatePrivateSlot(params: {
    slotId: string;
    slotDate: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    priceAmount: number;
    specialization?: ApprovedSpecializationItem;
    specializations?: ApprovedSpecializationItem[];
    timezone?: string;
  }): Promise<void> {
    const { slotId, slotDate, startTime, endTime, durationMinutes, priceAmount, timezone = 'Africa/Cairo' } = params;
    const rawSpecs: ApprovedSpecializationItem[] =
      params.specializations && params.specializations.length > 0
        ? params.specializations
        : params.specialization
        ? [params.specialization]
        : [];

    const allSpecs = deduplicateSpecializationItems(rawSpecs);

    if (allSpecs.length === 0) {
      throw new Error('يرجى اختيار تخصص معتمد واحد على الأقل للموعد الخاص.');
    }

    if (durationMinutes == null || Number.isNaN(Number(durationMinutes)) || durationMinutes < 30 || durationMinutes > 120) {
      throw new Error('مدة الحصة الخاصة مطلوبة ويجب أن تكون بين 30 و 120 دقيقة.');
    }

    if (priceAmount == null || Number.isNaN(Number(priceAmount)) || priceAmount < 0) {
      throw new Error('سعر الحصة الخاصة مطلوب ويجب أن يكون قيمة موجبة أو صفراً.');
    }

    const primarySpec = allSpecs[0];
    const allowedSpecsPayload = allSpecs.map((s) => ({
      id: s.id,
      track: s.track,
      courseOptionId: s.track === 'school' ? s.courseOptionId || null : null,
      ageGroupId: s.track === 'quran' ? s.ageGroupId || null : null,
      levelId: s.track === 'quran' ? s.levelId || null : null,
      label: s.label,
    }));

    const { error: rpcError } = await supabase.rpc('tutor_update_private_slot', {
      p_slot_id: slotId,
      p_slot_date: slotDate,
      p_start_time: startTime,
      p_end_time: endTime,
      p_duration_minutes: Math.round(Number(durationMinutes)),
      p_price_amount: Math.round(Number(priceAmount)),
      p_timezone: timezone,
      p_offering_course_option_id: primarySpec.track === 'school' ? primarySpec.courseOptionId || null : null,
      p_quran_age_group_id: primarySpec.track === 'quran' ? primarySpec.ageGroupId || null : null,
      p_quran_level_id: primarySpec.track === 'quran' ? primarySpec.levelId || null : null,
      p_allowed_specializations: allowedSpecsPayload,
    });

    if (!rpcError) {
      return;
    }

    if (isMissingMultiSpecRpcError(rpcError)) {
      if (allSpecs.length > 1) {
        throw new Error(
          'تعديل الموعد الخاص ليشمل أكثر من تخصص بديل يتطلب تطبيق تحديث قاعدة البيانات (Migration 013) أولاً. يرجى اختيار تخصص واحد فقط حالياً لحين تطبيق التحديث.'
        );
      }

      const { error: fallbackError } = await supabase.rpc('tutor_update_private_slot', {
        p_slot_id: slotId,
        p_slot_date: slotDate,
        p_start_time: startTime,
        p_end_time: endTime,
        p_duration_minutes: Math.round(Number(durationMinutes)),
        p_price_amount: Math.round(Number(priceAmount)),
        p_timezone: timezone,
        p_offering_course_option_id: primarySpec.track === 'school' ? primarySpec.courseOptionId || null : null,
        p_quran_age_group_id: primarySpec.track === 'quran' ? primarySpec.ageGroupId || null : null,
        p_quran_level_id: primarySpec.track === 'quran' ? primarySpec.levelId || null : null,
      });

      if (fallbackError) {
        throw new Error(`تعذر تعديل الموعد الخاص: ${fallbackError.message}`);
      }
      return;
    }

    throw new Error(`تعذر تعديل الموعد الخاص: ${rpcError.message}`);
  },

  /**
   * 8. Private slots stats
   */
  async getPrivateSlotsStats(): Promise<{ futureAvailableCount: number; futureBookedCount: number }> {
    const { data: rpcData, error: rpcError } = await supabase.rpc('tutor_get_private_slots_stats');
    if (!rpcError && rpcData) {
      return {
        futureAvailableCount: rpcData.futureAvailableCount || 0,
        futureBookedCount: rpcData.futureBookedCount || 0,
      };
    }
    return { futureAvailableCount: 0, futureBookedCount: 0 };
  },

  /**
   * 9. Educational Groups operations
   */
  async getMyGroups(): Promise<TutorGroup[]> {
    const { data: rpcData, error: rpcError } = await supabase.rpc('tutor_get_my_groups');
    if (!rpcError && rpcData) {
      return (rpcData as any[]).map((g) => ({
        id: g.id,
        title: g.title,
        description: g.description,
        specializationLabel: resolveSpecializationLabel({
          specializationLabel: g.specialization_label,
          quranAgeGroupId: g.quran_age_group_id,
          quranLevelId: g.quran_level_id,
        }),
        maxStudents: g.max_students,
        enrolledStudents: g.enrolled_students || 0,
        remainingSeats:
          g.remaining_seats !== undefined
            ? g.remaining_seats
            : Math.max(0, g.max_students - (g.enrolled_students || 0)),
        pricePerStudent: g.price_per_student,
        priceType: g.price_type || 'full_package',
        currency: g.currency || 'ج.م',
        sessionsCount: g.sessions_count,
        sessionDurationMinutes: g.session_duration_minutes,
        startDate: g.start_date,
        endDate: g.end_date,
        weeklyScheduleSummary: g.weekly_schedule_summary,
        reviewStatus: g.review_status || (g.is_published ? 'approved' : 'open'),
        adminReviewNotes: g.admin_review_notes || null,
        adminSuspended: Boolean(g.admin_suspended),
        adminSuspensionReason: g.admin_suspension_reason || null,
        status: g.status,
        isPublished: Boolean(g.is_published),
        createdAt: g.created_at,
      }));
    }

    // Fallback: direct select if RPC not yet deployed
    const context = await this.getMyContext();
    const { data, error } = await supabase
      .from('tutor_groups')
      .select('*')
      .eq('tutor_id', context.tutor.id)
      .order('start_date', { ascending: false });

    if (error) {
      return [];
    }

    return (data || []).map((g: any) => ({
      id: g.id,
      title: g.title,
      description: g.description,
      specializationLabel: resolveSpecializationLabel({
        specializationLabel: g.specialization_label,
        quranAgeGroupId: g.quran_age_group_id,
        quranLevelId: g.quran_level_id,
      }),
      maxStudents: g.max_students,
      enrolledStudents: g.enrolled_students || 0,
      remainingSeats: Math.max(0, g.max_students - (g.enrolled_students || 0)),
      pricePerStudent: g.price_per_student,
      priceType: g.price_type || 'full_package',
      currency: g.currency || 'ج.م',
      sessionsCount: g.sessions_count,
      sessionDurationMinutes: g.session_duration_minutes,
      startDate: g.start_date,
      endDate: g.end_date,
      weeklyScheduleSummary: g.weekly_schedule_summary,
      reviewStatus: g.review_status || 'approved',
      adminReviewNotes: g.admin_review_notes || null,
      adminSuspended: Boolean(g.admin_suspended),
      adminSuspensionReason: g.admin_suspension_reason || null,
      status: g.status,
      isPublished: Boolean(g.is_published),
      createdAt: g.created_at,
    }));
  },

  async getGroupSessions(groupId: string): Promise<any[]> {
    const { data: rpcData, error } = await supabase.rpc('tutor_get_group_sessions', {
      p_group_id: groupId,
    });
    if (!error && rpcData) {
      return rpcData.map((s: any) => ({
        id: s.id,
        sessionNumber: s.session_number,
        sessionDate: s.session_date,
        startTime: s.start_time,
        endTime: s.end_time,
        timezone: s.timezone,
        title: s.title,
      }));
    }
    return [];
  },

  async createGroup(params: {
    title: string;
    description?: string;
    specialization: ApprovedSpecializationItem;
    maxStudents: number;
    pricePerStudent: number;
    priceType?: 'per_session' | 'full_package';
    currency?: string;
    sessionsCount: number;
    sessionDurationMinutes: number;
    startDate: string;
    endDate?: string;
    weeklyScheduleSummary: string;
    sessions: Array<{
      sessionNumber: number;
      sessionDate: string;
      startTime: string;
      endTime: string;
      timezone?: string;
      title?: string;
    }>;
  }): Promise<void> {
    const {
      title,
      description = '',
      specialization,
      maxStudents,
      pricePerStudent,
      priceType = 'full_package',
      currency = 'ج.م',
      sessionsCount,
      sessionDurationMinutes,
      startDate,
      endDate,
      weeklyScheduleSummary,
      sessions,
    } = params;

    const { error: rpcError } = await supabase.rpc('tutor_create_group', {
      p_title: title.trim(),
      p_description: description.trim(),
      p_specialization_label: specialization.label,
      p_max_students: maxStudents,
      p_price_per_student: pricePerStudent,
      p_price_type: priceType,
      p_currency: currency,
      p_sessions_count: sessionsCount,
      p_session_duration_minutes: sessionDurationMinutes,
      p_start_date: startDate,
      p_end_date: endDate || null,
      p_weekly_schedule_summary: weeklyScheduleSummary.trim(),
      p_sessions: sessions,
      p_offering_course_option_id: specialization.courseOptionId || null,
      p_quran_age_group_id: specialization.ageGroupId || null,
      p_quran_level_id: specialization.levelId || null,
    });

    if (rpcError) {
      throw new Error(`تعذر إنشاء المجموعة التعليمية: ${rpcError.message}`);
    }
  },

  async updateGroupStatus(
    groupId: string,
    status: 'open' | 'in_progress' | 'completed' | 'cancelled'
  ): Promise<void> {
    const { error: rpcError } = await supabase.rpc('tutor_update_group_status', {
      p_group_id: groupId,
      p_status: status,
    });

    if (rpcError) {
      throw new Error(`تعذر تحديث حالة المجموعة: ${rpcError.message}`);
    }
  },

  async updateGroup(params: {
    groupId: string;
    title: string;
    description?: string;
    specialization: ApprovedSpecializationItem;
    maxStudents: number;
    pricePerStudent: number;
    priceType?: 'per_session' | 'full_package';
    currency?: string;
    sessionsCount: number;
    sessionDurationMinutes: number;
    startDate: string;
    endDate?: string;
    weeklyScheduleSummary: string;
    sessions: Array<{
      sessionNumber: number;
      sessionDate: string;
      startTime: string;
      endTime: string;
      timezone?: string;
      title?: string;
    }>;
  }): Promise<void> {
    const {
      groupId,
      title,
      description = '',
      specialization,
      maxStudents,
      pricePerStudent,
      priceType = 'full_package',
      currency = 'ج.م',
      sessionsCount,
      sessionDurationMinutes,
      startDate,
      endDate,
      weeklyScheduleSummary,
      sessions,
    } = params;

    const { error: rpcError } = await supabase.rpc('tutor_update_group', {
      p_group_id: groupId,
      p_title: title.trim(),
      p_description: description.trim(),
      p_max_students: maxStudents,
      p_price_per_student: pricePerStudent,
      p_price_type: priceType,
      p_currency: currency,
      p_sessions_count: sessionsCount,
      p_session_duration_minutes: sessionDurationMinutes,
      p_start_date: startDate,
      p_end_date: endDate || null,
      p_weekly_schedule_summary: weeklyScheduleSummary.trim(),
      p_sessions: sessions,
      p_offering_course_option_id: specialization.courseOptionId || null,
      p_quran_age_group_id: specialization.ageGroupId || null,
      p_quran_level_id: specialization.levelId || null,
    });

    if (rpcError) {
      throw new Error(`تعذر تحديث بيانات المجموعة: ${rpcError.message}`);
    }
  },

  /**
   * 10. Teaching: Confirmed students and bookings for tutor
   */
  async getMyConfirmedPrivateBookings(): Promise<any[]> {
    const { data, error } = await supabase.rpc('tutor_get_my_confirmed_private_bookings');
    if (error) {
      return [];
    }
    return (data || []).map((row: any) => ({
      bookingId: row.booking_id,
      slotId: row.slot_id,
      slotDate: row.slot_date,
      startTime: row.start_time,
      endTime: row.end_time,
      timezone: row.timezone,
      specializationLabel: resolveSpecializationLabel({
        specializationLabel: row.specialization_label,
        quranAgeGroupId: row.quran_age_group_id,
        quranLevelId: row.quran_level_id,
      }),
      studentName: row.student_name,
      guardianName: row.guardian_name,
      phoneNumber: row.phone_number,
      confirmedAt: row.confirmed_at,
    }));
  },

  async getMyConfirmedGroupStudents(groupId: string): Promise<any[]> {
    const { data, error } = await supabase.rpc('tutor_get_my_confirmed_group_students', {
      p_group_id: groupId,
    });
    if (error) {
      return [];
    }
    return (data || []).map((row: any) => ({
      enrollmentId: row.enrollment_id,
      groupId: row.group_id,
      studentName: row.student_name,
      guardianName: row.guardian_name,
      phoneNumber: row.phone_number,
      confirmedAt: row.confirmed_at,
    }));
  },
};
