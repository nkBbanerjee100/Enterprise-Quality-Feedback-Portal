/**
 * Forgot Password — two steps:
 *   1. Enter work email -> backend emails a 6-digit OTP (only if the
 *      account exists, is active, and is registered — otherwise the
 *      request is rejected with an explicit reason and the user stays
 *      on step 1)
 *   2. Enter the OTP + new password -> account's password is reset
 *
 * Layout mirrors LoginPage.tsx / SelfRegisterPage.tsx: sticky logo header,
 * dark-gradient illustration panel on the left (hidden on mobile), white
 * card on the right. Kept in the same visual family as the rest of the
 * auth flow rather than introducing a one-off style.
 */
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../../api/auth.api';
import logo from '../../assets/mindteckLogo.png';
import { ROUTES } from '../../utils/constants';

const BRAND_GREEN = '#1A5C3A';
const GOLD = '#E8CE83';

const inputCls = (err?: boolean, extraLeftPad?: boolean) =>
  `h-12 w-full rounded-[10px] border-[1.5px] ${extraLeftPad ? 'pl-11' : 'px-3.5'} pr-3.5 text-sm text-[#1A1A1A] outline-none transition focus:border-[#1A5C3A] focus:shadow-[0_0_0_3px_rgba(26,92,58,0.12)] ${
    err ? 'border-red-400 bg-red-50/40' : 'border-[#D6D6D6]'
  }`;

const Spinner: React.FC = () => (
  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
  </svg>
);

// Envelope-with-lock illustration for the left panel — built as inline SVG
// (no external asset) so it inherits the same gold/white palette as the
// rest of the dark panel and stays crisp at any size.
const EnvelopeIllustration: React.FC = () => (
  <svg viewBox="0 0 280 220" className="w-full max-w-[300px]" fill="none">
    <ellipse cx="140" cy="196" rx="90" ry="10" fill="black" opacity="0.15" />
    <path d="M35 70a10 10 0 0 1 10-10h170a10 10 0 0 1 10 10v100a10 10 0 0 1-10 10H45a10 10 0 0 1-10-10V70z"
      fill="white" opacity="0.06" stroke="white" strokeOpacity="0.35" strokeWidth="1.5" />
    <path d="M35 72l105 78 105-78" stroke="white" strokeOpacity="0.35" strokeWidth="1.5" fill="none" />
    <rect x="98" y="52" width="84" height="96" rx="8" fill="#0D3B26" stroke={GOLD} strokeOpacity="0.5" strokeWidth="1.5" />
    <line x1="114" y1="118" x2="166" y2="118" stroke="white" strokeOpacity="0.3" strokeWidth="3" strokeLinecap="round" />
    <line x1="114" y1="130" x2="150" y2="130" stroke="white" strokeOpacity="0.3" strokeWidth="3" strokeLinecap="round" />
    <circle cx="140" cy="88" r="22" fill="#C9A84C" fillOpacity="0.15" />
    <path d="M129 84v-6a11 11 0 0 1 22 0v6" stroke={GOLD} strokeWidth="3" strokeLinecap="round" fill="none" />
    <rect x="125" y="84" width="30" height="22" rx="4" fill={GOLD} />
    <circle cx="140" cy="93" r="3" fill="#0D3B26" />
    <circle cx="211" cy="96" r="17" fill="#1A5C3A" stroke={GOLD} strokeWidth="1.5" />
    <path d="M204 96l5 5 9-11" stroke={GOLD} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <circle cx="56" cy="48" r="2.5" fill="white" fillOpacity="0.4" />
    <circle cx="70" cy="36" r="2" fill="white" fillOpacity="0.3" />
    <circle cx="228" cy="150" r="2.5" fill="white" fillOpacity="0.35" />
    <circle cx="242" cy="164" r="2" fill="white" fillOpacity="0.25" />
  </svg>
);

const StepIllustration: React.FC<{ step: 'email' | 'reset' | 'done' }> = ({ step }) => {
  if (step === 'done') {
    return (
      <svg viewBox="0 0 280 220" className="w-full max-w-[280px]" fill="none">
        <ellipse cx="140" cy="196" rx="90" ry="10" fill="black" opacity="0.15" />
        <circle cx="140" cy="110" r="62" fill="white" fillOpacity="0.05" stroke={GOLD} strokeOpacity="0.4" strokeWidth="1.5" />
        <circle cx="140" cy="110" r="40" fill="#C9A84C" fillOpacity="0.15" />
        <path d="M118 110l16 16 30-32" stroke={GOLD} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="72" cy="64" r="2.5" fill="white" fillOpacity="0.4" />
        <circle cx="216" cy="150" r="2.5" fill="white" fillOpacity="0.35" />
      </svg>
    );
  }
  return <EnvelopeIllustration />;
};

