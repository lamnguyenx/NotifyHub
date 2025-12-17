import React, { useState, useEffect, useRef } from 'react';
import { Puck, Render } from "@measured/puck";
import { config } from './puck-config.jsx';

function App() {
  const [notifications, setNotifications] = useState([]);
  const [connectionError, setConnectionError] = useState(false);
  const [eventSource, setEventSource] = useState(null);
  const audioRef = useRef(null);
  const [isEditing, setIsEditing] = useState(false);
  const [puckData, setPuckData] = useState({
    content: [
      {
        type: "Header",
        props: { id: "header", title: "🔔 NotifyHub", showBell: true }
      },
      {
        type: "ConnectionStatus",
        props: { id: "status", showBanner: true }
      },
      {
        type: "NotificationList",
        props: {
          id: "list",
          cardStyle: "white",
          maxWidth: "95%"
        }
      }
    ],
    root: {}
  });

  // Audio setup
  useEffect(() => {
    audioRef.current = new Audio('/static/audio/Submarine.mp3');
    audioRef.current.volume = 0.3;
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
      setNotifications(initData);
      setConnectionError(false);
    });

    es.addEventListener('notification', (event) => {
      const notification = JSON.parse(event.data);
      setNotifications(prev => [notification, ...prev]);
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(e => console.log('Audio play failed:', e));
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

  const savePuckData = (data) => {
    setPuckData(data);
    // In a real app, save to API/database
    localStorage.setItem('puckData', JSON.stringify(data));
  };

  // Load saved Puck data on mount
  useEffect(() => {
    const saved = localStorage.getItem('puckData');
    if (saved) {
      setPuckData(JSON.parse(saved));
    }
  }, []);

  if (isEditing) {
    return (
      <Puck
        config={config}
        data={puckData}
        onPublish={savePuckData}
        onChange={setPuckData}
      />
    );
  }

  return (
    <>
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          {isEditing ? 'View Live' : 'Edit Layout'}
        </button>
      </div>
      <Render
        config={{
          ...config,
          components: {
            ...config.components,
            Header: {
              ...config.components.Header,
              render: (props) => config.components.Header.render({ ...props, connectionError })
            },
            ConnectionStatus: {
              ...config.components.ConnectionStatus,
              render: (props) => config.components.ConnectionStatus.render({ ...props, connectionError })
            },
            NotificationList: {
              ...config.components.NotificationList,
              render: (props) => config.components.NotificationList.render({
                ...props,
                notifications,
                formatDate,
                clearAllNotifications
              })
            }
          }
        }}
        data={puckData}
      />
    </>
  );
}

export default App;