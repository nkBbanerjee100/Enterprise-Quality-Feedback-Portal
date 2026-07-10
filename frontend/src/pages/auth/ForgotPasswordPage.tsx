/**
 * Forgot Password — two steps:
 *   1. Enter work email -> backend emails a 6-digit OTP (if the account exists)
 *   2. Enter the OTP + new password -> account's password is reset
 *
 * Styled to match AllowUserContent.tsx's form conventions (same brand
 * green, same input treatment) rather than replicating LoginPage's full
 * two-panel marketing layout — this is a narrow, single-purpose flow.
 */
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../../api/auth.api';
import logo from '../../assets/mindteckLogo.png';

const BRAND_GREEN = '#1A5C3A';

const inputCls = (err?: string) =>
  `h-11 w-full rounded-[10px] border-[1.5px] px-3.5 text-sm text-[#1A1A1A] outline-none transition focus:border-[#1A5C3A] focus:shadow-[0_0_0_3px_rgba(26,92,58,0.12)] ${err ? 'border-red-400' : 'border-[#D6D6D6]'}`;

export const ForgotPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<'email' | 'reset' | 'done'>('email');

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError('Enter your work email.');
      return;
    }
    setIsLoading(true);
    try {
      const res = await authApi.forgotPassword(email.trim());
      // Backend deliberately returns the same generic message whether or
      // not the account exists (prevents email enumeration) — the form
      // always advances to step 2 either way.
      setInfo(res.message || 'If this email is registered, a verification code has been sent.');
      setStep('reset');
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Something went wrong. Please try again.');
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
      setInfo(res.message || 'A new code has been sent.');
      setOtp('');
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Could not resend the code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F7F5] px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src={logo} alt="Mindteck" className="mb-4 h-9" />
          <h1 className="text-xl font-bold text-gray-800">
            {step === 'email' && 'Forgot your password?'}
            {step === 'reset' && 'Check your email'}
            {step === 'done' && 'Password reset'}
          </h1>
          <p className="mt-1.5 text-sm text-gray-500">
            {step === 'email' && "Enter your work email and we'll send you a verification code."}
            {step === 'reset' && `Enter the 6-digit code we sent to ${email}, and choose a new password.`}
            {step === 'done' && 'Your password has been changed. You can now log in.'}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {info && step === 'reset' && (
          <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
            {info}
          </div>
        )}

        {step === 'email' && (
          <form onSubmit={handleRequestOtp} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-[#3D3D3D]">Work Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="employee@mindteck.com"
                className={inputCls()}
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              style={{ background: BRAND_GREEN }}
              className="h-11 w-full rounded-[10px] text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {isLoading ? 'Sending...' : 'Send verification code'}
            </button>
          </form>
        )}

        {step === 'reset' && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-[#3D3D3D]">Verification Code</label>
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
              <label className="mb-1.5 block text-[13px] font-medium text-[#3D3D3D]">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className={inputCls()}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-[#3D3D3D]">Confirm New Password</label>
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
              style={{ background: BRAND_GREEN }}
              className="h-11 w-full rounded-[10px] text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {isLoading ? 'Resetting...' : 'Reset password'}
            </button>
            <div className="flex justify-between text-[13px]">
              <button
                type="button"
                onClick={() => { setStep('email'); setOtp(''); setError(''); setInfo(''); }}
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
            style={{ background: BRAND_GREEN }}
            className="h-11 w-full rounded-[10px] text-sm font-semibold text-white transition hover:opacity-90"
          >
            Go to login
          </button>
        )}

        {step !== 'done' && (
          <p className="mt-6 text-center text-[13px] text-gray-500">
            Remembered your password?{' '}
            <Link to="/login" className="font-medium hover:underline" style={{ color: BRAND_GREEN }}>
              Back to login
            </Link>
          </p>
        )}
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
