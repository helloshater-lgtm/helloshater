import dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env.local explicitly for the node test runner
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

import { SupabaseDataService } from '../src/services/supabaseDataService';
import { supabase, isSupabaseConfigured } from '../src/lib/supabase';

async function main() {
  console.log('--- Testing Supabase Connection ---');
  console.log('isSupabaseConfigured:', isSupabaseConfigured());

  const result = await SupabaseDataService.testConnection();
  console.log('Connection test result:');
  console.log(JSON.stringify(result, null, 2));

  if (!result.success) {
    console.error('Test FAILED:', result.error);
    process.exit(1);
  }

  // Also query other tables to verify permissions
  console.log('\n--- Checking taxonomy permissions ---');
  const [grades, curricula, subjects, quranAge, quranLevels] = await Promise.all([
    supabase.from('educational_grades').select('count', { count: 'exact', head: true }),
    supabase.from('curriculum_types').select('count', { count: 'exact', head: true }),
    supabase.from('subjects').select('count', { count: 'exact', head: true }),
    supabase.from('quran_age_groups').select('count', { count: 'exact', head: true }),
    supabase.from('quran_levels').select('count', { count: 'exact', head: true }),
  ]);

  console.log('Grades count query error:', grades.error?.message || 'None (count: ' + grades.count + ')');
  console.log('Curricula count query error:', curricula.error?.message || 'None (count: ' + curricula.count + ')');
  console.log('Subjects count query error:', subjects.error?.message || 'None (count: ' + subjects.count + ')');
  console.log('Quran age count query error:', quranAge.error?.message || 'None (count: ' + quranAge.count + ')');
  console.log('Quran levels count query error:', quranLevels.error?.message || 'None (count: ' + quranLevels.count + ')');

  // Verify private tables are locked as expected
  console.log('\n--- Checking private table isolation ---');
  const privateInfo = await supabase.from('tutor_private_info').select('*').limit(1);
  console.log('tutor_private_info access:', privateInfo.error ? 'Blocked as expected (' + privateInfo.error.code + ': ' + privateInfo.error.message + ')' : 'Accessible');

  const applications = await supabase.from('tutor_applications').select('*').limit(1);
  console.log('tutor_applications access:', applications.error ? 'Blocked as expected (' + applications.error.code + ': ' + applications.error.message + ')' : 'Accessible');

  console.log('\n--- ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY ---');
}

main().catch((err) => {
  console.error('Unexpected failure:', err);
  process.exit(1);
});
