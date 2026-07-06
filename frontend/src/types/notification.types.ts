/**
 * In-app notification types
 */

export interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  cycle_id?: number;
  project_id?: number;
  enrollment_id?: number;
  link?: string;
  is_read: boolean;
  created_at: string;
  // Live current status of the underlying staged project — only present for
  // type='STAGED_PROJECT_NEEDS_REVIEW'. Source of truth for whether this is
  // still actionable; don't infer that from is_read or client-only state.
  staging_status?: 'eligible' | 'pending_management_review' | 'exempted' | null;
}

export interface NotificationListResponse {
  data: Notification[];
  total: number;
  unread_count: number;
}