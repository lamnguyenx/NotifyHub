import React from 'react';
import '../../../../__refmodules__/notification-html-css/css/reset.css';
import '../../../../__refmodules__/notification-html-css/css/global.css';
import '../../../../__refmodules__/notification-html-css/css/notification.css';
import NotificationData from '../models/NotificationData';

interface Notification {
  id: string;
  data: NotificationData;
  timestamp: string;
}

interface NotificationCardProps {
  notification: Notification;
}

function NotificationCard({ notification }: NotificationCardProps) {
  const formatTime = (timestamp: string): string => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="notification">
      <div className="notification-row">
        <div className="notification-bg">
          <div className="notification-notification"></div>
        </div>

        <div className="notification-app-icon">🔔</div>

        <div className="notification-title-time">
          <div className="notification-title-and">
            <p className="notification-text1 subheadline-emphasized">{notification.data.message}</p>
            <p className="notification-text-time">{formatTime(notification.timestamp)}</p>
          </div>

          <p className="notification-text2 subheadline-regular">{notification.data.pwd || "Notification details"}</p>
        </div>
      </div>
    </div>
  );
}

export default NotificationCard;