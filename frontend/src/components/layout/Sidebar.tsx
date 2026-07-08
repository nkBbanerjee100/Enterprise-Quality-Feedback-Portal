/**
 * Layout — Sidebar Navigation
 * Branded to Mindteck design system: deep green #1A5C3A, gold #9B7C2A
 * User type: { emp_id, first_name, last_name, email, role, is_active }
 * No displayName field — use first_name + last_name throughout
 */
import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/auth.store';
import { UserRole } from '../../types/auth.types';
import { ROUTES } from '../../utils/constants';
import logo from '../../assets/mindteckLogo.png';
import { BRAND } from '../../utils/constants';
import { reviewsApi } from '../../api/reviews.api';


interface NavItem {
  label: string;
  path:  string;
  icon:  string;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    path:  ROUTES.DASHBOARD,
    icon:  '▦',
    roles: [UserRole.QUALITY, UserRole.DELIVERY, UserRole.SALES , UserRole.MANAGER , UserRole.MANAGEMENT],
  },
  {
    label: 'Projects',
    path:  ROUTES.PROJECTS,
    icon:  '◫',
    roles: [UserRole.QUALITY, UserRole.DELIVERY, UserRole.SALES , UserRole.MANAGER , UserRole.MANAGEMENT],

  },
  {
    label: 'Feedback',
    path:  ROUTES.FEEDBACK,
    icon:  '✉',
    roles: [UserRole.QUALITY, UserRole.DELIVERY, UserRole.SALES , UserRole.MANAGER , UserRole.MANAGEMENT],
  },
  {
    label: 'CSAT Cycles',
    path:  ROUTES.CSAT_CYCLES,
    icon:  '↺',
        roles: [UserRole.QUALITY, UserRole.DELIVERY, UserRole.SALES , UserRole.MANAGER , UserRole.MANAGEMENT],

  },
  {
    label: 'Needs Your Review',
    path:  ROUTES.REVIEWS,
    icon:  '⚑',
    roles: [UserRole.MANAGEMENT],
  },
  {
    label: 'Reports',
    path:  ROUTES.REPORTS,
    icon:  '⬛',
    roles: [UserRole.QUALITY, UserRole.DELIVERY, UserRole.SALES , UserRole.MANAGER , UserRole.MANAGEMENT],
  },
  
  {
    label: 'Audit Logs',
    path:  ROUTES.ADMIN_AUDIT_LOGS,
    icon:  '☰',
    roles: [UserRole.QUALITY  ,UserRole.MANAGER , UserRole.MANAGEMENT],
  },
  {
    label: 'Allow User',
    path:  '/allow-user',
    icon:  '✓',
    roles: [UserRole.QUALITY, UserRole.MANAGER , UserRole.MANAGEMENT],
  },
];

