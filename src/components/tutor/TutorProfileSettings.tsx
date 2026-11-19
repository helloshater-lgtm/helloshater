import React, { useEffect, useState } from 'react';
import { BookOpen, Camera, Check, Info, Loader2, PenLine, User, Wallet } from 'lucide-react';
import { ApprovedSpecializationItem } from '../../types';
import { SUPPORTED_TUTOR_CURRENCIES, formatSessionPriceSummary, toArabicDigits } from '../../utils/formatters';
import {
  ICON_PROPS,
  InlineMessage,
  SectionCard,
  fieldClass,
  primaryButtonClass,
  secondaryButtonClass,
} from './TutorDashboardUi';

export type TutorProfileFocus = 'photo' | 'about' | 'pricing' | null;

interface TextField {
  value: string;
  onChange: (v: string) => void;
  error?: string;
}

interface TutorProfileSettingsProps {
  isPublished: boolean;
  tutorName: string;
  currentAvatarUrl: string;
  specializations: ApprovedSpecializationItem[];
  /** Section to scroll to and highlight (from the home checklist). */
  focus: TutorProfileFocus;
  focusNonce: number;

  // Photo
  selectedAvatarFile: File | null;
  selectedAvatarPreviewUrl: string | null;
  isSavingAvatar: boolean;
  avatarError: string | null;
  avatarSuccess: string | null;
  onSelectAvatar: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCancelAvatar: () => void;
  onSaveAvatar: () => void;

  // About
  headline: TextField;
  quote: TextField;
  summary: TextField;
  isSavingText: boolean;
  textError: string | null;
  textSuccess: string | null;
  onSaveText: (e: React.FormEvent) => void;

  // Pricing
  priceInput: string;
  onPriceInputChange: (v: string) => void;
  priceError?: string;
  currency: string;
  onCurrencyChange: (v: string) => void;
  durationMinutes: number;
  onDurationChange: (v: number) => void;
  durationError?: string;
  isSavingPricing: boolean;
  pricingError: string | null;
  pricingSuccess: string | null;
  onSavePricing: (e: React.FormEvent) => void;
}

const DURATIONS = [30, 45, 50, 60, 75, 90, 120];

