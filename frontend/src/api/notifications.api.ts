/**
 * Notifications API endpoints
 */
import { api } from './client';
import { Notification, NotificationListResponse } from '../types/notification.types';

export const notificationsApi = {
  list: async (unreadOnly = false, skip = 0, limit = 50): Promise<NotificationListResponse> => {
    const r = await api.get('/api/notifications', { params: { unread_only: unreadOnly, skip, limit } });
    return r.data;
  },

  unreadCount: async (): Promise<{ unread_count: number }> => {
    const r = await api.get('/api/notifications/unread-count');
    return r.data;
  },

  markRead: async (id: number): Promise<Notification> => {
    const r = await api.post(`/api/notifications/${id}/read`);
    return r.data;
  },

  markAllRead: async (): Promise<{ marked_read: number }> => {
    const r = await api.post('/api/notifications/read-all');
    return r.data;
  },
};
