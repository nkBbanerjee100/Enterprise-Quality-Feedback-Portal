/**
 * Custom hooks for TMS projects
 */
import { useQuery } from '@tanstack/react-query';
import { projectsApi } from '../api/projects.api';

export const useProjects = (
  skip     = 0,
  limit    = 20,
  search?:   string,
  isActive?: boolean,
) =>
  useQuery({
    queryKey: ['tms-projects', skip, limit, search, isActive],
    queryFn:  () => projectsApi.list(skip, limit, search, isActive),
  });

export const useCompletedProjects = (
  skip   = 0,
  limit  = 20,
  search?: string,
) =>
  useQuery({
    queryKey: ['tms-projects-completed', skip, limit, search],
    queryFn:  () => projectsApi.listCompleted(skip, limit, search),
  });

export const useProject = (projectId: number) =>
  useQuery({
    queryKey: ['tms-project', projectId],
    queryFn:  () => projectsApi.getById(projectId),
    enabled:  !!projectId,
  });

export const useTMSStatus = () =>
  useQuery({
    queryKey: ['tms-status'],
    queryFn:  projectsApi.getStatus,
    staleTime: 1000 * 60, // re-check every minute
  });

import { peopleApi } from '../api/projects.api';

export const useProjectPeople = (projectId: number) =>
  useQuery({
    queryKey: ['project-people', projectId],
    queryFn:  () => peopleApi.getProjectPeople(projectId),
    enabled:  !!projectId,
    staleTime: 1000 * 60 * 5,
  });