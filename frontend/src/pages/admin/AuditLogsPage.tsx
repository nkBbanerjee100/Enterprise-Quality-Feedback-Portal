/**
 * Audit Logs.
 *
 * Two tabs:
 * - "Login Activity" — existing behavior, one row per user, most recent
 *   login only (csat_users.last_login_at).
 * - "Activity Log" — new, full event history from the `audit_logs` table:
 *   every login (success + failure), role change, cycle-eligibility change,
 *   registration approval, project deletion, feedback send, etc.
 */
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { usersApi } from '../../api/users.api';
import { auditApi } from '../../api/audit.api';
import { AUDIT_ACTION_LABELS, AuditLogEntry } from '../../types/audit.types';
import { BRAND } from '../../utils/constants';

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  QUALITY:    { bg: '#E7F6EC', text: '#1A5C3A' },
  MANAGEMENT: { bg: '#FDF3E3', text: '#9B7C2A' },
  MANAGER:    { bg: '#EFF4FF', text: '#2563EB' },
  DELIVERY:   { bg: '#F3E8FF', text: '#7C3AED' },
  SALES:      { bg: '#FEF2F2', text: '#B91C1C' },
  CUSTOMER:   { bg: '#F3F4F6', text: '#6B7280' },
};

function RoleBadge({ role }: { role: string }) {
  const c = ROLE_COLORS[role] ?? { bg: '#F3F4F6', text: '#6B7280' };
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: c.bg, color: c.text }}
    >
      {role}
    </span>
  );
}

function ActionBadge({ action, success }: { action: string; success: boolean }) {
  const label = AUDIT_ACTION_LABELS[action as keyof typeof AUDIT_ACTION_LABELS] ?? action;
  const bg = !success ? '#FEE2E2' : action.includes('DECLINED') || action.includes('REJECTED') ? '#FEF3C7' : '#E7F6EC';
  const text = !success ? '#991B1B' : action.includes('DECLINED') || action.includes('REJECTED') ? '#9B7C2A' : '#1A5C3A';
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: bg, color: text }}>
      {label}
    </span>
  );
}

