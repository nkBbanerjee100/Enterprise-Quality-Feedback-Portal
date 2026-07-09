/**
 * Login activity — Quality-only audit view.
 * Each entry is a user's MOST RECENT login (see users.api.ts / backend for
 * why this isn't a full multi-event history).
 */
export interface LoginActivityEntry {
  emp_id: string;
  name: string;
  role: string;
  last_login_at: string | null;   // ISO datetime, or null if never logged in
}