export const ForgotPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<'email' | 'reset' | 'done'>('email');

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // emailError is scoped to the step-1 input (shown inline, under the
  // field) — separate from the generic `error` banner used on step 2, so
  // switching email mid-typing clears it immediately.
  const [emailError, setEmailError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError('');
    if (!email.trim()) {
      setEmailError('Enter your work email.');
      return;
    }
    setIsLoading(true);
    try {
      const res = await authApi.forgotPassword(email.trim());
      setSuccess(res.message || `A verification code has been sent to ${email.trim()}.`);
      setStep('reset');
    } catch (err: any) {
      // Backend tells us exactly why: unregistered email, deactivated
      // account, or incomplete registration. Surface it inline and keep
      // the user on step 1 rather than silently advancing.
      setEmailError(err?.response?.data?.detail || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!otp.trim() || otp.trim().length !== 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      await authApi.resetPassword({
        email: email.trim(),
        otp: otp.trim(),
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      setStep('done');
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Could not reset your password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setIsLoading(true);
    try {
      const res = await authApi.forgotPassword(email.trim());
      setSuccess(res.message || 'A new code has been sent.');
      setOtp('');
    } catch (err: any) {
      // If the account became invalid between step 1 and now (rare, but
      // possible — e.g. deactivated mid-flow), send the user back to step
      // 1 with the reason rather than stranding them on a resend that can
      // never succeed.
      const detail = err?.response?.data?.detail || 'Could not resend the code. Please try again.';
      setStep('email');
      setEmailError(detail);
    } finally {
      setIsLoading(false);
    }
  };

  const leftCopy = {
    email: {
      badge: 'Account Recovery',
      title: <>We've got <span className="text-[#E8CE83]">your back.</span></>,
      body: "Enter the work email tied to your account and we'll send a 6-digit verification code to confirm it's you.",
    },
    reset: {
      badge: 'Verification',
      title: <>Almost <span className="text-[#E8CE83]">there.</span></>,
      body: 'Enter the code from your inbox and choose a new password. The code expires in 10 minutes.',
    },
    done: {
      badge: 'Complete',
      title: <>You're all <span className="text-[#E8CE83]">set.</span></>,
      body: 'Your password has been updated. Sign in with your new password to get back to work.',
    },
  }[step];

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F8F8] text-[#1A1A1A]">
      {/* Top header — same treatment as Login/SelfRegister */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#ECECEC] bg-white/90 px-6 py-4 backdrop-blur-sm md:px-12">
        <Link to={ROUTES.HOME ?? '/'} style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
          <img src={logo} alt="Mindteck" className="h-14 w-auto md:h-16" />
          <span className="hidden h-8 w-px bg-[#D6D6D6] sm:block" />
          <span className="hidden text-sm font-semibold text-[#3D3D3D] sm:block sm:text-base">
            Quality Feedback Platform
          </span>
        </Link>

        <Link
          to="/login"
          className="rounded-[8px] border-[1.5px] border-[#1A5C3A] px-4 py-2 text-sm font-semibold text-[#1A5C3A] transition hover:bg-[#1A5C3A] hover:text-white"
        >
          Back to login
        </Link>
      </header>

      {/* Main content */}
      <div className="flex flex-1 flex-col md:flex-row">
        {/* Left panel */}
        <div className="relative hidden w-[46%] flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#0D3B26] via-[#145230] to-[#1A5C3A] p-12 md:flex">
          {/* Glow accents — matches LoginPage */}
          <div className="pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full bg-[#C9A84C]/15 blur-[110px]" />
          <div className="pointer-events-none absolute -left-24 bottom-0 h-[320px] w-[320px] rounded-full bg-white/[0.06] blur-[100px]" />
          <div className="pointer-events-none absolute -right-36 -top-32 h-[420px] w-[420px] rounded-full border border-white/[0.08]" />
          <div className="pointer-events-none absolute -left-20 bottom-16 h-[280px] w-[280px] rounded-full border border-white/[0.06]" />

          <div className="relative z-10 flex max-w-[380px] flex-col items-center text-center">
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#C9A84C]/30 bg-[#C9A84C]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[2px] text-[#E8CE83]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#E8CE83] shadow-[0_0_8px_2px_rgba(232,206,131,0.7)]" />
              {leftCopy.badge}
            </span>

            <div className="mb-8">
              <StepIllustration step={step} />
            </div>

            <h1 className="mb-3 text-[32px] font-bold leading-[1.2] text-white">{leftCopy.title}</h1>
            <p className="text-[15px] leading-relaxed text-white/65">{leftCopy.body}</p>

            <div className="mt-9 flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2" className="flex-shrink-0">
                <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" />
              </svg>
              <span className="text-[13px] text-white/70">Secure &middot; Private &middot; Mindteck</span>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="flex flex-1 items-center justify-center p-6 md:p-10">
          <div className="w-full max-w-[440px] rounded-2xl border border-[#ECECEC] bg-white p-8 shadow-[0_24px_60px_-15px_rgba(13,59,38,0.16)] md:p-10">
            <div className="mb-7">
              <div
                className="mb-4 flex h-11 w-11 items-center justify-center rounded-full md:hidden"
                style={{ background: step === 'done' ? '#E7F3EC' : 'rgba(26,92,58,0.08)' }}
              >
                {step === 'email' && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={BRAND_GREEN} strokeWidth="1.8">
                    <rect x="3" y="5" width="18" height="14" rx="2.5" />
                    <path d="M3.5 6.5l8.5 6 8.5-6" />
                  </svg>
                )}
                {step === 'reset' && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={BRAND_GREEN} strokeWidth="1.8">
                    <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
                    <path d="M8 10.5V7.5a4 4 0 018 0v3" />
                  </svg>
                )}
                {step === 'done' && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={BRAND_GREEN} strokeWidth="2">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                )}
              </div>
              <h2 className="mb-1.5 text-[26px] font-bold text-[#1A1A1A]">
                {step === 'email' && 'Forgot your password?'}
                {step === 'reset' && 'Check your email'}
                {step === 'done' && 'Password reset'}
              </h2>
              <p className="text-sm text-[#6B6B6B]">
                {step === 'email' && "Enter your work email and we'll send you a verification code."}
                {step === 'reset' && `Enter the 6-digit code we sent to ${email}, and choose a new password.`}
                {step === 'done' && 'Your password has been changed. You can now log in.'}
              </p>
            </div>

            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 flex-shrink-0">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v5M12 16h.01" />
                </svg>
                <span>{error}</span>
              </div>
            )}
            {success && step === 'reset' && (
              <div className="mb-4 flex items-start gap-2 rounded-md border border-[#1A5C3A]/20 bg-[#1A5C3A]/[0.06] p-3 text-sm text-[#1A5C3A]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 flex-shrink-0">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
                <span>{success}</span>
              </div>
            )}

            {step === 'email' && (
              <form onSubmit={handleRequestOtp} className="space-y-[18px]">
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-[#3D3D3D]">
                    Work email
                  </label>
                  <div className="relative">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#909090" strokeWidth="1.8"
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2">
                      <rect x="3" y="5" width="18" height="14" rx="2.5" />
                      <path d="M3.5 6.5l8.5 6 8.5-6" />
                    </svg>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={e => { setEmail(e.target.value); if (emailError) setEmailError(''); }}
                      placeholder="employee@mindteck.com"
                      className={inputCls(!!emailError, true)}
                      autoFocus
                    />
                  </div>
                  {emailError && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-red-600">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 8v5M12 16h.01" />
                      </svg>
                      {emailError}
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-gradient-to-r from-[#1A5C3A] to-[#145230] text-[15px] font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  {isLoading ? (
                    <Spinner />
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                    </svg>
                  )}
                  {isLoading ? 'Sending...' : 'Send verification code'}
                </button>

                <div className="flex items-center gap-3 text-[13px] text-[#909090]">
                  <div className="h-px flex-1 bg-[#D6D6D6]" />
                  or
                  <div className="h-px flex-1 bg-[#D6D6D6]" />
                </div>

                <Link
                  to="/login"
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-[10px] border-[1.5px] border-[#1A5C3A] text-sm font-semibold text-[#1A5C3A] transition hover:bg-[#1A5C3A]/[0.06]"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                  </svg>
                  Back to login
                </Link>
              </form>
            )}

            {step === 'reset' && (
              <form onSubmit={handleResetPassword} className="space-y-[18px]">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-[#3D3D3D]">Verification code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="6-digit code"
                    className={`${inputCls()} tracking-[6px] text-center font-semibold`}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-[#3D3D3D]">New password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className={inputCls()}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-[#3D3D3D]">Confirm new password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className={inputCls()}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-gradient-to-r from-[#1A5C3A] to-[#145230] text-[15px] font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  {isLoading && <Spinner />}
                  {isLoading ? 'Resetting...' : 'Reset password'}
                </button>
                <div className="flex justify-between text-[13px]">
                  <button
                    type="button"
                    onClick={() => { setStep('email'); setOtp(''); setError(''); setSuccess(''); }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ← Use a different email
                  </button>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={isLoading}
                    className="font-medium hover:underline disabled:opacity-50"
                    style={{ color: BRAND_GREEN }}
                  >
                    Resend code
                  </button>
                </div>
              </form>
            )}

            {step === 'done' && (
              <button
                onClick={() => navigate('/login')}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-gradient-to-r from-[#1A5C3A] to-[#145230] text-[15px] font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0"
              >
                Go to login
              </button>
            )}

            {step === 'reset' && (
              <p className="mt-6 text-center text-[13px] text-[#909090]">
                Remembered your password?{' '}
                <Link to="/login" className="font-medium hover:underline" style={{ color: BRAND_GREEN }}>
                  Back to login
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;