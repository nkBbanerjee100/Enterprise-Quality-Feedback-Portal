/**
 * Custom hook for dashboard data
 */
import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../api/dashboard.api';

export const useDashboard = () => {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => dashboardApi.getMetrics(),
    refetchInterval: 60000, // Refresh every minute
  });
};

export const useCycleMetrics = (cycleId: number) => {
  return useQuery({
    queryKey: ['cycleMetrics', cycleId],
    queryFn: () => dashboardApi.getCycleMetrics(cycleId),
    enabled: !!cycleId,
  });
};
