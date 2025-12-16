<template>
  <div class="container mt-4">
    <h1 class="mb-4">🔔 NotifyHub</h1>
    <div v-if="error" class="alert alert-warning">
      Connection lost - retrying...
    </div>
    <div v-if="notifications.length === 0 && !error" class="text-center text-muted">
      No notifications yet
    </div>
    <div v-else-if="!error" class="row">
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
      error: false,
      audio: null
    }
  },
  mounted() {
    // Preload audio
    this.audio = new Audio('/static/audio/Submarine.mp3');
    this.audio.volume = 0.3;
    this.audio.load();

    this.fetchNotifications();
    setInterval(this.fetchNotifications, 2000); // Poll every 2 seconds
  },
  methods: {
    async fetchNotifications() {
      const previousCount = this.notifications.length;
      try {
        const response = await fetch('/api/notifications');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        this.notifications = await response.json();
        this.error = false; // Clear error on success
        const newCount = this.notifications.length;

        if (newCount > previousCount) {
          this.playNotificationSound();
        }
      } catch (error) {
        console.error('Failed to fetch notifications:', error);
        this.error = true;
      }
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