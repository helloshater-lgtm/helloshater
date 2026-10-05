import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { AdminUser } from '../types';

export interface AdminAuthResult {
  success: boolean;
  admin?: AdminUser;
  error?: string;
}

export const AdminAuthService = {
  /**
   * Check if Supabase connection is available
   */
  isConfigured(): boolean {
    return isSupabaseConfigured();
  },

  /**
   * Log in an administrator using email & password
   * Validates both Supabase Auth AND presence in the admin_users table
   */
  async signIn(email: string, password: string): Promise<AdminAuthResult> {
    if (!isSupabaseConfigured()) {
      return {
        success: false,
        error: 'إعدادات الاتصال بقاعدة بيانات Supabase غير مكتملة في متغيرات البيئة.',
      };
    }

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError || !authData.user) {
        let msg = authError?.message || 'فشل تسجيل الدخول';
        if (msg.includes('Invalid login credentials')) {
          msg = 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
        } else if (msg.includes('Email not confirmed')) {
          msg = 'يرجى تأكيد البريد الإلكتروني أولاً.';
        }
        return { success: false, error: msg };
      }

      // Verify that this user ID exists in the admin_users table and is active
      const { data: adminRecord, error: adminQueryError } = await supabase
        .from('admin_users')
        .select('user_id, email, role, is_active, created_at')
        .eq('user_id', authData.user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (adminQueryError || !adminRecord) {
        // Immediately sign out to prevent session leakage
        await supabase.auth.signOut();
        return {
          success: false,
          error:
            'عذراً، هذا الحساب غير مسجل كمسؤول معتمد في منصة شاطر (public.admin_users). لا تتوفر صلاحيات إدارية.',
        };
      }

      const adminUser: AdminUser = {
        userId: adminRecord.user_id,
        email: adminRecord.email,
        role: adminRecord.role,
        isActive: adminRecord.is_active,
        createdAt: adminRecord.created_at,
      };

      return {
        success: true,
        admin: adminUser,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'حدث خطأ غير متوقع أثناء تسجيل الدخول.',
      };
    }
  },

  /**
   * Sign out current admin
   */
  async signOut(): Promise<void> {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
  },

  /**
   * Retrieve currently authenticated admin profile
   */
  async getCurrentAdmin(): Promise<AdminUser | null> {
    if (!isSupabaseConfigured()) return null;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return null;

      const { data: adminRecord, error } = await supabase
        .from('admin_users')
        .select('user_id, email, role, is_active, created_at')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle();

      if (error || !adminRecord) {
        return null;
      }

      return {
        userId: adminRecord.user_id,
        email: adminRecord.email,
        role: adminRecord.role,
        isActive: adminRecord.is_active,
        createdAt: adminRecord.created_at,
      };
    } catch {
      return null;
    }
  },

  /**
   * Subscribe to auth changes
   */
  onAuthStateChange(callback: (admin: AdminUser | null) => void): () => void {
    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) {
        callback(null);
        return;
      }

      const admin = await AdminAuthService.getCurrentAdmin();
      callback(admin);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  },
};
