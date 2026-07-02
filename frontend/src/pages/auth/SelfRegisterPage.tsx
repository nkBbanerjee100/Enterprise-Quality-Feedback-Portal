/**
 * Self Register Page (public)
 *
 * For employees whose email was allow-listed by an admin via the
 * "Allow User" page (Email + Role only, no name). The employee fills
 * in the rest of their own details here — EmpId, name, gender, password.
 *
 * The backend re-checks the allow-list on submit: unauthorized emails
 * are rejected with 403, and the role actually stored is always the
 * one the admin set — never whatever might be sent from this form.
 */
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { authApi } from '../../api/auth.api';
import { ROUTES } from '../../utils/constants';
import logo from '../../assets/mindteckLogo.png';

const RegisterSchema = z.object({
  emp_id:           z.string().min(1, 'Employee ID is required'),
  emp_first_name:   z.string().min(1, 'First name is required'),
  emp_middle_name:  z.string().optional(),
  emp_last_name:    z.string().min(1, 'Last name is required'),
  gender:           z.enum(['M', 'F', 'OTHER'], { errorMap: () => ({ message: 'Select a gender' }) }),
  email:            z.string().email('Enter a valid work email'),
  password:         z.string().min(8, 'Password must be at least 8 characters'),
  confirm_password: z.string(),
}).refine((d) => d.password === d.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
});

type RegisterData = z.infer<typeof RegisterSchema>;
type FieldErrors = Record<string, string>;

const BRAND_GREEN = '#1A5C3A';

export const SelfRegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState<RegisterData>({
    emp_id: '', emp_first_name: '', emp_middle_name: '', emp_last_name: '',
    gender: 'M', email: '', password: '', confirm_password: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);

  const set = (field: keyof RegisterData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(p => ({ ...p, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = RegisterSchema.safeParse(form);
    if (!r.success) {
      const errs: FieldErrors = {};
      r.error.errors.forEach(err => { errs[String(err.path[0])] = err.message; });
      setErrors(errs);
      return;
    }
    setErrors({});
    setApiError('');
    setIsLoading(true);
    try {
      await authApi.register({
        emp_id: form.emp_id,
        emp_first_name: form.emp_first_name,
        emp_middle_name: form.emp_middle_name,
        emp_last_name: form.emp_last_name,
        gender: form.gender,
        email: form.email,
        role: '', // ignored by backend — role comes from the admin allow-list
        password: form.password,
        confirm_password: form.confirm_password,
      });
      setDone(true);
    } catch (err: any) {
      setApiError(err?.response?.data?.detail || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F8F8] text-[#1A1A1A]">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#ECECEC] bg-white/90 px-6 py-4 backdrop-blur-sm md:px-12">
        <Link to={ROUTES.HOME ?? '/'} style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
          <img src={logo} alt="Mindteck" className="h-16 w-auto md:h-20" />
          <span className="hidden h-8 w-px bg-[#D6D6D6] sm:block" />
          <span className="hidden text-sm font-semibold text-[#3D3D3D] sm:block sm:text-base">
            Quality Feedback Platform
          </span>
        </Link>
      </header>

      <div className="flex flex-1 items-center justify-center p-10">
        <div className="w-full max-w-[500px] rounded-2xl border border-[#ECECEC] bg-white p-10 shadow-[0_24px_60px_-15px_rgba(13,59,38,0.16)]">
          {!done ? (
            <>
              <div className="mb-7">
                <h2 className="mb-1.5 text-[24px] font-bold text-[#1A1A1A]">Register your account</h2>
                <p className="text-sm text-[#6B6B6B]">
                  Your work email must already be allow-listed by Quality/Management before you can register.
                </p>
              </div>

              {apiError && (
                <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                  {apiError}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-[#3D3D3D]">Work email</label>
                  <input
                    type="email" value={form.email} onChange={set('email')}
                    placeholder="you@mindteck.com"
                    className="h-[46px] w-full rounded-[10px] border-[1.5px] border-[#D6D6D6] px-3.5 text-sm outline-none focus:border-[#1A5C3A]"
                  />
                  {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
                </div>

                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-[#3D3D3D]">Employee ID</label>
                  <input
                    value={form.emp_id} onChange={set('emp_id')}
                    className="h-[46px] w-full rounded-[10px] border-[1.5px] border-[#D6D6D6] px-3.5 text-sm outline-none focus:border-[#1A5C3A]"
                  />
                  {errors.emp_id && <p className="mt-1 text-sm text-red-600">{errors.emp_id}</p>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-[#3D3D3D]">First name</label>
                    <input
                      value={form.emp_first_name} onChange={set('emp_first_name')}
                      className="h-[46px] w-full rounded-[10px] border-[1.5px] border-[#D6D6D6] px-3.5 text-sm outline-none focus:border-[#1A5C3A]"
                    />
                    {errors.emp_first_name && <p className="mt-1 text-sm text-red-600">{errors.emp_first_name}</p>}
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[13px] font-medium text-[#3D3D3D]">Last name</label>
                    <input
                      value={form.emp_last_name} onChange={set('emp_last_name')}
                      className="h-[46px] w-full rounded-[10px] border-[1.5px] border-[#D6D6D6] px-3.5 text-sm outline-none focus:border-[#1A5C3A]"
                    />
                    {errors.emp_last_name && <p className="mt-1 text-sm text-red-600">{errors.emp_last_name}</p>}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-[#3D3D3D]">Gender</label>
                  <select
                    value={form.gender} onChange={set('gender')}
                    className="h-[46px] w-full rounded-[10px] border-[1.5px] border-[#D6D6D6] px-3.5 text-sm outline-none focus:border-[#1A5C3A]"
                  >
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-[#3D3D3D]">Create password</label>
                  <input
                    type="password" value={form.password} onChange={set('password')}
                    placeholder="Min. 8 characters"
                    className="h-[46px] w-full rounded-[10px] border-[1.5px] border-[#D6D6D6] px-3.5 text-sm outline-none focus:border-[#1A5C3A]"
                  />
                  {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password}</p>}
                </div>

                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-[#3D3D3D]">Confirm password</label>
                  <input
                    type="password" value={form.confirm_password} onChange={set('confirm_password')}
                    placeholder="Re-enter password"
                    className="h-[46px] w-full rounded-[10px] border-[1.5px] border-[#D6D6D6] px-3.5 text-sm outline-none focus:border-[#1A5C3A]"
                  />
                  {errors.confirm_password && <p className="mt-1 text-sm text-red-600">{errors.confirm_password}</p>}
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  style={{ background: BRAND_GREEN }}
                  className="h-12 w-full rounded-[10px] text-[15px] font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 disabled:opacity-50"
                >
                  {isLoading ? 'Registering...' : 'Create account'}
                </button>
              </form>

              <p className="mt-6 text-center text-xs text-[#909090]">
                Already have an account?{' '}
                <Link to="/login" className="font-medium text-[#1A5C3A] hover:underline">
                  Sign in instead
                </Link>
              </p>
            </>
          ) : (
            <div className="py-6 text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <span className="text-3xl text-green-700">✓</span>
              </div>
              <h2 className="mb-2 text-xl font-bold text-gray-800">Registration successful!</h2>
              <p className="mb-8 text-sm text-gray-500">
                You can now sign in with <span className="font-semibold text-gray-700">{form.email}</span> and
                the password you just set.
              </p>
              <button
                onClick={() => navigate('/login')}
                style={{ background: BRAND_GREEN }}
                className="px-6 py-2.5 text-sm font-semibold text-white rounded-lg hover:opacity-90"
              >
                Go to login →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SelfRegisterPage;