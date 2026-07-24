/**
 * CSAT Cycle Detail Page
 */
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { ExemptConfirmModal, ExemptConfirmRequest } from '../../components/common/ExemptConfirmModal';
import { csatCyclesApi } from '../../api/csat-cycles.api';
import { projectsApi } from '../../api/projects.api';
import { projectStagingApi } from '../../api/project-staging.api';
import { useAuthStore } from '../../store/auth.store';
import { UserRole } from '../../types/auth.types';
import { EnrolledProject, AuditReportProject } from '../../types/csat-cycle.types';
import { formatDate } from '../../utils/formatters';
import { deriveStatus } from '../projects/ProjectListPage';

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

type PendingProjectSelection = {
  tmsProjectId: number;
  projectName: string;
  action: 'eligible' | 'exempted';
  exemptionReason?: string;
};

const _PENDING_ADDITION_STATUSES = new Set([
  'pending', // legacy
  'pending_management_exemption_review', 'pending_manager_review',
  'pending_quality_recheck', 'pending_management_review',
]);

function getRowStatus(p: EnrolledProject): RowStatus {
  if (_PENDING_ADDITION_STATUSES.has(p.addition_approval_status)) return 'review';
  if (p.eligibility_status === 'eligible' || p.eligibility_status === 'approved') return 'ready';
  if (p.eligibility_status === 'pending_approval') return 'review';  // merged — "With manager" removed as its own bucket
  return 'not-eligible'; // exempted, declined
}

