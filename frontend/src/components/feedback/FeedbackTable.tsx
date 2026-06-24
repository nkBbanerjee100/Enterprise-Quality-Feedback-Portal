/**
 * Feedback - Feedback Table
 */
import React from 'react';
import { FeedbackRequest } from '../../types/feedback.types';
import { FeedbackStatusBadge } from './FeedbackStatusBadge';
import { formatDate } from '../../utils/formatters';

interface FeedbackTableProps {
  feedbacks: FeedbackRequest[];
  onSelect?: (feedback: FeedbackRequest) => void;
}

export const FeedbackTable: React.FC<FeedbackTableProps> = ({ feedbacks, onSelect }) => {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Email</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Sent Date</th>
            <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700">Actions</th>
          </tr>
        </thead>
        <tbody>
          {feedbacks.map((feedback) => (
            <tr key={feedback.id} className="border-b hover:bg-gray-50">
              <td className="px-4 py-3 text-sm">{feedback.recipientEmail}</td>
              <td className="px-4 py-3 text-sm">{feedback.recipientName}</td>
              <td className="px-4 py-3 text-sm">
                <FeedbackStatusBadge status={feedback.status} />
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {feedback.requestSentAt ? formatDate(feedback.requestSentAt) : 'Not sent'}
              </td>
              <td className="px-4 py-3 text-center">
                {onSelect && (
                  <button
                    onClick={() => onSelect(feedback)}
                    className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    View
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
