/**
 * Dashboard - Rating Distribution
 */
import React from 'react';

interface RatingDistributionProps {
  ratings: Array<{ rating: number; count: number; percentage: number }>;
  maxRating?: number;
}

export const RatingDistribution: React.FC<RatingDistributionProps> = ({ ratings, maxRating = 5 }) => {
  return (
    <div className="p-6 bg-white rounded-lg shadow-sm">
      <h3 className="text-lg font-semibold mb-4">Rating Distribution</h3>
      <div className="space-y-3">
        {ratings.map((r) => (
          <div key={r.rating}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">{r.rating} / {maxRating}</span>
              <span className="text-sm text-gray-600">{r.count} responses ({r.percentage.toFixed(1)}%)</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all"
                style={{ width: `${r.percentage}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
