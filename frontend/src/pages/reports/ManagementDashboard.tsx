/**
 * Management Dashboard
 *
 * Default landing page for role: MANAGEMENT.
 * Project-centric view: active/completed projects in the current CSAT
 * cycle, eligibility rate, avg CSAT score. Sparkline trend charts inside
 * the KPI cards are intentionally left out of this pass — everything else
 * (KPI numbers, Active Projects table, Completed Projects table with
 * search) is built out.
 */
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useAuthStore } from '../../store/auth.store';
import { useDashboard } from '../../hooks/useDashboard';
import { csatCyclesApi } from '../../api/csat-cycles.api';
import { EnrolledProject, EligibilityStatus } from '../../types/csat-cycle.types';
import { BRAND } from '../../utils/constants';

// ─── KPI card (no trend sparkline — per this pass) ────────────────────────────
const KpiCard: React.FC<{
  label: string; value: string | number; sub?: string; accent: string; icon?: string;
}> = ({ label, value, sub, accent, icon }) => (
  <div style={{
    background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14,
    padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14,
  }}>
    {icon && (
      <div style={{
        width: 40, height: 40, borderRadius: 10, background: `${accent}1A`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
      }}>
        {icon}
      </div>
    )}
    <div>
      <p style={{ fontSize: 26, fontWeight: 700, color: BRAND.textDark, margin: 0, lineHeight: 1.1 }}>{value}</p>
      <p style={{ fontSize: 13, color: BRAND.textMid, margin: '4px 0 0', fontWeight: 500 }}>{label}</p>
      {sub && <p style={{ fontSize: 11.5, color: BRAND.textLight, margin: '3px 0 0' }}>{sub}</p>}
    </div>
  </div>
);

// ─── Eligibility status pill ───────────────────────────────────────────────────
function StatusPill({ status }: { status: EligibilityStatus }) {
  const map: Record<EligibilityStatus, { bg: string; text: string; label: string }> = {
    eligible:         { bg: '#E7F6EC', text: '#1A5C3A', label: 'Eligible' },
    approved:         { bg: '#E7F6EC', text: '#1A5C3A', label: 'Eligible' },
    pending_approval:  { bg: '#EFF4FF', text: '#2563EB', label: 'Pending' },
    exempted:         { bg: '#FEF2F2', text: '#B91C1C', label: 'Not Eligible' },
    declined:         { bg: '#FEF2F2', text: '#B91C1C', label: 'Not Eligible' },
  };
  const m = map[status] ?? map.eligible;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '4px 12px',
      borderRadius: 20, fontSize: 12, fontWeight: 600, background: m.bg, color: m.text,
    }}>
      {m.label}
    </span>
  );
}

// Completion (has the project itself finished, per its TMS EndDate) and
// eligibility (is it in-scope for CSAT feedback this cycle) are two
// separate things. Every row in the "Completed Projects" table already IS
// completed — that's the filter used to fetch it — so it always needs a
// plain "Completed" badge here, never the eligibility pill above (which
// would just show whatever eligibility_status happens to be, e.g.
// "Eligible", and confusingly imply the project were still ongoing).
function CompletedPill() {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '4px 12px',
      borderRadius: 20, fontSize: 12, fontWeight: 600, background: '#F3F4F6', color: '#6B7280',
    }}>
      Completed
    </span>
  );
}

