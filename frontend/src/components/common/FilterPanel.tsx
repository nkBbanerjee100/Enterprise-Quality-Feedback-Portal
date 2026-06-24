/**
 * Filter Panel component
 */
import React from 'react';

interface FilterPanelProps {
  children: React.ReactNode;
  onReset?: () => void;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({ children, onReset }) => {
  return (
    <div className="mb-6 p-4 bg-white border rounded-lg shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {children}
      </div>
      {onReset && (
        <div className="mt-4">
          <button
            onClick={onReset}
            className="px-4 py-2 text-sm bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
          >
            Reset Filters
          </button>
        </div>
      )}
    </div>
  );
};
