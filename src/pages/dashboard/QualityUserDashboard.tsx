/**
 * Quality User Dashboard — redesigned
 *
 * Matches the sidebar's deep-green aesthetic with cleaner card hierarchy,
 * better typography, and a more polished layout.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useAuthStore } from '../../store/auth.store';
import { useDashboard } from '../../hooks/useDashboard';
import { useFeedbackRequests } from '../../hooks/useFeedback';
import { useCompletedProjects } from '../../hooks/useProjects';
import { ROUTES, BRAND } from '../../utils/constants';
import { TMSProject } from '../../types/project.types';

// ─── Status badge ─────────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; bg: string; color: string; dot: string }> = {
  ELIGIBLE:      { label: 'Eligible',      bg: '#E8F2EC', color: '#1A5C3A', dot: '#22C55E' },
  DRAFT:         { label: 'Draft',         bg: '#F3F4F6', color: '#6B7280', dot: '#9CA3AF' },
  SENT:          { label: 'Sent',          bg: '#EEF4FF', color: '#2563EB', dot: '#3B82F6' },
  OPENED:        { label: 'Opened',        bg: '#FDF6E3', color: '#9B7C2A', dot: '#F59E0B' },
  SUBMITTED:     { label: 'Submitted',     bg: '#E8F2EC', color: '#1A5C3A', dot: '#22C55E' },
  EXPIRED:       { label: 'Expired',       bg: '#FEF2F2', color: '#DC2626', dot: '#EF4444' },
  REMINDER_SENT: { label: 'Reminder Sent', bg: '#EEF4FF', color: '#2563EB', dot: '#3B82F6' },
  CANCELLED:     { label: 'Cancelled',     bg: '#F3F4F6', color: '#6B7280', dot: '#9CA3AF' },
  FAILED:        { label: 'Failed',        bg: '#FEF2F2', color: '#DC2626', dot: '#EF4444' },
  pending:       { label: 'Pending',       bg: '#FDF6E3', color: '#9B7C2A', dot: '#F59E0B' },
  sent:          { label: 'Sent',          bg: '#EEF4FF', color: '#2563EB', dot: '#3B82F6' },
  completed:     { label: 'Submitted',     bg: '#E8F2EC', color: '#1A5C3A', dot: '#22C55E' },
  expired:       { label: 'Expired',       bg: '#FEF2F2', color: '#DC2626', dot: '#EF4444' },
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const meta = STATUS_META[status] ?? { label: status, bg: '#F3F4F6', color: '#6B7280', dot: '#9CA3AF' };
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '3px 10px',
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 600,
      background: meta.bg,
      color: meta.color,
      letterSpacing: '0.03em',
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.dot, flexShrink: 0 }} />
      {meta.label}
    </span>
  );
};

// ─── KPI card ─────────────────────────────────────────────────────────────────
interface KpiProps {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  icon: React.ReactNode;
}

const KpiCard: React.FC<KpiProps> = ({ label, value, sub, accent = BRAND.green, icon }) => (
  <div style={{
    background: '#fff',
    border: `1px solid ${BRAND.border}`,
    borderRadius: 12,
    padding: '20px 22px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    position: 'relative',
    overflow: 'hidden',
  }}>
    {/* subtle accent stripe on left */}
    <div style={{
      position: 'absolute',
      left: 0, top: 0, bottom: 0,
      width: 3,
      background: accent,
      borderRadius: '12px 0 0 12px',
    }} />
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <p style={{
        fontSize: 11,
        color: BRAND.textLight,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        margin: 0,
      }}>
        {label}
      </p>
      <span style={{
        width: 32, height: 32,
        borderRadius: 8,
        background: `${accent}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: accent,
        flexShrink: 0,
      }}>
        {icon}
      </span>
    </div>
    <p style={{ fontSize: 28, fontWeight: 700, color: BRAND.textDark, margin: 0, lineHeight: 1.1 }}>
      {value}
    </p>
    {sub && (
      <p style={{ fontSize: 11, color: BRAND.textLight, margin: 0 }}>{sub}</p>
    )}
  </div>
);

// ─── SVG icons ────────────────────────────────────────────────────────────────
const Icon = {
  mail: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  ),
  check: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  clock: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  alert: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  ),
  star: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  ),
  trending: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
      <polyline points="17 6 23 6 23 12"/>
    </svg>
  ),
  send: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  ),
  arrowRight: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
      <polyline points="12 5 19 12 12 19"/>
    </svg>
  ),
};

// ─── Empty state ──────────────────────────────────────────────────────────────
const EmptyState: React.FC<{ message: string; sub: string }> = ({ message, sub }) => (
  <div style={{ padding: '44px 24px', textAlign: 'center' }}>
    <div style={{
      width: 44, height: 44, borderRadius: '50%',
      background: BRAND.greenMuted,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      margin: '0 auto 12px',
      color: BRAND.green,
    }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <line x1="9" y1="9" x2="15" y2="9"/>
        <line x1="9" y1="13" x2="13" y2="13"/>
      </svg>
    </div>
    <p style={{ fontSize: 13, color: BRAND.textDark, fontWeight: 600, margin: '0 0 4px' }}>{message}</p>
    <p style={{ fontSize: 12, color: BRAND.textLight, margin: 0 }}>{sub}</p>
  </div>
);

// ─── Table header cell ────────────────────────────────────────────────────────
const TH: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <th style={{
    padding: '10px 16px',
    fontSize: 10,
    fontWeight: 700,
    color: BRAND.textLight,
    textAlign: 'left',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    background: BRAND.surface,
    borderBottom: `1px solid ${BRAND.border}`,
    whiteSpace: 'nowrap',
  }}>
    {children}
  </th>
);

// ─── Card wrapper ─────────────────────────────────────────────────────────────
const Card: React.FC<{
  title: string;
  action?: { label: string; onClick: () => void };
  children: React.ReactNode;
  noPad?: boolean;
}> = ({ title, action, children, noPad }) => (
  <div style={{
    background: '#fff',
    border: `1px solid ${BRAND.border}`,
    borderRadius: 12,
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  }}>
    <div style={{
      padding: '16px 20px',
      borderBottom: `1px solid ${BRAND.border}`,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    }}>
      <h2 style={{ fontSize: 13, fontWeight: 700, color: BRAND.textDark, margin: 0, letterSpacing: '-0.01em' }}>
        {title}
      </h2>
      {action && (
        <button
          onClick={action.onClick}
          style={{
            fontSize: 12,
            color: BRAND.green,
            fontWeight: 600,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            opacity: 0.85,
          }}
        >
          {action.label}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="5" y1="12" x2="19" y2="12"/>
            <polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
      )}
    </div>
    <div style={noPad ? {} : undefined}>{children}</div>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────
export const QualityUserDashboard: React.FC = () => {
  const navigate  = useNavigate();
  const { user }  = useAuthStore();
  const { data: dashData } = useDashboard();
  const { data: feedbackData, isLoading: fbLoading } = useFeedbackRequests(0, 8);
  const { data: projectsData, isLoading: projLoading } = useCompletedProjects(0, 6);

  const feedbackRequests = feedbackData?.data ?? [];
  const projects         = projectsData?.projects ?? [];

  const kpis = {
    // Prefer dashboard API counts (real DB), fall back to client-side filter on local data
    sent:      dashData?.metrics?.totalResponses
               ?? feedbackRequests.length,
    submitted: dashData?.metrics?.totalSubmitted
               ?? feedbackRequests.filter(r => ['SUBMITTED', 'completed'].includes(r.status)).length,
    pending:   dashData?.metrics?.totalPending
               ?? dashData?.pendingRequests
               ?? feedbackRequests.filter(r => ['pending', 'SENT', 'OPENED', 'ELIGIBLE', 'sent', 'opened'].includes(r.status)).length,
    expired:   dashData?.metrics?.totalExpired
               ?? feedbackRequests.filter(r => ['EXPIRED', 'expired'].includes(r.status)).length,
    responseRate: dashData?.metrics?.satisfactionRate != null
      ? `${(dashData.metrics.satisfactionRate * 100).toFixed(0)}%`
      : '—',
    avgScore: dashData?.metrics?.averageCsatScore != null
      ? dashData.metrics.averageCsatScore.toFixed(1)
      : '—',
  };

  const firstName = user?.displayName?.split(' ')[0] ?? 'there';

  return (
    <PageWrapper>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <p style={{
            fontSize: 11, color: BRAND.gold, fontWeight: 700,
            letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 4px',
          }}>
            Quality Feedback Platform
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: BRAND.textDark, margin: '0 0 2px', letterSpacing: '-0.02em' }}>
            Good day, {firstName}
          </h1>
          <p style={{ fontSize: 13, color: BRAND.textLight, margin: 0 }}>
            Here's your feedback activity at a glance.
          </p>
        </div>

        
      </div>

      {/* ── KPI grid ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 14,
        marginBottom: 24,
      }}>
        <KpiCard label="Forms Sent"     value={kpis.sent}         accent={BRAND.green}  icon={Icon.mail}     sub="Total dispatched" />
        <KpiCard label="Submitted"      value={kpis.submitted}    accent="#2563EB"       icon={Icon.check}    sub="Responses received" />
        <KpiCard label="Pending"        value={kpis.pending}      accent={BRAND.gold}    icon={Icon.clock}    sub="Awaiting response" />
        <KpiCard label="Expired"        value={kpis.expired}      accent="#DC2626"       icon={Icon.alert}    sub="Links timed out" />
        <KpiCard label="Avg CSAT Score" value={kpis.avgScore}     accent={BRAND.green}   icon={Icon.star}     sub="Out of 5.0" />
        <KpiCard label="Response Rate"  value={kpis.responseRate} accent="#2563EB"       icon={Icon.trending} sub="Submitted ÷ sent" />
      </div>

      {/* ── Two-column: feedback table + status guide ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 16, marginBottom: 16 }}>

        {/* Feedback requests */}
        <Card
          title="Recent Feedback Requests"
          action={{ label: 'View all', onClick: () => navigate(ROUTES.FEEDBACK) }}
          noPad
        >
          {fbLoading ? (
            <EmptyState message="Loading requests…" sub="" />
          ) : feedbackRequests.length === 0 ? (
            <EmptyState
              message="No feedback requests yet"
              sub="Select a completed project to send your first form."
            />
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <TH>Recipient</TH>
                  <TH>Project</TH>
                  <TH>Sent</TH>
                  <TH>Status</TH>
                </tr>
              </thead>
              <tbody>
                {feedbackRequests.map((req) => (
                  <tr
                    key={req.id}
                    style={{ borderBottom: `1px solid ${BRAND.border}`, cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = BRAND.surface}
                    onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <p style={{ fontSize: 13, color: BRAND.textDark, fontWeight: 500, margin: '0 0 1px' }}>
                        {req.recipientName}
                      </p>
                      <p style={{ fontSize: 11, color: BRAND.textLight, margin: 0 }}>{req.recipientEmail}</p>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: BRAND.textMid }}>
                      #{req.projectId}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: BRAND.textMid, whiteSpace: 'nowrap' }}>
                      {req.requestSentAt ? new Date(req.requestSentAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <StatusBadge status={req.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Right column: quick action + status guide */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Send form card */}
          <div style={{
            background: BRAND.green,
            borderRadius: 12,
            padding: '20px 18px',
            color: '#fff',
            boxShadow: '0 2px 12px rgba(26,92,58,0.2)',
          }}>
            <p style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', opacity: 0.6, margin: '0 0 6px',
            }}>
              Quick Action
            </p>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.01em' }}>
              Send Feedback Form
            </h3>
            <p style={{ fontSize: 12, opacity: 0.75, margin: '0 0 16px', lineHeight: 1.55 }}>
              Pick a completed project and send a secure CSAT link to the customer.
            </p>
            <button
              onClick={() => navigate(ROUTES.FEEDBACK_SEND)}
              style={{
                width: '100%',
                padding: '10px 0',
                background: BRAND.gold,
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                letterSpacing: '-0.01em',
              }}
            >
              {Icon.send} Send Form
            </button>
          </div>

          {/* Status guide */}
          <div style={{
            background: '#fff',
            border: `1px solid ${BRAND.border}`,
            borderRadius: 12,
            padding: '16px 16px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <p style={{
              fontSize: 10, fontWeight: 700, color: BRAND.textLight,
              letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 12px',
            }}>
              Status Guide
            </p>
            {[
              { s: 'ELIGIBLE',  desc: 'Ready to send' },
              { s: 'SENT',      desc: 'Emailed to customer' },
              { s: 'OPENED',    desc: 'Customer opened link' },
              { s: 'SUBMITTED', desc: 'Response received' },
              { s: 'EXPIRED',   desc: 'Link timed out' },
            ].map(({ s, desc }) => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
                <StatusBadge status={s} />
                <span style={{ fontSize: 11, color: BRAND.textLight, textAlign: 'right', maxWidth: 90 }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Completed projects table ── */}
      <Card
        title="All Projects"
        action={{ label: 'View all', onClick: () => navigate(ROUTES.PROJECTS) }}
        noPad
      >
        {projLoading ? (
          <EmptyState message="Loading projects…" sub="" />
        ) : projects.length === 0 ? (
          <EmptyState
            message="No completed projects synced yet"
            sub="Projects sync automatically from TMS."
          />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <TH>Project</TH>
                <TH>Customer</TH>
                <TH>End Date</TH>
                <TH>PM</TH>
                <TH>Current Status</TH>
              </tr>
            </thead>
            <tbody>
              {projects.map((project: TMSProject) => (
                <tr
                  key={project.project_id}
                  style={{ borderBottom: `1px solid ${BRAND.border}`, cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = BRAND.surface}
                  onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ''}
                  onClick={() => navigate(`/projects/${project.project_id}`)}
                >
                  <td style={{ padding: '12px 16px' }}>
                    <p style={{ fontSize: 13, color: BRAND.textDark, fontWeight: 600, margin: '0 0 1px' }}>
                      {project.project_name}
                    </p>
                    <p style={{ fontSize: 11, color: BRAND.textLight, margin: 0 }}>#{project.project_id}</p>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: BRAND.textMid }}>
                    {project.customer_id ? `#${project.customer_id}` : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: BRAND.textMid, whiteSpace: 'nowrap' }}>
                    {project.end_date
                      ? new Date(project.end_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                      : '—'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: BRAND.textMid }}>
                    {project.project_manager_id ?? '—'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <StatusBadge status="ELIGIBLE" />
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <span style={{ color: BRAND.textLight, display: 'flex', justifyContent: 'flex-end' }}>
                      {Icon.arrowRight}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

    </PageWrapper>
  );
};