import type { EncryptedEnvelope } from "./utils/crypto"

/**
 * Plaintext payload. `message` is optional at the type level because a
 * locked (undecrypted) item carries an envelope instead.
 */
export interface NotificationData {
  [key: string]: unknown
  message?: string
  pwd?: string | null
  host_model?: string | null
}

export interface NotificationItem {
  id: string
  data: NotificationData | EncryptedEnvelope
  timestamp: string
  /** True when `data` is an envelope this client could not decrypt. */
  locked?: boolean
}

/** Server-side e2e state (GET /api/e2e). */
export interface E2EInfo {
  enabled: boolean
  alg: string | null
  kid: string | null
}

export interface ServerInfo {
  connected: boolean
  streaming: boolean
  notificationsCount: number
  port: number
  host: string
  e2e?: E2EInfo
}
