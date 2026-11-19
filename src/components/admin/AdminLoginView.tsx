import React, { useState } from 'react';
import { AdminAuthService } from '../../services/adminAuthService';
import { AdminUser } from '../../types';
import { EmailCodeVerifier } from '../EmailCodeVerifier';
import { Lock, Mail, ArrowRight, ShieldCheck, AlertCircle, Loader2, KeyRound } from 'lucide-react';

interface AdminLoginViewProps {
  onLoginSuccess: (admin: AdminUser) => void;
  onNavigateHome: () => void;
}

type Method = 'password' | 'code';

const inputCls =
  'w-full h-12 pl-3 pr-10 rounded-2xl border border-[#CBD5E1] focus:border-[#0D4E8B] focus:ring-4 focus:ring-[#0D4E8B]/10 outline-none text-sm text-left';

export const AdminLoginView: React.FC<AdminLoginViewProps> = ({ onLoginSuccess, onNavigateHome }) => {
  const [method, setMethod] = useState<Method>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const switchMethod = (m: Method) => {
    setMethod(m);
    setErrorMessage(null);
    setCodeSentTo(null);
  };

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMessage('اكتب الإيميل وكلمة المرور.');
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    const result = await AdminAuthService.signIn(email, password);
    setIsLoading(false);
    if (result.success && result.admin) onLoginSuccess(result.admin);
    else setErrorMessage(result.error || 'تعذر تسجيل الدخول.');
  };

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await AdminAuthService.sendLoginCode(email);
      setCodeSentTo(email.trim().toLowerCase());
    } catch (err: any) {
      setErrorMessage(err?.message || 'تعذر إرسال الكود.');
    } finally {
      setIsLoading(false);
    }
  };

  const afterCode = async () => {
    setIsLoading(true);
    const result = await AdminAuthService.completeCodeSignIn();
    setIsLoading(false);
    if (result.success && result.admin) onLoginSuccess(result.admin);
    else {
      setCodeSentTo(null);
      setErrorMessage(result.error || 'تعذر تسجيل الدخول.');
    }
  };

  return (
    <div className="min-h-[80vh] flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-md bg-white border border-[#E2E8F0] shadow-sm rounded-3xl p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-[#0D4E8B] text-white mx-auto flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" strokeWidth={1.75} />
          </div>
          <h1 className="font-['Cairo'] text-2xl font-extrabold text-[#1F2A44]">لوحة إدارة شاطر كلاسيز</h1>
          <p className="text-sm text-[#64748B]">للفريق المعتمد بس.</p>
        </div>

        <div role="tablist" aria-label="طريقة الدخول" className="grid grid-cols-2 p-1 rounded-2xl bg-[#F1F5F9]">
          {(
            [
              { key: 'password', label: 'كلمة المرور' },
              { key: 'code', label: 'كود على الإيميل' },
            ] as const
          ).map((m) => (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={method === m.key}
              onClick={() => switchMethod(m.key)}
              className={`min-h-[40px] rounded-xl text-sm font-bold cursor-pointer ${method === m.key ? 'bg-white text-[#0D4E8B] shadow-xs' : 'text-[#64748B]'}`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {errorMessage && (
          <div role="alert" className="p-3.5 rounded-2xl bg-rose-50 text-rose-800 text-sm flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{errorMessage}</span>
          </div>
        )}

        {method === 'code' && codeSentTo ? (
          <div className="space-y-3">
            {isLoading && (
              <p className="text-sm text-[#64748B] flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> بنتأكد من صلاحياتك…
              </p>
            )}
            <EmailCodeVerifier
              email={codeSentTo}
              onResend={() => AdminAuthService.sendLoginCode(codeSentTo)}
              onChangeEmail={() => setCodeSentTo(null)}
              onVerified={afterCode}
            />
          </div>
        ) : (
          <form onSubmit={method === 'password' ? handlePassword : sendCode} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-bold text-[#1F2A44]" htmlFor="admin-email">الإيميل</label>
              <div className="relative">
                <input
                  id="admin-email"
                  type="email"
                  dir="ltr"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@shatirclasses.com"
                  required
                  className={inputCls}
                />
                <Mail className="w-4 h-4 text-[#94A3B8] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {method === 'password' && (
              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-[#1F2A44]" htmlFor="admin-password">كلمة المرور</label>
                <div className="relative">
                  <input
                    id="admin-password"
                    type="password"
                    dir="ltr"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className={inputCls}
                  />
                  <Lock className="w-4 h-4 text-[#94A3B8] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
            )}

            {method === 'code' && (
              <p className="text-xs text-[#64748B] leading-relaxed flex gap-2">
                <KeyRound className="w-4 h-4 shrink-0 text-[#0D4E8B]" />
                هيوصلك كود على الإيميل. مناسب لأعضاء الفريق اللي اتضافوا من «الفريق والصلاحيات».
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 px-4 rounded-2xl bg-[#0D4E8B] hover:bg-[#003767] text-white font-['Cairo'] font-extrabold text-sm shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{method === 'password' ? 'دخول' : 'ابعت الكود'}</span>
            </button>
          </form>
        )}

        <div className="pt-2 border-t border-[#F1F5F9] text-center">
          <button
            type="button"
            onClick={onNavigateHome}
            className="inline-flex items-center gap-1.5 text-sm text-[#64748B] hover:text-[#0D4E8B] font-bold cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" />
            <span>الرجوع للموقع</span>
          </button>
        </div>
      </div>
    </div>
  );
};
