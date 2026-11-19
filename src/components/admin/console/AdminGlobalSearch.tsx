import React, { useEffect, useRef, useState } from 'react';
import { FileCheck2, Loader2, MessageCircle, Search, Users, UsersRound, X } from 'lucide-react';
import { AdminConsoleService } from '../../../services/adminConsoleService';
import { AdminSearchResults } from '../../../types/adminConsole';
import { APPLICATION_STATUS_LABELS, LEAD_STATUS_LABELS } from '../../../utils/adminConsole';

export type AdminSearchHit =
  | { type: 'tutor'; id: string }
  | { type: 'parent'; id: string }
  | { type: 'lead'; id: string }
  | { type: 'application'; id: string };

const EMPTY: AdminSearchResults = { tutors: [], parents: [], leads: [], applications: [] };

/** One search box for tutors, parents, leads and applications (name, phone, email, code). */
export const AdminGlobalSearch: React.FC<{
  onOpen: (hit: AdminSearchHit) => void;
  allowedTypes: Array<AdminSearchHit['type']>;
}> = ({ onOpen, allowedTypes }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AdminSearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(EMPTY);
      setLoading(false);
      setError(null);
      return;
    }
    const id = ++seq.current;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const r = await AdminConsoleService.search(q);
        if (id === seq.current) {
          setResults(r);
          setError(null);
        }
      } catch (e: any) {
        if (id === seq.current) setError(e?.message || 'تعذر البحث.');
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const pick = (hit: AdminSearchHit) => {
    setOpen(false);
    setQuery('');
    onOpen(hit);
  };

  const groups: Array<{
    type: AdminSearchHit['type'];
    title: string;
    icon: React.ReactNode;
    rows: Array<{ id: string; title: string; sub: string }>;
  }> = [
    {
      type: 'parent' as const,
      title: 'أولياء الأمور',
      icon: <UsersRound className="w-4 h-4" />,
      rows: results.parents.map((p) => ({ id: p.userId, title: p.name || p.email || 'وليّ أمر', sub: [p.whatsapp, p.email].filter(Boolean).join(' · ') })),
    },
    {
      type: 'tutor' as const,
      title: 'المعلمين',
      icon: <Users className="w-4 h-4" />,
      rows: results.tutors.map((t) => ({ id: t.id, title: t.name, sub: t.isPublished ? 'منشور' : 'مش منشور' })),
    },
    {
      type: 'lead' as const,
      title: 'طلبات أولياء الأمور',
      icon: <MessageCircle className="w-4 h-4" />,
      rows: results.leads.map((l) => ({ id: l.id, title: l.name || l.referenceCode || 'طلب', sub: [l.referenceCode, LEAD_STATUS_LABELS[l.status] || l.status].filter(Boolean).join(' · ') })),
    },
    {
      type: 'application' as const,
      title: 'طلبات الانضمام',
      icon: <FileCheck2 className="w-4 h-4" />,
      rows: results.applications.map((a) => ({ id: a.id, title: a.name || a.referenceCode || 'طلب', sub: [a.referenceCode, APPLICATION_STATUS_LABELS[a.status] || a.status].filter(Boolean).join(' · ') })),
    },
  ].filter((g) => allowedTypes.includes(g.type) && g.rows.length > 0);

  const showPanel = open && query.trim().length >= 2;

  return (
    <div ref={boxRef} className="relative flex-1 min-w-0">
      <label className="relative block">
        <span className="sr-only">بحث</span>
        <Search className="w-4 h-4 text-[#94A3B8] absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          placeholder="ابحث باسم معلم أو وليّ أمر أو رقم موبايل أو كود…"
          aria-label="بحث في المنصة"
          className="w-full h-12 rounded-2xl border border-[#E2E8F0] bg-white pr-11 pl-10 text-sm text-[#1F2A44] shadow-xs outline-none focus:border-[#0D4E8B] focus:ring-4 focus:ring-[#0D4E8B]/10 [&::-webkit-search-cancel-button]:hidden"
        />
        {loading ? (
          <Loader2 className="w-4 h-4 text-[#0D4E8B] animate-spin absolute left-4 top-1/2 -translate-y-1/2" />
        ) : query ? (
          <button
            type="button"
            aria-label="مسح البحث"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg hover:bg-[#F1F5F9] flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4 text-[#64748B]" />
          </button>
        ) : (
          <kbd className="hidden lg:flex absolute left-3 top-1/2 -translate-y-1/2 h-6 min-w-6 px-1.5 rounded-md border border-[#E2E8F0] text-[11px] text-[#94A3B8] items-center justify-center">/</kbd>
        )}
      </label>

      {showPanel && (
        <div
          role="listbox"
          aria-label="نتائج البحث"
          className="absolute z-30 top-full mt-2 inset-x-0 bg-white rounded-3xl border border-[#E2E8F0] shadow-xl p-2 max-h-[60vh] overflow-y-auto"
        >
          {error ? (
            <p className="p-4 text-sm text-rose-700 font-bold">{error}</p>
          ) : groups.length === 0 ? (
            <p className="p-4 text-sm text-[#64748B]">{loading ? 'بندوّر…' : 'مفيش نتايج. جرّب جزء من الاسم أو آخر أرقام الموبايل.'}</p>
          ) : (
            groups.map((g) => (
              <div key={g.type} className="py-1">
                <p className="px-3 py-1.5 text-[11px] font-extrabold text-[#94A3B8] flex items-center gap-1.5">
                  {g.icon}
                  {g.title}
                </p>
                <ul>
                  {g.rows.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={false}
                        onClick={() => pick({ type: g.type, id: r.id } as AdminSearchHit)}
                        className="w-full text-right px-3 py-2.5 rounded-2xl hover:bg-[#F8FAFC] focus:bg-[#F8FAFC] outline-none cursor-pointer"
                      >
                        <span className="block text-sm font-bold text-[#1F2A44] truncate">{r.title}</span>
                        {r.sub && <span className="block text-xs text-[#64748B] truncate" dir="auto">{r.sub}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
