/** Plaintext notification payload. `message` is optional because a locked
 * (undecryptable) item carries an e2e envelope instead. */
export interface NotificationData {
  [key: string]: unknown;
  message?: string;
  pwd?: string | null;
  host_model?: string | null;
  session_id?: string;
}

/** AES-256-GCM envelope served when backend e2e encryption is enabled. */
export interface EncryptedEnvelope {
  [key: string]: unknown;
  e2e: 1;
  alg: string;
  kid: string;
  iv: string;
  ct: string;
}

export interface NotificationItem {
  id: string;
  data: NotificationData | EncryptedEnvelope;
  timestamp: string;
  /** True when `data` is an envelope this client could not decrypt. */
  locked?: boolean;
}

/** Server-side e2e state (GET /api/e2e). */
export interface E2EInfo {
  enabled: boolean;
  alg: string | null;
  kid: string | null;
}

export interface ServerInfo {
  connected: boolean;
  streaming: boolean;
  notificationsCount: number;
  host: string;
  port: number;
  e2e?: E2EInfo;
}

/** Live agent session status (GET /api/status, SSE agent_status). */
export type AgentState = "running" | "idle" | "blocked" | "stale";

export interface AgentStatusEntry {
  agent: string;
  session_id: string;
  state: AgentState;
  pwd: string | null;
  host: string | null;
  task: string | null;
  since: string;
  updated: string;
}
