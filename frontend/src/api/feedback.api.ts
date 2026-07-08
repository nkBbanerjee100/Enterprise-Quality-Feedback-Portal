/**
 * Feedback API endpoints
 * Doc §10.3 — Feedback Request APIs
 * Doc §10.4 — Customer Feedback APIs (public, no auth)
 */
import { api } from './client';
import { FeedbackRequest, FeedbackResponse, FeedbackSubmission } from '../types/feedback.types';

export interface CreateFeedbackRequestPayload {
  projectId:           number;
  recipientEmail:      string;
  recipientName:       string;
  csatCycleId?:        number;   // optional until cycles are wired
  message?:            string;   // personal note to include in the email
  cc?:            string[]; // additional emails CC'd on the feedback request
  periodOfPerformance?: string;
  pmAchievements?:      string;
}

export const feedbackApi = {
  // ── Quality User APIs (authenticated) ──────────────────────────────────────

  listRequests: async (skip = 0, limit = 10): Promise<{ data: FeedbackRequest[]; total: number }> => {
    const response = await api.get('/api/feedback/requests', { params: { skip, limit } });
    return response.data;
  },

  getRequest: async (id: number): Promise<FeedbackRequest> => {
    const response = await api.get(`/api/feedback/requests/${id}`);
    return response.data;
  },

  createRequest: async (payload: CreateFeedbackRequestPayload): Promise<FeedbackRequest> => {
    const response = await api.post('/api/feedback/requests', payload);
    return response.data;
  },

  resendRequest: async (requestId: number): Promise<void> => {
    await api.post(`/api/feedback/requests/${requestId}/resend`);
  },

  cancelRequest: async (requestId: number): Promise<void> => {
    await api.post(`/api/feedback/requests/${requestId}/cancel`);
  },

  // ── Customer APIs (public — token-based, no auth header) ───────────────────

  getPublicForm: async (token: string): Promise<any> => {
    const response = await api.get(`/api/public/feedback/${token}`);
    return response.data;
  },

  submitPublicForm: async (token: string, answers: FeedbackSubmission): Promise<void> => {
    await api.post(`/api/public/feedback/${token}/submit`, answers);
  },

  // ── Legacy / response endpoints ────────────────────────────────────────────

  submitResponse: async (submission: FeedbackSubmission): Promise<FeedbackResponse> => {
    const response = await api.post('/api/feedback/responses', submission);
    return response.data;
  },

  getResponse: async (id: number): Promise<FeedbackResponse> => {
    const response = await api.get(`/api/feedback/responses/${id}`);
    return response.data;
  },

  listResponses: async (skip = 0, limit = 10): Promise<{ data: FeedbackResponse[]; total: number }> => {
    const response = await api.get('/api/feedback/responses', { params: { skip, limit } });
    return response.data;
  },
};