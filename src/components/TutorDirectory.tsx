import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Gift,
  GraduationCap,
  MessageCircle,
  SlidersHorizontal,
  Sparkles,
  Star,
  User,
  Users,
  X,
} from 'lucide-react';
import {
  COUNTRY_FLAGS,
  DAY_LABELS,
  DayPart,
  DirectoryData,
  DirectoryFilters,
  DirectoryStageId,
  DirectoryTutor,
  MIN_PUBLIC_SESSIONS,
  PART_LABELS,
  advancedFilterCount,
  buildDirectorySearch,
  filterDirectory,
  formatEarliestTrial,
  isAvailableSoon,
  priceBounds,
  stageChipsFor,
  subjectChipsFor,
} from '../utils/tutorDirectory';
import { toArabicDigits } from '../utils/formatters';
import { trackDirectoryFilter } from '../services/analytics';
import { SHATIR_CONFIG } from '../config/shatirConfig';

const PAGE = 12;

interface Props {
  data: DirectoryData;
  initialFilters: DirectoryFilters;
  onBook: (tutorId: string) => void;
  onOpenProfile: (tutorId: string) => void;
  onHelp: () => void;
}

const waNumber = () => String(SHATIR_CONFIG.adminWhatsAppNumber || '').replace(/[^0-9]/g, '');

const Chip: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode; count?: number; className?: string }> = ({
  active,
  onClick,
  children,
  count,
  className = '',
}) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={`shrink-0 h-10 px-4 rounded-full text-sm font-['Cairo'] font-bold whitespace-nowrap transition-colors cursor-pointer ${
      active ? 'bg-[#0D4E8B] text-white shadow-xs' : 'bg-white text-[#1F2A44] border border-[#E2E8F0] hover:border-[#0D4E8B]/40'
    } ${className}`}
  >
    {children}
    {count !== undefined && <span className={`ms-1.5 text-xs ${active ? 'text-white/80' : 'text-[#94A3B8]'}`}>{toArabicDigits(count)}</span>}
  </button>
);

// ---------------------------------------------------------------------------
// Tutor card (Preply-style, with Shatir's «أقرب تجربة»)
// ---------------------------------------------------------------------------

