/**
 * Dashboard - KPI Card
 */
import React from 'react';

interface KpiCardProps {
  title: string;
  value: string | number;
  unit?: string;
  trend?: number;
  color?: 'blue' | 'green' | 'red' | 'yellow';
}

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  unit,
  trend,
  color = 'blue',
}) => {
  const colorClasses = {
    blue: 'border-blue-500 bg-blue-50',
    green: 'border-green-500 bg-green-50',
    red: 'border-red-500 bg-red-50',
    yellow: 'border-yellow-500 bg-yellow-50',
  };

  return (
    <div className={`p-6 border-l-4 ${colorClasses[color]} rounded-lg shadow-sm`}>
      <p className="text-gray-600 text-sm font-medium">{title}</p>
      <div className="mt-2">
        <p className="text-3xl font-bold text-gray-800">
          {value}
          {unit && <span className="text-lg ml-1">{unit}</span>}
        </p>
        {trend !== undefined && (
          <p className={`text-sm mt-1 ${trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
            {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </p>
        )}
      </div>
    </div>
  );
};
