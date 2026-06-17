export interface NotificationData {
  [key: string]: unknown
  message: string
  pwd?: string | null
}

export interface NotificationItem {
  id: string
  data: NotificationData
  timestamp: string
}

export interface ServerInfo {
  connected: boolean
  streaming: boolean
  notificationsCount: number
  port: number
  host: string
}
