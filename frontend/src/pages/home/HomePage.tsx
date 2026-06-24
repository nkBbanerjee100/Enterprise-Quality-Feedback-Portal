/**
 * Home Page — Public Landing
 *
 * Shown when an unauthenticated user hits "/".
 * Authenticated users are immediately redirected to their role default route.
 *
 * Design: mirrors the RAPID website layout (hero + blobs, stats strip,
 * feature cards, workflow steps, role cards, CTA band) but uses
 * Mindteck's brand tokens from constants.ts (BRAND.*).
 *
 * No PageWrapper — this is a standalone public page with its own nav.
 */

import React, { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { UserRole } from '../../types/auth.types';
import { BRAND, ROUTES } from '../../utils/constants';
import logo from '../../assets/mindteckLogo.png';

// ─── Role → default route (mirrors useAuth.ts ROLE_REDIRECT) ─────────────────
const ROLE_HOME: Record<UserRole, string> = {
  [UserRole.QUALITY]:           ROUTES.DASHBOARD,
  [UserRole.DELIVERY]:            ROUTES.DASHBOARD,
  [UserRole.MANAGER]:            ROUTES.DASHBOARD,
  [UserRole.SALES]:         ROUTES.REPORTS,
  [UserRole.CUSTOMER]:                ROUTES.UNAUTHORIZED,
};

// ─── Inline style helpers (keeps JSX clean) ──────────────────────────────────
const G = BRAND.green;
const GOLD = BRAND.gold;
const GOLD2 = '#C4A44A';
const TEXT = '#1A2E22';
const MUTED = '#4A6B55';
const LIGHTER = '#8FA89A';
const SURF = BRAND.surface;
const BORDER = BRAND.border;

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Top navigation bar */
const TopNav: React.FC = () => {
  const { isAuthenticated, user } = useAuthStore();
  const navigate = useNavigate();
  const dest = user ? ROLE_HOME[user.role] ?? ROUTES.DASHBOARD : ROUTES.LOGIN;
  const [activeNav, setActiveNav] = React.useState<string | null>(null);

  return (
    <nav style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 40px', height: 80,
      borderBottom: `0.5px solid ${BORDER}`,
      background: '#fff',
      position: 'sticky', top: 0, zIndex: 20,
      boxShadow: '0 1px 3px rgba(26,92,58,0.06)',
    }}>
      {/* Brand */}
      <Link to={ROUTES.HOME ?? '/'} style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
        <img src={logo} alt="Mindteck" style={{ height: 72, width: 'auto', objectFit: 'contain' }} />
        <span style={{
          width: 1, height: 28,
          background: BORDER, display: 'inline-block', flexShrink: 0,
        }} />
        <span style={{ fontSize: 15, fontWeight: 600, color: '#3D3D3D', letterSpacing: '0em' }}>
          Quality Feedback Platform
        </span>
      </Link>

      {/* Nav links */}
      <ul style={{ display: 'flex', gap: 6, listStyle: 'none', margin: 0, padding: 0 }}>
        {[
          { label: 'Features',  href: '#features'  },
          { label: 'Workflow',  href: '#workflow'   },
          { label: 'Roles',     href: '#roles'      },
        ].map(({ label, href }) => {
          const isActive = activeNav === label;
          return (
            <li key={label}>
              <a
                href={href}
                onClick={() => setActiveNav(label)}
                style={{
                  fontSize: 13,
                  color: isActive ? G : MUTED,
                  textDecoration: 'none',
                  fontWeight: isActive ? 600 : 500,
                  padding: '6px 14px',
                  borderRadius: 7,
                  display: 'inline-block',
                  transition: 'all 0.15s',
                  background: isActive
                    ? 'linear-gradient(135deg, rgba(26,92,58,0.10) 0%, rgba(201,168,76,0.10) 100%)'
                    : 'transparent',
                  border: isActive ? `1px solid rgba(26,92,58,0.18)` : '1px solid transparent',
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.color = G;
                    (e.currentTarget as HTMLElement).style.background = 'rgba(26,92,58,0.05)';
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.color = MUTED;
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                  }
                }}
              >{label}</a>
            </li>
          );
        })}
      </ul>

      {/* CTA */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {isAuthenticated ? (
          <button
            onClick={() => navigate(dest)}
            style={{
              padding: '9px 22px', background: G, color: '#fff',
              border: 'none', borderRadius: 8, fontSize: 13,
              fontWeight: 600, cursor: 'pointer',
            }}
          >Go to Dashboard →</button>
        ) : (
          <>
            <Link to={ROUTES.LOGIN} style={{
              fontSize: 13, fontWeight: 500, color: MUTED,
              textDecoration: 'none', padding: '9px 16px',
            }}>Sign in</Link>
            <Link to={ROUTES.REGISTER} style={{
              padding: '9px 20px', background: G, color: '#fff',
              borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none',
            }}>Get started</Link>
          </>
        )}
      </div>
    </nav>
  );
};

