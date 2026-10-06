import React, { useState } from 'react';
import { TutorApplicationService } from '../../services/tutorApplicationService';
import {
  X,
  Mail,
  Lock,
  User,
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  GraduationCap,
} from 'lucide-react';

interface TutorAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: any) => void;
  initialMode?: 'signin' | 'signup';
}

export const TutorAuthModal: React.FC<TutorAuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialMode = 'signup',
}) => {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('يرجى إدخال بريد إلكتروني صحيح.');
      return;
    }

    if (mode === 'forgot') {
      setIsLoading(true);
      try {
        await TutorApplicationService.resetPassword(email);
        setSuccessMessage('تم إرسال رابط استعادة كلمة المرور إلى بريدك الإلكتروني بنجاح.');
      } catch (err: any) {
        setErrorMessage(err?.message || 'تعذر إرسال رابط استعادة كلمة المرور.');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (!password || password.length < 6) {
      setErrorMessage('كلمة المرور يجب أن تكون ٦ خانات على الأقل.');
      return;
    }

    if (mode === 'signup') {
      if (!fullName.trim() || fullName.trim().length < 3) {
        setErrorMessage('يرجى كتابة اسمك الكامل (ثلاثي على الأقل).');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage('كلمتا المرور غير متطابقتين.');
        return;
      }
    }

    setIsLoading(true);

    try {
      if (mode === 'signup') {
        const user = await TutorApplicationService.signUp(email, password, fullName);
        setSuccessMessage('تم إنشاء حساب المعلم بنجاح! جاري تحويلك لمتابعة الطلب...');
        setTimeout(() => {
          onSuccess(user);
          onClose();
        }, 1000);
      } else {
        const user = await TutorApplicationService.signIn(email, password);
        setSuccessMessage('تم تسجيل الدخول بنجاح!');
        setTimeout(() => {
          onSuccess(user);
          onClose();
        }, 600);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'حدث خطأ أثناء المصادقة.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in" dir="rtl">
      <div className="bg-white w-full max-w-md rounded-3xl border border-[#E2E8F0] shadow-xl overflow-hidden relative">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 left-4 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          aria-label="إغلاق"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="p-6 pb-4 text-center border-b border-[#F1F5F9] bg-[#F8F9FC]">
          <div className="w-12 h-12 rounded-2xl bg-[#0D4E8B]/10 text-[#0D4E8B] mx-auto flex items-center justify-center mb-3">
            <GraduationCap className="w-6 h-6" />
          </div>
          <h2 className="font-['Cairo'] text-lg sm:text-xl font-bold text-[#1F2A44]">
            {mode === 'signup'
              ? 'إنشاء حساب معلم جديد'
              : mode === 'signin'
              ? 'تسجيل دخول المعلم'
              : 'استعادة كلمة المرور'}
          </h2>
          <p className="text-xs text-[#64748B] mt-1">
            {mode === 'signup'
              ? 'أنشئ حسابك لتقديم طلب الانضمام ومتابعة حالة المراجعة'
              : mode === 'signin'
              ? 'سجّل الدخول لمتابعة طلبك وتعديل البيانات المطلوبة'
              : 'أدخل بريدك الإلكتروني المسجل وسنرسل لك رابط التعيين'}
          </p>

          {/* Tab Switcher */}
          {mode !== 'forgot' && (
            <div className="flex items-center gap-1 p-1 bg-slate-200/60 rounded-xl mt-4">
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold font-['Cairo'] transition-all cursor-pointer ${
                  mode === 'signup'
                    ? 'bg-white text-[#0D4E8B] shadow-xs'
                    : 'text-[#64748B] hover:text-[#1F2A44]'
                }`}
              >
                حساب جديد
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold font-['Cairo'] transition-all cursor-pointer ${
                  mode === 'signin'
                    ? 'bg-white text-[#0D4E8B] shadow-xs'
                    : 'text-[#64748B] hover:text-[#1F2A44]'
                }`}
              >
                تسجيل الدخول
              </button>
            </div>
          )}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Error Message */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Success Message */}
          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Full Name (Sign Up only) */}
          {mode === 'signup' && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#1F2A44] block">الاسم الكامل</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="محمد أحمد إبراهيم"
                  className="w-full pl-3 pr-9 py-2.5 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none"
                />
                <User className="w-4 h-4 text-[#94A3B8] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          )}

          {/* Email */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#1F2A44] block">البريد الإلكتروني</label>
            <div className="relative">
              <input
                type="email"
                required
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teacher@example.com"
                className="w-full pl-3 pr-9 py-2.5 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none text-left"
              />
              <Mail className="w-4 h-4 text-[#94A3B8] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Password */}
          {mode !== 'forgot' && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#1F2A44]">كلمة المرور</label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setErrorMessage(null);
                      setSuccessMessage(null);
                    }}
                    className="text-[11px] text-[#0D4E8B] hover:underline"
                  >
                    نسيت كلمة المرور؟
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type="password"
                  required
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-3 pr-9 py-2.5 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none text-left"
                />
                <Lock className="w-4 h-4 text-[#94A3B8] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          )}

          {/* Confirm Password (Sign Up only) */}
          {mode === 'signup' && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#1F2A44] block">تأكيد كلمة المرور</label>
              <div className="relative">
                <input
                  type="password"
                  required
                  dir="ltr"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-3 pr-9 py-2.5 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] outline-none text-left"
                />
                <Lock className="w-4 h-4 text-[#94A3B8] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          )}

          {/* Action Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs sm:text-sm font-bold font-['Cairo'] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2 shadow-xs"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : mode === 'signup' ? (
              <span>إنشاء حساب ومتابعة التقديم</span>
            ) : mode === 'signin' ? (
              <span>تسجيل الدخول</span>
            ) : (
              <span>إرسال رابط الاستعادة</span>
            )}
          </button>

          {/* Mode Switch Footers */}
          {mode === 'forgot' && (
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className="text-xs font-bold text-[#0D4E8B] hover:underline"
              >
                العودة لتسجيل الدخول
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
