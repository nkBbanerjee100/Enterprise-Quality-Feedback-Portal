/**
 * Settings Page — role-aware.
 *
 * Content shown depends on who's logged in:
 *   - Everyone:    "My Details" (name, email, emp_id, role)
 *   - MANAGER:     + "My Projects" — TMS projects where they're the PM
 *   - QUALITY:     + "Allow User" tab  + "Audit Logs" tab
 *   - MANAGEMENT:  + "Allow User" tab
 *
 * The Allow User / Audit Logs content is unchanged — this page embeds
 * the same components that previously lived at /allow-user and
 * /admin/audit-logs. Those routes still exist for direct links, but the
 * sidebar no longer lists them separately.
 */
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useAuthStore } from '../../store/auth.store';
import { UserRole } from '../../types/auth.types';
import { projectsApi } from '../../api/projects.api';
import { authApi } from '../../api/auth.api';
import { TMSProject } from '../../types/project.types';
import { AllowUserContent } from './SettingsAllowUser';
import { AuditLogsContent } from '../admin/AuditLogsPage';
import { BRAND } from '../../utils/constants';

type TabKey = 'details' | 'allow-user' | 'audit-logs';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #F3F4F6' }}>
    <span style={{ fontSize: 13, color: '#6B7280' }}>{label}</span>
    <span style={{ fontSize: 13, fontWeight: 600, color: '#1F2937' }}>{value}</span>
  </div>
);

/** "My Details" card — shown to every role. */
const MyDetailsCard: React.FC = () => {
  const { user } = useAuthStore();
  if (!user) return null;

  const fullName = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || user.displayName;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6" style={{ maxWidth: 480 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div
          style={{
            width: 44, height: 44, borderRadius: '50%',
            background: BRAND.green, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 700, flexShrink: 0,
          }}
        >
          {fullName.charAt(0).toUpperCase() || '?'}
        </div>
        <div>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#1F2937', margin: 0 }}>{fullName}</p>
          <p style={{ fontSize: 12, color: '#9B7C2A', fontWeight: 600, margin: '2px 0 0' }}>{user.role}</p>
        </div>
      </div>
      <DetailRow label="Employee ID" value={user.emp_id || '—'} />
      <DetailRow label="Email" value={user.email || '—'} />
      <DetailRow label="Role" value={user.role} />
      <DetailRow label="Account status" value={user.is_active ? 'Active' : 'Inactive'} />
    </div>
  );
};

