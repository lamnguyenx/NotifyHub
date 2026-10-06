import { describe, it, expect, beforeAll, beforeEach } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  CryptoError,
  E2E_AAD,
  decryptEnvelope,
  decryptItem,
  importKey,
  isEnvelope,
  normalizeKey,
  resetE2EKeyForTests,
  setE2EKeyForTests,
} from "../utils/crypto"
import type { NotificationItem } from "../types"

// ---------------------------------------------------------------------------
// Cross-language fixture — the SAME constants are asserted by pytest in
// tests/notifyhub/backend/test_crypto.py. Both suites validate the key/iv/
// ciphertext vector produced by Python's AESGCM encrypt, so Python-encrypt ⟷
// JS-decrypt (and vice versa, same AAD/alg) compatibility is pinned by CI.
// ---------------------------------------------------------------------------
const FIXTURE_KEY_B64 = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
const FIXTURE_KEY_HEX = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"
const FIXTURE_KID = "630dcd29"
const FIXTURE_IV_B64 = "AAECAwQFBgcICQoL"
const FIXTURE_CT_B64 = "PCC7fraWo3zoY62rk7JbGeKxvVKZAysJSgK4pXUMbN5uMMiOwKwy+wbLDJ6l60lWiSwB6j/2xbNH419rfcHZztJMsR7x6wZDMyDHHsDpZ5BM/7sHVE9zSpWS7bgnndbprpR73IRjpm/9PkO+cYPbuxnIPcLmAZcvsUVS"
const FIXTURE_PAYLOAD = {
  message: "[#tag:fixture] hello from cross-language fixture",
  pwd: "/tmp/fixture",
  host_model: "nuc",
}

const FIXTURE_ENVELOPE = {
  e2e: 1,
  alg: "A256GCM",
  kid: FIXTURE_KID,
  iv: FIXTURE_IV_B64,
  ct: FIXTURE_CT_B64,
}

const WRONG_KEY_B64 = "CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk="

let fixtureKey: CryptoKey

beforeAll(async () => {
  fixtureKey = await importKey(FIXTURE_KEY_B64)
})

beforeEach(() => {
  setE2EKeyForTests(null)
})

describe("isEnvelope", () => {
  it("detects a valid envelope", () => {
    expect(isEnvelope(FIXTURE_ENVELOPE)).toBe(true)
  })

  it("rejects plaintext payloads", () => {
    expect(isEnvelope(FIXTURE_PAYLOAD)).toBe(false)
    expect(isEnvelope({ e2e: 1, alg: "A256GCM", iv: "aXY=" })).toBe(false)
    expect(isEnvelope(null)).toBe(false)
    expect(isEnvelope("text")).toBe(false)
  })

  it("rejects wrong alg or version", () => {
    expect(isEnvelope({ ...FIXTURE_ENVELOPE, alg: "AES128CBC" })).toBe(false)
    expect(isEnvelope({ ...FIXTURE_ENVELOPE, e2e: 2 })).toBe(false)
  })
})

describe("normalizeKey", () => {
  it("accepts base64", () => {
    expect(normalizeKey(FIXTURE_KEY_B64)).toHaveLength(32)
  })

  it("accepts 64-char hex", () => {
    expect(normalizeKey(FIXTURE_KEY_HEX)).toEqual(normalizeKey(FIXTURE_KEY_B64))
  })

  it("rejects wrong-size keys", () => {
    expect(() => normalizeKey("c2hvcnQ=")).toThrow(CryptoError)
  })

  it("rejects garbage", () => {
    expect(() => normalizeKey("not a key!!")).toThrow(CryptoError)
  })
})

