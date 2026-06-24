/**
 * Registration Page
 * Route: /register (public)
 * Flow: Employee Details → Password Setup → Success
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { api } from '../../api/client';
import logo from '../../assets/mindteckLogo.png';

// ─────────────────────────────────────────────
// Zod Schemas
// ─────────────────────────────────────────────
const ALLOWED_ROLES = ['QUALITY', 'DELIVERY', 'SALES' , 'MANAGER'] as const;
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
  terms:           z.literal(true, { errorMap: () => ({ message: 'You must accept the terms' }) }),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type Step1Data = z.infer<typeof Step1Schema>;
type Step2Data = z.infer<typeof Step2Schema>;
type FieldErrors = Record<string, string>;

// ─────────────────────────────────────────────
// API call
// ─────────────────────────────────────────────
interface RegisterPayload {
  emp_id:          string;
  emp_first_name:  string;
  emp_middle_name?: string;
  emp_last_name:   string;
  gender:          string;
  email:           string;
  role:            string;
  password:        string;
  confirm_password: string;
}

const registerUser = async (payload: RegisterPayload) => {
  const response = await api.post('/api/auth/register', payload);
  return response.data;
};

// ─────────────────────────────────────────────
// Password strength helper
// ─────────────────────────────────────────────
const getStrength = (pwd: string): { score: number; label: string; color: string } => {
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

// ─────────────────────────────────────────────
// Sub-components — defined OUTSIDE the main
// component so they don't remount on each render
// (fixes the cursor/focus-loss bug)
// ─────────────────────────────────────────────
interface InputFieldProps {
  id: string;
  label: string;
  type?: string;
  icon: string;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  hint?: string;
}

const InputField: React.FC<InputFieldProps> = ({
  id, label, type = 'text', icon, placeholder, value, onChange, error, hint,
}) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={id} className="text-[13px] font-medium text-[#3D3D3D]">{label}</label>
    <div className="relative">
      <span className={`ti ${icon} pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-[#909090]`} aria-hidden="true" />
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`h-11 w-full rounded-[10px] border-[1.5px] pl-10 pr-3.5 text-sm text-[#1A1A1A] outline-none transition focus:border-[#1A5C3A] focus:shadow-[0_0_0_3px_rgba(26,92,58,0.12)] ${
          error ? 'border-red-400' : 'border-[#D6D6D6]'
        }`}
      />
    </div>
    {hint && <span className="text-xs text-[#909090]">{hint}</span>}
    {error && <span className="text-xs text-red-600">{error}</span>}
  </div>
);

interface SelectFieldProps {
  id: string;
  label: string;
  icon: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  error?: string;
  children: React.ReactNode;
}

const SelectField: React.FC<SelectFieldProps> = ({ id, label, icon, value, onChange, error, children }) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={id} className="text-[13px] font-medium text-[#3D3D3D]">{label}</label>
    <div className="relative">
      <span className={`ti ${icon} pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-[#909090]`} aria-hidden="true" />
      <select
        id={id}
        value={value}
        onChange={onChange}
        className={`h-11 w-full cursor-pointer appearance-none rounded-[10px] border-[1.5px] bg-white pl-10 pr-9 text-sm text-[#1A1A1A] outline-none transition focus:border-[#1A5C3A] focus:shadow-[0_0_0_3px_rgba(26,92,58,0.12)] ${
          error ? 'border-red-400' : 'border-[#D6D6D6]'
        }`}
      >
        {children}
      </select>
      <svg className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#909090]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
    {error && <span className="text-xs text-red-600">{error}</span>}
  </div>
);

interface StepDotProps {
  num: number;
  state: 'active' | 'done' | 'inactive';
}

const StepDot: React.FC<StepDotProps> = ({ num, state }) => (
  <div
    className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
      state === 'active'
        ? 'bg-[#1A5C3A] text-white'
        : state === 'done'
        ? 'bg-[#D4EDDB] text-[#1A5C3A]'
        : 'border border-[#D6D6D6] bg-[#F8F8F8] text-[#909090]'
    }`}
  >
    {state === 'done' ? <span className="ti ti-check text-xs" aria-hidden="true" /> : num}
  </div>
);

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────
export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [isLoading,   setIsLoading]   = useState(false);
  const [apiError,    setApiError]    = useState('');
  const [errors,      setErrors]      = useState<FieldErrors>({});

  const [step1, setStep1] = useState<Step1Data>({
    EmpId:         '',
    EmpFirstName:  '',
    EmpMiddleName: '',
    EmpLastName:   '',
    Gender:        'M',
    Email:         '',
    role:          'QUALITY',
  });

  const [step2, setStep2] = useState<Step2Data>({
    password:        '',
    confirmPassword: '',
    terms:           true,
  });

  const strength = getStrength(step2.password);

  // ── Step 1 submit ──────────────────────────
  const handleStep1 = () => {
    const result = Step1Schema.safeParse(step1);
    if (!result.success) {
      const errs: FieldErrors = {};
      result.error.errors.forEach((e) => { errs[e.path[0]] = e.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    setCurrentStep(2);
  };

  // ── Step 2 submit ──────────────────────────
  const handleStep2 = async () => {
    const result = Step2Schema.safeParse(step2);
    if (!result.success) {
      const errs: FieldErrors = {};
      result.error.errors.forEach((e) => { errs[e.path[0]] = e.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    setIsLoading(true);
    setApiError('');

    try {
      await registerUser({
        emp_id:           step1.EmpId,
        emp_first_name:   step1.EmpFirstName,
        emp_middle_name:  step1.EmpMiddleName,
        emp_last_name:    step1.EmpLastName,
        gender:           step1.Gender,
        email:            step1.Email,
        role:             step1.role,
        password:         step2.password,
        confirm_password: step2.confirmPassword,
      });
      setCurrentStep(3);
    } catch (err: any) {
      setApiError(
        err?.response?.data?.detail ||
        'Registration failed. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  // ── Handlers ──────────────────────────────
  const s1Input = (field: keyof Step1Data) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setStep1((p) => ({ ...p, [field]: e.target.value }));

  const s1Select = (field: keyof Step1Data) =>
    (e: React.ChangeEvent<HTMLSelectElement>) =>
      setStep1((p) => ({ ...p, [field]: e.target.value }));

  const s2 = (field: keyof Step2Data) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setStep2((p) => ({ ...p, [field]: field === 'terms' ? (e.target as HTMLInputElement).checked : e.target.value }));

  const stepState = (n: number) =>
    currentStep > n ? 'done' : currentStep === n ? 'active' : 'inactive';

  const Logo: React.FC = () => (
    <img src={logo} alt="Mindteck" className="h-16 w-auto md:h-20" />
  );

  const features = [
    'Automated survey delivery to customers',
    'Real-time CSAT dashboard & KPIs',
    'Action plan tracking for red-flag projects',
    'Role-based access for your entire team',
    'Exportable reports & audit logs',
  ];

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen flex-col bg-[#F8F8F8] text-[#1A1A1A]">
      {/* Top header */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#ECECEC] bg-white/90 px-6 py-4 backdrop-blur-sm md:px-12">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="hidden h-8 w-px bg-[#D6D6D6] sm:block" />
          <span className="hidden text-sm font-semibold text-[#3D3D3D] sm:block sm:text-base">
            Quality Feedback Platform
          </span>
        </div>
        <a
          href="https://www.mindteck.com/"
          className="rounded-full border border-[#D6D6D6] px-5 py-2 text-sm font-medium text-[#1A1A1A] shadow-sm transition hover:-translate-y-0.5 hover:border-[#909090] hover:shadow-md"
        >
          Visit Mindteck
        </a>
      </header>

      {/* Main content */}
      <div className="flex flex-1 flex-col md:flex-row">
        {/* Left panel */}
        <div className="relative hidden w-[48%] flex-col justify-between overflow-hidden bg-gradient-to-br from-[#0D3B26] via-[#145230] to-[#1A5C3A] p-12 md:flex">
          {/* Glow accents */}
          <div className="pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full bg-[#C9A84C]/15 blur-[110px]" />
          <div className="pointer-events-none absolute -left-24 bottom-0 h-[320px] w-[320px] rounded-full bg-white/[0.06] blur-[100px]" />

          {/* Fine ring texture */}
          <div className="pointer-events-none absolute -right-36 -top-32 h-[420px] w-[420px] rounded-full border border-white/[0.08]" />
          <div className="pointer-events-none absolute -left-20 bottom-16 h-[280px] w-[280px] rounded-full border border-white/[0.06]" />
          <div className="pointer-events-none absolute -right-48 -bottom-48 h-[600px] w-[600px] rounded-full border border-white/[0.05]" />

          <div className="relative z-10">
            <h1 className="mb-4 text-[34px] font-bold leading-[1.2] text-white">
              Measure what matters.
              <br />
              Act on every <span className="text-[#E8CE83]">score</span>.
            </h1>
            <p className="max-w-[360px] text-[15px] leading-relaxed text-white/65">
              The enterprise feedback platform built for quality-driven teams.
            </p>

            <ul className="mt-8 space-y-3">
              {features.map((txt) => (
                <li key={txt} className="flex items-start gap-2.5 text-sm text-white/75">
                  <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#E8CE83]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  {txt}
                </li>
              ))}
            </ul>
          </div>

          <p className="relative z-10 text-xs text-white/40">© 2026 CSAT Tool · Quality Delivery</p>
        </div>

        {/* Right panel */}
        <div className="flex flex-1 items-center justify-center p-10">
          <div className="w-full max-w-[480px] rounded-2xl border border-[#ECECEC] bg-white p-10 shadow-[0_24px_60px_-15px_rgba(13,59,38,0.16)]">
            {/* Badge */}
            <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-[#EAF4EE] px-3 py-1 text-[11px] font-semibold text-[#145230]">
              <span className="ti ti-shield-check text-xs" aria-hidden="true" />
              Employee registration
            </div>

            {/* Header */}
            <h2 className="mb-1.5 text-[26px] font-bold text-[#1A1A1A]">Create your account</h2>
            <p className="mb-6 text-sm text-[#6B6B6B]">Register with your employee details to get started</p>

            {/* Step indicators */}
            <div className="mb-7 flex items-center gap-1.5">
              {[1, 2, 3].map((n, i) => (
                <React.Fragment key={n}>
                  <div className="flex items-center gap-1.5">
                    <StepDot num={n} state={stepState(n) as any} />
                    <span
                      className={`text-[11px] ${
                        currentStep === n ? 'font-medium text-[#145230]' : 'text-[#909090]'
                      }`}
                    >
                      {['Details', 'Security', 'Done'][i]}
                    </span>
                  </div>
                  {i < 2 && <div className="h-px flex-1 bg-[#D6D6D6]" />}
                </React.Fragment>
              ))}
            </div>

            {/* API error */}
            {apiError && (
              <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                {apiError}
              </div>
            )}

            {/* ── STEP 1 ── */}
            {currentStep === 1 && (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <InputField
                    id="empid" label="Employee ID *" icon="ti-id-badge"
                    placeholder="e.g. EMP10042" value={step1.EmpId}
                    onChange={s1Input('EmpId')} error={errors.EmpId}
                  />
                  <SelectField
                    id="gender" label="Gender *" icon="ti-user"
                    value={step1.Gender} onChange={s1Select('Gender')} error={errors.Gender}
                  >
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                    <option value="O">Other</option>
                  </SelectField>
                  <InputField
                    id="fname" label="First name *" icon="ti-user"
                    placeholder="First name" value={step1.EmpFirstName}
                    onChange={s1Input('EmpFirstName')} error={errors.EmpFirstName}
                  />
                  <InputField
                    id="lname" label="Last name *" icon="ti-user"
                    placeholder="Last name" value={step1.EmpLastName}
                    onChange={s1Input('EmpLastName')} error={errors.EmpLastName}
                  />
                </div>

                <InputField
                  id="mname" label="Middle name" icon="ti-user"
                  placeholder="Middle name (optional)" value={step1.EmpMiddleName || ''}
                  onChange={s1Input('EmpMiddleName')}
                />

                <InputField
                  id="email" label="Work email *" icon="ti-mail"
                  placeholder="you@company.com" value={step1.Email}
                  onChange={s1Input('Email')} error={errors.Email}
                />

                <SelectField
                  id="role" label="Role *" icon="ti-briefcase"
                  value={step1.role} onChange={s1Select('role')} error={errors.role}
                >
                  <option value="QUALITY">Quality</option>
                  <option value="DELIVERY">Delivery</option>
                  <option value="SALES">Sales</option>
                  <option value="MANAGER">Manager</option>
                </SelectField>

                <button
                  onClick={handleStep1}
                  className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-gradient-to-r from-[#1A5C3A] to-[#145230] text-[15px] font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0"
                >
                  Continue <span className="ti ti-arrow-right" aria-hidden="true" />
                </button>
              </div>
            )}

            {/* ── STEP 2 ── */}
            {currentStep === 2 && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="pwd" className="text-[13px] font-medium text-[#3D3D3D]">Create password *</label>
                  <div className="relative">
                    <span className="ti ti-lock pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-[#909090]" aria-hidden="true" />
                    <input
                      id="pwd" type="password" placeholder="Min. 8 characters"
                      value={step2.password}
                      onChange={s2('password')}
                      className={`h-11 w-full rounded-[10px] border-[1.5px] pl-10 pr-3.5 text-sm text-[#1A1A1A] outline-none transition focus:border-[#1A5C3A] focus:shadow-[0_0_0_3px_rgba(26,92,58,0.12)] ${
                        errors.password ? 'border-red-400' : 'border-[#D6D6D6]'
                      }`}
                    />
                  </div>
                  {step2.password && (
                    <>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#EDEDED]">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${(strength.score / 4) * 100}%`, backgroundColor: strength.color }}
                        />
                      </div>
                      <span className="mt-0.5 text-xs font-medium" style={{ color: strength.color }}>
                        {strength.label}
                      </span>
                    </>
                  )}
                  {errors.password && <span className="text-xs text-red-600">{errors.password}</span>}
                  <span className="text-xs text-[#909090]">
                    Use 8+ characters with uppercase, numbers & symbols for a strong password
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="cpwd" className="text-[13px] font-medium text-[#3D3D3D]">Confirm password *</label>
                  <div className="relative">
                    <span className="ti ti-lock-check pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-[#909090]" aria-hidden="true" />
                    <input
                      id="cpwd" type="password" placeholder="Re-enter password"
                      value={step2.confirmPassword}
                      onChange={s2('confirmPassword')}
                      className={`h-11 w-full rounded-[10px] border-[1.5px] pl-10 pr-3.5 text-sm text-[#1A1A1A] outline-none transition focus:border-[#1A5C3A] focus:shadow-[0_0_0_3px_rgba(26,92,58,0.12)] ${
                        errors.confirmPassword ? 'border-red-400' : 'border-[#D6D6D6]'
                      }`}
                    />
                  </div>
                  {errors.confirmPassword && <span className="text-xs text-red-600">{errors.confirmPassword}</span>}
                </div>

                <div className="mt-1 flex items-start gap-2">
                  <input
                    type="checkbox" id="terms"
                    checked={step2.terms}
                    onChange={s2('terms')}
                    className="mt-0.5 h-3.5 w-3.5 accent-[#1A5C3A]"
                  />
                  <label htmlFor="terms" className="cursor-pointer text-xs leading-relaxed text-[#6B6B6B]">
                    I agree to the{' '}
                    <a href="#" className="font-medium text-[#1A5C3A] hover:underline">Terms of Use</a>{' '}
                    and{' '}
                    <a href="#" className="font-medium text-[#1A5C3A] hover:underline">Privacy Policy</a>
                  </label>
                </div>
                {errors.terms && <span className="text-xs text-red-600">{errors.terms}</span>}

                <button
                  onClick={handleStep2}
                  disabled={isLoading}
                  className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-gradient-to-r from-[#1A5C3A] to-[#145230] text-[15px] font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 disabled:opacity-50"
                >
                  {isLoading ? 'Creating account...' : (
                    <>Create account <span className="ti ti-check" aria-hidden="true" /></>
                  )}
                </button>

                <button
                  onClick={() => { setCurrentStep(1); setErrors({}); }}
                  className="w-full py-1 text-center text-sm font-medium text-[#1A5C3A] hover:underline"
                >
                  ← Back to details
                </button>
              </div>
            )}

            {/* ── STEP 3 — Success ── */}
            {currentStep === 3 && (
              <div className="py-6 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#D4EDDB]">
                  <span className="ti ti-check text-2xl text-[#1A5C3A]" aria-hidden="true" />
                </div>
                <h2 className="mb-2 text-xl font-semibold text-[#1A1A1A]">You're registered!</h2>
                <p className="mb-6 text-sm text-[#6B6B6B]">
                  Your account has been created successfully.
                  <br />
                  You can now log in to the CSAT Tool.
                </p>
                <button
                  onClick={() => navigate('/login')}
                  className="mx-auto flex h-12 w-full max-w-[260px] items-center justify-center gap-2 rounded-[10px] bg-gradient-to-r from-[#1A5C3A] to-[#145230] text-[15px] font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0"
                >
                  Go to login <span className="ti ti-arrow-right" aria-hidden="true" />
                </button>
              </div>
            )}

            {/* Login link */}
            {currentStep !== 3 && (
              <p className="mt-5 text-center text-sm text-[#6B6B6B]">
                Already have an account?{' '}
                <a href="/login" className="font-medium text-[#1A5C3A] hover:underline">Sign in</a>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;