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

    // Fetch counts for school offerings, quran offerings, and available slots
    const [schoolOfferingsRes, quranOfferingsRes, slotsRes] = await Promise.all([
      supabase.from('tutor_school_offerings').select('tutor_id').in('tutor_id', tutorIds),
      supabase.from('tutor_quran_offerings').select('tutor_id').in('tutor_id', tutorIds),
      supabase
        .from('tutor_available_slots')
        .select('tutor_id')
        .in('tutor_id', tutorIds)
        .eq('is_available', true),
    ]);

    const offeringCounts: Record<string, number> = {};
    (schoolOfferingsRes.data || []).forEach((row: any) => {
      offeringCounts[row.tutor_id] = (offeringCounts[row.tutor_id] || 0) + 1;
    });
    (quranOfferingsRes.data || []).forEach((row: any) => {
      offeringCounts[row.tutor_id] = (offeringCounts[row.tutor_id] || 0) + 1;
    });

    const slotCounts: Record<string, number> = {};
    (slotsRes.data || []).forEach((row: any) => {
      slotCounts[row.tutor_id] = (slotCounts[row.tutor_id] || 0) + 1;
    });

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
};
