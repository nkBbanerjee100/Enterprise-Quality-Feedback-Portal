/**
 * Layout — Top Navigation Bar
 * Matches Mindteck brand system (white top bar, green accents)
 * User type: { emp_id, first_name, last_name, email, role, is_active }
 * No displayName field — use first_name + last_name throughout
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';

export const Navbar: React.FC = () => {
  const navigate         = useNavigate();
  const { user, clearAuth } = useAuthStore();

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  // Initials from first_name + last_name
  const initials = user
    ? `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase()
    : '';

  const fullName = user
    ? `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim()
    : '';

  return (
    <nav
      style={{
        background: '#FFFFFF',
        borderBottom: '1px solid #D4E4DA',
        padding: '0 24px',
        height: '56px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}
    >
      {/* Left: empty — each page sets its own heading */}
      <div />

      {/* Right: name + avatar + sign out */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {fullName && (
          <span style={{ fontSize: '13px', color: '#4A6B55', fontWeight: 500 }}>
            {fullName}
          </span>
        )}

        {/* Avatar — solid green circle with initials */}
        <div
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '50%',
            background: '#1A5C3A',
            color: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.03em',
            flexShrink: 0,
            userSelect: 'none',
          }}
        >
          {initials}
        </div>

        <button
          onClick={handleLogout}
          style={{
            padding: '6px 14px',
            fontSize: '12px',
            fontWeight: 600,
            background: 'transparent',
            border: '1px solid #D4E4DA',
            borderRadius: '6px',
            color: '#4A6B55',
            cursor: 'pointer',
            letterSpacing: '0.02em',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            const btn = e.currentTarget as HTMLButtonElement;
            btn.style.background    = '#F7F9F8';
            btn.style.borderColor   = '#1A5C3A';
            btn.style.color         = '#1A5C3A';
          }}
          onMouseLeave={(e) => {
            const btn = e.currentTarget as HTMLButtonElement;
            btn.style.background    = 'transparent';
            btn.style.borderColor   = '#D4E4DA';
            btn.style.color         = '#4A6B55';
          }}
        >
          Sign out
        </button>
      </div>
    </nav>
  );
};