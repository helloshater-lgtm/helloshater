import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { DirectoryData, normalizeDirectory } from '../utils/tutorDirectory';
import { isMissingRpcError } from './parentDashboardService';

let testClient: SupabaseClient | null = null;
export const __setDirectorySupabaseForTests = (c: SupabaseClient | null) => {
  testClient = c;
};

export const TutorDirectoryService = {
  /** One call for the whole public directory. Returns null before migration 025. */
  async getDirectory(): Promise<DirectoryData | null> {
    const { data, error } = await (testClient || supabase).rpc('get_public_tutor_directory');
    if (error) {
      if (isMissingRpcError(error)) return null;
      throw new Error('تعذر تحميل المعلمين حاليًا. حاول تاني.');
    }
    return normalizeDirectory(data);
  },
};

export interface TutorWithoutSlots {
  tutorId: string;
  name: string;
  honorific: string;
  whatsapp: string | null;
  lastSlotAt: string | null;
}

/** Admin: published tutors with no open trial slot (migration 026). null before it is applied. */
export async function getTutorsWithoutTrialSlots(): Promise<TutorWithoutSlots[] | null> {
  const { data, error } = await (testClient || supabase).rpc('admin_tutors_without_trial_slots');
  if (error) {
    if (isMissingRpcError(error)) return null;
    throw new Error('تعذر تحميل المعلمين اللي مالهمش مواعيد.');
  }
  return (Array.isArray(data) ? data : []).map((x: any) => ({
    tutorId: String(x.tutorId),
    name: String(x.name ?? ''),
    honorific: String(x.honorific ?? ''),
    whatsapp: x.whatsapp ? String(x.whatsapp) : null,
    lastSlotAt: x.lastSlotAt ? String(x.lastSlotAt) : null,
  }));
}
