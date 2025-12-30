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

  const getInitials = (name: string): string => {
    const words = name.trim().split(/\s+/);
    if (words.length > 1) {
      return words.map(word => word[0]).join('').toUpperCase().slice(0, 4);
    } else {
      return name[0]?.toUpperCase() || '';
    }
  };

  const getColorFromName = (name: string): string => {
    const colors = [
      '#34A853', // Green
      '#4285F4', // Blue
      '#EA4335', // Red
      '#FBBC05', // Yellow
      '#AB47BC', // Purple
      '#FF7043', // Orange
      '#00ACC1', // Cyan
      '#7B1FA2', // Deep Purple
      '#F06292', // Pink
      '#26A69A', // Teal
    ];
    const hash = name.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    return colors[Math.abs(hash) % colors.length];
  };

  const username = notification.data.pwd ? notification.data.pwd.split('/').pop() || '' : '';
  const initials = getInitials(username);
  const bgColor = getColorFromName(username);

  return (
    <div className="notification">
      <div className="notification-row">
        <div className="notification-bg">
          <div className="notification-notification"></div>
        </div>

        <div className="notification-app-icon" style={{ backgroundColor: bgColor, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
          {initials}
        </div>

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