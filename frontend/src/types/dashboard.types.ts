/**
 * Dashboard types
 */

export interface DashboardMetrics {
  totalResponses: number;       // total forms sent
  totalSubmitted?: number;      // completed responses
  totalPending?: number;        // awaiting response
  totalExpired?: number;        // expired links
  averageCsatScore?: number;
  averageNpsScore?: number;
  satisfactionRate?: number;
}

export interface DashboardData {
  metrics: DashboardMetrics;
  recentResponses: number;
  pendingRequests: number;
  openActionPlans: number;
}

export interface KPICard {
  title: string;
  value: number | string;
  unit?: string;
  trend?: number;
  icon?: string;
}

export interface TrendDataPoint {
  date: string;
  value: number;
  label?: string;
}

export interface RatingDistribution {
  rating: number;
  count: number;
  percentage: number;
}