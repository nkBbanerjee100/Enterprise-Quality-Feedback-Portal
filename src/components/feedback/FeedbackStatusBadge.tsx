/**
 * Feedback - Status Badge
 */
import React from 'react';
import { FeedbackStatus } from '../../types/feedback.types';

interface FeedbackStatusBadgeProps {
  status: FeedbackStatus | string;
}

export const FeedbackStatusBadge: React.FC<FeedbackStatusBadgeProps> = ({ status }) => {
  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
    sent: 'bg-blue-100 text-blue-800 border border-blue-300',
    completed: 'bg-green-100 text-green-800 border border-green-300',
    expired: 'bg-red-100 text-red-800 border border-red-300',
  };

  const color = statusColors[status as keyof typeof statusColors] || statusColors.pending;

  return (
    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${color}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};
