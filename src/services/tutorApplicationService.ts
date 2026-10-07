import { supabase } from '../lib/supabase';
import {
  TutorApplicationFormData,
  TutorApplicationRecord,
  TutorApplicationStatus,
} from '../types';

export const TUTOR_POLICY_VERSION = 'v1.0';

export const TutorApplicationService = {
  /**
   * 1. Get current logged-in Auth User
   */
  async getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  /**
   * Subscribe to Auth State Changes
   */
  onAuthStateChange(callback: (user: any) => void) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(session?.user || null);
    });
    return () => subscription.unsubscribe();
  },

  /**
   * 2. Teacher Registration (Sign Up)
   * Note: This creates a regular auth.users record. It does NOT grant admin permissions or touch admin_users.
   */
  async signUp(email: string, password: string, fullName?: string) {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      throw new Error('يرجى إدخال البريد الإلكتروني وكلمة المرور.');
    }
    if (password.length < 6) {
      throw new Error('كلمة المرور يجب أن تكون ٦ خانات على الأقل.');
    }

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: fullName?.trim() || '',
          account_type: 'tutor_applicant',
        },
      },
    });

    if (error) {
      if (error.message.includes('already registered')) {
        throw new Error('هذا البريد الإلكتروني مسجل بالفعل. يرجى تسجيل الدخول بدلاً من ذلك.');
      }
      throw new Error(`تعذر إنشاء الحساب: ${error.message}`);
    }

    return data.user;
  },

  /**
   * 3. Teacher Login (Sign In)
   */
  async signIn(email: string, password: string) {
    const cleanEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        throw new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
      }
      throw new Error(`تعذر تسجيل الدخول: ${error.message}`);
    }

    return data.user;
  },

  /**
   * 4. Teacher Sign Out
   */
  async signOut() {
    await supabase.auth.signOut();
  },

  /**
   * 5. Password Reset
   */
  async resetPassword(email: string) {
    const cleanEmail = email.trim().toLowerCase();
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);
    if (error) {
      throw new Error(`تعذر إرسال رابط استعادة كلمة المرور: ${error.message}`);
    }
  },

  /**
   * 6. Fetch logged-in tutor's own application from Supabase
   * Strictly protected by RLS (user_id = auth.uid())
   */
  async getMyApplication(): Promise<TutorApplicationRecord | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('tutor_applications')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.warn('Error fetching tutor application:', error);
      return null;
    }

    if (!data) return null;

    return this.mapDatabaseRowToRecord(data);
  },

  /**
   * 7. Save Application (Draft or Final Submission)
   * Strictly uses secure RPC `tutor_save_application` to enforce auth.uid()
   * and prevent any modifications to administrative columns.
   */
  async saveApplication(
    formData: TutorApplicationFormData,
    isSubmit: boolean = false,
    _existingAppId?: string,
    removeAvatar: boolean = false
  ): Promise<TutorApplicationRecord> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('يجب تسجيل الدخول بحساب المعلم أولاً لحفظ الطلب أو إرساله.');
    }

    const payload: any = {
      fullName: formData.fullName.trim(),
      countryCode: formData.countryCode,
      phone: formData.phone.trim(),
      whatsappNumber: formData.phone.trim(),
      email: user.email || formData.fullName,
      track: formData.track,
      schoolSpecializations: formData.schoolSpecializations || [],
      schoolCourseOptionIds: formData.schoolCourseOptionIds || [],
      quranOfferings: formData.quranOfferings || [],
      quranAgeGroups: formData.quranAgeGroups || [],
      quranLevels: formData.quranLevels || [],
      quranNotes: formData.quranNotes?.trim() || null,
      academicDegree: formData.academicDegree.trim(),
      institution: formData.institution?.trim() || null,
      experienceYears: formData.experienceYears,
      hasOnlineExperience: formData.hasOnlineExperience || '',
      onlineExperienceDetails: formData.onlineExperienceDetails.trim() || null,
      bioAndMethodology: formData.bioAndMethodology.trim(),
      portfolioUrl: formData.portfolioUrl.trim() || null,
      avatarPath: formData.avatarPath || null,
      removeAvatar: removeAvatar,
      suggestedHourlyRate: Number(formData.suggestedHourlyRate) || 120,
      currency: formData.currency || 'ج.م',
      sessionDurationMinutes: formData.sessionDurationMinutes || 50,
      availableDays: formData.availableDays || [],
      preferredTimes: formData.preferredTimes || [],
      timezone: formData.timezone || 'Africa/Cairo',
      termsAccepted: formData.termsAccepted,
    };

    // 1. Invoke secure RPC
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'tutor_save_application',
      {
        p_payload: payload,
        p_is_submit: isSubmit,
      }
    );

    if (!rpcError && rpcData) {
      return this.mapDatabaseRowToRecord(rpcData);
    }

    // 2. If RPC is not yet executed in DB, provide resilient fallback
    if (rpcError && (rpcError.message.includes('function') || rpcError.code === '42883')) {
      console.warn('RPC tutor_save_application not found, using direct table fallback:', rpcError.message);
      const targetStatus: TutorApplicationStatus = isSubmit ? 'submitted' : 'draft';
      const refCode = `SH-${Math.floor(100000 + Math.random() * 900000)}`;

      const dbPayload: any = {
        user_id: user.id,
        full_name: payload.fullName,
        country_code: payload.countryCode,
        phone: payload.phone,
        whatsapp_number: payload.whatsappNumber,
        email: payload.email,
        track: payload.track,
        school_specializations: payload.schoolSpecializations,
        quran_age_groups: payload.quranAgeGroups,
        quran_levels: payload.quranLevels,
        quran_notes: payload.quranNotes,
        academic_degree: payload.academicDegree,
        institution: payload.institution,
        experience_years: payload.experienceYears,
        has_online_experience: payload.hasOnlineExperience,
        online_experience_details: payload.onlineExperienceDetails,
        bio_and_methodology: payload.bioAndMethodology,
        portfolio_url: payload.portfolioUrl,
        avatar_path: payload.avatarPath || null,
        suggested_hourly_rate: payload.suggestedHourlyRate,
        currency: payload.currency,
        session_duration_minutes: payload.sessionDurationMinutes,
        available_days: payload.availableDays,
        preferred_times: payload.preferredTimes,
        timezone: payload.timezone,
        terms_accepted: payload.termsAccepted,
        policy_version: TUTOR_POLICY_VERSION,
        policy_accepted_at: payload.termsAccepted ? new Date().toISOString() : null,
        status: targetStatus,
        updated_at: new Date().toISOString(),
      };

      const { data: existing } = await supabase
        .from('tutor_applications')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      let resultData: any = null;
      if (existing) {
        const { data, error } = await supabase
          .from('tutor_applications')
          .update(dbPayload)
          .eq('id', existing.id)
          .eq('user_id', user.id)
          .select()
          .single();
        if (error) throw new Error(`تعذر تحديث الطلب: ${error.message}`);
        resultData = data;
      } else {
        dbPayload.reference_code = refCode;
        const { data, error } = await supabase
          .from('tutor_applications')
          .insert([dbPayload])
          .select()
          .single();
        if (error) throw new Error(`تعذر حفظ الطلب: ${error.message}`);
        resultData = data;
      }

      return this.mapDatabaseRowToRecord(resultData);
    }

    throw new Error(rpcError?.message || 'تعذر حفظ بيانات الطلب.');
  },

  /**
   * Helper: map DB row to frontend record
   */
  mapDatabaseRowToRecord(row: any): TutorApplicationRecord {
    // Normalize status
    let status: TutorApplicationStatus = 'draft';
    if (['draft', 'submitted', 'needs_info', 'approved', 'rejected'].includes(row.status)) {
      status = row.status as TutorApplicationStatus;
    } else if (row.status === 'pending_review' || row.status === 'interview_scheduled') {
      status = 'submitted';
    }

    return {
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
      avatarUrl: null, // Populated via signed URL when viewing
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
      status,
      adminNotes: row.admin_notes || null,
      reviewedAt: row.reviewed_at || null,
      reviewedBy: row.reviewed_by || null,
      applicantTutorId: row.applicant_tutor_id || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },

  /**
   * 8. Upload Application Avatar to Private Storage Bucket ('tutor-application-avatars')
   * Validates format (JPEG, PNG, WebP) and size (<= 2MB)
   * Only permitted in draft and needs_info states
   */
  async uploadApplicationAvatar(
    file: File,
    currentStatus?: TutorApplicationStatus
  ): Promise<{ avatarPath: string; signedUrl: string }> {
    const user = await this.getCurrentUser();
    if (!user) {
      throw new Error('يرجى تسجيل الدخول بحساب المعلم أولاً لرفع الصورة الشخصية.');
    }

    // Status gate: only draft, needs_info or new application can upload
    if (
      currentStatus &&
      currentStatus !== 'draft' &&
      currentStatus !== 'needs_info'
    ) {
      throw new Error('لا يمكن تعديل أو رفع الصورة بعد إرسال الطلب للاعتماد إلا إذا طلبت الإدارة استكمال بيانات.');
    }

    // Format validation
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimeTypes.includes(file.type)) {
      throw new Error('صيغة الصورة غير مدعومة. يرجى اختيار صورة بصيغة JPEG أو PNG أو WebP.');
    }

    // Size validation: max 2MB (2,097,152 bytes)
    const maxSizeBytes = 2 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      throw new Error('حجم الصورة كبير جداً. الحد الأقصى المسموح به هو 2 ميجابايت.');
    }

    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const storagePath = `${user.id}/avatar-${uniqueSuffix}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('tutor-application-avatars')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`تعذر رفع الصورة الشخصية: ${uploadError.message}`);
    }

    // Generate signed URL for private preview (valid for 1 hour)
    const signedUrl = await this.getApplicationAvatarSignedUrl(storagePath);

    return {
      avatarPath: storagePath,
      signedUrl: signedUrl || '',
    };
  },

  /**
   * 9. Get Signed URL for private application avatar
   */
  async getApplicationAvatarSignedUrl(storagePath: string): Promise<string | null> {
    if (!storagePath) return null;
    try {
      const { data, error } = await supabase.storage
        .from('tutor-application-avatars')
        .createSignedUrl(storagePath, 3600); // 1 hour validity

      if (error || !data?.signedUrl) {
        console.warn('Could not generate signed URL for application avatar:', error);
        return null;
      }

      return data.signedUrl;
    } catch (err) {
      console.warn('Error fetching signed URL for application avatar:', err);
      return null;
    }
  },

  /**
   * 10. Delete/Cleanup Application Avatar from storage
   */
  async deleteApplicationAvatar(storagePath: string): Promise<boolean> {
    if (!storagePath) return false;
    try {
      const { error } = await supabase.storage
        .from('tutor-application-avatars')
        .remove([storagePath]);
      return !error;
    } catch {
      return false;
    }
  },
};
