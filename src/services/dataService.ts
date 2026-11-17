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
   * Search Tutors matching exact or simplified criteria from live Supabase database.
   * Returns ONLY published tutors (is_published = true).
   */
  async searchTutors(criteria: SearchCriteria, simulateError = false): Promise<Tutor[]> {
    if (simulateError) {
      throw new Error('حدث انقطاع مؤقت في الاتصال أثناء جلب المعلمين.');
    }
    return SupabaseDataService.searchByCriteria(criteria);
  },

  /**
   * Fetch curated published tutors who are profile-complete and have BOTH upcoming
   * 20-min trial slots AND upcoming paid private (1:1) slots available separately.
   */
  async getFeaturedReadyTutors(
    limit = 3
  ): Promise<{ tutors: Tutor[]; totalReadyCount: number }> {
    return SupabaseDataService.getFeaturedReadyTutors(limit);
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
   * Get available private 1:1 slots for a tutor
   */
  async getTutorPrivateSlots(tutorId: string) {
    return SupabaseDataService.getTutorPrivateSlots(tutorId);
  },

  /**
   * Get approved educational groups for a tutor
   */
  async getTutorGroups(tutorId: string) {
    return SupabaseDataService.getTutorGroups(tutorId);
  },

  /**
   * Test connection to Supabase
   */
  async testConnection() {
    return SupabaseDataService.testConnection();
  },
};
