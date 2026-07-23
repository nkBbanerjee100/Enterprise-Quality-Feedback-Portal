import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sendOtp, verifyOtp } from '../../api/feedback.api';

type Phase = 'email' | 'otp';

const STATUS_TEXT = {
  sending: 'Sending OTP...',
  verifying: 'Verifying OTP...',
  send: 'Send OTP',
  resend: 'Resend OTP',
  verify: 'Verify OTP',
} as const;

function getErrorMessage(status?: number) {
  switch (status) {
    case 400:
      return 'Invalid OTP.';
    case 403:
      return 'Unauthorized email.';
    case 404:
      return 'Please request an OTP first.';
    case 409:
      return 'OTP already used.';
    case 410:
      return 'Expired OTP.';
    case 429:
      return 'Please wait 60 seconds before requesting another OTP.';
    default:
      return 'Network error. Please try again.';
  }
}

export const SurveyAccessPage = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [phase, setPhase] = useState<Phase>('email');
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  useEffect(() => {
    if (cooldownSeconds <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setCooldownSeconds((value) => Math.max(value - 1, 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [cooldownSeconds]);

  const normalizedEmail = email.trim().toLowerCase();
  const canRequestOtp = normalizedEmail.length > 0 && normalizedEmail.includes('@');
  const canVerifyOtp = phase === 'otp' && otp.trim().length === 6;

  const handleSendOtp = async () => {
    if (!canRequestOtp || sending) {
      return;
    }

    setSending(true);
    setError('');
    setInfo('');

    try {
      await sendOtp({ email: normalizedEmail });
      setPhase('otp');
      setOtp('');
      setInfo('OTP sent successfully. Please check your inbox.');
      setCooldownSeconds(60);
    } catch (err: any) {
      setInfo('');
      setError(getErrorMessage(err?.response?.status));
    } finally {
      setSending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!canVerifyOtp || verifying) {
      return;
    }

    setVerifying(true);
    setError('');
    setInfo('');

    try {
      const result = await verifyOtp({
        email: normalizedEmail,
        otp: otp.trim(),
      });

      if (result.verified) {
        navigate(`/survey?email=${encodeURIComponent(normalizedEmail)}`, { replace: true });
        return;
      }

      setError('Invalid OTP.');
    } catch (err: any) {
      setError(getErrorMessage(err?.response?.status));
    } finally {
      setVerifying(false);
    }
  };

  const sendButtonLabel = phase === 'otp' ? STATUS_TEXT.resend : STATUS_TEXT.send;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-green-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
        <div className="mb-6 flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
        </div>

        <h2 className="mb-2 text-center text-2xl font-semibold text-slate-800">
          Customer Authentication
        </h2>
        <p className="mb-6 text-center text-sm text-slate-500">
          Enter your email to receive a verification code, then confirm it to open the survey.
        </p>

        <label className="mb-2 block text-sm font-medium text-slate-700">
          Email
        </label>
        <input
          type="email"
          className="mb-4 w-full rounded-lg border border-slate-300 p-3 text-sm outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
          value={email}
          placeholder="customer@email.com"
          onChange={(e) => setEmail(e.target.value)}
        />

        {phase === 'otp' && (
          <>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              OTP
            </label>
            <input
              inputMode="numeric"
              maxLength={6}
              className="mb-2 w-full rounded-lg border border-slate-300 p-3 text-sm outline-none transition focus:border-green-500 focus:ring-2 focus:ring-green-100"
              value={otp}
              placeholder="Enter 6-digit OTP"
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            />
            <p className="mb-4 text-xs text-slate-500">
              The OTP expires in 5 minutes and can only be used once.
            </p>
          </>
        )}

        <button
          className="w-full rounded-lg bg-green-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-70"
          onClick={phase === 'otp' ? handleVerifyOtp : handleSendOtp}
          disabled={
            (phase === 'otp' && (!canVerifyOtp || verifying)) ||
            (phase === 'email' && (!canRequestOtp || sending))
          }
        >
          {phase === 'otp'
            ? (verifying ? STATUS_TEXT.verifying : STATUS_TEXT.verify)
            : (sending ? STATUS_TEXT.sending : sendButtonLabel)}
        </button>

        {phase === 'otp' && (
          <button
            className="mt-3 w-full rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800 transition hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-70"
            onClick={handleSendOtp}
            disabled={!canRequestOtp || sending || cooldownSeconds > 0}
          >
            {cooldownSeconds > 0 ? `Resend available in ${cooldownSeconds}s` : 'Resend OTP'}
          </button>
        )}

        {info && (
          <p className="mt-4 text-center text-sm text-green-700">
            {info}
          </p>
        )}

        {error && (
          <p className="mt-4 text-center text-sm text-red-500">
            {error}
          </p>
        )}
      </div>
    </div>
  );
};