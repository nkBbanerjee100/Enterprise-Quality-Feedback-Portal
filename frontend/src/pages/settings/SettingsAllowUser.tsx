/**
 * AllowUserContent — extracted so SettingsPage can embed it as a tab
 * and AllowUserPage can still wrap it for the standalone /allow-user route.
 */
import React, { useEffect, useState } from 'react';
import { z } from 'zod';
import { api } from '../../api/client';

const ALLOWED_ROLES = ['QUALITY', 'DELIVERY', 'SALES', 'MANAGER', 'MANAGEMENT'] as const;
type AllowedRole = typeof ALLOWED_ROLES[number];

const AllowSchema = z.object({
  email: z.string().email('Enter a valid work email'),
  role:  z.enum(ALLOWED_ROLES, { errorMap: () => ({ message: 'Select a role' }) }),
});

type AllowData = z.infer<typeof AllowSchema>;
type FieldErrors = Record<string, string>;

const BRAND_GREEN = '#1A5C3A';

interface AllowedUserRow {
  Email: string;
  role: string;
  allowed_by?: string | null;
  is_used: boolean;
  created_at?: string | null;
  used_at?: string | null;
}

const allowUser = async (payload: AllowData) => {
  const response = await api.post('/api/auth/allow-user', payload);
  return response.data;
};

const fetchAllowedUsers = async (): Promise<AllowedUserRow[]> => {
  const response = await api.get('/api/auth/allowed-users');
  return response.data.users;
};

interface FieldProps {
  label: string;
  error?: string;
  children: React.ReactNode;
}
const Field: React.FC<FieldProps> = ({ label, error, children }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-[13px] font-medium text-[#3D3D3D]">{label}</label>
    {children}
    {error && <span className="text-xs text-red-600">{error}</span>}
  </div>
);

const inputCls = (err?: string) =>
  `h-11 w-full rounded-[10px] border-[1.5px] px-3.5 text-sm text-[#1A1A1A] outline-none transition focus:border-[#1A5C3A] focus:shadow-[0_0_0_3px_rgba(26,92,58,0.12)] ${err ? 'border-red-400' : 'border-[#D6D6D6]'}`;

// Routine, expected outcome — not an alert. Neutral treatment, same
// reasoning as Audit Logs: color is reserved for genuine problems, not
// for confirming that something worked as intended.
function SuccessBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 flex items-center gap-2">
      <span className="text-gray-400">✓</span>
      {children}
    </div>
  );
}

// A real failure — this is the one state in this form actually worth
// flagging visually, so it keeps color, same as failed logins in Audit Logs.
function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      {children}
    </div>
  );
}

// Two normal states of a routine workflow, not two different "moods" —
// same neutral pill used everywhere else, differentiated by weight/border
// rather than color, since neither state is a problem.
function StatusBadge({ isUsed }: { isUsed: boolean }) {
  if (isUsed) {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
        Registered
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-500">
      Pending
    </span>
  );
}

export const AllowUserContent: React.FC = () => {
  const [form, setForm] = useState<AllowData>({ email: '', role: 'QUALITY' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState('');
  const [apiMessage, setApiMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [rows, setRows] = useState<AllowedUserRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;

  const loadRows = async () => {
    setRowsLoading(true);
    try {
      const data = await fetchAllowedUsers();
      setRows(data);
      setPage(1);
    } catch {
      // non-fatal — table just stays empty
    } finally {
      setRowsLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, []);

  const set = (field: keyof AllowData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(p => ({ ...p, [field]: e.target.value }));

  const handleSubmit = async () => {
    const r = AllowSchema.safeParse(form);
    if (!r.success) {
      const errs: FieldErrors = {};
      r.error.errors.forEach(e => { errs[String(e.path[0])] = e.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    setApiError('');
    setApiMessage('');
    setIsLoading(true);
    try {
      const res = await allowUser(form);
      setApiMessage(res.message || 'Email allowed successfully.');
      setForm({ email: '', role: 'QUALITY' });
      loadRows();
    } catch (err: any) {
      setApiError(err?.response?.data?.detail || 'Failed to allow this email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">

      <div>
        <h1 className="text-2xl font-bold text-gray-800">Allow User</h1>
        <p className="text-sm text-gray-500 mt-1">
          Pre-approve an employee's work email and assign their role. Only allow-listed
          emails can self-register — and they'll be registered with the role you set here.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
        {apiMessage && <SuccessBanner>{apiMessage}</SuccessBanner>}
        {apiError && <ErrorBanner>{apiError}</ErrorBanner>}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Work Email *" error={errors.email}>
            <input
              type="email" value={form.email} onChange={set('email')}
              placeholder="employee@mindteck.com"
              className={inputCls(errors.email)}
            />
          </Field>
          <Field label="Role *" error={errors.role}>
            <select value={form.role} onChange={set('role')} className={inputCls(errors.role)}>
              <option value="QUALITY">Quality</option>
              <option value="DELIVERY">Delivery</option>
              <option value="SALES">Sales</option>
              <option value="MANAGER">Manager</option>
              <option value="MANAGEMENT">Management</option>
            </select>
          </Field>
        </div>

        <div className="pt-5 flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            style={{ background: BRAND_GREEN }}
            className="px-6 py-2.5 text-sm font-semibold text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition"
          >
            {isLoading ? 'Allowing...' : 'Allow Email'}
          </button>
        </div>
      </div>

      {/* Allow-listed emails table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">Allow-listed Emails</h2>
          {rows.length > 0 && (
            <span className="text-xs text-gray-400">{rows.length} total</span>
          )}
        </div>
        {rowsLoading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-400">No emails allowed yet.</p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-400 border-b border-gray-100">
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(row => (
                  <tr key={row.Email} className="border-b border-gray-50">
                    <td className="py-2 pr-4 text-gray-700">{row.Email}</td>
                    <td className="py-2 pr-4 text-gray-700">{row.role}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge isUsed={row.is_used} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {rows.length > PAGE_SIZE && (
              <div className="flex items-center justify-between pt-4 mt-2 border-t border-gray-100 text-sm text-gray-500">
                <span>
                  Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, rows.length)} of {rows.length}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  <span>Page {page} of {Math.ceil(rows.length / PAGE_SIZE)}</span>
                  <button
                    disabled={page * PAGE_SIZE >= rows.length}
                    onClick={() => setPage(p => p + 1)}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};