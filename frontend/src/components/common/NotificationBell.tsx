/**
 * Notification Bell — dropdown list of in-app notifications.
 * Polls unread count every 30s; opens a dropdown with the recent list.
 *
 * NOTE: this used to let Management approve/decline a staged project
 * directly from the notification (inline buttons). That only ever covered
 * ONE of five Management decision points (STAGED_PROJECT_NEEDS_REVIEW) —
 * exemption requests and any enrollment-level review were never wired up,
 * so the buttons appeared inconsistently and looked broken. Removed rather
 * than half-fixed; every notification now just navigates to the real page
 * via its `link`, same as every other notification type already did.
 */
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useUnreadNotificationCount, useNotifications,
  useMarkNotificationRead, useMarkAllNotificationsRead,
} from '../../hooks/useNotifications';
import { Notification } from '../../types/notification.types';
import { BRAND } from '../../utils/constants';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: unread, isError: unreadError, error: unreadErrorObj } = useUnreadNotificationCount();
  const { data: list, isLoading, isError: listError } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  useEffect(() => {
    if (unreadError) {
      // Surfaced to the console on purpose — a failed request and a
      // genuine "zero notifications" state look identical in the UI
      // otherwise, which makes this exact situation impossible to diagnose
      // from the bell alone.
      console.error('[NotificationBell] Failed to load unread count:', unreadErrorObj);
    }
  }, [unreadError, unreadErrorObj]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const handleClick = (n: Notification) => {
    if (!n.is_read) markRead.mutate(n.id);
    setOpen(false);
    if (n.link) {
      try {
        const url = new URL(n.link);
        navigate(url.pathname);
      } catch {
        navigate(n.link);
      }
    }
  };

  const unreadCount = unread?.unread_count ?? 0;

  // Clear the unread badge as soon as the person opens the panel, instead
  // of requiring a separate "Mark all read" click every time.
  useEffect(() => {
    if (open && unreadCount > 0 && markAllRead.status !== 'pending') {
      markAllRead.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Notifications"
        style={{
          position: 'relative',
          width: '34px',
          height: '34px',
          borderRadius: '50%',
          border: '1px solid #D4E4DA',
          background: open ? '#F7F9F8' : '#FFFFFF',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '15px',
          color: BRAND.textMid,
        }}
      >
        🔔
        {unreadError && (
          <span
            title="Couldn't load notifications — check your connection or sign-in"
            style={{
              position: 'absolute', top: '-2px', right: '-2px',
              width: '10px', height: '10px', borderRadius: '50%',
              background: '#9CA3AF', border: '2px solid #fff',
            }}
          />
        )}
        {!unreadError && unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-2px',
              right: '-2px',
              minWidth: '16px',
              height: '16px',
              padding: '0 3px',
              borderRadius: '999px',
              background: '#DC2626',
              color: '#fff',
              fontSize: '10px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '42px',
            width: '360px',
            maxHeight: '440px',
            background: '#fff',
            border: '1px solid #E5E7EB',
            borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid #EEF3F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: 700, color: BRAND.textDark }}>Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                style={{ fontSize: '11px', color: BRAND.green, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
              >
                Mark all read
              </button>
            )}
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {isLoading ? (
              <p style={{ padding: '20px', fontSize: '12px', color: BRAND.textLight, textAlign: 'center' }}>Loading…</p>
            ) : listError ? (
              <p style={{ padding: '28px 16px', fontSize: '12px', color: '#B45309', textAlign: 'center' }}>
                Couldn't load notifications. Try refreshing the page.
              </p>
            ) : !list || list.data.length === 0 ? (
              <p style={{ padding: '28px 16px', fontSize: '12px', color: BRAND.textLight, textAlign: 'center' }}>
                You're all caught up.
              </p>
            ) : (
              list.data.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '12px 16px',
                    border: 'none',
                    borderBottom: '1px solid #F3F4F6',
                    background: n.is_read ? '#fff' : '#F7FBF9',
                    cursor: 'pointer',
                    display: 'flex',
                    gap: '8px',
                  }}
                >
                  <span
                    style={{
                      width: '7px', height: '7px', borderRadius: '50%',
                      background: n.is_read ? 'transparent' : BRAND.green,
                      marginTop: '5px', flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '12.5px', fontWeight: n.is_read ? 500 : 700, color: BRAND.textDark, margin: 0 }}>
                      {n.title}
                    </p>
                    <p style={{ fontSize: '11.5px', color: BRAND.textMid, margin: '3px 0 0', lineHeight: 1.4 }}>
                      {n.message}
                    </p>
                    <p style={{ fontSize: '10.5px', color: BRAND.textLight, margin: '4px 0 0' }}>
                      {timeAgo(n.created_at)}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};