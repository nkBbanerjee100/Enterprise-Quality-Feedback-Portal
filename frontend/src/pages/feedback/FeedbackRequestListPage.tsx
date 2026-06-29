/**
 * Feedback Request List Page — with response viewer drawer
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useFeedbackRequests } from '../../hooks/useFeedback';
import { Pagination } from '../../components/common/Pagination';
import { BRAND, ROUTES } from '../../utils/constants';
import { api } from '../../api/client';

// ── Question labels (matches CustomerSurveyPage question ids) ─────────────────
const QUESTION_LABELS: Record<number, string> = {
  1: 'Overall Satisfaction',
  2: 'Communication & Responsiveness',
  3: 'Quality of Deliverables',
  4: 'Timeline & Delivery',
  5: 'Would Recommend Mindteck',
  6: 'Additional Comments',
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
  pending:   { label: 'Pending',   bg: '#FDF6E3', color: '#9B7C2A', dot: '#F59E0B' },
  sent:      { label: 'Sent',      bg: '#EEF4FF', color: '#2563EB', dot: '#3B82F6' },
  opened:    { label: 'Opened',    bg: '#FDF6E3', color: '#9B7C2A', dot: '#F59E0B' },
  completed: { label: 'Submitted', bg: '#E8F2EC', color: '#1A5C3A', dot: '#22C55E' },
  expired:   { label: 'Expired',   bg: '#FEF2F2', color: '#DC2626', dot: '#EF4444' },
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
        {[1, 2, 3, 4, 5].map(i => (
          <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill={i <= num ? '#F59E0B' : '#E5E7EB'} stroke="none">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        ))}
      </div>
      <span style={{ fontSize: 12, color: BRAND.textMid, fontWeight: 500 }}>{num}/5</span>
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
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
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
          ) : !data?.answers?.length ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <p style={{ fontSize: 13, color: BRAND.textDark, fontWeight: 600 }}>No responses saved</p>
              <p style={{ fontSize: 12, color: BRAND.textLight }}>This request was submitted before response storage was enabled.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {data.answers.map((a: any) => (
                <div key={a.id} style={{ background: BRAND.surface, border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: '14px 16px' }}>
                  <p style={{ fontSize: 11, color: BRAND.textLight, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
                    {QUESTION_LABELS[a.questionId] ?? `Question ${a.questionId}`}
                  </p>
                  {isRatingQuestion(a.questionId) ? (
                    <StarRating value={a.answerValue} />
                  ) : (
                    <p style={{ fontSize: 13, color: BRAND.textDark, margin: 0, lineHeight: 1.6, fontStyle: a.answerValue ? 'normal' : 'italic' }}>
                      {a.answerValue || 'No comment provided'}
                    </p>
                  )}
                </div>
              ))}

              {/* Average score */}
              {(() => {
                const ratingAnswers = data.answers.filter((a: any) => isRatingQuestion(a.questionId) && !isNaN(parseInt(a.answerValue)));
                if (!ratingAnswers.length) return null;
                const avg = ratingAnswers.reduce((s: number, a: any) => s + parseInt(a.answerValue), 0) / ratingAnswers.length;
                return (
                  <div style={{ background: BRAND.green, borderRadius: 10, padding: '14px 16px', color: '#fff' }}>
                    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.7, margin: '0 0 4px' }}>Average CSAT Score</p>
                    <p style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>{avg.toFixed(1)} <span style={{ fontSize: 13, opacity: 0.7 }}>/ 5.0</span></p>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────
export const FeedbackRequestListPage: React.FC = () => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const pageSize = 15;

  const { data, isLoading, error, refetch } = useFeedbackRequests((page - 1) * pageSize, pageSize);

  const rows  = data?.data ?? [];
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
          <button
            onClick={() => navigate(ROUTES.FEEDBACK_SEND)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 18px', background: BRAND.green, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
            Send Feedback Form
          </button>
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
                { label: 'Sent',      count: rows.filter((r: any) => r.status === 'sent').length,      dot: '#3B82F6' },
                { label: 'Submitted', count: rows.filter((r: any) => r.status === 'completed').length,  dot: '#22C55E' },
                { label: 'Pending',   count: rows.filter((r: any) => r.status === 'pending').length,    dot: '#F59E0B' },
                { label: 'Expired',   count: rows.filter((r: any) => r.status === 'expired').length,    dot: '#EF4444' },
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
                    <TH>Status</TH>
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
                        <StatusBadge status={req.status} />
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        {req.status === 'completed' ? (
                          <button
                            onClick={e => { e.stopPropagation(); setSelectedId(req.id); }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: BRAND.greenMuted, color: BRAND.green, border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                            </svg>
                            View Response
                          </button>
                        ) : req.feedbackUrl ? (
                          <a href={req.feedbackUrl} target="_blank" rel="noreferrer" style={{ color: BRAND.textLight, display: 'inline-flex' }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                              <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                            </svg>
                          </a>
                        ) : <span style={{ color: BRAND.textLight, fontSize: 11 }}>—</span>}
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
    </PageWrapper>
  );
};