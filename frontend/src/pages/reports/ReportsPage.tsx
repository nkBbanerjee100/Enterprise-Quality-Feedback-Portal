/**
 * Reports Page
 */
import React, { useState } from 'react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { ExportButton } from '../../components/common/ExportButton';

export const ReportsPage: React.FC = () => {
  const [selectedCycle, setSelectedCycle] = useState<number | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  const handleExport = async (format: 'csv' | 'xlsx' | 'pdf') => {
    if (!selectedCycle) {
      alert('Please select a CSAT cycle first');
      return;
    }

    setExportLoading(true);
    try {
      // Simulate export
      setTimeout(() => {
        alert(`Exporting as ${format.toUpperCase()}...`);
        setExportLoading(false);
      }, 1000);
    } catch (error) {
      setExportLoading(false);
    }
  };

  return (
    <PageWrapper>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-800">Reports</h1>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Select CSAT Cycle</label>
            <select
              value={selectedCycle || ''}
              onChange={(e) => setSelectedCycle(e.target.value ? parseInt(e.target.value) : null)}
              className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="">Choose a cycle...</option>
              <option value="1">Cycle 1 - Q1 2024</option>
              <option value="2">Cycle 2 - Q2 2024</option>
            </select>
          </div>

          {selectedCycle && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Export Options</h2>
              <ExportButton onExport={handleExport} loading={exportLoading} />
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
};
