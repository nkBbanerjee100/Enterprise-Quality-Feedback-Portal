/**
 * Dashboard types
 */

export interface DashboardMetrics {
  totalResponses: number;
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
  trend?: number; // percentage change
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
