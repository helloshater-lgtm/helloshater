import { supabase } from '../lib/supabase';
import {
  Tutor,
  TutorPrivateInfo,
  TutorQualification,
  MethodologyPillar,
  TrialStep,
  TutorAvailableSlot,
  SchoolCourseOptionDetail,
  AdminTutorFullDetail,
  AdminTutorSavePayload,
  TutorApplicationRecord,
  AdminPlatformStatistics,
  AdminStatisticsDataHealth,
  AdminStatisticsDataHealthError,
  AdminStatisticsDrilldownRequest,
  AdminStatisticsDrilldownResponse,
} from '../types';
import {
  RawStatisticsDataset,
  computePlatformStatisticsFromDataset,
  computeStatisticsDrilldownFromDataset,
} from '../utils/adminStatisticsClassifier';
import {
  CANONICAL_QURAN_AGE_GROUPS,
  CANONICAL_QURAN_LEVELS,
  normalizeLegacyAgeGroupText,
  resolveSpecializationLabel,
  resolveTutorApplicationStatus,
  validateAndResolveSchoolSpecializations,
  validateAndResolveQuranSpecializations,
} from '../utils/formatters';

export interface AdminTutorListItem {
  id: string;
  name: string;
  honorific: string;
  headline: string;
  avatarUrl: string;
  hourlyRateMin: number;
  hourlyRateMax: number;
  currency: string;
  sessionDurationMinutes: number;
  trialDurationMinutes: number;
  isPublished: boolean;
  rating: number;
  reviewsCount: number;
  offeringsCount: number;
  availableSlotsCount: number;
  createdAt: string;
  updatedAt: string;
}

