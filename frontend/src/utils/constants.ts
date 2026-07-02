/**
 * Utility constants — aligned with UserRole enum from auth.types.ts
 */

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// User Roles — must match UserRole enum exactly
export const USER_ROLES = {
  QUALITY:            'QUALITY',
  DELIVERY:         'DELIVERY',
  CUSTOMER:                'CUSTOMER',
  SALES: 'SALES',
  MANAGER : 'MANAGER',
} as const;

// Feedback Status — matches doc section 7
export const FEEDBACK_STATUS = {
  ELIGIBLE:        'ELIGIBLE',
  DRAFT:           'DRAFT',
  SENT:            'SENT',
  OPENED:          'OPENED',
  SUBMITTED:       'SUBMITTED',
  EXPIRED:         'EXPIRED',
  REMINDER_SENT:   'REMINDER_SENT',
  CANCELLED:       'CANCELLED',
  FAILED:          'FAILED',
} as const;

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

// CSAT Scores
export const CSAT_SCALE = 5;
export const NPS_SCALE  = 10;

// Routes
export const ROUTES = {
  HOME:               '/',
  LOGIN:              '/login',
  REGISTER:           '/register-self',
  UNAUTHORIZED:       '/unauthorized',

  // Quality User default landing
  DASHBOARD:          '/dashboard',

  // Management User default landing
  REPORTS:            '/reports',

  // Shared
  PROJECTS:           '/projects',
  PROJECT_DETAIL:     '/projects/:id',
  FEEDBACK:           '/feedback',
  FEEDBACK_SEND:      '/feedback/send',
  FEEDBACK_DETAIL:    '/feedback/:id',
  SURVEY:             '/survey/:token',
  ACTION_PLANS:       '/action-plans',
  ACTION_PLAN_DETAIL: '/action-plans/:id',
  CSAT_CYCLES:        '/csat-cycles',
  CSAT_CYCLE_DETAIL:  '/csat-cycles/:id',

  // Admin only
  ADMIN_USERS:        '/admin/users',
  ADMIN_AUDIT_LOGS:   '/admin/audit-logs',
} as const;

// Brand colours (Mindteck design system)
export const BRAND = {
  green:       '#1A5C3A',
  greenLight:  '#2A7A50',
  greenMuted:  '#E8F2EC',
  gold:        '#9B7C2A',
  goldLight:   '#C4A44A',
  goldMuted:   '#FDF6E3',
  white:       '#FFFFFF',
  surface:     '#F7F9F8',
  border:      '#D4E4DA',
  textDark:    '#1A2E22',
  textMid:     '#4A6B55',
  textLight:   '#8FA89A',
} as const;