/**
 * Audit Logs — Quality-only view of who logged in and when.
 *
 * Sourced from csat_users.last_login_at, which the backend already updates
 * on every successful login. Note: this shows each person's MOST RECENT
 * login only — it's not a full historical trail of every login event.
 */
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { usersApi } from '../../api/users.api';
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

function fmtLoginTime(iso: string | null): string {
  if (!iso) return 'Never logged in';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short', day: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export const AuditLogsContent: React.FC = () => {
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Audit Logs</h1>
        <p className="text-sm text-gray-500 mt-1">
          Who logged in, and when — most recent login per person.
        </p>
      </div>

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
              <p className="font-medium">
                {search ? 'No users match your search' : 'No users found'}
              </p>
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
                    <td className="px-6 py-4">
                      <RoleBadge role={u.role} />
                    </td>
                    <td className="px-6 py-4 text-sm" style={{ color: u.last_login_at ? BRAND.textMid : BRAND.textLight }}>
                      {fmtLoginTime(u.last_login_at)}
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
};

export const AuditLogsPage: React.FC = () => {
  return (
    <PageWrapper>
      <AuditLogsContent />
    </PageWrapper>
  );
};