// ─── Row-avatar (initials-free placeholder icon, matches the screenshot) ──────
function ProjectAvatar() {
  return (
    <div style={{
      width: 34, height: 34, borderRadius: 8, background: '#EEF4F0',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={BRAND.green} strokeWidth="2">
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    </div>
  );
}

const fmtDate = (iso?: string) => iso
  ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
  : '—';

// ─── Main component ────────────────────────────────────────────────────────────
export const ManagementDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const [eligibleFilter, setEligibleFilter] = useState<'active' | 'completed'>('active');

  const { data: dashData } = useDashboard();

  const { data: cyclesData } = useQuery({
    queryKey: ['csatCycles', 'dashboard'],
    queryFn: () => csatCyclesApi.list(0, 20),
  });

  // Pick the cycle whose window contains today; fall back to the most
  // recently started one if nothing matches (e.g. between cycles).
  const currentCycle = useMemo(() => {
    const cycles = cyclesData?.data ?? [];
    if (cycles.length === 0) return null;
    const today = new Date();
    const inWindow = cycles.find(c => {
      const start = c.start_date ?? c.startDate;
      const end = c.end_date ?? c.endDate;
      return start && end && new Date(start) <= today && today <= new Date(end);
    });
    if (inWindow) return inWindow;
    return [...cycles].sort((a, b) => {
      const aStart = new Date(a.start_date ?? a.startDate ?? 0).getTime();
      const bStart = new Date(b.start_date ?? b.startDate ?? 0).getTime();
      return bStart - aStart;
    })[0];
  }, [cyclesData]);

  const cycleId = currentCycle?.id;

  // "Eligible Projects" — projects in the current cycle whose eligibility_status
  // is 'eligible' or 'approved' (the latter covers projects that went through a
  // not-sure → manager-approval escalation and came back eligible). We use the
  // eligibility filter (`status: 'eligible'`), NOT project completion, to decide
  // WHICH projects belong in this list at all.
  //
  // Within that list, `eligibleFilter` (active/completed) further splits it by
  // whether the project itself is still in progress or has already finished —
  // purely by comparing TMS EndDate to today (see _get_tms_live_completion_bulk
  // on the backend): active = EndDate is in the future (or unset), completed =
  // EndDate has passed. TMS's own IsProjectActive flag is not used for this at
  // all, since it isn't kept reliably in sync with reality on the TMS side.
  const { data: eligibleData, isLoading: eligibleLoading } = useQuery({
    queryKey: ['dashboardEligibleProjects', cycleId, eligibleFilter],
    queryFn: () => csatCyclesApi.listProjects(cycleId!, { status: 'eligible', project_status: eligibleFilter, limit: 100, active_first: false }),
    enabled: !!cycleId,
  });

  const { data: completedData, isLoading: completedLoading } = useQuery({
    queryKey: ['dashboardCompletedProjects', cycleId],
    queryFn: () => csatCyclesApi.listProjects(cycleId!, { project_status: 'completed', limit: 100 }),
    enabled: !!cycleId,
  });

  const eligibleProjects = eligibleData?.data ?? [];
  const eligibleTotal = eligibleData?.total ?? 0;
  const completedTotal = completedData?.total ?? 0;

  const completedProjects = useMemo(() => {
    const list = completedData?.data ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(p => p.project_name.toLowerCase().includes(q));
  }, [completedData, search]);

  // Summary is cycle-wide regardless of which filter was used to fetch it
  // (backend computes it from the full cycle) — either call's summary works here.
  const summary = eligibleData?.summary ?? completedData?.summary;
  const readyCount = eligibleData?.ready_count ?? completedData?.ready_count;
  const eligibilityRate = useMemo(() => {
    if (!summary || readyCount == null) return null;
    const total = Object.values(summary).reduce((a, b) => a + (b ?? 0), 0);
    if (total === 0) return null;
    // Uses the backend's ready_count (eligible/approved AND addition itself
    // confirmed) rather than summary.eligible + summary.approved directly —
    // those raw eligibility_status counts include projects still awaiting
    // addition approval, which inflated this rate to disagree with the
    // cycle detail page's actual "Ready" count.
    return Math.round((readyCount / total) * 100);
  }, [summary, readyCount]);

  const avgScore = dashData?.metrics?.averageCsatScore;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.displayName?.split(' ')[0] ?? user?.first_name ?? 'there';

  const cyclePeriod = currentCycle
    ? `${fmtDate(currentCycle.start_date ?? currentCycle.startDate)} – ${fmtDate(currentCycle.end_date ?? currentCycle.endDate)}`
    : null;

  return (
    <PageWrapper>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: BRAND.textDark, margin: 0 }}>
              {greeting}, {firstName}!
            </h1>
            <p style={{ fontSize: 13, color: BRAND.textMid, margin: '2px 0 0' }}>
              Here's what's happening with your CSAT cycles.
            </p>
          </div>
        </div>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <KpiCard
            label="Eligible Projects" value={eligibleLoading ? '—' : (readyCount ?? eligibleTotal)}
            sub={readyCount ? `${readyCount} ready in this cycle` : undefined}
            accent="#1A5C3A"
          />
          <KpiCard
            label="Completed Projects" value={completedLoading ? '—' : completedTotal}
            sub={cyclePeriod ?? undefined}
            accent="#2563EB"
          />
          <KpiCard
            label="Eligibility Rate" value={eligibilityRate != null ? `${eligibilityRate}%` : '—'}
            sub="Across all projects in this cycle"
            accent="#7C3AED"
          />
          <KpiCard
            label="Avg CSAT Score" value={avgScore != null ? `${avgScore.toFixed(1)}/10` : '—'}
            sub={currentCycle ? currentCycle.cycle_name ?? currentCycle.cycleName : undefined}
            accent="#D97706"
          />
        </div>

        {/* Eligible Projects */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: BRAND.textDark, margin: 0 }}>Eligible Projects</h2>
              <span style={{
                background: '#E7F6EC', color: BRAND.green, fontSize: 12, fontWeight: 700,
                padding: '2px 9px', borderRadius: 20,
              }}>
                {eligibleTotal}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: 8, padding: 3 }}>
                {(['active', 'completed'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setEligibleFilter(f)}
                    style={{
                      fontSize: 12.5, fontWeight: 600, padding: '6px 14px', borderRadius: 6,
                      border: 'none', cursor: 'pointer',
                      background: eligibleFilter === f ? '#fff' : 'transparent',
                      color: eligibleFilter === f ? BRAND.textDark : BRAND.textLight,
                      boxShadow: eligibleFilter === f ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    {f === 'active' ? 'Active' : 'Completed'}
                  </button>
                ))}
              </div>
              {cycleId && (
                <button
                  onClick={() => navigate(`/csat-cycles/${cycleId}?filter=ready&from=reports`)}
                  style={{ fontSize: 13, fontWeight: 600, color: BRAND.textMid, background: '#F3F4F6', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer' }}
                >
                  View all
                </button>
              )}
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ maxHeight: 340, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #F1F3F4' }}>
                    {['Project', 'Project Manager', 'Status', ''].map(h => (
                      <th key={h} style={{
                        padding: '12px 20px', fontSize: 11, fontWeight: 600, color: BRAND.textLight,
                        textAlign: h === '' ? 'right' : 'left', letterSpacing: '0.04em', textTransform: 'uppercase',
                        position: 'sticky', top: 0, background: '#fff', zIndex: 1,
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {eligibleLoading ? (
                    <tr><td colSpan={4} style={{ padding: 30, textAlign: 'center', color: BRAND.textLight, fontSize: 13 }}>Loading…</td></tr>
                  ) : eligibleProjects.length === 0 ? (
                    <tr><td colSpan={4} style={{ padding: 30, textAlign: 'center', color: BRAND.textLight, fontSize: 13 }}>
                      No {eligibleFilter} eligible projects in this cycle{eligibleFilter === 'completed' ? ' yet' : ''}.
                    </td></tr>
                  ) : eligibleProjects.map((p: EnrolledProject, i) => (
                    <tr key={p.enrollment_id} style={{ borderLeft: i === 0 ? `3px solid ${BRAND.green}` : '3px solid transparent', borderBottom: '1px solid #F6F7F8' }}>
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <ProjectAvatar />
                          <div>
                            <p style={{ fontSize: 13.5, fontWeight: 600, color: BRAND.textDark, margin: 0 }}>{p.project_name}</p>
                            <p style={{ fontSize: 11.5, color: BRAND.textLight, margin: '2px 0 0' }}>Added on {fmtDate(p.enrolled_at)}</p>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 20px', fontSize: 13, color: BRAND.textMid }}>
                        {p.project_manager_name ?? '—'}
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <StatusPill status={p.eligibility_status} />
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                        <button
                          onClick={() => navigate(`/projects/${p.project_ext_id}`)}
                          style={{ fontSize: 12.5, fontWeight: 600, color: BRAND.textMid, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Completed Projects */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: BRAND.textDark, margin: 0 }}>Completed Projects</h2>
              <p style={{ fontSize: 12.5, color: BRAND.textLight, margin: '2px 0 0' }}>
                {completedTotal} completed{cyclePeriod ? ` · ${cyclePeriod}` : ''}
              </p>
            </div>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search projects..."
              style={{
                border: '1px solid #E5E7EB', borderRadius: 9, padding: '8px 14px',
                fontSize: 13, width: 220, outline: 'none',
              }}
            />
          </div>

          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #F1F3F4' }}>
                  {['Project', 'Project Manager', 'Enrolled', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '12px 20px', fontSize: 11, fontWeight: 600, color: BRAND.textLight, textAlign: h === '' ? 'right' : 'left', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {completedLoading ? (
                  <tr><td colSpan={5} style={{ padding: 30, textAlign: 'center', color: BRAND.textLight, fontSize: 13 }}>Loading…</td></tr>
                ) : completedProjects.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: 30, textAlign: 'center', color: BRAND.textLight, fontSize: 13 }}>
                    {search ? 'No completed projects match your search.' : 'No completed projects in this cycle yet.'}
                  </td></tr>
                ) : completedProjects.map((p: EnrolledProject) => (
                  <tr key={p.enrollment_id} style={{ borderBottom: '1px solid #F6F7F8' }}>
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <ProjectAvatar />
                        <p style={{ fontSize: 13.5, fontWeight: 600, color: BRAND.textDark, margin: 0 }}>{p.project_name}</p>
                      </div>
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: 13, color: BRAND.textMid }}>
                      {p.project_manager_name ?? '—'}
                    </td>
                    <td style={{ padding: '14px 20px', fontSize: 13, color: BRAND.textMid }}>
                      {fmtDate(p.enrolled_at)}
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <CompletedPill />
                    </td>
                    <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                      <button
                        onClick={() => navigate(`/projects/${p.project_ext_id}`)}
                        style={{ fontSize: 12.5, fontWeight: 600, color: BRAND.textMid, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}
                      >
                        View Report
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
};