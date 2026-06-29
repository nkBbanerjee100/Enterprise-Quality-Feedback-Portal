/**
* Customer Survey Page
*
* Accessible via public route /survey/:token (no auth required)
* On mount: GET /api/feedback/public/:token  → validates token, gets project context
* On submit: POST /api/feedback/public/:token/submit → saves answers
*/
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import mindteckLogo from '../../assets/mindteckLogo.png';
import { BRAND } from '../../utils/constants';
 
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
 
type Step = 'loading' | 'form' | 'submitted' | 'expired' | 'already_submitted' | 'error';
 
interface SurveyQuestion {
  id:       number;
  text:     string;
  type:     'rating' | 'text';
  required: boolean;
}
 
interface SurveyMeta {
  requestId:     number;
  projectId:     number;
  recipientName: string;
  expiresAt:     string | null;
}
 
const QUESTIONS: SurveyQuestion[] = [
  { id: 1, text: 'How satisfied are you with the overall project delivery?',        type: 'rating', required: true },
  { id: 2, text: 'How would you rate the quality of communication throughout?',     type: 'rating', required: true },
  { id: 3, text: 'Did the team meet the agreed timelines and deliverables?',        type: 'rating', required: true },
  { id: 4, text: 'How likely are you to work with us again on a future project?',  type: 'rating', required: true },
  { id: 5, text: 'Please share any comments or suggestions for improvement.',       type: 'text',   required: false },
];
 
// ── Star Rating component ──────────────────────────────────────────────────────
const StarRating: React.FC<{
  questionId: number;
  value:      number;
  onChange:   (id: number, val: number) => void;
}> = ({ questionId, value, onChange }) => {
  const [hovered, setHovered] = useState(0);
  const labels = ['Very poor', 'Poor', 'Neutral', 'Good', 'Excellent'];
 
  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(questionId, star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          style={{
            width: '44px', height: '44px', borderRadius: '8px',
            border: `2px solid ${(hovered || value) >= star ? BRAND.green : '#D4E4DA'}`,
            background: (hovered || value) >= star ? BRAND.green : '#FAFAFA',
            color: (hovered || value) >= star ? '#FFF' : BRAND.textLight,
            fontSize: '18px', cursor: 'pointer',
            transition: 'all 0.15s ease',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ★
        </button>
      ))}
      {(hovered || value) > 0 && (
        <span style={{ fontSize: '13px', color: BRAND.textMid, fontWeight: 500 }}>
          {labels[(hovered || value) - 1]}
        </span>
      )}
    </div>
  );
};
 
