import React, { useState, useEffect } from 'react';
import { Avatar, Text } from '@mantine/core';
import { motion } from 'framer-motion';

import Notification from '../models/NotificationData';
import { formatTimestamp } from '../utils/timestampUtils';

interface INotification {
  id: string;
  message: string;
  pwd?: string | null;
  timestamp: string;
}

interface NotificationCardProps {
  notification: INotification;
  index: number;
  total: number;
}

function NotificationCard({ notification, index, total }: NotificationCardProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

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

  const username = notification.pwd ? notification.pwd.split('/').pop() || '' : '';
  const initials = getInitials(username);
  const bgColor = getColorFromName(username);

  // Calculate depth effects (newer = less depth) - only when 8+ notifications
  const shouldApplyDepth = total >= 8;
  const depthFactor = shouldApplyDepth ? Math.min(index / Math.max(total - 1, 1), 1) : 0;
  const opacity = 1 - (depthFactor * 0.1); // 10% opacity reduction
  const scale = 1 - (depthFactor * 0.025); // 2.5% scaling reduction

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: opacity, y: 0, scale: scale }}
      exit={{ opacity: 0, y: -20 }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 30,
        layout: { type: "spring", stiffness: 400, damping: 35 }
      }}
      style={{
        filter: `drop-shadow(0 ${depthFactor * 2}px ${depthFactor * 4}px rgba(0,0,0,${depthFactor * 0.1}))`,
      }}
    >
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
              <Text className="notification-text1 subheadline-emphasized">{notification.message}</Text>
              <Text className="notification-text-time">{formatTimestamp(notification.timestamp)}</Text>
            </div>

            <Text className="notification-text2 subheadline-regular">{notification.pwd || "Notification details"}</Text>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default NotificationCard;