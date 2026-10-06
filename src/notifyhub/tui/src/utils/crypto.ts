/**
 * E2E decryption for NotifyHub (counterpart of `notifyhub/crypto.py`).
 *
 * The server stores/serves the payload as an AES-256-GCM envelope; the TUI
 * holds the same pre-shared key and decrypts locally:
 *
 *   { e2e: 1, alg: "A256GCM", kid: "a1b2c3d4", iv: "<b64>", ct: "<b64>" }
 *
 * - AAD MUST match the Python side: "notifyhub:v1"
 * - key source (first hit wins):
 *     1. NOTIFYHUB_E2E_KEY env (base64 or 64-char hex)
 *     2. config file `e2e.key` (NOTIFYHUB_CONFIG, else
 *        ~/.config/notifyhub/config.jsonl | config.json — JSON5)
 *     3. key file: NOTIFYHUB_E2E_KEY_FILE or ~/.config/notifyhub/e2e.key
 * - items that cannot be decrypted get `locked: true` and render as a
 *   placeholder row (useful for diagnosing key mismatches via `kid`).
 */
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { NotificationItem } from "../types"

export const E2E_AAD = "notifyhub:v1"
export const E2E_ALG = "A256GCM"

export class CryptoError extends Error {}

export interface EncryptedEnvelope {
  e2e: number
  alg: string
  kid?: string
  iv: string
  ct: string
  [key: string]: unknown
}

export function isEnvelope(data: unknown): data is EncryptedEnvelope {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as Record<string, unknown>).e2e === 1 &&
    (data as Record<string, unknown>).alg === E2E_ALG &&
    typeof (data as Record<string, unknown>).iv === "string" &&
    typeof (data as Record<string, unknown>).ct === "string"
  )
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64)
  const bytes = new Uint8Array(new ArrayBuffer(bin.length))
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** Accept a base64- or hex-encoded 256-bit key (same as normalize_key in Python). */
export function normalizeKey(raw: string): Uint8Array<ArrayBuffer> {
  const text = raw.trim()
  if (/^[0-9a-fA-F]{64}$/.test(text)) {
    const bytes = new Uint8Array(new ArrayBuffer(32))
    for (let i = 0; i < 32; i++) bytes[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16)
    return bytes
  }
  try {
    const bin = atob(text)
    if (bin.length !== 32) {
      throw new CryptoError(`key must decode to 32 bytes, got ${bin.length}`)
    }
    return b64ToBytes(text)
  } catch (err) {
    if (err instanceof CryptoError) throw err
    throw new CryptoError("invalid key encoding (expected base64 or 64-char hex)")
  }
}

export async function importKey(raw: string): Promise<CryptoKey> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new CryptoError("WebCrypto is not available in this runtime")
  return subtle.importKey("raw", normalizeKey(raw), { name: "AES-GCM" }, false, ["decrypt"])
}

export async function decryptEnvelope(
  envelope: EncryptedEnvelope,
  key: CryptoKey,
): Promise<Record<string, unknown>> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new CryptoError("WebCrypto is not available in this runtime")
  let iv: Uint8Array<ArrayBuffer>
  let ct: Uint8Array<ArrayBuffer>
  try {
    iv = b64ToBytes(envelope.iv)
    ct = b64ToBytes(envelope.ct)
  } catch {
    throw new CryptoError("malformed envelope: bad base64")
  }
  let plaintext: ArrayBuffer
  try {
    plaintext = await subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(E2E_AAD) },
      key,
      ct,
    )
  } catch {
    const kid = envelope.kid ? ` (envelope kid=${envelope.kid})` : ""
    throw new CryptoError(`decryption failed: wrong key or tampered ciphertext${kid}`)
  }
  try {
    const payload = JSON.parse(new TextDecoder().decode(plaintext))
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      throw new Error("not an object")
    }
    return payload as Record<string, unknown>
  } catch {
    throw new CryptoError("decrypted payload is not a JSON object")
  }
}

// ---------------------------------------------------------------------------
// Key management
// ---------------------------------------------------------------------------

// undefined = not overridden (fall through to env/config/file); null = forced "no key".
let overrideKey: string | null | undefined = undefined
let keyPromise: Promise<CryptoKey | null> | null = null

