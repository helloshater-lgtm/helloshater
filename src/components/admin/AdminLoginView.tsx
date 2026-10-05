import React, { useState } from 'react';
import { AdminAuthService } from '../../services/adminAuthService';
import { AdminUser } from '../../types';
import { Lock, Mail, ArrowRight, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';

interface AdminLoginViewProps {
  onLoginSuccess: (admin: AdminUser) => void;
  onNavigateHome: () => void;
}

export const AdminLoginView: React.FC<AdminLoginViewProps> = ({
  onLoginSuccess,
  onNavigateHome,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMessage('يرجى إدخال البريد الإلكتروني وكلمة المرور.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const result = await AdminAuthService.signIn(email, password);
    setIsLoading(false);

    if (result.success && result.admin) {
      onLoginSuccess(result.admin);
    } else {
      setErrorMessage(result.error || 'فشل تسجيل الدخول كمسؤول.');
    }
  };

  return (
    <div className="min-h-[80vh] flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-md bg-white border border-[#E2E8F0] shadow-sm rounded-2xl p-6 sm:p-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-[#F0F6FD] text-[#0D4E8B] mx-auto flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="font-['Cairo'] text-2xl font-bold text-[#1F2A44]">
            لوحة إدارة شاطر كلاسيز
          </h1>
          <p className="text-xs sm:text-sm text-[#64748B]">
            تسجيل دخول المشرفين المعتمدين لإدارة المعلمين والتخصصات والمواعيد
          </p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{errorMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#1F2A44]" htmlFor="admin-email">
              البريد الإلكتروني للإدارة
            </label>
            <div className="relative">
              <input
                id="admin-email"
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@shaterclasses.com"
                required
                className="w-full pl-3 pr-10 py-2.5 rounded-xl border border-[#CBD5E1] focus:border-[#0D4E8B] focus:ring-2 focus:ring-[#0D4E8B]/10 outline-none text-sm transition-all text-left"
              />
              <Mail className="w-4 h-4 text-[#94A3B8] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#1F2A44]" htmlFor="admin-password">
              كلمة المرور
            </label>
            <div className="relative">
              <input
                id="admin-password"
                type="password"
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full pl-3 pr-10 py-2.5 rounded-xl border border-[#CBD5E1] focus:border-[#0D4E8B] focus:ring-2 focus:ring-[#0D4E8B]/10 outline-none text-sm transition-all text-left"
              />
              <Lock className="w-4 h-4 text-[#94A3B8] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 px-4 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white font-['Cairo'] font-bold text-sm shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>جاري التحقق من الصلاحيات...</span>
              </>
            ) : (
              <span>تسجيل الدخول للإدارة</span>
            )}
          </button>
        </form>

        {/* Security Notice */}
        <div className="pt-2 border-t border-[#F1F5F9] text-center space-y-2">
          <p className="text-[11px] text-[#94A3B8] leading-relaxed">
            الوصول مقصور على الحسابات المسجلة في جدول الإدارة <span dir="ltr">public.admin_users</span>. التحقق من الصلاحيات يتم من جهة الخادم وقاعدة البيانات.
          </p>
          <button
            type="button"
            onClick={onNavigateHome}
            className="inline-flex items-center gap-1.5 text-xs text-[#64748B] hover:text-[#0D4E8B] font-bold cursor-pointer transition-colors"
          >
            <span>العودة إلى الموقع العام</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
