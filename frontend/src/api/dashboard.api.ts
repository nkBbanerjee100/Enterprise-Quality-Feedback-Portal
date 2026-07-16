/**
 * Dashboard API endpoints
 */
import { api } from './client';
import { DashboardData } from '../types/dashboard.types';

export const dashboardApi = {
  getMetrics: async (): Promise<DashboardData> => {
    const response = await api.get('/api/dashboard/');
    return response.data;
  },

  getCycleMetrics: async (cycleId: number): Promise<DashboardData> => {
    const response = await api.get(`/api/dashboard/metrics/${cycleId}`);
    return response.data;
  },
};
