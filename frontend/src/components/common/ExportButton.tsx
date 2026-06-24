/**
 * Export Button component
 */
import React from 'react';

interface ExportButtonProps {
  onExport: (format: 'csv' | 'xlsx' | 'pdf') => void;
  loading?: boolean;
}

export const ExportButton: React.FC<ExportButtonProps> = ({ onExport, loading = false }) => {
  return (
    <div className="flex gap-2">
      <button
        onClick={() => onExport('csv')}
        disabled={loading}
        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
      >
        Export CSV
      </button>
      <button
        onClick={() => onExport('xlsx')}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        Export Excel
      </button>
      <button
        onClick={() => onExport('pdf')}
        disabled={loading}
        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
      >
        Export PDF
      </button>
    </div>
  );
};
