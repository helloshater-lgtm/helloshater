import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  Stage,
  Grade,
  Subject,
  CurriculumOption,
  QuranAgeGroup,
  QuranLevel,
  Tutor,
  TutorOffering,
  TutorAvailableSlot,
} from '../types';

export interface SupabaseConnectionTestResult {
  success: boolean;
  message: string;
  stagesCount?: number;
  sampleStages?: { id: string; name: string }[];
  error?: string;
}

export interface DatabaseTutorReview {
  id: string;
  tutor_id: string;
  reviewer_name: string;
  student_grade_or_level?: string | null;
  rating: number;
  comment?: string | null;
  status: 'pending_review' | 'approved' | 'rejected';
  created_at: string;
  approved_at?: string | null;
}

export interface DatabaseSchoolCourseOption {
  id: string;
  grade_id: string;
  subject_id: string;
  curriculum_id: string;
  is_active: boolean;
  created_at: string;
}

/**
 * Service for querying live Supabase database for Shatir Classes
 * Built directly against migration 001_initial_schema.sql
 */
export const SupabaseDataService = {
  /**
   * 1. Test live connection by querying educational_stages
   */
  async testConnection(): Promise<SupabaseConnectionTestResult> {
    if (!isSupabaseConfigured()) {
      return {
        success: false,
        message: 'Supabase credentials are not configured in environment variables.',
        error: 'MISSING_ENV_VARS',
      };
    }

    try {
      const { data, error, status } = await supabase
        .from('educational_stages')
        .select('id, name, grades_desc, is_active')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) {
        return {
          success: false,
          message: `فشل استعلام قاعدة البيانات (رمز الحالة: ${status}): ${error.message}`,
          error: error.message,
        };
      }

      return {
        success: true,
        message: 'تم الاتصال بقاعدة بيانات Supabase وقراءة المراحل الدراسية بنجاح.',
        stagesCount: data?.length || 0,
        sampleStages: data?.map((s) => ({ id: s.id, name: s.name })) || [],
      };
    } catch (err: any) {
      return {
        success: false,
        message: `استثناء غير متوقع أثناء الاتصال: ${err?.message || err}`,
        error: String(err),
      };
    }
  },

  /**
   * 2. Taxonomy Read Functions
   */
  async getStages(): Promise<Stage[]> {
    const { data, error } = await supabase
      .from('educational_stages')
      .select('id, name, grades_desc, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) throw error;

    return (data || []).map((row) => ({
      id: row.id as any,
      name: row.name,
      gradesDesc: row.grades_desc,
      order: row.display_order,
    }));
  },

  async getGrades(stageId?: string): Promise<Grade[]> {
    let query = supabase
      .from('educational_grades')
      .select('id, stage_id, name, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (stageId) {
      query = query.eq('stage_id', stageId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []).map((row) => ({
      id: row.id,
      stageId: row.stage_id as any,
      name: row.name,
      order: row.display_order,
    }));
  },

  async getCurriculumTypes(): Promise<CurriculumOption[]> {
    const { data, error } = await supabase
      .from('curriculum_types')
      .select('id, name, description')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) throw error;

    return (data || []).map((row) => ({
      id: row.id as any,
      name: row.name,
      description: row.description,
    }));
  },

  async getSubjects(): Promise<Subject[]> {
    const { data, error } = await supabase
      .from('subjects')
      .select('id, name, english_name, category')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) throw error;

    return (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      englishName: row.english_name || undefined,
      category: row.category,
    }));
  },

  async getQuranAgeGroups(): Promise<QuranAgeGroup[]> {
    const { data, error } = await supabase
      .from('quran_age_groups')
      .select('id, name, age_range')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) throw error;

    return (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      ageRange: row.age_range,
    }));
  },

  async getQuranLevels(): Promise<QuranLevel[]> {
    const { data, error } = await supabase
      .from('quran_levels')
      .select('id, name, description')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) throw error;

    return (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
    }));
  },

  /**
   * 3. School Course Options
   */
  async getSchoolCourseOptions(filters?: {
    gradeId?: string;
    subjectId?: string;
    curriculumId?: string;
  }): Promise<DatabaseSchoolCourseOption[]> {
    let query = supabase
      .from('school_course_options')
      .select('id, grade_id, subject_id, curriculum_id, is_active, created_at')
      .eq('is_active', true);

    if (filters?.gradeId) query = query.eq('grade_id', filters.gradeId);
    if (filters?.subjectId) query = query.eq('subject_id', filters.subjectId);
    if (filters?.curriculumId) query = query.eq('curriculum_id', filters.curriculumId);

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as DatabaseSchoolCourseOption[];
  },

  /**
   * 4. Published Tutors
   */
  async getPublishedTutors(): Promise<Tutor[]> {
    const { data: tutorsData, error: tutorsError } = await supabase
      .from('tutors')
      .select('*')
      .eq('is_published', true)
      .order('rating', { ascending: false, nullsFirst: false });

    if (tutorsError) throw tutorsError;
    if (!tutorsData || tutorsData.length === 0) return [];

    const tutorIds = tutorsData.map((t) => t.id);

    // Fetch related sub-records in parallel
    const [pillarsRes, qualRes, trialRes, summaryRes, schoolOffRes, quranOffRes] =
      await Promise.all([
        supabase
          .from('tutor_methodology_pillars')
          .select('*')
          .in('tutor_id', tutorIds)
          .order('display_order', { ascending: true }),
        supabase
          .from('tutor_qualifications')
          .select('*')
          .in('tutor_id', tutorIds)
          .order('display_order', { ascending: true }),
        supabase
          .from('tutor_trial_steps')
          .select('*')
          .in('tutor_id', tutorIds)
          .order('step_number', { ascending: true }),
        supabase
          .from('tutor_subjects_taught_summary')
          .select('*')
          .in('tutor_id', tutorIds)
          .order('display_order', { ascending: true }),
        supabase
          .from('v_tutor_school_offerings')
          .select('*')
          .in('tutor_id', tutorIds)
          .eq('course_is_active', true),
        supabase
          .from('tutor_quran_offerings')
          .select('*')
          .in('tutor_id', tutorIds),
      ]);

    return tutorsData.map((row) =>
      this.mapDatabaseRowToTutor(
        row,
        pillarsRes.data?.filter((p) => p.tutor_id === row.id) || [],
        qualRes.data?.filter((q) => q.tutor_id === row.id) || [],
        trialRes.data?.filter((t) => t.tutor_id === row.id) || [],
        summaryRes.data?.filter((s) => s.tutor_id === row.id) || [],
        schoolOffRes.data?.filter((o) => o.tutor_id === row.id) || [],
        quranOffRes.data?.filter((q) => q.tutor_id === row.id) || []
      )
    );
  },

  async getTutorById(id: string): Promise<Tutor | null> {
    const { data: row, error } = await supabase
      .from('tutors')
      .select('*')
      .eq('id', id)
      .eq('is_published', true)
      .maybeSingle();

    if (error) throw error;
    if (!row) return null;

    const [pillarsRes, qualRes, trialRes, summaryRes, schoolOffRes, quranOffRes] =
      await Promise.all([
        supabase
          .from('tutor_methodology_pillars')
          .select('*')
          .eq('tutor_id', id)
          .order('display_order', { ascending: true }),
        supabase
          .from('tutor_qualifications')
          .select('*')
          .eq('tutor_id', id)
          .order('display_order', { ascending: true }),
        supabase
          .from('tutor_trial_steps')
          .select('*')
          .eq('tutor_id', id)
          .order('step_number', { ascending: true }),
        supabase
          .from('tutor_subjects_taught_summary')
          .select('*')
          .eq('tutor_id', id)
          .order('display_order', { ascending: true }),
        supabase
          .from('v_tutor_school_offerings')
          .select('*')
          .eq('tutor_id', id)
          .eq('course_is_active', true),
        supabase
          .from('tutor_quran_offerings')
          .select('*')
          .eq('tutor_id', id),
      ]);

    return this.mapDatabaseRowToTutor(
      row,
      pillarsRes.data || [],
      qualRes.data || [],
      trialRes.data || [],
      summaryRes.data || [],
      schoolOffRes.data || [],
      quranOffRes.data || []
    );
  },

  /**
   * 5. Approved Tutor Reviews
   */
  async getApprovedReviews(tutorId: string): Promise<DatabaseTutorReview[]> {
    const { data, error } = await supabase
      .from('tutor_reviews')
      .select('id, tutor_id, reviewer_name, student_grade_or_level, rating, comment, status, created_at, approved_at')
      .eq('tutor_id', tutorId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as DatabaseTutorReview[];
  },

  /**
   * 6. Search Tutors by School Course (Grade + Subject + Curriculum)
   * Matches exact tuple through school_course_options and tutor_school_offerings
   */
  async searchSchoolTutors(params: {
    gradeId: string;
    subjectId: string;
    curriculumId: string;
  }): Promise<Tutor[]> {
    const { gradeId, subjectId, curriculumId } = params;
    if (!gradeId || !subjectId || !curriculumId) return [];

    // Step A: Find matching active course option
    const { data: courseOption, error: courseError } = await supabase
      .from('school_course_options')
      .select('id')
      .eq('grade_id', gradeId)
      .eq('subject_id', subjectId)
      .eq('curriculum_id', curriculumId)
      .eq('is_active', true)
      .maybeSingle();

    if (courseError) throw courseError;
    if (!courseOption) return [];

    // Step B: Find tutors offering this course option
    const { data: offerings, error: offeringError } = await supabase
      .from('tutor_school_offerings')
      .select('tutor_id')
      .eq('course_option_id', courseOption.id);

    if (offeringError) throw offeringError;
    if (!offerings || offerings.length === 0) return [];

    const tutorIds = [...new Set(offerings.map((o) => o.tutor_id))];

    // Step C: Fetch published tutors matching IDs
    const publishedTutors = await this.getPublishedTutors();
    return publishedTutors.filter((t) => tutorIds.includes(t.id));
  },

  /**
   * 7. Search Tutors by Quran & Foundation Track (Age Group + Level)
   * Matches through tutor_quran_offerings
   */
  async searchQuranTutors(params: {
    ageGroupId: string;
    levelId: string;
  }): Promise<Tutor[]> {
    const { ageGroupId, levelId } = params;
    if (!ageGroupId || !levelId) return [];

    const { data: offerings, error } = await supabase
      .from('tutor_quran_offerings')
      .select('tutor_id')
      .eq('age_group_id', ageGroupId)
      .eq('level_id', levelId);

    if (error) throw error;
    if (!offerings || offerings.length === 0) return [];

    const tutorIds = [...new Set(offerings.map((o) => o.tutor_id))];

    const publishedTutors = await this.getPublishedTutors();
    return publishedTutors.filter((t) => tutorIds.includes(t.id));
  },

  /**
   * Helper: Map relational rows to the domain Tutor interface
   */
  mapDatabaseRowToTutor(
    row: any,
    pillars: any[],
    qualifications: any[],
    trialSteps: any[],
    summaries: any[],
    schoolOfferings: any[],
    quranOfferings: any[]
  ): Tutor {
    const offerings: TutorOffering[] = [
      ...schoolOfferings.map((so) => ({
        track: 'school' as const,
        stageId: so.stage_id,
        gradeId: so.grade_id,
        subjectId: so.subject_id,
        curriculumType: so.curriculum_id,
      })),
      ...quranOfferings.map((qo) => ({
        track: 'quran' as const,
        ageGroupId: qo.age_group_id,
        levelId: qo.level_id,
      })),
    ];

    return {
      id: row.id,
      name: row.name,
      honorific: row.honorific || 'أ.',
      headline: row.headline || '',
      avatarUrl: row.avatar_url || '',
      verifiedCredentials: Boolean(row.verified_credentials),
      yearsOfExperience: row.years_of_experience || 0,
      experienceBadgeText: row.experience_badge_text || `خبرة ${row.years_of_experience || 0} سنوات`,
      curriculumTags: Array.isArray(row.curriculum_tags) ? row.curriculum_tags : [],
      hourlyRateMin: row.hourly_rate_min || 0,
      hourlyRateMax: row.hourly_rate_max || 0,
      currency: row.currency || 'ج.م',
      sessionDurationMinutes: row.session_duration_minutes || 50,
      trialDurationMinutes: row.trial_duration_minutes || 20,
      rating: row.rating !== null && row.rating !== undefined ? Number(row.rating) : null,
      reviewsCount: row.reviews_count || 0,
      totalStudentsTaught: row.total_students_taught || 0,
      videoPreview: row.video_available
        ? {
            available: true,
            title: row.video_title || '',
            durationText: row.video_duration_text || '',
            description: row.video_description || '',
            thumbnailUrl: row.video_thumbnail_url || undefined,
          }
        : undefined,
      helpChildQuote: row.help_child_quote || '',
      helpChildSummary: row.help_child_summary || '',
      methodologyPillars: pillars.map((p) => ({
        title: p.title,
        description: p.description,
        iconName: p.icon_name || 'smile',
      })),
      targetStudentCases: Array.isArray(row.target_student_cases) ? row.target_student_cases : [],
      subjectsTaughtSummary: summaries.map((s) => ({
        title: s.title,
        gradesRange: s.grades_range,
        curriculumNote: s.curriculum_note || '',
        icon: (s.icon as any) || 'book',
      })),
      whatHappensInTrial: trialSteps.map((ts) => ({
        stepNumber: ts.step_number,
        title: ts.title,
        description: ts.description,
      })),
      qualifications: qualifications.map((q) => ({
        title: q.title,
        institution: q.institution,
        verified: Boolean(q.verified),
        notes: q.notes || undefined,
      })),
      offerings,
    };
  },

  /**
   * 8. Tutor Available Slots
   * Queries public available slots via secure get_public_tutor_slots RPC (excluding private admin notes)
   */
  async getTutorAvailableSlots(tutorId: string): Promise<TutorAvailableSlot[]> {
    if (!tutorId) return [];

    try {
      // 1. Try secure public RPC first
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_public_tutor_slots', {
        p_tutor_id: tutorId,
      });

      if (!rpcError && rpcData) {
        return (rpcData as any[]).map((row) => ({
          id: row.id,
          tutorId: row.tutor_id,
          slotDate: row.slot_date,
          startTime: row.start_time,
          endTime: row.end_time,
          timezone: row.timezone || 'Africa/Cairo',
          isAvailable: row.is_available,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));
      }

      // 2. Fallback to direct select if RPC not yet deployed
      const { data, error } = await supabase
        .from('tutor_available_slots')
        .select('id, tutor_id, slot_date, start_time, end_time, timezone, is_available, created_at, updated_at')
        .eq('tutor_id', tutorId)
        .eq('is_available', true)
        .order('slot_date', { ascending: true })
        .order('start_time', { ascending: true });

      if (error) {
        console.error('Error fetching tutor available slots:', error);
        return [];
      }

      return (data || []).map((row) => ({
        id: row.id,
        tutorId: row.tutor_id,
        slotDate: row.slot_date,
        startTime: row.start_time,
        endTime: row.end_time,
        timezone: row.timezone || 'Africa/Cairo',
        isAvailable: row.is_available,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (err) {
      console.error('Unexpected error fetching tutor slots:', err);
      return [];
    }
  },
};
