/**
 * Management User Dashboard
 *
 * Default landing page for role: Management_User
 * Shows: high-level KPIs, feedback trends, department breakdown,
 * avg score by month, response rate, export button — all read-only
 * per doc §4 (Management User can: view dashboards, view quality trends,
 * view customer satisfaction summaries, export reports)
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useAuthStore } from '../../store/auth.store';
import { useDashboard } from '../../hooks/useDashboard';
import { useFeedbackRequests, useFeedbackResponses } from '../../hooks/useFeedback';
import { ROUTES, BRAND } from '../../utils/constants';

// ─── Reusable KPI card ────────────────────────────────────────────────────────
const KpiCard: React.FC<{
  label: string; value: string | number; sub?: string; accent?: string;
  trend?: number; iconChar?: string;
}> = ({ label, value, sub, accent = BRAND.green, trend, iconChar }) => (
  <div style={{
    background: '#FFF', border: '1px solid #D4E4DA',
    borderTop: `3px solid ${accent}`, borderRadius: '10px', padding: '20px 22px',
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <p style={{ fontSize: '11px', color: BRAND.textMid, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', margin: 0 }}>
        {label}
      </p>
      {iconChar && <span style={{ fontSize: '18px', color: accent, opacity: 0.6 }}>{iconChar}</span>}
    </div>
    <p style={{ fontSize: '28px', fontWeight: 700, color: BRAND.textDark, marginTop: '10px', lineHeight: 1 }}>
      {value}
    </p>
    {trend !== undefined && (
      <p style={{ fontSize: '12px', color: trend >= 0 ? '#16A34A' : '#DC2626', marginTop: '4px' }}>
        {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% vs last period
      </p>
    )}
    {sub && <p style={{ fontSize: '12px', color: BRAND.textLight, marginTop: '4px' }}>{sub}</p>}
  </div>
);

// ─── Simple bar chart (pure CSS — no recharts needed for skeleton) ─────────────
const BarChart: React.FC<{ title: string; data: { label: string; value: number; max?: number }[] }> = ({ title, data }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ background: '#FFF', border: '1px solid #D4E4DA', borderRadius: '10px', padding: '20px 22px' }}>
      <h3 style={{ fontSize: '13px', fontWeight: 700, color: BRAND.textDark, marginBottom: '18px' }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {data.map(({ label, value }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ width: '90px', fontSize: '11px', color: BRAND.textMid, textAlign: 'right', flexShrink: 0 }}>{label}</span>
            <div style={{ flex: 1, background: BRAND.greenMuted, borderRadius: '4px', overflow: 'hidden', height: '22px' }}>
              <div style={{
                width: `${(value / max) * 100}%`,
                height: '100%',
                background: BRAND.green,
                borderRadius: '4px',
                display: 'flex', alignItems: 'center',
                transition: 'width 0.4s ease',
              }} />
            </div>
            <span style={{ width: '32px', fontSize: '12px', fontWeight: 600, color: BRAND.textDark }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Sparkline (score trend by month — pure CSS dots) ─────────────────────────
const ScoreTrendChart: React.FC<{ title: string; data: { month: string; score: number }[] }> = ({ title, data }) => {
  const max = 5; // CSAT max
  return (
    <div style={{ background: '#FFF', border: '1px solid #D4E4DA', borderRadius: '10px', padding: '20px 22px' }}>
      <h3 style={{ fontSize: '13px', fontWeight: 700, color: BRAND.textDark, marginBottom: '18px' }}>{title}</h3>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', height: '80px' }}>
        {data.map(({ month, score }) => (
          <div key={month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: BRAND.green }}>{score.toFixed(1)}</span>
            <div style={{
              width: '100%',
              height: `${(score / max) * 60}px`,
              background: `linear-gradient(to top, ${BRAND.green}, ${BRAND.greenLight})`,
              borderRadius: '4px 4px 0 0',
              minHeight: '8px',
            }} />
            <span style={{ fontSize: '10px', color: BRAND.textLight }}>{month}</span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: '11px', color: BRAND.textLight, marginTop: '8px' }}>Average CSAT score (1–5 scale)</p>
    </div>
  );
};

// ─── Export button ─────────────────────────────────────────────────────────────
const ExportButton: React.FC<{ onExport: () => void }> = ({ onExport }) => (
  <button
    onClick={onExport}
    style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      padding: '9px 18px', background: BRAND.gold, color: '#FFF',
      border: 'none', borderRadius: '7px',
      fontSize: '13px', fontWeight: 700, cursor: 'pointer',
      letterSpacing: '0.02em',
    }}
  >
    ↓ Export Report
  </button>
);

// ─── Main component ───────────────────────────────────────────────────────────
export const ManagementDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { data: dashData, isLoading } = useDashboard();
  const { data: feedbackData } = useFeedbackRequests(0, 100);

  const allRequests = feedbackData?.data ?? [];
  const submitted   = allRequests.filter(r => ['SUBMITTED', 'completed'].includes(r.status));
  const sent        = allRequests.filter(r => !['ELIGIBLE', 'DRAFT'].includes(r.status));
  const responseRate = sent.length > 0 ? `${Math.round((submitted.length / sent.length) * 100)}%` : '—';
  const avgScore = dashData?.metrics?.averageCsatScore?.toFixed(2) ?? '—';

  // Placeholder trend data — replaced by real API data when backend is ready
  const monthlyScores = [
    { month: 'Jan', score: 3.8 },
    { month: 'Feb', score: 4.1 },
    { month: 'Mar', score: 3.9 },
    { month: 'Apr', score: 4.3 },
    { month: 'May', score: 4.0 },
    { month: 'Jun', score: 4.4 },
  ];

  const deptBreakdown = [
    { label: 'Engineering', value: 42 },
    { label: 'Delivery',    value: 31 },
    { label: 'Consulting',  value: 18 },
    { label: 'Support',     value: 12 },
  ];

  const handleExport = () => navigate(ROUTES.REPORTS);

  return (
    <PageWrapper>
      {/* Page header */}
      <div style={{ marginBottom: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <p style={{ fontSize: '12px', color: BRAND.gold, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4px' }}>
            Management View
          </p>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: BRAND.textDark, margin: 0 }}>
            Quality Overview
          </h1>
          <p style={{ fontSize: '13px', color: BRAND.textMid, marginTop: '4px' }}>
            Customer satisfaction trends and team performance.
          </p>
        </div>
        <ExportButton onExport={handleExport} />
      </div>

      {/* KPI row — doc §12: total completed projects, forms sent, submitted, pending, expired, avg score, response rate, negative count */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
        <KpiCard label="Forms Sent"       value={sent.length}      accent={BRAND.green}  iconChar="✉"  sub="Total dispatched"          />
        <KpiCard label="Submitted"        value={submitted.length} accent="#2563EB"      iconChar="✓"  sub="Responses received"       trend={8} />
        <KpiCard label="Response Rate"    value={responseRate}     accent={BRAND.gold}   iconChar="↑"  sub="Submitted ÷ sent"         />
        <KpiCard label="Avg CSAT Score"   value={avgScore}         accent="#7C3AED"      iconChar="★"  sub="Out of 5.0"               trend={3} />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '28px' }}>
        <ScoreTrendChart title="Avg CSAT Score by Month" data={monthlyScores} />
        <BarChart title="Feedback by Delivery" data={deptBreakdown} />
      </div>

      {/* Summary table — doc §12: sent feedback requests, submitted feedback */}
      <div style={{ background: '#FFF', border: '1px solid #D4E4DA', borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #EEF3F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: BRAND.textDark, margin: 0 }}>Recent Submitted Feedback</h2>
          <button
            onClick={() => navigate(ROUTES.REPORTS)}
            style={{ fontSize: '12px', color: BRAND.green, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Full reports →
          </button>
        </div>

        {isLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: BRAND.textLight, fontSize: '13px' }}>Loading…</div>
        ) : submitted.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <p style={{ fontSize: '14px', color: BRAND.textMid, fontWeight: 500 }}>No submitted feedback yet</p>
            <p style={{ fontSize: '12px', color: BRAND.textLight, marginTop: '4px' }}>Submitted responses will appear here.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: BRAND.surface }}>
                {['Customer', 'Project', 'Submitted', 'CSAT Score'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', fontSize: '11px', fontWeight: 600, color: BRAND.textMid, textAlign: 'left', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {submitted.slice(0, 8).map((req) => (
                <tr key={req.id} style={{ borderTop: '1px solid #EEF3F0' }}>
                  <td style={{ padding: '12px 16px', fontSize: '13px', color: BRAND.textDark, fontWeight: 500 }}>
                    {req.recipientName}
                    <div style={{ fontSize: '11px', color: BRAND.textLight }}>{req.recipientEmail}</div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '12px', color: BRAND.textMid }}>#{req.projectId}</td>
                  <td style={{ padding: '12px 16px', fontSize: '12px', color: BRAND.textMid }}>
                    {req.requestSentAt ? new Date(req.requestSentAt).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {/* Score placeholder — real value comes from fact_feedback_response via reports API */}
                    <span style={{ fontSize: '13px', fontWeight: 700, color: BRAND.green }}>—</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </PageWrapper>
  );
};