const ROW_STATUS_META: Record<RowStatus, { label: string; bg: string; text: string; bar: string }> = {
  review: { label: 'Awaiting approval', bg: '#FDF6E3', text: '#9B7C2A', bar: '#F59E0B' },
  ready: { label: 'Ready', bg: '#E8F2EC', text: '#1A5C3A', bar: '#059669' },
  'not-eligible': { label: 'Not eligible', bg: '#F3F4F6', text: '#6B7280', bar: '#D1D5DB' },
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
  cycleId, cycleStartDate, cycleEndDate, enrolledIds, onClose, onDone,
}: {
  cycleId: number; cycleStartDate?: string; cycleEndDate?: string; enrolledIds: Set<number>; onClose: () => void; onDone: () => void;
}) {
  const { user } = useAuthStore();
  // A Manager can only ever add their OWN projects (TMS PmId match) —
  // enforced server-side too (see enroll_projects), but filtering here
  // avoids showing them a list full of projects they'll just get a
  // "skipped" response for.
  const isManagerRole = user?.role === UserRole.MANAGER;
  const [search, setSearch] = useState('');
  const [pmFilter, setPmFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [selectedProjects, setSelectedProjects] = useState<PendingProjectSelection[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  // Keyed on cycleId only — NOT enrolledIds.size. enrolledIds.size changes
  // by +1 every time a project is triaged, and using it here meant React
  // Query treated every single triage as a brand new query, refetching all
  // 500 projects (plus the PM-resolving join) from scratch each time — even
  // though the row disappearing from view is already handled below by
  // filtering the already-fetched data against the (reactively updated)
  // enrolledIds prop. No network round-trip needed for that at all.
  const { data, isLoading } = useQuery({
    queryKey: ['projects-for-enroll', cycleId, isManagerRole ? user?.emp_id : null],
    queryFn: () => projectsApi.list(0, 500, undefined, undefined, isManagerRole ? user?.emp_id : undefined, undefined, false),
    staleTime: 5 * 60 * 1000, // one fetch per modal session is enough — re-opening the modal remounts it anyway
  });

  // Same manager list the Select Projects page uses — independent of any
  // staging pool, just distinct PMs across all TMS projects.
  const { data: managers } = useQuery({
    queryKey: ['staging-managers'],
    queryFn: () => projectStagingApi.listManagers(),
    staleTime: 5 * 60 * 1000,
  });
  const yearOptions = Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - i);

  const { activeProjects, completedProjects, selectedByProjectId } = useMemo(() => {
    const projects = (data as any)?.projects ?? [];
    const selectedByProjectId = new Map(selectedProjects.map(project => [project.tmsProjectId, project]));
    const available = projects.filter((p: any) =>
      !enrolledIds.has(p.project_id) &&
      (search === '' || p.project_name.toLowerCase().includes(search.toLowerCase())) &&
      (isManagerRole || pmFilter === '' || p.project_manager_emp_id === pmFilter) &&
      (yearFilter === '' || (p.start_date && new Date(p.start_date).getFullYear() === Number(yearFilter)))
    );
    const active: any[] = [];
    const completed: any[] = [];

    // Active = still ongoing, or its end date falls OUTSIDE this cycle's
    // own custom window. Completed = end date falls WITHIN it. Used to be
    // "the preceding half-year" — now it's whatever date range Quality
    // actually chose when creating this specific cycle.
    const windowStart = cycleStartDate ? new Date(cycleStartDate) : null;
    const windowEnd = cycleEndDate ? new Date(cycleEndDate) : null;

    for (const p of available) {
      const status = deriveStatus(p.end_date ?? null);
      if (status === 'active' || status === 'testing') {
        active.push(p);
      } else if (p.end_date) {
        const projectEnd = new Date(p.end_date);
        if (windowStart && windowEnd && projectEnd >= windowStart && projectEnd <= windowEnd) {
          completed.push(p);
        }
        // else: completed outside this cycle's own window — don't show
      }
    }
    active.sort((a, b) => a.project_name.localeCompare(b.project_name));
    completed.sort((a, b) => a.project_name.localeCompare(b.project_name));
    return { activeProjects: active, completedProjects: completed, selectedByProjectId };
  }, [data, enrolledIds, selectedProjects, search, pmFilter, yearFilter, isManagerRole, user?.emp_id, cycleStartDate, cycleEndDate]);

  const totalFiltered = activeProjects.length + completedProjects.length;

  // Enroll — the backend now handles the FULL routing decision itself
  // (eligible -> the project's own Manager; exempted -> Management for an
  // exemption decision) based on the action/reason passed here. No more
  // manual enroll-then-approve-then-set-eligibility round trip needed.

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [exemptConfirm, setExemptConfirm] = useState<ExemptConfirmRequest | null>(null);

  const selectProject = (
    tmsProjectId: number,
    projectName: string,
    action: 'eligible' | 'exempted',
    exemptionReason?: string,
  ) => {
    setErrorMsg(null);

    setSelectedProjects(previous => [
      ...previous.filter(project => project.tmsProjectId !== tmsProjectId),
      {
        tmsProjectId,
        projectName,
        action,
        exemptionReason,
      },
    ]);
  };

  const removeSelectedProject = (tmsProjectId: number) => {
    setSelectedProjects(previous =>
      previous.filter(project => project.tmsProjectId !== tmsProjectId),
    );
  };

  const submitSelections = async () => {
    if (selectedProjects.length === 0) {
      setErrorMsg('Select at least one project before submitting.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      await csatCyclesApi.enrollProjects(cycleId, {
        items: selectedProjects.map(project => ({
          tms_project_id: project.tmsProjectId,
          action: project.action,
          exemption_reason: project.exemptionReason,
        })),
      });

      onDone();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;

      setErrorMsg(detail || 'Could not submit the selected projects. Please try again.');
    } finally {
      setSubmitting(false);
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
            {!isManagerRole && (
              <select
                value={pmFilter}
                onChange={e => setPmFilter(e.target.value)}
                className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-green-200"
              >
                <option value="">All project managers</option>
                {(managers ?? []).map(pm => <option key={pm.emp_id} value={pm.emp_id}>{pm.name}</option>)}
              </select>
            )}
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

          <div className="mt-3 mb-1">
            <div className="flex items-center gap-3 text-xs font-semibold">
              <span className={selectedProjects.filter(project => project.action === 'eligible').length > 0 ? 'text-green-700' : 'text-gray-300'}>
                ✓ {selectedProjects.filter(project => project.action === 'eligible').length} To Add
              </span>

              <span className={selectedProjects.filter(project => project.action === 'exempted').length > 0 ? 'text-orange-600' : 'text-gray-300'}>
                ✕ {selectedProjects.filter(project => project.action === 'exempted').length} To Exempt
              </span>
            </div>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-2 px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
            {errorMsg}
          </div>
        )}


        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1 mt-1">
          {isLoading ? (
            <LoadingSpinner text="Loading projects..." />
          ) : totalFiltered === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              {search
                ? 'No matching projects'
                : isManagerRole
                  ? "No projects found where you're the assigned Manager"
                  : 'All projects are already enrolled'}
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
                  {activeProjects.map((p: any) => {
                    const selection = selectedByProjectId.get(Number(p.project_id));
                    return (
                    <div
                      key={p.project_id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${
                        selection?.action === 'eligible' ? 'bg-green-50 border-green-200'
                          : selection?.action === 'exempted' ? 'bg-orange-50 border-orange-200'
                          : 'border-transparent'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{p.project_name}</p>
                        <p className="text-xs text-gray-400">ID: {p.project_id}</p>
                        {selection?.action === 'exempted' && selection.exemptionReason && (
                          <p className="text-xs text-orange-600 mt-0.5">Reason: {selection.exemptionReason}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {selection ? (
                          <button
                            disabled={submitting}
                            onClick={() => removeSelectedProject(Number(p.project_id))}
                            aria-label={`Remove ${p.project_name}`}
                            className={`w-7 h-7 flex items-center justify-center rounded-full border text-sm font-bold disabled:opacity-40 ${
                              selection.action === 'eligible'
                                ? 'border-green-300 text-green-700 hover:bg-green-100'
                                : 'border-orange-300 text-orange-700 hover:bg-orange-100'
                            }`}
                          >
                            ×
                          </button>
                        ) : (
                          <>
                            <button
                              disabled={submitting}
                              onClick={() => selectProject(p.project_id, p.project_name, 'eligible')}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-green-300 text-green-700 hover:bg-green-50 whitespace-nowrap disabled:opacity-40"
                            >
                              {isManagerRole ? '+ Select to Add' : '✓ Eligible'}
                            </button>
                            <button
                              disabled={submitting}
                              onClick={() => setExemptConfirm({
                                projectName: p.project_name,
                                message: 'The exemption will be included in your final submission to Quality.',
                                requireReason: true,
                                confirmLabel: 'Select Exemption',
                                onConfirm: (reason: string) =>
                                  selectProject(p.project_id, p.project_name, 'exempted', reason),
                              })}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 whitespace-nowrap disabled:opacity-40"
                            >
                              ✕ Select Exemption
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    );
                  })}
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
                  {completedProjects.map((p: any) => {
                    const selection = selectedByProjectId.get(Number(p.project_id));
                    return (
                    <div
                      key={p.project_id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${
                        selection?.action === 'eligible' ? 'bg-green-50 border-green-200'
                          : selection?.action === 'exempted' ? 'bg-orange-50 border-orange-200'
                          : 'border-transparent'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-500 truncate">{p.project_name}</p>
                        <p className="text-xs text-gray-400">
                          ID: {p.project_id}
                          {p.end_date && (
                            <> · Completed {new Date(p.end_date).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}</>
                          )}
                        </p>
                        {selection?.action === 'exempted' && selection.exemptionReason && (
                          <p className="text-xs text-orange-600 mt-0.5">Reason: {selection.exemptionReason}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {selection ? (
                          <button
                            disabled={submitting}
                            onClick={() => removeSelectedProject(Number(p.project_id))}
                            aria-label={`Remove ${p.project_name}`}
                            className={`w-7 h-7 flex items-center justify-center rounded-full border text-sm font-bold disabled:opacity-40 ${
                              selection.action === 'eligible'
                                ? 'border-green-300 text-green-700 hover:bg-green-100'
                                : 'border-orange-300 text-orange-700 hover:bg-orange-100'
                            }`}
                          >
                            ×
                          </button>
                        ) : (
                          <>
                            <button
                              disabled={submitting}
                              onClick={() => selectProject(p.project_id, p.project_name, 'eligible')}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-green-300 text-green-700 hover:bg-green-50 whitespace-nowrap disabled:opacity-40"
                            >
                              {isManagerRole ? '+ Select to Add' : '✓ Eligible'}
                            </button>
                            <button
                              disabled={submitting}
                              onClick={() => setExemptConfirm({
                                projectName: p.project_name,
                                message: 'The exemption will be included in your final submission to Quality.',
                                requireReason: true,
                                confirmLabel: 'Select Exemption',
                                onConfirm: (reason: string) =>
                                  selectProject(p.project_id, p.project_name, 'exempted', reason),
                              })}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 whitespace-nowrap disabled:opacity-40"
                            >
                              ✕ Select Exemption
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-4 flex justify-between items-center border-t border-gray-100 flex-shrink-0">
          <span className="text-xs text-gray-500">
            {selectedProjects.length > 0
              ? `${selectedProjects.length} project(s) selected.`
              : 'Select projects to add or exempt, then verify them.'}
          </span>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm text-gray-600 font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>

            <button
            onClick={() => setReviewOpen(true)}
              disabled={submitting || selectedProjects.length === 0}
              style={{ background: BRAND.green }}
              className="px-5 py-2 text-sm text-white font-semibold rounded-lg hover:opacity-90 disabled:opacity-50"
            >
            Verify & Continue
            </button>
          </div>
        </div>
      </div>

      {
        exemptConfirm && (
          <ExemptConfirmModal
            projectName={exemptConfirm.projectName}
            message={exemptConfirm.message}
            requireReason={exemptConfirm.requireReason}
            confirmLabel={exemptConfirm.confirmLabel}
            onCancel={() => setExemptConfirm(null)}
            onConfirm={(reason) => { const cb = exemptConfirm.onConfirm; setExemptConfirm(null); cb(reason); }}
          />
        )
      }
      {reviewOpen && (
        <ProjectSelectionReviewModal
          projects={selectedProjects}
          submitting={submitting}
          errorMessage={errorMsg}
          onBack={() => setReviewOpen(false)}
          onRemove={removeSelectedProject}
          onSubmit={submitSelections}
        />
      )}
    </div >
  );
}

function ProjectSelectionReviewModal({
  projects, submitting, errorMessage, onBack, onRemove, onSubmit,
}: {
  projects: PendingProjectSelection[];
  submitting: boolean;
  errorMessage: string | null;
  onBack: () => void;
  onRemove: (tmsProjectId: number) => void;
  onSubmit: () => void;
}) {
  const eligibleCount = projects.filter(project => project.action === 'eligible').length;
  const exemptedCount = projects.length - eligibleCount;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <div style={{ background: BRAND.green }} className="px-6 py-4 flex justify-between items-center flex-shrink-0">
          <div>
            <p className="text-green-100 text-xs font-semibold uppercase tracking-wide">Step 2 of 2</p>
            <h2 className="text-white font-bold text-lg mt-1">Verify Project Selections</h2>
          </div>
          <button onClick={onBack} disabled={submitting} className="text-white/70 hover:text-white text-xl disabled:opacity-50">x</button>
        </div>

        <div className="px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <p className="text-sm text-gray-600">Review all selected projects before sending them to Quality.</p>
          <div className="flex gap-3 mt-3 text-xs font-semibold">
            <span className="text-green-700">{eligibleCount} to add</span>
            <span className="text-gray-600">{exemptedCount} to exempt</span>
          </div>
          {errorMessage && <p className="mt-3 text-sm text-red-700">{errorMessage}</p>}
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {projects.map(project => (
            <div key={project.tmsProjectId} className="px-6 py-4 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 break-words">{project.projectName}</p>
                <p className={`mt-1 text-sm font-medium ${project.action === 'eligible' ? 'text-green-700' : 'text-gray-600'}`}>
                  {project.action === 'eligible' ? 'Add to cycle' : 'Exempt from cycle'}
                </p>
                {project.exemptionReason && <p className="mt-1 text-sm text-gray-500 break-words">Reason: {project.exemptionReason}</p>}
              </div>
              <button
                type="button"
                onClick={() => onRemove(project.tmsProjectId)}
                disabled={submitting}
                className="px-3 py-1.5 text-sm font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center flex-shrink-0">
          <button onClick={onBack} disabled={submitting} className="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
            Back to Selection
          </button>
          <button
            onClick={onSubmit}
            disabled={submitting || projects.length === 0}
            style={{ background: BRAND.green }}
            className="px-5 py-2 text-sm text-white font-semibold rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit'}
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
    mutationFn: () => csatCyclesApi.managerDecide(
      cycleId,
      project.enrollment_id,
      decision === 'approved' ? 'eligible' : 'exempted',
      remarks,
    ),
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
              className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-all ${decision === 'approved'
                ? 'border-green-500 bg-green-50 text-green-800'
                : 'border-gray-200 text-gray-600 hover:border-green-300'
                }`}
            >
              ✓ Approve
            </button>
            <button
              onClick={() => setDecision('declined')}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-all ${decision === 'declined'
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

// ─── Second-Level Exemption Decision Modal (Management confirming or
// rejecting an exemption QM already approved) ──────────────────────────────
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
        ? csatCyclesApi.approveAddition(cycleId, project.enrollment_id, { remarks })
        : csatCyclesApi.declineAddition(cycleId, project.enrollment_id, { remarks }),
    onSuccess: onDone,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="px-6 py-4 bg-amber-50 border-b border-amber-100 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-amber-900">Second-Level Exemption Approval</h3>
            <p className="text-xs text-amber-700 mt-0.5">{project.project_name}</p>
          </div>
          <button onClick={onClose} className="text-amber-700 hover:text-amber-900 text-xl">×</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-600">
            {project.quality_recheck_by_name || 'QM'} approved exempting this project after {project.manager_decided_by_name || 'its Manager'} requested it.<br />
            <strong>Approve Exemption</strong> to confirm it exempt for good.<br />
            <strong>Reject Exemption</strong> to send it back to the Manager to decide again.<br />
            A reason is required either way.
          </p>

          <div className="flex gap-3">
            <button
              onClick={() => setDecision('declined')}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-all ${decision === 'declined'
                ? 'border-green-500 bg-green-50 text-green-800'
                : 'border-gray-200 text-gray-600 hover:border-green-300'
                }`}
            >
              ✕ Reject Exemption
            </button>
            <button
              onClick={() => setDecision('approved')}
              className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-all ${decision === 'approved'
                ? 'border-red-400 bg-red-50 text-red-800'
                : 'border-gray-200 text-gray-600 hover:border-red-300'
                }`}
            >
              ✓ Approve Exemption
            </button>
          </div>

          {decision && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Reason (required)</label>
              <textarea
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                rows={2}
                placeholder={decision === 'approved' ? 'Why is this project exempt?' : 'Why is the exemption being rejected?'}
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
            disabled={!decision || !remarks.trim() || mutation.isPending}
            className="px-5 py-2 text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50"
            style={{
              background: decision === 'approved' ? '#DC2626' : decision === 'declined' ? '#059669' : '#9CA3AF',
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

// ─── Audit Report Modal — every project in this cycle (added AND
// exempted), with its final outcome and a full chronological reason
// trail: who decided what, when, and why. Built for compliance/auditing —
// answers "why was this exempted" with an actual paper trail, not just
// the latest reason. ──────────────────────────────────────────────────────
function AuditReportModal({ cycleId, onClose }: { cycleId: number; onClose: () => void }) {
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | 'added' | 'exempted'>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['auditReport', cycleId],
    queryFn: () => csatCyclesApi.getAuditReport(cycleId),
  });

  const projects = data?.projects ?? [];
  const visible = outcomeFilter === 'all' ? projects : projects.filter(p => p.final_status === outcomeFilter);

  const exportCsv = () => {
    const header = ['Project', 'Status', 'Current Reason', 'Timeline'];
    const rows = projects.map(p => [
      p.project_name,
      p.final_status === 'added' ? 'Added to cycle' : 'Exempted',
      p.current_reason ?? '',
      p.timeline.map(t => `${formatDate(t.at)} — ${t.actor_name ?? 'Unknown'} (${t.actor_role ? t.actor_role.charAt(0) + t.actor_role.slice(1).toLowerCase() : ''}) → ${t.action}${t.reason ? ` — "${t.reason}"` : ''}`).join(' | '),
    ]);
    const escape = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map(r => r.map(escape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${data?.cycle_name ?? 'cycle'}_audit_report.csv`.replace(/\s+/g, '_');
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
          <div>
            <h3 className="font-bold text-gray-800">Audit Report</h3>
            {data && (
              <p className="text-xs text-gray-500 mt-0.5">
                {data.cycle_name} · {data.total} project{data.total !== 1 ? 's' : ''} · {data.added} added · {data.exempted} exempted
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={exportCsv}
              disabled={!data || projects.length === 0}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40 whitespace-nowrap"
            >
              ⬇ Export CSV
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>
        </div>

        <div className="px-6 pt-3 flex gap-2 flex-shrink-0">
          {(['all', 'added', 'exempted'] as const).map(f => (
            <button
              key={f}
              onClick={() => setOutcomeFilter(f)}
              className={`px-3 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${
                outcomeFilter === f ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f === 'all' ? `All (${projects.length})` : f === 'added' ? `Added (${data?.added ?? 0})` : `Exempted (${data?.exempted ?? 0})`}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <LoadingSpinner text="Loading audit report..." />
          ) : error ? (
            <p className="text-sm text-red-600 text-center py-8">Couldn't load the audit report. Try again.</p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No projects to show.</p>
          ) : (
            <div className="space-y-2">
              {visible.map(p => (
                <div key={p.project_id} className="border border-gray-100 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedId(expandedId === p.project_id ? null : p.project_id)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{p.project_name}</p>
                      {p.current_reason && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">"{p.current_reason}"</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className="text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
                        style={{
                          background: p.final_status === 'added' ? '#D1FAE5' : '#FEE2E2',
                          color: p.final_status === 'added' ? '#065F46' : '#991B1B',
                        }}
                      >
                        {p.final_status === 'added' ? 'Added' : 'Exempted'}
                      </span>
                      <span className="text-gray-400 text-xs">{expandedId === p.project_id ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {expandedId === p.project_id && (
                    <div className="px-4 pb-4 pt-1 bg-gray-50 border-t border-gray-100">
                      {p.timeline.length === 0 ? (
                        <p className="text-xs text-gray-400 py-2">No recorded history for this project.</p>
                      ) : (
                        <ol className="mt-2 space-y-2">
                          {p.timeline.map((t, i) => (
                            <li key={i} className="text-xs text-gray-600 flex gap-2">
                              <span className="text-gray-400 flex-shrink-0 w-32">{formatDate(t.at)}</span>
                              <span className="flex-1">
                                <strong>{t.actor_name ?? 'Unknown'}</strong>
                                {t.actor_role && <span className="text-gray-400"> ({t.actor_role.charAt(0) + t.actor_role.slice(1).toLowerCase()})</span>}
                                {' → '}{t.action}
                                {t.reason && <span className="block text-gray-500 mt-0.5">"{t.reason}"</span>}
                              </span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
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

  // NOTE: MANAGEMENT was previously missing here even though the backend
  // already permits MANAGEMENT for these actions — without it, Management
  // would never see the Actions column at all, including the new
  // "Approve Addition" button. Added to match actual backend permissions.
  const canManage = user?.role === UserRole.QUALITY || user?.role === UserRole.MANAGER
    || user?.role === UserRole.DELIVERY || user?.role === UserRole.SALES
    || user?.role === UserRole.MANAGEMENT;
  const isManager = user?.role === UserRole.MANAGER;
  const isManagement = user?.role === UserRole.MANAGEMENT;
  const isQuality = user?.role === UserRole.QUALITY;
  // Only Quality and Management add projects to a cycle — Managers approve
  // additions but don't initiate them.
  const canAddProjects = user?.role === UserRole.QUALITY || user?.role === UserRole.MANAGEMENT || user?.role === UserRole.MANAGER;
  // Send Feedback is Quality/Management (+ Delivery/Sales, unchanged) — not
  // Manager, who has a separate plan for this, not yet built.
  const canSendFeedback = canManage && !isManager;

  const [statusFilter, setStatusFilter] = useState<'all' | RowStatus>('all');
  const [showHowThisWorks, setShowHowThisWorks] = useState(false);
  const [enrollModal, setEnrollModal] = useState(false);
  const [auditReportOpen, setAuditReportOpen] = useState(false);
  const [approvalTarget, setApprovalTarget] = useState<EnrolledProject | null>(null);
  const [additionTarget, setAdditionTarget] = useState<EnrolledProject | null>(null);
  const [chainBusyId, setChainBusyId] = useState<number | null>(null);
  const [exemptConfirm, setExemptConfirm] = useState<ExemptConfirmRequest | null>(null);

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

  // Shared handler for the three inline chain-decision actions — Manager
  // reviewing a project routed to them, Quality rechecking a Manager's
  // exemption, and Management approving/rejecting an exemption request.
  // Each mirrors the equivalent action on SelectProjectsPage.tsx exactly,
  // just scoped to an enrollment instead of a staging row.
  const runChainDecide = async (
    project: EnrolledProject,
    kind: 'manager' | 'quality-recheck' | 'exemption',
    approveOrEligible: boolean,
    reason?: string,
  ) => {
    setChainBusyId(project.enrollment_id);
    try {
      if (kind === 'manager') {
        await csatCyclesApi.managerDecide(cycleId, project.enrollment_id, approveOrEligible ? 'eligible' : 'exempted', reason);
      } else if (kind === 'quality-recheck') {
        await csatCyclesApi.qualityRecheck(cycleId, project.enrollment_id, approveOrEligible ? 'eligible' : 'exempted', reason);
      } else {
        // exemption: approveOrEligible here means "approve the exemption"
        // (final exempt) — the inverse of the other two, where true means
        // eligible. Kept as one shared handler rather than three near-
        // identical ones for the sake of a slightly confusing boolean.
        await csatCyclesApi.decideExemption(cycleId, project.enrollment_id, approveOrEligible, reason);
      }
      invalidate();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      window.alert(detail || `Couldn't update "${project.project_name}". Please try again.`);
    } finally {
      setChainBusyId(null);
    }
  };

  const handleChainDecide = (
    project: EnrolledProject,
    kind: 'manager' | 'quality-recheck' | 'exemption',
    approveOrEligible: boolean,
  ) => {
    if (kind === 'manager' && approveOrEligible) {
      // Eligible — no reason needed, just a plain "are you sure".
      setExemptConfirm({
        projectName: project.project_name,
        message: 'This confirms the project as eligible and adds it to the cycle.',
        requireReason: false,
        confirmLabel: 'Yes, Add',
        onConfirm: () => runChainDecide(project, kind, approveOrEligible),
      });
      return;
    }

    const needsReason =
      (kind === 'manager' && !approveOrEligible) ||   // Exempt needs a reason
      kind === 'quality-recheck' ||                     // QM: both Approve and Reject need one now
      kind === 'exemption';                             // Management: both Approve and Reject need one now
    if (!needsReason) {
      runChainDecide(project, kind, approveOrEligible);
      return;
    }

    // quality-recheck: approveOrEligible=true is "Reject Exemption" (sends
    // back to the Manager); false is "Approve Exemption" (sends to
    // Management for second-level approval, NOT final on its own anymore).
    const isRecheckReject = kind === 'quality-recheck' && approveOrEligible;
    const isRecheckApprove = kind === 'quality-recheck' && !approveOrEligible;
    const isExemptionApprove = kind === 'exemption' && approveOrEligible;
    const isExemptionReject = kind === 'exemption' && !approveOrEligible;
    setExemptConfirm({
      projectName: project.project_name,
      message: isRecheckReject
        ? 'This sends it back to the project\u2019s Manager to decide again.'
        : isRecheckApprove
          ? 'This approves the exemption and sends it to Management for a second-level approval.'
          : isExemptionApprove
            ? 'This confirms the exemption Quality requested — the project will be removed from this cycle for good.'
            : isExemptionReject
              ? 'This rejects the exemption Quality requested — the project\u2019s own Manager will make the final call instead.'
              : kind === 'manager'
                ? 'This sends the project to QM (Quality) to approve or reject the exemption.'
                : 'This sends the project to Management to approve or reject the exemption.',
      requireReason: true,
      confirmLabel: isRecheckReject ? 'Reject Exemption' : (isRecheckApprove || isExemptionApprove) ? 'Approve Exemption' : isExemptionReject ? 'Reject Exemption' : 'Exempt',
      onConfirm: (reason) => runChainDecide(project, kind, approveOrEligible, reason),
    });
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
      switch (p.addition_approval_status) {
        case 'pending_manager_review':
          // The one case that gets a distinct, unmissable tag rather than
          // plain status text — this is specifically "something Quality did
          // that now needs YOUR decision", for the Manager it's routed to.
          if (isManager && p.manager_emp_id === user?.emp_id) {
            return p.conflict_note || `${p.enrolled_by_name || 'Quality'} marked this eligible — needs your review`;
          }
          return p.conflict_note || (p.project_manager_name
            ? `Sent to ${p.project_manager_name} for review`
            : 'Sent to the project Manager for review');
        case 'pending_management_exemption_review':
          return p.exemption_reason
            ? `${p.enrolled_by_name || 'Quality'} requested exemption: "${p.exemption_reason}" · awaiting Management`
            : `${p.enrolled_by_name || 'Quality'} requested exemption · awaiting Management`;
        case 'pending_quality_recheck':
          return p.conflict_note || (p.exemption_reason
            ? `${p.manager_decided_by_name || 'The Manager'} exempted: "${p.exemption_reason}" · awaiting QM's approval`
            : `${p.manager_decided_by_name || 'The Manager'} exempted this project · awaiting QM's approval`);
        case 'pending_management_review':
          return p.conflict_note || `${p.quality_recheck_by_name || 'QM'} approved the exemption · awaiting Management's second-level approval`;
        case 'pending':
          // Legacy rows only — no new addition can reach this value.
          return p.project_manager_name
            ? `Added ${formatDate(p.enrolled_at)} · PM ${p.project_manager_name}`
            : `Added ${formatDate(p.enrolled_at)} · no manager assigned`;
        default:
          // Addition already resolved — this row is here because eligibility
          // itself was escalated to a manager (the old "With manager" case).
          return 'Sent for manager approval · awaiting decision';
      }
    }
    if (status === 'ready') {
      return p.conflict_note || `Ready · added ${formatDate(p.enrolled_at)}`;
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
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${((cycle as any)?.is_active ?? (cycle as any)?.isActive)
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
                { label: 'Total', value: kpiTotal, color: '#6B7280', filter: 'all' as const },
                { label: 'Needs review', value: statusCounts.review, color: '#9B7C2A', filter: 'review' as const },
                { label: 'Ready', value: statusCounts.ready, color: '#059669', filter: 'ready' as const },
                { label: 'Not eligible', value: statusCounts['not-eligible'], color: '#6B7280', filter: 'not-eligible' as const },
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
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setAuditReportOpen(true)}
            className="px-4 py-2 text-gray-600 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 flex items-center gap-2 whitespace-nowrap"
          >
            📋 Audit Report
          </button>
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
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${statusFilter === tab.filter
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
                    label={
                      status === 'ready' && project.feedback_status === 'completed'
                        ? 'Feedback submitted'
                        : status === 'review' && (
                          project.can_approve_addition
                          || (project.addition_approval_status === 'pending_manager_review' && isManager && project.manager_emp_id === user?.emp_id)
                          || (project.addition_approval_status === 'pending_quality_recheck' && isQuality)
                          || (project.addition_approval_status === 'pending_management_exemption_review' && isManagement)
                        ) ? 'Needs your review' : undefined
                    }
                  />

                  {canManage && (
                    <div className="flex items-start gap-1.5 flex-shrink-0">
                      {status === 'review' && project.can_approve_addition && (
                        <button
                          onClick={() => setAdditionTarget(project)}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 whitespace-nowrap"
                        >
                          Review
                        </button>
                      )}

                      {project.addition_approval_status === 'pending_manager_review' && isManager && project.manager_emp_id === user?.emp_id && (
                        <>
                          <div className="flex flex-col items-center gap-1">
                            <button
                              disabled={chainBusyId === project.enrollment_id}
                              onClick={() => handleChainDecide(project, 'manager', true)}
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
                              disabled={chainBusyId === project.enrollment_id}
                              onClick={() => handleChainDecide(project, 'manager', false)}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 whitespace-nowrap disabled:opacity-40"
                            >
                              ✕ Exempt
                            </button>
                            <span className="text-[10px] text-gray-400 text-center leading-tight max-w-[90px]">
                              → sends to QM (Quality) to approve or reject
                            </span>
                          </div>
                        </>
                      )}

                      {project.addition_approval_status === 'pending_quality_recheck' && isQuality && (
                        <>
                          <div className="flex flex-col items-center gap-1">
                            <button
                              disabled={chainBusyId === project.enrollment_id}
                              onClick={() => handleChainDecide(project, 'quality-recheck', true)}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-green-300 text-green-700 hover:bg-green-50 whitespace-nowrap disabled:opacity-40"
                            >
                              Reject Exemption
                            </button>
                            <span className="text-[10px] text-gray-400 text-center leading-tight max-w-[110px]">
                              → sends back to the Manager
                            </span>
                          </div>
                          <div className="flex flex-col items-center gap-1">
                            <button
                              disabled={chainBusyId === project.enrollment_id}
                              onClick={() => handleChainDecide(project, 'quality-recheck', false)}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 whitespace-nowrap disabled:opacity-40"
                            >
                              Approve Exemption
                            </button>
                            <span className="text-[10px] text-gray-400 text-center leading-tight max-w-[110px]">
                              → sends to Management for second-level approval
                            </span>
                          </div>
                        </>
                      )}

                      {project.addition_approval_status === 'pending_management_exemption_review' && isManagement && (
                        <>
                          <div className="flex flex-col items-center gap-1">
                            <button
                              disabled={chainBusyId === project.enrollment_id}
                              onClick={() => handleChainDecide(project, 'exemption', false)}
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
                              disabled={chainBusyId === project.enrollment_id}
                              onClick={() => handleChainDecide(project, 'exemption', true)}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 whitespace-nowrap disabled:opacity-40"
                            >
                              Approve Exemption
                            </button>
                            <span className="text-[10px] text-gray-400 text-center leading-tight max-w-[110px]">
                              → final · removes from cycle
                            </span>
                          </div>
                        </>
                      )}

                      {status === 'ready' && canSendFeedback && project.feedback_status !== 'completed' && (
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
          cycleStartDate={(cycle as any)?.start_date}
          cycleEndDate={(cycle as any)?.end_date}
          enrolledIds={enrolledTmsIds}
          onClose={() => setEnrollModal(false)}
          onDone={() => { setEnrollModal(false); invalidate(); }}
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
      {auditReportOpen && (
        <AuditReportModal cycleId={cycleId} onClose={() => setAuditReportOpen(false)} />
      )}
    </PageWrapper>
  );
};