<template>
  <div class="container mt-4">
    <h1 class="mb-4">🔔 NotifyHub</h1>
    <div v-if="connectionError" class="alert alert-warning">
      Connection lost - retrying...
    </div>
    <div v-if="notifications.length === 0 && !connectionError" class="text-center text-muted">
      No notifications yet
    </div>
    <div v-else-if="!connectionError" class="row">
      <div class="col-md-8 mx-auto">
        <div v-for="notification in notifications"
             :key="notification.id"
             class="card mb-2">
          <div class="card-body">
            <div class="d-flex justify-content-between">
              <div>
                <h6 class="card-title">{{ notification.message }}</h6>
                <small class="text-muted">
                  {{ formatDate(notification.timestamp) }}
                </small>
              </div>
              <span class="text-primary">🔔</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      notifications: [],
      connectionError: false,
      eventSource: null,
      audio: null
    }
  },
  mounted() {
     // Preload audio
     this.audio = new Audio('/static/audio/Submarine.mp3');
     this.audio.volume = 0.3;
    this.audio.load();

    this.connectSSE();
  },
  beforeUnmount() {
    if (this.eventSource) {
      this.eventSource.close();
    }
  },
  methods: {
    connectSSE() {
      this.connectionError = false;
      this.eventSource = new EventSource('/events');

      this.eventSource.onmessage = (event) => {
        console.log('SSE message received:', event.data);
      };

      this.eventSource.addEventListener('init', (event) => {
        // Handle initial notification load
        const initData = JSON.parse(event.data);
        this.notifications = initData;
        this.connectionError = false;
      });

      this.eventSource.addEventListener('notification', (event) => {
        // Handle new notification
        const notification = JSON.parse(event.data);
        this.notifications.unshift(notification); // Add to beginning
        this.playNotificationSound();
        this.connectionError = false;
      });

      this.eventSource.addEventListener('heartbeat', (event) => {
        // Handle heartbeat to monitor connection health
        this.connectionError = false;
      });

      this.eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);
        this.connectionError = true;

        // EventSource automatically attempts reconnection
        // But we can add custom retry logic if needed
      };

      this.eventSource.onopen = () => {
        console.log('SSE connection opened');
        this.connectionError = false;
      };
    },
    playNotificationSound() {
      if (this.audio) {
        this.audio.currentTime = 0; // Reset to start
        this.audio.play().catch(e => console.log('Audio play failed:', e));
      }
    },
    formatDate(timestamp) {
      return new Date(timestamp).toLocaleString();
    }
  }
}
</script>