import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TutorApplicationService } from '../../services/tutorApplicationService';
import {
  X,
  Mail,
  Lock,
  User,
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

  const modalDialogRef = useRef<HTMLDivElement | null>(null);
  const fullNameInputRef = useRef<HTMLInputElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [isOpen, initialMode]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      if (mode === 'signup' && fullNameInputRef.current) {
        fullNameInputRef.current.focus();
      } else if (emailInputRef.current) {
        emailInputRef.current.focus();
      }
    }, 30);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = prevOverflow || '';
      if (previouslyFocusedRef.current && typeof previouslyFocusedRef.current.focus === 'function') {
        try {
          previouslyFocusedRef.current.focus();
        } catch {
          // ignore if element was unmounted
        }
      }
    };
  }, [isOpen]);

  // Focus first relevant input when switching tabs inside open modal
  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      if (mode === 'signup' && fullNameInputRef.current) {
        fullNameInputRef.current.focus();
      } else if (emailInputRef.current) {
        emailInputRef.current.focus();
      }
    }, 20);
    return () => window.clearTimeout(timer);
  }, [mode, isOpen]);

  // Keyboard trap (Tab / Shift+Tab) and Escape handler
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!isLoading) {
          e.preventDefault();
          onClose();
        }
        return;
      }

      if (e.key === 'Tab' && modalDialogRef.current) {
        const focusableElements = modalDialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const firstEl = focusableElements[0];
        const lastEl = focusableElements[focusableElements.length - 1];
        const activeEl = document.activeElement as HTMLElement | null;

        if (e.shiftKey) {
          if (!activeEl || activeEl === firstEl || !modalDialogRef.current.contains(activeEl)) {
            e.preventDefault();
            lastEl.focus();
          }
        } else {
          if (!activeEl || activeEl === lastEl || !modalDialogRef.current.contains(activeEl)) {
            e.preventDefault();
            firstEl.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose]);

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
        const result = await TutorApplicationService.signUp(email, password, fullName);
        if (result.requiresEmailConfirmation || !result.session) {
          setSuccessMessage('أرسلنا رسالة تأكيد إلى بريدك. أكّد البريد ثم سجّل الدخول لإكمال طلبك.');
          setMode('signin');
          return;
        }
        onClose();
        onSuccess(result.user);
      } else {
        const user = await TutorApplicationService.signIn(email, password);
        onClose();
        onSuccess(user);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'حدث خطأ أثناء المصادقة.');
    } finally {
      setIsLoading(false);
    }
  };

  const modalNode = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
      dir="rtl"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) {
          onClose();
        }
      }}
    >
      <div
        ref={modalDialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutor-auth-modal-title"
        className="bg-white w-full max-w-md my-auto max-h-[90dvh] flex flex-col rounded-3xl border border-[#E2E8F0] shadow-xl overflow-hidden relative"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 left-4 p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer z-10 min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="إغلاق"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="p-6 pb-4 text-center border-b border-[#F1F5F9] bg-[#F8F9FC] shrink-0">
          <div className="w-12 h-12 rounded-2xl bg-[#0D4E8B]/10 text-[#0D4E8B] mx-auto flex items-center justify-center mb-3">
            <GraduationCap className="w-6 h-6" />
          </div>
          <h2
            id="tutor-auth-modal-title"
            className="font-['Cairo'] text-lg sm:text-xl font-bold text-[#1F2A44]"
          >
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
              ? 'سجّل الدخول لمتابعة طلبك أو الدخول إلى لوحة المعلم'
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
                className={`flex-1 py-2 rounded-lg text-xs font-bold font-['Cairo'] transition-all cursor-pointer ${
                  mode === 'signup'
                    ? 'bg-white text-[#0D4E8B] shadow-xs'
                    : 'text-[#64748B] hover:text-[#1F2A44]'
                }`}
              >
                إنشاء حساب جديد
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className={`flex-1 py-2 rounded-lg text-xs font-bold font-['Cairo'] transition-all cursor-pointer ${
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {/* Error Message */}
          {errorMessage && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Success Message */}
          {successMessage && (
            <div
              role="status"
              className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Full Name (Sign Up only) */}
          {mode === 'signup' && (
            <div className="space-y-1">
              <label
                htmlFor="tutor-auth-fullname"
                className="text-xs font-bold text-[#1F2A44] block"
              >
                الاسم الكامل
              </label>
              <div className="relative">
                <input
                  id="tutor-auth-fullname"
                  ref={fullNameInputRef}
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="محمد أحمد إبراهيم"
                  className="w-full pl-3 pr-9 py-2.5 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] focus:ring-2 focus:ring-[#0D4E8B]/20 outline-none"
                />
                <User className="w-4 h-4 text-[#94A3B8] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          )}

          {/* Email */}
          <div className="space-y-1">
            <label
              htmlFor="tutor-auth-email"
              className="text-xs font-bold text-[#1F2A44] block"
            >
              البريد الإلكتروني
            </label>
            <div className="relative">
              <input
                id="tutor-auth-email"
                ref={emailInputRef}
                type="email"
                required
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teacher@example.com"
                className="w-full pl-3 pr-9 py-2.5 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] focus:ring-2 focus:ring-[#0D4E8B]/20 outline-none text-left"
              />
              <Mail className="w-4 h-4 text-[#94A3B8] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Password */}
          {mode !== 'forgot' && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="tutor-auth-password"
                  className="text-xs font-bold text-[#1F2A44]"
                >
                  كلمة المرور
                </label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setErrorMessage(null);
                      setSuccessMessage(null);
                    }}
                    className="text-[11px] text-[#0D4E8B] hover:underline cursor-pointer"
                  >
                    نسيت كلمة المرور؟
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  id="tutor-auth-password"
                  type="password"
                  required
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-3 pr-9 py-2.5 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] focus:ring-2 focus:ring-[#0D4E8B]/20 outline-none text-left"
                />
                <Lock className="w-4 h-4 text-[#94A3B8] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          )}

          {/* Confirm Password (Sign Up only) */}
          {mode === 'signup' && (
            <div className="space-y-1">
              <label
                htmlFor="tutor-auth-confirm-password"
                className="text-xs font-bold text-[#1F2A44] block"
              >
                تأكيد كلمة المرور
              </label>
              <div className="relative">
                <input
                  id="tutor-auth-confirm-password"
                  type="password"
                  required
                  dir="ltr"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-3 pr-9 py-2.5 rounded-xl border border-[#CBD5E1] text-xs sm:text-sm focus:border-[#0D4E8B] focus:ring-2 focus:ring-[#0D4E8B]/20 outline-none text-left"
                />
                <Lock className="w-4 h-4 text-[#94A3B8] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          )}

          {/* Action Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 min-h-[44px] rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white text-xs sm:text-sm font-bold font-['Cairo'] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2 shadow-xs"
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
                className="text-xs font-bold text-[#0D4E8B] hover:underline cursor-pointer"
              >
                العودة لتسجيل الدخول
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalNode, document.body) : modalNode;
};
