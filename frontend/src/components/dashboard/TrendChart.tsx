/**
 * Dashboard - Trend Chart (placeholder)
 */
import React from 'react';

interface TrendChartProps {
  title: string;
  data: Array<{ date: string; value: number }>;
}

export const TrendChart: React.FC<TrendChartProps> = ({ title, data }) => {
  const maxValue = Math.max(...data.map((d) => d.value));

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <div className="space-y-2">
        {data.map((point) => (
          <div key={point.date} className="flex items-center gap-4">
            <span className="text-sm text-gray-600 w-20">{point.date}</span>
            <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-600 h-full transition-all"
                style={{ width: `${(point.value / maxValue) * 100}%` }}
              />
            </div>
            <span className="text-sm font-medium w-12 text-right">{point.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
