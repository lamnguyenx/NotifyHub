import React, { useState, useEffect, useRef } from 'react';
import { Button, Container, Alert, Title, Box } from '@mantine/core';
import NotificationCard from './components/NotificationCard';
import NotificationData from './models/NotificationData';
const submarineAudio = '/audio/Submarine.mp3';

interface Notification {
  id: string;
  data: NotificationData;
  timestamp: string;
}

function App() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
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
    document.title = audioBlocked ? "NotifyHub | Muted. Please click to enable audio notifications" : "★ NotifyHub";
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
      // Wrap data with NotificationData and filter duplicates
      const uniqueNotifications: Notification[] = initData
        .map(raw => {
          try {
            return {
              ...raw,
              data: new NotificationData(raw.data),
            };
          } catch (error) {
            console.error('Invalid notification data in init:', error);
            return null;
          }
        })
        .filter((n): n is Notification => n !== null)
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
        const notificationData = new NotificationData(rawNotification.data);
        const notification: Notification = {
          ...rawNotification,
          data: notificationData,
        };
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
    <Box bg="body" p="md" mih="100vh">
      <Container size="lg">
        {/* Header */}
        <Title order={1} ta="center" mb="md">
          ★ NotifyHub
        </Title>

        {/* Clear All Button */}
        <Button
          onClick={clearAllNotifications}
          disabled={notifications.length === 0}
          variant="default"
          className="clear-all"
        >
          Clear All
        </Button>

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
        <div>
          {notifications.map(notification => (
            <NotificationCard key={notification.id} notification={notification} />
          ))}
        </div>
      </Container>
    </Box>
  );
}

export default App;