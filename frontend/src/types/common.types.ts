/**
 * Common types
 */

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  skip: number;
  limit: number;
  pages: number;
}

export interface ApiError {
  statusCode: number;
  detail: string;
  errors?: Record<string, string[]>;
}

export interface PaginationParams {
  skip: number;
  limit: number;
}

export interface CSATCycle {
  id: number;
  cycleName: string;
  cycle_name?: string;
  description?: string;
  startDate: string;
  start_date: string;
  endDate: string;
  end_date: string;
  isActive: boolean;
  is_active: boolean;
  year?: number;
  half?: 'H1' | 'H2';
  createdAt: string;
  created_at: string;
}

export interface ActionPlan {
  id: number;
  feedbackResponseId: number;
  title: string;
  description: string;
  rootCause?: string;
  proposedAction?: string;
  owner: number;
  targetCompletionDate?: string;
  status: ActionPlanStatus;
  isClosed: boolean;
  closedAt?: string;
  createdAt: string;
}

export enum ActionPlanStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  CLOSED = 'closed',
}
