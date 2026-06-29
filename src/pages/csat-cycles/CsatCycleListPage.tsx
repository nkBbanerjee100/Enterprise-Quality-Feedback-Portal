/**
 * CSAT Cycles List Page
 */
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { Pagination } from '../../components/common/Pagination';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { csatCyclesApi } from '../../api/csat-cycles.api';
import { formatDate } from '../../utils/formatters';
import { useAuthStore } from '../../store/auth.store';
import { UserRole } from '../../types/auth.types';
import { CSATCycle } from '../../types/common.types';
import CreateCycleModal from '../../components/CreateCycleModal';

const BRAND = { green: '#1A5C3A', gold: '#9B7C2A' };

// ── Delete Confirmation Modal ─────────────────────────────────────────────────
function DeleteCycleModal({
  cycle,
  onClose,
  onConfirm,
  isDeleting,
}: {
  cycle: CSATCycle;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}) {
  const cycleName = cycle.cycle_name ?? cycle.cycleName ?? '—';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="px-6 py-4 bg-red-50 border-b border-red-100 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-red-900">Remove CSAT Cycle</h3>
            <p className="text-xs text-red-600 mt-0.5">{cycleName}</p>
          </div>
          <button onClick={onClose} className="text-red-400 hover:text-red-700 text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <p className="text-sm text-gray-700">
            Are you sure you want to remove <strong>{cycleName}</strong> from the portal?
          </p>
          <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-xs text-blue-800 space-y-1">
            <p className="font-semibold">What happens:</p>
            <p>• The cycle will no longer appear anywhere in the portal</p>
            <p>• All associated data is retained in the database</p>
            <p>• This can be reversed by the system admin if needed</p>
          </div>
        </div>
        <div className="px-6 pb-5 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-5 py-2 text-sm font-semibold rounded-lg text-white hover:opacity-90 disabled:opacity-50"
            style={{ background: '#DC2626' }}
          >
            {isDeleting ? 'Deleting...' : 'Yes, Remove Cycle'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export const CsatCycleListPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CSATCycle | null>(null);
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [halfFilter, setHalfFilter] = useState<'H1' | 'H2' | null>(null);
  const pageSize = 10;

  const canManage = user?.role === UserRole.QUALITY || user?.role === UserRole.MANAGER;
  const canDelete  = user?.role === UserRole.MANAGER;

  // Fetch ALL cycles (no is_active filter anymore)
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['csatCycles'],
    queryFn: () => csatCyclesApi.list(0, 50),
  });

  // Derive available years from loaded data
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    (data?.data ?? []).forEach(c => { if (c.year) years.add(c.year); });
    return Array.from(years).sort((a, b) => b - a); // newest first
  }, [data]);

  // Derive available halves from loaded data (only show H1/H2 if cycles exist for them)
  const availableHalves = useMemo(() => {
    const halves = new Set<'H1' | 'H2'>();
    (data?.data ?? []).forEach(c => { if (c.half === 'H1' || c.half === 'H2') halves.add(c.half); });
    return (['H1', 'H2'] as const).filter(h => halves.has(h));
  }, [data]);

  // Reset halfFilter if the selected half no longer exists in data
  React.useEffect(() => {
    if (halfFilter !== null && !availableHalves.includes(halfFilter)) {
      setHalfFilter(null);
    }
  }, [availableHalves, halfFilter]);

  // Client-side filter + paginate
  const filtered = useMemo(() => {
    return (data?.data ?? []).filter(c => {
      if (yearFilter !== null && c.year !== yearFilter) return false;
      if (halfFilter !== null && c.half !== halfFilter) return false;
      return true;
    });
  }, [data, yearFilter, halfFilter]);

  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const deleteMutation = useMutation({
    mutationFn: (cycleId: number) => csatCyclesApi.deleteCycle(cycleId),
    onSuccess: () => {
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ['csatCycles'] });
    },
  });

  const clearFilters = () => { setYearFilter(null); setHalfFilter(null); setPage(1); };
  const hasFilter = yearFilter !== null || halfFilter !== null;

  return (
    <PageWrapper>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">CSAT Cycles</h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage half-yearly feedback cycles (H1: Jan–Jun · H2: Jul–Dec)
            </p>
          </div>
          {canManage && (
            <button
              onClick={() => setShowCreateModal(true)}
              style={{ background: BRAND.green }}
              className="px-4 py-2 text-white rounded-lg hover:opacity-90 text-sm font-medium flex items-center gap-2"
            >
              <span className="text-lg leading-none">+</span> New Cycle
            </button>
          )}
        </div>

        {/* Filters — Year pills + H1/H2 toggle */}
        <div className="flex flex-wrap items-center gap-3">

          {/* Year pills (dynamic from data) */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 font-medium mr-1">Year</span>
            <button
              onClick={() => { setYearFilter(null); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                yearFilter === null
                  ? 'text-white border-transparent'
                  : 'text-gray-600 border-gray-300 hover:border-gray-400'
              }`}
              style={yearFilter === null ? { background: BRAND.green } : {}}
            >
              All
            </button>
            {availableYears.map(y => (
              <button
                key={y}
                onClick={() => { setYearFilter(y); setPage(1); }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  yearFilter === y
                    ? 'text-white border-transparent'
                    : 'text-gray-600 border-gray-300 hover:border-gray-400'
                }`}
                style={yearFilter === y ? { background: BRAND.green } : {}}
              >
                {y}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="h-5 w-px bg-gray-200" />

          {/* H1 / H2 toggle */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 font-medium mr-1">Half</span>
            {availableHalves.map(h => (
              <button
                key={h}
                onClick={() => { setHalfFilter(halfFilter === h ? null : h); setPage(1); }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  halfFilter === h
                    ? 'text-white border-transparent'
                    : 'text-gray-600 border-gray-300 hover:border-gray-400'
                }`}
                style={halfFilter === h ? {
                  background: h === 'H1' ? '#1D4ED8' : '#C2410C',
                } : {}}
              >
                {h} · {h === 'H1' ? 'Jan–Jun' : 'Jul–Dec'}
              </button>
            ))}
          </div>

          {/* Clear filters */}
          {hasFilter && (
            <button
              onClick={clearFilters}
              className="text-xs text-gray-400 hover:text-gray-600 underline ml-1"
            >
              Clear filters
            </button>
          )}
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            Failed to load CSAT cycles
          </div>
        )}

        {isLoading ? (
          <LoadingSpinner text="Loading CSAT cycles..." />
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {paginated.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <div className="text-4xl mb-3">↺</div>
                <p className="font-medium">
                  {hasFilter ? 'No cycles match the selected filters' : 'No CSAT cycles yet'}
                </p>
                {hasFilter ? (
                  <button onClick={clearFilters} className="text-sm mt-2 underline text-gray-400 hover:text-gray-600">
                    Clear filters
                  </button>
                ) : canManage && (
                  <p className="text-sm mt-1">Click "New Cycle" to create one</p>
                )}
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr style={{ background: '#F8FAF9', borderBottom: '2px solid #E5E7EB' }}>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Cycle</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Period</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Year / Half</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.map((cycle) => (
                    <tr key={cycle.id} className="hover:bg-gray-50 transition-colors">

                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-800 text-sm">{cycle.cycle_name ?? cycle.cycleName}</div>
                        {cycle.description && (
                          <div className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{cycle.description}</div>
                        )}
                      </td>

                      <td className="px-6 py-4 text-sm text-gray-600">
                        {formatDate(cycle.start_date ?? cycle.startDate)} → {formatDate(cycle.end_date ?? cycle.endDate)}
                      </td>

                      <td className="px-6 py-4">
                        {cycle.year && (
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold"
                            style={{
                              background: cycle.half === 'H1' ? '#EFF6FF' : '#FFF7ED',
                              color:      cycle.half === 'H1' ? '#1D4ED8' : '#C2410C',
                            }}
                          >
                            {cycle.year} · {cycle.half}
                            <span className="opacity-60">
                              {cycle.half === 'H1' ? 'Jan–Jun' : 'Jul–Dec'}
                            </span>
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-sm text-gray-500">
                        {formatDate(cycle.created_at ?? cycle.createdAt)}
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => navigate(`/csat-cycles/${cycle.id}`)}
                            className="text-sm font-medium px-3 py-1.5 rounded-lg hover:opacity-90 transition whitespace-nowrap"
                            style={{ color: BRAND.green, background: '#F0FDF4', border: '1px solid #BBF7D0' }}
                          >
                            Manage Projects →
                          </button>
                          {canDelete && (
                            <button
                              onClick={() => setDeleteTarget(cycle)}
                              className="p-1.5 rounded-lg border border-red-200 text-red-400 hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition"
                              title="Delete cycle"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6M14 11v6" />
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>

                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {filtered.length > pageSize && (
          <Pagination
            total={filtered.length}
            currentPage={page}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        )}
      </div>

      {showCreateModal && (
        <CreateCycleModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => { setShowCreateModal(false); refetch(); }}
        />
      )}

      {deleteTarget && (
        <DeleteCycleModal
          cycle={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          isDeleting={deleteMutation.isPending}
        />
      )}
    </PageWrapper>
  );
};