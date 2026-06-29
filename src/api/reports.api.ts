/**
 * Reports API endpoints
 */
import { api } from './client';

export interface Report {
  title: string;
  generatedAt: string;
  period: string;
  summary: Record<string, unknown>;
  details: Record<string, unknown>[];
}

export const reportsApi = {
  getSummaryReport: async (cycleId: number): Promise<Report> => {
    const response = await api.get('/api/reports/summary', {
      params: { cycle_id: cycleId },
    });
    return response.data;
  },

  getDetailedReport: async (cycleId: number, projectId?: number): Promise<Report> => {
    const response = await api.get('/api/reports/detailed', {
      params: { cycle_id: cycleId, project_id: projectId },
    });
    return response.data;
  },

  exportReport: async (cycleId: number, format: 'csv' | 'xlsx' | 'pdf'): Promise<Blob> => {
    const response = await api.get('/api/reports/export', {
      params: { cycle_id: cycleId, format },
      responseType: 'blob',
    });
    return response.data;
  },
};
