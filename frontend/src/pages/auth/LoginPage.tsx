/**
 * Login Page
 */
import {Link} from 'react-router-dom';
import {ROUTES} from '../../utils/constants';
import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAuthStore } from '../../store/auth.store';
import { LoginFormData, LoginSchema } from '../../utils/validators';
import { UserRole } from '../../types/auth.types';
import logo from '../../assets/mindteckLogo.png';

// Per doc §5.1 / ROLE_REDIRECT in useAuth — keep in sync
const ROLE_HOME: Record<string, string> = {
  [UserRole.QUALITY]:           '/dashboard',
  [UserRole.DELIVERY]:            '/dashboard',
  [UserRole.MANAGER]:            '/dashboard',
  [UserRole.MANAGEMENT]:            '/dashboard',
  [UserRole.SALES]:         '/reports',
  [UserRole.CUSTOMER]:                '/unauthorized',
};

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, isLoading } = useAuth();
  // const { isAuthenticated, user } = useAuthStore();


  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [stayConnected, setStayConnected] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoginError(null);
  setErrors({});  // or setErrors({}) — whatever your variable is called
  try {
    
    LoginSchema.parse(formData);
  } catch (error: any) {
    const errs: Record<string, string> = {};
    error.errors?.forEach((err: any) => { errs[err.path[0]] = err.message; });
    setErrors(errs);  // same variable name as yours
    return;
  }
  try {
    await login(formData);
  } catch (error: any) {
    const detail =
      error?.response?.data?.detail ??
      error?.message ??
      'Login failed. Please check your credentials.';
    setLoginError(detail);
  }
};

  const Logo: React.FC = () => (
    <img src={logo} alt="Mindteck" className="h-16 w-auto md:h-20" />
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F8F8] text-[#1A1A1A]">
      {/* Top header */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#ECECEC] bg-white/90 px-6 py-4 backdrop-blur-sm md:px-12">
        <div className="flex items-center gap-3">
          <Link to={ROUTES.HOME ?? '/'} style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
          <Logo />
          
          <span className="hidden h-8 w-px bg-[#D6D6D6] sm:block" />
          <span className="hidden text-sm font-semibold text-[#3D3D3D] sm:block sm:text-base">
            Quality Feedback Platform
          </span>
          </Link>
        </div>

        <Link
          to="/register-self"
          className="rounded-[8px] border-[1.5px] border-[#1A5C3A] px-4 py-2 text-sm font-semibold text-[#1A5C3A] transition hover:bg-[#1A5C3A] hover:text-white"
        >
          Sign up
        </Link>
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
            <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#C9A84C]/30 bg-[#C9A84C]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[2px] text-[#E8CE83]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#E8CE83] shadow-[0_0_8px_2px_rgba(232,206,131,0.7)]" />
              Enterprise Platform
            </span>
            <h1 className="mb-5 text-[40px] font-bold leading-[1.15] text-white">
              Insights that drive <span className="text-[#E8CE83]">quality</span> outcomes.
            </h1>
            <p className="max-w-[380px] text-[15px] leading-relaxed text-white/65">
              Collect customer feedback, monitor response rates, track quality trends, and
              generate actionable insights through a centralized enterprise platform.
            </p>

            <ul className="mt-7 space-y-3">
              <li className="flex items-start gap-2.5 text-sm text-white/75">
                <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#E8CE83]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                Secure, tokenized feedback links with expiry and access control
              </li>
              <li className="flex items-start gap-2.5 text-sm text-white/75">
                <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#E8CE83]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                Completed projects synced automatically from TMS — no manual entry
              </li>
              <li className="flex items-start gap-2.5 text-sm text-white/75">
                <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#E8CE83]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                Role-based access for Quality Admins, Quality Users, Management, and Customers
              </li>
            </ul>
          </div>

          <div className="relative z-10 flex gap-9">
            <div className="border-l-2 border-[#C9A84C] pl-4">
              <div className="flex items-center gap-1.5 text-2xl font-bold text-white">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E8CE83" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" />
                </svg>
                TMS Integrated
              </div>
              <div className="mt-0.5 text-xs text-white/50">Sync completed projects automatically</div>
            </div>
            <div className="border-l-2 border-[#C9A84C] pl-4">
              <div className="flex items-center gap-1.5 text-2xl font-bold text-white">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E8CE83" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="11" width="16" height="9" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
                Secure Feedback Workflow
              </div>
              <div className="mt-0.5 text-xs text-white/50">Track Sent → Opened → Submitted</div>
            </div>
            <div className="border-l-2 border-[#C9A84C] pl-4">
              <div className="flex items-center gap-1.5 text-2xl font-bold text-white">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#E8CE83" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
                </svg>
                Analytics & Reporting
              </div>
              <div className="mt-0.5 text-xs text-white/50">KPIs, trends and customer insights</div>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="flex flex-1 items-center justify-center p-10">
          <div className="w-full max-w-[440px] rounded-2xl border border-[#ECECEC] bg-white p-10 shadow-[0_24px_60px_-15px_rgba(13,59,38,0.16)]">
            <div className="mb-9">
              <h2 className="mb-1.5 text-[26px] font-bold text-[#1A1A1A]">Welcome back</h2>
<p className="text-sm text-[#6B6B6B]">Sign in with your Mindteck credentials.</p>
            </div>

            {loginError && (
  <div className="mb-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
    {loginError}
  </div>
)}

            <form onSubmit={handleSubmit} className="space-y-[18px]">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-[#3D3D3D]">
                  Work email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="you@company.com"
                  className="h-[46px] w-full rounded-[10px] border-[1.5px] border-[#D6D6D6] px-3.5 text-sm text-[#1A1A1A] outline-none transition focus:border-[#1A5C3A] focus:shadow-[0_0_0_3px_rgba(26,92,58,0.12)]"
                />
                {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
              </div>

              <div>
                <label htmlFor="password" className="mb-1.5 block text-[13px] font-medium text-[#3D3D3D]">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Enter your password"
                    className="h-[46px] w-full rounded-[10px] border-[1.5px] border-[#D6D6D6] px-3.5 pr-11 text-sm text-[#1A1A1A] outline-none transition focus:border-[#1A5C3A] focus:shadow-[0_0_0_3px_rgba(26,92,58,0.12)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label="Toggle password visibility"
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#909090] hover:text-[#3D3D3D]"
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
                {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password}</p>}
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-[13px] text-[#3D3D3D]">
                  <input
                    type="checkbox"
                    checked={stayConnected}
                    onChange={(e) => setStayConnected(e.target.checked)}
                    className="h-4 w-4 accent-[#1A5C3A]"
                  />
                  Stay signed in
                </label>
                <a href="/forgot-password" className="text-[13px] font-medium text-[#1A5C3A] hover:underline">
                  Forgot password?
                </a>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="h-12 w-full rounded-[10px] bg-gradient-to-r from-[#1A5C3A] to-[#145230] text-[15px] font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 disabled:opacity-50"
              >
                {isLoading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            <div className="my-6 flex items-center gap-3 text-[13px] text-[#909090]">
              <div className="h-px flex-1 bg-[#D6D6D6]" />
              or
              <div className="h-px flex-1 bg-[#D6D6D6]" />
            </div>

           

            <p className="mt-2 text-center text-sm text-[#3D3D3D]">
              Email allow-listed by Quality/Management?{' '}
              <Link to="/register-self" className="font-medium text-[#1A5C3A] hover:underline">
                Register here
              </Link>
            </p>

            <p className="mt-3 text-center text-xs leading-relaxed text-[#909090]">
              By signing in, you agree to Mindteck's{' '}
              <a href="/terms" className="text-[#6B6B6B] underline">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href="/privacy" className="text-[#6B6B6B] underline">
                Privacy Policy
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};