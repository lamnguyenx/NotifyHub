import React, { useState, useEffect, useRef } from 'react';
import { Button, Container, Alert, Title, Box } from '@mantine/core';
import { motion, AnimatePresence } from 'framer-motion';
import { IconX } from '@tabler/icons-react';
import NotificationCard from './components/NotificationCard';
import Notification from './models/NotificationData';
const submarineAudio = '/audio/Submarine.mp3';

interface INotification {
  id: string;
  message: string;
  pwd?: string | null;
  timestamp: string;
}

function App() {
  const [notifications, setNotifications] = useState<INotification[]>([]);
  const [connectionError, setConnectionError] = useState<boolean>(false);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioBlocked, setAudioBlocked] = useState<boolean>(false);

  // Enable audio on user interaction
  useEffect(() => {
    if (audioBlocked) {
      const enableAudio = () => {
        if (audioRef.current) {
          audioRef.current.play().then(() => {
            setAudioBlocked(false);
            document.removeEventListener('click', enableAudio);
          }).catch(() => {
            // Still blocked, keep listening
          });
        }
      };
      document.addEventListener('click', enableAudio);
      return () => document.removeEventListener('click', enableAudio);
    }
  }, [audioBlocked]);

  // Update page title based on audio status
  useEffect(() => {
    document.title = audioBlocked ? "Notification Center | Muted. Please click to enable audio notifications" : "Notification Center";
  }, [audioBlocked]);


  // Audio setup
  useEffect(() => {
    audioRef.current = new Audio(submarineAudio);
    if (audioRef.current) {
      audioRef.current.volume = 0.5;
      audioRef.current.load();
    }
  }, []);

  // SSE connection
  const connectSSE = () => {
    setConnectionError(false);
    const es = new EventSource('/events');
    setEventSource(es);

    es.onmessage = (event: MessageEvent) => {
      console.log('SSE message received:', event.data);
    };

    es.addEventListener('init', (event: MessageEvent) => {
      const initData = JSON.parse(event.data) as Array<{
        id: string;
        data: any;
        timestamp: string;
      }>;
      // Create Notification instances and filter duplicates
      const uniqueNotifications: INotification[] = initData
        .map(raw => {
          try {
            return new Notification({
              id: raw.id,
              message: raw.data.message,
              pwd: raw.data.pwd,
              timestamp: raw.timestamp,
            });
          } catch (error) {
            console.error('Invalid notification data in init:', error);
            return null;
          }
        })
        .filter((n): n is INotification => n !== null)
        .filter((n, index, arr) => arr.findIndex(x => x.id === n.id) === index);
      setNotifications(uniqueNotifications);
      setConnectionError(false);
    });

    es.addEventListener('notification', (event: MessageEvent) => {
      const rawNotification = JSON.parse(event.data) as {
        id: string;
        data: any;
        timestamp: string;
      };
      try {
        const notification = new Notification({
          id: rawNotification.id,
          message: rawNotification.data.message,
          pwd: rawNotification.data.pwd,
          timestamp: rawNotification.timestamp,
        });
        setNotifications(prev => {
          // Prevent duplicate notifications by checking existing IDs
          if (prev.some(n => n.id === notification.id)) {
            return prev;
          }
          return [notification, ...prev];
        });
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(e => {
            console.log('Audio play failed:', e);
            setAudioBlocked(true);
          });
        }
        setConnectionError(false);
      } catch (error) {
        console.error('Invalid notification data:', error);
        // Optionally, ignore invalid notifications or show an error
      }
    });

    es.addEventListener('clear', (event: MessageEvent) => {
      setNotifications([]);
      setConnectionError(false);
    });

    es.addEventListener('delete', (event: MessageEvent) => {
      const deleteData = JSON.parse(event.data) as { id: string };
      setNotifications(prev => prev.filter(n => n.id !== deleteData.id));
      setConnectionError(false);
    });

    es.addEventListener('heartbeat', (event: MessageEvent) => {
      setConnectionError(false);
    });

    es.onerror = (error: Event) => {
      console.error('SSE connection error:', error);
      setConnectionError(true);
    };

    es.onopen = () => {
      console.log('SSE connection opened');
      setConnectionError(false);
    };
  };

  useEffect(() => {
    connectSSE();
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, []);

  const clearAllNotifications = async () => {
    try {
      const response = await fetch('/api/notifications', {
        method: 'DELETE'
      });
      if (response.ok) {
        // Server will broadcast clear event
      } else {
        console.error('Failed to clear notifications on server');
        setNotifications([]);
      }
    } catch (error) {
      console.error('Error clearing notifications:', error);
      setNotifications([]);
    }
  };

  return (
    <Box bg="body" p="md" mih="100vh" className="app-main">
      <div className="notification-wrapper">
        {/* Header */}
        <div className="notification-header">
          <Title order={4} className="notification-center-title">
            Notification Center
          </Title>
          <Button
            onClick={clearAllNotifications}
            disabled={notifications.length === 0}
            variant="filled"
            size="sm"
            radius="xl"
            className="clear-all-button"
          >
            <IconX size={16} stroke={2} />
          </Button>
        </div>

        {/* Status Alerts */}
        {audioBlocked && (
          <Alert title="Audio Status" color="blue" variant="light" mb="md">
            🔊 Audio notifications are muted. Click anywhere on the page to enable them.
          </Alert>
        )}

        {connectionError && (
          <Alert title="Connection Status" color="orange" variant="light" mb="md">
            Connection lost - retrying...
          </Alert>
        )}

        {/* Notifications */}
        <AnimatePresence mode="popLayout">
          <motion.div layout>
            {notifications.map((notification, index) => (
              <NotificationCard
                key={notification.id}
                notification={notification}
                index={index}
                total={notifications.length}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </Box>
  );
}

export default App;