const TutorTile: React.FC<{ t: DirectoryTutor; onBook: () => void; onOpen: () => void }> = ({ t, onBook, onOpen }) => {
  const [imgError, setImgError] = useState(false);
  const earliest = t.bookable ? formatEarliestTrial(t.earliestTrialAt) : null;
  const soon = isAvailableSoon(t);
  const flag = t.country ? COUNTRY_FLAGS[t.country] : null;
  const rated = Boolean(t.rating && t.reviewsCount > 0);
  const price = t.priceMin
    ? t.priceMax && t.priceMax !== t.priceMin
      ? `${toArabicDigits(t.priceMin)}–${toArabicDigits(t.priceMax)}`
      : toArabicDigits(t.priceMin)
    : null;
  const star = rated && Number(t.rating) >= 4.8 && t.reviewsCount >= 5;
  const wa = `https://wa.me/${waNumber()}?text=${encodeURIComponent(`أهلًا، عايز أسأل عن ${t.honorific} ${t.name} على شاطر كلاسيز`)}`;

  return (
    <article className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xs p-4 flex flex-col gap-2.5 hover:shadow-md transition-shadow">
      {/* Photo + name + rating + price */}
      <div className="flex items-start gap-3.5">
        <button type="button" onClick={onOpen} aria-label={`ملف ${t.name}`} className="relative w-[76px] h-[76px] rounded-2xl overflow-hidden bg-[#F0F6FD] shrink-0 cursor-pointer">
          {t.avatarUrl && !imgError ? (
            <img src={t.avatarUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImgError(true)} className="w-full h-full object-cover object-top" />
          ) : (
            <span className="w-full h-full flex items-center justify-center">
              <User className="w-8 h-8 text-[#0D4E8B]" strokeWidth={1.75} />
            </span>
          )}
          {soon && (
            <span className="absolute bottom-1.5 left-1.5 w-3.5 h-3.5 rounded-[4px] bg-emerald-500 ring-2 ring-white" title="عنده ميعاد تجربة خلال يومين" aria-label="متاح قريب" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <button type="button" onClick={onOpen} className="flex items-center gap-1.5 max-w-full text-right cursor-pointer">
            <span className="font-['Cairo'] text-base font-extrabold text-[#1F2A44] truncate">
              {t.honorific} {t.name}
            </span>
            {t.verified && <BadgeCheck className="w-4.5 h-4.5 w-[18px] h-[18px] text-[#0D4E8B] shrink-0" aria-label="معلم معتمد" />}
            {flag && (
              <span className="text-base leading-none shrink-0" title={flag.name} aria-label={flag.name}>
                {flag.flag}
              </span>
            )}
          </button>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <div>
              {rated ? (
                <>
                  <p className="font-['Cairo'] text-base font-extrabold text-[#1F2A44] flex items-center gap-1 leading-tight">
                    <Star className="w-4 h-4 fill-[#FFC629] text-[#FFC629]" />
                    {toArabicDigits(Number(t.rating).toFixed(1))}
                  </p>
                  <p className="text-xs text-[#64748B]">{toArabicDigits(t.reviewsCount)} تقييم</p>
                </>
              ) : (
                <>
                  <p className="font-['Cairo'] text-sm font-extrabold text-[#8A6100] flex items-center gap-1 leading-tight">
                    <Sparkles className="w-4 h-4" />
                    جديد
                  </p>
                  <p className="text-xs text-[#64748B]">على شاطر</p>
                </>
              )}
            </div>
            {price && (
              <div>
                <p className="font-['Cairo'] text-base font-extrabold text-[#1F2A44] whitespace-nowrap leading-tight">
                  {price} <span className="text-sm">{t.currency || 'ج.م'}</span>
                </p>
                <p className="text-xs text-[#64748B]">حصة {toArabicDigits(t.sessionMinutes || 50)} دقيقة</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Badges */}
      <ul className="space-y-1 text-[13px] text-[#1F2A44] empty:hidden">
        {star && (
          <li className="flex items-center gap-2 font-bold">
            <Award className="w-4 h-4 text-[#C2410C]" strokeWidth={2} />
            معلم متميز
          </li>
        )}
        {t.yearsOfExperience ? (
          <li className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-[#0D4E8B]" strokeWidth={1.75} />
            خبرة {toArabicDigits(t.yearsOfExperience)} {t.yearsOfExperience > 10 ? 'سنة' : 'سنين'}
          </li>
        ) : null}
      </ul>

      {/* Headline + summary */}
      <div className="text-[13px] leading-relaxed">
        {t.headline && <p className="font-bold text-[#1F2A44] line-clamp-2">{t.headline}</p>}
        {t.summary && <p className="text-[#475569] line-clamp-1">{t.summary}</p>}
        <button type="button" onClick={onOpen} className="mt-0.5 text-[13px] font-bold text-[#0D4E8B] underline underline-offset-4 cursor-pointer">
          اعرف أكتر
        </button>
      </div>

      {t.completedSessions >= MIN_PUBLIC_SESSIONS && (
        <p className="text-xs text-[#64748B] flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" />
          {toArabicDigits(t.completedSessions)} حصة اتعملت على شاطر
        </p>
      )}

      {/* Actions */}
      <div className="mt-auto space-y-2 pt-1">
        {earliest && (
          <p className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
            <CalendarClock className="w-4 h-4" strokeWidth={1.75} />
            أقرب تجربة: {earliest}
          </p>
        )}
        <div className="flex gap-2">
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`اسأل عن ${t.name} على واتساب`}
            className="w-11 h-11 shrink-0 rounded-xl border border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] text-emerald-700 flex items-center justify-center"
          >
            <MessageCircle className="w-5 h-5" strokeWidth={1.75} />
          </a>
          {earliest ? (
            <button
              type="button"
              onClick={onBook}
              className="flex-1 h-11 rounded-xl bg-[#FFC629] hover:bg-[#F5BC18] text-[#1F2A44] font-['Cairo'] font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <Gift className="w-4 h-4" strokeWidth={2} />
              احجز تجربة مجانية
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpen}
              className="flex-1 h-11 rounded-xl border border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] text-[#0D4E8B] font-['Cairo'] font-extrabold text-sm cursor-pointer"
            >
              شوف الملف والمواعيد
            </button>
          )}
        </div>
      </div>
    </article>
  );
};

// ---------------------------------------------------------------------------
// Bottom sheet shell
// ---------------------------------------------------------------------------

const Sheet: React.FC<{ title: string; onClose: () => void; footer: React.ReactNode; onClear?: () => void; children: React.ReactNode }> = ({
  title,
  onClose,
  footer,
  onClear,
  children,
}) => {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" dir="rtl">
      <button type="button" aria-label="إغلاق" onClick={onClose} className="absolute inset-0 bg-slate-900/40 cursor-pointer" />
      <div role="dialog" aria-modal="true" aria-label={title} className="relative w-full sm:max-w-lg max-h-[92vh] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col">
        <div className="flex items-center justify-between gap-2 px-4 h-16 border-b border-[#F1F5F9] shrink-0">
          <button type="button" onClick={onClose} aria-label="إغلاق" className="w-10 h-10 rounded-xl hover:bg-[#F1F5F9] flex items-center justify-center cursor-pointer">
            <X className="w-5 h-5" />
          </button>
          <h2 className="font-['Cairo'] text-lg font-extrabold text-[#1F2A44]">{title}</h2>
          {onClear ? (
            <button type="button" onClick={onClear} className="text-sm font-bold text-[#1F2A44] underline underline-offset-4 cursor-pointer">
              مسح الكل
            </button>
          ) : (
            <span className="w-10" />
          )}
        </div>
        <div className="overflow-y-auto px-4 py-5 space-y-7">{children}</div>
        {footer ? (
          <div className="p-4 border-t border-[#F1F5F9] shrink-0" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
            {footer}
          </div>
        ) : (
          <div className="shrink-0" style={{ height: 'max(16px, env(safe-area-inset-bottom))' }} />
        )}
      </div>
    </div>
  );
};

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; icon?: React.ReactNode }> = ({
  checked,
  onChange,
  label,
  hint,
  icon,
}) => (
  <label className="flex items-center justify-between gap-4 cursor-pointer">
    <span>
      <span className="font-['Cairo'] text-base font-extrabold text-[#1F2A44] flex items-center gap-2">
        {icon}
        {label}
      </span>
      {hint && <span className="block text-sm text-[#64748B]">{hint}</span>}
    </span>
    <span className="relative shrink-0">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span className="block w-14 h-8 rounded-full bg-[#E2E8F0] peer-checked:bg-[#1F2A44] transition-colors" />
      <span className="absolute top-1 right-1 w-6 h-6 rounded-full bg-white shadow transition-transform peer-checked:-translate-x-6" />
    </span>
  </label>
);

