/**
 * CSAT Cycles API endpoints
 */
import { api } from './client';
import { CSATCycle } from '../types/common.types';

export const csatCyclesApi = {
  list: async (skip: number = 0, limit: number = 10): Promise<{ data: CSATCycle[]; total: number }> => {
    const response = await api.get('/api/csat-cycles', {
      params: { skip, limit },
    });
    return response.data;
  },

  getById: async (id: number): Promise<CSATCycle> => {
    const response = await api.get(`/api/csat-cycles/${id}`);
    return response.data;
  },

  create: async (cycle: Omit<CSATCycle, 'id' | 'createdAt'>): Promise<CSATCycle> => {
    const response = await api.post('/api/csat-cycles', cycle);
    return response.data;
  },

  update: async (id: number, cycle: Partial<CSATCycle>): Promise<CSATCycle> => {
    const response = await api.put(`/api/csat-cycles/${id}`, cycle);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/api/csat-cycles/${id}`);
  },
};