function fmtTime(iso: string | null): string {
  if (!iso) return 'Never logged in';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short', day: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// The ENTITY column used to just show the raw entity_type/entity_id pair
// (e.g. "cycle_project_enrollment #42") — technically accurate, but not
// what anyone actually wants to read. `details` already carries the real
// project name (or cycle name, or email) for practically every event we
// log, so prefer that and only fall back to the raw pair when there's
// nothing human-readable to show (e.g. LOGIN/LOGOUT have no entity at all).
function entityLabel(e: AuditLogEntry): string {
  if (e.details) {
    try {
      const parsed = JSON.parse(e.details);
      if (parsed.project_name) return parsed.project_name;
      if (parsed.cycle_name) return parsed.cycle_name;
      if (parsed.email) return parsed.email;
    } catch {
      // details wasn't valid JSON — fall through to the raw pair below
    }
  }
  return e.entity_type ? `${e.entity_type} #${e.entity_id}` : '—';
}

// ── Tab 1: Login Activity (existing, unchanged behavior) ──────────────────
function LoginActivityTab() {
  const [search, setSearch] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['login-activity'],
    queryFn: () => usersApi.listLoginActivity(),
  });

  const filtered = useMemo(() => {
    const list = data ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(u => u.name.toLowerCase().includes(q) || u.role.toLowerCase().includes(q));
  }, [data, search]);

  return (
    <div className="space-y-4">
      <input
        type="text"
        placeholder="Search by name or role..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full max-w-sm border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
      />

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          Failed to load login activity.
        </div>
      )}

      {isLoading ? (
        <LoadingSpinner text="Loading login activity..." />
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="font-medium">{search ? 'No users match your search' : 'No users found'}</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr style={{ background: '#F8FAF9', borderBottom: '2px solid #E5E7EB' }}>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Login</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(u => (
                  <tr key={u.emp_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-800 text-sm">{u.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{u.emp_id}</div>
                    </td>
                    <td className="px-6 py-4"><RoleBadge role={u.role} /></td>
                    <td className="px-6 py-4 text-sm" style={{ color: u.last_login_at ? BRAND.textMid : BRAND.textLight }}>
                      {fmtTime(u.last_login_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tab 2: Activity Log (new, full event history) ─────────────────────────
function ActivityLogTab() {
  const [search, setSearch] = useState('');
  const [action, setAction] = useState<string>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [skip, setSkip] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const limit = 25;

  const { data: actionTypes } = useQuery({
    queryKey: ['audit-action-types'],
    queryFn: () => auditApi.listActionTypes(),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['audit-logs', { search, action, dateFrom, dateTo, skip }],
    queryFn: () =>
      auditApi.list({
        skip,
        limit,
        search: search || undefined,
        action: action || undefined,
        date_from: dateFrom ? new Date(dateFrom).toISOString() : undefined,
        date_to: dateTo ? new Date(dateTo).toISOString() : undefined,
      }),
  });

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const page = Math.floor(skip / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const resetAndSet = (setter: () => void) => {
    setter();
    setSkip(0);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Search</label>
          <input
            type="text"
            placeholder="Name, emp ID, or role..."
            value={search}
            onChange={e => resetAndSet(() => setSearch(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200 w-56"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">Action Type</label>
          <select
            value={action}
            onChange={e => resetAndSet(() => setAction(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200 w-52"
          >
            <option value="">All actions</option>
            {(actionTypes ?? Object.keys(AUDIT_ACTION_LABELS)).map(a => (
              <option key={a} value={a}>{AUDIT_ACTION_LABELS[a as keyof typeof AUDIT_ACTION_LABELS] ?? a}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => resetAndSet(() => setDateFrom(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => resetAndSet(() => setDateTo(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
          />
        </div>
        {(search || action || dateFrom || dateTo) && (
          <button
            onClick={() => resetAndSet(() => { setSearch(''); setAction(''); setDateFrom(''); setDateTo(''); })}
            className="text-sm px-3 py-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
          >
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          Failed to load activity log.
        </div>
      )}

      {isLoading ? (
        <LoadingSpinner text="Loading activity log..." />
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {rows.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="font-medium">No matching events</p>
            </div>
          ) : (
            <>
              <table className="w-full">
                <thead>
                  <tr style={{ background: '#F8FAF9', borderBottom: '2px solid #E5E7EB' }}>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Project Name</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">When</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((e: AuditLogEntry) => (
                    <React.Fragment key={e.id}>
                      <tr
                        className="hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                      >
                        <td className="px-6 py-4">
                          <div className="font-semibold text-gray-800 text-sm">{e.actor_name ?? e.actor_emp_id ?? '—'}</div>
                          {e.actor_role && <div className="mt-1"><RoleBadge role={e.actor_role} /></div>}
                        </td>
                        <td className="px-6 py-4"><ActionBadge action={e.action} success={e.success} /></td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {entityLabel(e)}
                        </td>
                        <td className="px-6 py-4 text-sm" style={{ color: BRAND.textMid }}>{fmtTime(e.created_at)}</td>
                        <td className="px-6 py-4 text-xs text-gray-400">{e.ip_address ?? '—'}</td>
                      </tr>
                      {expandedId === e.id && e.details && (
                        <tr>
                          <td colSpan={5} className="px-6 py-3 bg-gray-50 text-xs text-gray-600 font-mono whitespace-pre-wrap">
                            {(() => {
                              try { return JSON.stringify(JSON.parse(e.details), null, 2); }
                              catch { return e.details; }
                            })()}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>

              <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100 text-sm text-gray-500">
                <span>{total} event{total !== 1 ? 's' : ''} total</span>
                <div className="flex items-center gap-3">
                  <button
                    disabled={skip === 0}
                    onClick={() => setSkip(Math.max(0, skip - limit))}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  <span>Page {page} of {totalPages}</span>
                  <button
                    disabled={skip + limit >= total}
                    onClick={() => setSkip(skip + limit)}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export const AuditLogsContent: React.FC = () => {
  const [tab, setTab] = useState<'login' | 'activity'>('login');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Audit Logs</h1>
        <p className="text-sm text-gray-500 mt-1">
          Login snapshots and full activity history across the platform.
        </p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {[
          { key: 'login' as const, label: 'Login Activity' },
          { key: 'activity' as const, label: 'Activity Log' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors"
            style={{
              borderColor: tab === t.key ? BRAND.green : 'transparent',
              color: tab === t.key ? BRAND.green : '#6B7280',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'login' ? <LoginActivityTab /> : <ActivityLogTab />}
    </div>
  );
};

export const AuditLogsPage: React.FC = () => {
  return (
    <PageWrapper>
      <AuditLogsContent />
    </PageWrapper>
  );
};