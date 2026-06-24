/**
 * RoleProtectedRoute
 *
 * Used inside ProtectedRoute to restrict access by role.
 * Per doc §5.1: do not rely only on frontend role checks —
 * this is defence-in-depth; backend must also enforce RBAC.
 */
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { UserRole } from '../../types/auth.types';

interface RoleProtectedRouteProps {
  children:     React.ReactNode;
  allowedRoles: UserRole[];
}

export const RoleProtectedRoute: React.FC<RoleProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { user, isAuthenticated } = useAuthStore();

  // ProtectedRoute handles the unauthenticated case; this handles wrong role
  if (isAuthenticated && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
};