/** Hero section */
const HeroSection: React.FC = () => {
  const { isAuthenticated, user } = useAuthStore();
  const navigate = useNavigate();
  const dest = user ? ROLE_HOME[user.role] ?? ROUTES.DASHBOARD : ROUTES.REGISTER;

  return (
    <section style={{
      position: 'relative', overflow: 'hidden',
      padding: '88px 40px 80px',
      minHeight: 520, display: 'flex', alignItems: 'center',
      background: 'linear-gradient(135deg, #EFF7F3 0%, #F2F8F5 40%, #F7F5F0 100%)',
    }}>
      {/* Decorative blobs — right side, mirrors RAPID homepage */}
      <div style={{ position: 'absolute', right: -40, top: -60, width: 520, height: 520, pointerEvents: 'none' }}>
        <div style={{
          position: 'absolute', right: 60, top: 20,
          width: 270, height: 230,
          borderRadius: '60% 40% 50% 70% / 50% 60% 40% 60%',
          background: 'rgba(26,92,58,0.10)',
        }} />
        <div style={{
          position: 'absolute', right: 20, top: 150,
          width: 185, height: 165,
          borderRadius: '40% 60% 70% 30% / 60% 40% 50% 50%',
          background: 'rgba(155,124,42,0.12)',
        }} />
        <div style={{
          position: 'absolute', right: 210, top: 65,
          width: 130, height: 130, borderRadius: '50%',
          background: 'rgba(26,92,58,0.06)',
        }} />
        <div style={{
          position: 'absolute', right: 145, top: 270,
          width: 95, height: 95,
          borderRadius: '30% 70% 50% 50% / 40% 60% 50% 60%',
          background: 'rgba(155,124,42,0.08)',
        }} />
      </div>

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 2, maxWidth: 580 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'rgba(155,124,42,0.10)',
          border: '1px solid rgba(155,124,42,0.28)',
          borderRadius: 20, padding: '4px 12px',
          marginBottom: 24,
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: GOLD2, display: 'inline-block',
          }} />
          <span style={{
            fontSize: 11, fontWeight: 600, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: GOLD,
          }}>Mindteck · Quality Department</span>
        </div>

        <h1 style={{
          fontSize: 50, fontWeight: 700, lineHeight: 1.08,
          color: '#0E3821', margin: '0 0 18px',
          letterSpacing: '-0.03em',
        }}>
          Measure what matters.<br />
          <span style={{ color: GOLD }}>Act on every score.</span>
        </h1>

        <p style={{
          fontSize: 16, lineHeight: 1.7, color: MUTED,
          maxWidth: 460, margin: '0 0 36px',
        }}>
          The enterprise feedback platform built for quality-driven teams.
          Automate survey delivery, track CSAT in real time, and close the loop
          on every completed project.
        </p>

        {/* Feature bullets */}
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 36px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            'Automated survey delivery to customers',
            'Real-time CSAT dashboard & KPIs',
            'Action plan tracking for red-flag projects',
            'Role-based access for your entire team',
            'Exportable reports & audit logs',
          ].map(item => (
            <li key={item} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke={GOLD2} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <span style={{ fontSize: 14, color: MUTED }}>{item}</span>
            </li>
          ))}
        </ul>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate(dest)}
            style={{
              padding: '13px 28px', background: G, color: '#fff',
              border: 'none', borderRadius: 9, fontSize: 14, fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: '0 4px 14px rgba(26,92,58,0.3)',
            }}
          >
            {isAuthenticated ? 'Go to Dashboard' : 'Get started'}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
          <a href="#features" style={{
            padding: '12px 24px', background: 'transparent', color: G,
            border: `1px solid rgba(26,92,58,0.30)`, borderRadius: 9,
            fontSize: 14, fontWeight: 500, textDecoration: 'none',
          }}>Learn more</a>
        </div>
      </div>
    </section>
  );
};

