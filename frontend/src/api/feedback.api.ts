/**
 * Feedback API endpoints
 * Doc §10.3 - Feedback Request APIs
 * Doc §10.4 - Customer Feedback APIs (public, no auth)
 */
import { api } from './client';
import { FeedbackRequest, FeedbackResponse, FeedbackSubmission } from '../types/feedback.types';

export interface CreateFeedbackRequestPayload {
  projectId: number;
  recipientEmail: string;
  recipientName: string;
  csatCycleId?: number;
  message?: string;
  cc?: string[];
  periodOfPerformance?: string;
  pmAchievements?: string;
}

export const feedbackApi = {
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

  getPublicForm: async (email: string): Promise<any> => {
    const response = await api.get('/api/feedback/public', { params: { email } });
    return response.data;
  },

  submitPublicForm: async (payload: { email: string; data: Record<string, unknown> }): Promise<void> => {
    await api.post('/api/feedback/public/submit', payload);
  },

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

export const sendOtp = async (data: { email: string }): Promise<{ message: string }> => {
  const response = await api.post('/api/auth/send-otp', data);
  return response.data;
};

export const verifyOtp = async (data: { email: string; otp: string }): Promise<{ verified: boolean }> => {
  const response = await api.post('/api/auth/verify-otp', data);
  return response.data;
};
