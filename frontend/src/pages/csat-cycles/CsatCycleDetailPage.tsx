/**
 * CSAT Cycle Detail Page
 */
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { csatCyclesApi } from '../../api/csat-cycles.api';
import { projectsApi } from '../../api/projects.api';
import { projectStagingApi } from '../../api/project-staging.api';
import { useAuthStore } from '../../store/auth.store';
import { UserRole } from '../../types/auth.types';
import { EnrolledProject } from '../../types/csat-cycle.types';
import { formatDate } from '../../utils/formatters';
import { deriveStatus } from '../projects/ProjectListPage';
import { currentHalf, precedingHalf, halfDates } from '../../utils/half-year';

const BRAND = { green: '#1A5C3A', gold: '#9B7C2A' };

// ─── Unified row status ─────────────────────────────────────────────────────
// A project row has two underlying flags — addition_approval_status and
// eligibility_status — but a person looking at this page just wants to know
// one thing: "what's happening with this project right now, and is there
// anything I need to do about it". This collapses both into a single status
// people can scan, with the addition-approval gate taking priority (a
// project that hasn't even been confirmed into the cycle yet doesn't need
// its eligibility surfaced too).
type RowStatus = 'review' | 'ready' | 'not-eligible';

function getRowStatus(p: EnrolledProject): RowStatus {
  if (p.addition_approval_status === 'pending') return 'review';
  if (p.eligibility_status === 'eligible' || p.eligibility_status === 'approved') return 'ready';
  if (p.eligibility_status === 'pending_approval') return 'review';  // merged — "With manager" removed as its own bucket
  return 'not-eligible'; // exempted, declined
}

const ROW_STATUS_META: Record<RowStatus, { label: string; bg: string; text: string; bar: string }> = {
  review:       { label: 'Awaiting approval', bg: '#FDF6E3', text: '#9B7C2A', bar: '#F59E0B' },
  ready:        { label: 'Ready',              bg: '#E8F2EC', text: '#1A5C3A', bar: '#059669' },
  'not-eligible': { label: 'Not eligible',     bg: '#F3F4F6', text: '#6B7280', bar: '#D1D5DB' },
};

// label defaults to the status's neutral copy, but callers can override it —
// used for the 'review' status, where the copy should only say "needs YOUR
// review" for the person who can actually act on it (Management, or the
// project's own Manager). Everyone else sees "Awaiting approval" instead,
// since showing them a call to action they're not permitted to complete
// (Quality can never approve/decline an addition — see can_approve_addition)
// is actively misleading, not just imprecise.
function RowStatusBadge({ status, label }: { status: RowStatus; label?: string }) {
  const m = ROW_STATUS_META[status];
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap"
      style={{ background: m.bg, color: m.text }}
    >
      {label ?? m.label}
    </span>
  );
}

