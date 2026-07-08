/**
* Send Feedback Page
* Quality User flow: pick project → enter customer details → confirm → send
*
* Steps:
*  1. Search & select a completed TMS project
*  2. Enter customer recipient details
*  3. Preview & confirm
*  4. Success — token created, email sent
*
* Calls: POST /api/feedback/requests
*/
import React, { useState, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { PageWrapper }    from '../../components/layout/PageWrapper';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { useCompletedProjects, useProject } from '../../hooks/useProjects';
import { TMSProject }     from '../../types/project.types';
import { feedbackApi }    from '../../api/feedback.api';
import { csatCyclesApi }  from '../../api/csat-cycles.api';
import { projectStagingApi } from '../../api/project-staging.api';
import { BRAND }          from '../../utils/constants';
 
// ── helpers ───────────────────────────────────────────────────────────────────
 
function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}
 
function isTestingPurpose(end_date: string | null) {
  return !!end_date && new Date(end_date).getFullYear() === 2099;
}

function formatDateToDDMMYYYY(dateStr: string) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}-${month}-${year}`;
  }
  return dateStr;
}
 
// ── step indicator ─────────────────────────────────────────────────────────────
 
const STEPS = ['Select Project', 'Customer Details', 'Review & Send'];
 
const StepBar: React.FC<{ current: number }> = ({ current }) => (
  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32 }}>
    {STEPS.map((label, i) => {
      const done   = i < current;
      const active = i === current;
      return (
        <React.Fragment key={label}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700,
              background: done ? BRAND.green : active ? BRAND.green : '#E5E7EB',
              color:      done || active ? '#fff' : BRAND.textLight,
              border:     active ? `2px solid ${BRAND.greenLight}` : 'none',
              transition: 'all 0.2s',
            }}>
              {done ? '✓' : i + 1}
            </div>
            <span style={{
              fontSize: 11, fontWeight: active ? 700 : 500,
              color: active ? BRAND.green : done ? BRAND.textMid : BRAND.textLight,
              whiteSpace: 'nowrap',
            }}>{label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div style={{
              flex: 1, height: 2, margin: '0 8px', marginBottom: 20,
              background: done ? BRAND.green : '#E5E7EB',
              transition: 'background 0.3s',
            }} />
          )}
        </React.Fragment>
      );
    })}
  </div>
);
 
// ── Step 1: Project picker ─────────────────────────────────────────────────────
 
const ProjectPicker: React.FC<{
  selected: TMSProject | null;
  onSelect: (p: TMSProject) => void;
}> = ({ selected, onSelect }) => {
  const [search, setSearch]   = useState('');
  const [dSearch, setDSearch] = useState('');
  const [pmFilter, setPmFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [page, setPage]       = useState(1);
  const PAGE = 10;
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const { data, isLoading, error } = useCompletedProjects(
    (page - 1) * PAGE, PAGE, dSearch || undefined,
    pmFilter || undefined, yearFilter ? Number(yearFilter) : undefined,
  );

  // Same manager list used elsewhere (e.g. CSAT Cycle's Add Projects modal) —
  // distinct PMs across all TMS projects, independent of this page's own filters.
  const { data: managers } = useQuery({
    queryKey: ['staging-managers'],
    queryFn: () => projectStagingApi.listManagers(),
    staleTime: 5 * 60 * 1000,
  });
  const yearOptions = Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - i);

  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    setPage(1);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDSearch(val), 350);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 13, color: BRAND.textMid, margin: 0 }}>
        Select the completed project you want to send a feedback form for.
      </p>

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 260px', minWidth: 220 }}>
          <span style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: BRAND.textLight, fontSize: 14, pointerEvents: 'none',
          }}>🔍</span>
          <input
            type="text"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search by project name…"
            style={{
              width: '100%', padding: '9px 12px 9px 36px', boxSizing: 'border-box',
              border: `1.5px solid ${BRAND.border}`, borderRadius: 8,
              fontSize: 13, color: BRAND.textDark, outline: 'none',
            }}
          />
        </div>
        <select
          value={pmFilter}
          onChange={e => { setPmFilter(e.target.value); setPage(1); }}
          style={{
            padding: '9px 10px', borderRadius: 8, border: `1.5px solid ${BRAND.border}`,
            fontSize: 13, color: BRAND.textDark, background: '#fff', minWidth: 170,
          }}
        >
          <option value="">All project managers</option>
          {(managers ?? []).map(pm => <option key={pm.emp_id} value={pm.emp_id}>{pm.name}</option>)}
        </select>
        <select
          value={yearFilter}
          onChange={e => { setYearFilter(e.target.value); setPage(1); }}
          style={{
            padding: '9px 10px', borderRadius: 8, border: `1.5px solid ${BRAND.border}`,
            fontSize: 13, color: BRAND.textDark, background: '#fff',
          }}
        >
          <option value="">All years</option>
          {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {(pmFilter || yearFilter) && (
          <button
            onClick={() => { setPmFilter(''); setYearFilter(''); setPage(1); }}
            style={{ fontSize: 12, color: BRAND.textLight, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 2px' }}
          >Clear filters</button>
        )}
      </div>

      {/* List */}
      <div style={{
        border: `1px solid ${BRAND.border}`, borderRadius: 10, overflow: 'hidden',
        background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      }}>
        {isLoading ? (
          <div style={{ padding: 40 }}><LoadingSpinner text="Loading completed projects…" /></div>
        ) : error ? (
          <div style={{ padding: 20, color: '#DC2626', fontSize: 13 }}>
            Could not load projects from TMS.
          </div>
        ) : !data?.projects.length ? (
          <div style={{ padding: 40, textAlign: 'center', color: BRAND.textLight, fontSize: 13 }}>
            {dSearch || pmFilter || yearFilter ? 'No projects match your filters.' : 'No completed projects found in TMS.'}
          </div>
        ) : (
          data.projects.map((p, idx) => {
            const isSel = selected?.project_id === p.project_id;
            const testing = isTestingPurpose(p.end_date);
            return (
              <div
                key={p.project_id}
                onClick={() => onSelect(p)}
                style={{
                  padding: '14px 18px',
                  borderBottom: idx < data.projects.length - 1 ? `1px solid ${BRAND.border}` : 'none',
                  cursor: 'pointer',
                  background: isSel ? BRAND.greenMuted : 'transparent',
                  borderLeft: isSel ? `4px solid ${BRAND.green}` : '4px solid transparent',
                  transition: 'background 0.1s',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = BRAND.surface; }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: BRAND.green }}>
                      #{p.project_id}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.textDark }}>
                      {p.project_name}
                    </span>
                    {testing && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 8px',
                        borderRadius: 20, background: '#EEF2FF', color: '#4338CA',
                        border: '1px solid #C7D2FE',
                      }}>Testing Purpose</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: BRAND.textLight, marginTop: 3 }}>
                    PM: {p.project_manager_name ?? p.project_manager_id ?? '—'} · Ended: {fmtDate(p.end_date)}
                  </div>
                </div>
                {isSel && (
                  <span style={{
                    fontSize: 18, color: BRAND.green, flexShrink: 0,
                  }}>✓</span>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Selected project's PM details — surfaced immediately on selection so
          Quality can confirm who'll be asked to review before moving on. */}
      {selected && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
          background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%', background: BRAND.green,
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700, flexShrink: 0,
          }}>
            {(selected.project_manager_name ?? 'PM').trim().charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Assigned Project Manager
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 600, color: BRAND.textDark }}>
              {selected.project_manager_name ?? 'No PM assigned in TMS'}
            </p>
            {selected.project_manager_email && (
              <p style={{ margin: '1px 0 0', fontSize: 12, color: BRAND.textMid }}>{selected.project_manager_email}</p>
            )}
          </div>
        </div>
      )}

      {/* Pagination */}
      {data && data.total > PAGE && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 12,
              border: `1px solid ${BRAND.border}`, background: '#fff',
              color: page === 1 ? BRAND.textLight : BRAND.textMid,
              cursor: page === 1 ? 'not-allowed' : 'pointer',
            }}
          >← Prev</button>
          <span style={{ fontSize: 12, color: BRAND.textLight }}>
            Page {page} of {Math.ceil(data.total / PAGE)}
          </span>
          <button
            disabled={page >= Math.ceil(data.total / PAGE)}
            onClick={() => setPage(p => p + 1)}
            style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 12,
              border: `1px solid ${BRAND.border}`, background: '#fff',
              color: page >= Math.ceil(data.total / PAGE) ? BRAND.textLight : BRAND.textMid,
              cursor: page >= Math.ceil(data.total / PAGE) ? 'not-allowed' : 'pointer',
            }}
          >Next →</button>
        </div>
      )}
    </div>
  );
};
 
// ── Step 2: Customer details form ──────────────────────────────────────────────
 
interface CustomerForm {
  recipientName:       string;
  recipientEmail:      string;
  message:             string;
  periodStart:         string;
  periodEnd:           string;
  cc:             string;   // comma-separated emails, optional
}
 
const CustomerDetailsStep: React.FC<{
  form: CustomerForm;
  onChange: (f: CustomerForm) => void;
  project: TMSProject;
  cycleDatesFilled?: boolean;
}> = ({ form, onChange, project, cycleDatesFilled }) => {
  const set = (key: keyof CustomerForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange({ ...form, [key]: e.target.value });
 
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', boxSizing: 'border-box',
    border: `1.5px solid ${BRAND.border}`, borderRadius: 8,
    fontSize: 13, color: BRAND.textDark, outline: 'none',
    background: '#fff',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: BRAND.textMid,
    letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: 6,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Selected project recap + assigned PM — shown together here since this
          is the step where Quality is entering the customer's contact info,
          and needs to see at a glance who the form will be routed to for
          review before it goes out. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{
          background: BRAND.greenMuted, border: `1px solid ${BRAND.border}`,
          borderRadius: 8, padding: '12px 16px',
          display: 'flex', gap: 12, alignItems: 'center',
        }}>
          <span style={{ fontSize: 20 }}>📁</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: BRAND.textMid, fontWeight: 600 }}>
              Sending feedback form for:
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.textDark }}>
              #{project.project_id} — {project.project_name}
            </div>
          </div>
        </div>

        <div style={{
          background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8,
          padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center',
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', background: BRAND.green,
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, flexShrink: 0,
          }}>
            {(project.project_manager_name ?? 'PM').trim().charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, color: '#15803D', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Will be reviewed by (PM)
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: BRAND.textDark, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {project.project_manager_name ?? 'No PM assigned in TMS'}
            </div>
            {project.project_manager_email && (
              <div style={{ fontSize: 11, color: BRAND.textMid, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {project.project_manager_email}
              </div>
            )}
          </div>
        </div>
      </div>

      <p style={{ fontSize: 13, color: BRAND.textMid, margin: 0 }}>
        Enter the project details and customer contact for the feedback form.
      </p>

      {/* Project details */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
        <div>
          <label style={labelStyle}>Period of Performance *</label>
          {cycleDatesFilled && (
            <div style={{ marginBottom: 8, padding: '7px 12px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span style={{ fontSize: 11, color: '#2563EB', fontWeight: 600 }}>Auto-filled from CSAT Cycle dates — you may adjust if needed</span>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <span style={{ fontSize: 11, color: BRAND.textMid, display: 'block', marginBottom: 4 }}>From</span>
              <input
                type="date"
                value={form.periodStart}
                onChange={set('periodStart')}
                style={inputStyle}
              />
            </div>
            <div>
              <span style={{ fontSize: 11, color: BRAND.textMid, display: 'block', marginBottom: 4 }}>To</span>
              <input
                type="date"
                value={form.periodEnd}
                onChange={set('periodEnd')}
                style={inputStyle}
              />
            </div>
          </div>
        </div>
      </div>
 
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label style={labelStyle}>Recipient Name *</label>
          <input
            type="text"
            value={form.recipientName}
            onChange={set('recipientName')}
            placeholder="e.g. John Smith"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Recipient Email *</label>
          <input
            type="email"
            value={form.recipientEmail}
            onChange={set('recipientEmail')}
            placeholder="e.g. john@customer.com"
            style={inputStyle}
          />
        </div>
      </div>
 
      <div>
        <label style={labelStyle}>CC (optional)</label>
        <input
          type="text"
          value={form.cc}
          onChange={set('cc')}
          placeholder="comma-separated emails, e.g. jane@company.com, sam@company.com"
          style={inputStyle}
        />
      </div>
 
      <div>
        <label style={labelStyle}>Personal Message (optional)</label>
        <textarea
          value={form.message}
          onChange={set('message')}
          rows={3}
          placeholder="Add a personal note to include in the feedback email…"
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
      </div>
    </div>
  );
};
 
// ── Step 3: Review & confirm ───────────────────────────────────────────────────
 
const ReviewStep: React.FC<{
  project: TMSProject;
  form: CustomerForm;
}> = ({ project, form }) => {
  const Row = ({ label, value }: { label: string; value: string }) => (
    <div style={{
      display: 'flex', padding: '11px 0',
      borderBottom: `1px solid ${BRAND.border}`,
    }}>
      <span style={{
        width: 180, flexShrink: 0, fontSize: 11, fontWeight: 700,
        color: BRAND.textLight, letterSpacing: '0.05em', textTransform: 'uppercase',
      }}>{label}</span>
      <span style={{ fontSize: 13, color: BRAND.textDark }}>{value}</span>
    </div>
  );
 
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <p style={{ fontSize: 13, color: BRAND.textMid, margin: 0 }}>
        Please review the details before sending. The customer will receive a secure feedback link by email.
      </p>
 
      {/* Project card */}
      <div style={{
        background: '#fff', border: `1px solid ${BRAND.border}`,
        borderRadius: 10, padding: '8px 20px 4px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      }}>
        <p style={{
          fontSize: 11, fontWeight: 700, color: BRAND.textMid,
          letterSpacing: '0.08em', textTransform: 'uppercase', margin: '14px 0 8px',
        }}>Project</p>
        <Row label="Project ID"   value={`#${project.project_id}`} />
        <Row label="Project Name" value={project.project_name} />
        <Row label="PM"           value={project.project_manager_id ?? '—'} />
        <Row label="Completed"    value={fmtDate(project.end_date)} />
        <div style={{ paddingBottom: 8 }} />
      </div>
 
      {/* Customer card */}
      <div style={{
        background: '#fff', border: `1px solid ${BRAND.border}`,
        borderRadius: 10, padding: '8px 20px 4px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      }}>
        <p style={{
          fontSize: 11, fontWeight: 700, color: BRAND.textMid,
          letterSpacing: '0.08em', textTransform: 'uppercase', margin: '14px 0 8px',
        }}>Customer Recipient</p>
        <Row label="Name"  value={form.recipientName} />
        <Row label="Email" value={form.recipientEmail} />
        <Row label="Period" value={`${formatDateToDDMMYYYY(form.periodStart)} to ${formatDateToDDMMYYYY(form.periodEnd)}`} />
        {form.cc.trim() && <Row label="CC" value={form.cc} />}
        <Row label="Period" value={`${formatDateToDDMMYYYY(form.periodStart)} to ${formatDateToDDMMYYYY(form.periodEnd)}`} />
        {form.message && <Row label="Message" value={form.message} />}
        <div style={{ paddingBottom: 8 }} />
      </div>
 
      {/* Info banner */}
      <div style={{
        background: '#EFF6FF', border: '1px solid #BFDBFE',
        borderRadius: 8, padding: '12px 16px',
        fontSize: 12, color: '#1D4ED8', lineHeight: 1.6,
      }}>
        ℹ️ This creates a draft only — the project's PM will be notified in-app (never by email) to
        review it and add their team's achievements. Once the PM approves, you'll get a final
        chance to confirm before it's emailed to <strong>{form.recipientEmail}</strong>.
      </div>
    </div>
  );
};
 
