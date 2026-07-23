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

const BRAND = { green: '#1A5C3A', gold: '#9B7C2A' };

// ── Create CSAT Cycle Modal — Quality only ─────────────────────────────────
// Replaces the old auto half-year system: Quality now picks a name and a
// custom date range directly, instead of the app silently computing
// Apr–Sep / Oct–Mar windows. The backend still validates the range doesn't
// overlap any existing cycle.
function CreateCycleModal({ onClose, onCreated }: { onClose: () => void; onCreated: (cycleId: number) => void }) {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Years dropdown-equivalent range for the date pickers — previous year
  // through the current year, per the requirement, expressed as min/max
  // bounds on the native date input rather than a separate year selector.
  const now = new Date();
  const minDate = `${now.getFullYear() - 1}-01-01`;
  const maxDate = `${now.getFullYear()}-12-31`;

  const mutation = useMutation({
    mutationFn: () => csatCyclesApi.create({
      cycle_name: name.trim(),
      start_date: startDate,
      end_date: endDate,
    }),
    onSuccess: (cycle: any) => onCreated(cycle.id),
    onError: (err: any) => {
      setErrorMsg(err?.response?.data?.detail || "Couldn't create the cycle. Please try again.");
    },
  });

  const canSubmit = name.trim().length > 0 && !!startDate && !!endDate && startDate < endDate;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div style={{ background: BRAND.green }} className="px-6 py-4 flex justify-between items-center">
          <h3 className="text-white font-bold">Create CSAT Cycle</h3>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Cycle Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder='e.g. "CSAT 2026 Mid-Year"'
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                min={minDate}
                max={maxDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                min={startDate || minDate}
                max={maxDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
              />
            </div>
          </div>

          {startDate && endDate && startDate >= endDate && (
            <p className="text-xs text-red-600">End date must be after the start date.</p>
          )}

          {errorMsg && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
              {errorMsg}
            </div>
          )}
        </div>

        <div className="px-6 pb-5 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => { setErrorMsg(null); mutation.mutate(); }}
            disabled={!canSubmit || mutation.isPending}
            style={{ background: BRAND.green }}
            className="px-5 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {mutation.isPending ? 'Creating...' : 'Create Cycle'}
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
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [halfFilter, setHalfFilter] = useState<'H1' | 'H2' | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const pageSize = 10;

  // Only Quality (QM) creates cycles now — Manager and Management can only
  // add projects to a cycle that already exists (see enroll_projects /
  // EnrollModal on the cycle detail page). Nobody can add anything at all
  // until Quality has created at least one cycle to add into.
  const isQuality = user?.role === UserRole.QUALITY;

  const { data, isLoading, error } = useQuery({
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
              Manage CSAT feedback cycles — each with its own name and date range
            </p>
          </div>
          {isQuality && (
            <button
              onClick={() => setCreateModalOpen(true)}
              style={{ background: BRAND.green }}
              className="px-4 py-2 text-white rounded-lg hover:opacity-90 text-sm font-medium flex items-center gap-2 whitespace-nowrap"
            >
              + Create CSAT Cycle
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
          {availableHalves.length > 0 && <div className="h-5 w-px bg-gray-200" />}

          {/* H1 / H2 toggle — only shows up for legacy cycles created under
              the old auto half-year system; new custom-dated cycles won't
              cleanly land in either bucket, so this fades out naturally as
              old cycles age out of the list. */}
          {availableHalves.length > 0 && (
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
                  {h}
                </button>
              ))}
            </div>
          )}

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
                ) : isQuality ? (
                  <p className="text-sm mt-1">Click "+ Create CSAT Cycle" to create one</p>
                ) : (
                  <p className="text-sm mt-1">Waiting on Quality to create the first cycle</p>
                )}
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr style={{ background: '#F8FAF9', borderBottom: '2px solid #E5E7EB' }}>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Cycle</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Period</th>
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

      {createModalOpen && (
        <CreateCycleModal
          onClose={() => setCreateModalOpen(false)}
          onCreated={(cycleId) => {
            setCreateModalOpen(false);
            qc.invalidateQueries({ queryKey: ['csatCycles'] });
            navigate(`/csat-cycles/${cycleId}`);
          }}
        />
      )}
    </PageWrapper>
  );
};