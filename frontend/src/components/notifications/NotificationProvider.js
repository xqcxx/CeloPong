import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState
} from 'react';
import '../../styles/Notifications.css';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [confirmation, setConfirmation] = useState(null);
  const confirmationResolver = useRef(null);

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

  const confirm = useCallback((options) => {
    if (confirmationResolver.current) {
      confirmationResolver.current(false);
    }

    setConfirmation({
      title: options.title || 'Confirm Action',
      message: options.message,
      confirmLabel: options.confirmLabel || 'Confirm',
      cancelLabel: options.cancelLabel || 'Cancel',
      tone: options.tone || 'warning'
    });

    return new Promise(resolve => {
      confirmationResolver.current = resolve;
    });
  }, []);

  const resolveConfirmation = useCallback((accepted) => {
    confirmationResolver.current?.(accepted);
    confirmationResolver.current = null;
    setConfirmation(null);
  }, []);

  const value = useMemo(
    () => ({ notify, dismiss, confirm }),
    [notify, dismiss, confirm]
  );

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
      {confirmation && (
        <div className="confirmation-overlay" role="presentation">
          <div
            className={`confirmation-dialog confirmation-dialog--${confirmation.tone}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirmation-title"
            aria-describedby="confirmation-message"
          >
            <h2 id="confirmation-title">{confirmation.title}</h2>
            <p id="confirmation-message">{confirmation.message}</p>
            <div className="confirmation-actions">
              <button
                type="button"
                className="confirmation-button confirmation-button--cancel"
                onClick={() => resolveConfirmation(false)}
              >
                {confirmation.cancelLabel}
              </button>
              <button
                type="button"
                className="confirmation-button confirmation-button--confirm"
                onClick={() => resolveConfirmation(true)}
                autoFocus
              >
                {confirmation.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
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
