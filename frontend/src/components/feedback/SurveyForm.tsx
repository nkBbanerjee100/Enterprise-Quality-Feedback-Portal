/**
 * Feedback - Survey Form
 */
import React, { useState } from 'react';
import { FeedbackSubmissionData } from '../../types/feedback.types';

interface SurveyFormProps {
  onSubmit: (data: FeedbackSubmissionData) => void;
  loading?: boolean;
  feedbackRequestId: number;
}

export const SurveyForm: React.FC<SurveyFormProps> = ({ onSubmit, loading = false, feedbackRequestId }) => {
  const [formData, setFormData] = useState<FeedbackSubmissionData>({
    feedbackRequestId,
    csatScore: 3,
    npsScore: 5,
    comments: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-2">How satisfied are you? (1-5)</label>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((score) => (
            <button
              key={score}
              type="button"
              onClick={() => setFormData({ ...formData, csatScore: score })}
              className={`w-10 h-10 rounded border-2 ${
                formData.csatScore === score
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              {score}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">How likely to recommend? (0-10)</label>
        <input
          type="range"
          min="0"
          max="10"
          value={formData.npsScore || 5}
          onChange={(e) => setFormData({ ...formData, npsScore: parseInt(e.target.value) })}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-gray-600 mt-1">
          <span>Not likely</span>
          <span className="font-semibold">{formData.npsScore}</span>
          <span>Very likely</span>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Comments (Optional)</label>
        <textarea
          value={formData.comments || ''}
          onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
          className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          rows={4}
          placeholder="Please share your feedback..."
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Submitting...' : 'Submit Feedback'}
      </button>
    </form>
  );
};
