/**
 * Authentication types
 *
 * User shape matches /api/auth/me response (doc §5.1) PLUS the
 * registration fields stored by the backend.
 *
 * Why both displayName AND first_name/last_name?
 *   - displayName  → what /api/auth/me returns in its `user` sub-object
 *   - first_name / last_name → stored at registration, available in the
 *     full user record; needed for the sidebar name display
 *   Both must exist on the type so TypeScript is happy whether the
 *   component uses one or the other.
 */

export interface User {
  // /api/auth/me always returns these
  id:           string;
  email:        string;
  displayName:  string;   // "First Last" composite — safe for any display
  role:         UserRole;

  // Registration fields — also present in the full user record
  emp_id:       string;
  first_name:   string;
  last_name:    string;
  is_active:    boolean;

  // Optional extras from /api/auth/me
  permissions?:  string[];
  defaultRoute?: string;
}

export enum UserRole {
  QUALITY           = 'QUALITY',
  DELIVERY            = 'DELIVERY',
  CUSTOMER                = 'CUSTOMER',
  SALES = 'SALES',
  MANAGER = 'MANAGER',
  MANAGEMENT = 'MANAGEMENT',
}

export interface AuthState {
  user:            User | null;
  accessToken:     string | null;
  refreshToken:    string | null;
  isAuthenticated: boolean;
}

export interface LoginRequest {
  email:    string;
  password: string;
}

export interface TokenResponse {
  access_token:  string;
  refresh_token: string;
  token_type:    string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

/**
 * Raw shape returned by the backend /api/auth/me endpoint (doc §5.1).
 * auth.api.ts maps this into the flat User type above.
 */
export interface MeResponse {
  user: {
    id:          string;
    email:       string;
    displayName: string;
    emp_id?:     string;
    first_name?: string;
    last_name?:  string;
    is_active?:  boolean;
  };
  role:         UserRole;
  permissions:  string[];
  defaultRoute: string;
}