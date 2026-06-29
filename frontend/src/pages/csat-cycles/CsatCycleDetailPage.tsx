/**
 * CSAT Cycle Detail Page
 */
import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { csatCyclesApi } from '../../api/csat-cycles.api';
import { projectsApi } from '../../api/projects.api';
import { useAuthStore } from '../../store/auth.store';
import { UserRole } from '../../types/auth.types';
import {
  EnrolledProject, EligibilityStatus,
  ELIGIBILITY_LABELS, ELIGIBILITY_COLORS,
} from '../../types/csat-cycle.types';
import { formatDate } from '../../utils/formatters';
import { deriveStatus } from '../projects/ProjectListPage';

const BRAND = { green: '#1A5C3A', gold: '#9B7C2A' };

type EligFilter = 'all' | EligibilityStatus;

// ─── Badge ────────────────────────────────────────────────────────────────────
function EligibilityBadge({ status }: { status: EligibilityStatus }) {
  const c = ELIGIBILITY_COLORS[status];
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border"
      style={{ background: c.bg, color: c.text, borderColor: c.border }}
    >
      {ELIGIBILITY_LABELS[status]}
    </span>
  );
}

// ─── Enroll Modal ─────────────────────────────────────────────────────────────
function EnrollModal({
  cycleId, enrolledIds, onClose, onDone, cycleStartDate, cycleEndDate,
}: {
  cycleId: number; enrolledIds: Set<number>; onClose: () => void; onDone: () => void;
  cycleStartDate: string | null;   // e.g. "2025-07-01T00:00:00"
  cycleEndDate: string | null;     // e.g. "2025-12-31T23:59:59"
}) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // FIX 1: include enrolledIds.size in query key so the list refreshes
  // whenever the enrolled set changes (after a successful enrollment).
  const { data, isLoading } = useQuery({
    queryKey: ['projects-for-enroll', enrolledIds.size],
    queryFn: () => projectsApi.list(0, 500),
    staleTime: 0, // always fresh when modal opens
  });

  const { activeProjects, completedProjects } = useMemo(() => {
    const projects = (data as any)?.projects ?? [];
    const available = projects.filter((p: any) =>
      !enrolledIds.has(p.project_id) &&
      (search === '' || p.project_name.toLowerCase().includes(search.toLowerCase()))
    );
    const active: any[] = [];
    const completed: any[] = [];
    const cycleStart = cycleStartDate ? new Date(cycleStartDate) : null;
    const cycleEnd   = cycleEndDate   ? new Date(cycleEndDate)   : null;
    for (const p of available) {
      const status = deriveStatus(p.end_date ?? null);
      if (status === 'active' || status === 'testing') {
        active.push(p);
      } else {
         if (cycleStart && cycleEnd && p.end_date) {
      const projectEnd = new Date(p.end_date);
      if (projectEnd >= cycleStart && projectEnd <= cycleEnd) {
        completed.push(p);
      }
      // else: completed outside this cycle's window — don't show
      }
         // if cycle dates unknown, fall back to showing all completed (safe default)
        else if (!cycleStart || !cycleEnd) {
      completed.push(p);
        }
      }
    }
    active.sort((a, b) => a.project_name.localeCompare(b.project_name));
    completed.sort((a, b) => a.project_name.localeCompare(b.project_name));
    return { activeProjects: active, completedProjects: completed };
  }, [data, enrolledIds, search]);

  const totalFiltered = activeProjects.length + completedProjects.length;

  const mutation = useMutation({
    mutationFn: () => csatCyclesApi.enrollProjects(cycleId, { tms_project_ids: [...selected] }),
    onSuccess: onDone,
  });

  const toggle = (id: number) => {
    setSelected(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden flex flex-col max-h-[80vh]">
        <div style={{ background: BRAND.green }} className="px-6 py-4 flex justify-between items-center flex-shrink-0">
          <h2 className="text-white font-bold text-lg">Add Projects to Cycle</h2>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl">×</button>
        </div>

        <div className="px-5 pt-4 flex-shrink-0">
          <input
            type="text"
            placeholder="Search projects..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
          />
          {selected.size > 0 && (
            <p className="text-xs text-green-700 mt-2 font-medium">{selected.size} project(s) selected</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1 mt-1">
          {isLoading ? (
            <LoadingSpinner text="Loading projects..." />
          ) : totalFiltered === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              {search ? 'No matching projects' : 'All projects are already enrolled'}
            </p>
          ) : (
            <>
              {activeProjects.length > 0 && (
                <>
                  <div className="flex items-center gap-2 pt-1 pb-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                    <span className="text-xs font-semibold text-green-700 uppercase tracking-wider">
                      Active Projects ({activeProjects.length})
                    </span>
                  </div>
                  {activeProjects.map((p: any) => (
                    <label
                      key={p.project_id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                        selected.has(p.project_id) ? 'bg-green-50 border border-green-200' : 'hover:bg-gray-50 border border-transparent'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(p.project_id)}
                        onChange={() => toggle(p.project_id)}
                        className="accent-green-700"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{p.project_name}</p>
                        <p className="text-xs text-gray-400">ID: {p.project_id}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">
                        Active
                      </span>
                    </label>
                  ))}
                </>
              )}

              {activeProjects.length > 0 && completedProjects.length > 0 && (
                <div className="flex items-center gap-2 pt-4 pb-2">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400 font-medium px-1">Completed Projects</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
              )}

              {completedProjects.length > 0 && (
                <>
                  {activeProjects.length === 0 && (
                    <div className="flex items-center gap-2 pt-1 pb-2">
                      <span className="w-2 h-2 rounded-full bg-gray-400 flex-shrink-0" />
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Completed Projects ({completedProjects.length})
                      </span>
                    </div>
                  )}
                  {completedProjects.map((p: any) => (
                    <label
                      key={p.project_id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                        selected.has(p.project_id) ? 'bg-gray-50 border border-gray-300' : 'hover:bg-gray-50 border border-transparent'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(p.project_id)}
                        onChange={() => toggle(p.project_id)}
                        className="accent-gray-500"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-500 truncate">{p.project_name}</p>
                        <p className="text-xs text-gray-400">ID: {p.project_id}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">
                        Completed
                      </span>
                    </label>
                  ))}
                </>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-4 flex justify-end gap-3 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={selected.size === 0 || mutation.isPending}
            style={{ background: BRAND.green }}
            className="px-5 py-2 text-sm text-white font-semibold rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {mutation.isPending ? 'Enrolling...' : `Enroll ${selected.size > 0 ? selected.size : ''} Project(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Exemption Modal ───────────────────────────────────────────────────────────
function ExemptionModal({
  project, cycleId, onClose, onDone,
}: {
  project: EnrolledProject; cycleId: number; onClose: () => void; onDone: () => void;
}) {
  const [reason, setReason] = useState(project.exemption_reason ?? '');

  const mutation = useMutation({
    mutationFn: () => csatCyclesApi.setEligibility(cycleId, project.enrollment_id, {
      eligibility_status: 'exempted',
      exemption_reason: reason,
    }),
    onSuccess: onDone,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="px-6 py-4 bg-amber-50 border-b border-amber-100 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-amber-900">Mark as Not Eligible / Exempted</h3>
            <p className="text-xs text-amber-700 mt-0.5">{project.project_name}</p>
          </div>
          <button onClick={onClose} className="text-amber-700 hover:text-amber-900 text-xl">×</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600">
            This project will be marked as <strong>not eligible</strong> for this cycle.
            You can optionally send it to a manager for override approval.
          </p>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Reason for Exemption</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="Why is this project not eligible for CSAT review?"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 resize-none"
            />
          </div>
        </div>
        <div className="px-6 pb-5 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="px-5 py-2 text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50"
            style={{ background: '#D97706', color: '#fff' }}
          >
            {mutation.isPending ? 'Saving...' : 'Mark as Exempted'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Manager Decision Modal ────────────────────────────────────────────────────
function ManagerDecisionModal({
  project, cycleId, onClose, onDone,
}: {
  project: EnrolledProject; cycleId: number; onClose: () => void; onDone: () => void;
}) {
  const [decision, setDecision] = useState<'approved' | 'declined' | null>(null);
  const [remarks, setRemarks] = useState('');

  const mutation = useMutation({
    mutationFn: () => csatCyclesApi.managerDecision(cycleId, project.enrollment_id, {
      decision: decision!,
      manager_remarks: remarks,
    }),
    onSuccess: onDone,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="px-6 py-4 bg-blue-50 border-b border-blue-100 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-blue-900">Manager Approval Decision</h3>
            <p className="text-xs text-blue-700 mt-0.5">{project.project_name}</p>
          </div>
          <button onClick={onClose} className="text-blue-700 hover:text-blue-900 text-xl">×</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {project.exemption_reason && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-amber-700 mb-1">Exemption Reason</p>
              <p className="text-sm text-amber-900">{project.exemption_reason}</p>
            </div>
          )}
          <p className="text-sm text-gray-600">
            <strong>Approve</strong> to make this project eligible for CSAT feedback.<br />
            <strong>Decline</strong> to remove it from this cycle.
          </p>

          <div className="flex gap-3">
            <button
              onClick={() => setDecision('approved')}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-all ${
                decision === 'approved'
                  ? 'border-green-500 bg-green-50 text-green-800'
                  : 'border-gray-200 text-gray-600 hover:border-green-300'
              }`}
            >
              ✓ Approve
            </button>
            <button
              onClick={() => setDecision('declined')}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-all ${
                decision === 'declined'
                  ? 'border-red-400 bg-red-50 text-red-800'
                  : 'border-gray-200 text-gray-600 hover:border-red-300'
              }`}
            >
              ✕ Decline
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Remarks (optional)</label>
            <textarea
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              rows={2}
              placeholder="Add your remarks..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
            />
          </div>
        </div>
        <div className="px-6 pb-5 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!decision || mutation.isPending}
            className="px-5 py-2 text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50"
            style={{
              background: decision === 'approved' ? '#059669' : decision === 'declined' ? '#DC2626' : '#9CA3AF',
              color: '#fff',
            }}
          >
            {mutation.isPending ? 'Submitting...' : 'Submit Decision'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export const CsatCycleDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const cycleId = Number(id);

  const canManage = user?.role === UserRole.QUALITY || user?.role === UserRole.MANAGER
    || user?.role === UserRole.DELIVERY || user?.role === UserRole.SALES;
  const isManager = user?.role === UserRole.MANAGER;

  const [eligFilter, setEligFilter] = useState<EligFilter>('all');
  const [enrollModal, setEnrollModal] = useState(false);
  const [exemptTarget, setExemptTarget] = useState<EnrolledProject | null>(null);
  const [approvalTarget, setApprovalTarget] = useState<EnrolledProject | null>(null);

  const { data: cycle, isLoading: cycleLoading } = useQuery({
    queryKey: ['csat-cycle', cycleId],
    queryFn: () => csatCyclesApi.getById(cycleId),
  });

  // FIX 2: Always fetch ALL projects (no project_status filter) so KPI counts
  // are accurate regardless of which display filter is active.
  // Always fetch ALL projects with no status filter — filtering is done client-side only.
  // This ensures summary counts are always accurate regardless of which tab is active.
  const { data: projectsData, isLoading: projectsLoading } = useQuery({
    queryKey: ['cycle-projects', cycleId],
    queryFn: () => csatCyclesApi.listProjects(cycleId, {
      project_status: 'all',
      active_first: true,
      limit: 500,
    }),
    enabled: !!cycleId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['cycle-projects', cycleId] });
  };

  const markEligibleMutation = useMutation({
    mutationFn: (enrollmentId: number) =>
      csatCyclesApi.setEligibility(cycleId, enrollmentId, { eligibility_status: 'eligible' }),
    onSuccess: invalidate,
  });

  const requestApprovalMutation = useMutation({
    mutationFn: (enrollmentId: number) =>
      csatCyclesApi.requestManagerApproval(cycleId, enrollmentId),
    onSuccess: invalidate,
  });

  // Enrolled TMS IDs — used to exclude already-enrolled projects from the Add modal.
  // Always derived from the full unfiltered list.
  const allProjects = projectsData?.data ?? [];
  const enrolledTmsIds = useMemo(
    () => new Set(allProjects.map(p => Number(p.project_ext_id))),
    [allProjects],
  );

  // FIX 2: Summary is computed from the full dataset (eligFilter='all' fetch),
  // so declined projects are NEVER lumped into exempted.
  const summary = projectsData?.summary ?? {} as Partial<Record<EligibilityStatus, number>>;

  // 'declined' is treated as exempted in the UI (legacy rows + manager-declined rows)
  const isExemptedStatus = (s: string) =>
    s === 'exempted' || s === 'declined';

  // Correct counts:
  const kpiEligible = (summary['eligible'] ?? 0) + (summary['approved'] ?? 0);
  const kpiExempted = (summary['exempted'] ?? 0) + (summary['declined'] ?? 0);
  const kpiPending  = summary['pending_approval'] ?? 0;
  // Total from summary (always accurate regardless of current filter)
  const kpiTotal = Object.values(summary).reduce((acc, v) => acc + (v ?? 0), 0);

  // Client-side filtering — eligible tab shows eligible+approved, exempted shows exempted+declined
  const isEligibleStatus = (s: string) => s === 'eligible' || s === 'approved';

  const displayedProjects = eligFilter === 'all'
    ? allProjects
    : eligFilter === 'eligible'
      ? allProjects.filter(p => isEligibleStatus(p.eligibility_status))
      : eligFilter === 'exempted'
        ? allProjects.filter(p => isExemptedStatus(p.eligibility_status))
        : allProjects.filter(p => p.eligibility_status === eligFilter);

  const eligibleProjects = allProjects.filter(
    p => p.eligibility_status === 'eligible' || p.eligibility_status === 'approved',
  );
  const exemptedProjects = allProjects.filter(p => isExemptedStatus(p.eligibility_status)); // exempted + declined only

  if (cycleLoading) return <PageWrapper><LoadingSpinner text="Loading cycle..." /></PageWrapper>;

  const halfLabel = (c: any) => c?.half === 'H1' ? 'H1 — January to June' : 'H2 — July to December';

  return (
    <PageWrapper>
      <div className="space-y-6">

        {/* Breadcrumb */}
        <button
          onClick={() => navigate('/csat-cycles')}
          className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1"
        >
          ← Back to CSAT Cycles
        </button>

        {/* Cycle Header */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-gray-800">{(cycle as any)?.cycle_name ?? (cycle as any)?.cycleName}</h1>
                <span
                  className="px-2.5 py-1 rounded-full text-xs font-bold"
                  style={{
                    background: (cycle as any)?.half === 'H1' ? '#EFF6FF' : '#FFF7ED',
                    color: (cycle as any)?.half === 'H1' ? '#1D4ED8' : '#C2410C',
                  }}
                >
                  {(cycle as any)?.year} · {halfLabel(cycle)}
                </span>
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                  ((cycle as any)?.is_active ?? (cycle as any)?.isActive)
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {((cycle as any)?.is_active ?? (cycle as any)?.isActive) ? 'Active' : 'Inactive'}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {formatDate((cycle as any)?.start_date ?? (cycle as any)?.startDate)} →{' '}
                {formatDate((cycle as any)?.end_date ?? (cycle as any)?.endDate)}
              </p>
              {(cycle as any)?.description && (
                <p className="text-sm text-gray-400 mt-1">{(cycle as any)?.description}</p>
              )}
            </div>

            {/* KPI row — FIX 2: declined shown separately, not lumped into exempted */}
            <div className="flex gap-3 flex-wrap">
              {[
                { label: 'Total',    value: kpiTotal,    color: '#6B7280' },
                { label: 'Eligible', value: kpiEligible, color: '#059669' },
                { label: 'Exempted', value: kpiExempted, color: '#D97706' },
                { label: 'Pending',  value: kpiPending,  color: '#3B82F6' },
              ].map(kpi => (
                <div key={kpi.label} className="text-center px-4 py-2 bg-gray-50 rounded-xl border border-gray-100 min-w-[70px]">
                  <div className="text-xl font-bold" style={{ color: kpi.color }}>{kpi.value}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{kpi.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Workflow notice */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-3 flex items-start gap-3">
          <span className="text-blue-500 text-lg mt-0.5">ℹ</span>
          <div className="text-sm text-blue-800">
            <strong>Workflow:</strong> Projects marked as <em>Eligible</em> will proceed to the feedback/send flow.
            Projects marked as <em>Not Eligible / Exempted</em> can be sent for manager approval —
            if the manager approves, the project becomes eligible; if declined, it returns to the Exempted state.
          </div>
        </div>

        {/* Controls row — FIX 3: removed Active/Completed filter buttons */}
        <div className="flex justify-end">
          {canManage && (
            <button
              onClick={() => setEnrollModal(true)}
              style={{ background: BRAND.green }}
              className="px-4 py-2 text-white text-sm font-medium rounded-lg hover:opacity-90 flex items-center gap-2 whitespace-nowrap"
            >
              + Add Projects
            </button>
          )}
        </div>

        {/* Eligibility filter tabs */}
        <div className="flex gap-2 flex-wrap">
          {[
            { label: 'All Projects', value: 'all' as EligFilter },
            { label: `✓ Eligible (${kpiEligible})`,             value: 'eligible' as EligFilter },
            { label: `⚠ Exempted (${kpiExempted})`, value: 'exempted' as EligFilter },
            { label: `⏳ Pending Approval (${kpiPending})`,       value: 'pending_approval' as EligFilter },
          ].map(tab => (
            <button
              key={tab.value}
              onClick={() => setEligFilter(tab.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                eligFilter === tab.value
                  ? 'bg-gray-800 text-white border-transparent'
                  : 'text-gray-600 border-gray-200 hover:border-gray-400 bg-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Projects Table — FIX 3: STATUS column removed */}
        {projectsLoading ? (
          <LoadingSpinner text="Loading projects..." />
        ) : displayedProjects.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-16 text-center">
            <div className="text-4xl mb-3 opacity-30">◫</div>
            <p className="text-gray-500 font-medium">No projects found</p>
            {canManage && eligFilter === 'all' && (
              <button
                onClick={() => setEnrollModal(true)}
                className="mt-4 px-4 py-2 text-sm font-medium rounded-lg text-white"
                style={{ background: BRAND.green }}
              >
                + Add Projects to this Cycle
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr style={{ background: '#F8FAF9', borderBottom: '2px solid #E5E7EB' }}>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Project</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Eligibility</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Notes</th>
                  {canManage && (
                    <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {displayedProjects.map(project => (
                  <tr
                    key={project.enrollment_id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    {/* Project name + ID */}
                    <td className="px-5 py-4">
                      <div className="font-semibold text-sm text-gray-800">{project.project_name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{project.project_ext_id}</div>
                    </td>

                    {/* Eligibility badge */}
                    <td className="px-5 py-4">
                      <EligibilityBadge status={project.eligibility_status} />
                    </td>

                    {/* Notes */}
                    <td className="px-5 py-4 text-xs text-gray-500 max-w-[200px]">
                      {project.exemption_reason && (
                        <span title={project.exemption_reason} className="block truncate">
                          {project.exemption_reason}
                        </span>
                      )}
                      {project.manager_remarks && (
                        <span className="block text-blue-600 truncate mt-0.5" title={project.manager_remarks}>
                          Manager: {project.manager_remarks}
                        </span>
                      )}
                      {project.approved_or_declined_at && (
                        <span className="text-gray-400 block mt-0.5">
                          {formatDate(project.approved_or_declined_at)}
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    {canManage && (
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-center gap-2 flex-wrap">
                          {(project.eligibility_status === 'eligible' || project.eligibility_status === 'approved') && (
                            <button
                              onClick={() => navigate('/feedback/send', {
                                state: { cycleId, projectId: project.project_id, enrollmentId: project.enrollment_id },
                              })}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg text-white"
                              style={{ background: BRAND.green }}
                            >
                              Send Feedback →
                            </button>
                          )}

                          {project.eligibility_status === 'eligible' && (
                            <button
                              onClick={() => setExemptTarget(project)}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50"
                            >
                              Mark Exempted
                            </button>
                          )}

                          {project.eligibility_status === 'exempted' && (
                            <>
                              <button
                                onClick={() => markEligibleMutation.mutate(project.enrollment_id)}
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-green-300 text-green-700 hover:bg-green-50"
                                disabled={markEligibleMutation.isPending}
                              >
                                Make Eligible
                              </button>
                              <button
                                onClick={() => requestApprovalMutation.mutate(project.enrollment_id)}
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50"
                                disabled={requestApprovalMutation.isPending}
                              >
                                → Send to Manager
                              </button>
                            </>
                          )}

                          {project.eligibility_status === 'pending_approval' && isManager && (
                            <button
                              onClick={() => setApprovalTarget(project)}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg text-white"
                              style={{ background: '#3B82F6' }}
                            >
                              Give Decision
                            </button>
                          )}


                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary cards at bottom */}
        {eligFilter === 'all' && allProjects.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-green-800">Eligible for Review</span>
                <span className="text-xl font-bold text-green-700">{eligibleProjects.length}</span>
              </div>
              <p className="text-xs text-green-700">These projects will receive CSAT feedback requests.</p>
              {eligibleProjects.slice(0, 3).map(p => (
                <div key={p.enrollment_id} className="mt-2 text-xs text-green-600 truncate">• {p.project_name}</div>
              ))}
              {eligibleProjects.length > 3 && (
                <div className="text-xs text-green-500 mt-1">+{eligibleProjects.length - 3} more</div>
              )}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-amber-800">Not Eligible / Exempted</span>
                <span className="text-xl font-bold text-amber-700">{exemptedProjects.length}</span>
              </div>
              <p className="text-xs text-amber-700">Awaiting manager approval or currently exempted.</p>
              {exemptedProjects.slice(0, 3).map(p => (
                <div key={p.enrollment_id} className="mt-2 text-xs text-amber-600 truncate">• {p.project_name}</div>
              ))}
              {exemptedProjects.length > 3 && (
                <div className="text-xs text-amber-500 mt-1">+{exemptedProjects.length - 3} more</div>
              )}
            </div>

          </div>
        )}
      </div>

      {/* Modals */}
      {enrollModal && (
        <EnrollModal
          cycleId={cycleId}
          enrolledIds={enrolledTmsIds}
          onClose={() => setEnrollModal(false)}
          onDone={() => { setEnrollModal(false); invalidate(); }}
           cycleStartDate={(cycle as any)?.start_date ?? (cycle as any)?.startDate ?? null}
          cycleEndDate={(cycle as any)?.end_date   ?? (cycle as any)?.endDate   ?? null}
        />
      )}
      {exemptTarget && (
        <ExemptionModal
          project={exemptTarget}
          cycleId={cycleId}
          onClose={() => setExemptTarget(null)}
          onDone={() => { setExemptTarget(null); invalidate(); }}
        />
      )}
      {approvalTarget && (
        <ManagerDecisionModal
          project={approvalTarget}
          cycleId={cycleId}
          onClose={() => setApprovalTarget(null)}
          onDone={() => { setApprovalTarget(null); invalidate(); }}
        />
      )}
    </PageWrapper>
  );
};