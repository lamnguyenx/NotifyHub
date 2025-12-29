import React, { useState, useEffect, useRef } from 'react';
import { Button, Container, Alert, Title, Card, Text, Group, Box } from '@mantine/core';

const starIcon = '/icons/star-icon.svg';
const submarineAudio = '/audio/Submarine.mp3';

function App() {
  const [notifications, setNotifications] = useState([]);
  const [connectionError, setConnectionError] = useState(false);
  const [eventSource, setEventSource] = useState(null);
  const audioRef = useRef(null);
  const [audioBlocked, setAudioBlocked] = useState(false);

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
    audioRef.current.volume = 0.5;
    audioRef.current.load();
  }, []);

  // SSE connection
  const connectSSE = () => {
    setConnectionError(false);
    const es = new EventSource('/events');
    setEventSource(es);

    es.onmessage = (event) => {
      console.log('SSE message received:', event.data);
    };

    es.addEventListener('init', (event) => {
      const initData = JSON.parse(event.data);
      // Filter out any potential duplicates by ID
      const uniqueNotifications = initData.filter((n, index, arr) =>
        arr.findIndex(x => x.id === n.id) === index
      );
      setNotifications(uniqueNotifications);
      setConnectionError(false);
    });

    es.addEventListener('notification', (event) => {
      const notification = JSON.parse(event.data);
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
    });

    es.addEventListener('clear', (event) => {
      setNotifications([]);
      setConnectionError(false);
    });

    es.addEventListener('heartbeat', (event) => {
      setConnectionError(false);
    });

    es.onerror = (error) => {
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

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

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
            <Card key={notification.id} shadow="sm" p="md" mb="sm" bg="default">
              <Group justify="space-between">
                <div>
                  <Text fw={500}>{notification.message}</Text>
                  <Text size="sm" c="dimmed">
                    {formatDate(notification.timestamp)}
                  </Text>
                </div>
                 <img src={starIcon} alt="star" width="20" height="20" />
              </Group>
            </Card>
          ))}
        </div>
      </Container>
    </Box>
  );
}

export default App;