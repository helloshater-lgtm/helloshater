import { supabase } from '../lib/supabase';
import {
  TutorApplicationFormData,
  TutorApplicationRecord,
  TutorApplicationStatus,
} from '../types';
import { TutorPortalService } from './tutorPortalService';
import {
  resolveExplicitSubjectId,
  ENGLISH_TAUGHT_SUBJECT_IDS,
} from '../utils/formatters';

export const TUTOR_POLICY_VERSION = 'v1.0';
export const TUTOR_STATE_CHANGED_EVENT = 'shatir:tutor-state-changed';

// Track active submission per user to block delayed/concurrent draft saves on the client side
// in addition to the authoritative server-side transaction lock in public.tutor_save_application.
const activeSubmitUsers = new Set<string>();
const lockedSubmittedUsers = new Set<string>();

export type TutorAccountNavStatus =
  | 'loading'
  | 'unauthenticated'
  | 'no_application'
  | 'unapproved_application'
  | 'approved_tutor';

export function notifyTutorStateChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(TUTOR_STATE_CHANGED_EVENT));
  }
}

export const TutorApplicationService = {
  /**
   * 1. Get current logged-in Auth User
   */
  async getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  /**
   * Resolve the exact tutor account & application status for Header/Navigation & Eligibility
   * - 'unauthenticated': غير مسجل («دخول المعلمين»)
   * - 'no_application': مسجل دون طلب («استكمال التقديم»)
   * - 'unapproved_application': لديه طلب غير معتمد («متابعة طلبي»)
   * - 'approved_tutor': مرتبط بملف معلم معتمد («لوحة المعلم»)
   */
  async resolveAccountNavState(): Promise<{
    status: Exclude<TutorAccountNavStatus, 'loading'>;
    user: any | null;
    application: TutorApplicationRecord | null;
    tutorId: string | null;
  }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return {
        status: 'unauthenticated',
        user: null,
        application: null,
        tutorId: null,
      };
    }

    const [portalOutcome, appOutcome] = await Promise.allSettled([
      TutorPortalService.getMyContext(),
      this.getMyApplication(),
    ]);

    const portalCtx = portalOutcome.status === 'fulfilled' ? portalOutcome.value : null;
    const app = appOutcome.status === 'fulfilled' ? appOutcome.value : null;

    if (portalCtx?.tutor?.id) {
      return {
        status: 'approved_tutor',
        user,
        application: app,
        tutorId: portalCtx.tutor.id,
      };
    }

    if (app && app.status !== 'draft') {
      return {
        status: 'unapproved_application',
        user,
        application: app,
        tutorId: null,
      };
    }

    return {
      status: 'no_application',
      user,
      application: app,
      tutorId: null,
    };
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

    notifyTutorStateChanged();
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

    notifyTutorStateChanged();
    return data.user;
  },

  /**
   * 4. Teacher Sign Out
   */
  async signOut() {
    await supabase.auth.signOut();
    notifyTutorStateChanged();
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
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('Error fetching tutor application:', error);
      throw new Error(`تعذر تحميل بيانات طلب الانضمام: ${error.message}`);
    }

    if (!data) return null;

    return this.mapDatabaseRowToRecord(data);
  },

  /**
   * 7. Save Application (Draft or Final Submission)
   * Strictly uses secure RPC `tutor_save_application` to enforce auth.uid(),
   * transaction-level locking, and reference specialization validation.
   * No direct table writes are used as fallback.
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

    const userId = String(user.id);

    // Block delayed draft saves if final submission is already in flight or completed
    if (!isSubmit && (activeSubmitUsers.has(userId) || lockedSubmittedUsers.has(userId))) {
      throw new Error('الطلب مُرسل للمراجعة بالفعل ولا يمكن إعادته إلى مسودة أو تعديل بياناته أثناء المراجعة.');
    }

    if (isSubmit) {
      activeSubmitUsers.add(userId);
    }

    try {
      const rawSpecs = Array.isArray(formData.schoolSpecializations)
        ? formData.schoolSpecializations
        : [];

      const normalizedSpecs = rawSpecs.map((spec) => {
        if (!spec || typeof spec !== 'object') return spec;
        const rawSubjKey = String(spec.subjectId ?? '').trim();
        const rawLang = String(spec.teachingLanguage ?? '').trim();
        const inferredLang =
          rawLang === 'english' || rawLang === 'arabic'
            ? rawLang
            : ENGLISH_TAUGHT_SUBJECT_IDS.has(rawSubjKey)
            ? 'english'
            : ARABIC_TAUGHT_SUBJECT_IDS.has(rawSubjKey)
            ? 'arabic'
            : rawLang;
        // Explicit subject resolution: maps 'math_ar' -> 'math' ONLY when Arabic,
        // and NEVER merges 'math_en' (Math) into 'math' (الرياضيات), while preserving empty/unmatched values as-is
        const explicitSubjectId = rawSubjKey
          ? resolveExplicitSubjectId(rawSubjKey, inferredLang)
          : '';

        return {
          ...spec,
          subjectId: explicitSubjectId,
          teachingLanguage: inferredLang,
        };
      });

      const explicitQuranOfferings =
        Array.isArray(formData.quranOfferings) && formData.quranOfferings.length > 0
          ? formData.quranOfferings
          : (formData.quranAgeGroups || []).flatMap((ageGroupId) =>
              (formData.quranLevels || []).map((levelId) => ({ ageGroupId, levelId }))
            );

      const normalizeDigits = (val: unknown): string => {
        const arabicIndic = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
        let str = String(val ?? '').trim();
        for (let i = 0; i < 10; i++) {
          str = str.replaceAll(arabicIndic[i], String(i));
        }
        return str;
      };

      const hasRateKey =
        Object.prototype.hasOwnProperty.call(formData, 'suggestedHourlyRate') &&
        formData.suggestedHourlyRate !== undefined;
      let validatedRate: number | null | undefined = undefined;
      if (hasRateKey) {
        const rawRate = formData.suggestedHourlyRate as unknown;
        const rateStr = normalizeDigits(rawRate);
        if (rawRate === null || rateStr === '') {
          if (isSubmit) {
            throw new Error('قيمة سعر الحصة المقترح مطلوبة ولا يمكن أن تكون فارغة عند إرسال الطلب للمراجعة.');
          }
          validatedRate = null;
        } else {
          if (!/^-?[0-9]+(\.[0-9]+)?$/.test(rateStr)) {
            throw new Error('قيمة سعر الحصة المقترح غير صالحة: يجب إدخال رقم صحيح أكبر من الصفر.');
          }
          const parsedRate = Number(rateStr);
          if (!Number.isFinite(parsedRate) || parsedRate <= 0 || parsedRate > 100000) {
            throw new Error('قيمة سعر الحصة المقترح غير صالحة: يجب أن تكون أكبر من 0 وأقل من أو تساوي 100000.');
          }
          validatedRate = Math.round(parsedRate);
        }
      } else if (isSubmit) {
        throw new Error('قيمة سعر الحصة المقترح مطلوبة ولا يمكن إغفالها عند إرسال الطلب للمراجعة.');
      }

      const hasDurationKey =
        Object.prototype.hasOwnProperty.call(formData, 'sessionDurationMinutes') &&
        formData.sessionDurationMinutes !== undefined;
      let validatedDuration: number | null | undefined = undefined;
      if (hasDurationKey) {
        const rawDuration = formData.sessionDurationMinutes as unknown;
        const durationStr = normalizeDigits(rawDuration);
        if (rawDuration === null || durationStr === '') {
          if (isSubmit) {
            throw new Error('مدة الحصة بالدقائق مطلوبة ويجب أن تكون بين 15 و 180 دقيقة.');
          }
          validatedDuration = null;
        } else {
          if (!/^-?[0-9]+$/.test(durationStr)) {
            throw new Error('مدة الحصة بالدقائق غير صالحة: يجب إدخال رقم صحيح بين 15 و 180 دقيقة.');
          }
          const parsedDuration = parseInt(durationStr, 10);
          if (!Number.isFinite(parsedDuration) || parsedDuration < 15 || parsedDuration > 180) {
            throw new Error('مدة الحصة بالدقائق غير صالحة: يجب أن تكون بين 15 و 180 دقيقة.');
          }
          validatedDuration = parsedDuration;
        }
      }

      const payload: any = {
        fullName: (formData.fullName ?? '').trim(),
        countryCode: formData.countryCode,
        phone: (formData.phone ?? '').trim(),
        whatsappNumber: (formData.phone ?? '').trim(),
        email: user.email || formData.fullName,
        track: formData.track,
        schoolSpecializations: normalizedSpecs,
        schoolCourseOptionIds: formData.schoolCourseOptionIds || [],
        quranOfferings: explicitQuranOfferings,
        quranAgeGroups: formData.quranAgeGroups || [],
        quranLevels: formData.quranLevels || [],
        quranNotes: formData.quranNotes?.trim() || null,
        academicDegree: (formData.academicDegree ?? '').trim(),
        institution: formData.institution?.trim() || null,
        experienceYears: formData.experienceYears,
        hasOnlineExperience: formData.hasOnlineExperience || '',
        onlineExperienceDetails: (formData.onlineExperienceDetails ?? '').trim() || null,
        bioAndMethodology: (formData.bioAndMethodology ?? '').trim(),
        portfolioUrl: (formData.portfolioUrl ?? '').trim() || null,
        avatarPath: formData.avatarPath || null,
        removeAvatar: removeAvatar,
        currency: formData.currency || 'ج.م',
        availableDays: formData.availableDays || [],
        preferredTimes: formData.preferredTimes || [],
        timezone: formData.timezone || 'Africa/Cairo',
        termsAccepted: Boolean(formData.termsAccepted),
        termsPolicyVersion: formData.termsPolicyVersion || TUTOR_POLICY_VERSION,
      };

      if (hasRateKey) {
        payload.suggestedHourlyRate = validatedRate;
      }
      if (hasDurationKey) {
        payload.sessionDurationMinutes = validatedDuration;
      }

      // Invoke secure RPC exclusively (no direct table fallback)
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'tutor_save_application',
        {
          p_payload: payload,
          p_is_submit: isSubmit,
        }
      );

      if (rpcError) {
        throw new Error(rpcError.message || 'تعذر حفظ بيانات الطلب في الخادم.');
      }

      const rawRow = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (!rawRow || !rawRow.id) {
        throw new Error('لم تُرجع قاعدة البيانات معرف الطلب بعد الحفظ. يرجى المحاولة مرة أخرى.');
      }

      const record = this.mapDatabaseRowToRecord(rawRow);

      // Strict verification for final submission
      if (isSubmit) {
        if (record.status !== 'submitted') {
          throw new Error(
            `لم يتم تأكيد انتقال حالة الطلب إلى «مُرسل للمراجعة» (الحالة المستلمة: ${record.status}). يرجى التحقق من البيانات والمحاولة مرة أخرى.`
          );
        }
        if (!record.referenceCode) {
          throw new Error('لم يتم إصدار رقم مرجع للطلب من الخادم. يرجى المحاولة مرة أخرى.');
        }
        lockedSubmittedUsers.add(userId);
      } else if (record.status === 'draft' || record.status === 'needs_info') {
        lockedSubmittedUsers.delete(userId);
      }

      notifyTutorStateChanged();
      return record;
    } finally {
      if (isSubmit) {
        activeSubmitUsers.delete(userId);
      }
    }
  },

  /**
   * Helper: map DB row to frontend record
   */
  mapDatabaseRowToRecord(row: any): TutorApplicationRecord {
    // Normalize status without coercing unknown statuses to 'submitted'
    let status: TutorApplicationStatus = 'draft';
    if (['draft', 'submitted', 'needs_info', 'approved', 'rejected'].includes(row.status)) {
      status = row.status as TutorApplicationStatus;
    } else if (row.status === 'pending_review' || row.status === 'interview_scheduled') {
      status = 'submitted';
    } else if (row.status) {
      status = row.status as TutorApplicationStatus;
    }

    if (row.user_id) {
      if (status === 'submitted' || status === 'approved' || status === 'rejected') {
        lockedSubmittedUsers.add(String(row.user_id));
      } else {
        lockedSubmittedUsers.delete(String(row.user_id));
      }
    }

    // Preserve exact specialization selections (including incomplete or unmatched draft items) without coercing defaults
    const rawSpecs = Array.isArray(row.school_specializations) ? row.school_specializations : [];
    const mappedSpecs = rawSpecs.map((sp: any, idx: number) => {
      if (!sp || typeof sp !== 'object') return sp;
      const rawSubj = String(sp?.subjectId ?? '').trim();
      const rawLang = String(sp?.teachingLanguage ?? '').trim();
      const lang =
        rawLang === 'english' || rawLang === 'arabic'
          ? rawLang
          : ENGLISH_TAUGHT_SUBJECT_IDS.has(rawSubj)
          ? 'english'
          : ARABIC_TAUGHT_SUBJECT_IDS.has(rawSubj)
          ? 'arabic'
          : (rawLang || 'arabic');
      const resolvedSubj = rawSubj ? resolveExplicitSubjectId(rawSubj, lang) : '';

      return {
        ...sp,
        id: sp?.id || `spec_restored_${idx + 1}`,
        subjectId: resolvedSubj,
        teachingLanguage: lang as 'arabic' | 'english',
        curriculumType: sp?.curriculumType ?? sp?.curriculumId ?? '',
        stageId: sp?.stageId ?? '',
        gradeIds: Array.isArray(sp?.gradeIds) ? sp.gradeIds : [],
      };
    });

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
      schoolSpecializations: mappedSpecs,
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
      suggestedHourlyRate:
        row.suggested_hourly_rate !== null && row.suggested_hourly_rate !== undefined
          ? String(row.suggested_hourly_rate)
          : '120',
      suggestedHourlyRateNum: Number(row.suggested_hourly_rate ?? 120),
      currency: row.currency || 'ج.م',
      sessionDurationMinutes: Number(row.session_duration_minutes ?? 50),
      availableDays: row.available_days || [],
      preferredTimes: row.preferred_times || [],
      timezone: row.timezone || 'Africa/Cairo',
      interviewAvailability: '',
      termsAccepted: Boolean(row.terms_accepted),
      termsPolicyVersion: row.policy_version || 'v1.0',
      policyVersion: row.policy_version || 'v1.0',
      policyAcceptedAt: row.policy_accepted_at || null,
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