// ── Success screen ─────────────────────────────────────────────────────────────
 
const SuccessScreen: React.FC<{
  project: TMSProject;
  recipientEmail: string;
  onSendAnother: () => void;
}> = ({ project, recipientEmail, onSendAnother }) => {
  const navigate = useNavigate();
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: '#DCFCE7', display: 'flex', alignItems: 'center',
        justifyContent: 'center', margin: '0 auto 20px', fontSize: 28,
      }}>✓</div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: BRAND.textDark, margin: '0 0 8px' }}>
        Draft Created!
      </h2>
      <p style={{ fontSize: 13, color: BRAND.textMid, margin: '0 0 4px' }}>
        The project's PM has been notified in-app to review it and add their achievements.
      </p>
      <p style={{ fontSize: 14, fontWeight: 700, color: BRAND.green, margin: '0 0 4px' }}>
        Once approved, you'll confirm sending it to {recipientEmail}
      </p>
      <p style={{ fontSize: 12, color: BRAND.textLight, margin: '0 0 32px' }}>
        for project <strong>{project.project_name}</strong>
      </p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={() => navigate('/feedback')}
          style={{
            padding: '10px 22px', background: BRAND.green, color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >View Feedback Requests</button>
        <button
          onClick={onSendAnother}
          style={{
            padding: '10px 22px', background: '#fff', color: BRAND.textMid,
            border: `1.5px solid ${BRAND.border}`, borderRadius: 8, fontSize: 13,
            fontWeight: 600, cursor: 'pointer',
          }}
        >Send Another</button>
      </div>
    </div>
  );
};
 