const normalizeDigits = (v: string) => String(v ?? '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

const Counter: React.FC<{ length: number; min: number; max: number; optional?: boolean }> = ({
  length,
  min,
  max,
  optional,
}) => {
  const ok = optional && length === 0 ? true : length >= min && length <= max;
  return (
    <span className={`text-xs tabular-nums ${ok ? 'text-[#94A3B8]' : 'text-amber-700 font-bold'}`}>
      {toArabicDigits(length)} / {toArabicDigits(max)}
    </span>
  );
};

const FieldLabel: React.FC<{ htmlFor: string; label: string; optional?: boolean; right?: React.ReactNode }> = ({
  htmlFor,
  label,
  optional,
  right,
}) => (
  <div className="flex items-end justify-between gap-2 mb-1.5">
    <label htmlFor={htmlFor} className="text-sm font-bold text-[#1F2A44]">
      {label}
      {optional && <span className="text-xs font-normal text-[#94A3B8]"> · اختياري</span>}
    </label>
    {right}
  </div>
);

const FieldHint: React.FC<{ error?: string; children?: React.ReactNode }> = ({ error, children }) =>
  error ? (
    <p role="alert" className="mt-1.5 text-xs font-bold text-rose-700">
      {error}
    </p>
  ) : children ? (
    <p className="mt-1.5 text-xs text-[#64748B] leading-relaxed">{children}</p>
  ) : null;

/**
 * «بياناتي»: photo, about texts, price/duration and approved specializations on one calm page.
 * All saving logic stays in TutorDashboardView (same RPCs as before).
 */
export const TutorProfileSettings: React.FC<TutorProfileSettingsProps> = (p) => {
  const [highlight, setHighlight] = useState<TutorProfileFocus>(null);

  useEffect(() => {
    if (!p.focus) return;
    const el = document.getElementById(`profile-${p.focus}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setHighlight(p.focus);
    const t = window.setTimeout(() => setHighlight(null), 2200);
    return () => window.clearTimeout(t);
  }, [p.focus, p.focusNonce]);

  const visibility = p.isPublished
    ? 'التعديلات بتظهر لأولياء الأمور فور الحفظ.'
    : 'التعديلات بتظهر لك في المعاينة فورًا، ولأولياء الأمور بعد نشر ملفك.';

  const avatarShown = p.selectedAvatarPreviewUrl || p.currentAvatarUrl;
  const priceNumber = Number(normalizeDigits(p.priceInput)) || 0;

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in">
      <p className="px-1 text-xs sm:text-sm text-[#64748B] flex items-center gap-2">
        <Info className="w-4 h-4 shrink-0" strokeWidth={1.75} />
        <span>{visibility}</span>
      </p>

      {/* 1. Photo */}
      <SectionCard
        id="profile-photo"
        highlight={highlight === 'photo'}
        icon={<Camera {...ICON_PROPS} />}
        title="صورتك"
        subtitle="صورة واضحة لوجهك بإضاءة جيدة بتزوّد ثقة وليّ الأمر."
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5">
          <div className="relative w-24 h-24 rounded-full overflow-hidden bg-slate-100 border-4 border-white ring-1 ring-[#E2E8F0] shadow-xs shrink-0 flex items-center justify-center self-center sm:self-auto">
            {avatarShown ? (
              <img src={avatarShown} alt={p.tutorName} className="w-full h-full object-cover" />
            ) : (
              <User className="w-10 h-10 text-slate-400" strokeWidth={1.5} />
            )}
            {p.isSavingAvatar && (
              <span className="absolute inset-0 bg-black/50 flex items-center justify-center text-white">
                <Loader2 className="w-6 h-6 animate-spin" />
              </span>
            )}
          </div>

          <div className="flex-1 space-y-3 text-center sm:text-right">
            <p className="text-sm text-[#475569]">
              {p.selectedAvatarFile
                ? 'دي معاينة الصورة الجديدة. احفظها عشان تظهر في ملفك.'
                : p.currentAvatarUrl
                ? 'صورتك الحالية في الملف.'
                : 'لسه ما ضفتش صورة.'}
              <span className="block text-xs text-[#94A3B8] mt-0.5">JPG أو PNG أو WebP · حتى ٢ ميجابايت</span>
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              {p.selectedAvatarFile ? (
                <>
                  <button
                    type="button"
                    onClick={p.onSaveAvatar}
                    disabled={p.isSavingAvatar}
                    className={primaryButtonClass}
                  >
                    {p.isSavingAvatar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    <span>حفظ الصورة</span>
                  </button>
                  <button
                    type="button"
                    onClick={p.onCancelAvatar}
                    disabled={p.isSavingAvatar}
                    className={secondaryButtonClass}
                  >
                    إلغاء
                  </button>
                </>
              ) : (
                <label htmlFor="tutor-self-avatar-input" className={`${secondaryButtonClass} text-[#0D4E8B]`}>
                  <Camera className="w-4 h-4" strokeWidth={1.75} />
                  <span>{p.currentAvatarUrl ? 'تغيير الصورة' : 'اختيار صورة'}</span>
                </label>
              )}
              <input
                id="tutor-self-avatar-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={p.onSelectAvatar}
                disabled={p.isSavingAvatar}
                className="sr-only"
              />
            </div>
          </div>
        </div>
        {p.avatarError && <InlineMessage type="error">{p.avatarError}</InlineMessage>}
        {p.avatarSuccess && <InlineMessage type="success">{p.avatarSuccess}</InlineMessage>}
      </SectionCard>

      {/* 2. About */}
      <SectionCard
        id="profile-about"
        highlight={highlight === 'about'}
        icon={<PenLine {...ICON_PROPS} />}
        title="عنك"
        subtitle="اللي وليّ الأمر بيقراه تحت اسمك وفي صفحة ملفك."
      >
        <form onSubmit={p.onSaveText} noValidate className="space-y-5">
          <div>
            <FieldLabel
              htmlFor="tutor-profile-headline"
              label="جملة قصيرة عنك"
              right={<Counter length={p.headline.value.trim().length} min={10} max={250} />}
            />
            <input
              id="tutor-profile-headline"
              type="text"
              value={p.headline.value}
              onChange={(e) => p.headline.onChange(e.target.value)}
              maxLength={250}
              placeholder="مثال: أساعد طلاب الإعدادي يفهموا الرياضيات خطوة بخطوة"
              className={`${fieldClass(Boolean(p.headline.error))} h-12`}
            />
            <FieldHint error={p.headline.error}>بتظهر تحت اسمك في نتائج البحث. من ١٠ حروف.</FieldHint>
          </div>

          <div>
            <FieldLabel
              htmlFor="tutor-profile-quote"
              label="إزاي بتساعد الطفل يفهم؟"
              optional
              right={<Counter length={p.quote.value.trim().length} min={5} max={350} optional />}
            />
            <textarea
              id="tutor-profile-quote"
              rows={2}
              value={p.quote.value}
              onChange={(e) => p.quote.onChange(e.target.value)}
              maxLength={350}
              placeholder="مثال: أبسّط الدرس بأمثلة من حياة الطفل وأتأكد إنه حل بنفسه قبل نهاية الحصة."
              className={`${fieldClass(Boolean(p.quote.error))} py-3`}
            />
            <FieldHint error={p.quote.error} />
          </div>

          <div>
            <FieldLabel
              htmlFor="tutor-profile-summary"
              label="نبذة لوليّ الأمر"
              optional
              right={<Counter length={p.summary.value.trim().length} min={20} max={2500} optional />}
            />
            <textarea
              id="tutor-profile-summary"
              rows={5}
              value={p.summary.value}
              onChange={(e) => p.summary.onChange(e.target.value)}
              maxLength={2500}
              placeholder="خبرتك، وطريقتك في الشرح، وإزاي بتتابع مع وليّ الأمر."
              className={`${fieldClass(Boolean(p.summary.error))} py-3`}
            />
            <FieldHint error={p.summary.error}>من فضلك من غير أرقام تليفون أو روابط أو حسابات تواصل.</FieldHint>
          </div>

          {p.textError && <InlineMessage type="error">{p.textError}</InlineMessage>}
          {p.textSuccess && <InlineMessage type="success">{p.textSuccess}</InlineMessage>}

          <button type="submit" disabled={p.isSavingText} className={`${primaryButtonClass} w-full sm:w-auto`}>
            {p.isSavingText ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            <span>حفظ</span>
          </button>
        </form>
      </SectionCard>

      {/* 3. Pricing */}
      <SectionCard
        id="profile-pricing"
        highlight={highlight === 'pricing'}
        icon={<Wallet {...ICON_PROPS} />}
        title="سعر الحصة ومدتها"
        subtitle="سعر الحصة الخاصة الواحدة. بيبقى السعر الافتراضي لمواعيدك الجديدة."
      >
        <form onSubmit={p.onSavePricing} noValidate className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <FieldLabel htmlFor="tutor-pricing-session-price" label="السعر" />
              <input
                id="tutor-pricing-session-price"
                type="text"
                inputMode="numeric"
                value={p.priceInput}
                onChange={(e) => p.onPriceInputChange(e.target.value)}
                className={`${fieldClass(Boolean(p.priceError))} h-12 font-bold`}
              />
            </div>
            <div>
              <FieldLabel htmlFor="tutor-pricing-currency" label="العملة" />
              <select
                id="tutor-pricing-currency"
                value={p.currency}
                onChange={(e) => p.onCurrencyChange(e.target.value)}
                className={`${fieldClass()} h-12`}
              >
                {SUPPORTED_TUTOR_CURRENCIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="tutor-pricing-duration" label="المدة" />
              <select
                id="tutor-pricing-duration"
                value={p.durationMinutes}
                onChange={(e) => p.onDurationChange(Number(e.target.value))}
                className={`${fieldClass(Boolean(p.durationError))} h-12`}
              >
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {toArabicDigits(d)} دقيقة
                  </option>
                ))}
              </select>
            </div>
          </div>
          <FieldHint error={p.priceError || p.durationError} />

          <div className="p-4 rounded-2xl bg-[#F8FAFC] flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs sm:text-sm text-[#64748B]">هيظهر لوليّ الأمر</span>
            <span className="font-['Cairo'] text-base sm:text-lg font-extrabold text-[#0D4E8B]">
              {toArabicDigits(
                formatSessionPriceSummary({
                  minPrice: priceNumber,
                  maxPrice: priceNumber,
                  currency: p.currency,
                  durationMinutes: p.durationMinutes,
                }).combinedText
              )}
            </span>
          </div>
          <p className="text-xs text-[#64748B]">تغيير السعر مش بيأثر على المواعيد أو الحجوزات الموجودة.</p>

          {p.pricingError && !p.priceError && <InlineMessage type="error">{p.pricingError}</InlineMessage>}
          {p.pricingSuccess && <InlineMessage type="success">{p.pricingSuccess}</InlineMessage>}

          <button type="submit" disabled={p.isSavingPricing} className={`${primaryButtonClass} w-full sm:w-auto`}>
            {p.isSavingPricing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            <span>حفظ السعر</span>
          </button>
        </form>
      </SectionCard>

      {/* 4. Specializations (read-only) */}
      <SectionCard
        icon={<BookOpen {...ICON_PROPS} />}
        title="تخصصاتك المعتمدة"
        subtitle="بتتحدد من إدارة شاطر. لو عايز تضيف تخصص، تواصل مع الإدارة."
      >
        {p.specializations.length === 0 ? (
          <p className="text-sm text-[#64748B]">لسه ما اتربطش تخصصات بملفك.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {p.specializations.map((s) => (
              <span
                key={s.id}
                className="px-3 py-1.5 rounded-full bg-[#F8FAFC] border border-[#E2E8F0] text-xs sm:text-sm font-bold text-[#1F2A44]"
              >
                {s.label}
              </span>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
};
