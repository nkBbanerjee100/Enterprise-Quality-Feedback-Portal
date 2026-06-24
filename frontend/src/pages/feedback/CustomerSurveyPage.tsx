/**
 * Customer Survey Page
 *
 * Accessible via public route /survey/:token (no auth required)
 * Per doc §4, Customer can:
 *   - Open secure feedback link
 *   - Submit feedback once (or as configured)
 *   - Receive confirmation after submission
 *
 * Per doc §8, the page shows: project name, basic context, ratings + comments, confirmation.
 * Per doc §19, internal IDs and user data must NOT be exposed here.
 *
 * /survey (no token) → logged-in Customer landing: shows "check your inbox" message.
 */
import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import mindteckLogo from '../../assets/mindteckLogo.png';
import { BRAND } from '../../utils/constants';

type Step = 'form' | 'submitted' | 'expired' | 'error';

interface SurveyQuestion {
  id:       number;
  text:     string;
  type:     'rating' | 'text';
  required: boolean;
  min?:     number;
  max?:     number;
}

// Placeholder questions — replaced by template fetched from GET /api/public/feedback/:token
const PLACEHOLDER_QUESTIONS: SurveyQuestion[] = [
  { id: 1, text: 'How satisfied are you with the overall project delivery?',        type: 'rating', required: true, min: 1, max: 5 },
  { id: 2, text: 'How would you rate the quality of communication throughout?',     type: 'rating', required: true, min: 1, max: 5 },
  { id: 3, text: 'Did the team meet the agreed timelines and deliverables?',        type: 'rating', required: true, min: 1, max: 5 },
  { id: 4, text: 'How likely are you to work with us again on a future project?',  type: 'rating', required: true, min: 1, max: 5 },
  { id: 5, text: 'Please share any comments or suggestions for improvement.',       type: 'text',   required: false },
];

const StarRating: React.FC<{
  questionId: number;
  value:      number;
  onChange:   (id: number, val: number) => void;
  labels?:    string[];
}> = ({ questionId, value, onChange, labels = ['Very poor', 'Poor', 'Neutral', 'Good', 'Excellent'] }) => {
  const [hovered, setHovered] = useState(0);

  return (
    <div>
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
    </div>
  );
};

