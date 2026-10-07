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
import { TutorPortalContext, TutorAvailableSlot, TutorProfileDraft } from '../types';

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
      .select('id, slot_date, start_time, end_time, timezone, is_available, is_booked, booked_at, created_at')
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
};
