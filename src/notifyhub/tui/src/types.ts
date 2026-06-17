export interface NotificationData {
  [key: string]: any
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
  notificationsCount: number
  port: number
  host: string
}
