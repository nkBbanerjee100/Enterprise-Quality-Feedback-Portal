/**
 * Dashboard Page
 */
import React from 'react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { KpiCard } from '../../components/dashboard/KpiCard';
import { TrendChart } from '../../components/dashboard/TrendChart';
import { RatingDistribution } from '../../components/dashboard/RatingDistribution';
import { RedFlagTable } from '../../components/dashboard/RedFlagTable';
import { useDashboard } from '../../hooks/useDashboard';

// ─── Mindteck logo path — adjust if your asset path differs ───────────────────
import mindteckLogo from '../../assets/mindteck-logo.png';

export const DashboardPage: React.FC = () => {
  const { data, isLoading, error } = useDashboard();

  if (isLoading) {
    return (
      <PageWrapper>
        <LoadingSpinner text="Loading dashboard..." />
      </PageWrapper>
    );
  }

  if (error) {
    return (
      <PageWrapper>
        <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          Failed to load dashboard data
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      {/* ── Outer wrapper: page background + decorative circles ───────────── */}
      <div
        className="relative min-h-screen overflow-hidden"
        style={{ backgroundColor: '#f4f6f8' }}
      >
        {/* Decorative circles — mirroring the login page green-panel aesthetic */}
        <div
          className="pointer-events-none absolute"
          style={{
            top: '-120px',
            right: '-120px',
            width: '420px',
            height: '420px',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(26,92,58,0.13) 0%, rgba(26,92,58,0.04) 60%, transparent 100%)',
          }}
        />
        <div
          className="pointer-events-none absolute"
          style={{
            top: '60px',
            right: '80px',
            width: '220px',
            height: '220px',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(155,124,42,0.10) 0%, rgba(155,124,42,0.03) 60%, transparent 100%)',
          }}
        />
        <div
          className="pointer-events-none absolute"
          style={{
            bottom: '80px',
            right: '-60px',
            width: '300px',
            height: '300px',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(26,92,58,0.08) 0%, transparent 70%)',
          }}
        />
        <div
          className="pointer-events-none absolute"
          style={{
            bottom: '-80px',
            left: '-80px',
            width: '360px',
            height: '360px',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(26,92,58,0.06) 0%, transparent 70%)',
          }}
        />

        {/* ── Page-level header: Mindteck logo sits here, outside any card ── */}
        <div className="relative z-10 flex items-center justify-between px-6 pt-6 pb-2">
          <div className="flex items-center gap-3">
            <img
              src={mindteckLogo}
              alt="Mindteck"
              className="h-8 w-auto object-contain"
            />
            <span
              className="text-sm font-medium tracking-wide"
              style={{ color: '#1A5C3A' }}
            >
              Quality Feedback Platform
            </span>
          </div>
          {/* Optionally: breadcrumb / user avatar here */}
        </div>

        {/* ── Dashboard content ─────────────────────────────────────────────── */}
        <div className="relative z-10 space-y-6 px-6 pb-10 pt-4">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: '#1A5C3A' }}>
              Dashboard
            </h1>
            <p className="mt-1 text-gray-500">
              Welcome back! Here's your CSAT overview.
            </p>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="Total Responses"
              value={data?.metrics.totalResponses ?? 0}
              color="blue"
            />
            <KpiCard
              title="Avg CSAT Score"
              value={data?.metrics.averageCsatScore?.toFixed(2) ?? 'N/A'}
              unit="/5"
              color="green"
            />
            <KpiCard
              title="Satisfaction Rate"
              value={((data?.metrics.satisfactionRate ?? 0) * 100).toFixed(1)}
              unit="%"
              trend={5}
              color="yellow"
            />
            <KpiCard
              title="Pending Requests"
              value={data?.pendingRequests ?? 0}
              color="red"
            />
          </div>

          {/* Charts and Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TrendChart
              title="Response Trend (Last 7 Days)"
              data={[
                { date: 'Mon', value: 24 },
                { date: 'Tue', value: 32 },
                { date: 'Wed', value: 28 },
                { date: 'Thu', value: 45 },
                { date: 'Fri', value: 52 },
                { date: 'Sat', value: 31 },
                { date: 'Sun', value: 18 },
              ]}
            />
            <RatingDistribution
              ratings={[
                { rating: 5, count: 45, percentage: 28 },
                { rating: 4, count: 62, percentage: 38 },
                { rating: 3, count: 35, percentage: 21 },
                { rating: 2, count: 15, percentage: 9 },
                { rating: 1, count: 5, percentage: 4 },
              ]}
            />
          </div>

          {/* Red Flags */}
          <RedFlagTable
            redFlags={[
              {
                id: 1,
                title: 'Low CSAT scores in Project A',
                severity: 'high',
                description: 'Average CSAT dropped to 2.5/5',
                dateDetected: '2024-06-14',
              },
              {
                id: 2,
                title: 'Increased response time',
                severity: 'medium',
                description: 'Support tickets averaging 8 hours',
                dateDetected: '2024-06-13',
              },
            ]}
          />
        </div>
      </div>
    </PageWrapper>
  );
};