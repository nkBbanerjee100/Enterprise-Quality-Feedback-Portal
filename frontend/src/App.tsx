/**
 * Root App Component with Routing
 *
 * Role → default landing:
 *   Quality_Admin           → /admin   (future phase)
 *   Quality_User            → /dashboard
 *   Management_User         → /reports
 *   Customer                → /survey/:token  (public, no auth)
 *   System_Integration_User → /dashboard
 *
 * Per doc §5.1:
 *  - On startup call /api/auth/me
 *  - Do not render protected pages before auth state is known
 *  - After login, navigate using defaultRoute from API response (replace: true)
 *  - Implement ProtectedRoute + RoleProtectedRoute
 *  - Prevent wrong-page flash, refresh issues, redirect loops
 */
import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './api/client';

// Home page (public landing)
import { HomePage }         from './pages/home/HomePage';

// Auth pages
import { LoginPage }        from './pages/auth/LoginPage';
//import { ActivateAccountPage } from './pages/auth/ActivateAccountPage';
import { AllowUserPage }    from './pages/auth/AllowUserPage';
import { SelfRegisterPage } from './pages/auth/SelfRegisterPage';
import { UnauthorizedPage } from './pages/auth/UnauthorizedPage';

// Role dashboards
import { QualityUserDashboard } from './pages/dashboard/QualityUserDashboard';
import { ManagementDashboard }  from './pages/reports/ManagementDashboard';

// Shared pages
import { CsatCycleListPage }    from './pages/csat-cycles/CsatCycleListPage';
import { CsatCycleDetailPage }  from './pages/csat-cycles/CsatCycleDetailPage';
import { SelectProjectsPage }   from './pages/csat-cycles/SelectProjectsPage';
import { ProjectListPage }      from './pages/projects/ProjectListPage';
import { ProjectDetailPage }    from './pages/projects/ProjectDetailPage';
import { FeedbackRequestListPage } from './pages/feedback/FeedbackRequestListPage';
import { SendFeedbackPage }     from './pages/feedback/SendFeedbackPage';
import { CustomerSurveyPage }   from './pages/feedback/CustomerSurveyPage';
import { ActionPlanListPage }   from './pages/action-plans/ActionPlanListPage';
import { ActionPlanDetailPage } from './pages/action-plans/ActionPlanDetailPage';
import { ReportsPage }          from './pages/reports/ReportsPage';
import { UserManagementPage }   from './pages/admin/UserManagementPage';
import { AuditLogsPage }        from './pages/admin/AuditLogsPage';

