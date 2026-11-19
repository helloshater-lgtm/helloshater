import React, { useEffect, useState } from 'react';
import { Loader2, KeyRound, RefreshCw } from 'lucide-react';
import { DirectTrialBookingService } from '../services/directTrialBookingService';
import { normalizeEmailOtpCode } from '../utils/directTrialBooking';

interface EmailCodeVerifierProps {
  email: string;
  onResend: () => Promise<void>;
  onChangeEmail: () => void;
  onVerified?: () => void;
  compact?: boolean;
}

const RESEND_COOLDOWN_SECONDS = 60;

export const EmailCodeVerifier: React.FC<EmailCodeVerifierProps> = ({ email, onResend, onChangeEmail, onVerified, compact = false }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [resentNotice, setResentNotice] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanCode = normalizeEmailOtpCode(code);
    if (!cleanCode) { setError('اكتب الكود المكوّن من الأرقام الموجودة في الرسالة.'); return; }
    setIsVerifying(true);
    try {
      await DirectTrialBookingService.verifyParentEmailCode(email, cleanCode);
      onVerified?.();
    } catch (err: any) {
      setError(err?.message || 'تعذر التحقق من الكود حاليًا. حاول مرة أخرى.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || isResending) return;
    setError(null); setResentNotice(false); setIsResending(true);
    try {
      await onResend();
      setCode(''); setResentNotice(true); setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err: any) {
      setError(err?.message || 'تعذر إرسال كود جديد حاليًا.');
    } finally {
      setIsResending(false);
    }
  };

  const textSize = compact ? 'text-[11px]' : 'text-xs';

  return (
    <form onSubmit={handleVerify} className={`rounded-xl bg-emerald-50 border border-emerald-200 space-y-2.5 text-emerald-900 ${compact ? 'p-3' : 'p-4'}`}>
      <p className={`font-bold ${compact ? 'text-xs' : 'text-sm'}`}>أرسلنا كود الدخول إلى <span dir="ltr">{email}</span></p>
      <p className={`${textSize} leading-relaxed`}>اكتب الكود الموجود في الرسالة هنا، وتكمل من نفس الصفحة دون فتح أي رابط. لو لم تجد الرسالة، راجع مجلد الرسائل غير المرغوب فيها (Spam).</p>
      <label htmlFor="email-otp-code" className="sr-only">كود الدخول</label>
      <input id="email-otp-code" type="text" inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={14} value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" className="w-full min-h-[46px] px-3 py-2 rounded-xl border border-emerald-300 bg-white text-center text-lg tracking-[0.4em] font-bold text-[#1F2A44] focus:outline-hidden focus:border-[#0D4E8B]" />
      {error && <p role="alert" className={`${textSize} font-bold text-rose-700`}>{error}</p>}
      {resentNotice && !error && <p className={`${textSize} font-bold text-emerald-800`}>تم إرسال كود جديد. استخدم أحدث رسالة فقط.</p>}
      <button type="submit" disabled={isVerifying} className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-[#0D4E8B] hover:bg-[#003767] text-white font-['Cairo'] font-bold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60">
        {isVerifying ? (<><Loader2 className="w-3.5 h-3.5 animate-spin" /><span>جاري التحقق...</span></>) : (<><KeyRound className="w-3.5 h-3.5" /><span>تأكيد الكود والمتابعة</span></>)}
      </button>
      <div className={`flex items-center justify-between gap-2 ${textSize}`}>
        <button type="button" onClick={handleResend} disabled={cooldown > 0 || isResending} className="font-bold text-[#0D4E8B] underline disabled:no-underline disabled:text-[#64748B] cursor-pointer disabled:cursor-default flex items-center gap-1">
          <RefreshCw className="w-3 h-3" />
          {cooldown > 0 ? `إعادة الإرسال بعد ${cooldown} ث` : 'إرسال كود جديد'}
        </button>
        <button type="button" onClick={onChangeEmail} className="font-bold text-[#0D4E8B] underline cursor-pointer">استخدام بريد آخر</button>
      </div>
    </form>
  );
};
