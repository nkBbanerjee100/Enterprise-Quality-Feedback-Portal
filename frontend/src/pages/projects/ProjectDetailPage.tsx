/**
 * Project Detail Page — reads single project from TMS
 * PM / DM / Add.PM / Add.DM are clickable → expands a real name+email card
 * sourced from tsms_user via /api/tms/projects/{id}/people
 *
 * Status is derived from end_date (not is_active) — TMS often leaves
 * IsProjectActive=1 even after a project's end date has passed.
 */
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageWrapper }    from '../../components/layout/PageWrapper';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { useProject, useProjectPeople } from '../../hooks/useProjects';
import { PersonDetail }   from '../../api/projects.api';
import { BRAND }          from '../../utils/constants';
import { deriveStatus }   from './ProjectListPage';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

// ── generic row ───────────────────────────────────────────────────────────────

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div style={{
    display: 'flex', alignItems: 'flex-start',
    padding: '12px 0', borderBottom: `1px solid ${BRAND.border}`,
  }}>
    <span style={{
      width: 220, flexShrink: 0, fontSize: 11, fontWeight: 700,
      color: BRAND.textLight, letterSpacing: '0.05em',
      textTransform: 'uppercase', paddingTop: 2,
    }}>{label}</span>
    <span style={{ fontSize: 13, color: BRAND.textDark, flex: 1 }}>{value ?? '—'}</span>
  </div>
);

// ── status badge (derived from end_date) ──────────────────────────────────────

const StatusBadge: React.FC<{ end_date: string | null }> = ({ end_date }) => {
  const status = deriveStatus(end_date);
  const cfg = {
    active:    { label: 'Active',          bg: '#E8F2EC', color: BRAND.green, dot: '#22C55E', border: BRAND.border   },
    completed: { label: 'Completed',       bg: '#F3F4F6', color: '#6B7280',   dot: '#9CA3AF', border: '#D1D5DB'      },
    testing:   { label: 'Testing Purpose', bg: '#EEF2FF', color: '#4338CA',   dot: '#6366F1', border: '#C7D2FE'      },
  }[status];

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 12px', borderRadius: 20,
      fontSize: 12, fontWeight: 600,
      background: cfg.bg, color: cfg.color,
      border: `1.5px solid ${cfg.border}`,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.dot, display: 'inline-block' }} />
      {cfg.label}
    </span>
  );
};

const RiskPill: React.FC<{ risk: string | null }> = ({ risk }) => {
  if (!risk) return <span style={{ color: BRAND.textLight }}>—</span>;
  const map: Record<string, [string, string]> = {
    Green:  ['#DCFCE7', '#15803D'],
    Yellow: ['#FEF9C3', '#A16207'],
    Red:    ['#FEE2E2', '#B91C1C'],
  };
  const [bg, color] = map[risk] ?? ['#F3F4F6', '#6B7280'];
  return (
    <span style={{ padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: bg, color }}>
      {risk}
    </span>
  );
};

// ── Inline person card ────────────────────────────────────────────────────────

