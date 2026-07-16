/**
 * Feedback Request List Page — with response viewer drawer
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useFeedbackRequests } from '../../hooks/useFeedback';
import { Pagination } from '../../components/common/Pagination';
import { BRAND, ROUTES } from '../../utils/constants';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/auth.store';

// ── Question labels (matches CustomerSurveyPage question ids) ─────────────────
const QUESTION_LABELS: Record<string, string> = {
  'q1': 'Timely delivery of product/service',
  'q2': 'Meeting of your requirements',
  'q3': 'Quality of product/service delivered',
  'q4': 'Cost of product/service delivered',
  'q5': 'Clarity of documentation delivered',
  'q6': 'Communication skills of the teams you have been interacting with',
  'q7': 'Professionalism of Mindteck',
  'q8': 'Responsiveness of Mindteck to your needs and suggestions',
};

const RATING_LABELS: Record<string, string> = {
  '1': '1 — Very Dissatisfied',
  '2': '2 — Dissatisfied',
  '3': '3 — Neutral',
  '4': '4 — Satisfied',
  '5': '5 — Very Satisfied',
};

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; bg: string; color: string; dot: string }> = {
  draft: { label: 'Draft', bg: '#F3F4F6', color: '#6B7280', dot: '#9CA3AF' },
  pending: { label: 'Pending', bg: '#FDF6E3', color: '#9B7C2A', dot: '#F59E0B' },
  sent: { label: 'Sent', bg: '#EEF4FF', color: '#2563EB', dot: '#3B82F6' },
  completed: { label: 'Submitted', bg: '#E8F2EC', color: '#1A5C3A', dot: '#22C55E' },
  expired: { label: 'Expired', bg: '#FEF2F2', color: '#DC2626', dot: '#EF4444' },
  cancelled: { label: 'Cancelled', bg: '#F3F4F6', color: '#6B7280', dot: '#9CA3AF' },
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const meta = STATUS_META[status?.toLowerCase()] ?? { label: status, bg: '#F3F4F6', color: '#6B7280', dot: '#9CA3AF' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: meta.bg, color: meta.color, whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.dot, flexShrink: 0 }} />
      {meta.label}
    </span>
  );
};

const PM_STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  draft: { label: 'Draft', bg: '#F3F4F6', color: '#6B7280' },
  pending_pm: { label: 'Pending PM', bg: '#FDF6E3', color: '#9B7C2A' },
  approved: { label: 'Approved', bg: '#E8F2EC', color: '#1A5C3A' },
  rejected: { label: 'Rejected', bg: '#FEF2F2', color: '#DC2626' },
};

const PmStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const meta = PM_STATUS_META[status?.toLowerCase()] ?? PM_STATUS_META.draft;
  return (
    <span style={{ display: 'inline-flex', padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: meta.bg, color: meta.color, whiteSpace: 'nowrap' }}>
      {meta.label}
    </span>
  );
};

const TH: React.FC<{ children: React.ReactNode; right?: boolean }> = ({ children, right }) => (
  <th style={{ padding: '10px 16px', fontSize: 10, fontWeight: 700, color: BRAND.textLight, textAlign: right ? 'right' : 'left', letterSpacing: '0.08em', textTransform: 'uppercase' as const, background: BRAND.surface, borderBottom: `1px solid ${BRAND.border}`, whiteSpace: 'nowrap' as const }}>
    {children}
  </th>
);

const formatDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

// ── Star rating display ───────────────────────────────────────────────────────
const StarRating: React.FC<{ value: string }> = ({ value }) => {
  const num = parseInt(value, 10);
  if (isNaN(num)) return <span style={{ fontSize: 13, color: BRAND.textMid }}>{value}</span>;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ display: 'flex', gap: 2 }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
          <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill={i <= num ? '#F59E0B' : '#E5E7EB'} stroke="none">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        ))}
      </div>
      <span style={{ fontSize: 12, color: BRAND.textMid, fontWeight: 500 }}>{num}/10</span>
    </div>
  );
};

// ── Response Drawer ───────────────────────────────────────────────────────────
const ResponseDrawer: React.FC<{ requestId: number | null; onClose: () => void }> = ({ requestId, onClose }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['feedbackResponses', requestId],
    queryFn: async () => {
      const res = await api.get(`/api/feedback/requests/${requestId}/responses`);
      return res.data;
    },
    enabled: !!requestId,
  });

  if (!requestId) return null;

  const isRatingQuestion = (qid: number) => qid !== 6; // q6 = comments

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 40 }}
      />

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 440, background: '#fff',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
        zIndex: 50, display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${BRAND.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: BRAND.surface }}>
          <div>
            <p style={{ fontSize: 10, color: BRAND.gold, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 3px' }}>
              Customer Response
            </p>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: BRAND.textDark, margin: 0 }}>
              {data?.request?.recipientName ?? '—'}
            </h2>
            <p style={{ fontSize: 12, color: BRAND.textLight, margin: '2px 0 0' }}>
              {data?.request?.recipientEmail}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: BRAND.textLight, padding: 4 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Meta */}
        {data?.request && (
          <div style={{ padding: '12px 24px', borderBottom: `1px solid ${BRAND.border}`, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: 10, color: BRAND.textLight, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>Project</p>
              <p style={{ fontSize: 12, color: BRAND.textDark, fontWeight: 500, margin: 0 }}>
                {data.request.projectName ?? `#${data.request.projectExtId ?? data.request.projectId}`}
              </p>
            </div>
            <div>
              <p style={{ fontSize: 10, color: BRAND.textLight, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>Submitted</p>
              <p style={{ fontSize: 12, color: BRAND.textDark, fontWeight: 500, margin: 0 }}>
                {data.answers?.[0]?.submittedAt ? formatDate(data.answers[0].submittedAt) : '—'}
              </p>
            </div>
            <div>
              <p style={{ fontSize: 10, color: BRAND.textLight, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>Status</p>
              <StatusBadge status={data.request.status} />
            </div>
          </div>
        )}

        {/* Answers */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ width: 24, height: 24, border: `3px solid ${BRAND.greenMuted}`, borderTopColor: BRAND.green, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 10px' }} />
              <p style={{ fontSize: 13, color: BRAND.textLight }}>Loading responses…</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : !data?.responses?.length ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <p style={{ fontSize: 13, color: BRAND.textDark, fontWeight: 600 }}>No responses saved</p>
              <p style={{ fontSize: 12, color: BRAND.textLight }}>This request was submitted before response storage was enabled.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {(() => {
                const responseData = data.responses[0]?.data || {};
                const ratings = responseData.ratings || {};
                const comments = responseData.ratingComments || {};

                return (
                  <>
                    {Object.keys(ratings).map((qId) => (
                      <div key={qId} style={{ background: BRAND.surface, border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: '14px 16px' }}>
                        <p style={{ fontSize: 11, color: BRAND.textLight, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
                          {QUESTION_LABELS[qId] ?? `Question ${qId}`}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: comments[qId] ? 8 : 0 }}>
                          <StarRating value={ratings[qId]} />
                        </div>
                        {comments[qId] && (
                          <p style={{ fontSize: 13, color: BRAND.textDark, margin: 0, lineHeight: 1.6, fontStyle: 'italic' }}>
                            "{comments[qId]}"
                          </p>
                        )}
                      </div>
                    ))}

                    {responseData.clientManagerComments && (
                      <div style={{ background: BRAND.surface, border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: '14px 16px' }}>
                        <p style={{ fontSize: 11, color: BRAND.textLight, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Client Manager Comments</p>
                        <p style={{ fontSize: 13, color: BRAND.textDark, margin: 0, lineHeight: 1.6 }}>{responseData.clientManagerComments}</p>
                      </div>
                    )}

                    {responseData.areasToCompliment && (
                      <div style={{ background: BRAND.surface, border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: '14px 16px' }}>
                        <p style={{ fontSize: 11, color: BRAND.textLight, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Areas to Compliment</p>
                        <p style={{ fontSize: 13, color: BRAND.textDark, margin: 0, lineHeight: 1.6 }}>{responseData.areasToCompliment}</p>
                      </div>
                    )}

                    {responseData.areasToImprove && (
                      <div style={{ background: BRAND.surface, border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: '14px 16px' }}>
                        <p style={{ fontSize: 11, color: BRAND.textLight, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Areas to Improve</p>
                        <p style={{ fontSize: 13, color: BRAND.textDark, margin: 0, lineHeight: 1.6 }}>{responseData.areasToImprove}</p>
                      </div>
                    )}

                    {/* Average score */}
                    {responseData.overallRating !== null && responseData.overallRating !== undefined && (
                      <div style={{ background: BRAND.green, borderRadius: 10, padding: '14px 16px', color: '#fff' }}>
                        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.7, margin: '0 0 4px' }}>Average CSAT Score</p>
                        <p style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>
                          {Number(responseData.overallRating).toFixed(1)} <span style={{ fontSize: 13, opacity: 0.7 }}>/ 10.0</span>
                          {responseData.overallAssessment && <span style={{ fontSize: 14, marginLeft: 12, fontWeight: 500, opacity: 0.9 }}>- {responseData.overallAssessment}</span>}
                        </p>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// ── PM Approval Modal ────────────────────────────────────────────────────────
const PMApprovalModal: React.FC<{ request: any; onClose: () => void; onSuccess: () => void }> = ({ request, onClose, onSuccess }) => {
  const [mode, setMode] = useState<'approve' | null>(null); const [achievements, setAchievements] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!achievements.trim()) return alert("Achievements are required.");

    setLoading(true);
    try {
      await api.post(`/api/feedback/requests/${request.id}/pm-approve`, {
        pmAchievements: achievements,
      });
      onSuccess();
    } catch (err: any) {
      alert(err.response?.data?.detail || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  if (!request) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 540, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #0b5c36 0%, #16a34a 100%)', padding: '20px 24px' }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Project Manager Action</p>
          <h3 style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 700, color: '#fff' }}>Review Feedback Form</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>
            {request.projectName ?? `Project #${request.projectId}`} · {request.recipientName}
          </p>
        </div>
        <div style={{ padding: '20px 24px' }}>
          {!mode ? (
            <>
              <p style={{ margin: '0 0 20px', fontSize: 13, color: BRAND.textMid, lineHeight: 1.6 }}>
                Please review the feedback form details below and add your team's achievements for the CSAT period.              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div style={{ padding: 12, background: BRAND.surface, borderRadius: 8, border: `1px solid ${BRAND.border}` }}>
                  <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Project</p>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: BRAND.textDark, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{request.projectName ?? 'Unknown Project'}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: BRAND.textLight }}>ID: {request.projectId}</p>
                </div>
                <div style={{ padding: 12, background: BRAND.surface, borderRadius: 8, border: `1px solid ${BRAND.border}` }}>
                  <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Customer</p>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: BRAND.textDark, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{request.recipientName}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: BRAND.textLight }}>{request.recipientEmail}</p>
                </div>
                <div style={{ padding: 12, background: BRAND.surface, borderRadius: 8, border: `1px solid ${BRAND.border}` }}>
                  <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Period of Perf.</p>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: BRAND.textDark }}>{request.periodOfPerformance || '—'}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 7, border: `1px solid ${BRAND.border}`, background: '#fff', cursor: 'pointer', fontSize: 13, color: BRAND.textMid }}>Cancel</button>
                <button onClick={() => setMode('approve')} style={{ padding: '8px 20px', borderRadius: 7, border: 'none', background: BRAND.green, color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>Add Achievements</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 16, padding: '10px 14px', background: '#F0FDF4', borderRadius: 8, border: '1px solid #BBF7D0' }}>
                <p style={{ margin: 0, fontSize: 12, color: '#15803D', fontWeight: 600 }}>Add team achievements for {request.projectName ?? `Project #${request.projectId}`}</p>
              </div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: BRAND.textDark, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Team's Achievements During CSAT Period *</label>
              <p style={{ margin: '0 0 8px', fontSize: 12, color: BRAND.textMid, lineHeight: 1.5 }}>These achievements will be pre-filled in the customer survey form (read-only for the customer).</p>
              <textarea
                rows={5}
                value={achievements}
                onChange={e => setAchievements(e.target.value)}
                placeholder="Enter your team's achievements, milestones, and highlights during this CSAT cycle..."
                style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${BRAND.border}`, borderRadius: 8, boxSizing: 'border-box', fontSize: 13, lineHeight: 1.6, resize: 'vertical', outline: 'none', fontFamily: 'inherit' }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                <button onClick={() => setMode(null)} style={{ padding: '8px 16px', borderRadius: 7, border: `1px solid ${BRAND.border}`, background: '#fff', cursor: 'pointer', fontSize: 13, color: BRAND.textMid }}>← Back</button>
                <button onClick={handleSubmit} disabled={loading || !achievements.trim()} style={{ padding: '8px 24px', borderRadius: 7, border: 'none', background: achievements.trim() ? BRAND.green : '#D1D5DB', color: '#fff', cursor: achievements.trim() ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 13 }}>{loading ? 'Submitting...' : 'Submit & Notify Quality'}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Quality Review Modal (before sending to customer) ─────────────────────────
const QualityReviewModal: React.FC<{ request: any; onClose: () => void; onSuccess: () => void }> = ({ request, onClose, onSuccess }) => {
  const [sending, setSending] = useState(false);

  const handleConfirmSend = async () => {
    setSending(true);
    try {
      await api.post(`/api/feedback/requests/${request.id}/send-to-customer`);
      onSuccess();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to send email");
    } finally {
      setSending(false);
    }
  };

  if (!request) return null;

  const formatD = (iso: string | null | undefined) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 580, boxShadow: '0 24px 80px rgba(0,0,0,0.22)', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #0b5c36 0%, #16a34a 100%)', padding: '20px 24px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.65)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Quality Review</p>
              <h3 style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 700, color: '#fff' }}>Final Review Before Sending</h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>Verify all details are correct before emailing the customer</p>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, padding: '6px 8px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Recipient & Project */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ padding: '12px 14px', background: BRAND.surface, borderRadius: 8, border: `1px solid ${BRAND.border}` }}>
              <p style={{ margin: '0 0 3px', fontSize: 10, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Customer</p>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: BRAND.textDark }}>{request.recipientName}</p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: BRAND.textLight }}>{request.recipientEmail}</p>
            </div>
            <div style={{ padding: '12px 14px', background: BRAND.surface, borderRadius: 8, border: `1px solid ${BRAND.border}` }}>
              <p style={{ margin: '0 0 3px', fontSize: 10, fontWeight: 700, color: BRAND.textLight, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Project</p>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: BRAND.textDark }}>{request.projectName ?? `Project #${request.projectId}`}</p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: BRAND.textLight }}>Period: {request.periodOfPerformance || '—'}</p>
            </div>
          </div>

          {/* PM Achievements — read-only preview */}
          <div style={{ border: '1.5px solid #16a34a', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ background: '#F0FDF4', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #BBF7D0' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2" strokeLinecap="round"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.08em' }}>PM Achievements (Pre-filled for Customer — Read Only)</p>
            </div>
            <div style={{ padding: '12px 14px', background: '#fff', minHeight: 60 }}>
              {request.pmAchievements ? (
                <p style={{ margin: 0, fontSize: 13, color: BRAND.textDark, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{request.pmAchievements}</p>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: BRAND.textLight, fontStyle: 'italic' }}>No achievements entered by PM.</p>
              )}
            </div>
          </div>

          {/* Rejection history if any */}
          {request.pmRejectionComments && (
            <div style={{ padding: '10px 14px', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8 }}>
              <p style={{ margin: '0 0 3px', fontSize: 10, fontWeight: 700, color: '#C2410C', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Previous Rejection Reason</p>
              <p style={{ margin: 0, fontSize: 12, color: '#9A3412', lineHeight: 1.5 }}>{request.pmRejectionComments}</p>
            </div>
          )}

          {/* Warning */}
          <div style={{ padding: '12px 14px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8 }}>
            <p style={{ margin: 0, fontSize: 12, color: '#1D4ED8', lineHeight: 1.6 }}>
              📧 Once confirmed, a secure survey link will be emailed to <strong>{request.recipientEmail}</strong>. The PM achievements above will be pre-filled and read-only in the customer survey.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: `1px solid ${BRAND.border}`, display: 'flex', gap: 10, justifyContent: 'flex-end', background: BRAND.surface, flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 8, border: `1px solid ${BRAND.border}`, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: BRAND.textMid }}>Cancel</button>
          <button
            onClick={handleConfirmSend}
            disabled={sending}
            style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: sending ? '#D1D5DB' : BRAND.green, color: '#fff', cursor: sending ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}
          >
            {sending ? (
              <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Sending…</>
            ) : '📧 Confirm & Send to Customer'}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};


// ── Edit Draft Modal (For Quality Team) ──────────────────────────────────────
const EditDraftModal: React.FC<{ request: any; onClose: () => void; onSuccess: () => void }> = ({ request, onClose, onSuccess }) => {
  const [recipientName, setRecipientName] = useState(request?.recipientName || '');
  const [recipientEmail, setRecipientEmail] = useState(request?.recipientEmail || '');
  // Simplified for edit modal, assuming periodOfPerformance was saved as "Start to End"
  const [period, setPeriod] = useState(request?.periodOfPerformance || '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await api.put(`/api/feedback/requests/${request.id}`, {
        projectId: request.projectId,
        recipientName,
        recipientEmail,
        periodOfPerformance: period,
      });
      onSuccess();
    } catch (err: any) {
      alert(err.response?.data?.detail || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  if (!request) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 500, boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>Edit & Resubmit Draft</h3>

        {request.pmRejectionComments && (
          <div style={{ padding: 12, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, marginBottom: 16 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#DC2626', margin: '0 0 4px' }}>PM Comments:</p>
            <p style={{ fontSize: 13, color: '#991B1B', margin: 0 }}>{request.pmRejectionComments}</p>
          </div>
        )}

        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Customer Name</label>
            <input value={recipientName} onChange={e => setRecipientName(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: `1px solid ${BRAND.border}`, borderRadius: 6, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Customer Email</label>
            <input value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: `1px solid ${BRAND.border}`, borderRadius: 6, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Period of Performance</label>
            <input value={period} onChange={e => setPeriod(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: `1px solid ${BRAND.border}`, borderRadius: 6, boxSizing: 'border-box' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#f3f4f6', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSubmit} disabled={loading} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: BRAND.green, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>{loading ? 'Submitting...' : 'Resubmit to PM'}</button>
        </div>
      </div>
    </div>
  );
};


// ── Main page ─────────────────────────────────────────────────────────────────
export const FeedbackRequestListPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pmReviewRequest, setPmReviewRequest] = useState<any | null>(null);
  const [editDraftRequest, setEditDraftRequest] = useState<any | null>(null);
  const [qualityReviewRequest, setQualityReviewRequest] = useState<any | null>(null);
  const pageSize = 15;

  const { data, isLoading, error, refetch } = useFeedbackRequests((page - 1) * pageSize, pageSize);

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;

  return (
    <PageWrapper>
      <div style={{ maxWidth: 1100 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <p style={{ fontSize: 11, color: BRAND.gold, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 4px' }}>
              Quality Feedback Platform
            </p>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: BRAND.textDark, margin: 0, letterSpacing: '-0.02em' }}>
              Feedback Requests
            </h1>
            <p style={{ fontSize: 13, color: BRAND.textLight, margin: '2px 0 0' }}>
              {total > 0 ? `${total} request${total !== 1 ? 's' : ''} total` : 'All sent CSAT forms'}
            </p>
          </div>
          {user?.role === 'QUALITY' && (
            <button
              onClick={() => navigate(ROUTES.FEEDBACK_SEND)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: BRAND.green, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              Create Feedback Form
            </button>
          )}
        </div>

        {error && (
          <div style={{ padding: '12px 16px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, color: '#DC2626', fontSize: 13, marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
            <span>Failed to load feedback requests.</span>
            <button onClick={() => refetch()} style={{ fontSize: 12, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Retry</button>
          </div>
        )}

        {/* Table */}
        <div style={{ background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>

          {!isLoading && rows.length > 0 && (
            <div style={{ padding: '10px 20px', borderBottom: `1px solid ${BRAND.border}`, display: 'flex', gap: 24, background: BRAND.surface }}>
              {[
                { label: 'Sent', count: rows.filter((r: any) => r.status === 'sent').length, dot: '#3B82F6' },
                { label: 'Submitted', count: rows.filter((r: any) => r.status === 'completed').length, dot: '#22C55E' },
                { label: 'Pending', count: rows.filter((r: any) => r.status === 'pending').length, dot: '#F59E0B' },
                { label: 'Expired', count: rows.filter((r: any) => r.status === 'expired').length, dot: '#EF4444' },
              ].map(({ label, count, dot }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot }} />
                  <span style={{ color: BRAND.textMid, fontWeight: 500 }}>{count} {label}</span>
                </div>
              ))}
            </div>
          )}

          {isLoading ? (
            <div style={{ padding: '56px 24px', textAlign: 'center' }}>
              <div style={{ width: 28, height: 28, border: `3px solid ${BRAND.greenMuted}`, borderTopColor: BRAND.green, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
              <p style={{ fontSize: 13, color: BRAND.textLight, margin: 0 }}>Loading feedback requests…</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: '56px 24px', textAlign: 'center' }}>
              <p style={{ fontSize: 14, color: BRAND.textDark, fontWeight: 600, margin: '0 0 4px' }}>No feedback requests yet</p>
              <p style={{ fontSize: 12, color: BRAND.textLight, margin: 0 }}>Send your first feedback form to get started.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <TH>Recipient</TH>
                    <TH>Project</TH>
                    <TH>Sent</TH>
                    <TH>Expires</TH>
                    <TH>PM Status</TH>
                    <TH>Form Status</TH>
                    <TH right>Actions</TH>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((req: any) => (
                    <tr
                      key={req.id}
                      style={{ borderBottom: `1px solid ${BRAND.border}`, transition: 'background 0.1s', cursor: req.status === 'completed' ? 'pointer' : 'default' }}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = BRAND.surface}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}
                      onClick={() => req.status === 'completed' && setSelectedId(req.id)}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <p style={{ fontSize: 13, color: BRAND.textDark, fontWeight: 500, margin: '0 0 1px' }}>{req.recipientName}</p>
                        <p style={{ fontSize: 11, color: BRAND.textLight, margin: 0 }}>{req.recipientEmail}</p>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <p style={{ fontSize: 12, color: BRAND.textDark, fontWeight: 500, margin: '0 0 1px' }}>
                          {req.projectName ?? `Project #${req.projectId}`}
                        </p>
                        <p style={{ fontSize: 11, color: BRAND.textLight, margin: 0 }}>#{req.projectExtId ?? req.projectId}</p>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: BRAND.textMid, whiteSpace: 'nowrap' }}>
                        {formatDate(req.requestSentAt ?? req.createdAt)}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: BRAND.textMid, whiteSpace: 'nowrap' }}>
                        {formatDate(req.expiresAt)}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <PmStatusBadge status={req.pmApprovalStatus} />
                        {req.pmApprovalStatus === 'rejected' && req.pmRejectionComments && (
                          <div style={{ fontSize: 10, color: '#DC2626', marginTop: 4, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={req.pmRejectionComments}>
                            {req.pmRejectionComments}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <StatusBadge status={req.status} />
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        {/* PM Actions */}
                        {user?.role === 'MANAGER' && req.pmApprovalStatus === 'pending_pm' && (
                          <button
                            onClick={e => { e.stopPropagation(); setPmReviewRequest(req); }}
                            style={{ padding: '5px 12px', background: '#3B82F6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                          >
                            Review Request
                          </button>
                        )}

                        {/* Quality Actions */}
                        {user?.role === 'QUALITY' && req.pmApprovalStatus === 'approved' && req.status === 'draft' && (
                          <button
                            onClick={e => { e.stopPropagation(); setQualityReviewRequest(req); }}
                            style={{ padding: '5px 12px', background: BRAND.green, color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                          >
                            Review & Send
                          </button>
                        )}
                        {user?.role === 'QUALITY' && req.pmApprovalStatus === 'rejected' && (
                          <button
                            onClick={e => { e.stopPropagation(); setEditDraftRequest(req); }}
                            style={{ padding: '5px 12px', background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                          >
                            Edit & Resubmit
                          </button>
                        )}

                        {/* View Response */}
                        {req.status === 'completed' && (
                          <button
                            onClick={e => { e.stopPropagation(); setSelectedId(req.id); }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: BRAND.greenMuted, color: BRAND.green, border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', marginLeft: 8 }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                            </svg>
                            View
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {total > pageSize && (
          <div style={{ marginTop: 16 }}>
            <Pagination total={total} currentPage={page} pageSize={pageSize} onPageChange={setPage} />
          </div>
        )}
      </div>

      {/* Response drawer */}
      <ResponseDrawer requestId={selectedId} onClose={() => setSelectedId(null)} />

      {/* PM Approval Modal */}
      {pmReviewRequest && (
        <PMApprovalModal
          request={pmReviewRequest}
          onClose={() => setPmReviewRequest(null)}
          onSuccess={() => { setPmReviewRequest(null); queryClient.invalidateQueries({ queryKey: ['feedbackRequests'] }); }}
        />
      )}

      {/* Quality Review Modal */}
      {qualityReviewRequest && (
        <QualityReviewModal
          request={qualityReviewRequest}
          onClose={() => setQualityReviewRequest(null)}
          onSuccess={() => { setQualityReviewRequest(null); queryClient.invalidateQueries({ queryKey: ['feedbackRequests'] }); alert('Email sent to customer successfully!'); }}
        />
      )}

      {/* Edit Draft Modal */}
      {editDraftRequest && (
        <EditDraftModal
          request={editDraftRequest}
          onClose={() => setEditDraftRequest(null)}
          onSuccess={() => { setEditDraftRequest(null); queryClient.invalidateQueries({ queryKey: ['feedbackRequests'] }); }}
        />
      )}
    </PageWrapper>
  );
};