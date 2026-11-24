import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, ChevronLeft, Filter, GaugeCircle, Megaphone, ShieldCheck } from 'lucide-react';
import { AdminConsoleService } from '../../../services/adminConsoleService';
import { AdminFunnelReport, AdminQualityReport } from '../../../types/adminConsole';
import { formatPercent, percent, qualityFlags, sourceLabel } from '../../../utils/adminConsole';
import { toArabicDigits } from '../../../utils/formatters';
import { AdminAdLinkBuilder } from './AdminAdLinkBuilder';
import { AdminSlotReminders } from './AdminSlotReminders';
import { Card, EmptyState, ErrorNotice, ICON, LoadingBlock, PageHeader, Pill, RefreshButton, Segmented, StatTile } from './AdminConsoleUi';

const FunnelBars: React.FC<{ steps: Array<{ label: string; value: number }> }> = ({ steps }) => {
  const top = steps[0]?.value || 0;
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => {
        const width = top ? Math.max(4, Math.round((100 * s.value) / top)) : 0;
        const fromPrev = i > 0 ? percent(s.value, steps[i - 1].value) : null;
        return (
          <li key={s.label}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-bold text-[#1F2A44]">{s.label}</span>
              <span className="tabular-nums text-[#1F2A44]">
                <span className="font-['Cairo'] font-extrabold">{toArabicDigits(s.value)}</span>
                {fromPrev !== null && <span className="text-xs text-[#64748B]"> · {formatPercent(fromPrev)} من اللي قبلها</span>}
              </span>
            </div>
            <div className="mt-1.5 h-3 rounded-full bg-[#F1F5F9] overflow-hidden" aria-hidden="true">
              <div className="h-full rounded-full bg-[#0D4E8B]" style={{ width: `${width}%`, opacity: 1 - i * 0.15 }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
};

export const AdminQualityView: React.FC<{
  onOpenTutor?: (tutorId: string) => void;
}> = ({ onOpenTutor }) => {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [quality, setQuality] = useState<AdminQualityReport | null>(null);
  const [funnel, setFunnel] = useState<AdminFunnelReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [q, f] = await Promise.all([AdminConsoleService.getQuality(days), AdminConsoleService.getFunnel(days)]);
      setQuality(q);
      setFunnel(f);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const flagged = quality?.tutors.filter((t) => qualityFlags(t).length > 0) || [];
  const maxWeek = Math.max(1, ...(funnel?.weeks || []).map((w) => Math.max(w.leads, w.bookings)));

  return (
    <div className="space-y-5">
      <PageHeader
        title="الجودة والأداء"
        subtitle="أولياء الأمور بيوصلوا منين، وبيكملوا لحد فين، والمعلمين ملتزمين ولا لأ."
        actions={
          <>
            <Segmented
              label="الفترة"
              value={days}
              onChange={setDays}
              options={[
                { value: 7, label: '٧ أيام' },
                { value: 30, label: '٣٠ يوم' },
                { value: 90, label: '٩٠ يوم' },
              ]}
            />
            <RefreshButton onClick={load} loading={loading} />
          </>
        }
      />

      {error ? <ErrorNotice error={error} onRetry={load} /> : null}
      <AdminSlotReminders />
      <AdminAdLinkBuilder />
      {loading && !funnel ? <LoadingBlock /> : null}

      {funnel && quality && (
        <>
          <section aria-label="ملخص" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile label="طلبات واتساب" value={funnel.leads.total} hint={`${toArabicDigits(funnel.leads.new)} لسه جديدة`} />
            <StatTile label="حجز مباشر" value={funnel.direct.booked} hint={`${toArabicDigits(funnel.direct.upcoming)} حصة جاية`} />
            <StatTile label="نسبة الحضور" value={formatPercent(percent(funnel.direct.attended, funnel.direct.reported))} hint="من تقارير المعلمين" tone="green" />
            <StatTile
              label="معلمين من غير حجوزات"
              value={quality.publishedWithoutBookings}
              hint={`من ${toArabicDigits(quality.publishedTutors)} منشور`}
              tone={quality.publishedWithoutBookings > 0 ? 'amber' : 'green'}
            />
          </section>

          <div className="grid lg:grid-cols-2 gap-5">
            <Card title="مسار طلبات الواتساب" subtitle="من أول ما وليّ الأمر يبعت لحد ما يشترك" icon={<Filter {...ICON} />}>
              {funnel.leads.total === 0 ? (
                <p className="text-sm text-[#64748B]">مفيش طلبات في الفترة دي.</p>
              ) : (
                <FunnelBars
                  steps={[
                    { label: 'طلب', value: funnel.leads.total },
                    { label: 'اتكلمنا معاه', value: funnel.leads.contacted },
                    { label: 'حصة تجريبية', value: funnel.leads.trial },
                    { label: 'اشترك', value: funnel.leads.subscribed },
                  ]}
                />
              )}
            </Card>
            <Card title="مسار الحجز المباشر" subtitle="الحجز من صفحة المعلم" icon={<Filter {...ICON} />}>
              {funnel.direct.booked === 0 ? (
                <p className="text-sm text-[#64748B]">مفيش حجوزات في الفترة دي.</p>
              ) : (
                <FunnelBars
                  steps={[
                    { label: 'حجز', value: funnel.direct.booked },
                    { label: 'ميعادها عدّى ومتلغتش', value: funnel.direct.held },
                    { label: 'المعلم كتب تقرير', value: funnel.direct.reported },
                    { label: 'الطفل حضر', value: funnel.direct.attended },
                  ]}
                />
              )}
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            <Card title="مصادر الطلبات" subtitle="من رابط الإعلان (utm_source)" icon={<Megaphone {...ICON} />}>
              {funnel.sources.length === 0 ? (
                <p className="text-sm text-[#64748B]">مفيش بيانات.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-[#64748B]">
                    <tr>
                      <th className="text-right font-bold pb-2">المصدر</th>
                      <th className="text-right font-bold pb-2">طلبات</th>
                      <th className="text-right font-bold pb-2">اشتركوا</th>
                      <th className="text-right font-bold pb-2">التحويل</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {funnel.sources.map((s) => (
                      <tr key={s.source}>
                        <td className="py-2 font-bold text-[#1F2A44]">{sourceLabel(s.source)}</td>
                        <td className="py-2 tabular-nums">{toArabicDigits(s.total)}</td>
                        <td className="py-2 tabular-nums">{toArabicDigits(s.subscribed)}</td>
                        <td className="py-2 tabular-nums">{formatPercent(percent(s.subscribed, s.total))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            <Card title="آخر ٨ أسابيع" subtitle="طلبات واتساب وحجز مباشر كل أسبوع" icon={<BarChart3 {...ICON} />}>
              <div className="flex items-center gap-4 text-xs text-[#64748B] mb-3">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#FFC629]" />طلبات</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#0D4E8B]" />حجوزات</span>
              </div>
              <div className="flex items-end gap-2" role="img" aria-label="رسم بياني أسبوعي للطلبات والحجوزات">
                {funnel.weeks.map((w) => (
                  <div key={w.weekStart} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <div className="w-full h-32 flex items-end justify-center gap-0.5">
                      <div className="w-1/2 max-w-3 rounded-t bg-[#FFC629]" style={{ height: `${(100 * w.leads) / maxWeek}%` }} title={`طلبات: ${w.leads}`} />
                      <div className="w-1/2 max-w-3 rounded-t bg-[#0D4E8B]" style={{ height: `${(100 * w.bookings) / maxWeek}%` }} title={`حجوزات: ${w.bookings}`} />
                    </div>
                    <span className="text-[10px] text-[#94A3B8] tabular-nums">
                      {new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'numeric' }).format(new Date(w.weekStart))}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card
            title="التزام المعلمين"
            subtitle="روابط الحصص، التقارير، الغياب والإلغاء (للحجز المباشر)"
            icon={<GaugeCircle {...ICON} />}
            aside={flagged.length > 0 ? <Pill tone="amber">{toArabicDigits(flagged.length)} محتاج متابعة</Pill> : <Pill tone="green">كله تمام</Pill>}
          >
            {quality.tutors.length === 0 ? (
              <EmptyState icon={<ShieldCheck {...ICON} />} title="مفيش حجوزات في الفترة دي" />
            ) : (
              <ul className="divide-y divide-[#F1F5F9]">
                {quality.tutors.map((t) => {
                  const flags = qualityFlags(t);
                  return (
                    <li key={t.tutorId} className="py-3 flex flex-wrap items-center gap-3">
                      <div className="flex-1 min-w-[12rem]">
                        <p className="text-sm font-bold text-[#1F2A44]">
                          {t.tutorName || t.tutorId}
                          {!t.isPublished && <span className="text-xs font-normal text-[#94A3B8]"> · مش منشور</span>}
                        </p>
                        <p className="text-xs text-[#64748B]">
                          {toArabicDigits(t.bookings)} حجز · {toArabicDigits(t.completed)} اتعملت · {toArabicDigits(t.reports)} تقرير
                          {t.rating ? ` · تقييم ${toArabicDigits(Number(t.rating).toFixed(1))}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {flags.length ? flags.map((f) => <Pill key={f.label} tone={f.tone}>{f.label}</Pill>) : <Pill tone="green">ملتزم</Pill>}
                      </div>
                      {onOpenTutor && (
                        <button type="button" onClick={() => onOpenTutor(t.tutorId)} aria-label={`فتح ${t.tutorName || ''}`} className="w-9 h-9 rounded-xl hover:bg-[#EBF3FC] text-[#0D4E8B] flex items-center justify-center cursor-pointer">
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
};