const PersonCard: React.FC<{ person: PersonDetail; onClose: () => void }> = ({ person, onClose }) => {
  const fmtDOJ = (iso: string | null) => {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const rows: Array<{ icon: React.ReactNode; label: string; value: string | null }> = [
    {
      icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
      label: 'Email', value: person.email,
    },
    {
      icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>,
      label: 'Level / Grade', value: [person.level, person.grade].filter(Boolean).join(' · ') || null,
    },
    {
      icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
      label: 'Date of Joining', value: fmtDOJ(person.doj),
    },
    {
      icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
      label: 'Reporting Manager', value: person.reporting_mgr,
    },
    {
      icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
      label: 'Delivery Manager', value: person.delivery_mgr,
    },
  ].filter(r => r.value);

  return (
    <div style={{
      marginTop: 8, background: '#F0F7F3',
      border: `1px solid ${BRAND.border}`, borderRadius: 10,
      padding: '16px 18px', position: 'relative',
      boxShadow: '0 2px 8px rgba(26,92,58,0.07)',
    }}>
      <button
        onClick={onClose}
        style={{ position: 'absolute', top: 10, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: BRAND.textLight, fontSize: 15, lineHeight: 1, padding: 2 }}
        title="Close"
      >✕</button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingRight: 28, marginBottom: rows.length > 0 ? 14 : 0 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
          background: person.is_active === false ? '#9CA3AF' : BRAND.green,
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, fontWeight: 700,
        }}>
          {initials(person.full_name)}
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: BRAND.textDark }}>{person.full_name}</span>
            {person.is_active === false && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: '#F3F4F6', color: '#6B7280', border: '1px solid #E5E7EB' }}>Inactive</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 3 }}>
            <span style={{ fontSize: 11, color: BRAND.textLight }}>EmpId: {person.emp_id}</span>
            {person.gender && (
              <span style={{ fontSize: 11, color: BRAND.textLight }}>
                {person.gender === 'M' ? 'Male' : person.gender === 'F' ? 'Female' : person.gender}
              </span>
            )}
          </div>
        </div>
      </div>

      {rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${BRAND.border}`, paddingTop: 12 }}>
          {rows.map(({ icon, label, value }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ color: BRAND.textLight, marginTop: 1, flexShrink: 0 }}>{icon}</span>
              <span style={{ fontSize: 11, color: BRAND.textLight, width: 120, flexShrink: 0 }}>{label}</span>
              {label === 'Email' && value ? (
                <a href={`mailto:${value}`} style={{ fontSize: 12, color: BRAND.green, textDecoration: 'none' }}>{value}</a>
              ) : (
                <span style={{ fontSize: 12, color: BRAND.textDark }}>{value}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Clickable person cell ─────────────────────────────────────────────────────

const PersonCell: React.FC<{
  empId: string | null;
  person: PersonDetail | null | undefined;
  loading: boolean;
}> = ({ empId, person, loading }) => {
  const [open, setOpen] = useState(false);

  if (!empId) return <span style={{ color: BRAND.textLight }}>—</span>;

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
      >
        <span style={{
          fontSize: 13, fontWeight: 600, color: BRAND.green,
          textDecoration: open ? 'none' : 'underline',
          textDecorationStyle: 'dashed', textUnderlineOffset: 3,
        }}>
          {loading ? empId : (person?.full_name ?? empId)}
        </span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke={BRAND.green} strokeWidth="2.5" strokeLinecap="round"
          style={{ transition: 'transform 0.18s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && person && (
        <PersonCard person={person} onClose={() => setOpen(false)} />
      )}

      {open && !loading && !person && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#B45309', padding: '8px 12px', background: '#FFFBEB', borderRadius: 8, border: '1px solid #FDE68A' }}>
          Could not resolve employee details for <strong>{empId}</strong> from TMS — the ID may use a format not yet matched.
        </div>
      )}
    </div>
  );
};

// ── main page ─────────────────────────────────────────────────────────────────

export const ProjectDetailPage: React.FC = () => {
  const { id }    = useParams<{ id: string }>();
  const navigate  = useNavigate();
  const projectId = Number(id);

  const { data: project, isLoading, error } = useProject(projectId);
  const { data: people, isLoading: peopleLoading } = useProjectPeople(projectId);

  // Derive status from end_date — do NOT use project.is_active
  const status = project ? deriveStatus(project.end_date) : null;
  const isCompleted = status === 'completed';

  return (
    <PageWrapper>
      <button
        onClick={() => navigate(-1)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 20, background: 'none', border: 'none', cursor: 'pointer', color: BRAND.textMid, fontSize: 13, fontWeight: 500, padding: 0 }}
      >
        ← Back
      </button>

      {isLoading && <div style={{ padding: 64 }}><LoadingSpinner text="Loading project…" /></div>}

      {error && (
        <div style={{ padding: '14px 18px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, color: '#DC2626', fontSize: 13 }}>
          Project not found in TMS, or the TMS connection is unavailable.
        </div>
      )}

      {project && status && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: BRAND.gold, letterSpacing: '0.10em', textTransform: 'uppercase', margin: '0 0 4px' }}>
                Project Details · TMS #{project.project_id}
              </p>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: BRAND.textDark, margin: '0 0 6px' }}>
                {project.project_name}
              </h1>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <StatusBadge end_date={project.end_date} />
                {project.is_internal && (
                  <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: '#EFF6FF', color: '#1D4ED8', border: '1.5px solid #BFDBFE' }}>
                    Internal
                  </span>
                )}
                <RiskPill risk={project.risk_status} />
              </div>
            </div>
          </div>

          {/* Info grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

            <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${BRAND.border}`, padding: '8px 24px 4px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: BRAND.textMid, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '14px 0 8px' }}>Project Info</p>
              <Row label="Project ID"   value={`#${project.project_id}`} />
              <Row label="Customer ID"  value={project.customer_id ? `#${project.customer_id}` : null} />
              <Row label="Start Date"   value={fmtDate(project.start_date)} />
              <Row label="End Date"     value={fmtDate(project.end_date)} />
              <Row label="Credit Terms" value={project.credit_terms} />
              <Row label="TSAT Value"   value={project.tsat_value != null ? project.tsat_value : null} />
              <div style={{ paddingBottom: 8 }} />
            </div>

            <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${BRAND.border}`, padding: '8px 24px 4px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: BRAND.textMid, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '14px 0 8px' }}>People &amp; Location</p>
              <Row label="Project Manager"  value={<PersonCell empId={project.project_manager_id}  person={people?.project_manager}  loading={peopleLoading} />} />
              <Row label="Add. PM"          value={<PersonCell empId={project.additional_pm_id}    person={people?.additional_pm}    loading={peopleLoading} />} />
              <Row label="Delivery Manager" value={<PersonCell empId={project.delivery_manager_id} person={people?.delivery_manager} loading={peopleLoading} />} />
              <Row label="Add. DM"          value={<PersonCell empId={project.additional_dm_id}    person={people?.additional_dm}    loading={peopleLoading} />} />
              <Row label="Location ID"      value={project.location_id     ? `#${project.location_id}`     : null} />
              <Row label="Sub-Location ID"  value={project.sub_location_id ? `#${project.sub_location_id}` : null} />
              <div style={{ paddingBottom: 8 }} />
            </div>
          </div>

          {/* Compliance */}
          <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${BRAND.border}`, padding: '8px 24px 4px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: BRAND.textMid, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '14px 0 8px' }}>Compliance &amp; Flags</p>
            <Row label="Internal Project"            value={<span style={{ color: project.is_internal ? BRAND.green : BRAND.textLight }}>{project.is_internal ? 'Yes' : 'No'}</span>} />
            <Row label="Customer Approval Required"  value={<span style={{ color: project.is_customer_approval_required ? '#B45309' : BRAND.textLight }}>{project.is_customer_approval_required ? 'Yes' : 'No'}</span>} />
            <Row label="Risk Status"                 value={<RiskPill risk={project.risk_status} />} />
            <div style={{ paddingBottom: 8 }} />
          </div>

          {/* Feedback eligible — only for genuinely completed projects */}
          {isCompleted && (
            <div style={{ background: BRAND.greenMuted, borderRadius: 12, border: `1px dashed ${BRAND.border}`, padding: '28px 24px', textAlign: 'center' }}>
              <p style={{ fontSize: 14, color: BRAND.textMid, margin: '0 0 4px', fontWeight: 600 }}>Feedback Eligible</p>
              <p style={{ fontSize: 12, color: BRAND.textLight, margin: '0 0 16px' }}>
                This project is completed. You can send a CSAT feedback form to the customer.
              </p>
              <button
                onClick={() => navigate(`/feedback/send?project_id=${project.project_id}`)}
                style={{ padding: '9px 22px', background: BRAND.green, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Send Feedback Form →
              </button>
            </div>
          )}

        </div>
      )}
    </PageWrapper>
  );
};