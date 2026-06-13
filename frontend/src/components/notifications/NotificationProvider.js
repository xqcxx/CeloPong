import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import '../../styles/Notifications.css';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);

  const dismiss = useCallback((id) => {
    setNotifications(current => current.filter(notification => notification.id !== id));
  }, []);

  const notify = useCallback((message, options = {}) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const notification = {
      id,
      message,
      type: options.type || 'info'
    };

    setNotifications(current => [...current, notification]);

    if (options.duration !== 0) {
      window.setTimeout(() => dismiss(id), options.duration || 4500);
    }

    return id;
  }, [dismiss]);

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div className="notification-viewport" aria-live="polite" aria-atomic="false">
        {notifications.map(notification => (
          <div
            key={notification.id}
            className={`app-notification app-notification--${notification.type}`}
            role={notification.type === 'error' ? 'alert' : 'status'}
          >
            <span className="app-notification__message">{notification.message}</span>
            <button
              type="button"
              className="app-notification__close"
              onClick={() => dismiss(notification.id)}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider');
  }
  return context;
}