// Guards
import { ProtectedRoute }     from './components/common/ProtectedRoute';
import { RoleProtectedRoute } from './components/common/RoleProtectedRoute';
import { AuthInitializer }    from './components/common/AuthInitializer';
import { UserRole }           from './types/auth.types';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        {/*
          AuthInitializer calls /api/auth/me on startup to rehydrate auth state
          from persisted token before rendering any protected content.
          It renders a loading screen until auth state is resolved.
        */}
        <AuthInitializer>
          <Routes>
            {/* ── Public routes ─────────────────────────────────────────── */}
            <Route path="/login"           element={<LoginPage />} />
            {/* //<Route path="/activate"        element={<ActivateAccountPage />} /> */}
            <Route path="/register-self"   element={<SelfRegisterPage />} />
            <Route path="/unauthorized"    element={<UnauthorizedPage />} />
            <Route path="/survey/:token"   element={<CustomerSurveyPage />} />

            {/* Register — public. Anyone can land here, but the backend only
                lets the registration succeed for emails already allow-listed
                by Quality/Manager via the "Allow User" page/flow. */}
            {/* <Route path="/register-self" element={<RegisterPage />} /> */}

            {/* Allow User (email + role allow-list) — protected, Quality + Manager only */}
            <Route
              path="/allow-user"
              element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={[UserRole.QUALITY, UserRole.MANAGER , UserRole.MANAGEMENT]}>
                    <AllowUserPage />
                  </RoleProtectedRoute>
                </ProtectedRoute>
              }
            />

            {/* ── Quality User & System Integration User ─────────────────── */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <RoleProtectedRoute
                    allowedRoles={[UserRole.QUALITY, UserRole.DELIVERY, UserRole.SALES , UserRole.MANAGER , UserRole.MANAGEMENT]}
                  >
                    <QualityUserDashboard />
                  </RoleProtectedRoute>
                </ProtectedRoute>
              }
            />

            {/* ── Management User ────────────────────────────────────────── */}
            <Route
              path="/reports"
              element={
                <ProtectedRoute>
                  <RoleProtectedRoute
                    allowedRoles={[UserRole.DELIVERY, UserRole.QUALITY , UserRole.SALES , UserRole.MANAGER , UserRole.MANAGEMENT]}
                  >
                    <ManagementDashboard />
                  </RoleProtectedRoute>
                </ProtectedRoute>
              }
            />

            {/* ── Full reports page (same route, deeper content) ─────────── */}
            <Route
              path="/reports/full"
              element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={[UserRole.DELIVERY, UserRole.QUALITY , UserRole.SALES , UserRole.MANAGER , UserRole.MANAGEMENT]}>
                    <ReportsPage />
                  </RoleProtectedRoute>
                </ProtectedRoute>
              }
            />

            {/* ── CSAT Cycles ────────────────────────────────────────────── */}
            <Route
              path="/csat-cycles"
              element={
                <ProtectedRoute>
                   <RoleProtectedRoute allowedRoles={[UserRole.QUALITY, UserRole.MANAGER , UserRole.MANAGEMENT]}>
                  <CsatCycleListPage />
                  </RoleProtectedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/csat-cycles/select-projects"
              element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={[UserRole.QUALITY, UserRole.MANAGEMENT]}>
                    <SelectProjectsPage />
                  </RoleProtectedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/csat-cycles/:id"
              element={
                <ProtectedRoute>
                  <CsatCycleDetailPage />
                </ProtectedRoute>
              }
            />

            {/* ── Projects ───────────────────────────────────────────────── */}
            <Route
              path="/projects"
              element={
                <ProtectedRoute>
                  <ProjectListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:id"
              element={
                <ProtectedRoute>
                  <ProjectDetailPage />
                </ProtectedRoute>
              }
            />

            {/* ── Feedback ───────────────────────────────────────────────── */}
            <Route
              path="/feedback"
              element={
                <ProtectedRoute>
                  <RoleProtectedRoute
                    allowedRoles={[UserRole.QUALITY, UserRole.DELIVERY, UserRole.SALES , UserRole.MANAGER , UserRole.MANAGEMENT]}
                  >
                    <FeedbackRequestListPage />
                  </RoleProtectedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/feedback/send"
              element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={[UserRole.QUALITY, UserRole.DELIVERY, UserRole.SALES , UserRole.MANAGEMENT]}>
                    <SendFeedbackPage />
                  </RoleProtectedRoute>
                </ProtectedRoute>
              }
            />

            {/* ── Action Plans ───────────────────────────────────────────── */}
            <Route
              path="/action-plans"
              element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={[UserRole.QUALITY, UserRole.DELIVERY, UserRole.SALES  ,UserRole.MANAGER , UserRole.MANAGEMENT]}>
                    <ActionPlanListPage />
                  </RoleProtectedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/action-plans/:id"
              element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={[UserRole.QUALITY, UserRole.DELIVERY, UserRole.SALES  ,UserRole.MANAGER , UserRole.MANAGEMENT]}>
                    <ActionPlanDetailPage />
                  </RoleProtectedRoute>
                </ProtectedRoute>
              }
            />

            {/* ── Admin (Quality_Admin only — Phase 2) ───────────────────── */}
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={[UserRole.QUALITY  ,UserRole.MANAGER , UserRole.MANAGEMENT]}>
                    <UserManagementPage />
                  </RoleProtectedRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/audit-logs"
              element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={[UserRole.QUALITY  ,UserRole.MANAGER , UserRole.MANAGEMENT]}>
                    <AuditLogsPage />
                  </RoleProtectedRoute>
                </ProtectedRoute>
              }
            />
            {/* Admin landing — redirect to dashboard until admin page is built */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={[UserRole.QUALITY  ,UserRole.MANAGER , UserRole.MANAGEMENT]}>
                    <QualityUserDashboard />
                  </RoleProtectedRoute>
                </ProtectedRoute>
              }
            />

            {/* ── Default redirects ──────────────────────────────────────── */}
            {/*
              "/" renders the public landing page (HomePage).
              Authenticated users are immediately redirected inside
              HomePage itself via a useEffect, so no flash occurs.
            */}
            <Route path="/"  element={<HomePage />} />
            <Route path="*"  element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AuthInitializer>
      </Router>
    </QueryClientProvider>
  );
}

export default App;