describe("decryptEnvelope (cross-language fixture)", () => {
  it("decrypts the Python-encrypted fixture", async () => {
    const payload = await decryptEnvelope(FIXTURE_ENVELOPE, fixtureKey)
    expect(payload).toEqual(FIXTURE_PAYLOAD)
  })

  it("fails with the wrong key", async () => {
    const wrongKey = await importKey(WRONG_KEY_B64)
    await expect(decryptEnvelope(FIXTURE_ENVELOPE, wrongKey)).rejects.toThrow(CryptoError)
  })

  it("fails on tampered ciphertext", async () => {
    const ctBytes = atob(FIXTURE_CT_B64).split("")
    ctBytes[0] = String.fromCharCode(ctBytes[0].charCodeAt(0) ^ 0xff)
    const tampered = { ...FIXTURE_ENVELOPE, ct: btoa(ctBytes.join("")) }
    await expect(decryptEnvelope(tampered, fixtureKey)).rejects.toThrow(CryptoError)
  })

  it("fails on tampered iv", async () => {
    const ivBytes = atob(FIXTURE_IV_B64).split("")
    ivBytes[0] = String.fromCharCode(ivBytes[0].charCodeAt(0) ^ 0xff)
    const tampered = { ...FIXTURE_ENVELOPE, iv: btoa(ivBytes.join("")) }
    await expect(decryptEnvelope(tampered, fixtureKey)).rejects.toThrow(CryptoError)
  })

  it("uses the same AAD as the Python side", () => {
    expect(E2E_AAD).toBe("notifyhub:v1")
  })
})

describe("decryptItem", () => {
  const envelopeItem: NotificationItem = {
    id: "n-1",
    data: { ...FIXTURE_ENVELOPE },
    timestamp: "2026-10-06T00:00:00+00:00",
  }

  const plainItem: NotificationItem = {
    id: "n-2",
    data: { message: "plain", pwd: "/tmp", host_model: "nuc" },
    timestamp: "2026-10-06T00:00:00+00:00",
  }

  it("decrypts an envelope when the key is set", async () => {
    setE2EKeyForTests(FIXTURE_KEY_B64)
    const decoded = await decryptItem(envelopeItem)
    expect(decoded.locked).toBe(false)
    expect(decoded.data).toEqual(FIXTURE_PAYLOAD)
  })

  it("marks items locked when no key is configured", async () => {
    const decoded = await decryptItem(envelopeItem)
    expect(decoded.locked).toBe(true)
    expect(isEnvelope(decoded.data)).toBe(true) // envelope kept for kid display
  })

  it("marks items locked with the wrong key", async () => {
    setE2EKeyForTests(WRONG_KEY_B64)
    const decoded = await decryptItem(envelopeItem)
    expect(decoded.locked).toBe(true)
  })

  it("passes plaintext items through unchanged", async () => {
    const decoded = await decryptItem(plainItem)
    expect(decoded).toEqual(plainItem)
    expect(decoded.locked).toBeUndefined()
  })
})

// Env vars touched by key resolution, saved/restored around each test.
const RESOLUTION_ENV_KEYS = [
  "NOTIFYHUB_E2E_KEY",
  "NOTIFYHUB_E2E_KEY_FILE",
  "NOTIFYHUB_CONFIG",
  "XDG_CONFIG_HOME",
] as const

function snapshotEnv(): Record<string, string | undefined> {
  return Object.fromEntries(RESOLUTION_ENV_KEYS.map((k) => [k, process.env[k]]))
}

function restoreEnv(prev: Record<string, string | undefined>, dir?: string): void {
  if (dir) rmSync(dir, { recursive: true, force: true })
  for (const k of RESOLUTION_ENV_KEYS) {
    if (prev[k] === undefined) delete process.env[k]
    else process.env[k] = prev[k]
  }
  resetE2EKeyForTests()
}

const resolutionItem: NotificationItem = {
  id: "n-resolve",
  data: { ...FIXTURE_ENVELOPE },
  timestamp: "2026-10-06T00:00:00+00:00",
}

describe("key file resolution", () => {
  it("reads the key from NOTIFYHUB_E2E_KEY_FILE when env is unset", async () => {
    const prev = snapshotEnv()
    const dir = mkdtempSync(join(tmpdir(), "nh-e2e-"))
    const path = join(dir, "e2e.key")
    writeFileSync(path, FIXTURE_KEY_B64 + "\n")
    process.env.NOTIFYHUB_E2E_KEY_FILE = path
    process.env.XDG_CONFIG_HOME = dir // no config.jsonl here → isolate config
    delete process.env.NOTIFYHUB_E2E_KEY
    delete process.env.NOTIFYHUB_CONFIG
    resetE2EKeyForTests()
    try {
      const decoded = await decryptItem(resolutionItem)
      expect(decoded.locked).toBe(false)
      expect(decoded.data).toEqual(FIXTURE_PAYLOAD)
    } finally {
      restoreEnv(prev, dir)
    }
  })

  it("a wrong key in the file leaves items locked", async () => {
    const prev = snapshotEnv()
    const dir = mkdtempSync(join(tmpdir(), "nh-e2e-"))
    const path = join(dir, "e2e.key")
    writeFileSync(path, WRONG_KEY_B64 + "\n")
    process.env.NOTIFYHUB_E2E_KEY_FILE = path
    process.env.XDG_CONFIG_HOME = dir
    delete process.env.NOTIFYHUB_E2E_KEY
    delete process.env.NOTIFYHUB_CONFIG
    resetE2EKeyForTests()
    try {
      const decoded = await decryptItem(resolutionItem)
      expect(decoded.locked).toBe(true)
    } finally {
      restoreEnv(prev, dir)
    }
  })
})

