/**
 * Select Projects — the pre-cycle project selection & triage workflow.
 *
 * State machine (mandatory exemption reason at every exempt step):
 *   Quality triages a candidate:
 *     eligible -> goes to the project's own Manager to review
 *     exempted -> mandatory reason; goes to Management to approve or
 *                 reject the exemption request
 *   Management decides an exemption request:
 *     approve -> final exempt
 *     reject  -> now eligible; goes to the project's own Manager to review
 *   Manager reviews (their own projects only):
 *     eligible -> final, ready for the cycle — no further review needed
 *     exempted -> mandatory reason; goes back to Quality to recheck
 *   Quality rechecks (only reached after a Manager exemption):
 *     exempted -> mandatory reason; final immediately, out of the pool
 *     eligible -> goes to Management for a final decision
 *   Management makes the final call:
 *     approve -> final eligible
 *     decline -> mandatory reason; final exempt
 *
 * Both candidate lists are paginated and filtered (search, project manager,
 * year) server-side — TMS has thousands of projects, so this can't rely on
 * loading everything into the browser.
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { ExemptConfirmModal } from '../../components/common/ExemptConfirmModal';
import { projectStagingApi } from '../../api/project-staging.api';
import { useAuthStore } from '../../store/auth.store';
import { UserRole } from '../../types/auth.types';
import { StagingCandidate, StagedProject, TriageAction, STAGING_STATUS_META } from '../../types/project-staging.types';
import { currentHalf } from '../../utils/half-year';

const BRAND = { green: '#1A5C3A', gold: '#9B7C2A' };
const currentYear = new Date().getFullYear();

// ─── One shared shape for "open the exempt-confirm modal, then run this
// callback with whatever it collected" — every Exempt / Approve Exemption
// button in this file funnels through it instead of window.prompt. ────────
export interface ExemptConfirmRequest {
  projectName: string;
  message: string;
  requireReason: boolean;
  confirmLabel: string;
  onConfirm: (reason?: string) => void;
}

// ─── Review Queue — one card at a time, big satisfying decisions, a little
// celebration at the end. Replaces the old one-off modal so Management never
// has to hunt through a list — just keep going until the queue's empty. ──────
function ReviewQueueModal({
  items, onClose, onAllDone,
}: {
  items: StagedProject[]; onClose: () => void; onAllDone: () => void;
}) {
  const qc = useQueryClient();
  const [index, setIndex] = useState(0);
  const [exiting, setExiting] = useState<'approve' | 'decline' | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [confirmingDecline, setConfirmingDecline] = useState(false);

  const decideMutation = useMutation({
    mutationFn: ({ stagingId, approve, remarks }: { stagingId: number; approve: boolean; remarks?: string }) =>
      projectStagingApi.decide(stagingId, approve, remarks),
    onSettled: () => {
      // Per-decision, not just at the end — so the bell reflects each one
      // immediately even if someone checks it before finishing the queue.
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
  });

  const current = items[index];

  const advance = () => {
    if (index + 1 >= items.length) {
      setCelebrate(true);
      onAllDone();
    } else {
      setIndex(i => i + 1);
    }
    setExiting(null);
  };

  const runDecision = (approve: boolean, remarks?: string) => {
    if (!current || exiting) return;
    setExiting(approve ? 'approve' : 'decline');
    decideMutation.mutate({ stagingId: current.staging_id, approve, remarks });
    window.setTimeout(advance, 280);
  };

  const handleDecide = (approve: boolean) => {
    if (!current || exiting) return;
    if (!approve) {
      setConfirmingDecline(true);
      return;
    }
    runDecision(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (celebrate || confirmingDecline) return;
      if (e.key.toLowerCase() === 'a') handleDecide(true);
      if (e.key.toLowerCase() === 'd') handleDecide(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, exiting, celebrate, confirmingDecline]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4">
        {!celebrate && current ? (
          <>
            <div className="flex justify-center gap-1.5 mb-4">
              {items.map((_, i) => (
                <span
                  key={i}
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: i === index ? 24 : 6,
                    background: i < index ? 'rgba(255,255,255,0.45)' : i === index ? '#fff' : 'rgba(255,255,255,0.25)',
                  }}
                />
              ))}
            </div>

            <div
              key={current.staging_id}
              className={`bg-white rounded-3xl shadow-2xl overflow-hidden ${
                exiting === 'approve' ? 'animate-card-out-approve'
                  : exiting === 'decline' ? 'animate-card-out-decline'
                  : 'animate-card-in'
              }`}
            >
              <div
                style={{ background: `linear-gradient(135deg, ${BRAND.green}, #0d3d26)` }}
                className="px-7 pt-7 pb-8 text-white relative"
              >
                <button onClick={onClose} className="absolute top-4 right-4 text-white/60 hover:text-white text-xl leading-none">×</button>
                <p className="text-[11px] font-bold uppercase tracking-widest text-white/60 mb-2">
                  Review {index + 1} of {items.length}
                </p>
                <h3 className="text-2xl font-bold leading-tight pr-6">{current.project_name}</h3>
                <p className="text-sm text-white/70 mt-2">Selected by {current.selected_by}</p>
              </div>

              <div className="px-7 py-6">
                <p className="text-sm text-gray-500 mb-2">
                  Quality reaffirmed this project as eligible after its Manager exempted it. Your call is final.
                </p>
                {current.exemption_reason && (
                  <p className="text-xs text-gray-400 mb-6 bg-gray-50 rounded-lg px-3 py-2">
                    Manager's exemption reason: "{current.exemption_reason}"
                  </p>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => handleDecide(false)}
                    className="flex-1 py-4 rounded-2xl border-2 border-red-100 text-red-600 font-bold text-sm hover:bg-red-50 hover:scale-[1.03] active:scale-95 transition-all"
                  >
                    ✕ Decline
                  </button>
                  <button
                    onClick={() => handleDecide(true)}
                    style={{ background: BRAND.green }}
                    className="flex-1 py-4 rounded-2xl text-white font-bold text-sm hover:opacity-90 hover:scale-[1.03] active:scale-95 transition-all shadow-lg shadow-green-900/20"
                  >
                    ✓ Approve
                  </button>
                </div>
                <p className="text-center text-[11px] text-gray-300 mt-4">Press A to approve · D to decline</p>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white rounded-3xl shadow-2xl px-8 py-12 text-center animate-card-in relative overflow-hidden">
            {Array.from({ length: 10 }).map((_, i) => (
              <span
                key={i}
                className="absolute top-8 text-lg animate-confetti-fall"
                style={{
                  left: `${8 + i * 9}%`,
                  animationDelay: `${i * 60}ms`,
                  color: ['#1A5C3A', '#9B7C2A', '#059669', '#D97706'][i % 4],
                }}
              >
                {['●', '▲', '■', '★'][i % 4]}
              </span>
            ))}
            <div className="relative inline-flex items-center justify-center mb-5">
              <span className="absolute inset-0 rounded-full bg-green-200 animate-ring-pulse" />
              <span
                className="relative w-20 h-20 rounded-full flex items-center justify-center animate-pop-in"
                style={{ background: BRAND.green }}
              >
                <span className="text-white text-3xl">✓</span>
              </span>
            </div>
            <h3 className="text-xl font-bold text-gray-800">All caught up!</h3>
            <p className="text-sm text-gray-500 mt-1.5 mb-6">
              You reviewed all {items.length} pending project{items.length !== 1 ? 's' : ''}.
            </p>
            <button
              onClick={onClose}
              style={{ background: BRAND.green }}
              className="px-6 py-2.5 rounded-xl text-white text-sm font-semibold hover:opacity-90"
            >
              Done
            </button>
          </div>
        )}
      </div>

      {confirmingDecline && current && (
        <ExemptConfirmModal
          projectName={current.project_name}
          message="This finalizes the project as Exempt — it will be removed from this cycle. This decision is final."
          requireReason
          confirmLabel="Yes, Decline"
          onCancel={() => setConfirmingDecline(false)}
          onConfirm={(reason) => { setConfirmingDecline(false); runDecision(false, reason); }}
        />
      )}
    </div>
  );
}

// ─── Candidate row — active or completed, with inline triage buttons ─────────
function CandidateRow({ candidate, onTriage, busy, onRequestExemptConfirm }: {
  candidate: StagingCandidate; onTriage: (action: TriageAction, exemptionReason?: string) => void; busy: boolean;
  onRequestExemptConfirm: (req: ExemptConfirmRequest) => void;
}) {
  const status = candidate.staging_status;
  const statusMeta = status && status !== 'eligible' ? STAGING_STATUS_META[status] : null;

  const handleExempt = () => {
    onRequestExemptConfirm({
      projectName: candidate.project_name,
      message: 'This sends the project to Management to approve or reject the exemption.',
      requireReason: true,
      confirmLabel: 'Exempt',
      onConfirm: (reason) => onTriage('exempted', reason),
    });
  };

  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-50 last:border-b-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{candidate.project_name}</p>
        <p className="text-xs text-gray-400 mt-0.5 truncate">
          {candidate.project_manager_name && <span>PM: {candidate.project_manager_name}</span>}
          {candidate.project_manager_name && candidate.bucket === 'completed' && candidate.end_date && ' · '}
          {candidate.bucket === 'completed' && candidate.end_date && (
            <span>Completed {new Date(candidate.end_date).toLocaleDateString()}</span>
          )}
        </p>
      </div>

      {statusMeta && status !== 'exempted' ? (
        <span
          className="text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
          style={{ background: statusMeta.bg, color: statusMeta.text }}
        >
          {statusMeta.label}
        </span>
      ) : (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            disabled={busy}
            onClick={() => onTriage('eligible')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg border whitespace-nowrap disabled:opacity-40 ${
              status === 'eligible' ? 'bg-green-600 text-white border-green-600' : 'border-green-300 text-green-700 hover:bg-green-50'
            }`}
          >
            ✓ Eligible
          </button>
          <button
            disabled={busy}
            onClick={handleExempt}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 whitespace-nowrap disabled:opacity-40"
          >
            ✕ Exempt
          </button>
        </div>
      )}
    </div>
  );
}

// ─── A staged project awaiting a Manager's or Quality's decision — shared
// row shape for both "Awaiting your review" (Manager) and "Back with you to
// recheck" (Quality) sections. ────────────────────────────────────────────
function PendingDecisionRow({
  item, busy, onDecide, context, onRequestExemptConfirm,
}: {
  item: StagedProject; busy: boolean; onDecide: (decision: TriageAction, exemptionReason?: string) => void;
  context: 'manager' | 'quality-recheck';
  onRequestExemptConfirm: (req: ExemptConfirmRequest) => void;
}) {
  const isRecheck = context === 'quality-recheck';

  const handleExempt = () => {
    onRequestExemptConfirm({
      projectName: item.project_name,
      message: isRecheck
        ? 'This confirms the Manager\u2019s exemption — the project will be removed from this cycle for good.'
        : 'This sends the project to Quality to recheck before anything is finalized.',
      requireReason: true,
      confirmLabel: isRecheck ? 'Approve Exemption' : 'Exempt',
      onConfirm: (reason) => onDecide('exempted', reason),
    });
  };

  return (
    <div className="flex items-center gap-4 px-5 py-3 border-b border-gray-50 last:border-b-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{item.project_name}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {context === 'manager'
            ? `Marked eligible by ${item.selected_by}`
            : `Exempted by ${item.manager_decided_by ?? 'the Manager'}${item.exemption_reason ? `: "${item.exemption_reason}"` : ''}`}
        </p>
      </div>
      <div className="flex items-start gap-1.5 flex-shrink-0">
        <div className="flex flex-col items-center gap-1">
          <button
            disabled={busy}
            onClick={() => onDecide('eligible')}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-green-300 text-green-700 hover:bg-green-50 whitespace-nowrap disabled:opacity-40"
          >
            {isRecheck ? 'Reject Exemption' : '✓ Eligible'}
          </button>
          {isRecheck ? (
            <span className="text-[10px] text-gray-400 text-center leading-tight max-w-[110px]">
              → sends to Management for final call
            </span>
          ) : context === 'manager' && (
            <span className="text-[10px] text-gray-400 text-center leading-tight max-w-[90px]">
              final · adds to cycle
            </span>
          )}
        </div>
        <div className="flex flex-col items-center gap-1">
          <button
            disabled={busy}
            onClick={handleExempt}
            className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 whitespace-nowrap disabled:opacity-40"
          >
            {isRecheck ? 'Approve Exemption' : '✕ Exempt'}
          </button>
          {isRecheck ? (
            <span className="text-[10px] text-gray-400 text-center leading-tight max-w-[110px]">
              final · removes from cycle
            </span>
          ) : context === 'manager' && (
            <span className="text-[10px] text-gray-400 text-center leading-tight max-w-[90px]">
              → sends to Quality for recheck
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const PAGE_SIZE = 50;

// ─── Main page ─────────────────────────────────────────────────────────────
export const SelectProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [pmFilter, setPmFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [activePage, setActivePage] = useState(0);
  const [completedPage, setCompletedPage] = useState(0);
  const [createCycleError, setCreateCycleError] = useState<string | null>(null);
  const [reviewQueue, setReviewQueue] = useState<StagedProject[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyStagingId, setBusyStagingId] = useState<number | null>(null);
  const [exemptConfirm, setExemptConfirm] = useState<ExemptConfirmRequest | null>(null);

  const isQuality = user?.role === UserRole.QUALITY;
  const isManagement = user?.role === UserRole.MANAGEMENT;
  const isManagerRole = user?.role === UserRole.MANAGER;
  const canTriage = isQuality || isManagement;

  // Auto-create — no form, no manual name/year/half. The cycle is always
  // named for whichever half-year we're actually in right now (see
  // utils/half-year.ts, same boundary logic the backend and the completed-
  // projects window both use), so there's nothing left to pick or get wrong.
  const createCycleMutation = useMutation({
    mutationFn: () => {
      const { year, half } = currentHalf(new Date());
      return projectStagingApi.createCycle({ cycle_name: `CSAT ${year} ${half}`, year, half });
    },
    onSuccess: (res) => { invalidate(); navigate(`/csat-cycles/${res.id}`); },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setCreateCycleError(detail || 'Failed to create cycle. Please try again.');
    },
  });

  // Any filter/search change resets both pages back to the start — otherwise
  // you could land on a page number that no longer exists for the new filter.
  const resetPagesAndSet = <T,>(setter: (v: T) => void) => (v: T) => {
    setActivePage(0);
    setCompletedPage(0);
    setter(v);
  };

  const { data: candidates, isLoading: candidatesLoading, isFetching: candidatesFetching } = useQuery({
    queryKey: ['staging-candidates', search, pmFilter, yearFilter, activePage, completedPage],
    queryFn: () => projectStagingApi.listCandidates({
      search: search || undefined,
      pm: pmFilter || undefined,
      year: yearFilter ? Number(yearFilter) : undefined,
      activeSkip: activePage * PAGE_SIZE,
      activeLimit: PAGE_SIZE,
      completedSkip: completedPage * PAGE_SIZE,
      completedLimit: PAGE_SIZE,
    }),
    enabled: canTriage, // a Manager never browses raw candidates — they only see what's routed to them
  });

  const { data: managers } = useQuery({
    queryKey: ['staging-managers'],
    queryFn: () => projectStagingApi.listManagers(),
    staleTime: 5 * 60 * 1000, // PM list barely changes — no need to refetch often
    enabled: canTriage,
  });

  // Fixed, generated range rather than a DB round-trip — years are a small,
  // predictable set and don't need to reflect exactly what's in TMS.
  const yearOptions = Array.from({ length: 11 }, (_, i) => currentYear - i);

  const { data: pool, isLoading: poolLoading } = useQuery({
    queryKey: ['staging-pool'],
    queryFn: () => projectStagingApi.listPool(),
  });

  const { data: myProjects, isLoading: myProjectsLoading, isError: myProjectsError, error: myProjectsErrorObj } = useQuery({
    queryKey: ['my-projects'],
    queryFn: () => projectStagingApi.listMyProjects(),
    enabled: isManagerRole,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['staging-candidates'] });
    qc.invalidateQueries({ queryKey: ['staging-pool'] });
    qc.invalidateQueries({ queryKey: ['my-projects'] });
    // Deciding here also resolves the matching notification's staging_status
    // (see NotificationBell.tsx) — without this, the bell would keep showing
    // stale Approve/Decline buttons until its next 30s poll.
    qc.invalidateQueries({ queryKey: ['notifications'] });
    qc.invalidateQueries({ queryKey: ['notifications-unread-count'] });
  };

  const triageMutation = useMutation({
    mutationFn: ({ tmsId, action, reason }: { tmsId: number; action: TriageAction; reason?: string }) =>
      projectStagingApi.select([{ tms_project_id: tmsId, action, exemption_reason: reason }]),
    onSuccess: invalidate,
    onSettled: () => setBusyId(null),
  });

  const handleTriage = (extId: string, action: TriageAction, reason?: string) => {
    setBusyId(extId);
    triageMutation.mutate({ tmsId: Number(extId), action, reason });
  };

  const managerDecideMutation = useMutation({
    mutationFn: ({ stagingId, decision, reason }: { stagingId: number; decision: TriageAction; reason?: string }) =>
      projectStagingApi.managerDecide(stagingId, decision, reason),
    onSuccess: invalidate,
    onSettled: () => setBusyStagingId(null),
  });

  const managerSelectMutation = useMutation({
    mutationFn: ({ tmsId, action, reason }: { tmsId: number; action: TriageAction; reason?: string }) =>
      projectStagingApi.managerSelect(tmsId, action, reason),
    onSuccess: invalidate,
    onSettled: () => setBusyId(null),
  });

  const qualityRecheckMutation = useMutation({
    mutationFn: ({ stagingId, decision, reason }: { stagingId: number; decision: TriageAction; reason?: string }) =>
      projectStagingApi.qualityRecheck(stagingId, decision, reason),
    onSuccess: invalidate,
    onSettled: () => setBusyStagingId(null),
  });

  const decideExemptionMutation = useMutation({
    mutationFn: ({ stagingId, approve, remarks }: { stagingId: number; approve: boolean; remarks?: string }) =>
      projectStagingApi.decideExemption(stagingId, approve, remarks),
    onSuccess: invalidate,
    onSettled: () => setBusyStagingId(null),
  });

  const eligible = (pool ?? []).filter(p => p.status === 'eligible');
  const awaitingExemptionDecision = (pool ?? []).filter(p => p.status === 'pending_management_exemption_review');
  const awaitingManager = (pool ?? []).filter(p => p.status === 'pending_manager_review');
  const awaitingQualityRecheck = (pool ?? []).filter(p => p.status === 'pending_quality_recheck');
  const pendingManagement = (pool ?? []).filter(p => p.status === 'pending_management_review');

  // Exempted candidates and PM/year filtering now happen server-side (see
  // the /candidates endpoint) — necessary once there are thousands of TMS
  // projects; filtering an already-fetched page client-side stops being
  // correct once the page itself is only a slice of the real dataset.
  const activeCandidates = candidates?.active ?? [];
  const completedCandidates = candidates?.completed ?? [];
  const activeTotal = candidates?.active_total ?? 0;
  const completedTotal = candidates?.completed_total ?? 0;
  const activeTotalPages = Math.max(1, Math.ceil(activeTotal / PAGE_SIZE));
  const completedTotalPages = Math.max(1, Math.ceil(completedTotal / PAGE_SIZE));

  const completedWindowLabel = candidates?.completed_window
    ? `${new Date(candidates.completed_window.start).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} – ${new Date(candidates.completed_window.end).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
    : null;

  return (
    <PageWrapper>
      <div className="space-y-6 max-w-4xl">
        <div>
          <button onClick={() => navigate('/csat-cycles')} className="text-xs text-gray-500 hover:text-gray-700 mb-2">
            ← Back to CSAT Cycles
          </button>
          <h1 className="text-2xl font-bold text-gray-800">Select Projects for Next Cycle</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isManagerRole
              ? "Decide directly on any of your own projects — mark Eligible to add it straight in, or Exempt (reason required) to send it to Quality."
              : 'Mark each project Eligible (goes to its Manager to review) or Exempt (reason required, goes to Management to approve or reject). Once you have your eligible set, create the cycle below.'}
          </p>
        </div>

        {/* ── Manager view: ALL of their own projects, actionable directly ── */}
        {isManagerRole && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-50">
              <span className="text-sm font-bold text-gray-800">Your projects</span>
              <span className="ml-2 text-xs text-gray-500">{(myProjects ?? []).length} project{(myProjects ?? []).length !== 1 ? 's' : ''}</span>
              {(() => {
                const needsReview = (myProjects ?? []).filter(p => p.status === 'pending_manager_review').length;
                return needsReview > 0 ? (
                  <span className="ml-2 text-xs font-semibold" style={{ color: '#9B7C2A' }}>
                    · {needsReview} need{needsReview === 1 ? 's' : ''} your review
                  </span>
                ) : null;
              })()}
            </div>
            {myProjectsLoading ? (
              <LoadingSpinner text="Loading..." />
            ) : myProjectsError ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-red-600 font-medium">Couldn't load your projects.</p>
                <p className="text-xs text-gray-400 mt-1">
                  {(myProjectsErrorObj as { response?: { data?: { detail?: string } } })?.response?.data?.detail
                    || 'Try refreshing the page. If this keeps happening, check the backend logs.'}
                </p>
              </div>
            ) : (myProjects ?? []).length === 0 ? (
              <p className="px-5 py-8 text-sm text-gray-400 text-center">No projects are assigned to you.</p>
            ) : (
              [...myProjects!].sort((a, b) => {
                // Needs-your-review first (Quality routed it), then
                // untouched (no staging row yet), then everything already
                // decided/mid-review-elsewhere — otherwise the handful of
                // projects actually waiting on the Manager get buried
                // alphabetically among a couple dozen others.
                const rank = (p: typeof a) => p.status === 'pending_manager_review' ? 0 : p.staging_id === null ? 1 : 2;
                return rank(a) - rank(b);
              }).map(item => {
                // Actionable directly when there's no staging row yet (never
                // touched by Quality) or Quality already routed it here and
                // it's still waiting — anything else is mid-review or
                // decided elsewhere, so it's read-only.
                const actionable = item.staging_id === null || item.status === 'pending_manager_review';
                const meta = item.status && item.status !== 'pending_manager_review' ? STAGING_STATUS_META[item.status] : null;

                const decide = (action: TriageAction, reason?: string) => {
                  setBusyId(item.project_ext_id);
                  if (item.staging_id) {
                    setBusyStagingId(item.staging_id);
                    managerDecideMutation.mutate({ stagingId: item.staging_id, decision: action, reason });
                  } else {
                    managerSelectMutation.mutate({ tmsId: Number(item.project_ext_id), action, reason });
                  }
                };

                return (
                  <div key={item.project_ext_id} className="flex items-center gap-4 px-5 py-3 border-b border-gray-50 last:border-b-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{item.project_name}</p>
                      {!actionable ? (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {item.status === 'eligible' ? `Approved by you — ready for the cycle`
                            : item.status === 'exempted' ? `Exempted${item.exemption_reason ? `: "${item.exemption_reason}"` : ''}`
                            : item.selected_by ? `Selected by ${item.selected_by}` : ''}
                        </p>
                      ) : item.staging_id && (
                        <span
                          className="inline-block mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                          style={{ background: '#FDF6E3', color: '#9B7C2A' }}
                        >
                          Marked eligible by {item.selected_by ?? 'Quality'} — needs your review
                        </span>
                      )}
                    </div>
                    {actionable ? (
                      <div className="flex items-start gap-1.5 flex-shrink-0">
                        <div className="flex flex-col items-center gap-1">
                          <button
                            disabled={busyId === item.project_ext_id}
                            onClick={() => decide('eligible')}
                            className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-green-300 text-green-700 hover:bg-green-50 whitespace-nowrap disabled:opacity-40"
                          >
                            ✓ Eligible
                          </button>
                          <span className="text-[10px] text-gray-400 text-center leading-tight max-w-[90px]">
                            final · adds to cycle
                          </span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <button
                            disabled={busyId === item.project_ext_id}
                            onClick={() => setExemptConfirm({
                              projectName: item.project_name,
                              message: 'This sends the project to Quality to recheck before anything is finalized.',
                              requireReason: true,
                              confirmLabel: 'Exempt',
                              onConfirm: (reason) => decide('exempted', reason),
                            })}
                            className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 whitespace-nowrap disabled:opacity-40"
                          >
                            ✕ Exempt
                          </button>
                          <span className="text-[10px] text-gray-400 text-center leading-tight max-w-[90px]">
                            → sends to Quality for recheck
                          </span>
                        </div>
                      </div>
                    ) : meta && (
                      <span
                        className="text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
                        style={{ background: meta.bg, color: meta.text }}
                      >
                        {meta.label}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── Quality / Management view ─────────────────────────────────── */}
        {canTriage && (
          <>
            {/* Eligible pool + create cycle CTA */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-sm font-bold text-gray-800">Ready for the next cycle</span>
                  <span className="ml-2 text-xs text-gray-500">{eligible.length} eligible project{eligible.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="text-right">
                  <button
                    onClick={() => { setCreateCycleError(null); createCycleMutation.mutate(); }}
                    disabled={eligible.length === 0 || createCycleMutation.isPending}
                    style={{ background: BRAND.green }}
                    className="px-4 py-2 text-white text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {createCycleMutation.isPending
                      ? 'Creating...'
                      : `Create "CSAT ${currentHalf(new Date()).year} ${currentHalf(new Date()).half}" →`}
                  </button>
                  {createCycleError && (
                    <p className="text-xs text-red-600 mt-1.5 max-w-[220px]">{createCycleError}</p>
                  )}
                </div>
              </div>
              {eligible.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {eligible.map(p => (
                    <span key={p.staging_id} className="text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-full">
                      {p.project_name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Exemption requests — with Management */}
            {awaitingExemptionDecision.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-50">
                  <span className="text-sm font-bold text-gray-800">Exemption requests</span>
                  <span className="ml-2 text-xs text-gray-500">{awaitingExemptionDecision.length} awaiting Management</span>
                </div>
                {awaitingExemptionDecision.map(p => (
                  <div key={p.staging_id} className="flex items-center gap-4 px-5 py-3 border-b border-gray-50 last:border-b-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{p.project_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {p.selected_by} requested exemption{p.exemption_reason ? `: "${p.exemption_reason}"` : ''}
                      </p>
                    </div>
                    {isManagement ? (
                      <div className="flex items-start gap-1.5 flex-shrink-0">
                        <div className="flex flex-col items-center gap-1">
                          <button
                            disabled={busyStagingId === p.staging_id}
                            onClick={() => {
                              setBusyStagingId(p.staging_id);
                              decideExemptionMutation.mutate({ stagingId: p.staging_id, approve: false });
                            }}
                            className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-green-300 text-green-700 hover:bg-green-50 whitespace-nowrap disabled:opacity-40"
                          >
                            Reject Exemption
                          </button>
                          <span className="text-[10px] text-gray-400 text-center leading-tight max-w-[110px]">
                            → final · makes it eligible
                          </span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <button
                            disabled={busyStagingId === p.staging_id}
                            onClick={() => setExemptConfirm({
                              projectName: p.project_name,
                              message: 'This confirms the exemption Quality requested — the project will be removed from this cycle for good.',
                              requireReason: false,
                              confirmLabel: 'Approve Exemption',
                              onConfirm: () => {
                                setBusyStagingId(p.staging_id);
                                decideExemptionMutation.mutate({ stagingId: p.staging_id, approve: true });
                              },
                            })}
                            className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 whitespace-nowrap disabled:opacity-40"
                          >
                            Approve Exemption
                          </button>
                          <span className="text-[10px] text-gray-400 text-center leading-tight max-w-[110px]">
                            → final · removes from cycle
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span
                        className="text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
                        style={{ background: STAGING_STATUS_META.pending_management_exemption_review.bg, color: STAGING_STATUS_META.pending_management_exemption_review.text }}
                      >
                        With Management
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* With Manager */}
            {awaitingManager.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-50">
                  <span className="text-sm font-bold text-gray-800">With Manager</span>
                  <span className="ml-2 text-xs text-gray-500">{awaitingManager.length} awaiting their review</span>
                </div>
                {awaitingManager.map(p => (
                  <div key={p.staging_id} className="flex items-center gap-4 px-5 py-3 border-b border-gray-50 last:border-b-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{p.project_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Awaiting {p.manager_name ?? 'the project Manager'}</p>
                    </div>
                    <span
                      className="text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
                      style={{ background: STAGING_STATUS_META.pending_manager_review.bg, color: STAGING_STATUS_META.pending_manager_review.text }}
                    >
                      With Manager
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Back with Quality to recheck (Quality only acts here) */}
            {awaitingQualityRecheck.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-50">
                  <span className="text-sm font-bold text-gray-800">Back with Quality to recheck</span>
                  <span className="ml-2 text-xs text-gray-500">{awaitingQualityRecheck.length} project{awaitingQualityRecheck.length !== 1 ? 's' : ''}</span>
                </div>
                {isQuality ? (
                  awaitingQualityRecheck.map(p => (
                    <PendingDecisionRow
                      key={p.staging_id}
                      item={p}
                      context="quality-recheck"
                      busy={busyStagingId === p.staging_id}
                      onRequestExemptConfirm={setExemptConfirm}
                      onDecide={(decision, reason) => {
                        setBusyStagingId(p.staging_id);
                        qualityRecheckMutation.mutate({ stagingId: p.staging_id, decision, reason });
                      }}
                    />
                  ))
                ) : (
                  awaitingQualityRecheck.map(p => (
                    <div key={p.staging_id} className="flex items-center gap-4 px-5 py-3 border-b border-gray-50 last:border-b-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{p.project_name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Manager exempted{p.exemption_reason ? `: "${p.exemption_reason}"` : ''}
                        </p>
                      </div>
                      <span
                        className="text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
                        style={{ background: STAGING_STATUS_META.pending_quality_recheck.bg, color: STAGING_STATUS_META.pending_quality_recheck.text }}
                      >
                        With Quality
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* With Management */}
            {pendingManagement.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <span className="text-sm font-bold text-gray-800">With Management</span>
                    <span className="ml-2 text-xs text-gray-500">{pendingManagement.length} awaiting final decision</span>
                  </div>
                  {isManagement && (
                    <button
                      onClick={() => setReviewQueue([...pendingManagement])}
                      style={{ background: `linear-gradient(135deg, ${BRAND.green}, #0d3d26)` }}
                      className="px-4 py-2 rounded-xl text-white text-xs font-bold flex items-center gap-2 hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all shadow-md shadow-green-900/20"
                    >
                      ⚡ Start Review Queue
                    </button>
                  )}
                </div>
                {pendingManagement.map(p => (
                  <div key={p.staging_id} className="flex items-center gap-4 px-5 py-3 border-b border-gray-50 last:border-b-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{p.project_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Selected by {p.selected_by}</p>
                    </div>
                    <span
                      className="text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
                      style={{ background: STAGING_STATUS_META.pending_management_review.bg, color: STAGING_STATUS_META.pending_management_review.text }}
                    >
                      Awaiting Management
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Search + filters */}
            <div className="flex flex-wrap gap-3">
              <input
                type="text"
                value={search}
                onChange={e => resetPagesAndSet(setSearch)(e.target.value)}
                placeholder="Search projects..."
                className="flex-1 min-w-[200px] border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
              />
              <select
                value={pmFilter}
                onChange={e => resetPagesAndSet(setPmFilter)(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-green-200"
              >
                <option value="">All project managers</option>
                {(managers ?? []).map(pm => <option key={pm.emp_id} value={pm.emp_id}>{pm.name}</option>)}
              </select>
              <select
                value={yearFilter}
                onChange={e => resetPagesAndSet(setYearFilter)(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-green-200"
              >
                <option value="">All years</option>
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              {(pmFilter || yearFilter) && (
                <button
                  onClick={() => { resetPagesAndSet(setPmFilter)(''); setYearFilter(''); }}
                  className="px-3 py-2.5 text-sm text-gray-500 hover:text-gray-700"
                >
                  Clear filters
                </button>
              )}
            </div>

            {candidatesLoading || poolLoading ? (
              <LoadingSpinner text="Loading projects..." />
            ) : (
              <>
                {/* Active projects */}
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
                  <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
                    <div>
                      <span className="text-sm font-bold text-gray-800">Active Projects</span>
                      <span className="ml-2 text-xs text-gray-500">{activeTotal.toLocaleString()}</span>
                    </div>
                    {candidatesFetching && <span className="text-xs text-gray-400">Updating…</span>}
                  </div>
                  {activeCandidates.length === 0 ? (
                    <p className="px-5 py-6 text-sm text-gray-400 text-center">No active projects found.</p>
                  ) : (
                    activeCandidates.map(c => (
                      <CandidateRow
                        key={c.project_ext_id}
                        candidate={c}
                        busy={busyId === c.project_ext_id}
                        onTriage={(action, reason) => handleTriage(c.project_ext_id, action, reason)}
                        onRequestExemptConfirm={setExemptConfirm}
                      />
                    ))
                  )}
                  {activeTotalPages > 1 && (
                    <div className="flex items-center justify-between px-5 py-3 border-t border-gray-50">
                      <span className="text-xs text-gray-400">
                        Showing {activePage * PAGE_SIZE + 1}–{Math.min((activePage + 1) * PAGE_SIZE, activeTotal)} of {activeTotal.toLocaleString()}
                      </span>
                      <div className="flex gap-2">
                        <button
                          disabled={activePage === 0}
                          onClick={() => setActivePage(p => p - 1)}
                          className="px-3 py-1 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40"
                        >
                          ← Prev
                        </button>
                        <button
                          disabled={activePage >= activeTotalPages - 1}
                          onClick={() => setActivePage(p => p + 1)}
                          className="px-3 py-1 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40"
                        >
                          Next →
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Completed projects (preceding half-year window) */}
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
                  <div className="px-5 py-3 border-b border-gray-50">
                    <span className="text-sm font-bold text-gray-800">Completed Projects</span>
                    <span className="ml-2 text-xs text-gray-500">
                      {completedTotal.toLocaleString()}{completedWindowLabel ? ` · completed ${completedWindowLabel}` : ''}
                    </span>
                  </div>
                  {completedCandidates.length === 0 ? (
                    <p className="px-5 py-6 text-sm text-gray-400 text-center">No recently completed projects found.</p>
                  ) : (
                    completedCandidates.map(c => (
                      <CandidateRow
                        key={c.project_ext_id}
                        candidate={c}
                        busy={busyId === c.project_ext_id}
                        onTriage={(action, reason) => handleTriage(c.project_ext_id, action, reason)}
                        onRequestExemptConfirm={setExemptConfirm}
                      />
                    ))
                  )}
                  {completedTotalPages > 1 && (
                    <div className="flex items-center justify-between px-5 py-3 border-t border-gray-50">
                      <span className="text-xs text-gray-400">
                        Showing {completedPage * PAGE_SIZE + 1}–{Math.min((completedPage + 1) * PAGE_SIZE, completedTotal)} of {completedTotal.toLocaleString()}
                      </span>
                      <div className="flex gap-2">
                        <button
                          disabled={completedPage === 0}
                          onClick={() => setCompletedPage(p => p - 1)}
                          className="px-3 py-1 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40"
                        >
                          ← Prev
                        </button>
                        <button
                          disabled={completedPage >= completedTotalPages - 1}
                          onClick={() => setCompletedPage(p => p + 1)}
                          className="px-3 py-1 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40"
                        >
                          Next →
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {reviewQueue && (
        <ReviewQueueModal
          items={reviewQueue}
          onClose={() => { setReviewQueue(null); invalidate(); }}
          onAllDone={() => invalidate()}
        />
      )}

      {exemptConfirm && (
        <ExemptConfirmModal
          projectName={exemptConfirm.projectName}
          message={exemptConfirm.message}
          requireReason={exemptConfirm.requireReason}
          confirmLabel={exemptConfirm.confirmLabel}
          onCancel={() => setExemptConfirm(null)}
          onConfirm={(reason) => { const cb = exemptConfirm.onConfirm; setExemptConfirm(null); cb(reason); }}
        />
      )}
    </PageWrapper>
  );
};