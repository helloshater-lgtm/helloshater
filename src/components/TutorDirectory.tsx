import React, { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, CalendarClock, CheckCircle2, Gift, MessageCircle, Star, User } from 'lucide-react';
import {
  DirectoryData,
  DirectoryFilters,
  DirectoryStageId,
  DirectoryTutor,
  buildDirectorySearch,
  filterDirectory,
  formatEarliestTrial,
  stageChipsFor,
  subjectChipsFor,
} from '../utils/tutorDirectory';
import { toArabicDigits } from '../utils/formatters';
import { trackDirectoryFilter } from '../services/analytics';

const PAGE = 12;

interface Props {
  data: DirectoryData;
  initialFilters: DirectoryFilters;
  onBook: (tutorId: string) => void;
  onOpenProfile: (tutorId: string) => void;
  onHelp: () => void;
}

const Chip: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode; count?: number }> = ({ active, onClick, children, count }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={`shrink-0 h-10 px-4 rounded-full text-sm font-['Cairo'] font-bold whitespace-nowrap transition-colors cursor-pointer ${
      active ? 'bg-[#0D4E8B] text-white shadow-xs' : 'bg-white text-[#1F2A44] border border-[#E2E8F0] hover:border-[#0D4E8B]/40'
    }`}
  >
    {children}
    {count !== undefined && <span className={`ms-1.5 text-xs ${active ? 'text-white/80' : 'text-[#94A3B8]'}`}>{toArabicDigits(count)}</span>}
  </button>
);

const priceLabel = (t: DirectoryTutor) => {
  if (!t.priceMin) return null;
  const p = t.priceMax && t.priceMax !== t.priceMin ? `${toArabicDigits(t.priceMin)}–${toArabicDigits(t.priceMax)}` : toArabicDigits(t.priceMin);
  return `${p} ${t.currency || 'ج.م'}${t.sessionMinutes ? ` / ${toArabicDigits(t.sessionMinutes)} دقيقة` : ''}`;
};

