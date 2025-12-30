import React from 'react';
import { Avatar, Text } from '@mantine/core';

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

        <Avatar
          className="notification-app-icon"
          style={{ backgroundColor: bgColor }}
        >
          {initials}
        </Avatar>

        <div className="notification-title-time">
          <div className="notification-title-and">
            <Text className="notification-text1 subheadline-emphasized">{notification.data.message}</Text>
            <Text className="notification-text-time">{formatTime(notification.timestamp)}</Text>
          </div>

          <Text className="notification-text2 subheadline-regular">{notification.data.pwd || "Notification details"}</Text>
        </div>
      </div>
    </div>
  );
}

export default NotificationCard;