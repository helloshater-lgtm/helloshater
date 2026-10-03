/**
 * Data Service for Shatir Classes (شاطر كلاسيز)
 * Powered exclusively by Supabase with live RLS and database queries.
 * Mock tutors and fake ratings have been removed.
 */

import {
  Stage,
  Grade,
  Subject,
  CurriculumOption,
  QuranAgeGroup,
  QuranLevel,
  Tutor,
  SearchCriteria,
  TutorAvailableSlot,
} from '../types';
import { SupabaseDataService, DatabaseSchoolCourseOption } from './supabaseDataService';

export const DataService = {
  // Taxonomy queries from Supabase
  async getStages(): Promise<Stage[]> {
    return SupabaseDataService.getStages();
  },

  async getGradesByStage(stageId: string): Promise<Grade[]> {
    return SupabaseDataService.getGrades(stageId);
  },

  async getAllGrades(): Promise<Grade[]> {
    return SupabaseDataService.getGrades();
  },

  async getCurriculumOptions(): Promise<CurriculumOption[]> {
    return SupabaseDataService.getCurriculumTypes();
  },

  async getSubjects(): Promise<Subject[]> {
    return SupabaseDataService.getSubjects();
  },

  async getQuranAgeGroups(): Promise<QuranAgeGroup[]> {
    return SupabaseDataService.getQuranAgeGroups();
  },

  async getQuranLevels(): Promise<QuranLevel[]> {
    return SupabaseDataService.getQuranLevels();
  },

  async getSchoolCourseOptions(filters?: {
    gradeId?: string;
    subjectId?: string;
    curriculumId?: string;
  }): Promise<DatabaseSchoolCourseOption[]> {
    return SupabaseDataService.getSchoolCourseOptions(filters);
  },

  /**
   * Search Tutors matching exact criteria from live Supabase database.
   * School track matches (grade_id + subject_id + curriculum_id) via school_course_options and tutor_school_offerings.
   * Quran track matches (age_group_id + level_id) via tutor_quran_offerings.
   * Returns ONLY published tutors (is_published = true).
   */
  async searchTutors(criteria: SearchCriteria, simulateError = false): Promise<Tutor[]> {
    if (simulateError) {
      throw new Error('حدث انقطاع مؤقت في الاتصال أثناء جلب المعلمين.');
    }

    if (criteria.track === 'school') {
      const { gradeId, subjectId, curriculumType } = criteria;
      if (!gradeId || !subjectId || !curriculumType) {
        return [];
      }
      return SupabaseDataService.searchSchoolTutors({
        gradeId,
        subjectId,
        curriculumId: curriculumType,
      });
    } else {
      const { ageGroupId, levelId } = criteria;
      if (!ageGroupId || !levelId) {
        return [];
      }
      return SupabaseDataService.searchQuranTutors({
        ageGroupId,
        levelId,
      });
    }
  },

  /**
   * Get single tutor by ID from Supabase (only if published)
   */
  async getTutorById(id: string): Promise<Tutor | null> {
    return SupabaseDataService.getTutorById(id);
  },

  /**
   * Get available slots for a tutor
   */
  async getTutorAvailableSlots(tutorId: string): Promise<TutorAvailableSlot[]> {
    return SupabaseDataService.getTutorAvailableSlots(tutorId);
  },

  /**
   * Test connection to Supabase
   */
  async testConnection() {
    return SupabaseDataService.testConnection();
  },
};
