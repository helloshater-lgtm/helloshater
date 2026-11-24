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