// ─── Row overflow menu — secondary actions that shouldn't compete with the
// row's one primary button (e.g. "Mark exempted" alongside "Send feedback") ──
function RowMenu({ items }: { items: { label: string; onClick: () => void; disabled?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  if (items.length === 0) return null;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="More options"
        className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
      >
        <i className="ti ti-dots" style={{ fontSize: 16 }} />
      </button>
      {open && (
        <div
          className="absolute right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-10"
          style={{ minWidth: 170 }}
        >
          {items.map(item => (
            <button
              key={item.label}
              onClick={() => { item.onClick(); setOpen(false); }}
              disabled={item.disabled}
              className="w-full text-left px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Enroll Modal ─────────────────────────────────────────────────────────────
// Completed projects shown here are ones completed in the half-year
// immediately before the one we're in TODAY (see utils/half-year.ts) — not
// the cycle's own (often future, e.g. an upcoming H2) date window. A
// project can't have "completed" during a cycle that hasn't happened yet —
// that's what caused this to show 0 completed projects before this fix.

function EnrollModal({
  cycleId, enrolledIds, onClose, onDone, onTriaged,
}: {
  cycleId: number; enrolledIds: Set<number>; onClose: () => void; onDone: () => void;
  onTriaged: () => void;   // refresh the parent's enrolled set without closing the modal
}) {
  const { user } = useAuthStore();
  const isManagement = user?.role === UserRole.MANAGEMENT;
  const [search, setSearch] = useState('');
  const [pmFilter, setPmFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [tally, setTally] = useState({ eligible: 0, not_sure: 0, exempted: 0 });

  const { data, isLoading } = useQuery({
    queryKey: ['projects-for-enroll', enrolledIds.size],
    queryFn: () => projectsApi.list(0, 500),
    staleTime: 0, // always fresh when modal opens
  });

  // Same manager list the Select Projects page uses — independent of any
  // staging pool, just distinct PMs across all TMS projects.
  const { data: managers } = useQuery({
    queryKey: ['staging-managers'],
    queryFn: () => projectStagingApi.listManagers(),
    staleTime: 5 * 60 * 1000,
  });
  const yearOptions = Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - i);

  const { activeProjects, completedProjects } = useMemo(() => {
    const projects = (data as any)?.projects ?? [];
    const available = projects.filter((p: any) =>
      !enrolledIds.has(p.project_id) &&
      (search === '' || p.project_name.toLowerCase().includes(search.toLowerCase())) &&
      (pmFilter === '' || p.project_manager_emp_id === pmFilter) &&
      (yearFilter === '' || (p.start_date && new Date(p.start_date).getFullYear() === Number(yearFilter)))
    );
    const active: any[] = [];
    const completed: any[] = [];

    const today = new Date();
    const cur = currentHalf(today);
    const prev = precedingHalf(cur.year, cur.half);
    const [windowStart, windowEnd] = halfDates(prev.year, prev.half);

    for (const p of available) {
      const status = deriveStatus(p.end_date ?? null);
      if (status === 'active' || status === 'testing') {
        active.push(p);
      } else if (p.end_date) {
        const projectEnd = new Date(p.end_date);
        if (projectEnd >= windowStart && projectEnd <= windowEnd) {
          completed.push(p);
        }
        // else: completed outside the preceding-half window — don't show
      }
    }
    active.sort((a, b) => a.project_name.localeCompare(b.project_name));
    completed.sort((a, b) => a.project_name.localeCompare(b.project_name));
    return { activeProjects: active, completedProjects: completed };
  }, [data, enrolledIds, search, pmFilter, yearFilter]);

  const totalFiltered = activeProjects.length + completedProjects.length;

  // Enroll first (creates the cycle_project_enrollment row — still goes
  // through the existing addition-approval flow to Management/PM exactly
  // as before), then look up the enrollment_id that came out of it so we
  // can immediately apply the triage decision on top of it.
  const [lastAction, setLastAction] = useState<{ id: number; name: string; action: 'eligible' | 'not_sure' | 'exempted' } | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const triage = async (tmsProjectId: number, projectName: string, action: 'eligible' | 'not_sure' | 'exempted') => {
    setBusyId(tmsProjectId);
    setErrorMsg(null);
    try {
      await csatCyclesApi.enrollProjects(cycleId, { tms_project_ids: [tmsProjectId] });

      // Eligible/Exempt are already a real decision by whoever's adding the
      // project — approve the addition itself immediately instead of
      // leaving it stuck behind a second, redundant approval gate that
      // would otherwise mask this choice entirely (every fresh enrollment
      // starts addition_approval_status='pending', which getRowStatus()
      // checks BEFORE eligibility_status — so without this, every row would
      // show "Needs review" no matter what was picked here).
      //
      // "Not sure" is the one case that should genuinely stay pending —
      // that's what routes it to Management/the project's Manager to
      // resolve via the existing approve/decline-addition flow, which is
      // exactly what "Needs review" already means on the main page.
      if (action !== 'not_sure') {
        const list = await csatCyclesApi.listProjects(cycleId, { project_status: 'all', limit: 500 });
        const enrolled = list.data.find(p => Number(p.project_ext_id) === tmsProjectId);
        if (enrolled) {
          await csatCyclesApi.approveAddition(cycleId, enrolled.enrollment_id);
          if (action === 'exempted') {
            await csatCyclesApi.setEligibility(cycleId, enrolled.enrollment_id, { eligibility_status: 'exempted' });
          }
        }
      }
      // Immediate feedback — don't wait on the refetch (which can lag a
      // beat behind the click) to show that something actually happened.
      setTally(prev => ({ ...prev, [action]: prev[action] + 1 }));
      setLastAction({ id: tmsProjectId, name: projectName, action });
      onTriaged(); // refreshes enrolledIds — row disappears from this list once that resolves
    } catch (err) {
      // This previously had no catch at all — the promise rejection just
      // vanished silently, leaving the row looking untouched with no
      // indication anything had gone wrong.
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErrorMsg(detail || `Couldn't update "${projectName}". Please try again.`);
    } finally {
      setBusyId(null);
    }
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

          <div className="flex gap-2 mt-2">
            <select
              value={pmFilter}
              onChange={e => setPmFilter(e.target.value)}
              className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-green-200"
            >
              <option value="">All project managers</option>
              {(managers ?? []).map(pm => <option key={pm.emp_id} value={pm.emp_id}>{pm.name}</option>)}
            </select>
            <select
              value={yearFilter}
              onChange={e => setYearFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-green-200"
            >
              <option value="">All years</option>
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            {(pmFilter || yearFilter) && (
              <button
                onClick={() => { setPmFilter(''); setYearFilter(''); }}
                className="text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap px-1"
              >
                Clear
              </button>
            )}
          </div>

          {/* Live tally — updates the instant an action succeeds, not just
              after "Done" is clicked. Also confirms the most recent action
              by name, since a busy network tick can make the row's own
              disappearance feel disconnected from the click that caused it. */}
          <div className="flex items-center justify-between mt-3 mb-1 flex-wrap gap-y-1">
            <div className="flex items-center gap-3 text-xs font-semibold">
              <span className={tally.eligible > 0 ? 'text-green-700' : 'text-gray-300'}>✓ {tally.eligible} Eligible</span>
              <span className={tally.not_sure > 0 ? 'text-blue-700' : 'text-gray-300'}>? {tally.not_sure} Not sure</span>
              <span className={tally.exempted > 0 ? 'text-gray-600' : 'text-gray-300'}>✕ {tally.exempted} Exempt</span>
            </div>
            {lastAction && (
              <span className="text-xs text-gray-400 truncate max-w-[220px]">
                Last: <span className="font-medium text-gray-600">{lastAction.name}</span> → {
                  lastAction.action === 'eligible' ? 'Eligible' : lastAction.action === 'not_sure' ? 'Sent to Management' : 'Exempted'
                }
              </span>
            )}
          </div>

          {errorMsg && (
            <div className="mb-2 px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
              {errorMsg}
            </div>
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
                    <div key={p.project_id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-transparent">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{p.project_name}</p>
                        <p className="text-xs text-gray-400">ID: {p.project_id}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          disabled={busyId === p.project_id}
                          onClick={() => triage(p.project_id, p.project_name, 'eligible')}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-green-300 text-green-700 hover:bg-green-50 whitespace-nowrap disabled:opacity-40"
                        >
                          ✓ Eligible
                        </button>
                        {!isManagement && (
                          <button
                            disabled={busyId === p.project_id}
                            onClick={() => triage(p.project_id, p.project_name, 'not_sure')}
                            className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 whitespace-nowrap disabled:opacity-40"
                          >
                            ? Not sure
                          </button>
                        )}
                        <button
                          disabled={busyId === p.project_id}
                          onClick={() => triage(p.project_id, p.project_name, 'exempted')}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 whitespace-nowrap disabled:opacity-40"
                        >
                          ✕ Exempt
                        </button>
                      </div>
                    </div>
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
                    <div key={p.project_id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-transparent">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-500 truncate">{p.project_name}</p>
                        <p className="text-xs text-gray-400">
                          ID: {p.project_id}
                          {p.end_date && (
                            <> · Completed {new Date(p.end_date).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}</>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          disabled={busyId === p.project_id}
                          onClick={() => triage(p.project_id, p.project_name, 'eligible')}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-green-300 text-green-700 hover:bg-green-50 whitespace-nowrap disabled:opacity-40"
                        >
                          ✓ Eligible
                        </button>
                        {!isManagement && (
                          <button
                            disabled={busyId === p.project_id}
                            onClick={() => triage(p.project_id, p.project_name, 'not_sure')}
                            className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 whitespace-nowrap disabled:opacity-40"
                          >
                            ? Not sure
                          </button>
                        )}
                        <button
                          disabled={busyId === p.project_id}
                          onClick={() => triage(p.project_id, p.project_name, 'exempted')}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 whitespace-nowrap disabled:opacity-40"
                        >
                          ✕ Exempt
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-4 flex justify-between items-center border-t border-gray-100 flex-shrink-0">
          <span className="text-xs text-gray-400">
            {tally.eligible + tally.not_sure + tally.exempted > 0
              ? 'All changes above are already saved.'
              : 'Each button takes effect immediately — nothing to submit.'}
          </span>
          <button
            onClick={onDone}
            style={{ background: BRAND.green }}
            className="px-5 py-2 text-sm text-white font-semibold rounded-lg hover:opacity-90"
          >
            Close
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

// ─── Addition Decision Modal (separate from the exemption ManagerDecisionModal
// above — this decides whether a newly-added project stays in the cycle) ──────
function AdditionDecisionModal({
  project, cycleId, onClose, onDone,
}: {
  project: EnrolledProject; cycleId: number; onClose: () => void; onDone: () => void;
}) {
  const [decision, setDecision] = useState<'approved' | 'declined' | null>(null);
  const [remarks, setRemarks] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      decision === 'approved'
        ? csatCyclesApi.approveAddition(cycleId, project.enrollment_id)
        : csatCyclesApi.declineAddition(cycleId, project.enrollment_id, { remarks }),
    onSuccess: onDone,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="px-6 py-4 bg-amber-50 border-b border-amber-100 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-amber-900">Approve Project Addition</h3>
            <p className="text-xs text-amber-700 mt-0.5">{project.project_name}</p>
          </div>
          <button onClick={onClose} className="text-amber-700 hover:text-amber-900 text-xl">×</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600">
            This project was just added to the cycle and is awaiting your decision.<br />
            <strong>Approve</strong> to confirm it belongs in this cycle.<br />
            <strong>Decline</strong> to reject the addition.
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

          {decision === 'declined' && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Reason (optional)</label>
              <textarea
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                rows={2}
                placeholder="Why is this addition being declined?"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 resize-none"
              />
            </div>
          )}
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
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();

  // This page is shared between the CSAT Cycles list ("/csat-cycles" →
  // "/csat-cycles/:id") and the Reports "View all" shortcut, which links
  // straight to the Ready-filtered view ("/csat-cycles/:id?filter=ready&from=reports").
  // The back link and the initial status filter both depend on which of
  // those two places sent the person here, so we read that off the URL
  // instead of hardcoding a single entry point.
  const cameFromReports = searchParams.get('from') === 'reports';
  const initialFilterParam = searchParams.get('filter');
  const validFilters = ['all', 'review', 'ready', 'not-eligible'] as const;
  const initialFilter = (validFilters as readonly string[]).includes(initialFilterParam ?? '')
    ? (initialFilterParam as 'all' | RowStatus)
    : 'all';
  const { user } = useAuthStore();
  const cycleId = Number(id);

  // NOTE: MANAGEMENT was previously missing here even though the backend
  // already permits MANAGEMENT for these actions — without it, Management
  // would never see the Actions column at all, including the new
  // "Approve Addition" button. Added to match actual backend permissions.
  const canManage = user?.role === UserRole.QUALITY || user?.role === UserRole.MANAGER
    || user?.role === UserRole.DELIVERY || user?.role === UserRole.SALES
    || user?.role === UserRole.MANAGEMENT;
  const isManager = user?.role === UserRole.MANAGER;
  // Only Quality and Management add projects to a cycle — Managers approve
  // additions but don't initiate them.
  const canAddProjects = user?.role === UserRole.QUALITY || user?.role === UserRole.MANAGEMENT;
  // Send Feedback is Quality/Management (+ Delivery/Sales, unchanged) — not
  // Manager, who has a separate plan for this, not yet built.
  const canSendFeedback = canManage && !isManager;

  const [statusFilter, setStatusFilter] = useState<'all' | RowStatus>(initialFilter);
  const [showHowThisWorks, setShowHowThisWorks] = useState(false);
  const [enrollModal, setEnrollModal] = useState(false);
  const [approvalTarget, setApprovalTarget] = useState<EnrolledProject | null>(null);
  const [additionTarget, setAdditionTarget] = useState<EnrolledProject | null>(null);

  const { data: cycle, isLoading: cycleLoading } = useQuery({
    queryKey: ['csat-cycle', cycleId],
    queryFn: () => csatCyclesApi.getById(cycleId),
  });

  // FIX 2: Always fetch ALL projects (no project_status filter) so KPI counts
  // are accurate regardless of which display filter is active.
  // Always fetch ALL projects with no status filter — filtering is done client-side only.
  // This ensures summary counts are always accurate regardless of which tab is active.
  // Eligibility status changes here (manager decisions, exemptions, etc.) are made
  // by other users in other sessions. The global QueryClient default (5 min
  // staleTime, no window-focus refetch) means a user who already had this page
  // open — or returns to it within 5 minutes — was seeing a stale eligibility
  // snapshot (e.g. still showing "Send to Manager" on a project the manager had
  // already approved). Override the defaults for this specific query so it's
  // always refetched on mount/focus and polled while the page is open.
  const { data: projectsData, isLoading: projectsLoading } = useQuery({
    queryKey: ['cycle-projects', cycleId],
    queryFn: () => csatCyclesApi.listProjects(cycleId, {
      project_status: 'all',
      active_first: true,
      limit: 500,
    }),
    enabled: !!cycleId,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 20000, // keep eligibility/approval state in sync across users while the page is open
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['cycle-projects', cycleId] });
  };

  // Enrolled TMS IDs — used to exclude already-enrolled projects from the Add modal.
  // Always derived from the full unfiltered list.
  const allProjects = projectsData?.data ?? [];
  const enrolledTmsIds = useMemo(
    () => new Set(allProjects.map(p => Number(p.project_ext_id))),
    [allProjects],
  );

  // True once a manager has made ANY final decision (approve or decline) on this
  // project and it hasn't been manually re-set by Quality/Delivery/Sales since.
  // The backend clears approved_or_declined_at whenever eligibility is manually
  // (re-)set via the eligibility endpoint, so its presence here means "this row's
  // current status is exactly what the manager decided" — i.e. it's final:
  //   - eligible + decided  → only "Send Feedback" (no Mark Exempted)
  //   - exempted + decided  → no actions at all (manager declined it; final)
  //   - not decided (fresh) → the normal action set applies
  const isManagerDecided = (p: EnrolledProject) => !!p.approved_or_declined_at;
  // Covers BOTH ways a project can end up "Not eligible" as a final,
  // no-further-action decision: the exemption-escalation flow's
  // manager_decision (approved_or_declined_at set), and Management
  // declining the addition itself outright (addition_approval_status ===
  // 'declined'). Previously only the first case hid Make eligible/Send to
  // manager — an addition-declined project still showed those, wrongly
  // implying it wasn't actually final.
  const isFinallyDeclined = (p: EnrolledProject) =>
    isManagerDecided(p) || p.addition_approval_status === 'declined';

  // Counts per unified status, computed from the full unfiltered dataset so
  // they stay accurate regardless of which filter pill is currently active.
  const statusCounts = useMemo(() => {
    const counts: Record<RowStatus, number> = { review: 0, ready: 0, 'not-eligible': 0 };
    allProjects.forEach(p => { counts[getRowStatus(p)]++; });
    return counts;
  }, [allProjects]);
  const kpiTotal = allProjects.length;

  const displayedProjects = statusFilter === 'all'
    ? allProjects
    : allProjects.filter(p => getRowStatus(p) === statusFilter);

  if (cycleLoading) return <PageWrapper><LoadingSpinner text="Loading cycle..." /></PageWrapper>;

  const halfLabel = (c: any) => c?.half === 'H1' ? 'H1 — April to September' : 'H2 — October to March';

  // Per-row subtitle — the plain-language explanation that replaces the old
  // second badge and the permanent workflow banner.
  const rowSubtitle = (p: EnrolledProject, status: RowStatus): string => {
    if (status === 'review') {
      if (p.addition_approval_status === 'pending') {
        return p.project_manager_name
          ? `Added ${formatDate(p.enrolled_at)} · PM ${p.project_manager_name}`
          : `Added ${formatDate(p.enrolled_at)} · no manager assigned`;
      }
      // Addition already resolved — this row is here because eligibility
      // itself was escalated to a manager (the old "With manager" case).
      return 'Sent for manager approval · awaiting decision';
    }
    if (status === 'ready') {
      return `Ready · added ${formatDate(p.enrolled_at)}`;
    }
    // not-eligible
    if (isFinallyDeclined(p)) return 'Declined · marked not eligible';
    if (p.exemption_reason) return p.exemption_reason;
    return 'Marked not eligible';
  };

  return (
    <PageWrapper>
      <div className="space-y-6">

        {/* Breadcrumb */}
        <button
          onClick={() => navigate(cameFromReports ? '/reports' : '/csat-cycles')}
          className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1"
        >
          {cameFromReports ? '← Back to Reports' : '← Back to CSAT Cycles'}
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

            {/* KPI row — click a stat to jump to that filter */}
            <div className="flex gap-3 flex-wrap">
              {([
                { label: 'Total',              value: kpiTotal,                     color: '#6B7280', filter: 'all' as const },
                { label: 'Needs review',        value: statusCounts.review,          color: '#9B7C2A', filter: 'review' as const },
                { label: 'Ready',               value: statusCounts.ready,           color: '#059669', filter: 'ready' as const },
                { label: 'Not eligible',        value: statusCounts['not-eligible'], color: '#6B7280', filter: 'not-eligible' as const },
              ]).map(kpi => (
                <button
                  key={kpi.label}
                  onClick={() => setStatusFilter(kpi.filter)}
                  className="text-center px-4 py-2 bg-gray-50 rounded-xl border border-gray-100 min-w-[70px] hover:border-gray-300 transition-colors"
                >
                  <div className="text-xl font-bold" style={{ color: kpi.color }}>{kpi.value}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{kpi.label}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* How this works — quiet, collapsible; row subtitles already explain
            the everyday case, so this is only for people who want the detail. */}
        <div>
          <button
            onClick={() => setShowHowThisWorks(s => !s)}
            className="text-xs font-medium text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <i className={`ti ti-chevron-${showHowThisWorks ? 'down' : 'right'}`} style={{ fontSize: 13 }} />
            How this works
          </button>
          {showHowThisWorks && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-3 mt-2 text-sm text-blue-800">
              Newly added projects need approval from Management or the project's manager before anything else
              happens. Once approved, <em>Ready</em> projects can receive feedback requests; projects marked{' '}
              <em>Not eligible</em> can be sent to a manager for override — if approved, they become eligible,
              if declined, they stay not eligible.
            </div>
          )}
        </div>

        {/* Controls row */}
        <div className="flex justify-end">
          {canAddProjects && (
            <button
              onClick={() => setEnrollModal(true)}
              style={{ background: BRAND.green }}
              className="px-4 py-2 text-white text-sm font-medium rounded-lg hover:opacity-90 flex items-center gap-2 whitespace-nowrap"
            >
              + Add Projects
            </button>
          )}
        </div>

        {/* Status filter pills */}
        <div className="flex gap-2 flex-wrap">
          {([
            { label: 'All projects', filter: 'all' as const },
            { label: `Needs review (${statusCounts.review})`, filter: 'review' as const },
            { label: `Ready (${statusCounts.ready})`, filter: 'ready' as const },
            { label: `Not eligible (${statusCounts['not-eligible']})`, filter: 'not-eligible' as const },
          ]).map(tab => (
            <button
              key={tab.filter}
              onClick={() => setStatusFilter(tab.filter)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                statusFilter === tab.filter
                  ? 'bg-gray-800 text-white border-transparent'
                  : 'text-gray-600 border-gray-200 hover:border-gray-400 bg-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Projects list */}
        {projectsLoading ? (
          <LoadingSpinner text="Loading projects..." />
        ) : displayedProjects.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm py-16 text-center">
            <div className="text-4xl mb-3 opacity-30">◫</div>
            <p className="text-gray-500 font-medium">No projects found</p>
            {canAddProjects && statusFilter === 'all' && (
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
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
            {displayedProjects.map(project => {
              const status = getRowStatus(project);

              // Secondary actions tucked behind the row's overflow menu —
              // only ever built for people who can actually act on them.
              // Note: no "Mark exempted" entry here — a project only reaches
              // this cycle after already being triaged (Eligible/Not sure/
              // Exempt) in the pre-cycle Select Projects staging flow, so
              // re-exempting it here would be a redundant second check.
              // "Make eligible" / "Send to manager" below stay, since those
              // handle rows that arrive already exempted (e.g. added to an
              // existing cycle directly, bypassing staging).
              // "Not eligible" is now always the result of a deliberate,
              // final decision by whoever's authorized to make it — Quality
              // at pre-cycle staging triage, Management declining an
              // addition, or a Manager declining an exemption escalation.
              // There's no remaining path here that should be reconsiderable
              // or re-escalatable from this menu, so not-eligible rows get
              // no menu items at all (RowMenu renders nothing for an empty
              // list). This replaced trying to detect "was this a final
              // decision" per-path (isManagerDecided, addition declined,
              // staging-exempt, ...) — that kept missing cases; simpler and
              // more correct to just not offer the actions at all anymore,
              // since the one scenario they existed for (undoing a manual
              // "Mark Exempted" click) no longer exists on this page.
              const menuItems: { label: string; onClick: () => void; disabled?: boolean }[] = [];

              return (
                <div key={project.enrollment_id} className="flex items-center gap-4 px-4 py-3.5">
                  <div
                    className="w-1 self-stretch rounded-full flex-shrink-0"
                    style={{ background: ROW_STATUS_META[status].bar }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-800 truncate">{project.project_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{rowSubtitle(project, status)}</p>
                  </div>

                  <RowStatusBadge
                    status={status}
                    label={status === 'review' && project.can_approve_addition ? 'Needs your review' : undefined}
                  />

                  {canManage && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {status === 'review' && project.can_approve_addition && (
                        <button
                          onClick={() => setAdditionTarget(project)}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 whitespace-nowrap"
                        >
                          Review
                        </button>
                      )}

                      {status === 'ready' && canSendFeedback && (
                        <button
                          onClick={() => navigate('/feedback/send', {
                            state: { cycleId, projectId: Number(project.project_ext_id), enrollmentId: project.enrollment_id },
                          })}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg text-white whitespace-nowrap flex items-center gap-1"
                          style={{ background: BRAND.green }}
                        >
                          Send feedback →
                        </button>
                      )}

                      {project.eligibility_status === 'pending_approval' && isManager && (
                        <button
                          onClick={() => setApprovalTarget(project)}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg text-white whitespace-nowrap"
                          style={{ background: '#3B82F6' }}
                        >
                          Give decision
                        </button>
                      )}

                      <RowMenu items={menuItems} />
                    </div>
                  )}
                </div>
              );
            })}
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
          onTriaged={invalidate}
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
      {additionTarget && (
        <AdditionDecisionModal
          project={additionTarget}
          cycleId={cycleId}
          onClose={() => setAdditionTarget(null)}
          onDone={() => { setAdditionTarget(null); invalidate(); }}
        />
      )}
    </PageWrapper>
  );
};