const OptionBox: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={`min-h-[52px] px-3 rounded-2xl border text-sm font-bold cursor-pointer transition-colors ${
      active ? 'border-[#1F2A44] bg-[#F1F5F9] text-[#1F2A44] ring-1 ring-[#1F2A44]' : 'border-[#E2E8F0] bg-white text-[#1F2A44] hover:border-[#94A3B8]'
    }`}
  >
    {children}
  </button>
);

const toggleIn = <T,>(list: T[] | undefined, v: T): T[] => {
  const l = list || [];
  return l.includes(v) ? l.filter((x) => x !== v) : [...l, v];
};

// ---------------------------------------------------------------------------
// Filters sheet
// ---------------------------------------------------------------------------

const FiltersSheet: React.FC<{
  data: DirectoryData;
  value: DirectoryFilters;
  onApply: (f: DirectoryFilters) => void;
  onClose: () => void;
}> = ({ data, value, onApply, onClose }) => {
  const [draft, setDraft] = useState<DirectoryFilters>(value);
  const bounds = priceBounds(data);
  const count = filterDirectory(data, draft).length;
  const step = 10;
  const maxVal = draft.maxPrice || bounds?.max || 0;

  return (
    <Sheet
      title="فلترة"
      onClose={onClose}
      onClear={() => setDraft({ stage: draft.stage, subject: draft.subject })}
      footer={
        <button
          type="button"
          onClick={() => onApply(draft)}
          className="w-full h-14 rounded-2xl bg-[#FFC629] hover:bg-[#F5BC18] text-[#1F2A44] font-['Cairo'] font-extrabold text-base cursor-pointer"
        >
          {count ? `عرض ${toArabicDigits(count)} معلم` : 'مفيش معلمين بالاختيارات دي'}
        </button>
      }
    >
      <section className="space-y-3">
        <h3 className="font-['Cairo'] text-base font-extrabold text-[#1F2A44]">الطفل فاضي إمتى؟</h3>
        <p className="text-sm text-[#64748B] -mt-2">هنوريك المعلمين اللي عندهم مواعيد تجربة في الوقت ده.</p>
        <div className="grid grid-cols-3 gap-2">
          {PART_LABELS.map((p) => (
            <OptionBox key={p.id} active={Boolean(draft.parts?.includes(p.id))} onClick={() => setDraft({ ...draft, parts: toggleIn<DayPart>(draft.parts, p.id) })}>
              <span className="block">{p.label}</span>
              <span className="block text-xs font-normal text-[#64748B]">{p.hint}</span>
            </OptionBox>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {DAY_LABELS.map((d) => (
            <Chip key={d.id} active={Boolean(draft.days?.includes(d.id))} onClick={() => setDraft({ ...draft, days: toggleIn(draft.days, d.id) })}>
              {d.label}
            </Chip>
          ))}
        </div>
      </section>

      {bounds && bounds.max > bounds.min && (
        <section className="space-y-3 border-t border-[#F1F5F9] pt-6">
          <h3 className="font-['Cairo'] text-base font-extrabold text-[#1F2A44]">سعر الحصة</h3>
          <p className="text-center font-['Cairo'] text-2xl font-extrabold text-[#1F2A44]">
            لحد {toArabicDigits(maxVal)} ج.م
          </p>
          <input
            type="range"
            min={bounds.min}
            max={bounds.max}
            step={step}
            value={maxVal}
            onChange={(e) => {
              const v = Number(e.target.value);
              setDraft({ ...draft, maxPrice: v >= bounds.max ? null : v });
            }}
            aria-label="أقصى سعر للحصة"
            className="w-full accent-[#1F2A44]"
            dir="ltr"
          />
          <div className="flex justify-between text-xs text-[#64748B]" dir="ltr">
            <span>{toArabicDigits(bounds.min)}</span>
            <span>{toArabicDigits(bounds.max)}+</span>
          </div>
        </section>
      )}

      <section className="border-t border-[#F1F5F9] pt-6">
        <Toggle
          checked={Boolean(draft.verifiedOnly)}
          onChange={(v) => setDraft({ ...draft, verifiedOnly: v })}
          label="معلم معتمد"
          hint="اتراجعت بياناته وشهاداته من فريق شاطر"
          icon={<BadgeCheck className="w-5 h-5 text-[#0D4E8B]" />}
        />
      </section>
    </Sheet>
  );
};

// ---------------------------------------------------------------------------
// «ساعدني أختار» — 3 quick questions
// ---------------------------------------------------------------------------

const HelpMeChoose: React.FC<{
  data: DirectoryData;
  onDone: (f: DirectoryFilters) => void;
  onClose: () => void;
  onWhatsApp: () => void;
}> = ({ data, onDone, onClose, onWhatsApp }) => {
  const [step, setStep] = useState(0);
  const [stage, setStage] = useState<DirectoryStageId | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const stages = stageChipsFor(data);
  const subjects = subjectChipsFor(data, stage);

  const finish = (parts: DayPart[]) => onDone({ stage, subject, parts: parts.length ? parts : undefined });

  const Row: React.FC<{ onClick: () => void; children: React.ReactNode; hint?: string }> = ({ onClick, children, hint }) => (
    <button
      type="button"
      onClick={onClick}
      className="w-full min-h-[60px] px-4 rounded-2xl border border-[#E2E8F0] bg-white hover:border-[#0D4E8B] text-right flex items-center justify-between gap-3 cursor-pointer"
    >
      <span>
        <span className="block font-['Cairo'] text-base font-bold text-[#1F2A44]">{children}</span>
        {hint && <span className="block text-xs text-[#64748B]">{hint}</span>}
      </span>
      <span className="text-[#94A3B8] text-xl">‹</span>
    </button>
  );

  const titles = ['طفلك في أنهي مرحلة؟', 'محتاج مساعدة في إيه؟', 'الطفل فاضي إمتى غالبًا؟'];

  return (
    <Sheet
      title={`سؤال ${toArabicDigits(step + 1)} من ٣`}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          {step > 0 ? (
            <button type="button" onClick={() => setStep(step - 1)} className="text-sm font-bold text-[#0D4E8B] cursor-pointer">
              رجوع
            </button>
          ) : (
            <span />
          )}
          <button type="button" onClick={onWhatsApp} className="text-sm font-bold text-emerald-700 flex items-center gap-1.5 cursor-pointer">
            <MessageCircle className="w-4 h-4" />
            أفضّل أكلّم حد
          </button>
        </div>
      }
    >
      <div className="h-1.5 rounded-full bg-[#F1F5F9] overflow-hidden -mt-2" aria-hidden="true">
        <div className="h-full bg-[#FFC629] transition-all" style={{ width: `${((step + 1) / 3) * 100}%` }} />
      </div>
      <h3 className="font-['Cairo'] text-2xl font-black text-[#1F2A44]">{titles[step]}</h3>
      <div className="space-y-2.5">
        {step === 0 &&
          stages.map((s) => (
            <Row
              key={s.id}
              hint={`${toArabicDigits(s.count)} معلم`}
              onClick={() => {
                setStage(s.id);
                setSubject(null);
                setStep(s.id === 'quran' ? 2 : 1);
              }}
            >
              {s.id === 'quran' ? 'قرآن وتجويد' : s.label}
            </Row>
          ))}
        {step === 1 && (
          <>
            {subjects.map((s) => (
              <Row
                key={s.id}
                hint={`${toArabicDigits(s.count)} معلم`}
                onClick={() => {
                  setSubject(s.id);
                  setStep(2);
                }}
              >
                {s.label}
              </Row>
            ))}
            <Row onClick={() => { setSubject(null); setStep(2); }}>أكتر من مادة / مش متأكد</Row>
          </>
        )}
        {step === 2 && (
          <>
            {PART_LABELS.map((p) => (
              <Row key={p.id} hint={p.hint} onClick={() => finish([p.id])}>
                {p.label}
              </Row>
            ))}
            <Row onClick={() => finish([])}>أي وقت</Row>
          </>
        )}
      </div>
    </Sheet>
  );
};

// ---------------------------------------------------------------------------
// Directory
// ---------------------------------------------------------------------------

/** Tutors first: filter chips (stage → subject) + filters sheet, cards right away. */
export const TutorDirectory: React.FC<Props> = ({ data, initialFilters, onBook, onOpenProfile, onHelp }) => {
  const [filters, setFilters] = useState<DirectoryFilters>(initialFilters);
  const [limit, setLimit] = useState(PAGE);
  const [sheet, setSheet] = useState<'filters' | 'help' | null>(null);
  // Big search panel scrolls away; a slim bar takes its place under the site header.
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [showCompact, setShowCompact] = useState(false);
  const [headerH, setHeaderH] = useState(64);
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const measure = () => setHeaderH(document.querySelector('header')?.getBoundingClientRect().height || 64);
    measure();
    window.addEventListener('resize', measure);
    const onScroll = () => {
      const h = document.querySelector('header')?.getBoundingClientRect().height || 64;
      const panelBottom = el.getBoundingClientRect().bottom;
      const sectionBottom = document.getElementById('tutors')?.getBoundingClientRect().bottom ?? 0;
      setShowCompact(panelBottom < h && sectionBottom > h + 120);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
    };
  }, []);

  const stageChips = useMemo(() => stageChipsFor(data), [data]);
  const subjectChips = useMemo(() => subjectChipsFor(data, filters.stage), [data, filters.stage]);
  const list = useMemo(() => filterDirectory(data, filters), [data, filters]);
  const bookableCount = list.filter((t) => t.bookable && t.earliestTrialAt).length;
  const advCount = advancedFilterCount(filters);
  const stats = data.stats;

  useEffect(() => {
    const search = buildDirectorySearch(window.location.search, filters);
    if (search !== window.location.search) {
      window.history.replaceState(null, '', `${window.location.pathname}${search}${window.location.hash}`);
    }
  }, [filters]);

  const apply = (next: DirectoryFilters) => {
    setFilters(next);
    setLimit(PAGE);
    trackDirectoryFilter(next.stage, next.subject);
  };
  const setStage = (stage: DirectoryStageId | null) => apply({ ...filters, stage, subject: null });
  const setSubject = (subject: string | null) => apply({ ...filters, subject });
  const openWhatsApp = () => {
    setSheet(null);
    onHelp();
  };

  const stageLabel = filters.stage ? stageChips.find((c) => c.id === filters.stage)?.label : null;
  const subjectLabel = filters.subject ? subjectChips.find((c) => c.id === filters.subject)?.label : null;
  const title = [subjectLabel, stageLabel].filter(Boolean).join(' · ');

  const [picker, setPicker] = useState<'stage' | 'subject' | null>(null);
  const dayLabel = (filters.parts || []).map((p) => PART_LABELS.find((x) => x.id === p)?.label).filter(Boolean).join('، ');
  const pills: Array<{ key: string; label: string; clear: () => void }> = [
    ...(dayLabel ? [{ key: 'parts', label: dayLabel, clear: () => apply({ ...filters, parts: undefined }) }] : []),
    ...(filters.days?.length ? [{ key: 'days', label: filters.days.map((d) => DAY_LABELS.find((x) => x.id === d)?.label).join('، '), clear: () => apply({ ...filters, days: undefined }) }] : []),
    ...(filters.maxPrice ? [{ key: 'max', label: `لحد ${toArabicDigits(filters.maxPrice)} ج.م`, clear: () => apply({ ...filters, maxPrice: null }) }] : []),
    ...(filters.verifiedOnly ? [{ key: 'v', label: 'معتمد', clear: () => apply({ ...filters, verifiedOnly: false }) }] : []),
  ];
  const otherCount = list.length - bookableCount;

  const SelectButton: React.FC<{ label: string; value: string | null; placeholder: string; onClick: () => void; disabled?: boolean }> = ({
    label,
    value,
    placeholder,
    onClick,
    disabled,
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-w-0 h-12 px-3 rounded-xl border text-right flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        value ? 'border-[#0D4E8B] bg-[#F0F6FD]' : 'border-[#E2E8F0] bg-white hover:border-[#94A3B8]'
      }`}
    >
      <span className="flex-1 min-w-0">
        <span className="block text-[11px] font-bold text-[#64748B] leading-none mb-1">{label}</span>
        <span className={`block truncate font-['Cairo'] text-sm font-extrabold ${value ? 'text-[#0D4E8B]' : 'text-[#1F2A44]'}`}>{value || placeholder}</span>
      </span>
      <ChevronDown className="w-4 h-4 text-[#64748B] shrink-0" />
    </button>
  );

  const compactBar = showCompact && (
    <div className="fixed inset-x-0 z-30 bg-white/95 backdrop-blur border-b border-[#E2E8F0] shadow-[0_4px_12px_rgba(15,23,42,0.06)]" style={{ top: headerH }} dir="rtl">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-2">
        <button type="button" onClick={() => setPicker('stage')} className={`min-w-0 flex-1 h-10 px-3 rounded-full border text-sm font-bold flex items-center justify-between gap-1 cursor-pointer ${stageLabel ? 'border-[#0D4E8B] bg-[#F0F6FD] text-[#0D4E8B]' : 'border-[#E2E8F0] text-[#1F2A44]'}`}>
          <span className="truncate">{stageLabel || 'كل المراحل'}</span>
          <ChevronDown className="w-4 h-4 shrink-0" />
        </button>
        <button type="button" onClick={() => setPicker('subject')} disabled={filters.stage === 'quran' || subjectChips.length === 0} className={`min-w-0 flex-1 h-10 px-3 rounded-full border text-sm font-bold flex items-center justify-between gap-1 cursor-pointer disabled:opacity-50 ${subjectLabel ? 'border-[#0D4E8B] bg-[#F0F6FD] text-[#0D4E8B]' : 'border-[#E2E8F0] text-[#1F2A44]'}`}>
          <span className="truncate">{filters.stage === 'quran' ? 'قرآن' : subjectLabel || 'كل المواد'}</span>
          <ChevronDown className="w-4 h-4 shrink-0" />
        </button>
        <button type="button" onClick={() => setSheet('filters')} aria-label="فلترة" className={`relative w-10 h-10 shrink-0 rounded-full flex items-center justify-center cursor-pointer ${advCount ? 'bg-[#1F2A44] text-white' : 'bg-[#FFC629] text-[#1F2A44]'}`}>
          <SlidersHorizontal className="w-4 h-4" />
          {advCount > 0 && <span className="absolute -top-1 -left-1 min-w-4 h-4 px-1 rounded-full bg-[#FFC629] text-[#1F2A44] text-[10px] font-extrabold flex items-center justify-center">{toArabicDigits(advCount)}</span>}
        </button>
      </div>
    </div>
  );

  return (
    <section id="tutors" aria-label="المعلمين" className="w-full bg-gradient-to-b from-[#EAF2FC] via-[#F5F9FE] to-white border-b border-[#E2E8F0] scroll-mt-16">
      {compactBar}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-10 pb-8 space-y-3 sm:space-y-4">
        {/* Hero copy */}
        <div className="space-y-2 text-center max-w-2xl mx-auto">
          <p className="inline-flex items-center gap-2 h-8 px-3 rounded-full bg-white border border-[#CBEAD9] text-xs sm:text-sm font-['Cairo'] font-extrabold text-[#0B5D38]">
            <Gift className="w-4 h-4" />
            أول حصة تجريبية مجانًا · ٢٠ دقيقة أونلاين
          </p>
          <h1 className="font-['Cairo'] font-black text-[#1F2A44] text-[26px] sm:text-[42px] leading-[1.3]">
            {title ? (
              <>
                أفضل معلمين <span className="text-[#0D4E8B]">{subjectLabel || stageLabel}</span>
                {subjectLabel && stageLabel && <span className="block text-lg sm:text-2xl text-[#475569] mt-1">{filters.stage === 'quran' ? '' : `للمرحلة ${stageLabel === 'ابتدائي' ? 'الابتدائية' : stageLabel === 'إعدادي' ? 'الإعدادية' : 'الثانوية'}`}</span>}
              </>
            ) : (
              <>
                معلم خصوصي لطفلك
                <span className="block text-[#0D4E8B]">من بيتك، وبمتابعة حقيقية</span>
              </>
            )}
          </h1>
          <p className={`text-[13px] sm:text-base text-[#475569] leading-snug ${title ? 'hidden sm:block' : ''}`}>
            اختار المعلم، شوف أقرب ميعاد، واحجز في دقيقة. من غير دفع ولا تسجيل.
          </p>
        </div>

        {/* Search panel */}
        <div ref={panelRef}>
          <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_8px_24px_rgba(13,78,139,0.08)] p-1.5 grid grid-cols-[1fr_1fr_auto] gap-2">
            <SelectButton label="المرحلة" value={stageLabel || null} placeholder="كل المراحل" onClick={() => setPicker('stage')} />
            <SelectButton
              label="المادة"
              value={filters.stage === 'quran' ? 'قرآن وتجويد' : subjectLabel || null}
              placeholder="كل المواد"
              onClick={() => setPicker('subject')}
              disabled={filters.stage === 'quran' || subjectChips.length === 0}
            />
            <button
              type="button"
              onClick={() => setSheet('filters')}
              aria-label={advCount ? `فلترة (${advCount})` : 'فلترة: المواعيد والسعر'}
              className={`relative h-12 w-12 rounded-xl flex items-center justify-center cursor-pointer ${
                advCount ? 'bg-[#1F2A44] text-white' : 'bg-[#FFC629] text-[#1F2A44] hover:bg-[#F5BC18]'
              }`}
            >
              <SlidersHorizontal className="w-5 h-5" />
              {advCount > 0 && (
                <span className="absolute -top-1 -left-1 min-w-5 h-5 px-1 rounded-full bg-[#FFC629] text-[#1F2A44] text-[11px] font-extrabold flex items-center justify-center ring-2 ring-white">
                  {toArabicDigits(advCount)}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-1.5 sm:gap-3">
          <button type="button" onClick={() => setSheet('help')} className="inline-flex items-center gap-1.5 text-sm font-['Cairo'] font-extrabold text-[#0D4E8B] cursor-pointer hover:underline">
            <Sparkles className="w-4 h-4" />
            مش عارف تختار؟ جاوب ٣ أسئلة ونرشّحلك
          </button>
          <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs font-bold text-[#475569]">
            {stats && (
              <li className="flex items-center gap-1">
                <BadgeCheck className="w-4 h-4 text-[#0D4E8B]" />
                {toArabicDigits(stats.tutors)} معلم مراجَع
              </li>
            )}
            {stats && stats.completedSessions >= MIN_PUBLIC_SESSIONS && (
              <li className="flex items-center gap-1">
                <Users className="w-4 h-4 text-[#0D4E8B]" />
                {toArabicDigits(stats.completedSessions)}+ حصة
              </li>
            )}
            {stats && stats.avgRating && stats.reviews >= MIN_PUBLIC_SESSIONS ? (
              <li className="flex items-center gap-1">
                <Star className="w-4 h-4 fill-[#FFC629] text-[#FFC629]" />
                {toArabicDigits(Number(stats.avgRating).toFixed(1))} تقييم أولياء الأمور
              </li>
            ) : (
              <li className="flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                تقرير بعد كل حصة
              </li>
            )}
            <li className="flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              مش عاجبك؟ نغيّرلك مجانًا
            </li>
          </ul>
        </div>

        {/* Results header */}
        <div className="flex flex-wrap items-end justify-between gap-2 pt-3 border-t border-[#E2E8F0]/70 sm:border-0 sm:pt-2">
          <div aria-live="polite">
            <h2 className="font-['Cairo'] text-lg sm:text-xl font-extrabold text-[#1F2A44]">
              {list.length === 0
                ? 'مفيش معلمين للاختيار ده دلوقتي'
                : bookableCount
                ? `${toArabicDigits(bookableCount)} ${bookableCount === 1 ? 'معلم متاح' : bookableCount <= 10 ? 'معلمين متاحين' : 'معلم متاح'} للتجربة الأسبوع ده`
                : `${toArabicDigits(list.length)} معلم`}
            </h2>
            {bookableCount > 0 && otherCount > 0 && (
              <p className="text-xs text-[#64748B]">و{toArabicDigits(otherCount)} معلم تاني مواعيدهم بتتفتح قريب</p>
            )}
          </div>
          {pills.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {pills.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={p.clear}
                  aria-label={`إلغاء ${p.label}`}
                  className="h-8 ps-3 pe-2 rounded-full bg-white border border-[#CBD5E1] text-xs font-bold text-[#1F2A44] flex items-center gap-1 cursor-pointer hover:border-rose-300"
                >
                  {p.label}
                  <X className="w-3.5 h-3.5 text-[#64748B]" />
                </button>
              ))}
              {pills.length > 1 && (
                <button type="button" onClick={() => apply({ stage: filters.stage, subject: filters.subject })} className="h-8 px-2 text-xs font-bold text-[#0D4E8B] underline cursor-pointer">
                  مسح الكل
                </button>
              )}
            </div>
          )}
        </div>

        {list.length === 0 ? (
          <div className="bg-white rounded-3xl border border-[#E2E8F0] p-6 text-center space-y-3">
            <p className="font-['Cairo'] font-extrabold text-[#1F2A44]">قولّنا محتاج إيه ونرشّحلك معلم مناسب</p>
            <button type="button" onClick={onHelp} className="inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-['Cairo'] font-extrabold text-sm cursor-pointer">
              <MessageCircle className="w-4 h-4" />
              كلّمنا على واتساب
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {list.slice(0, limit).map((t) => (
                <TutorTile key={t.id} t={t} onBook={() => onBook(t.id)} onOpen={() => onOpenProfile(t.id)} />
              ))}
            </div>
            {list.length > limit && (
              <div className="flex justify-center">
                <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="h-12 px-6 rounded-2xl border border-[#CBD5E1] bg-white text-sm font-bold text-[#1F2A44] cursor-pointer">
                  عرض معلمين أكتر ({toArabicDigits(list.length - limit)})
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {sheet === 'filters' && (
        <FiltersSheet
          data={data}
          value={filters}
          onClose={() => setSheet(null)}
          onApply={(f) => {
            apply(f);
            setSheet(null);
            document.getElementById('tutors')?.scrollIntoView({ behavior: 'smooth' });
          }}
        />
      )}
      {picker && (
        <Sheet title={picker === 'stage' ? 'المرحلة' : 'المادة'} onClose={() => setPicker(null)} footer={null}>
          <div className="space-y-2 -mt-2">
            {[{ id: null as any, label: picker === 'stage' ? 'كل المراحل' : 'كل المواد', count: picker === 'stage' ? data.tutors.length : undefined },
              ...(picker === 'stage' ? stageChips.map((c) => ({ ...c, label: c.id === 'quran' ? 'قرآن وتجويد' : c.label })) : subjectChips)].map((o: any) => {
              const active = picker === 'stage' ? (filters.stage || null) === o.id : (filters.subject || null) === o.id;
              return (
                <button
                  key={String(o.id)}
                  type="button"
                  onClick={() => {
                    if (picker === 'stage') setStage(o.id);
                    else setSubject(o.id);
                    setPicker(null);
                  }}
                  className={`w-full min-h-[56px] px-4 rounded-2xl border text-right flex items-center justify-between gap-3 cursor-pointer ${
                    active ? 'border-[#0D4E8B] bg-[#F0F6FD]' : 'border-[#E2E8F0] bg-white hover:border-[#94A3B8]'
                  }`}
                >
                  <span className="font-['Cairo'] text-base font-bold text-[#1F2A44]">{o.label}</span>
                  <span className="flex items-center gap-2">
                    {o.count !== undefined && <span className="text-xs text-[#64748B]">{toArabicDigits(o.count)} معلم</span>}
                    {active && <CheckCircle2 className="w-5 h-5 text-[#0D4E8B]" />}
                  </span>
                </button>
              );
            })}
          </div>
        </Sheet>
      )}
      {sheet === 'help' && (
        <HelpMeChoose
          data={data}
          onClose={() => setSheet(null)}
          onWhatsApp={openWhatsApp}
          onDone={(f) => {
            apply(f);
            setSheet(null);
            document.getElementById('tutors')?.scrollIntoView({ behavior: 'smooth' });
          }}
        />
      )}
    </section>
  );
};