export const CustomerSurveyPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();

  // All hooks must be declared before any early return (Rules of Hooks)
  const [step, setStep]             = useState<Step>('form');
  const [answers, setAnswers]       = useState<Record<number, number | string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors]         = useState<Record<number, string>>({});

  // ── No token: Customer logged in but arrived without a feedback link ──
  if (!token) {
    return (
      <div style={{ minHeight: '100vh', background: BRAND.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <div style={{ background: '#FFF', border: '1px solid #D4E4DA', borderRadius: '16px', padding: '48px 40px', maxWidth: '480px', width: '100%', textAlign: 'center' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: BRAND.greenMuted, margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={BRAND.green} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: BRAND.textDark, marginBottom: '10px' }}>
            Check your inbox
          </h2>
          <p style={{ fontSize: '14px', color: BRAND.textMid, lineHeight: 1.7, marginBottom: '24px' }}>
            Your feedback is accessed via a secure link sent to your email by the Mindteck Quality team.
            Please open that email and click the link to submit your response.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', marginBottom: '28px' }}>
            {[
              { icon: '🔗', text: 'Look for an email from the Mindteck Quality Delivery.' },
              { icon: '🔒', text: 'Each feedback link is unique and secure — do not share it.' },
              { icon: '✅', text: 'Once submitted, you will receive a confirmation on the same page.' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderRadius: 8, background: BRAND.surface, border: `1px solid ${BRAND.border}` }}>
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                <span style={{ fontSize: 13, color: BRAND.textMid, lineHeight: 1.55 }}>{item.text}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '12px', color: BRAND.textLight }}>
            Need help?{' '}
            <a href="mailto:quality@mindteck.com" style={{ color: BRAND.green, textDecoration: 'none', fontWeight: 500 }}>
              quality@mindteck.com
            </a>
          </p>
          <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid #EEF3F0' }}>
            <img src={mindteckLogo} alt="Mindteck" style={{ height: '22px', objectFit: 'contain', opacity: 0.5 }} />
          </div>
        </div>
      </div>
    );
  }

  // Placeholder project info — populated from GET /api/public/feedback/:token
  const projectInfo = {
    projectName:  'Project Alpha — Software Delivery',
    companyName:  'Mindteck',
  };

  const setRating = (id: number, val: number) => {
    setAnswers(prev => ({ ...prev, [id]: val }));
    setErrors(prev => { const e = { ...prev }; delete e[id]; return e; });
  };

  const setText = (id: number, val: string) => {
    setAnswers(prev => ({ ...prev, [id]: val }));
  };

  const validate = (): boolean => {
    const newErrors: Record<number, string> = {};
    PLACEHOLDER_QUESTIONS.forEach(q => {
      if (q.required && !answers[q.id]) {
        newErrors[q.id] = 'This question is required.';
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      // POST /api/public/feedback/:token/submit
      await new Promise(r => setTimeout(r, 900)); // placeholder for actual API call
      setStep('submitted');
    } catch {
      setStep('error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Submitted confirmation ──
  if (step === 'submitted') {
    return (
      <div style={{ minHeight: '100vh', background: BRAND.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <div style={{ background: '#FFF', border: '1px solid #D4E4DA', borderRadius: '16px', padding: '48px 40px', maxWidth: '480px', width: '100%', textAlign: 'center' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: BRAND.greenMuted, margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '24px', color: BRAND.green }}>✓</span>
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: BRAND.textDark, marginBottom: '10px' }}>
            Thank you for your feedback
          </h2>
          <p style={{ fontSize: '14px', color: BRAND.textMid, lineHeight: 1.7, marginBottom: '24px' }}>
            Your response has been recorded. We truly value your input — it helps us continuously improve our service quality.
          </p>
          <p style={{ fontSize: '12px', color: BRAND.textLight }}>
            You may now close this window.
          </p>
          <div style={{ marginTop: '32px', paddingTop: '20px', borderTop: '1px solid #EEF3F0' }}>
            <img src={mindteckLogo} alt="Mindteck" style={{ height: '22px', objectFit: 'contain', opacity: 0.5 }} />
          </div>
        </div>
      </div>
    );
  }

  // ── Expired / Error ──
  if (step === 'expired' || step === 'error') {
    return (
      <div style={{ minHeight: '100vh', background: BRAND.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
        <div style={{ background: '#FFF', border: '1px solid #D4E4DA', borderRadius: '16px', padding: '48px 40px', maxWidth: '480px', width: '100%', textAlign: 'center' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#FEF2F2', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '24px', color: '#DC2626' }}>✕</span>
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: BRAND.textDark, marginBottom: '10px' }}>
            {step === 'expired' ? 'This link has expired' : 'Something went wrong'}
          </h2>
          <p style={{ fontSize: '14px', color: BRAND.textMid, lineHeight: 1.7 }}>
            {step === 'expired'
              ? 'This feedback link is no longer active. Please contact the Mindteck quality team if you need a new link.'
              : 'We could not submit your response. Please try again or contact the Mindteck quality team for assistance.'}
          </p>
        </div>
      </div>
    );
  }

  // ── Main survey form ──
  return (
    <div style={{ minHeight: '100vh', background: BRAND.surface, padding: '40px 20px' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <img src={mindteckLogo} alt="Mindteck" style={{ height: '30px', objectFit: 'contain', marginBottom: '16px' }} />
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: BRAND.textDark, marginBottom: '6px' }}>
            Customer Feedback
          </h1>
          <p style={{ fontSize: '13px', color: BRAND.textMid }}>
            {projectInfo.projectName}
          </p>
          <p style={{ fontSize: '12px', color: BRAND.textLight, marginTop: '4px' }}>
            Your feedback helps us deliver better quality on every project.
          </p>
        </div>

        {/* Form card */}
        <div style={{ background: '#FFF', border: '1px solid #D4E4DA', borderRadius: '14px', padding: '36px 36px 30px' }}>

          {PLACEHOLDER_QUESTIONS.map((q, idx) => (
            <div key={q.id} style={{ marginBottom: idx < PLACEHOLDER_QUESTIONS.length - 1 ? '32px' : '0' }}>
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

          {/* Submit button */}
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