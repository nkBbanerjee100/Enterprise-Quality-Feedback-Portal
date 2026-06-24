/**
 * Validation schemas using Zod
 */
import { z } from 'zod';

// Auth schemas
export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export type LoginFormData = z.infer<typeof LoginSchema>;

// CSAT Cycle schemas
export const CSATCycleSchema = z.object({
  cycleName: z.string().min(1, 'Cycle name is required'),
  description: z.string().optional(),
  startDate: z.string().datetime('Invalid start date'),
  endDate: z.string().datetime('Invalid end date'),
});

export type CSATCycleFormData = z.infer<typeof CSATCycleSchema>;

// Feedback schemas
export const FeedbackSubmissionSchema = z.object({
  feedbackRequestId: z.number(),
  csatScore: z.number().min(1).max(5),
  npsScore: z.number().min(0).max(10).optional(),
  comments: z.string().optional(),
});

export type FeedbackSubmissionData = z.infer<typeof FeedbackSubmissionSchema>;

// Action Plan schemas
export const ActionPlanSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  rootCause: z.string().optional(),
  proposedAction: z.string().optional(),
  targetCompletionDate: z.string().optional(),
});

export type ActionPlanFormData = z.infer<typeof ActionPlanSchema>;
