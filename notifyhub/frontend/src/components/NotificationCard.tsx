import React, { useState, useEffect, useRef } from 'react';
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
  const [compressionFactor, setCompressionFactor] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const updateCompression = () => {
      if (!cardRef.current) return;

      const rect = cardRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      // Check if card is in bottom 15% of viewport
      const bottomThreshold = viewportHeight * 0.85; // 85% from top = bottom 15%
      const cardBottom = rect.bottom;

      if (cardBottom > bottomThreshold) {
        // Calculate how far into the bottom 15% it is
        const distanceIntoBottom = cardBottom - bottomThreshold;
        const bottomRegionHeight = viewportHeight * 0.15;
        const factor = Math.min(1, distanceIntoBottom / bottomRegionHeight);
        setCompressionFactor(factor);
      } else {
        setCompressionFactor(0);
      }
    };

    // Initial calculation
    updateCompression();

    // Update on scroll and resize
    window.addEventListener('scroll', updateCompression, { passive: true });
    window.addEventListener('resize', updateCompression, { passive: true });

    return () => {
      window.removeEventListener('scroll', updateCompression);
      window.removeEventListener('resize', updateCompression);
    };
  }, [index, total]); // Recalculate when notification position changes

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

  const notiTitle = notification.pwd ? notification.pwd.split('/').pop() || '' : '';
  const initials = getInitials(notiTitle);
  const bgColor = getColorFromName(notiTitle);

  // Age-based depth (newer = less depth)
  const ageFactor = Math.min(index / Math.max(total - 1, 1), 1);
  const ageOpacity = 1 - (ageFactor * 0.2);
  const ageScale = 1 - (ageFactor * 0.05);

  // Viewport-based compression for bottom 15%
  // compressionFactor is calculated in useEffect based on scroll position

  const finalOpacity = Math.max(0.3, ageOpacity * (1 - compressionFactor * 0.7));
  const finalScale = Math.max(0.85, ageScale * (1 - compressionFactor * 0.15));

  return (
    <motion.div
      ref={cardRef}
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }} // Roll-in from bottom
      animate={{
        opacity: finalOpacity,
        y: 0,
        scale: finalScale,
        filter: `drop-shadow(0 ${ageFactor * 2}px ${ageFactor * 4}px rgba(0,0,0,${ageFactor * 0.1}))`
      }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{
        type: "spring",
        stiffness: 350, // Slightly snappier
        damping: 35,    // Smoother damping
        layout: { type: "spring", stiffness: 450, damping: 40 }
      }}
      style={{ zIndex: total - index }} // Newer on top
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
              <Text className="notification-text1 subheadline-emphasized">{notiTitle}</Text>
              <Text className="notification-text-time">{formatTimestamp(notification.timestamp)}</Text>
            </div>

            <Text className="notification-text2 subheadline-regular">{notification.pwd || "Notification details"}</Text>
            <Text className="notification-text2 message">{notification.message || "Message"}</Text>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default NotificationCard;