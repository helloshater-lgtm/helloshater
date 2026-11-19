import React, { useCallback, useEffect, useState } from 'react';
import { Activity, Loader2 } from 'lucide-react';
import { AdminConsoleService } from '../../../services/adminConsoleService';
import { AdminAuditEntry } from '../../../types/adminConsole';
import { AUDIT_ENTITY_LABELS, describeAuditEntry, formatAdminDateTime, relativeTimeAr } from '../../../utils/adminConsole';
import { Card, EmptyState, ErrorNotice, ICON, LoadingBlock, PageHeader, RefreshButton, toolbarButton } from './AdminConsoleUi';

const FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'كل النشاط' },
  { value: 'tutors', label: AUDIT_ENTITY_LABELS.tutors },
  { value: 'tutor_applications', label: AUDIT_ENTITY_LABELS.tutor_applications },
  { value: 'direct_trial_bookings', label: AUDIT_ENTITY_LABELS.direct_trial_bookings },
  { value: 'parent_leads', label: AUDIT_ENTITY_LABELS.parent_leads },
  { value: 'tutor_profile_drafts', label: AUDIT_ENTITY_LABELS.tutor_profile_drafts },
  { value: 'admin_users', label: AUDIT_ENTITY_LABELS.admin_users },
  { value: 'console', label: 'تصدير وأحداث اللوحة' },
];

const ACTION_DOT: Record<string, string> = {
  insert: 'bg-emerald-500',
  update: 'bg-[#0D4E8B]',
  delete: 'bg-rose-500',
};

/** Who did what and when — every change staff make is recorded by the database itself. */
export const AdminActivityLogView: React.FC = () => {
  const [entity, setEntity] = useState('');
  const [items, setItems] = useState<AdminAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await AdminConsoleService.listAuditLog(50, null, entity || null);
      setItems(list);
      setHasMore(list.length === 50);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [entity]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = async () => {
    const last = items[items.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const list = await AdminConsoleService.listAuditLog(50, last.id, entity || null);
      setItems((prev) => [...prev, ...list]);
      setHasMore(list.length === 50);
    } catch (e) {
      setError(e);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="سجل النشاط"
        subtitle="كل تعديل بيعمله فريق الإدارة بيتسجّل هنا لوحده: مين، عمل إيه، وإمتى."
        actions={<RefreshButton onClick={load} loading={loading} />}
      />

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {FILTERS.map((f) => (
          <button
            key={f.value || 'all'}
            type="button"
            aria-pressed={entity === f.value}
            onClick={() => setEntity(f.value)}
            className={`min-h-[40px] px-4 rounded-full text-sm font-bold whitespace-nowrap cursor-pointer ${
              entity === f.value ? 'bg-[#0D4E8B] text-white' : 'bg-white border border-[#E2E8F0] text-[#475569] hover:bg-[#F8FAFC]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error ? <ErrorNotice error={error} onRetry={load} /> : null}

      <Card>
        {loading && items.length === 0 ? (
          <LoadingBlock />
        ) : items.length === 0 ? (
          <EmptyState icon={<Activity {...ICON} />} title="مفيش نشاط مسجّل لسه" hint="أي تعديل من الفريق بعد تفعيل التحديث هيظهر هنا." />
        ) : (
          <ol className="relative">
            {items.map((e) => (
              <li key={e.id} className="relative pr-6 pb-4 last:pb-0">
                <span className="absolute right-[5px] top-2 bottom-0 w-px bg-[#E2E8F0]" aria-hidden="true" />
                <span className={`absolute right-0 top-1.5 w-[11px] h-[11px] rounded-full ring-4 ring-white ${ACTION_DOT[e.action] || 'bg-slate-400'}`} aria-hidden="true" />
                <p className="text-sm text-[#1F2A44] leading-relaxed">{describeAuditEntry(e)}</p>
                <p className="text-xs text-[#64748B] mt-0.5">
                  <span dir="ltr">{e.actorEmail || '—'}</span>
                  <span> · </span>
                  <time dateTime={e.createdAt} title={formatAdminDateTime(e.createdAt)}>{relativeTimeAr(e.createdAt)}</time>
                </p>
              </li>
            ))}
          </ol>
        )}
        {hasMore && (
          <div className="flex justify-center pt-4">
            <button type="button" onClick={loadMore} disabled={loadingMore} className={toolbarButton}>
              {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>أقدم</span>
            </button>
          </div>
        )}
      </Card>
    </div>
  );
};
