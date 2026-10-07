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
} from '../types';

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
      referenceCode: row.reference_code,
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
      termsPolicyVersion: row.policy_version || 'v1.0',
      policyVersion: row.policy_version || 'v1.0',
      policyAcceptedAt: row.policy_accepted_at || row.created_at,
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
      referenceCode: data.reference_code,
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
      termsPolicyVersion: data.policy_version || 'v1.0',
      policyVersion: data.policy_version || 'v1.0',
      policyAcceptedAt: data.policy_accepted_at || data.created_at,
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
   * 13. Applications: Review action (Needs Info or Reject)
   */
  async reviewApplication(
    applicationId: string,
    status: 'needs_info' | 'rejected',
    adminNotes: string
  ): Promise<void> {
    if (!adminNotes || !adminNotes.trim()) {
      throw new Error('يرجى تدوين الملاحظات والتوجيهات للمعلم.');
    }

    // Try RPC first
    const { error: rpcError } = await supabase.rpc('admin_review_tutor_application', {
      p_application_id: applicationId,
      p_status: status,
      p_admin_notes: adminNotes.trim(),
    });

    if (rpcError) {
      // Fallback direct update with RLS (if RPC is not yet executed in DB)
      const { data: { user } } = await supabase.auth.getUser();
      const { error: updateError } = await supabase
        .from('tutor_applications')
        .update({
          status,
          admin_notes: adminNotes.trim(),
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.id || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', applicationId);

      if (updateError) {
        throw new Error(`تعذر تحديث حالة الطلب: ${updateError.message}`);
      }
    }
  },

  /**
   * 14. Applications: Approve Application and Create Unpublished Tutor Profile
   * Always creates tutor with is_published = false. Publishing is a separate explicit decision.
   */
  async approveApplication(
    applicationId: string,
    tutorSlug: string,
    adminNotes?: string
  ): Promise<{ tutorId: string }> {
    const cleanSlug = tutorSlug.trim().toLowerCase();
    if (!cleanSlug || !/^[a-z0-9-]+$/.test(cleanSlug)) {
      throw new Error('معرف المعلم (Slug) غير صالح: يجب أن يتكون من أحرف إنجليزية وأرقام وشرطات فقط بدون مسافات (مثال: mohamed-ali).');
    }

    // 1. Try RPC atomic transaction
    const { data: rpcData, error: rpcError } = await supabase.rpc('admin_approve_tutor_application', {
      p_application_id: applicationId,
      p_tutor_slug: cleanSlug,
      p_admin_notes: adminNotes?.trim() || null,
    });

    if (!rpcError && rpcData?.success) {
      return { tutorId: rpcData.tutorId || cleanSlug };
    }

    // 2. Resilient fallback if RPC 005 not yet applied in Supabase:
    // Fetch application details and use AdminService.saveTutor with isPublished: false
    const app = await this.getApplicationById(applicationId);
    if (!app) {
      throw new Error('تعذر العثور على بيانات الطلب للاعتماد.');
    }

    if (app.status !== 'submitted' && app.status !== 'needs_info') {
      throw new Error(`حالة الطلب الحالية (${app.status}) لا تسمح بالقبول.`);
    }

    // Parse experience years accurately without replacing all digits into merged number
    const parseExpYears = (exp: string): number => {
      if (!exp) return 1;
      if (exp.includes('أكثر') || exp.includes('10') || exp.includes('١٠')) return 10;
      if (exp.includes('٧') || exp.includes('7')) return 7;
      if (exp.includes('٤') || exp.includes('4')) return 4;
      if (exp.includes('سنتين') || exp.includes('٣') || exp.includes('3') || exp.includes('2') || exp.includes('٢')) return 2;
      if (exp.includes('أقل')) return 1;
      const match = exp.match(/\d+/);
      return match ? parseInt(match[0], 10) : 1;
    };

    // Create tutor record (Unpublished, rating: null, reviewsCount: 0, no fake pillars)
    await this.saveTutor({
      id: cleanSlug,
      isNew: true,
      name: app.fullName,
      honorific: 'أ.',
      headline: app.academicDegree || 'معلم في منصة شاطر',
      avatarUrl: '',
      yearsOfExperience: parseExpYears(app.experienceYears),
      experienceBadgeText: app.experienceYears,
      verifiedCredentials: false, // Rule 1: No auto verified_credentials
      helpChildQuote: app.bioAndMethodology,
      helpChildSummary: app.bioAndMethodology,
      targetStudentCases: [], // Rule 2: No fake student cases
      curriculumTags: [], // Rule 2: No fake curriculum tags
      isPublished: false, // Rule 6: Strictly unpublished upon approval
      hourlyRateMin: app.suggestedHourlyRateNum || 120,
      hourlyRateMax: app.suggestedHourlyRateNum || 120,
      currency: app.currency || 'ج.م',
      sessionDurationMinutes: app.sessionDurationMinutes || 50,
      trialDurationMinutes: 20,
      qualifications: app.academicDegree ? [{
        title: app.academicDegree,
        institution: app.institution?.trim() || '', // Rule 1: No fake "جامعة معتمدة" or "غير محدد"
        verified: false, // Rule 1: No auto verified qualification
        notes: 'تم تسجيله عبر طلب الانضمام ويحتاج مراجعة الشهادة',
        displayOrder: 1,
      }] : [],
      methodologyPillars: [], // Rule 2: Leave empty for admin review; no fake pillars
      trialSteps: [], // Rule 2: Leave empty for admin review; no fake trial steps
      schoolOfferingOptionIds: app.schoolCourseOptionIds || [],
      quranOfferings: app.quranOfferings || [],
      privateInfo: {
        fullLegalName: app.fullName,
        countryCode: app.countryCode,
        phoneNumber: app.phone,
        whatsappNumber: app.whatsappNumber || app.phone,
        email: app.email,
        internalNotes: adminNotes?.trim() || undefined,
      },
    }, true);

    // Update application record status
    const { data: { user } } = await supabase.auth.getUser();
    await supabase
      .from('tutor_applications')
      .update({
        status: 'approved',
        applicant_tutor_id: cleanSlug,
        admin_notes: adminNotes?.trim() || app.adminNotes,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user?.id || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', applicationId);

    return { tutorId: cleanSlug };
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
};
