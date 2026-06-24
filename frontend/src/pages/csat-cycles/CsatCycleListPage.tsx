/**
 * CSAT Cycles List Page
 */
import React, { useState } from 'react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { useQuery } from '@tanstack/react-query';
import { csatCyclesApi } from '../../api/csat-cycles.api';
import { Pagination } from '../../components/common/Pagination';
import { formatDate } from '../../utils/formatters';

export const CsatCycleListPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data, isLoading, error } = useQuery({
    queryKey: ['csatCycles', page],
    queryFn: () => csatCyclesApi.list((page - 1) * pageSize, pageSize),
  });

  if (isLoading) {
    return (
      <PageWrapper>
        <LoadingSpinner text="Loading CSAT cycles..." />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-800">CSAT Cycles</h1>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Create Cycle
          </button>
        </div>

        {error && (
          <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            Failed to load CSAT cycles
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Cycle Name</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Start Date</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">End Date</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.data.map((cycle) => (
                <tr key={cycle.id} className="border-b hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium">{cycle.cycleName}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{formatDate(cycle.startDate)}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{formatDate(cycle.endDate)}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      cycle.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {cycle.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data && (
          <Pagination
            total={data.total}
            currentPage={page}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        )}
      </div>
    </PageWrapper>
  );
};
