import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { EventEmitter } from "node:events"

const pushes: string[] = []
mock.module("child_process", () => ({
  spawn: (_script: string, args: string[]) => {
    pushes.push(args[0])
    return new EventEmitter()
  },
}))
const { default: plugin } = await import("../../../src/notifyhub/plugins/opencode/notifyhub-plugin")

const originalEnv = { ...process.env }
const originalFetch = globalThis.fetch
const posts: Array<{ state: string; session_id: string; host: string }> = []
let cleanup: (() => void) | undefined
let nextSession = 0

beforeEach(() => {
  pushes.length = 0
  posts.length = 0
  process.env.NOTIFYHUB_CLI_ENABLED = "true"
  process.env.NOTIFYHUB_CLI_HOST = "127.0.0.1"
  process.env.NOTIFYHUB_CLI_PORT = "9080"
  process.env.NOTIFYHUB_PLUGINS_OPENCODE_MUTED_AGENTS = "empty"
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body))
    posts.push({ state: String(url).split("/").at(-1)!, session_id: body.session_id, host: body.host })
    return new Response("{}", { status: 200 })
  }) as typeof fetch
})

afterEach(async () => {
  cleanup?.()
  cleanup = undefined
  await Bun.sleep(10)
  globalThis.fetch = originalFetch
  process.env = { ...originalEnv }
})

async function harness() {
  const sessionID = `permission-test-${nextSession++}`
  const requests = new Map<string, { id: string; sessionID: string }>()
  const events: any[] = []
  let wake: (() => void) | undefined
  let listRequests = async () => [...requests.values()]
  const directory = process.cwd()
  const ctx = {
    location: { directory },
    session: {
      get: async () => ({ location: { directory }, agent: "build" }),
      context: async () => [{ type: "user", text: "test task" }],
    },
    permission: { list: () => listRequests() },
    event: {
      subscribe: async function* ({ signal }: { signal: AbortSignal }) {
        signal.addEventListener("abort", () => wake?.(), { once: true })
        while (!signal.aborted) {
          if (!events.length) await new Promise<void>((resolve) => { wake = resolve })
          if (signal.aborted) return
          while (events.length) yield events.shift()
        }
      },
    },
  }
  cleanup = await plugin.setup(ctx as any) as () => void
  async function emit(type: string, data: object = {}) {
    events.push({ type, data: { sessionID, ...data } })
    wake?.()
    await Bun.sleep(20)
  }
  return {
    sessionID,
    requests,
    emit,
    setList: (fn: typeof listRequests) => { listRequests = fn },
    async ask(id = "request-1") {
      requests.set(id, { id, sessionID })
      await emit("permission.asked", { id })
    },
    async reply(id = "request-1") {
      requests.delete(id)
      await emit("permission.replied", { requestID: id, reply: "once" })
    },
  }
}

describe("OpenCode permission notifications", () => {
  test("status uses the configured machine label like completed notifications", async () => {
    process.env.HOST_MODEL = " MS-7E70 "
    const h = await harness()
    await h.emit("session.execution.started")
    expect(posts.at(-1)?.host).toBe("MS-7E70")
  })

  test("autoaccepted requests never notify or report blocked", async () => {
    const h = await harness()
    await h.ask()
    await h.reply()
    await Bun.sleep(1100)
    expect(pushes).toEqual([])
    expect(posts.some((post) => post.state === "blocked")).toBe(false)
    expect(posts.at(-1)?.state).toBe("running")
  })

  test("a request still waiting for a person notifies once and resumes on reply", async () => {
    const h = await harness()
    await h.ask()
    await h.emit("permission.asked", { id: "request-1" })
    await Bun.sleep(1100)
    expect(pushes).toEqual(["[#opencode.permission] OpenCode needs your permission"])
    expect(posts.map((post) => post.state)).toEqual(["blocked"])
    await h.reply()
    expect(posts.map((post) => post.state)).toEqual(["blocked", "running"])
  })

  test("the pending API suppresses a resolved request even if its reply event was missed", async () => {
    const h = await harness()
    await h.ask()
    h.requests.clear()
    await Bun.sleep(1100)
    expect(pushes).toEqual([])
    expect(posts).toEqual([])
  })

  test("reply during the pending API check cancels an in-flight notification", async () => {
    const h = await harness()
    let finish!: (requests: Array<{ id: string; sessionID: string }>) => void
    let checked!: () => void
    const checking = new Promise<void>((resolve) => { checked = resolve })
    h.setList(() => {
      checked()
      return new Promise((resolve) => { finish = resolve })
    })
    await h.ask()
    await checking
    await h.reply()
    finish([{ id: "request-1", sessionID: h.sessionID }])
    await Bun.sleep(30)
    expect(pushes).toEqual([])
    expect(posts.some((post) => post.state === "blocked")).toBe(false)
  })

  test("idle cancels a pending alert", async () => {
    const h = await harness()
    await h.ask()
    await h.emit("session.idle")
    await Bun.sleep(1100)
    expect(pushes).toEqual([])
    expect(posts.map((post) => post.state)).toEqual(["idle"])
  })

  test("plugin disposal cancels pending alerts", async () => {
    const h = await harness()
    await h.ask()
    cleanup?.()
    await Bun.sleep(1100)
    expect(pushes).toEqual([])
    expect(posts).toEqual([])
  })

  test("replying to one request keeps another notified request blocked", async () => {
    const h = await harness()
    await h.ask("request-1")
    await h.ask("request-2")
    await Bun.sleep(1100)
    expect(pushes).toHaveLength(2)
    await h.reply("request-1")
    expect(posts.map((post) => post.state)).toEqual(["blocked"])
    await h.reply("request-2")
    expect(posts.map((post) => post.state)).toEqual(["blocked", "running"])
  })
})