const ROLE_LABEL: Record<UserRole, string> = {
  [UserRole.QUALITY]:           'QUALITY',
  [UserRole.DELIVERY]:            'DELIVERY',
  [UserRole.MANAGER ]:            'MANAGER',
  [UserRole.MANAGEMENT]:            'MANAGEMENT',
  [UserRole.SALES]:         'SALES',
  [UserRole.CUSTOMER]:                'CUSTOMER',
};

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const visibleItems = NAV_ITEMS.filter(
    (item) => user && item.roles.includes(user.role)
  );

  // Only Management ever sees the Needs Your Review nav item, so only
  // Management fetches this — avoids an extra request for every other role.
  const { data: pendingCount } = useQuery({
    queryKey: ['pendingReviewsCount'],
    queryFn: () => reviewsApi.pendingCount(),
    enabled: user?.role === UserRole.MANAGEMENT,
    refetchInterval: 60_000,
  });

  const isActive = (path: string) =>
    location.pathname === path ||
    (path !== '/' && location.pathname.startsWith(path));

  const fullName = user
    ? `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim()
    : '';

  return (
    <aside
      style={{
        background: '#1A5C3A',
        minHeight: '100vh',
        width: '240px',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      {/* ── Logo area ── */}
      <div
        style={{
          padding: '20px 16px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.12)',
        }}
      >
        {/* White frosted card holding the logo — matches the SS */}
       <img
  src={logo}
  alt="Mindteck"
  style={{
    height: '72px',
    width: 'auto',
    objectFit: 'contain',
    display: 'block',
  }}
/>

        <p
          style={{
            color: 'rgba(255,255,255,0.50)',
            fontSize: '10px',
            marginTop: '10px',
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            fontWeight: 500,
          }}
        >
          Quality Feedback Platform
        </p>
      </div>

      {/* ── Role badge + name ── */}
      {user && (
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {/* Gold pill badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              background: 'rgba(155,124,42,0.22)',
              border: '1px solid rgba(155,124,42,0.45)',
              borderRadius: '20px',
              padding: '3px 10px',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#C4A44A',
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            <span
              style={{
                color: '#C4A44A',
                fontSize: '10.5px',
                fontWeight: 600,
                letterSpacing: '0.04em',
              }}
            >
              {ROLE_LABEL[user.role] ?? user.role}
            </span>
          </div>

          {/* Full name under badge */}
          <p
            style={{
              color: 'rgba(255,255,255,0.70)',
              fontSize: '12px',
              marginTop: '6px',
              fontWeight: 500,
            }}
          >
            {fullName}
          </p>
        </div>
      )}

      {/* ── Nav items ── */}
      <nav style={{ flex: 1, padding: '10px 0' }}>
        {visibleItems.map((item) => {
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 18px',
                margin: '1px 8px',
                borderRadius: '8px',
                textDecoration: 'none',
                fontSize: '13px',
                fontWeight: active ? 600 : 400,
                color: active ? '#FFFFFF' : 'rgba(255,255,255,0.62)',
                background: active ? 'rgba(255,255,255,0.13)' : 'transparent',
                borderLeft: active ? '3px solid #9B7C2A' : '3px solid transparent',
                transition: 'background 0.12s ease, color 0.12s ease',
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.07)';
                  (e.currentTarget as HTMLAnchorElement).style.color      = '#FFFFFF';
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
                  (e.currentTarget as HTMLAnchorElement).style.color      = 'rgba(255,255,255,0.62)';
                }
              }}
            >
              <span
                style={{
                  fontSize: '13px',
                  width: '18px',
                  textAlign: 'center',
                  opacity: active ? 1 : 0.65,
                  flexShrink: 0,
                }}
              >
                {item.icon}
              </span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.path === ROUTES.REVIEWS && !!pendingCount && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#fff',
                    background: '#DC2626',
                    borderRadius: '10px',
                    padding: '1px 7px',
                    flexShrink: 0,
                  }}
                >
                  {pendingCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      {/* Promo card — bottom of sidebar */}
<div style={{
  margin: '16px 12px',
  background: 'linear-gradient(135deg, #1A5C3A 0%, #0D3B26 100%)',
  borderRadius: 12,
  padding: '18px 16px',
  color: '#fff',
  position: 'relative',
  overflow: 'hidden',
}}>
  {/* decorative circles */}
  <div style={{
    position: 'absolute', right: -20, top: -20,
    width: 80, height: 80, borderRadius: '50%',
    background: 'rgba(201,168,76,0.15)',
  }} />
  <div style={{
    position: 'absolute', right: 10, bottom: -30,
    width: 60, height: 60, borderRadius: '50%',
    background: 'rgba(201,168,76,0.10)',
  }} />

  <p style={{
    fontSize: 13, fontWeight: 700,
    lineHeight: 1.4, margin: '0 0 4px',
    position: 'relative',
  }}>
    Insights that drive{' '}
    <span style={{ color: BRAND.gold }}>quality outcomes.</span>
  </p>
  <p style={{
    fontSize: 11, opacity: 0.7,
    lineHeight: 1.5, margin: 0,
    position: 'relative',
  }}>
    Collect feedback. Track trends.<br />Drive excellence.
  </p>

  {/* mini chart illustration */}
  <div style={{ marginTop: 14, position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 4, height: 36 }}>
    {[40, 65, 50, 80, 60, 90].map((h, i) => (
      <div key={i} style={{
        flex: 1, height: `${h}%`,
        background: i === 5 ? BRAND.gold : 'rgba(201,168,76,0.4)',
        borderRadius: 3,
      }} />
    ))}
    {/* pie circle */}
    <div style={{
      width: 32, height: 32,
      borderRadius: '50%',
      background: 'conic-gradient(#C9A84C 0% 65%, rgba(255,255,255,0.2) 65% 100%)',
      marginLeft: 6,
      flexShrink: 0,
    }} />
    {/* plus icon */}
    <span style={{ fontSize: 16, color: BRAND.gold, marginLeft: 4, lineHeight: 1 }}>+</span>
  </div>

  <button
    onClick={() => navigate(ROUTES.REPORTS)}
    style={{
      marginTop: 16,
      width: '100%',
      background: 'rgba(255,255,255,0.1)',
      border: '1px solid rgba(255,255,255,0.18)',
      borderRadius: 8,
      padding: '9px 0',
      color: '#fff',
      fontSize: 12.5,
      fontWeight: 600,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      position: 'relative',
    }}
  >
    View Analytics <span style={{ fontSize: 13 }}>↗</span>
  </button>
</div>

      {/* ── Footer ── */}
      <div
        style={{
          padding: '14px 16px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <p style={{ color: 'rgba(255,255,255,0.28)', fontSize: '10.5px', margin: 0 }}>
          © {new Date().getFullYear()} CSAT Tool · Quality Dept
        </p>
      </div>
    </aside>
  );
};