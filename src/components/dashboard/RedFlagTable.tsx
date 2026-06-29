/**
 * Dashboard - Red Flag Table
 */
import React from 'react';

interface RedFlag {
  id: number;
  title: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  dateDetected: string;
}

interface RedFlagTableProps {
  redFlags: RedFlag[];
}

export const RedFlagTable: React.FC<RedFlagTableProps> = ({ redFlags }) => {
  const severityColor = {
    high: 'text-red-600 bg-red-50',
    medium: 'text-yellow-600 bg-yellow-50',
    low: 'text-blue-600 bg-blue-50',
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm">
      <h3 className="text-lg font-semibold mb-4">Red Flags & Issues</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Title</th>
              <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Severity</th>
              <th className="text-left py-2 px-3 text-sm font-semibold text-gray-700">Date Detected</th>
            </tr>
          </thead>
          <tbody>
            {redFlags.map((flag) => (
              <tr key={flag.id} className="border-b hover:bg-gray-50">
                <td className="py-2 px-3 text-sm">{flag.title}</td>
                <td className="py-2 px-3">
                  <span className={`text-xs px-2 py-1 rounded ${severityColor[flag.severity]}`}>
                    {flag.severity.toUpperCase()}
                  </span>
                </td>
                <td className="py-2 px-3 text-sm text-gray-600">{flag.dateDetected}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