export const AdminService = {
  /**
   * 1. Get all tutors (both published and unpublished) with search and stats
   */
  async getTutorsList(searchQuery?: string): Promise<AdminTutorListItem[]> {
    let query = supabase
      .from('tutors')
      .select(
        'id, name, honorific, headline, avatar_url, hourly_rate_min, hourly_rate_max, session_duration_minutes, trial_duration_minutes, currency, is_published, rating, reviews_count, created_at, updated_at'
      )
      .order('updated_at', { ascending: false });

    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.trim();
      query = query.or(`name.ilike.%${q}%,id.ilike.%${q}%,headline.ilike.%${q}%`);
    }

    const { data: tutorsData, error: tutorsError } = await query;
    if (tutorsError) {
      throw new Error(`تعذر جلب قائمة المعلمين: ${tutorsError.message}`);
    }

    if (!tutorsData || tutorsData.length === 0) {
      return [];
    }

    const tutorIds = tutorsData.map((t) => t.id);

    // Fetch counts for school offerings, quran offerings, and available slots via secure RPC
    const [schoolOfferingsRes, quranOfferingsRes, slotCountsRpcRes] = await Promise.all([
      supabase.from('tutor_school_offerings').select('tutor_id').in('tutor_id', tutorIds),
      supabase.from('tutor_quran_offerings').select('tutor_id').in('tutor_id', tutorIds),
      supabase.rpc('admin_get_tutors_slot_counts', { p_tutor_ids: tutorIds }),
    ]);

    const offeringCounts: Record<string, number> = {};
    (schoolOfferingsRes.data || []).forEach((row: any) => {
      offeringCounts[row.tutor_id] = (offeringCounts[row.tutor_id] || 0) + 1;
    });
    (quranOfferingsRes.data || []).forEach((row: any) => {
      offeringCounts[row.tutor_id] = (offeringCounts[row.tutor_id] || 0) + 1;
    });

    const slotCounts: Record<string, number> = {};
    if (!slotCountsRpcRes.error && slotCountsRpcRes.data) {
      (slotCountsRpcRes.data as any[]).forEach((row: any) => {
        slotCounts[row.tutor_id] = Number(row.available_slots_count || 0);
      });
    } else {
      // Fallback in case RPC is not yet created
      const slotsRes = await supabase
        .from('tutor_available_slots')
        .select('tutor_id')
        .in('tutor_id', tutorIds)
        .eq('is_available', true);

      (slotsRes.data || []).forEach((row: any) => {
        slotCounts[row.tutor_id] = (slotCounts[row.tutor_id] || 0) + 1;
      });
    }

    return tutorsData.map((row: any) => ({
      id: row.id,
      name: row.name,
      honorific: row.honorific || 'أ.',
      headline: row.headline,
      avatarUrl: row.avatar_url || '',
      hourlyRateMin: row.hourly_rate_min || 0,
      hourlyRateMax: row.hourly_rate_max || 0,
      currency: row.currency || 'ج.م',
      sessionDurationMinutes: row.session_duration_minutes || 50,
      trialDurationMinutes: row.trial_duration_minutes || 20,
      isPublished: Boolean(row.is_published),
      rating: row.rating ? Number(row.rating) : 0,
      reviewsCount: row.reviews_count || 0,
      offeringsCount: offeringCounts[row.id] || 0,
      availableSlotsCount: slotCounts[row.id] || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  },

  /**
   * 2. Load all school course options with detailed human-readable taxonomy names
   */
  async getCourseOptionsWithDetails(): Promise<SchoolCourseOptionDetail[]> {
    const [optionsRes, gradesRes, stagesRes, subjectsRes, curriculaRes] = await Promise.all([
      supabase.from('school_course_options').select('*').eq('is_active', true),
      supabase.from('educational_grades').select('id, stage_id, name'),
      supabase.from('educational_stages').select('id, name'),
      supabase.from('subjects').select('id, name'),
      supabase.from('curriculum_types').select('id, name'),
    ]);

    if (optionsRes.error) throw new Error(`فشل جلب خيارات المواد: ${optionsRes.error.message}`);

    const gradesMap = new Map((gradesRes.data || []).map((g) => [g.id, g]));
    const stagesMap = new Map((stagesRes.data || []).map((s) => [s.id, s.name]));
    const subjectsMap = new Map((subjectsRes.data || []).map((s) => [s.id, s.name]));
    const curriculaMap = new Map((curriculaRes.data || []).map((c) => [c.id, c.name]));

    return (optionsRes.data || []).map((row: any) => {
      const grade = gradesMap.get(row.grade_id);
      const stageName = grade ? stagesMap.get(grade.stage_id) || '' : '';
      return {
        id: row.id,
        gradeId: row.grade_id,
        gradeName: grade?.name || row.grade_id,
        stageId: grade?.stage_id || '',
        stageName,
        subjectId: row.subject_id,
        subjectName: subjectsMap.get(row.subject_id) || row.subject_id,
        curriculumId: row.curriculum_id,
        curriculumName: curriculaMap.get(row.curriculum_id) || row.curriculum_id,
        isActive: Boolean(row.is_active),
      };
    });
  },

  /**
   * 3. Load full tutor data for editing
   * Uses admin_get_tutor_slots RPC to protect notes column from unauthorized direct select
   */
  async getTutorForEdit(tutorId: string): Promise<AdminTutorFullDetail> {
    const { data: tutorRow, error: tutorError } = await supabase
      .from('tutors')
      .select('*')
      .eq('id', tutorId)
      .maybeSingle();

    if (tutorError || !tutorRow) {
      throw new Error(`تعذر العثور على المعلم المطلوب: ${tutorError?.message || 'غير موجود'}`);
    }

    const [
      privateInfoRes,
      qualRes,
      pillarsRes,
      trialRes,
      schoolOfferingsRes,
      quranOfferingsRes,
      slotsRes,
    ] = await Promise.all([
      supabase.from('tutor_private_info').select('*').eq('tutor_id', tutorId).maybeSingle(),
      supabase
        .from('tutor_qualifications')
        .select('*')
        .eq('tutor_id', tutorId)
        .order('display_order', { ascending: true }),
      supabase
        .from('tutor_methodology_pillars')
        .select('*')
        .eq('tutor_id', tutorId)
        .order('display_order', { ascending: true }),
      supabase
        .from('tutor_trial_steps')
        .select('*')
        .eq('tutor_id', tutorId)
        .order('step_number', { ascending: true }),
      supabase
        .from('tutor_school_offerings')
        .select('course_option_id')
        .eq('tutor_id', tutorId),
      supabase
        .from('tutor_quran_offerings')
        .select('age_group_id, level_id')
        .eq('tutor_id', tutorId),
      // Protect notes via verified Admin RPC
      supabase.rpc('admin_get_tutor_slots', { p_tutor_id: tutorId }),
    ]);

    const tutor: Tutor = {
      id: tutorRow.id,
      name: tutorRow.name,
      honorific: tutorRow.honorific || 'أ.',
      headline: tutorRow.headline,
      avatarUrl: tutorRow.avatar_url || '',
      verifiedCredentials: Boolean(tutorRow.verified_credentials),
      yearsOfExperience: tutorRow.years_of_experience || 0,
      experienceBadgeText: tutorRow.experience_badge_text || '',
      curriculumTags: tutorRow.curriculum_tags || [],
      hourlyRateMin: tutorRow.hourly_rate_min || 0,
      hourlyRateMax: tutorRow.hourly_rate_max || 0,
      currency: tutorRow.currency || 'ج.م',
      sessionDurationMinutes: tutorRow.session_duration_minutes || 50,
      trialDurationMinutes: tutorRow.trial_duration_minutes || 20,
      rating: tutorRow.rating ? Number(tutorRow.rating) : 0,
      reviewsCount: tutorRow.reviews_count || 0,
      totalStudentsTaught: tutorRow.total_students_taught || 0,
      isPublished: Boolean(tutorRow.is_published),
      helpChildQuote: tutorRow.help_child_quote || '',
      helpChildSummary: tutorRow.help_child_summary || '',
      targetStudentCases: tutorRow.target_student_cases || [],
      methodologyPillars: (pillarsRes.data || []).map((p: any) => ({
        title: p.title,
        description: p.description,
        iconName: p.icon_name || 'smile',
      })),
      whatHappensInTrial: (trialRes.data || []).map((t: any) => ({
        stepNumber: t.step_number,
        title: t.title,
        description: t.description,
      })),
      qualifications: (qualRes.data || []).map((q: any) => ({
        id: q.id,
        title: q.title,
        institution: q.institution,
        verified: Boolean(q.verified),
        notes: q.notes || '',
      })),
      offerings: [],
      subjectsTaughtSummary: [],
    };

    let privateInfo: TutorPrivateInfo | null = null;
    if (privateInfoRes.data) {
      privateInfo = {
        tutorId: privateInfoRes.data.tutor_id,
        fullLegalName: privateInfoRes.data.full_legal_name || '',
        nationalIdNumber: privateInfoRes.data.national_id_number || '',
        countryCode: privateInfoRes.data.country_code || '+20',
        phoneNumber: privateInfoRes.data.phone_number || '',
        whatsappNumber: privateInfoRes.data.whatsapp_number || '',
        email: privateInfoRes.data.email || '',
        internalNotes: privateInfoRes.data.internal_notes || '',
        createdAt: privateInfoRes.data.created_at,
        updatedAt: privateInfoRes.data.updated_at,
      };
    }

    const schoolOfferingOptionIds = (schoolOfferingsRes.data || []).map(
      (o: any) => o.course_option_id
    );

    const quranOfferings = (quranOfferingsRes.data || []).map((q: any) => ({
      ageGroupId: q.age_group_id,
      levelId: q.level_id,
    }));

    // Parse slots returned from RPC
    const slotsList: TutorAvailableSlot[] = (slotsRes.data || []).map((s: any) => ({
      id: s.id,
      tutorId: s.tutor_id,
      slotDate: s.slot_date,
      startTime: s.start_time,
      endTime: s.end_time,
      timezone: s.timezone || 'Africa/Cairo',
      isAvailable: Boolean(s.is_available),
      isBooked: Boolean(s.is_booked),
      bookedAt: s.booked_at || null,
      notes: s.notes || null,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    }));

    return {
      tutor,
      privateInfo,
      qualifications: tutor.qualifications,
      methodologyPillars: tutor.methodologyPillars,
      trialSteps: tutor.whatHappensInTrial,
      schoolOfferingOptionIds,
      quranOfferings,
      slots: slotsList,
    };
  },

  /**
   * 4. Atomic Tutor Save (Create or Update in a single RPC transaction)
   * Guaranteed all-or-nothing rollback on any error
   */
  async saveTutor(payload: AdminTutorSavePayload, isNew: boolean): Promise<string> {
    const tutorId = payload.id.trim().toLowerCase();
    if (!tutorId || !/^[a-z0-9-]+$/.test(tutorId)) {
      throw new Error(
        'معرف المعلم (Slug) غير صالح: يجب أن يتكون من أحرف إنجليزية صغيرة وأرقام وشرطات فقط بدون مسافات (مثال: mohamed-ali).'
      );
    }

    if (!payload.name.trim()) {
      throw new Error('اسم المعلم مطلوب ولا يمكن تركه فارغاً.');
    }

    if (!payload.headline.trim()) {
      throw new Error('العنوان التعريفي للمعلم مطلوب.');
    }

    if (payload.hourlyRateMin < 0 || payload.hourlyRateMax < payload.hourlyRateMin) {
      throw new Error(
        'قيم تسعير الحصة غير صحيحة (يجب أن يكون الحد الأدنى موجباً والحد الأقصى أكبر منه أو مساوياً له).'
      );
    }

    // Call atomic RPC inside a single database transaction
    const { data: rpcResult, error: rpcError } = await supabase.rpc('admin_save_tutor', {
      p_payload: {
        ...payload,
        id: tutorId,
        isNew,
      },
    });

    if (rpcError) {
      throw new Error(`فشل حفظ بيانات المعلم: ${rpcError.message}`);
    }

    return tutorId;
  },

  /**
   * 5. Set Publish Status with strict server-side database validation
   */
  async toggleTutorPublish(tutorId: string, shouldPublish: boolean): Promise<boolean> {
    const { data, error } = await supabase.rpc('admin_set_tutor_publish_status', {
      p_tutor_id: tutorId,
      p_publish: shouldPublish,
    });

    if (error) {
      throw new Error(`تعذر تحديث حالة النشر: ${error.message}`);
    }

    return Boolean(data);
  },

  /**
   * 6. Upload Avatar to Supabase Storage Bucket ('tutor-avatars')
   * Returns public URL and file path for safe rollback handling
   */
  async uploadAvatar(
    tutorId: string,
    file: File
  ): Promise<{ publicUrl: string; storagePath: string }> {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      throw new Error('يرجى اختيار صورة بصيغة صالحة (JPEG أو PNG أو WebP).');
    }

    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
      throw new Error('حجم الصورة يجب ألا يتجاوز 2 ميجابايت.');
    }

    const extension = file.type.split('/')[1] || 'jpg';
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const storagePath = `avatars/${tutorId}-${uniqueSuffix}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from('tutor-avatars')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`فشل رفع الصورة الشخصية: ${uploadError.message}`);
    }

    const publicUrl = supabase.storage.from('tutor-avatars').getPublicUrl(storagePath).data.publicUrl;

    return { publicUrl, storagePath };
  },

  /**
   * Safe avatar cleanup after a save error:
   * First queries the database to verify if tutor.avatar_url already references this avatar.
   * If the transaction committed successfully before connection loss, the avatar MUST NOT be deleted.
   * If DB verification fails (e.g. offline), cleanup is deferred to avoid data loss.
   */
  async safeCleanupPendingAvatar(
    tutorId: string,
    storagePath: string,
    pendingAvatarUrl: string
  ): Promise<boolean> {
    if (!storagePath || !tutorId) return false;

    try {
      const { data, error } = await supabase
        .from('tutors')
        .select('avatar_url')
        .eq('id', tutorId)
        .maybeSingle();

      if (error) {
        console.warn('تعذر التحقق من حالة الصورة في قاعدة البيانات؛ تم تأجيل الحذف تفادياً لفقدان الملف:', error);
        return false;
      }

      // Check if DB is already pointing to this image
      if (data?.avatar_url && (data.avatar_url.includes(storagePath) || data.avatar_url === pendingAvatarUrl)) {
        console.info('الصورة مستخدمة بالفعل كصورة حالية للمعلم في قاعدة البيانات، لن يتم حذفها.');
        return false;
      }

      // Safe to delete only if tutor in DB is definitely not referencing it
      const { error: deleteError } = await supabase.storage.from('tutor-avatars').remove([storagePath]);
      if (deleteError) {
        console.warn('فشل حذف الصورة المؤقتة:', deleteError);
        return false;
      }

      return true;
    } catch (e) {
      console.warn('خطأ أثناء فحص تنظيف الصورة:', e);
      return false;
    }
  },

  /**
   * Cleanup an unreferenced uploaded avatar
   */
  async deleteUnusedAvatar(storagePath: string): Promise<void> {
    try {
      if (storagePath) {
        await supabase.storage.from('tutor-avatars').remove([storagePath]);
      }
    } catch (e) {
      console.warn('Failed to cleanup unused avatar:', e);
    }
  },

  /**
   * 7. Slot Management: Add new trial slot via Africa/Cairo verified RPC
   * Strictly enforces 20-minute trial slot duration
   */
  async addSlot(
    tutorId: string,
    slotDate: string,
    startTime: string,
    endTime: string,
    timezone: string = 'Africa/Cairo',
    notes?: string
  ): Promise<string> {
    if (!slotDate || !startTime || !endTime) {
      throw new Error('يرجى تحديد التاريخ ووقت البداية ووقت النهاية للموعد.');
    }

    // Verify 20 minutes duration exactly
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const durationMinutes = endH * 60 + endM - (startH * 60 + startM);
    if (durationMinutes !== 20) {
      throw new Error('مدة الحصة التجريبية المعتمدة هي 20 دقيقة بالضبط.');
    }

    const { data: newId, error } = await supabase.rpc('admin_add_slot', {
      p_tutor_id: tutorId,
      p_slot_date: slotDate,
      p_start_time: startTime,
      p_end_time: endTime,
      p_timezone: timezone || 'Africa/Cairo',
      p_notes: notes || null,
    });

    if (error) {
      throw new Error(`تعذر حفظ الموعد: ${error.message}`);
    }

    return newId;
  },

  /**
   * 8. Confirm slot booking formally
   * Sets is_booked = true, is_available = false, booked_at = NOW(), and attaches student notes
   */
  async confirmSlotBooking(slotId: string, notes?: string): Promise<void> {
    const { error } = await supabase.rpc('admin_confirm_slot_booking', {
      p_slot_id: slotId,
      p_notes: notes || null,
    });

    if (error) {
      throw new Error(`فشل تأكيد الحجز: ${error.message}`);
    }
  },

  /**
   * 9. Close or reopen slot (administrative toggle for non-booked slots)
   */
  async toggleSlotAvailability(
    slotId: string,
    isAvailable: boolean,
    notes?: string
  ): Promise<void> {
    const { error } = await supabase.rpc('admin_toggle_slot_availability', {
      p_slot_id: slotId,
      p_is_available: isAvailable,
      p_notes: notes || null,
    });

    if (error) {
      throw new Error(`فشل تحديث حالة الموعد: ${error.message}`);
    }
  },

  /**
   * 9.1 Administrative suspension or reopening of a private slot
   */
  async togglePrivateSlotAvailability(
    slotId: string,
    isAvailable: boolean,
    notes?: string
  ): Promise<void> {
    const { error } = await supabase.rpc('admin_toggle_private_slot_availability', {
      p_slot_id: slotId,
      p_is_available: isAvailable,
      p_notes: notes || null,
    });

    if (error) {
      throw new Error(`فشل تحديث إتاحة الموعد الخاص: ${error.message}`);
    }
  },

  /**
   * 10. Delete slot (permanently blocked if slot is confirmed booked)
   */
  async deleteSlot(slotId: string): Promise<void> {
    const { error } = await supabase.rpc('admin_delete_slot', {
      p_slot_id: slotId,
    });

    if (error) {
      throw new Error(`تعذر حذف الموعد: ${error.message}`);
    }
  },

  /**
   * 11. Applications: Get all tutor applications with filters and search
   */
  async getApplications(statusFilter?: string, searchQuery?: string): Promise<TutorApplicationRecord[]> {
    let query = supabase
      .from('tutor_applications')
      .select('*')
      .order('created_at', { ascending: false });

    if (statusFilter && statusFilter !== 'all') {
      if (statusFilter === 'submitted') {
        query = query.in('status', ['submitted', 'pending_review', 'interview_scheduled']);
      } else {
        query = query.eq('status', statusFilter);
      }
    }

    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.trim();
      query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,reference_code.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`فشل جلب طلبات الانضمام: ${error.message}`);
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      referenceCode: row.reference_code || '',
      fullName: row.full_name || '',
      countryCode: row.country_code || '+20',
      phone: row.phone || '',
      whatsappNumber: row.whatsapp_number || row.phone || '',
      email: row.email || '',
      track: row.track || 'school',
      schoolSpecializations: row.school_specializations || [],
      schoolCourseOptionIds: row.school_course_option_ids || [],
      quranAgeGroups: row.quran_age_groups || [],
      quranLevels: row.quran_levels || [],
      quranOfferings: row.quran_offerings || [],
      quranNotes: row.quran_notes || '',
      subjects: row.subjects || [],
      stages: row.stages || [],
      curricula: row.curricula || [],
      academicDegree: row.academic_degree || '',
      institution: row.institution || '',
      experienceYears: row.experience_years || '',
      hasOnlineExperience: row.has_online_experience || '',
      onlineExperienceDetails: row.online_experience_details || '',
      bioAndMethodology: row.bio_and_methodology || '',
      portfolioUrl: row.portfolio_url || '',
      avatarPath: row.avatar_path || null,
      avatarUrl: null,
      suggestedHourlyRate: String(row.suggested_hourly_rate || 120),
      suggestedHourlyRateNum: row.suggested_hourly_rate || 120,
      currency: row.currency || 'ج.م',
      sessionDurationMinutes: row.session_duration_minutes || 50,
      availableDays: row.available_days || [],
      preferredTimes: row.preferred_times || [],
      timezone: row.timezone || 'Africa/Cairo',
      interviewAvailability: '',
      termsAccepted: Boolean(row.terms_accepted),
      termsPolicyVersion: row.policy_version || '',
      policyVersion: row.policy_version || null,
      policyAcceptedAt: row.policy_accepted_at || undefined,
      status: row.status,
      adminNotes: row.admin_notes || null,
      reviewedAt: row.reviewed_at || null,
      reviewedBy: row.reviewed_by || null,
      applicantTutorId: row.applicant_tutor_id || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  },

  /**
   * 12. Applications: Get single application by ID
   */
  async getApplicationById(id: string): Promise<TutorApplicationRecord | null> {
    const { data, error } = await supabase
      .from('tutor_applications')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return {
      id: data.id,
      userId: data.user_id,
      referenceCode: data.reference_code || '',
      fullName: data.full_name || '',
      countryCode: data.country_code || '+20',
      phone: data.phone || '',
      whatsappNumber: data.whatsapp_number || data.phone || '',
      email: data.email || '',
      track: data.track || 'school',
      schoolSpecializations: data.school_specializations || [],
      schoolCourseOptionIds: data.school_course_option_ids || [],
      quranAgeGroups: data.quran_age_groups || [],
      quranLevels: data.quran_levels || [],
      quranOfferings: data.quran_offerings || [],
      quranNotes: data.quran_notes || '',
      subjects: data.subjects || [],
      stages: data.stages || [],
      curricula: data.curricula || [],
      academicDegree: data.academic_degree || '',
      institution: data.institution || '',
      experienceYears: data.experience_years || '',
      hasOnlineExperience: data.has_online_experience || '',
      onlineExperienceDetails: data.online_experience_details || '',
      bioAndMethodology: data.bio_and_methodology || '',
      portfolioUrl: data.portfolio_url || '',
      avatarPath: data.avatar_path || null,
      avatarUrl: null, // Populated via signed url or helper below
      suggestedHourlyRate: String(data.suggested_hourly_rate || 120),
      suggestedHourlyRateNum: data.suggested_hourly_rate || 120,
      currency: data.currency || 'ج.م',
      sessionDurationMinutes: data.session_duration_minutes || 50,
      availableDays: data.available_days || [],
      preferredTimes: data.preferred_times || [],
      timezone: data.timezone || 'Africa/Cairo',
      interviewAvailability: '',
      termsAccepted: Boolean(data.terms_accepted),
      termsPolicyVersion: data.policy_version || '',
      policyVersion: data.policy_version || null,
      policyAcceptedAt: data.policy_accepted_at || undefined,
      status: data.status,
      adminNotes: data.admin_notes || null,
      reviewedAt: data.reviewed_at || null,
      reviewedBy: data.reviewed_by || null,
      applicantTutorId: data.applicant_tutor_id || null,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  },

  /**
   * 12.1 Helper: Strictly validate and resolve an application's school or quran specializations
   * against live reference tables without automatic suffix stripping ('math_en' is NEVER merged into 'math')
   * and without silently dropping unmatched specialization items.
   */
  async validateApplicationSpecializations(
    app: Pick<
      TutorApplicationRecord,
      | 'id'
      | 'track'
      | 'schoolSpecializations'
      | 'schoolCourseOptionIds'
      | 'quranAgeGroups'
      | 'quranLevels'
      | 'quranOfferings'
    >
  ): Promise<{
    isValid: boolean;
    optionIds: string[];
    normalizedSpecs: any[];
    quranOfferings: Array<{ ageGroupId: string; levelId: string }>;
    unmatchedItems: string[];
  }> {
    if (app.track === 'school') {
      const [subjectsRes, stagesRes, gradesRes, curriculaRes, optionsRes] = await Promise.all([
        supabase.from('subjects').select('id, name, english_name, is_active'),
        supabase.from('educational_stages').select('id, name, is_active'),
        supabase.from('educational_grades').select('id, stage_id, name, is_active'),
        supabase.from('curriculum_types').select('id, name, is_active'),
        supabase
          .from('school_course_options')
          .select('id, grade_id, subject_id, curriculum_id, is_active'),
      ]);

      const result = validateAndResolveSchoolSpecializations({
        specializations: app.schoolSpecializations,
        directCourseOptionIds: app.schoolCourseOptionIds,
        referenceData: {
          subjects: subjectsRes.data || [],
          stages: stagesRes.data || [],
          grades: gradesRes.data || [],
          curricula: curriculaRes.data || [],
          courseOptions: optionsRes.data || [],
        },
      });

      return {
        isValid: result.isValid,
        optionIds: result.matchedOptionIds,
        normalizedSpecs: result.normalizedSpecializations,
        quranOfferings: [],
        unmatchedItems: result.unmatchedItems,
      };
    } else {
      const [agesRes, levelsRes] = await Promise.all([
        supabase.from('quran_age_groups').select('id, name, is_active'),
        supabase.from('quran_levels').select('id, name, is_active'),
      ]);

      const result = validateAndResolveQuranSpecializations({
        ageGroups: app.quranAgeGroups,
        levels: app.quranLevels,
        quranOfferings: app.quranOfferings,
        referenceData: {
          ageGroups: agesRes.data || [],
          levels: levelsRes.data || [],
        },
      });

      return {
        isValid: result.isValid,
        optionIds: [],
        normalizedSpecs: [],
        quranOfferings: result.quranOfferings,
        unmatchedItems: result.unmatchedItems,
      };
    }
  },

  /**
   * 12.1b Resolve canonical school_course_option_ids from application's schoolSpecializations
   * Throws or reports unmatched items rather than silently dropping them.
   */
  async resolveApplicationSchoolOptionIds(
    app: Pick<
      TutorApplicationRecord,
      'id' | 'track' | 'schoolSpecializations' | 'schoolCourseOptionIds'
    >
  ): Promise<{ optionIds: string[]; normalizedSpecs: any[]; unmatchedItems: string[]; isValid: boolean }> {
    const res = await this.validateApplicationSpecializations({
      ...app,
      quranAgeGroups: [],
      quranLevels: [],
      quranOfferings: [],
    });
    return {
      optionIds: res.optionIds,
      normalizedSpecs: res.normalizedSpecs,
      unmatchedItems: res.unmatchedItems,
      isValid: res.isValid,
    };
  },

  /**
   * 12.2 Helper: Sync an approved application's school and quran offerings to the linked tutor record
   * - Only allowed for approved applications (never touches draft applications).
   * - Rejects sync if any specialization item is unmatched or invalid.
   * - ONLY adds missing relationships (never re-enables disabled offerings and never modifies
   *   tutor prices, durations, ratings, verification, or publication state).
   */
  async syncApplicationOfferingsToTutor(
    applicationId: string,
    tutorId: string
  ): Promise<{ schoolOfferingsCount: number; quranOfferingsCount: number }> {
    const app = await this.getApplicationById(applicationId);
    if (!app) {
      throw new Error('تعذر العثور على طلب الانضمام لمزامنة التخصصات.');
    }

    if (app.status !== 'approved') {
      throw new Error('لا يمكن مزامنة العروض إلا لطلب معتمد (حالة الطلب الحالية لا تسمح بالمزامنة).');
    }

    const validation = await this.validateApplicationSpecializations(app);
    if (!validation.isValid) {
      throw new Error(
        `تعذر مزامنة تخصصات المعلم لوجود عناصر غير مطابقة تحتاج إلى تصحيح: ${validation.unmatchedItems.join(' | ')}`
      );
    }

    // Try dedicated server RPC first if deployed
    const { data: rpcSyncData, error: rpcSyncError } = await supabase.rpc(
      'admin_sync_approved_application_offerings',
      { p_application_id: applicationId }
    );

    if (!rpcSyncError && rpcSyncData?.success) {
      return {
        schoolOfferingsCount: Number(rpcSyncData.schoolOfferingsCount || 0),
        quranOfferingsCount: Number(rpcSyncData.quranOfferingsCount || 0),
      };
    }

    if (app.track === 'school') {
      const { optionIds, normalizedSpecs } = validation;

      if (optionIds.length > 0) {
        if (!app.schoolCourseOptionIds || app.schoolCourseOptionIds.length === 0) {
          await supabase
            .from('tutor_applications')
            .update({
              school_course_option_ids: optionIds,
              school_specializations: normalizedSpecs,
            })
            .eq('id', applicationId);
        }

        // Fetch existing offerings for this tutor (including any disabled ones if an is_active column exists)
        // so we ONLY insert genuinely missing course_option_ids and NEVER re-enable disabled offerings.
        const { data: existingOfferings } = await supabase
          .from('tutor_school_offerings')
          .select('course_option_id')
          .eq('tutor_id', tutorId);

        const existingOptionIdSet = new Set(
          (existingOfferings || []).map((r: any) => String(r.course_option_id))
        );

        const missingRowsToInsert = optionIds
          .filter((coId) => !existingOptionIdSet.has(coId))
          .map((courseOptionId) => ({
            tutor_id: tutorId,
            course_option_id: courseOptionId,
          }));

        if (missingRowsToInsert.length > 0) {
          const { error: upsertErr } = await supabase
            .from('tutor_school_offerings')
            .upsert(missingRowsToInsert, {
              onConflict: 'tutor_id,course_option_id',
              ignoreDuplicates: true,
            });

          if (upsertErr) {
            throw new Error(`تعذر مزامنة التخصصات المدرسية للمعلم: ${upsertErr.message}`);
          }
        }
      }
    } else if (app.track === 'quran') {
      const quranPairs = validation.quranOfferings;

      if (quranPairs.length > 0) {
        // Fetch existing quran offerings so we ONLY insert missing pairs and never re-enable disabled ones
        const { data: existingQuranOfferings } = await supabase
          .from('tutor_quran_offerings')
          .select('age_group_id, level_id')
          .eq('tutor_id', tutorId);

        const existingPairSet = new Set(
          (existingQuranOfferings || []).map(
            (r: any) => `${String(r.age_group_id)}|${String(r.level_id)}`
          )
        );

        const missingQuranRows = quranPairs
          .filter((pair) => !existingPairSet.has(`${pair.ageGroupId}|${pair.levelId}`))
          .map((pair) => ({
            tutor_id: tutorId,
            age_group_id: pair.ageGroupId,
            level_id: pair.levelId,
          }));

        if (missingQuranRows.length > 0) {
          const { error: upsertErr } = await supabase
            .from('tutor_quran_offerings')
            .upsert(missingQuranRows, {
              onConflict: 'tutor_id,age_group_id,level_id',
              ignoreDuplicates: true,
            });

          if (upsertErr) {
            throw new Error(`تعذر مزامنة برامج القرآن للمعلم: ${upsertErr.message}`);
          }
        }
      }
    }

    return this.getTutorOfferingsSummary(tutorId);
  },

  /**
   * 12.3 Helper: Get count of synced offerings for a tutor
   */
  async getTutorOfferingsSummary(
    tutorId: string
  ): Promise<{ schoolOfferingsCount: number; quranOfferingsCount: number }> {
    const [schoolRes, quranRes] = await Promise.all([
      supabase
        .from('tutor_school_offerings')
        .select('id', { count: 'exact', head: true })
        .eq('tutor_id', tutorId),
      supabase
        .from('tutor_quran_offerings')
        .select('id', { count: 'exact', head: true })
        .eq('tutor_id', tutorId),
    ]);

    return {
      schoolOfferingsCount: schoolRes.count || 0,
      quranOfferingsCount: quranRes.count || 0,
    };
  },

  /**
   * 13. Applications: Review action (Needs Info or Reject)
   * Uses the administrative RPC `admin_review_tutor_application` exclusively (no direct table UPDATE fallback).
   */
  async reviewApplication(
    applicationId: string,
    status: 'needs_info' | 'rejected',
    adminNotes: string
  ): Promise<void> {
    if (status !== 'needs_info' && status !== 'rejected') {
      throw new Error('الحالة المحددة غير صالحة لهذه العملية.');
    }

    if (!adminNotes || !adminNotes.trim()) {
      throw new Error('يرجى تدوين الملاحظات والتوجيهات للمعلم.');
    }

    const app = await this.getApplicationById(applicationId);
    if (!app) {
      throw new Error('طلب الانضمام المحدد غير موجود.');
    }

    const statusInfo = resolveTutorApplicationStatus(app.status);
    if (!statusInfo.isReviewableByAdmin) {
      if (statusInfo.canonicalKey === 'draft') {
        throw new Error('لا يمكن مراجعة هذا الطلب أو رفضه لأنه ما زال «مسودة» ولم يقم المعلم بإرساله للمراجعة بعد.');
      }
      throw new Error(`حالة الطلب الحالية (${statusInfo.detailBadgeLabel}) لا تسمح بتنفيذ هذا الإجراء.`);
    }

    const { data: rpcData, error: rpcError } = await supabase.rpc('admin_review_tutor_application', {
      p_application_id: applicationId,
      p_status: status,
      p_admin_notes: adminNotes.trim(),
    });

    if (rpcError) {
      throw new Error(`تعذر تحديث حالة الطلب: ${rpcError.message}`);
    }

    if (!rpcData || rpcData.success !== true || rpcData.status !== status) {
      throw new Error('تعذر تأكيد حفظ قرار المراجعة في قاعدة البيانات.');
    }
  },

  /**
   * 14. Applications: Approve Application and Create Unpublished Tutor Profile
   * Always creates tutor with is_published = false. Publishing is a separate explicit decision.
   * Strictly validates all specializations before approval without silent dropping.
   */
  async approveApplication(
    applicationId: string,
    tutorSlug: string,
    adminNotes?: string
  ): Promise<{ tutorId: string; syncedSchoolOfferingsCount?: number }> {
    const cleanSlug = tutorSlug.trim().toLowerCase();
    if (!cleanSlug || !/^[a-z0-9-]+$/.test(cleanSlug)) {
      throw new Error('معرف المعلم (Slug) غير صالح: يجب أن يتكون من أحرف إنجليزية وأرقام وشرطات فقط بدون مسافات (مثال: mohamed-ali).');
    }

    const app = await this.getApplicationById(applicationId);
    if (!app) {
      throw new Error('تعذر العثور على بيانات الطلب للاعتماد.');
    }

    const statusInfo = resolveTutorApplicationStatus(app.status);
    if (!statusInfo.isReviewableByAdmin) {
      if (statusInfo.canonicalKey === 'draft') {
        throw new Error('لا يمكن قبول واعتماد هذا الطلب لأنه ما زال «مسودة» ولم يقم المعلم بإرساله للمراجعة بعد.');
      }
      throw new Error(`حالة الطلب الحالية (${statusInfo.detailBadgeLabel}) لا تسمح بالقبول.`);
    }

    // Strictly validate specializations against reference tables (never merge math_en with math, never drop unmatched items)
    const validation = await this.validateApplicationSpecializations(app);
    if (!validation.isValid) {
      throw new Error(
        `لا يمكن اعتماد الطلب لوجود تخصصات غير مطابقة أو تحتاج إلى تصحيح: ${validation.unmatchedItems.join(' | ')}`
      );
    }

    let resolvedOptionIds = validation.optionIds;
    if (
      app.track === 'school' &&
      resolvedOptionIds.length > 0 &&
      (!app.schoolCourseOptionIds || app.schoolCourseOptionIds.length === 0)
    ) {
      await supabase
        .from('tutor_applications')
        .update({
          school_course_option_ids: resolvedOptionIds,
          school_specializations: validation.normalizedSpecs,
        })
        .eq('id', applicationId);
    }

    // Call atomic approval RPC
    const { data: rpcData, error: rpcError } = await supabase.rpc('admin_approve_tutor_application', {
      p_application_id: applicationId,
      p_tutor_slug: cleanSlug,
      p_admin_notes: adminNotes?.trim() || null,
    });

    if (!rpcError && rpcData?.success) {
      const finalTutorId = rpcData.tutorId || cleanSlug;
      const syncSummary = await this.syncApplicationOfferingsToTutor(applicationId, finalTutorId).catch(
        () => ({ schoolOfferingsCount: resolvedOptionIds.length, quranOfferingsCount: 0 })
      );
      return {
        tutorId: finalTutorId,
        syncedSchoolOfferingsCount: syncSummary.schoolOfferingsCount,
      };
    }

    if (rpcError) {
      throw new Error(`تعذر اعتماد الطلب: ${rpcError.message}`);
    }

    throw new Error('تعذر تأكيد اعتماد الطلب من الخادم.');
  },

  /**
   * 15. Get Signed URL for application avatar in admin view
   */
  async getApplicationAvatarSignedUrl(storagePath: string): Promise<string | null> {
    if (!storagePath) return null;
    try {
      const { data, error } = await supabase.storage
        .from('tutor-application-avatars')
        .createSignedUrl(storagePath, 3600);

      if (error || !data?.signedUrl) {
        console.warn('Could not generate signed URL for admin application view:', error);
        return null;
      }

      return data.signedUrl;
    } catch (err) {
      console.warn('Error creating admin signed url for application avatar:', err);
      return null;
    }
  },

  /**
   * 16. Copy Application Avatar to Public Tutor Avatar bucket ('tutor-avatars')
   * Strictly invoked upon explicit publishing decision.
   * 1. Calls RPC admin_get_approved_application_avatar_transfer_info to validate:
   *    - Caller is admin
   *    - Application status is approved
   *    - applicant_tutor_id IS NOT NULL and IS NOT DISTINCT FROM p_tutor_id
   *    - avatar_path exists and tutor row is locked
   * 2. Uses Storage API to download from private bucket and upload to public bucket.
   * 3. Updates tutor.avatar_url and verifies update with select('id, avatar_url, is_published').single().
   * 4. Optionally completes publishing if andPublish is true.
   * 5. If transfer, DB update, or publishing fails, performs safe cleanup of the newly uploaded
   *    image only after verifying it is not referenced in DB (protecting against connection loss),
   *    and propagates the error to ensure no false success is displayed.
   */
  async copyApplicationAvatarToTutor(
    applicationId: string,
    tutorId: string,
    andPublish?: boolean
  ): Promise<string> {
    // 1. Call server-side RPC to strictly validate and get transfer specifications
    const { data: info, error: rpcError } = await supabase.rpc(
      'admin_get_approved_application_avatar_transfer_info',
      {
        p_application_id: applicationId,
        p_tutor_id: tutorId,
      }
    );

    if (rpcError || !info) {
      throw new Error(
        `تعذر اعتماد بيانات نقل الصورة: ${rpcError?.message || 'بيانات النقل غير صالحة'}`
      );
    }

    const sourceBucket: string = info.sourceBucket || 'tutor-application-avatars';
    const sourcePath: string = info.sourcePath;
    const targetBucket: string = info.targetBucket || 'tutor-avatars';
    const targetPath: string = info.targetPath;

    if (!sourcePath || !targetPath) {
      throw new Error('مسارات الصورة غير مكتملة في استجابة الخادم.');
    }

    // 2. Download from private storage bucket using Storage API
    const { data: blob, error: downloadError } = await supabase.storage
      .from(sourceBucket)
      .download(sourcePath);

    if (downloadError || !blob) {
      throw new Error(
        `تعذر تنزيل صورة الطلب من الدلو الخاص: ${downloadError?.message || 'الملف غير موجود'}`
      );
    }

    // 3. Upload to public tutor-avatars bucket using Storage API
    let uploadSucceeded = false;
    const { error: uploadError } = await supabase.storage
      .from(targetBucket)
      .upload(targetPath, blob, {
        cacheControl: '3600',
        upsert: true,
        contentType: blob.type || 'image/jpeg',
      });

    if (uploadError) {
      throw new Error(`فشل نقل الصورة إلى الدلو العام للمعلمين: ${uploadError.message}`);
    }
    uploadSucceeded = true;

    // 4. Get public URL
    const { data: publicUrlData } = supabase.storage
      .from(targetBucket)
      .getPublicUrl(targetPath);

    const publicUrl = publicUrlData.publicUrl;

    try {
      // 5. Update tutor record in public.tutors and strictly verify with select().single()
      const { data: updatedTutor, error: updateError } = await supabase
        .from('tutors')
        .update({
          avatar_url: publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tutorId)
        .select('id, avatar_url, is_published')
        .single();

      if (updateError || !updatedTutor) {
        throw new Error(
          `تعذر حفظ رابط الصورة في ملف المعلم أو التأكد من تحديثه: ${
            updateError?.message || 'لم يتم العثور على سجل المعلم المقصود'
          }`
        );
      }

      // 6. If explicit publish is requested alongside avatar transfer
      if (andPublish) {
        const published = await this.toggleTutorPublish(tutorId, true);
        if (!published) {
          throw new Error('تعذر إتمام عملية النشر بعد حفظ الصورة.');
        }
      }

      return publicUrl;
    } catch (err: any) {
      // Safe cleanup: If upload succeeded but DB update or publishing failed,
      // first verify that DB does not reference this image before deleting (protecting against connection loss)
      if (uploadSucceeded) {
        try {
          await this.safeCleanupPendingAvatar(tutorId, targetPath, publicUrl);
        } catch (cleanupErr) {
          console.warn('تحذير أثناء التنظيف الآمن للصورة:', cleanupErr);
        }
      }
      throw err;
    }
  },

  /**
   * Quick check for tutor publication and avatar status
   */
  async getTutorPublicationStatus(
    tutorId: string
  ): Promise<{ isPublished: boolean; avatarUrl: string | null } | null> {
    const { data, error } = await supabase
      .from('tutors')
      .select('id, is_published, avatar_url')
      .eq('id', tutorId)
      .maybeSingle();

    if (error || !data) return null;
    return {
      isPublished: Boolean(data.is_published),
      avatarUrl: data.avatar_url || null,
    };
  },

  /**
   * 17. Explicit publish of tutor with application avatar
   * Transfers avatar to public bucket, updates tutor record, and executes publication in a single flow
   */
  async publishTutorWithApplicationAvatar(
    applicationId: string,
    tutorId: string
  ): Promise<string> {
    return this.copyApplicationAvatarToTutor(applicationId, tutorId, true);
  },

  /**
   * 18. Review tutor profile draft (approve, reject, or request revision)
   * If approving a draft that has a pending avatar in tutor-avatars-pending:
   * 1. Calls RPC admin_get_draft_avatar_transfer_info
   * 2. Copies avatar to public tutor-avatars bucket
   * 3. Calls admin_review_tutor_profile_draft with the new permanent public URL
   */
  async reviewProfileDraft(
    draftId: string,
    action: 'approve' | 'reject' | 'needs_revision',
    adminNotes?: string
  ): Promise<void> {
    let approvedPublicAvatarUrl: string | null = null;

    if (action === 'approve') {
      try {
        const { data: transferInfo, error: infoError } = await supabase.rpc(
          'admin_get_draft_avatar_transfer_info',
          { p_draft_id: draftId }
        );

        if (!infoError && transferInfo?.sourcePath && transferInfo?.targetPath) {
          // Download from private pending bucket
          const { data: blob, error: dlErr } = await supabase.storage
            .from(transferInfo.sourceBucket || 'tutor-avatars-pending')
            .download(transferInfo.sourcePath);

          if (!dlErr && blob) {
            // Upload to public tutor-avatars bucket
            const { error: upErr } = await supabase.storage
              .from(transferInfo.targetBucket || 'tutor-avatars')
              .upload(transferInfo.targetPath, blob, {
                cacheControl: '3600',
                upsert: true,
                contentType: blob.type || 'image/jpeg',
              });

            if (!upErr) {
              const { data: pubData } = supabase.storage
                .from(transferInfo.targetBucket || 'tutor-avatars')
                .getPublicUrl(transferInfo.targetPath);

              approvedPublicAvatarUrl = pubData?.publicUrl || null;
            }
          }
        }
      } catch (avatarErr) {
        console.warn('No pending avatar to transfer or error during draft avatar copy:', avatarErr);
      }
    }

    const { error } = await supabase.rpc('admin_review_tutor_profile_draft', {
      p_draft_id: draftId,
      p_action: action,
      p_admin_notes: adminNotes?.trim() || null,
      p_approved_avatar_url: approvedPublicAvatarUrl,
    });

    if (error) {
      throw new Error(`فشل تنفيذ قرار مراجعة مسودة المعلم: ${error.message}`);
    }
  },

  /**
   * 19. Admin review group class (approve, reject, needs_revision)
   */
  async reviewGroup(
    groupId: string,
    action: 'approve' | 'reject' | 'needs_revision',
    adminNotes?: string
  ): Promise<void> {
    const { error } = await supabase.rpc('admin_review_group', {
      p_group_id: groupId,
      p_action: action,
      p_admin_notes: adminNotes?.trim() || null,
    });

    if (error) {
      throw new Error(`فشل مراجعة المجموعة: ${error.message}`);
    }
  },

  /**
   * 19.1 Admin suspend or resume group publication
   */
  async suspendGroup(
    groupId: string,
    isSuspended: boolean,
    reason?: string
  ): Promise<void> {
    const { error } = await supabase.rpc('admin_suspend_group', {
      p_group_id: groupId,
      p_is_suspended: isSuspended,
      p_reason: reason?.trim() || null,
    });

    if (error) {
      throw new Error(`تعذر تعديل حالة إيقاف المجموعة: ${error.message}`);
    }
  },

  /**
   * 19.2 Admin get private slot details by ID (including allowedSpecializations)
   */
  async getPrivateSlotById(slotId: string): Promise<{
    id: string;
    tutorId: string;
    tutorName: string;
    specializationLabel: string;
    offeringCourseOptionId?: string | null;
    quranAgeGroupId?: string | null;
    quranLevelId?: string | null;
    allowedSpecializations: Array<{
      id: string;
      track: 'school' | 'quran';
      courseOptionId?: string;
      ageGroupId?: string;
      levelId?: string;
      label: string;
    }>;
    slotDate: string;
    startTime: string;
    endTime: string;
    timezone: string;
    durationMinutes: number;
    priceAmount: number;
    currency: string;
    isAvailable: boolean;
    isBooked: boolean;
    adminSuspended: boolean;
  } | null> {
    const trimmed = slotId.trim();
    if (!trimmed) return null;
    const { data, error } = await supabase.rpc('admin_get_private_slot_by_id', {
      p_slot_id: trimmed,
    });
    if (error || !data) return null;
    const rawAllowed = Array.isArray(data.allowedSpecializations) ? data.allowedSpecializations : [];
    const allowedSpecializations = rawAllowed
      .map((item: any) => {
        if (!item || typeof item !== 'object') return null;
        const courseOptionId = item.courseOptionId || item.offeringCourseOptionId || undefined;
        const ageGroupId = item.ageGroupId || item.quranAgeGroupId || undefined;
        const levelId = item.levelId || item.quranLevelId || undefined;
        const track: 'school' | 'quran' =
          item.track === 'quran' || (!courseOptionId && ageGroupId && levelId) ? 'quran' : 'school';
        return {
          id:
            item.id ||
            (track === 'school'
              ? `school-${courseOptionId}`
              : `quran-${ageGroupId}-${levelId}`),
          track,
          courseOptionId: track === 'school' ? courseOptionId : undefined,
          ageGroupId: track === 'quran' ? ageGroupId : undefined,
          levelId: track === 'quran' ? levelId : undefined,
          label: resolveSpecializationLabel({
            specializationLabel: item.label || data.specializationLabel || '',
            quranAgeGroupId: track === 'quran' ? ageGroupId : null,
            quranLevelId: track === 'quran' ? levelId : null,
          }),
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      track: 'school' | 'quran';
      courseOptionId?: string;
      ageGroupId?: string;
      levelId?: string;
      label: string;
    }>;

    return {
      ...data,
      specializationLabel: resolveSpecializationLabel({
        specializationLabel: data.specializationLabel,
        quranAgeGroupId: data.quranAgeGroupId || data.quran_age_group_id,
        quranLevelId: data.quranLevelId || data.quran_level_id,
      }),
      allowedSpecializations,
    };
  },

  /**
   * 20. Admin confirm private booking
   */
  async confirmPrivateBooking(
    bookingId: string,
    chosenSpecialization?: {
      offeringCourseOptionId?: string | null;
      quranAgeGroupId?: string | null;
      quranLevelId?: string | null;
    }
  ): Promise<void> {
    const hasSpecSelection = Boolean(
      chosenSpecialization &&
        (chosenSpecialization.offeringCourseOptionId ||
          (chosenSpecialization.quranAgeGroupId && chosenSpecialization.quranLevelId))
    );

    if (hasSpecSelection) {
      const { error } = await supabase.rpc('admin_confirm_private_booking', {
        p_booking_id: bookingId,
        p_offering_course_option_id: chosenSpecialization?.offeringCourseOptionId || null,
        p_quran_age_group_id: chosenSpecialization?.quranAgeGroupId || null,
        p_quran_level_id: chosenSpecialization?.quranLevelId || null,
      });

      if (!error) return;

      const msg = String(error.message || '');
      if (
        error.code === '42883' ||
        error.code === 'PGRST202' ||
        msg.includes('p_offering_course_option_id')
      ) {
        throw new Error(
          'تأكيد الحجز بتخصص بديل محدد يتطلب تطبيق تحديث قاعدة البيانات (Migration 013) أولاً.'
        );
      }

      throw new Error(`تعذر تأكيد حجز الحصة الخاصة: ${error.message}`);
    }

    const { error } = await supabase.rpc('admin_confirm_private_booking', {
      p_booking_id: bookingId,
    });

    if (error) {
      throw new Error(`تعذر تأكيد حجز الحصة الخاصة: ${error.message}`);
    }
  },

  /**
   * 21. Admin cancel private booking
   */
  async cancelPrivateBooking(
    bookingId: string,
    reason?: string,
    reopenSlot: boolean = true
  ): Promise<void> {
    const { error } = await supabase.rpc('admin_cancel_private_booking', {
      p_booking_id: bookingId,
      p_cancellation_reason: reason?.trim() || null,
      p_reopen_slot: reopenSlot,
    });

    if (error) {
      throw new Error(`تعذر إلغاء حجز الحصة الخاصة: ${error.message}`);
    }
  },

  /**
   * 22. Admin confirm group enrollment
   */
  async confirmGroupEnrollment(enrollmentId: string): Promise<void> {
    const { error } = await supabase.rpc('admin_confirm_group_enrollment', {
      p_enrollment_id: enrollmentId,
    });

    if (error) {
      throw new Error(`تعذر تأكيد اشتراك الطالب في المجموعة: ${error.message}`);
    }
  },

  /**
   * 23. Admin cancel group enrollment
   */
  async cancelGroupEnrollment(enrollmentId: string, reason?: string): Promise<void> {
    const { error } = await supabase.rpc('admin_cancel_group_enrollment', {
      p_enrollment_id: enrollmentId,
      p_cancellation_reason: reason?.trim() || null,
    });

    if (error) {
      throw new Error(`تعذر إلغاء اشتراك الطالب في المجموعة: ${error.message}`);
    }
  },

  /**
   * 24. Admin create private booking from WhatsApp lead
   */
  async createPrivateBooking(params: {
    slotId: string;
    studentName: string;
    guardianName: string;
    phoneNumber: string;
    agreedPrice: number;
    notes?: string;
    offeringCourseOptionId?: string | null;
    quranAgeGroupId?: string | null;
    quranLevelId?: string | null;
    isMultiSpecializationSlot?: boolean;
  }): Promise<{ bookingId: string; alreadyExists?: boolean; alreadyConfirmed?: boolean; specializationLabel?: string }> {
    const {
      slotId,
      studentName,
      guardianName,
      phoneNumber,
      agreedPrice,
      notes,
      offeringCourseOptionId,
      quranAgeGroupId,
      quranLevelId,
      isMultiSpecializationSlot,
    } = params;

    const hasExplicitSpecialization = Boolean(
      offeringCourseOptionId || (quranAgeGroupId && quranLevelId)
    );

    const { data, error } = await supabase.rpc('admin_create_private_booking', {
      p_slot_id: slotId,
      p_student_name: studentName.trim(),
      p_guardian_name: guardianName.trim(),
      p_phone_number: phoneNumber.trim(),
      p_agreed_price: agreedPrice,
      p_notes: notes?.trim() || null,
      p_offering_course_option_id: offeringCourseOptionId || null,
      p_quran_age_group_id: quranAgeGroupId || null,
      p_quran_level_id: quranLevelId || null,
    });

    if (!error) {
      if (
        !data ||
        data.success !== true ||
        typeof data.bookingId !== 'string' ||
        data.bookingId.trim().length === 0
      ) {
        throw new Error(
          'فشل تسجيل طلب حجز الحصة الخاصة: استجابة الخادم غير مكتملة أو لا تتضمن معرف الحجز.'
        );
      }

      return {
        bookingId: data.bookingId.trim(),
        alreadyExists: Boolean(data.alreadyExists),
        alreadyConfirmed: Boolean(data.alreadyConfirmed),
        specializationLabel: data.specializationLabel,
      };
    }

    const msg = String(error.message || '');
    const isMissingNewSignature =
      error.code === '42883' ||
      error.code === 'PGRST202' ||
      msg.includes('p_offering_course_option_id');

    if (isMissingNewSignature) {
      if (isMultiSpecializationSlot && hasExplicitSpecialization) {
        throw new Error(
          'حفظ التخصص البديل المختار في الحجز يتطلب تطبيق تحديث قاعدة البيانات (Migration 013) أولاً.'
        );
      }

      const { data: fallbackData, error: fallbackError } = await supabase.rpc(
        'admin_create_private_booking',
        {
          p_slot_id: slotId,
          p_student_name: studentName.trim(),
          p_guardian_name: guardianName.trim(),
          p_phone_number: phoneNumber.trim(),
          p_agreed_price: agreedPrice,
          p_notes: notes?.trim() || null,
        }
      );

      if (fallbackError) {
        throw new Error(`فشل تسجيل طلب حجز الحصة الخاصة: ${fallbackError.message}`);
      }

      if (
        !fallbackData ||
        fallbackData.success !== true ||
        typeof fallbackData.bookingId !== 'string' ||
        fallbackData.bookingId.trim().length === 0
      ) {
        throw new Error(
          'فشل تسجيل طلب حجز الحصة الخاصة: استجابة الخادم غير مكتملة أو لا تتضمن معرف الحجز.'
        );
      }

      return {
        bookingId: fallbackData.bookingId.trim(),
        alreadyExists: Boolean(fallbackData.alreadyExists),
        alreadyConfirmed: Boolean(fallbackData.alreadyConfirmed),
      };
    }

    throw new Error(`فشل تسجيل طلب حجز الحصة الخاصة: ${error.message}`);
  },

  /**
   * 25. Admin create group enrollment from WhatsApp lead
   */
  async createGroupEnrollment(params: {
    groupId: string;
    studentName: string;
    guardianName: string;
    phoneNumber: string;
    agreedPrice: number;
    priceType?: 'per_session' | 'full_package';
    notes?: string;
  }): Promise<{ enrollmentId: string; alreadyExists?: boolean }> {
    const { groupId, studentName, guardianName, phoneNumber, agreedPrice, priceType = 'full_package', notes } = params;
    const { data, error } = await supabase.rpc('admin_create_group_enrollment', {
      p_group_id: groupId,
      p_student_name: studentName.trim(),
      p_guardian_name: guardianName.trim(),
      p_phone_number: phoneNumber.trim(),
      p_agreed_price: agreedPrice,
      p_price_type: priceType,
      p_notes: notes?.trim() || null,
    });

    if (error) {
      throw new Error(`فشل تسجيل اشتراك المجموعة: ${error.message}`);
    }

    return { enrollmentId: data?.enrollmentId, alreadyExists: data?.alreadyExists };
  },

  /**
   * 26. Admin get private bookings
   */
  async getPrivateBookings(status?: string, tutorId?: string): Promise<any[]> {
    const { data, error } = await supabase.rpc('admin_get_private_bookings', {
      p_status: status || null,
      p_tutor_id: tutorId || null,
    });

    if (error) {
      return [];
    }

    return ((data as any[]) || []).map((row) => ({
      ...row,
      specializationLabel: resolveSpecializationLabel({
        specializationLabel: row.specializationLabel || row.specialization_label,
        quranAgeGroupId: row.quranAgeGroupId || row.quran_age_group_id,
        quranLevelId: row.quranLevelId || row.quran_level_id,
      }),
    }));
  },

  /**
   * 27. Admin get group enrollments
   */
  async getGroupEnrollments(status?: string, groupId?: string, tutorId?: string): Promise<any[]> {
    const { data, error } = await supabase.rpc('admin_get_group_enrollments', {
      p_status: status || null,
      p_group_id: groupId || null,
      p_tutor_id: tutorId || null,
    });

    if (error) {
      return [];
    }

    return data || [];
  },

  /**
   * 28. Admin get educational groups
   */
  async getGroups(reviewStatus?: string, tutorId?: string): Promise<any[]> {
    const { data, error } = await supabase.rpc('admin_get_groups', {
      p_review_status: reviewStatus || null,
      p_tutor_id: tutorId || null,
    });

    if (error) {
      return [];
    }

    return ((data as any[]) || []).map((row) => ({
      ...row,
      specializationLabel: resolveSpecializationLabel({
        specializationLabel: row.specializationLabel || row.specialization_label,
        quranAgeGroupId: row.quranAgeGroupId || row.quran_age_group_id,
        quranLevelId: row.quranLevelId || row.quran_level_id,
      }),
    }));
  },

  // Cache for raw statistics dataset when migration RPC is not yet deployed
  _rawStatsCache: null as {
    timestamp: number;
    dataset: RawStatisticsDataset;
    health: AdminStatisticsDataHealth;
  } | null,

  async _fetchRawStatisticsDataset(
    forceRefresh = false,
    rpcErrorMsg?: string
  ): Promise<{ dataset: RawStatisticsDataset; health: AdminStatisticsDataHealth }> {
    const now = Date.now();
    if (!forceRefresh && this._rawStatsCache && now - this._rawStatsCache.timestamp < 60_000) {
      return {
        dataset: this._rawStatsCache.dataset,
        health: this._rawStatsCache.health,
      };
    }

    // Do NOT filter reference tables by is_active = true so historical records linked to inactive items are preserved
    const [
      subjectsRes,
      stagesRes,
      gradesRes,
      curriculaRes,
      courseOptionsRes,
      quranLevelsRes,
      quranAgeGroupsRes,
      tutorsRes,
      schoolOfferingsRes,
      quranOfferingsRes,
      applicationsRes,
      privateBookingsRes,
      groupEnrollmentsRes,
      classesMetadataRpcRes,
    ] = await Promise.all([
      supabase.from('subjects').select('id, name, english_name, category, display_order, is_active').order('display_order', { ascending: true }),
      supabase.from('educational_stages').select('id, name, grades_desc, display_order, is_active').order('display_order', { ascending: true }),
      supabase.from('educational_grades').select('id, stage_id, name, display_order, is_active').order('display_order', { ascending: true }),
      supabase.from('curriculum_types').select('id, name, description, display_order, is_active').order('display_order', { ascending: true }),
      supabase.from('school_course_options').select('id, grade_id, subject_id, curriculum_id, is_active'),
      supabase.from('quran_levels').select('id, name, description, display_order, is_active').order('display_order', { ascending: true }),
      supabase.from('quran_age_groups').select('id, name, age_range, display_order, is_active').order('display_order', { ascending: true }),
      supabase.from('tutors').select('id, name, honorific, headline, is_published, created_at'),
      supabase.from('tutor_school_offerings').select('id, tutor_id, course_option_id'),
      supabase.from('tutor_quran_offerings').select('id, tutor_id, age_group_id, level_id'),
      supabase.from('tutor_applications').select('id, reference_code, user_id, full_name, phone, track, status, school_course_option_ids, school_specializations, quran_offerings, quran_age_groups, quran_levels, created_at'),
      supabase.rpc('admin_get_private_bookings', { p_status: null, p_tutor_id: null }),
      supabase.rpc('admin_get_group_enrollments', { p_status: null, p_group_id: null, p_tutor_id: null }),
      supabase.rpc('admin_get_classes_specialization_metadata'),
    ]);

    // 1. Reference tables are strictly mandatory; never turn failed reference tables into empty arrays
    const refErrors: string[] = [];
    if (subjectsRes.error) refErrors.push(`subjects: ${subjectsRes.error.message}`);
    if (stagesRes.error) refErrors.push(`educational_stages: ${stagesRes.error.message}`);
    if (gradesRes.error) refErrors.push(`educational_grades: ${gradesRes.error.message}`);
    if (curriculaRes.error) refErrors.push(`curriculum_types: ${curriculaRes.error.message}`);
    if (courseOptionsRes.error) refErrors.push(`school_course_options: ${courseOptionsRes.error.message}`);
    if (quranLevelsRes.error) refErrors.push(`quran_levels: ${quranLevelsRes.error.message}`);
    if (quranAgeGroupsRes.error) refErrors.push(`quran_age_groups: ${quranAgeGroupsRes.error.message}`);

    if (refErrors.length > 0) {
      throw new Error(`تعذر تحميل الجداول المرجعية الأساسية للإحصائيات: ${refErrors.join(' | ')}`);
    }

    const errors: AdminStatisticsDataHealthError[] = [];

    if (rpcErrorMsg) {
      errors.push({
        source: 'RPC: admin_get_platform_statistics',
        message: `لم يتم تطبيق دالة التجميع المرجعية في قاعدة البيانات أو تعذر استدعاؤها (${rpcErrorMsg}).`,
        affectedMetrics: 'التجميع المباشر داخل قاعدة البيانات ودوال الفحص الصفحي (Drilldown RPC)',
      });
    }

    // 2. Check Tutors & Offerings source
    let tutorsAvailable = true;
    if (tutorsRes.error || schoolOfferingsRes.error || quranOfferingsRes.error) {
      tutorsAvailable = false;
      const msg = [
        tutorsRes.error?.message,
        schoolOfferingsRes.error?.message,
        quranOfferingsRes.error?.message,
      ]
        .filter(Boolean)
        .join(' | ');
      errors.push({
        source: 'بيانات المعلمين وتخصصاتهم المعتمدة',
        message: `فشل تحميل مصدر المعلمين أو عروض المواد (${msg}).`,
        affectedMetrics: 'أعداد المعلمين المعتمدين والمنشورين وتغطية المواد',
      });
    }

    // 3. Check Applications source
    let applicationsAvailable = true;
    if (applicationsRes.error) {
      applicationsAvailable = false;
      errors.push({
        source: 'جدول طلبات انضمام المعلمين (tutor_applications)',
        message: `فشل تحميل طلبات الانضمام (${applicationsRes.error.message}).`,
        affectedMetrics: 'أعداد المتقدمين قيد المراجعة، استكمال البيانات، المقبولين، المرفوضين، والمسودات',
      });
    }

    // 4. Check Classes Specialization Metadata RPC & Bookings/Enrollments RPCs
    // Never fall back to guessing or partial group queries without reference foreign keys
    let subscriptionsAvailable = true;
    let supplySlotsAvailable = true;

    if (classesMetadataRpcRes.error || !classesMetadataRpcRes.data) {
      subscriptionsAvailable = false;
      supplySlotsAvailable = false;
      errors.push({
        source: 'RPC: admin_get_classes_specialization_metadata',
        message: `دالة البيانات المرجعية للحصص والمجموعات غير متوفرة أو لم يتم تطبيق Migration الإحصائيات (${classesMetadataRpcRes.error?.message || 'لا توجد استجابة'}).`,
        affectedMetrics: 'جميع مؤشرات حجوزات الخاص، اشتراكات المجموعات، المجموعات النشطة، والمواعيد المتاحة',
      });
    } else {
      if (privateBookingsRes.error || groupEnrollmentsRes.error) {
        subscriptionsAvailable = false;
        const msg = [privateBookingsRes.error?.message, groupEnrollmentsRes.error?.message]
          .filter(Boolean)
          .join(' | ');
        errors.push({
          source: 'RPC: admin_get_private_bookings / admin_get_group_enrollments',
          message: `فشل تحميل سجلات الحجوزات الخاصة أو اشتراكات المجموعات (${msg}).`,
          affectedMetrics: 'أعداد الحجوزات والاشتراكات (المؤكدة، المكتملة، قيد الانتظار، والملغاة)',
        });
      }
    }

    if (!tutorsAvailable && !applicationsAvailable && !subscriptionsAvailable) {
      throw new Error(
        `تعذر تحميل كافة مصادر الإحصائيات الأساسية: ${errors.map((e) => e.message).join(' — ')}`
      );
    }

    const classesMeta =
      !classesMetadataRpcRes.error && classesMetadataRpcRes.data ? classesMetadataRpcRes.data : null;
    const metaPrivateSlots: any[] =
      supplySlotsAvailable && Array.isArray(classesMeta?.private_slots)
        ? classesMeta.private_slots
        : [];
    const metaGroups: any[] =
      supplySlotsAvailable && Array.isArray(classesMeta?.groups) ? classesMeta.groups : [];
    const metaTrialSummary = supplySlotsAvailable ? classesMeta?.trial_summary || null : null;

    const dataset: RawStatisticsDataset = {
      subjects: subjectsRes.data as any[],
      stages: stagesRes.data as any[],
      grades: gradesRes.data as any[],
      curricula: curriculaRes.data as any[],
      courseOptions: courseOptionsRes.data as any[],
      quranLevels: ((quranLevelsRes.data as any[]) || []).map((ql) => {
        const canonical = CANONICAL_QURAN_LEVELS[ql.id];
        return canonical
          ? { ...ql, name: canonical.name, description: canonical.description }
          : ql;
      }),
      quranAgeGroups: ((quranAgeGroupsRes.data as any[]) || []).map((ag) => {
        if (ag.id === 'age_adults') return ag;
        const canonical = CANONICAL_QURAN_AGE_GROUPS[ag.id];
        return canonical
          ? { ...ag, name: canonical.name, age_range: canonical.ageRange }
          : { ...ag, name: normalizeLegacyAgeGroupText(ag.name) };
      }),
      tutors: tutorsAvailable ? (tutorsRes.data as any[]) : [],
      schoolOfferings: tutorsAvailable ? (schoolOfferingsRes.data as any[]) : [],
      quranOfferings: tutorsAvailable ? (quranOfferingsRes.data as any[]) : [],
      applications: applicationsAvailable ? (applicationsRes.data as any[]) : [],
      privateSlots: metaPrivateSlots,
      privateBookings: subscriptionsAvailable
        ? ((privateBookingsRes.data as any[]) || []).map((pb: any) => ({
            ...pb,
            id: pb.id || pb.booking_id,
          }))
        : [],
      groups: metaGroups,
      groupEnrollments: subscriptionsAvailable
        ? ((groupEnrollmentsRes.data as any[]) || []).map((ge: any) => ({
            ...ge,
            id: ge.id || ge.enrollment_id,
          }))
        : [],
      trialSummary: metaTrialSummary
        ? {
            total_slots: Number(metaTrialSummary.total_slots || 0),
            available_future_slots: Number(metaTrialSummary.available_future_slots || 0),
            booked_slots: Number(metaTrialSummary.booked_slots || 0),
            suspended_slots: Number(metaTrialSummary.suspended_slots || 0),
          }
        : undefined,
    };

    const health: AdminStatisticsDataHealth = {
      mode: 'partial_sources',
      rpcMigrationApplied: false,
      isComplete:
        tutorsAvailable && applicationsAvailable && subscriptionsAvailable && supplySlotsAvailable,
      tutorsAvailable,
      applicationsAvailable,
      subscriptionsAvailable,
      supplySlotsAvailable,
      errors,
    };

    this._rawStatsCache = { timestamp: now, dataset, health };
    return { dataset, health };
  },

  /**
   * 29. Admin Platform Statistics (Tutors, Applicants, Subscriptions by Subject & Specialization)
   * Primary path: Calls server-side aggregated RPC `admin_get_platform_statistics`
   * without downloading raw booking/enrollment/application tables into the browser.
   * If the RPC is not applied or a source fails, surfaces explicit `dataHealth` errors
   * and disables affected indicators rather than showing misleading zeros.
   */
  async getPlatformStatistics(options?: { forceRefresh?: boolean }): Promise<AdminPlatformStatistics> {
    if (options?.forceRefresh) {
      this._rawStatsCache = null;
    }

    const { data: rpcData, error: rpcError } = await supabase.rpc('admin_get_platform_statistics');
    if (!rpcError && rpcData && typeof rpcData === 'object' && 'overview' in rpcData) {
      const rawStats = rpcData as AdminPlatformStatistics;
      return {
        ...rawStats,
        detailedSpecializations: (rawStats.detailedSpecializations || []).map((spec) => {
          const cAg = spec.ageGroupId ? CANONICAL_QURAN_AGE_GROUPS[spec.ageGroupId] : undefined;
          const cLvl = spec.levelId ? CANONICAL_QURAN_LEVELS[spec.levelId] : undefined;
          return {
            ...spec,
            label: normalizeLegacyAgeGroupText(spec.label),
            ageGroupName: cAg ? cAg.name : normalizeLegacyAgeGroupText(spec.ageGroupName),
            levelName: cLvl ? cLvl.name : spec.levelName,
          };
        }),
        quranLevelsStats: (rawStats.quranLevelsStats || []).map((lvl) => {
          const cLvl = CANONICAL_QURAN_LEVELS[lvl.levelId];
          return {
            ...lvl,
            levelName: cLvl ? cLvl.name : lvl.levelName,
            description: cLvl ? cLvl.description : lvl.description,
          };
        }),
        quranAgeGroupsStats: (rawStats.quranAgeGroupsStats || []).map((ag) => {
          const cAg = CANONICAL_QURAN_AGE_GROUPS[ag.ageGroupId];
          return {
            ...ag,
            ageGroupName: cAg ? cAg.name : normalizeLegacyAgeGroupText(ag.ageGroupName),
            ageRange: cAg ? cAg.ageRange : ag.ageRange,
          };
        }),
        dataHealth: {
          mode: 'rpc',
          rpcMigrationApplied: true,
          isComplete: true,
          tutorsAvailable: true,
          applicationsAvailable: true,
          subscriptionsAvailable: true,
          supplySlotsAvailable: true,
          errors: [],
        },
      };
    }

    if (rpcError?.message?.includes('غير مصرح')) {
      throw new Error(rpcError.message);
    }

    const { dataset, health } = await this._fetchRawStatisticsDataset(
      Boolean(options?.forceRefresh),
      rpcError?.message || 'الدالة admin_get_platform_statistics غير موجودة'
    );
    const computed = computePlatformStatisticsFromDataset(dataset);
    return {
      ...computed,
      dataHealth: health,
    };
  },

  /**
   * 30. Admin Statistics Paginated Drilldown
   * Fetches detailed records on demand (with pagination) when an admin inspects a specific
   * subject, specialization, Quran program/age group, stage, curriculum, or unclassified bucket.
   */
  async getStatisticsDrilldown(
    request: AdminStatisticsDrilldownRequest
  ): Promise<AdminStatisticsDrilldownResponse> {
    const { data: rpcData, error: rpcError } = await supabase.rpc('admin_get_statistics_drilldown', {
      p_entity_type: request.entityType,
      p_track: request.track || 'all',
      p_subject_id: request.subjectId || null,
      p_stage_id: request.stageId || null,
      p_grade_id: request.gradeId || null,
      p_curriculum_id: request.curriculumId || null,
      p_course_option_id: request.courseOptionId || null,
      p_quran_level_id: request.quranLevelId || null,
      p_quran_age_group_id: request.quranAgeGroupId || null,
      p_status_filter: request.statusFilter || null,
      p_page: request.page ?? 1,
      p_page_size: request.pageSize ?? 20,
    });

    if (!rpcError && rpcData && typeof rpcData === 'object' && 'entityType' in rpcData) {
      return rpcData as AdminStatisticsDrilldownResponse;
    }

    if (rpcError?.message?.includes('غير مصرح')) {
      throw new Error(rpcError.message);
    }

    const { dataset, health } = await this._fetchRawStatisticsDataset(false);

    if (request.entityType === 'tutors' && !health.tutorsAvailable) {
      throw new Error('بيانات المعلمين غير مكتملة بسبب فشل تحميل المصدر الأساسي.');
    }
    if (request.entityType === 'applicants' && !health.applicationsAvailable) {
      throw new Error('بيانات طلبات الانضمام غير مكتملة بسبب فشل تحميل المصدر الأساسي.');
    }
    if (request.entityType === 'subscriptions' && !health.subscriptionsAvailable) {
      throw new Error(
        'بيانات الاشتراكات والحجوزات غير مكتملة — يجب تطبيق Migration الإحصائيات لتوفير المعرفات المرجعية للحصص والمجموعات.'
      );
    }

    return computeStatisticsDrilldownFromDataset(dataset, request);
  },
};
