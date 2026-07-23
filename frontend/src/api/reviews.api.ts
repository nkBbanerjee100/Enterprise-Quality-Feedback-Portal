/**
 * Reviews API — the unified "Needs Your Review" list for Management.
 * Merges the pre-cycle staging pool and every cycle's addition-approval
 * queue into one list. Acting on an item still goes through its original
 * decide-endpoint (projectStagingApi.decide / csatCyclesApi.approveAddition
 * /declineAddition) — this API only aggregates and counts.
 */
import { api } from './client';

export type PendingReviewSource = 'staging' | 'cycle_addition';
export type PendingReviewActionType = 'exemption' | 'final';

export interface PendingReviewItem {
  source:         PendingReviewSource;
  action_type:    PendingReviewActionType;
  id:             number;          // staging_id (staging) or enrollment_id (cycle_addition)
  cycle_id:       number | null;
  cycle_name:     string | null;
  project_id:     number;
  project_ext_id: string;
  project_name:   string;
  is_active:      boolean;
  requested_by:   string | null;
  requested_at:   string;
  exemption_reason: string | null;
}

export interface PendingReviewsResponse {
  total: number;
  items: PendingReviewItem[];
}

export const reviewsApi = {
  listPending: async (): Promise<PendingReviewsResponse> => {
    const r = await api.get('/api/reviews/pending');
    return r.data;
  },

  pendingCount: async (): Promise<number> => {
    const r = await api.get('/api/reviews/pending/count');
    return r.data.count;
  },
};