describe("config file resolution", () => {
  it("reads e2e.key from config.jsonl (JSON5 with comments)", async () => {
    const prev = snapshotEnv()
    const dir = mkdtempSync(join(tmpdir(), "nh-cfg-"))
    const cfg = join(dir, "config.jsonl")
    writeFileSync(
      cfg,
      `{\n  // consolidated settings\n  "e2e": { "enabled": true, "key": "${FIXTURE_KEY_B64}" }\n}\n`,
    )
    process.env.NOTIFYHUB_CONFIG = cfg
    process.env.XDG_CONFIG_HOME = dir
    delete process.env.NOTIFYHUB_E2E_KEY
    delete process.env.NOTIFYHUB_E2E_KEY_FILE
    resetE2EKeyForTests()
    try {
      const decoded = await decryptItem(resolutionItem)
      expect(decoded.locked).toBe(false)
      expect(decoded.data).toEqual(FIXTURE_PAYLOAD)
    } finally {
      restoreEnv(prev, dir)
    }
  })

  it("env key takes precedence over the config file", async () => {
    const prev = snapshotEnv()
    const dir = mkdtempSync(join(tmpdir(), "nh-cfg-"))
    const cfg = join(dir, "config.jsonl")
    writeFileSync(cfg, `{ "e2e": { "key": "${WRONG_KEY_B64}" } }\n`)
    process.env.NOTIFYHUB_CONFIG = cfg
    process.env.XDG_CONFIG_HOME = dir
    process.env.NOTIFYHUB_E2E_KEY = FIXTURE_KEY_B64
    resetE2EKeyForTests()
    try {
      const decoded = await decryptItem(resolutionItem)
      expect(decoded.locked).toBe(false)
    } finally {
      restoreEnv(prev, dir)
    }
  })

  it("config key takes precedence over the key file", async () => {
    const prev = snapshotEnv()
    const dir = mkdtempSync(join(tmpdir(), "nh-cfg-"))
    const cfg = join(dir, "config.jsonl")
    writeFileSync(cfg, `{ "e2e": { "key": "${FIXTURE_KEY_B64}" } }\n`)
    const keyfile = join(dir, "e2e.key")
    writeFileSync(keyfile, WRONG_KEY_B64 + "\n")
    process.env.NOTIFYHUB_CONFIG = cfg
    process.env.NOTIFYHUB_E2E_KEY_FILE = keyfile
    process.env.XDG_CONFIG_HOME = dir
    delete process.env.NOTIFYHUB_E2E_KEY
    resetE2EKeyForTests()
    try {
      const decoded = await decryptItem(resolutionItem)
      expect(decoded.locked).toBe(false)
    } finally {
      restoreEnv(prev, dir)
    }
  })

  it("a malformed config file falls through to the key file", async () => {
    const prev = snapshotEnv()
    const dir = mkdtempSync(join(tmpdir(), "nh-cfg-"))
    const cfg = join(dir, "config.jsonl")
    writeFileSync(cfg, "{ this is not valid json5 ")
    const keyfile = join(dir, "e2e.key")
    writeFileSync(keyfile, FIXTURE_KEY_B64 + "\n")
    process.env.NOTIFYHUB_CONFIG = cfg
    process.env.NOTIFYHUB_E2E_KEY_FILE = keyfile
    process.env.XDG_CONFIG_HOME = dir
    delete process.env.NOTIFYHUB_E2E_KEY
    resetE2EKeyForTests()
    try {
      const decoded = await decryptItem(resolutionItem)
      expect(decoded.locked).toBe(false)
      expect(decoded.data).toEqual(FIXTURE_PAYLOAD)
    } finally {
      restoreEnv(prev, dir)
    }
  })
})