/** "Change Password" card — shown to every role, on the My Details tab. */
const ChangePasswordCard: React.FC = () => {
  const { user } = useAuthStore();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const inputCls = (err?: boolean) =>
    `h-10 w-full rounded-lg border px-3 text-sm text-gray-800 outline-none transition focus:border-[#1A5C3A] ${
      err ? 'border-red-400' : 'border-gray-200'
    }`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await authApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      setSuccess(res.message || 'Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Could not change your password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6" style={{ maxWidth: 480 }}>
      <h2 className="text-base font-semibold text-gray-800 mb-1">Change Password</h2>
      <p className="text-xs text-gray-500 mb-4">
        You'll need your current password to set a new one.
      </p>

      {success && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 flex items-center gap-2">
          <span className="text-gray-400">✓</span>{success}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3" autoComplete="on">
        {/* Hidden but present in the DOM — this is what lets the browser's
            password manager correlate this form with the ALREADY-SAVED
            login for this exact account, instead of not knowing which of
            possibly several saved logins for this site to update and
            asking the user to pick one. Standard technique for password
            change forms; without a username/email field present, browsers
            have nothing to match against. */}
        <input
          type="email"
          name="username"
          autoComplete="username"
          value={user?.email ?? ''}
          readOnly
          hidden
        />
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Current Password</label>
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            className={inputCls()}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">New Password</label>
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="At least 8 characters"
            className={inputCls()}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Confirm New Password</label>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            className={inputCls()}
          />
        </div>
        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={isLoading}
            style={{ background: BRAND.green }}
            className="px-5 py-2 text-sm font-semibold text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition"
          >
            {isLoading ? 'Changing...' : 'Change Password'}
          </button>
        </div>
      </form>
    </div>
  );
};

/** "My Projects" — MANAGER only: TMS projects where this user is the PM. */
const MyProjectsCard: React.FC = () => {
  const { user } = useAuthStore();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['my-pm-projects', user?.emp_id],
    queryFn: () => projectsApi.list(0, 100, undefined, undefined, user?.emp_id),
    enabled: !!user?.emp_id,
  });

  // TMS's own IsProjectActive flag isn't reliable, so it's not used at all
  // here — completion is judged purely by comparing EndDate to today.
  const isCompleted = (p: TMSProject) => {
    if (!p.end_date) return false;
    return new Date(p.end_date) < new Date();
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6" style={{ maxWidth: 720 }}>
      <h2 className="text-base font-semibold text-gray-800 mb-1">My Projects</h2>
      <p className="text-xs text-gray-500 mb-4">Projects where you're the assigned Project Manager in TMS.</p>

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : isError ? (
        <p className="text-sm text-red-500">Couldn't load your projects. Try refreshing.</p>
      ) : !data || data.projects.length === 0 ? (
        <p className="text-sm text-gray-400">No projects are currently assigned to you as PM.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-gray-400 border-b border-gray-100">
              <th className="py-2 pr-4">Project</th>
              <th className="py-2 pr-4">Start</th>
              <th className="py-2 pr-4">End</th>
              <th className="py-2 pr-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.projects.map(p => {
              const completed = isCompleted(p);
              return (
                <tr key={p.project_id} className="border-b border-gray-50">
                  <td className="py-2 pr-4 text-gray-700 font-medium">{p.project_name}</td>
                  <td className="py-2 pr-4 text-gray-500">{formatDate(p.start_date)}</td>
                  <td className="py-2 pr-4 text-gray-500">{formatDate(p.end_date)}</td>
                  <td className="py-2 pr-4">
                    <span
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                      style={!completed
                        ? { background: '#E8F2EC', color: '#1A5C3A' }
                        : { background: '#F3F4F6', color: '#6B7280' }}
                    >
                      {!completed ? 'Active' : 'Completed'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};

export const SettingsPage: React.FC = () => {
  const { user } = useAuthStore();
  const showAllowUser = user?.role === UserRole.QUALITY || user?.role === UserRole.MANAGEMENT;
  const showAuditLogs = user?.role === UserRole.QUALITY;
  const showMyProjects = user?.role === UserRole.MANAGER;

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'details', label: 'My Details' },
    ...(showAllowUser ? [{ key: 'allow-user' as TabKey, label: 'Allow User' }] : []),
    ...(showAuditLogs ? [{ key: 'audit-logs' as TabKey, label: 'Audit Logs' }] : []),
  ];

  const [tab, setTab] = useState<TabKey>('details');

  return (
    <PageWrapper>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Your account details{showAllowUser || showAuditLogs ? ', plus admin tools' : ''}.</p>
        </div>

        {/* Tab bar — only when there's more than one tab */}
        {tabs.length > 1 && (
          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #E5E7EB' }}>
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  padding: '10px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: tab === t.key ? BRAND.green : '#6B7280',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: tab === t.key ? `2px solid ${BRAND.green}` : '2px solid transparent',
                  cursor: 'pointer',
                  marginBottom: '-1px',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {tab === 'details' && (
          <div className="space-y-6">
            <MyDetailsCard />
            <ChangePasswordCard />
            {showMyProjects && <MyProjectsCard />}
          </div>
        )}
        {tab === 'allow-user' && showAllowUser && <AllowUserContent />}
        {tab === 'audit-logs' && showAuditLogs && <AuditLogsContent />}
      </div>
    </PageWrapper>
  );
};

export default SettingsPage;