import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, MailPlus, ShieldCheck, UserCog, X } from 'lucide-react';
import { AdminConsoleService } from '../../../services/adminConsoleService';
import { AdminRole, AdminTeam } from '../../../types/adminConsole';
import { ADMIN_ROLE_DESCRIPTIONS, ADMIN_ROLE_LABELS, relativeTimeAr } from '../../../utils/adminConsole';
import { Card, ErrorNotice, ICON, LoadingBlock, PageHeader, Pill, RefreshButton, inputClass, primaryButton } from './AdminConsoleUi';

const ROLES: AdminRole[] = ['support', 'admin', 'super_admin'];

const roleTone = (r: AdminRole) => (r === 'super_admin' ? 'blue' : r === 'admin' ? 'green' : 'slate') as 'blue' | 'green' | 'slate';

export const AdminTeamView: React.FC = () => {
  const [team, setTeam] = useState<AdminTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('support');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTeam(await AdminConsoleService.getTeam());
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (key: string, fn: () => Promise<string | void>) => {
    setBusy(key);
    setNotice(null);
    try {
      const msg = await fn();
      if (msg) setNotice({ type: 'success', text: msg });
      await load();
    } catch (e: any) {
      setNotice({ type: 'error', text: e?.message || 'حصلت مشكلة.' });
    } finally {
      setBusy(null);
    }
  };

  const invite = (e: React.FormEvent) => {
    e.preventDefault();
    run('invite', async () => {
      const status = await AdminConsoleService.inviteTeamMember(email, role);
      setEmail('');
      return status === 'added'
        ? 'اتضاف للفريق. يقدر يدخل لوحة الإدارة بإيميله دلوقتي.'
        : 'اتبعتت الدعوة. أول ما يدخل لوحة الإدارة بكود الإيميل هيتفعّل حسابه.';
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="الفريق والصلاحيات"
        subtitle="ضيف فريقك، وكل واحد يشوف ويعمل اللي محتاجه بس."
        actions={<RefreshButton onClick={load} loading={loading} />}
      />

      {notice && (
        <p role={notice.type === 'error' ? 'alert' : 'status'} className={`p-3 rounded-2xl text-sm font-bold ${notice.type === 'error' ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>
          {notice.text}
        </p>
      )}

      <div className="grid lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-5">
          <Card title="أعضاء الفريق" icon={<UserCog {...ICON} />}>
            {error ? (
              <ErrorNotice error={error} onRetry={load} />
            ) : !team ? (
              <LoadingBlock />
            ) : (
              <ul className="divide-y divide-[#F1F5F9]">
                {team.members.map((m) => (
                  <li key={m.userId} className="py-3 flex flex-wrap items-center gap-3">
                    <span className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-['Cairo'] font-extrabold uppercase ${m.isActive ? 'bg-[#EBF3FC] text-[#0D4E8B]' : 'bg-slate-100 text-slate-400'}`}>
                      {m.email.charAt(0)}
                    </span>
                    <div className="flex-1 min-w-[12rem]">
                      <p className={`text-sm font-bold truncate ${m.isActive ? 'text-[#1F2A44]' : 'text-[#94A3B8] line-through'}`} dir="ltr">
                        {m.email}
                      </p>
                      <p className="text-xs text-[#64748B]">
                        {m.isMe ? 'أنت · ' : ''}آخر دخول {relativeTimeAr(m.lastSignInAt)}
                      </p>
                    </div>
                    {m.isMe ? (
                      <Pill tone={roleTone(m.role)}>{ADMIN_ROLE_LABELS[m.role]}</Pill>
                    ) : (
                      <div className="flex items-center gap-2">
                        <label className="sr-only" htmlFor={`role-${m.userId}`}>صلاحية {m.email}</label>
                        <select
                          id={`role-${m.userId}`}
                          value={m.role}
                          disabled={busy !== null || !m.isActive}
                          onChange={(e) => run(m.userId, async () => {
                            await AdminConsoleService.updateTeamMember(m.userId, e.target.value as AdminRole, m.isActive);
                            return 'اتغيرت الصلاحية.';
                          })}
                          className="h-10 rounded-xl border border-[#CBD5E1] bg-white px-2 text-sm"
                        >
                          {ROLES.map((r) => <option key={r} value={r}>{ADMIN_ROLE_LABELS[r]}</option>)}
                        </select>
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => {
                            if (m.isActive && !window.confirm(`إيقاف دخول ${m.email} للوحة الإدارة؟`)) return;
                            run(m.userId, async () => {
                              await AdminConsoleService.updateTeamMember(m.userId, m.role, !m.isActive);
                              return m.isActive ? 'اتوقف الحساب.' : 'اتفعّل الحساب.';
                            });
                          }}
                          className={`h-10 px-3 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 ${m.isActive ? 'text-rose-700 hover:bg-rose-50' : 'text-emerald-700 hover:bg-emerald-50'}`}
                        >
                          {busy === m.userId ? <Loader2 className="w-4 h-4 animate-spin" /> : m.isActive ? 'إيقاف' : 'تفعيل'}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {team && team.invites.length > 0 && (
            <Card title="دعوات مستنية" subtitle="هتتفعّل أول ما الشخص يدخل لوحة الإدارة بكود الإيميل." icon={<MailPlus {...ICON} />} tone="amber">
              <ul className="divide-y divide-[#F1F5F9]">
                {team.invites.map((i) => (
                  <li key={i.email} className="py-2.5 flex items-center gap-3">
                    <span className="flex-1 min-w-0 text-sm font-bold text-[#1F2A44] truncate" dir="ltr">{i.email}</span>
                    <Pill tone={roleTone(i.role)}>{ADMIN_ROLE_LABELS[i.role]}</Pill>
                    <button
                      type="button"
                      aria-label={`إلغاء دعوة ${i.email}`}
                      disabled={busy !== null}
                      onClick={() => run(i.email, async () => {
                        await AdminConsoleService.cancelInvite(i.email);
                        return 'اتلغت الدعوة.';
                      })}
                      className="w-9 h-9 rounded-xl hover:bg-rose-50 text-rose-700 flex items-center justify-center cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card title="إضافة عضو" icon={<MailPlus {...ICON} />}>
            <form onSubmit={invite} className="space-y-3">
              <label className="block space-y-1">
                <span className="text-sm font-bold text-[#1F2A44]">الإيميل</span>
                <input type="email" required dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className={inputClass} />
              </label>
              <fieldset className="space-y-2">
                <legend className="text-sm font-bold text-[#1F2A44] mb-1">الصلاحية</legend>
                {ROLES.map((r) => (
                  <label key={r} className={`flex items-start gap-2.5 p-3 rounded-2xl border cursor-pointer ${role === r ? 'border-[#0D4E8B] bg-[#F0F6FD]' : 'border-[#E2E8F0]'}`}>
                    <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="mt-1 accent-[#0D4E8B]" />
                    <span>
                      <span className="block text-sm font-bold text-[#1F2A44]">{ADMIN_ROLE_LABELS[r]}</span>
                      <span className="block text-xs text-[#64748B] leading-relaxed">{ADMIN_ROLE_DESCRIPTIONS[r]}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <button type="submit" disabled={busy !== null || !email.trim()} className={`${primaryButton} w-full`}>
                {busy === 'invite' && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>إضافة</span>
              </button>
            </form>
          </Card>
          <div className="p-4 rounded-3xl bg-[#F8FAFC] text-xs text-[#64748B] leading-relaxed flex gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0 text-[#0D4E8B]" />
            <span>مينفعش تغيّر صلاحيتك أنت. كل إضافة أو تغيير بيتسجّل في «سجل النشاط».</span>
          </div>
        </div>
      </div>
    </div>
  );
};