// ── Main page ──────────────────────────────────────────────────────────────────
 
export const SendFeedbackPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
 
  // Project can be preselected two ways:
  //  1. ?project_id=X query param (legacy / direct links)
  //  2. navigate('/feedback/send', { state: { cycleId, projectId, enrollmentId } })
  //     — used by the CSAT Cycle detail page's "Send Feedback →" button
  const navState = (location.state ?? {}) as {
    cycleId?: number; projectId?: number; enrollmentId?: number;
  };
  const preselectedId = navState.projectId ?? (Number(searchParams.get('project_id')) || undefined);
  const cycleId        = navState.cycleId ?? 0;
 
  // Where "Back"/"Cancel" should return to. If we arrived from a CSAT Cycle's
  // detail page (state.cycleId present), go back there; otherwise the
  // general Feedback list.
  const returnTo  = navState.cycleId ? `/csat-cycles/${navState.cycleId}` : '/feedback';
  const returnLabel = navState.cycleId ? 'Back to Cycle' : 'Back to Feedback';
 
  // If a project came preselected, the flow starts at step 1 (Customer
  // Details) and the picker (step 0) is skipped — so "Back" from step 1
  // should return to returnTo, not reveal the picker.
  const entryStep = preselectedId !== undefined ? 1 : 0;
 
  const [step, setStep]               = useState(0);
  const [selectedProject, setSelected] = useState<TMSProject | null>(null);
  const [customerForm, setCustomerForm] = useState<CustomerForm>({
    recipientName:            '',
    recipientEmail:           '',
    message:             '',
    periodStart:         '',
    periodEnd:           '',
    cc:                  '',
    periodStart:         '',
    periodEnd:           '',
  });
  const [cycleDatesFilled, setCycleDatesFilled] = useState(false);
  const [sending, setSending]   = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [success, setSuccess]   = useState(false);
 
  // Selecting a project only sets which project the feedback is for — it no
  // longer pre-fills the Customer Recipient fields with the project's PM.
  // Previously this defaulted recipientName/recipientEmail to the PM's own
  // contact info, so unless Quality remembered to overwrite both fields with
  // the actual customer's details, the feedback email was sent straight to
  // the PM instead of the customer. The PM should only ever be notified
  // in-app (handled server-side when the request is created) — never by
  // email, and never as the actual "customer" recipient.
  const applyProjectSelection = (p: TMSProject) => {
    setSelected(p);
  };
 
  // If a project was preselected (via query param or nav state), skip step 1
  // and jump straight to Customer Details once it's loaded.
  const { data: preProject } = useProject(Number(preselectedId));
  React.useEffect(() => {
    if (preProject && !selectedProject) {
      applyProjectSelection(preProject);
      
      let popStart = '';
      let popEnd = '';
      if (preProject.start_date && preProject.end_date) {
        try {
          popStart = new Date(preProject.start_date).toISOString().split('T')[0];
          popEnd = new Date(preProject.end_date).toISOString().split('T')[0];
        } catch (e) {
          // fallback if invalid date
        }
      }
      setCustomerForm(prev => ({ ...prev, periodStart: popStart, periodEnd: popEnd }));
      
      
      let popStart = '';
      let popEnd = '';
      if (preProject.start_date && preProject.end_date) {
        try {
          popStart = new Date(preProject.start_date).toISOString().split('T')[0];
          popEnd = new Date(preProject.end_date).toISOString().split('T')[0];
        } catch (e) {
          // fallback if invalid date
        }
      }
      setCustomerForm(prev => ({ ...prev, periodStart: popStart, periodEnd: popEnd }));
      
      setStep(1);
    }
  }, [preProject, selectedProject]);

  // Auto-fill period of performance from CSAT cycle start/end dates
  const { data: cycleData } = useQuery({
    queryKey: ['csatCycle', cycleId],
    queryFn: () => csatCyclesApi.getById(cycleId),
    enabled: !!cycleId && cycleId > 0,
  });
  React.useEffect(() => {
    if (cycleData && cycleId > 0) {
      try {
        const cycleStart = new Date(cycleData.start_date).toISOString().split('T')[0];
        const cycleEnd   = new Date(cycleData.end_date).toISOString().split('T')[0];
        setCustomerForm(prev => ({ ...prev, periodStart: cycleStart, periodEnd: cycleEnd }));
        setCycleDatesFilled(true);
      } catch (e) {
        // ignore invalid dates
      }
    }
  }, [cycleData, cycleId]);
 
  // Validation per step
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const canNext = () => {
    if (step === 0) return !!selectedProject;
    if (step === 1) {
      const { recipientName, recipientEmail, periodStart, periodEnd } = customerForm;
      return recipientName.trim().length > 0 &&
             /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim()) &&
             periodStart.trim().length > 0 &&
             periodEnd.trim().length > 0;
    }
    return true;
  };
 
  const handleSend = async () => {
    if (!selectedProject) return;
    setSending(true);
    setSendError(null);
    const ccList = customerForm.cc.split(',').map(e => e.trim()).filter(Boolean);
    try {
      await feedbackApi.createRequest({
        projectId:                selectedProject.project_id,
        recipientEmail:           customerForm.recipientEmail.trim(),
        recipientName:            customerForm.recipientName.trim(),
        csatCycleId:              cycleId,   // wired from nav state (CSAT Cycle detail "Send Feedback" button)
        periodOfPerformance: `${formatDateToDDMMYYYY(customerForm.periodStart)} to ${formatDateToDDMMYYYY(customerForm.periodEnd)}`,
        message:             customerForm.message.trim(),
        cc:             ccList.length > 0 ? ccList : undefined,
        periodOfPerformance: `${formatDateToDDMMYYYY(customerForm.periodStart)} to ${formatDateToDDMMYYYY(customerForm.periodEnd)}`,
        message:             customerForm.message.trim(),
      });
      setSuccess(true);
    } catch (err: any) {
      setSendError(
        err?.response?.data?.detail ?? 'Failed to send feedback request. Please try again.'
      );
    } finally {
      setSending(false);
    }
  };
 
  const reset = () => {
    setStep(0);
    setSelected(null);
    setCustomerForm({ recipientName: '', recipientEmail: '', message: '', periodStart: '', periodEnd: '', cc: '', periodStart: '', periodEnd: '' });
    setSendError(null);
    setSuccess(false);
  };
 
  return (
    <PageWrapper>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
 
        {/* Page header */}
        <div style={{ marginBottom: 28 }}>
          <button
            onClick={() => step > entryStep && !success ? setStep(s => s - 1) : navigate(returnTo)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: BRAND.textMid, fontSize: 13, fontWeight: 500,
              padding: 0, marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >← {step > entryStep && !success ? 'Back' : returnLabel}</button>
          <p style={{
            fontSize: 11, fontWeight: 700, color: BRAND.gold,
            letterSpacing: '0.10em', textTransform: 'uppercase', margin: '0 0 4px',
          }}>Quality Feedback Platform</p>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: BRAND.textDark, margin: 0 }}>
            Send Feedback Form
          </h1>
        </div>
 
        {/* Card */}
        <div style={{
          background: '#fff', borderRadius: 12,
          border: `1px solid ${BRAND.border}`,
          boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
          padding: '28px 32px',
        }}>
          {success ? (
            <SuccessScreen
              project={selectedProject!}
              recipientEmail={customerForm.recipientEmail}
              onSendAnother={reset}
            />
          ) : (
            <>
              <StepBar current={step} />
 
              {step === 0 && (
                <ProjectPicker
                  selected={selectedProject}
                  onSelect={p => {
                    applyProjectSelection(p);
                    // Auto-fill period of performance
                    let popStart = '';
                    let popEnd = '';
                    if (p.start_date && p.end_date) {
                      try {
                        popStart = new Date(p.start_date).toISOString().split('T')[0];
                        popEnd = new Date(p.end_date).toISOString().split('T')[0];
                      } catch (e) {}
                    }
                    setCustomerForm(prev => ({ ...prev, periodStart: popStart, periodEnd: popEnd }));
                  }}
                />
              )}
              {step === 1 && (
                <CustomerDetailsStep
                  form={customerForm}
                  onChange={setCustomerForm}
                  project={selectedProject!}
                  cycleDatesFilled={cycleDatesFilled}
                />
              )}
              {step === 2 && (
                <ReviewStep
                  project={selectedProject!}
                  form={customerForm}
                />
              )}
 
              {/* Error */}
              {sendError && (
                <div style={{
                  marginTop: 16, padding: '12px 16px',
                  background: '#FEF2F2', border: '1px solid #FCA5A5',
                  borderRadius: 8, fontSize: 13, color: '#DC2626',
                }}>
                  {sendError}
                </div>
              )}
 
              {/* Footer actions */}
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginTop: 28,
                paddingTop: 20, borderTop: `1px solid ${BRAND.border}`,
              }}>
                <button
                  onClick={() => step > entryStep ? setStep(s => s - 1) : navigate(returnTo)}
                  style={{
                    padding: '10px 20px', background: '#fff',
                    border: `1.5px solid ${BRAND.border}`, borderRadius: 8,
                    fontSize: 13, fontWeight: 600, color: BRAND.textMid, cursor: 'pointer',
                  }}
                >{step === entryStep ? 'Cancel' : '← Back'}</button>
 
                {step < STEPS.length - 1 ? (
                  <button
                    onClick={() => setStep(s => s + 1)}
                    disabled={!canNext()}
                    style={{
                      padding: '10px 24px',
                      background: canNext() ? BRAND.green : '#D1D5DB',
                      color: '#fff', border: 'none', borderRadius: 8,
                      fontSize: 13, fontWeight: 600,
                      cursor: canNext() ? 'pointer' : 'not-allowed',
                      transition: 'background 0.15s',
                    }}
                  >Next →</button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={sending}
                    style={{
                      padding: '10px 28px',
                      background: sending ? BRAND.textLight : BRAND.green,
                      color: '#fff', border: 'none', borderRadius: 8,
                      fontSize: 13, fontWeight: 600,
                      cursor: sending ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}
                  >
                    {sending ? (
                      <>
                        <div style={{
                          width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)',
                          borderTop: '2px solid #fff', borderRadius: '50%',
                          animation: 'spin 0.7s linear infinite',
                        }} />
                        Sending…
                      </>
                    ) : '📝 Create Draft for PM Review'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
 
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </PageWrapper>
  );
};