const TutorTile: React.FC<{ t: DirectoryTutor; onBook: () => void; onOpen: () => void }> = ({ t, onBook, onOpen }) => {
  const [imgError, setImgError] = useState(false);
  const earliest = t.bookable ? formatEarliestTrial(t.earliestTrialAt) : null;
  const price = priceLabel(t);
  return (
    <article className="bg-white rounded-3xl border border-[#E2E8F0] shadow-xs p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <button type="button" onClick={onOpen} className="flex items-start gap-3 text-right cursor-pointer">
        <span className="w-16 h-16 rounded-2xl overflow-hidden bg-[#F0F6FD] shrink-0 flex items-center justify-center">
          {t.avatarUrl && !imgError ? (
            <img src={t.avatarUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImgError(true)} className="w-full h-full object-cover object-top" />
          ) : (
            <User className="w-7 h-7 text-[#0D4E8B]" strokeWidth={1.75} />
          )}
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1">
            <span className="font-['Cairo'] text-base font-extrabold text-[#1F2A44] truncate">
              {t.honorific} {t.name}
            </span>
            {t.verified && <BadgeCheck className="w-4 h-4 text-[#0D4E8B] shrink-0" aria-label="متحقق منه" />}
          </span>
          {t.headline && <span className="block text-sm text-[#475569] leading-snug line-clamp-2 mt-0.5">{t.headline}</span>}
        </span>
      </button>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#64748B]">
        {t.rating && t.reviewsCount > 0 ? (
          <span className="flex items-center gap-1 font-bold text-[#1F2A44]">
            <Star className="w-3.5 h-3.5 fill-[#FFC629] text-[#FFC629]" />
            {toArabicDigits(Number(t.rating).toFixed(1))}
            <span className="font-normal text-[#94A3B8]">({toArabicDigits(t.reviewsCount)})</span>
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded-full bg-[#FFF8E1] text-[#8A6100] font-bold">جديد على شاطر</span>
        )}
        {t.yearsOfExperience ? <span>خبرة {toArabicDigits(t.yearsOfExperience)} سنين</span> : null}
        {price && <span className="font-bold text-[#1F2A44]">{price}</span>}
      </div>

      <div className="mt-auto space-y-2">
        {earliest ? (
          <>
            <p className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
              <CalendarClock className="w-4 h-4" strokeWidth={1.75} />
              أقرب تجربة: {earliest}
            </p>
            <button
              type="button"
              onClick={onBook}
              className="w-full h-12 rounded-2xl bg-[#FFC629] hover:bg-[#F5BC18] text-[#1F2A44] font-['Cairo'] font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <Gift className="w-4 h-4" strokeWidth={2} />
              احجز تجربة مجانية
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            className="w-full h-12 rounded-2xl border border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] text-[#0D4E8B] font-['Cairo'] font-extrabold text-sm cursor-pointer"
          >
            شوف الملف والمواعيد
          </button>
        )}
      </div>
    </article>
  );
};

/** Tutors first: filter chips (stage → subject) on top, cards right away. */
export const TutorDirectory: React.FC<Props> = ({ data, initialFilters, onBook, onOpenProfile, onHelp }) => {
  const [filters, setFilters] = useState<DirectoryFilters>(initialFilters);
  const [limit, setLimit] = useState(PAGE);

  const stageChips = useMemo(() => stageChipsFor(data), [data]);
  const subjectChips = useMemo(() => subjectChipsFor(data, filters.stage), [data, filters.stage]);
  const list = useMemo(() => filterDirectory(data, filters), [data, filters]);
  const bookableCount = list.filter((t) => t.bookable && t.earliestTrialAt).length;

  // Keep the URL in sync (shareable, keeps utm_*), without reloading.
  useEffect(() => {
    const search = buildDirectorySearch(window.location.search, filters);
    if (search !== window.location.search) {
      window.history.replaceState(null, '', `${window.location.pathname}${search}${window.location.hash}`);
    }
  }, [filters]);

  const setStage = (stage: DirectoryStageId | null) => {
    const next = { stage, subject: null };
    setFilters(next);
    setLimit(PAGE);
    trackDirectoryFilter(stage, null);
  };
  const setSubject = (subject: string | null) => {
    const next = { stage: filters.stage, subject };
    setFilters(next);
    setLimit(PAGE);
    trackDirectoryFilter(filters.stage, subject);
  };

  const stageLabel = filters.stage ? stageChips.find((c) => c.id === filters.stage)?.label : null;
  const subjectLabel = filters.subject ? subjectChips.find((c) => c.id === filters.subject)?.label : null;
  const title = [subjectLabel, stageLabel].filter(Boolean).join(' · ');

  return (
    <section id="tutors" aria-label="المعلمين" className="w-full bg-gradient-to-b from-[#F0F6FD] to-white border-b border-[#E2E8F0] scroll-mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-10 pb-8 space-y-4">
        <div className="space-y-2 text-center sm:text-right">
          <h1 className="font-['Cairo'] font-black text-[#1F2A44] text-[26px] sm:text-[36px] leading-tight">
            {title ? `معلمين ${title}` : 'اختار معلم لطفلك'}
            <span className="block text-[#0D4E8B] text-lg sm:text-2xl mt-1">واحجز تجربة مجانية ٢٠ دقيقة في دقيقة</span>
          </h1>
          <p className="flex flex-wrap justify-center sm:justify-start gap-x-4 gap-y-1 text-xs sm:text-sm font-bold text-[#0B5D38]">
            <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4" />من غير دفع</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4" />من غير تسجيل</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4" />لو ما عجبكش نرشّحلك غيره</span>
          </p>
        </div>

        {/* Sticky filter bar */}
        <div className="sticky top-[64px] z-30 -mx-4 px-4 sm:mx-0 sm:px-0 py-2 bg-[#F0F6FD]/95 backdrop-blur space-y-2">
          <div role="group" aria-label="المرحلة" className="flex gap-2 overflow-x-auto no-scrollbar">
            <Chip active={!filters.stage} onClick={() => setStage(null)}>الكل</Chip>
            {stageChips.map((c) => (
              <Chip key={c.id} active={filters.stage === c.id} onClick={() => setStage(c.id)}>
                {c.label}
              </Chip>
            ))}
          </div>
          {subjectChips.length > 0 && (
            <div role="group" aria-label="المادة" className="flex gap-2 overflow-x-auto no-scrollbar">
              <Chip active={!filters.subject} onClick={() => setSubject(null)}>كل المواد</Chip>
              {subjectChips.map((c) => (
                <Chip key={c.id} active={filters.subject === c.id} onClick={() => setSubject(c.id)} count={c.count}>
                  {c.label}
                </Chip>
              ))}
            </div>
          )}
        </div>

        <p className="text-sm text-[#64748B]" aria-live="polite">
          {list.length === 0
            ? 'مفيش معلمين للاختيار ده دلوقتي.'
            : `${toArabicDigits(list.length)} معلم${bookableCount ? `، منهم ${toArabicDigits(bookableCount)} عندهم مواعيد تجربة قريبة` : ''}`}
        </p>

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
            <p className="text-center text-sm text-[#64748B]">
              محتار؟{' '}
              <button type="button" onClick={onHelp} className="font-bold text-[#0D4E8B] hover:underline cursor-pointer">
                ساعدني أختار
              </button>
            </p>
          </>
        )}
      </div>
    </section>
  );
};