function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME?.trim()
  const base = xdg && xdg.length > 0 ? xdg : join(homedir(), ".config")
  return join(base, "notifyhub")
}

/** Default key file location, mirroring the Python backend. */
export function defaultE2EKeyPath(): string {
  return join(configDir(), "e2e.key")
}

/** Candidate config files, most specific first. */
export function configFileCandidates(): string[] {
  const explicit = process.env.NOTIFYHUB_CONFIG?.trim()
  const candidates = explicit ? [explicit] : []
  const dir = configDir()
  candidates.push(join(dir, "config.jsonl"), join(dir, "config.json"))
  return candidates
}

/** Parse a JSON5 document (comments + trailing commas). Uses Bun's parser. */
function parseJson5(text: string): unknown {
  const bun = (globalThis as { Bun?: { JSON5?: { parse: (s: string) => unknown } } }).Bun
  if (bun?.JSON5?.parse) return bun.JSON5.parse(text)
  // Best-effort fallback: strip /* */ and // comments, then JSON.parse.
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
  return JSON.parse(stripped)
}

function readConfigKey(): string | null {
  for (const path of configFileCandidates()) {
    try {
      if (!existsSync(path)) continue
      const parsed = parseJson5(readFileSync(path, "utf8")) as
        | { e2e?: { key?: unknown } }
        | null
      const value = parsed?.e2e?.key
      if (typeof value === "string" && value.trim().length > 0) return value.trim()
    } catch (err) {
      console.error(
        `NotifyHub TUI: could not read config ${path}: ${err instanceof Error ? err.message : err}`,
      )
    }
  }
  return null
}

function readKeyFile(): string | null {
  const explicit = process.env.NOTIFYHUB_E2E_KEY_FILE?.trim()
  const path = explicit && explicit.length > 0 ? explicit : defaultE2EKeyPath()
  try {
    if (!existsSync(path)) return null
    const value = readFileSync(path, "utf8").trim()
    return value.length > 0 ? value : null
  } catch (err) {
    console.error(
      `NotifyHub TUI: could not read e2e key file ${path}: ${err instanceof Error ? err.message : err}`,
    )
    return null
  }
}

function configuredKey(): string | null {
  if (overrideKey !== undefined) return overrideKey
  const env = process.env.NOTIFYHUB_E2E_KEY
  const trimmedEnv = typeof env === "string" ? env.trim() : ""
  if (trimmedEnv) return trimmedEnv
  const fromConfig = readConfigKey()
  if (fromConfig) return fromConfig
  return readKeyFile()
}

function ensureKey(): Promise<CryptoKey | null> {
  keyPromise ??= (async () => {
    const raw = configuredKey()
    if (!raw) return null
    try {
      return await importKey(raw)
    } catch (err) {
      console.error(`NotifyHub TUI: invalid NOTIFYHUB_E2E_KEY (${err instanceof Error ? err.message : err})`)
      return null
    }
  })()
  return keyPromise
}

/** Whether an e2e key is configured in this process. */
export function hasE2EKeySync(): boolean {
  return configuredKey() !== null
}

/** Test/override hook: set the key (or `null` to force "no key") and reset the cache. */
export function setE2EKeyForTests(key: string | null): void {
  overrideKey = key
  keyPromise = null
}

/** Test hook: clear the override so env/file resolution applies again. */
export function resetE2EKeyForTests(): void {
  overrideKey = undefined
  keyPromise = null
}

// ---------------------------------------------------------------------------
// Item helpers
// ---------------------------------------------------------------------------

/**
 * Decrypt one notification item in place semantics:
 * - plaintext data → returned unchanged
 * - envelope + valid key → data replaced by the decrypted payload
 * - envelope without/with-wrong key → `locked: true` (data keeps the envelope
 *   so the UI can show its `kid`)
 */
export async function decryptItem(item: NotificationItem): Promise<NotificationItem> {
  if (!isEnvelope(item.data)) return item
  const key = await ensureKey()
  if (!key) return { ...item, locked: true }
  try {
    const data = await decryptEnvelope(item.data, key)
    return { ...item, data, locked: false }
  } catch {
    return { ...item, locked: true }
  }
}

/** Decrypt a list, preserving order. */
export async function decryptItems(items: NotificationItem[]): Promise<NotificationItem[]> {
  return Promise.all(items.map(decryptItem))
}
