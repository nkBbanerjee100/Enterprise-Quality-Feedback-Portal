/**
 * Feedback types
 */

export interface FeedbackRequest {
  id: number;
  csatCycleId: number;
  projectId: number;
  projectExtId?: number;
  projectName?: string;
  recipientEmail: string;
  recipientName: string;
  ccEmails?: string;
  feedbackUrl?: string;
  requestSentAt?: string;
  reminderSentAt?: string;
  status: FeedbackStatus;
  createdAt: string;
  expiresAt?: string;
  periodOfPerformance?: string;
  pmAchievements?: string;
  pmApprovalStatus?: 'pending_pm' | 'approved' | 'rejected';
  pmRejectionComments?: string;
}

export interface FeedbackResponse {
  id: number;
  feedbackRequestId: number;
  csatScore: number;
  npsScore?: number;
  comments?: string;
  submittedAt: string;
}

export enum FeedbackStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  SENT = 'sent',
  COMPLETED = 'completed',
  EXPIRED = 'expired',
}

export interface FeedbackSubmission {
  feedbackRequestId: number;
  csatScore: number;
  npsScore?: number;
  comments?: string;
}

export interface FeedbackFilters {
  csatCycleId?: number;
  projectId?: number;
  status?: FeedbackStatus;
  dateRange?: {
    start: string;
    end: string;
  };
}