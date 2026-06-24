/**
 * Custom hook for feedback operations
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { feedbackApi } from '../api/feedback.api';
import { FeedbackSubmission } from '../types/feedback.types';

export const useFeedbackRequests = (skip: number = 0, limit: number = 10) => {
  return useQuery({
    queryKey: ['feedbackRequests', skip, limit],
    queryFn: () => feedbackApi.listRequests(skip, limit),
  });
};

export const useFeedbackRequest = (id: number) => {
  return useQuery({
    queryKey: ['feedbackRequest', id],
    queryFn: () => feedbackApi.getRequest(id),
    enabled: !!id,
  });
};

export const useSubmitFeedback = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (submission: FeedbackSubmission) => feedbackApi.submitResponse(submission),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedbackRequests'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

export const useFeedbackResponses = (skip: number = 0, limit: number = 10) => {
  return useQuery({
    queryKey: ['feedbackResponses', skip, limit],
    queryFn: () => feedbackApi.listResponses(skip, limit),
  });
};
