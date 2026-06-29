/**
 * Projects List Page — reads live from TMS (tsms_projects)
 * Mindteck CSAT Tool · Quality Feedback Portal
 *
 * Status is derived from end_date (not is_active) because TMS often leaves
 * IsProjectActive=1 even after a project ends.
 *
 * Rules:
 *   end_date year === 2099          → Testing Purpose
 *   end_date < today                → Completed
 *   end_date >= today OR null       → Active
 */
import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageWrapper }    from '../../components/layout/PageWrapper';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { useProjects }    from '../../hooks/useProjects';
import { TMSProject }     from '../../types/project.types';
import { BRAND }          from '../../utils/constants';

const PAGE_SIZE = 20;

// ── status derivation (source of truth for the whole app) ────────────────────

export type DerivedStatus = 'active' | 'completed' | 'testing';

export function deriveStatus(end_date: string | null): DerivedStatus {
  if (!end_date) return 'active';
  const d = new Date(end_date);
  if (d.getFullYear() === 2099) return 'testing';
  if (d < new Date()) return 'completed';
  return 'active';
}

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

// ── sub-components ────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: DerivedStatus }> = ({ status }) => {
  const cfg = {
    active:    { label: 'Active',           bg: '#E8F2EC', color: BRAND.green,  dot: '#22C55E', border: BRAND.border },
    completed: { label: 'Completed',        bg: '#F3F4F6', color: '#6B7280',    dot: '#9CA3AF', border: '#D1D5DB'   },
    testing:   { label: 'Testing Purpose',  bg: '#EEF2FF', color: '#4338CA',    dot: '#6366F1', border: '#C7D2FE'   },
  }[status];

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20,
      fontSize: 11, fontWeight: 600, letterSpacing: '0.03em',
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.border}`,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
};

const RiskBadge: React.FC<{ risk: string | null }> = ({ risk }) => {
  if (!risk) return <span style={{ color: BRAND.textLight }}>—</span>;
  const map: Record<string, { bg: string; color: string }> = {
    Green:  { bg: '#DCFCE7', color: '#15803D' },
    Yellow: { bg: '#FEF9C3', color: '#A16207' },
    Red:    { bg: '#FEE2E2', color: '#B91C1C' },
  };
  const s = map[risk] ?? { bg: '#F3F4F6', color: '#6B7280' };
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.color,
    }}>
      {risk}
    </span>
  );
};

const EmptyState: React.FC<{ hasSearch: boolean }> = ({ hasSearch }) => (
  <tr><td colSpan={7}>
    <div style={{ textAlign: 'center', padding: '56px 24px', color: BRAND.textLight }}>
      <div style={{
        width: 52, height: 52, borderRadius: '50%', background: BRAND.greenMuted,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 14px',
        color: BRAND.green,
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <line x1="9" y1="9" x2="15" y2="9"/>
          <line x1="9" y1="13" x2="13" y2="13"/>
        </svg>
      </div>
      <p style={{ fontSize: 14, fontWeight: 600, color: BRAND.textMid, margin: '0 0 4px' }}>
        {hasSearch ? 'No projects match your search' : 'No projects found in TMS'}
      </p>
      <p style={{ fontSize: 12, margin: 0 }}>
        {hasSearch ? 'Try a different keyword or clear the filter.' : 'Projects will appear here once TMS is connected.'}
      </p>
    </div>
  </td></tr>
);

// ── pagination ────────────────────────────────────────────────────────────────

function pageNums(total: number, cur: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  if (cur > 3) out.push('…');
  for (let p = Math.max(2, cur - 1); p <= Math.min(total - 1, cur + 1); p++) out.push(p);
  if (cur < total - 2) out.push('…');
  out.push(total);
  return out;
}

const PagBtn: React.FC<{
  onClick: () => void; disabled?: boolean; active?: boolean; children: React.ReactNode;
}> = ({ onClick, disabled, active, children }) => (
  <button onClick={onClick} disabled={disabled} style={{
    padding: '5px 10px', borderRadius: 6, fontSize: 12, minWidth: 32,
    border:     `1.5px solid ${active ? BRAND.green : BRAND.border}`,
    background: active ? BRAND.green : '#fff',
    color:      active ? '#fff' : disabled ? BRAND.textLight : BRAND.textMid,
    fontWeight: active ? 600 : 400,
    cursor:     disabled ? 'not-allowed' : 'pointer',
    opacity:    disabled ? 0.5 : 1,
    transition: 'all 0.1s',
  }}>{children}</button>
);

// ── main page ─────────────────────────────────────────────────────────────────

type FilterMode = 'all' | 'active' | 'completed';

export const ProjectListPage: React.FC = () => {
  const navigate = useNavigate();

  const [page,    setPage]   = useState(1);
  const [search,  setSearch] = useState('');
  const [dsearch, setDS]     = useState('');
  const [filter,  setFilter] = useState<FilterMode>('all');
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // Always fetch ALL projects — never pass is_active to the backend because
  // TMS's IsProjectActive flag is unreliable. We filter by end_date client-side.
  // We fetch a large page when filtering so we can show PAGE_SIZE filtered rows.
  const fetchLimit = filter === 'all' ? PAGE_SIZE : 200;
  const fetchSkip  = filter === 'all' ? (page - 1) * PAGE_SIZE : 0;

  const { data: rawData, isLoading, error, isFetching } =
    useProjects(fetchSkip, fetchLimit, dsearch || undefined, undefined);

  // Client-side status filter
  const filteredProjects = rawData?.projects.filter(p => {
    if (filter === 'all') return true;
    const s = deriveStatus(p.end_date);
    return filter === 'active' ? s === 'active' : s === 'completed';
  }) ?? [];

  // For 'all' mode use backend total; for filtered use client count
  const totalFiltered = filter === 'all'
    ? (rawData?.total ?? 0)
    : filteredProjects.length;

  // Client-side pagination when filtering
  const skip = filter === 'all' ? fetchSkip : (page - 1) * PAGE_SIZE;
  const pagedProjects = filter === 'all'
    ? filteredProjects
    : filteredProjects.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const data = rawData ? { ...rawData, projects: pagedProjects, total: totalFiltered } : undefined;

  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    setPage(1);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDS(val), 350);
  }, []);

  const totalPages = Math.ceil(totalFiltered / PAGE_SIZE) || 0;

  const FILTERS: Array<{ label: string; value: FilterMode }> = [
    { label: 'All',       value: 'all'       },
    { label: 'Active',    value: 'active'    },
    { label: 'Completed', value: 'completed' },
  ];

  return (
    <PageWrapper>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ── Page header ── */}
        <div>
          <p style={{ fontSize: 11, color: BRAND.gold, fontWeight: 700,
                      letterSpacing: '0.10em', textTransform: 'uppercase', margin: '0 0 4px' }}>
            Quality Feedback Platform
          </p>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: BRAND.textDark, margin: '0 0 4px' }}>
            Projects
          </h1>
          <p style={{ fontSize: 13, color: BRAND.textMid, margin: 0 }}>
            {rawData
              ? filter === 'all'
                ? `${rawData.total.toLocaleString()} project${rawData.total !== 1 ? 's' : ''} in TMS`
                : `${totalFiltered} ${filter} project${totalFiltered !== 1 ? 's' : ''}`
              : 'Loading from TMS…'}
          </p>
        </div>

        {/* ── Toolbar ── */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 360 }}>
            <span style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              color: BRAND.textLight, pointerEvents: 'none',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by project name…"
              style={{
                width: '100%', padding: '9px 12px 9px 36px', boxSizing: 'border-box',
                border: `1.5px solid ${BRAND.border}`, borderRadius: 8,
                fontSize: 13, color: BRAND.textDark, background: '#fff', outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {FILTERS.map(opt => (
              <button
                key={opt.value}
                onClick={() => { setFilter(opt.value); setPage(1); }}
                style={{
                  padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  border:     `1.5px solid ${filter === opt.value ? BRAND.green : BRAND.border}`,
                  background: filter === opt.value ? BRAND.green : '#fff',
                  color:      filter === opt.value ? '#fff' : BRAND.textMid,
                  cursor: 'pointer', transition: 'all 0.12s',
                }}
              >{opt.label}</button>
            ))}
          </div>
        </div>

        {/* ── Table card ── */}
        <div style={{
          background: '#fff', borderRadius: 12,
          border: `1px solid ${BRAND.border}`,
          boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden',
        }}>
          {isFetching && !isLoading && (
            <div style={{ height: 3, background: `linear-gradient(90deg, ${BRAND.green}, ${BRAND.gold})` }} />
          )}

          {isLoading ? (
            <div style={{ padding: 64 }}>
              <LoadingSpinner text="Loading projects from TMS…" />
            </div>
          ) : error ? (
            <div style={{
              margin: 24, padding: '14px 18px', borderRadius: 8,
              background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#DC2626', fontSize: 13,
            }}>
              Could not connect to TMS. Please check the TMS database connection and try again.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: BRAND.greenMuted }}>
                  {[
                    { label: 'Project ID',   w: 90       },
                    { label: 'Project Name', w: 'auto'   },
                    { label: 'Start Date',   w: 110      },
                    { label: 'End Date',     w: 110      },
                    { label: 'PM',           w: 130      },
                    { label: 'Risk',         w: 90       },
                    { label: 'Status',       w: 140      },
                  ].map(col => (
                    <th key={col.label} style={{
                      padding: '11px 16px', textAlign: 'left',
                      fontSize: 11, fontWeight: 700, color: BRAND.textMid,
                      letterSpacing: '0.07em', textTransform: 'uppercase',
                      borderBottom: `1px solid ${BRAND.border}`,
                      width: col.w, whiteSpace: 'nowrap',
                    }}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!data?.projects.length ? (
                  <EmptyState hasSearch={!!dsearch} />
                ) : (
                  data.projects.map((p: TMSProject, idx: number) => {
                    const status = deriveStatus(p.end_date);
                    return (
                      <tr
                        key={p.project_id}
                        onClick={() => navigate(`/projects/${p.project_id}`)}
                        style={{
                          borderBottom: idx < data.projects.length - 1
                            ? `1px solid ${BRAND.border}` : 'none',
                          cursor: 'pointer', transition: 'background 0.1s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = BRAND.surface)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 700,
                                     color: BRAND.green, whiteSpace: 'nowrap' }}>
                          #{p.project_id}
                        </td>
                        <td style={{ padding: '13px 16px', fontSize: 13, color: BRAND.textDark,
                                     fontWeight: 500, maxWidth: 300 }}>
                          {p.project_name}
                        </td>
                        <td style={{ padding: '13px 16px', fontSize: 12,
                                     color: BRAND.textLight, whiteSpace: 'nowrap' }}>
                          {fmtDate(p.start_date)}
                        </td>
                        <td style={{ padding: '13px 16px', fontSize: 12,
                                     color: BRAND.textLight, whiteSpace: 'nowrap' }}>
                          {fmtDate(p.end_date)}
                        </td>
                        <td style={{ padding: '13px 16px', fontSize: 12, color: BRAND.textMid }}>
                          {p.project_manager_id ?? '—'}
                        </td>
                        <td style={{ padding: '13px 16px' }}>
                          <RiskBadge risk={p.risk_status} />
                        </td>
                        <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                          <StatusBadge status={status} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}

          {data && data.total > PAGE_SIZE && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '11px 16px', borderTop: `1px solid ${BRAND.border}`,
              background: BRAND.surface,
            }}>
              <span style={{ fontSize: 12, color: BRAND.textLight }}>
                Showing {skip + 1}–{Math.min(skip + PAGE_SIZE, totalFiltered)} of {totalFiltered.toLocaleString()}
              </span>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <PagBtn disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</PagBtn>
                {pageNums(totalPages, page).map((p, i) =>
                  p === '…'
                    ? <span key={`e${i}`} style={{ padding: '5px 6px', color: BRAND.textLight, fontSize: 12 }}>…</span>
                    : <PagBtn key={p} active={p === page} onClick={() => setPage(p as number)}>{p}</PagBtn>
                )}
                <PagBtn disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next →</PagBtn>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
};