/** Stats strip */
const StatsStrip: React.FC = () => {
  const stats = [
    { value: '100%',       label: 'TMS-integrated projects' },
    { value: 'Real-time',  label: 'CSAT dashboard & KPIs'   },
    { value: '3 roles',    label: 'Role-based access control' },
    { value: 'Full audit', label: 'Status trail & logs'      },
  ];
  return (
    <div style={{
      display: 'flex',
      borderTop: `0.5px solid ${BORDER}`,
      borderBottom: `0.5px solid ${BORDER}`,
      background: '#fff',
    }}>
      {stats.map(({ value, label }, i) => (
        <div key={label} style={{
          flex: 1, padding: '22px 28px', textAlign: 'center',
          borderRight: i < stats.length - 1 ? `0.5px solid ${BORDER}` : 'none',
        }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: G, letterSpacing: '-0.02em' }}>
            {value}
          </div>
          <div style={{ fontSize: 12, color: LIGHTER, marginTop: 4 }}>{label}</div>
        </div>
      ))}
    </div>
  );
};

/** Features grid */
const FeaturesSection: React.FC = () => {
  const features = [
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={G} strokeWidth="2" strokeLinecap="round">
          <path d="M18 20V10M12 20V4M6 20v-6" />
        </svg>
      ),
      title: 'Automated TMS sync',
      desc: 'Completed projects are pulled directly from TMS — no duplicate entry, no stale data. Scheduled and on-demand sync with full validation reports.',
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={G} strokeWidth="2" strokeLinecap="round">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      ),
      title: 'Secure survey delivery',
      desc: 'Tokenized feedback links expire on schedule. Customers receive a branded, context-aware form with the project they recognise.',
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={G} strokeWidth="2" strokeLinecap="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 21V9" />
        </svg>
      ),
      title: 'Real-time CSAT dashboard',
      desc: 'KPI cards, trend charts, and drill-down tables — all filtered server-side from the same source. Export exactly what you see.',
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={G} strokeWidth="2" strokeLinecap="round">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      ),
      title: 'Action plan tracking',
      desc: 'Red-flag projects surface automatically. Negative feedback is visible, traceable, and tied to the responsible team for follow-up.',
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={G} strokeWidth="2" strokeLinecap="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
      title: 'Role-based access control',
      desc: 'Quality , Delivery & Sales ~ Each having their own responsibilites to work on ',
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={G} strokeWidth="2" strokeLinecap="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      ),
      title: 'Exportable reports & audit logs',
      desc: 'Every action is logged with correlation IDs. Exports, sends, reminders, and submissions are fully auditable for compliance.',
    },
  ];

  return (
    <section id="features" style={{ padding: '72px 40px', background: '#fff' }}>
      <div style={{ marginBottom: 12 }}>
        <span style={{
          fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
          fontWeight: 600, color: GOLD,
        }}>Features</span>
      </div>
      <h2 style={{
        fontSize: 30, fontWeight: 700, color: '#0E3821',
        letterSpacing: '-0.02em', margin: '0 0 8px',
      }}>Everything your quality team needs</h2>
      <p style={{ fontSize: 15, color: MUTED, margin: '0 0 44px', maxWidth: 520 }}>
        Built on TMS data, not manual entry. Every feature is designed to improve
        accuracy, speed, and accountability.
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 16,
      }}>
        {features.map(({ icon, title, desc }) => (
          <div key={title} style={{
            background: SURF,
            borderRadius: 12,
            padding: '24px 22px',
            border: `0.5px solid ${BORDER}`,
            transition: 'border-color 0.15s',
          }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = G)}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = BORDER)}
          >
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'rgba(26,92,58,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 16,
            }}>{icon}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 8 }}>{title}</div>
            <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.65, margin: 0 }}>{desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

/** Workflow steps */
const WorkflowSection: React.FC = () => {
  const steps = [
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      ),
      title: 'TMS sync',
      desc: 'Portal fetches completed projects automatically from TMS',
    },
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      ),
      title: 'Review & select',
      desc: 'Quality Department picks a project and confirms customer contact',
    },
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      ),
      title: 'Send form',
      desc: 'Secure, tokenized feedback link is emailed to the customer',
    },
    {
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
      title: 'Track & report',
      desc: 'Responses flow into dashboards, exports, and management views',
    },
  ];

  return (
    <section id="workflow" style={{
      padding: '72px 40px',
      background: SURF,
      borderTop: `0.5px solid ${BORDER}`,
    }}>
      <div style={{ marginBottom: 12 }}>
        <span style={{
          fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
          fontWeight: 600, color: GOLD,
        }}>Workflow</span>
      </div>
      <h2 style={{
        fontSize: 30, fontWeight: 700, color: '#0E3821',
        letterSpacing: '-0.02em', margin: '0 0 8px',
      }}>From project close to insight in four steps</h2>
      <p style={{ fontSize: 15, color: MUTED, margin: '0 0 48px', maxWidth: 520 }}>
        The portal fits naturally into your existing TMS workflow — no changes
        to how projects are closed or managed.
      </p>

      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
        {/* Connector line */}
        <div style={{
          position: 'absolute', top: 24, left: '12.5%', right: '12.5%',
          height: 1, background: `linear-gradient(90deg, ${G}, ${GOLD})`,
          zIndex: 0,
        }} />

        {steps.map(({ icon, title, desc }, i) => (
          <div key={title} style={{ textAlign: 'center', padding: '0 16px', position: 'relative', zIndex: 1 }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: i % 2 === 0 ? G : GOLD,
              color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>{icon}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 6 }}>{title}</div>
            <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.6, margin: 0 }}>{desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

/** Status lifecycle */
const StatusSection: React.FC = () => {
  const statuses: Array<{ label: string; bg: string; color: string; desc: string }> = [
    { label: 'Eligible',      bg: '#E8F2EC', color: G,        desc: 'Project completed in TMS — ready for feedback' },
    { label: 'Sent',          bg: '#EEF4FF', color: '#2563EB', desc: 'Secure feedback link emailed to customer' },
    { label: 'Opened',        bg: '#FDF6E3', color: GOLD,      desc: 'Customer clicked the link' },
    { label: 'Submitted',     bg: '#E8F2EC', color: G,        desc: 'Customer filled and submitted the form' },
    // { label: 'Reminder Sent', bg: '#EEF4FF', color: '#2563EB', desc: 'Follow-up email sent after no response' },
    { label: 'Expired',       bg: '#FEF2F2', color: '#DC2626', desc: 'Link expired — can be resent' },
    { label: 'Cancelled',     bg: '#F5F5F5', color: '#888',    desc: 'Feedback request was manually cancelled' },
  ];

  return (
    <section style={{ padding: '72px 40px', background: '#fff' }}>
      <div style={{ marginBottom: 12 }}>
        <span style={{
          fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
          fontWeight: 600, color: GOLD,
        }}>Status lifecycle</span>
      </div>
      <h2 style={{
        fontSize: 30, fontWeight: 700, color: '#0E3821',
        letterSpacing: '-0.02em', margin: '0 0 8px',
      }}>Track every feedback request end to end</h2>
      <p style={{ fontSize: 15, color: MUTED, margin: '0 0 44px', maxWidth: 520 }}>
        Full visibility into where each form is — from eligible project to
        submitted response. Every status change is logged with a timestamp.
      </p>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 14,
        maxWidth: 900,
      }}>
        {statuses.map(({ label, bg, color, desc }) => (
          <div key={label} style={{
            display: 'flex', flexDirection: 'column', gap: 12,
            padding: '20px 20px 18px',
            background: '#fff', borderRadius: 12,
            border: `0.5px solid ${BORDER}`,
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = color;
              (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 14px ${bg}`;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = BORDER;
              (e.currentTarget as HTMLElement).style.boxShadow = 'none';
            }}
          >
            {/* Top accent bar */}
            <div style={{ height: 3, borderRadius: 2, background: color, opacity: 0.7, marginBottom: 2 }} />
            <span style={{
              padding: '4px 12px', borderRadius: 20, alignSelf: 'flex-start',
              fontSize: 11, fontWeight: 700,
              background: bg, color,
            }}>{label}</span>
            <span style={{ fontSize: 13, color: MUTED, lineHeight: 1.6 }}>{desc}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

/** Role cards */
const RolesSection: React.FC = () => {
  const roles = [
    {
      name: 'Quality Admin',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={G} strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
        </svg>
      ),
      iconBg: 'rgba(26,92,58,0.08)',
      desc: 'Configure templates, manage questions, view all feedback, send and resend forms, export reports, and manage audit logs.',
      can: ['Configure feedback templates', 'Send & resend forms', 'Export reports', 'View audit logs', 'Manage portal settings'],
    },
    {
      name: 'Quality User',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2" strokeLinecap="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
      iconBg: 'rgba(155,124,42,0.10)',
      desc: 'View assigned completed projects, send feedback forms, track pending and submitted responses, and export allowed data.',
      can: ['View completed projects', 'Send feedback forms', 'Track pending responses', 'Export allowed data'],
    },
    {
      name: 'Management',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
      iconBg: 'rgba(37,99,235,0.08)',
      desc: 'Read-only access to dashboards, CSAT trends, satisfaction summaries, and permitted report exports — no operational controls.',
      can: ['View CSAT dashboards', 'View quality trends', 'Customer satisfaction summaries', 'Export reports (permitted)'],
    },
    {
      name: 'Customer',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#B9503C" strokeWidth="2" strokeLinecap="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
      iconBg: 'rgba(185,80,60,0.08)',
      desc: 'Opens a secure, expiring feedback link. Submits ratings and comments once. Receives a confirmation — no login required.',
      can: ['Open secure feedback link', 'Submit ratings & comments', 'Receive confirmation email'],
    },
  ];

  return (
    <section id="roles" style={{
      padding: '72px 40px', background: SURF,
      borderTop: `0.5px solid ${BORDER}`,
    }}>
      <div style={{ marginBottom: 12 }}>
        <span style={{
          fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
          fontWeight: 600, color: GOLD,
        }}>Access</span>
      </div>
      <h2 style={{
        fontSize: 30, fontWeight: 700, color: '#0E3821',
        letterSpacing: '-0.02em', margin: '0 0 8px',
      }}>Built for every stakeholder</h2>
      <p style={{ fontSize: 15, color: MUTED, margin: '0 0 44px', maxWidth: 520 }}>
        Role-based routing means each user lands on the right page, every time —
        with no wrong-page flash or manual redirect.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        {roles.map(({ name, icon, iconBg, desc, can }) => (
          <div key={name} style={{
            background: '#fff', borderRadius: 12, padding: '22px 24px',
            border: `0.5px solid ${BORDER}`,
            display: 'flex', flexDirection: 'column', gap: 14,
            transition: 'border-color 0.15s',
          }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = G)}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = BORDER)}
          >
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <div style={{
                width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                background: iconBg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{icon}</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: TEXT, marginBottom: 4 }}>{name}</div>
                <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, margin: 0 }}>{desc}</p>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {can.map(cap => (
                <span key={cap} style={{
                  fontSize: 11, padding: '3px 10px',
                  background: SURF, color: MUTED,
                  borderRadius: 20, border: `0.5px solid ${BORDER}`,
                }}>{cap}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

/** CTA band */
const CtaBand: React.FC = () => {
  const { isAuthenticated, user } = useAuthStore();
  const navigate = useNavigate();
  const dest = user ? ROLE_HOME[user.role] ?? ROUTES.DASHBOARD : ROUTES.REGISTER;

  return (
    <div style={{
      background: `linear-gradient(135deg, #0E3821 0%, #1A5C3A 60%, #145230 100%)`,
      padding: '68px 40px', textAlign: 'center',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Subtle glow */}
      <div style={{
        position: 'absolute', right: -80, top: -80,
        width: 360, height: 360, borderRadius: '50%',
        background: 'rgba(155,124,42,0.12)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', left: -60, bottom: -60,
        width: 280, height: 280, borderRadius: '50%',
        background: 'rgba(255,255,255,0.04)',
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <h2 style={{
          fontSize: 30, fontWeight: 700, color: '#fff', margin: '0 0 12px',
          letterSpacing: '-0.02em',
        }}>
          Ready to start collecting feedback?
        </h2>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.68)', margin: '0 0 32px' }}>
          Register your employee account and access your role-based workspace in minutes.
        </p>
        <button
          onClick={() => navigate(dest)}
          style={{
            padding: '13px 32px', background: '#fff', color: G,
            border: 'none', borderRadius: 9, fontSize: 14,
            fontWeight: 700, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
          </svg>
          {isAuthenticated ? 'Go to Dashboard' : 'Create your account'}
        </button>
      </div>
    </div>
  );
};

/** Footer */
const Footer: React.FC = () => (
  <footer style={{
    background: '#0E3821', padding: '20px 40px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  }}>
    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', margin: 0 }}>
      © {new Date().getFullYear()} CSAT Tool · Quality Department · Mindteck
    </p>
    <div style={{ display: 'flex', gap: 20 }}>
      <Link to={ROUTES.LOGIN} style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', textDecoration: 'none' }}>
        Sign in
      </Link>
      <Link to={ROUTES.REGISTER} style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', textDecoration: 'none' }}>
        Register
      </Link>
      <a href="https://www.mindteck.com/" target="_blank" rel="noopener noreferrer"
        style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', textDecoration: 'none' }}>
        Visit Mindteck ↗
      </a>
    </div>
  </footer>
);

// ─── Main page ─────────────────────────────────────────────────────────────────

export const HomePage: React.FC = () => {
  const { isAuthenticated, user } = useAuthStore();
  const navigate = useNavigate();

  // Redirect authenticated users straight to their dashboard
  useEffect(() => {
    if (isAuthenticated && user) {
      const dest = ROLE_HOME[user.role] ?? ROUTES.DASHBOARD;
      navigate(dest, { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  // While checking auth, show nothing (AuthInitializer handles the loading screen)
  if (isAuthenticated) return null;

  return (
    <div style={{ minHeight: '100vh', background: '#fff', fontFamily: 'inherit' }}>
      <TopNav />
      <HeroSection />
      <StatsStrip />
      <FeaturesSection />
      <WorkflowSection />
      <StatusSection />
      <RolesSection />
      <CtaBand />
      <Footer />
    </div>
  );
};