// ── Main page ─────────────────────────────────────────────────────────────────
export const CustomerSurveyPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
 
  const [step, setStep]         = useState<Step>('loading');
  const [meta, setMeta]         = useState<SurveyMeta | null>(null);
  const [answers, setAnswers]   = useState<Record<number, number | string>>({});
  const [errors, setErrors]     = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
 
  // ── Validate token on mount ──────────────────────────────────────────────
  useEffect(() => {
    if (!token) {
      setStep('error');
      return;
    }
 
    fetch(`${API_BASE}/api/feedback/public/${token}`)
      .then(async res => {
        if (res.status === 404) { setStep('error'); return; }
        if (res.status === 409) { setStep('already_submitted'); return; }
        if (res.status === 410) { setStep('expired'); return; }
        if (!res.ok)            { setStep('error'); return; }
        const data = await res.json();
        setMeta(data);
        setStep('form');
      })
      .catch(() => setStep('error'));
  }, [token]);
 
  // ── Handlers ────────────────────────────────────────────────────────────
  const setRating = (id: number, val: number) => {
    setAnswers(prev => ({ ...prev, [id]: val }));
    setErrors(prev => { const e = { ...prev }; delete e[id]; return e; });
  };
 
  const setText = (id: number, val: string) =>
    setAnswers(prev => ({ ...prev, [id]: val }));
 
  const validate = (): boolean => {
    const newErrors: Record<number, string> = {};
    QUESTIONS.forEach(q => {
      if (q.required && !answers[q.id]) newErrors[q.id] = 'This question is required.';
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
 
  const handleSubmit = async () => {
    if (!validate() || !token) return;
    setSubmitting(true);
    try {
      const body = {
        answers: Object.entries(answers).map(([questionId, value]) => ({
          questionId: Number(questionId),
          value: String(value),
        })),
      };
      const res = await fetch(`${API_BASE}/api/feedback/public/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 409) { setStep('already_submitted'); return; }
      if (res.status === 410) { setStep('expired'); return; }
      if (!res.ok) { setStep('error'); return; }
      setStep('submitted');
    } catch {
      setStep('error');
    } finally {
      setSubmitting(false);
    }
  };
 
  // ── Shell used by all non-form states ────────────────────────────────────
  const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div style={{ minHeight: '100vh', background: BRAND.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <div style={{ background: '#FFF', border: '1px solid #D4E4DA', borderRadius: '16px', padding: '48px 40px', maxWidth: '480px', width: '100%', textAlign: 'center' }}>
        {children}
        <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid #EEF3F0' }}>
          <img src={mindteckLogo} alt="Mindteck" style={{ height: '22px', objectFit: 'contain', opacity: 0.5 }} />
        </div>
      </div>
    </div>
  );
 
  // ── Loading ───────────────────────────────────────────────────────────────
  if (step === 'loading') {
    return (
      <Shell>
        <p style={{ color: BRAND.textMid, fontSize: '14px' }}>Loading your survey…</p>
      </Shell>
    );
  }
 
  // ── Submitted ─────────────────────────────────────────────────────────────
  if (step === 'submitted') {
    return (
      <Shell>
        <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: BRAND.greenMuted, margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '24px', color: BRAND.green }}>✓</span>
        </div>
        <h2 style={{ fontSize: '22px', fontWeight: 700, color: BRAND.textDark, marginBottom: '10px' }}>
          Thank you for your feedback
        </h2>
        <p style={{ fontSize: '14px', color: BRAND.textMid, lineHeight: 1.7 }}>
          Your response has been recorded. We truly value your input — it helps us continuously improve our service quality.
        </p>
        <p style={{ fontSize: '12px', color: BRAND.textLight, marginTop: '12px' }}>You may now close this window.</p>
      </Shell>
    );
  }
 
  // ── Already submitted ─────────────────────────────────────────────────────
  if (step === 'already_submitted') {
    return (
      <Shell>
        <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#FEF9C3', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '24px' }}>📋</span>
        </div>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: BRAND.textDark, marginBottom: '10px' }}>
          Already submitted
        </h2>
        <p style={{ fontSize: '14px', color: BRAND.textMid, lineHeight: 1.7 }}>
          We've already received your feedback for this survey. Thank you!
        </p>
      </Shell>
    );
  }
 
  // ── Expired / Error ───────────────────────────────────────────────────────
  if (step === 'expired' || step === 'error') {
    return (
      <Shell>
        <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#FEF2F2', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: '24px', color: '#DC2626' }}>✕</span>
        </div>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: BRAND.textDark, marginBottom: '10px' }}>
          {step === 'expired' ? 'This link has expired' : 'Something went wrong'}
        </h2>
        <p style={{ fontSize: '14px', color: BRAND.textMid, lineHeight: 1.7 }}>
          {step === 'expired'
            ? 'This feedback link is no longer active. Please contact the Mindteck quality team if you need a new link.'
            : 'We could not load your survey. Please try again or contact the Mindteck quality team for assistance.'}
        </p>
        <p style={{ fontSize: '12px', color: BRAND.textLight, marginTop: '12px' }}>
          <a href="mailto:quality@mindteck.com" style={{ color: BRAND.green, textDecoration: 'none' }}>quality@mindteck.com</a>
        </p>
      </Shell>
    );
  }
 
  // ── Main survey form ───────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: BRAND.surface, padding: '40px 20px' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
 
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <img src={mindteckLogo} alt="Mindteck" style={{ height: '30px', objectFit: 'contain', marginBottom: '16px' }} />
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: BRAND.textDark, marginBottom: '6px' }}>
            Customer Feedback
          </h1>
          {meta && (
            <p style={{ fontSize: '13px', color: BRAND.textMid }}>
              Project #{meta.projectId} · {meta.recipientName}
            </p>
          )}
          <p style={{ fontSize: '12px', color: BRAND.textLight, marginTop: '4px' }}>
            Your feedback helps us deliver better quality on every project.
          </p>
        </div>
 
        {/* Form card */}
        <div style={{ background: '#FFF', border: '1px solid #D4E4DA', borderRadius: '14px', padding: '36px 36px 30px' }}>
 
          {QUESTIONS.map((q, idx) => (
            <div key={q.id} style={{ marginBottom: idx < QUESTIONS.length - 1 ? '32px' : '0' }}>
              <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: BRAND.textDark, marginBottom: '10px' }}>
                {idx + 1}. {q.text}
                {q.required && <span style={{ color: '#DC2626', marginLeft: '4px' }}>*</span>}
              </label>
 
              {q.type === 'rating' ? (
                <StarRating questionId={q.id} value={(answers[q.id] as number) ?? 0} onChange={setRating} />
              ) : (
                <textarea
                  value={(answers[q.id] as string) ?? ''}
                  onChange={e => setText(q.id, e.target.value)}
                  placeholder="Share your thoughts…"
                  rows={4}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '12px 14px', fontSize: '13px',
                    border: `1px solid ${errors[q.id] ? '#DC2626' : '#D4E4DA'}`,
                    borderRadius: '8px', color: BRAND.textDark,
                    resize: 'vertical', outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
              )}
 
              {errors[q.id] && (
                <p style={{ fontSize: '11px', color: '#DC2626', marginTop: '6px' }}>{errors[q.id]}</p>
              )}
            </div>
          ))}
 
          {/* Submit */}
          <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #EEF3F0' }}>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                width: '100%', padding: '14px',
                background: submitting ? BRAND.textLight : BRAND.green,
                color: '#FFF', border: 'none', borderRadius: '8px',
                fontSize: '15px', fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
                letterSpacing: '0.02em', transition: 'background 0.15s ease',
              }}
            >
              {submitting ? 'Submitting…' : 'Submit Feedback'}
            </button>
            <p style={{ fontSize: '11px', color: BRAND.textLight, textAlign: 'center', marginTop: '10px' }}>
              By submitting, you agree to Mindteck's feedback collection policy.
            </p>
          </div>
        </div>
 
        <p style={{ textAlign: 'center', fontSize: '11px', color: BRAND.textLight, marginTop: '20px' }}>
          © {new Date().getFullYear()} CSAT Tool · Quality Delivery
        </p>
      </div>
    </div>
  );
};
 