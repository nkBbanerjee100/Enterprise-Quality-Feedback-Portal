/**
 * Feedback Request List Page
 */
import React, { useState } from 'react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { FeedbackTable } from '../../components/feedback/FeedbackTable';
import { useFeedbackRequests } from '../../hooks/useFeedback';
import { Pagination } from '../../components/common/Pagination';

export const FeedbackRequestListPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const { data, isLoading, error } = useFeedbackRequests((page - 1) * pageSize, pageSize);

  if (isLoading) {
    return (
      <PageWrapper>
        <LoadingSpinner text="Loading feedback requests..." />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-800">Feedback Requests</h1>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Create Request
          </button>
        </div>

        {error && (
          <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            Failed to load feedback requests
          </div>
        )}

        <div className="bg-white rounded-lg shadow">
          {data?.data && data.data.length > 0 ? (
            <FeedbackTable feedbacks={data.data} />
          ) : (
            <div className="p-8 text-center text-gray-600">
              No feedback requests yet
            </div>
          )}
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
