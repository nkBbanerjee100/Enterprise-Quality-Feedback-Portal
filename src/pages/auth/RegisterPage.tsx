/**
 * Register User Page
 * Accessible only by Quality + Manager roles via the sidebar.
 * Renders inside the app layout (PageWrapper with sidebar).
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { api } from '../../api/client';
import { PageWrapper } from '../../components/layout/PageWrapper';

const ALLOWED_ROLES = ['QUALITY', 'DELIVERY', 'SALES', 'MANAGER'] as const;
type AllowedRole = typeof ALLOWED_ROLES[number];

const Step1Schema = z.object({
  EmpId:         z.string().min(1, 'Employee ID is required'),
  EmpFirstName:  z.string().min(1, 'First name is required'),
  EmpMiddleName: z.string().optional(),
  EmpLastName:   z.string().min(1, 'Last name is required'),
  Gender:        z.enum(['M', 'F', 'O'], { errorMap: () => ({ message: 'Select a gender' }) }),
  Email:         z.string().email('Enter a valid work email'),
  role:          z.enum(ALLOWED_ROLES, { errorMap: () => ({ message: 'Select a role' }) }),
});

const Step2Schema = z.object({
  password:        z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type Step1Data = z.infer<typeof Step1Schema>;
type Step2Data = z.infer<typeof Step2Schema>;
type FieldErrors = Record<string, string>;

const BRAND_GREEN = '#1A5C3A';

const registerUser = async (payload: any) => {
  const response = await api.post('/api/auth/register', payload);
  return response.data;
};

const getStrength = (pwd: string) => {
  if (!pwd) return { score: 0, label: '', color: '' };
  let score = 0;
  if (pwd.length >= 8)          score++;
  if (/[A-Z]/.test(pwd))        score++;
  if (/[0-9]/.test(pwd))        score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  const map = [
    { label: 'Weak',        color: '#E24B4A' },
    { label: 'Fair',        color: '#C9A84C' },
    { label: 'Strong',      color: '#2E8057' },
    { label: 'Very strong', color: '#145230' },
  ];
  return { score, ...map[Math.min(score - 1, 3)] };
};

// ── Reusable field components ─────────────────────────────────────────────────

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

// ── Step dot ──────────────────────────────────────────────────────────────────
const StepDot: React.FC<{ num: number; state: 'active' | 'done' | 'inactive' }> = ({ num, state }) => (
  <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
    state === 'active' ? 'bg-[#1A5C3A] text-white'
    : state === 'done' ? 'bg-[#D4EDDB] text-[#1A5C3A]'
    : 'border border-[#D6D6D6] bg-[#F8F8F8] text-[#909090]'
  }`}>
    {state === 'done' ? '✓' : num}
  </div>
);

// ── Main Component ────────────────────────────────────────────────────────────
export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  const [step1, setStep1] = useState<Step1Data>({
    EmpId: '', EmpFirstName: '', EmpMiddleName: '',
    EmpLastName: '', Gender: 'M', Email: '', role: 'QUALITY',
  });
  const [step2, setStep2] = useState<Step2Data>({ password: '', confirmPassword: '' });

  const strength = getStrength(step2.password);

  const s1 = (field: keyof Step1Data) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setStep1(p => ({ ...p, [field]: e.target.value }));

  const s2 = (field: keyof Step2Data) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setStep2(p => ({ ...p, [field]: e.target.value }));

  const handleStep1 = () => {
    const r = Step1Schema.safeParse(step1);
    if (!r.success) {
      const errs: FieldErrors = {};
      r.error.errors.forEach(e => { errs[String(e.path[0])] = e.message; });
      setErrors(errs); return;
    }
    setErrors({});
    setStep(2);
  };

  const handleStep2 = async () => {
    const r = Step2Schema.safeParse(step2);
    if (!r.success) {
      const errs: FieldErrors = {};
      r.error.errors.forEach(e => { errs[String(e.path[0])] = e.message; });
      setErrors(errs); return;
    }
    setErrors({});
    setIsLoading(true);
    setApiError('');
    try {
      await registerUser({
        emp_id: step1.EmpId, emp_first_name: step1.EmpFirstName,
        emp_middle_name: step1.EmpMiddleName, emp_last_name: step1.EmpLastName,
        gender: step1.Gender, email: step1.Email, role: step1.role,
        password: step2.password, confirm_password: step2.confirmPassword,
      });
      setStep(3);
    } catch (err: any) {
      setApiError(err?.response?.data?.detail || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const stepState = (n: number) =>
    step > n ? 'done' : step === n ? 'active' : 'inactive';

  return (
    <PageWrapper>
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Register New User</h1>
          <p className="text-sm text-gray-500 mt-1">
            Create a portal account for a Mindteck employee. They'll use these credentials to log in.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">

          {/* Step indicators */}
          <div className="flex items-center gap-2 mb-8">
            {[1, 2, 3].map((n, i) => (
              <React.Fragment key={n}>
                <div className="flex items-center gap-2">
                  <StepDot num={n} state={stepState(n) as any} />
                  <span className={`text-[12px] ${step === n ? 'font-semibold text-[#145230]' : 'text-gray-400'}`}>
                    {['Employee Details', 'Set Password', 'Done'][i]}
                  </span>
                </div>
                {i < 2 && <div className="h-px flex-1 bg-gray-200" />}
              </React.Fragment>
            ))}
          </div>

          {apiError && (
            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {apiError}
            </div>
          )}

          {/* ── STEP 1 ── */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Employee ID *" error={errors.EmpId}>
                  <input
                    value={step1.EmpId} onChange={s1('EmpId')}
                    placeholder="e.g. IKE297"
                    className={inputCls(errors.EmpId)}
                  />
                </Field>
                <Field label="Gender *" error={errors.Gender}>
                  <select value={step1.Gender} onChange={s1('Gender')} className={inputCls(errors.Gender)}>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                    <option value="O">Other</option>
                  </select>
                </Field>
                <Field label="First Name *" error={errors.EmpFirstName}>
                  <input
                    value={step1.EmpFirstName} onChange={s1('EmpFirstName')}
                    placeholder="First name"
                    className={inputCls(errors.EmpFirstName)}
                  />
                </Field>
                <Field label="Last Name *" error={errors.EmpLastName}>
                  <input
                    value={step1.EmpLastName} onChange={s1('EmpLastName')}
                    placeholder="Last name"
                    className={inputCls(errors.EmpLastName)}
                  />
                </Field>
              </div>

              <Field label="Middle Name">
                <input
                  value={step1.EmpMiddleName || ''} onChange={s1('EmpMiddleName')}
                  placeholder="Middle name (optional)"
                  className={inputCls()}
                />
              </Field>

              <Field label="Work Email *" error={errors.Email}>
                <input
                  type="email" value={step1.Email} onChange={s1('Email')}
                  placeholder="employee@mindteck.com"
                  className={inputCls(errors.Email)}
                />
              </Field>

              <Field label="Role *" error={errors.role}>
                <select value={step1.role} onChange={s1('role')} className={inputCls(errors.role)}>
                  <option value="QUALITY">Quality</option>
                  <option value="DELIVERY">Delivery</option>
                  <option value="SALES">Sales</option>
                  <option value="MANAGER">Manager</option>
                </select>
              </Field>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleStep1}
                  style={{ background: BRAND_GREEN }}
                  className="px-6 py-2.5 text-sm font-semibold text-white rounded-lg hover:opacity-90 transition"
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <div className="space-y-4">
              <Field label="Create Password *" error={errors.password}>
                <input
                  type="password" value={step2.password} onChange={s2('password')}
                  placeholder="Min. 8 characters"
                  className={inputCls(errors.password)}
                />
                {step2.password && (
                  <div className="mt-1.5 space-y-1">
                    <div className="h-1 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${(strength.score / 4) * 100}%`, backgroundColor: strength.color }}
                      />
                    </div>
                    <span className="text-xs font-medium" style={{ color: strength.color }}>
                      {strength.label}
                    </span>
                  </div>
                )}
                <span className="text-xs text-gray-400">
                  Use 8+ characters with uppercase, numbers & symbols
                </span>
              </Field>

              <Field label="Confirm Password *" error={errors.confirmPassword}>
                <input
                  type="password" value={step2.confirmPassword} onChange={s2('confirmPassword')}
                  placeholder="Re-enter password"
                  className={inputCls(errors.confirmPassword)}
                />
              </Field>

              <div className="pt-2 flex justify-between">
                <button
                  onClick={() => { setStep(1); setErrors({}); }}
                  className="px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  ← Back
                </button>
                <button
                  onClick={handleStep2}
                  disabled={isLoading}
                  style={{ background: BRAND_GREEN }}
                  className="px-6 py-2.5 text-sm font-semibold text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition"
                >
                  {isLoading ? 'Creating account...' : 'Create Account'}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3 — Success ── */}
          {step === 3 && (
            <div className="py-8 text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <span className="text-3xl text-green-700">✓</span>
              </div>
              <h2 className="mb-2 text-xl font-bold text-gray-800">User Registered!</h2>
              <p className="mb-2 text-sm text-gray-500">
                The account has been created successfully.
              </p>
              <p className="mb-8 text-sm text-gray-500">
                <span className="font-semibold text-gray-700">{step1.EmpFirstName} {step1.EmpLastName}</span> can now log in with{' '}
                <span className="font-semibold text-gray-700">{step1.Email}</span>.
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => {
                    setStep(1);
                    setStep1({ EmpId: '', EmpFirstName: '', EmpMiddleName: '', EmpLastName: '', Gender: 'M', Email: '', role: 'QUALITY' });
                    setStep2({ password: '', confirmPassword: '' });
                    setApiError('');
                  }}
                  className="px-5 py-2.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Register Another User
                </button>
                <button
                  onClick={() => navigate('/admin/users')}
                  style={{ background: BRAND_GREEN }}
                  className="px-5 py-2.5 text-sm font-semibold text-white rounded-lg hover:opacity-90"
                >
                  View All Users →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
};

export default RegisterPage;
