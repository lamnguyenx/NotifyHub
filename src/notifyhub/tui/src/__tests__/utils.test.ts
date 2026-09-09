import { describe, it, expect } from "bun:test"
import {
  parseMessage,
  getTitle,
  getAvatarColor,
  getHostModelColor,
  getHostModelTagColor,
  mixHex,
  HOST_MODEL_DIM_RATIO,
  truncate,
  formatRelativeTime,
} from "../components/NotificationRow"
import { parseSSEStream, type SSEEventHandler } from "../utils/api"
import { safeParse } from "../hooks/useNotifications"

describe("parseMessage", () => {
  it("parses plain text with no tags", () => {
    expect(parseMessage("hello world")).toEqual([{ type: "text", text: "hello world" }])
  })

  it("parses a single tag", () => {
    expect(parseMessage("hello [#tag:info] world")).toEqual([
      { type: "text", text: "hello " },
      { type: "tag", text: "info" },
      { type: "text", text: " world" },
    ])
  })

  it("parses adjacent tags", () => {
    expect(parseMessage("[#tag:a] [#tag:b]")).toEqual([
      { type: "tag", text: "a" },
      { type: "text", text: " " },
      { type: "tag", text: "b" },
    ])
  })

  it("parses truncated segments", () => {
    expect(parseMessage("long text [#truncated:more...]")).toEqual([
      { type: "text", text: "long text " },
      { type: "truncated", text: "more..." },
    ])
  })

  it("returns empty array for empty string", () => {
    expect(parseMessage("")).toEqual([])
  })

  it("handles tag-only string", () => {
    expect(parseMessage("[#tag:info]")).toEqual([{ type: "tag", text: "info" }])
  })

  it("handles mixed tags and truncated", () => {
    expect(parseMessage("a [#tag:x] b [#truncated:y] c")).toEqual([
      { type: "text", text: "a " },
      { type: "tag", text: "x" },
      { type: "text", text: " b " },
      { type: "truncated", text: "y" },
      { type: "text", text: " c" },
    ])
  })
})

describe("getTitle", () => {
  it("extracts last path segment", () => {
    expect(getTitle("/home/user/project")).toBe("project")
  })

  it("returns notifyhub for empty string", () => {
    expect(getTitle("")).toBe("notifyhub")
  })

  it("returns notifyhub for null", () => {
    expect(getTitle(null)).toBe("notifyhub")
  })

  it("returns notifyhub for undefined", () => {
    expect(getTitle(undefined)).toBe("notifyhub")
  })

  it("handles deeply nested path", () => {
    expect(getTitle("/a/b/c/d/e")).toBe("e")
  })

  it("handles root path", () => {
    expect(getTitle("/")).toBe("notifyhub")
  })

  it("handles single segment path", () => {
    expect(getTitle("project")).toBe("project")
  })
})

describe("getAvatarColor", () => {
  it("returns the same color for the same pwd", () => {
    const c1 = getAvatarColor("project")
    const c2 = getAvatarColor("project")
    expect(c1).toBe(c2)
  })

  it("returns a valid hex color from palette", () => {
    const color = getAvatarColor("anything")
    expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it("returns different colors for different inputs (usually)", () => {
    const results = new Set(Array.from({ length: 20 }, (_, i) => getAvatarColor(`pwd-${i}`)))
    expect(results.size).toBeGreaterThan(1)
  })

  it("handles empty string", () => {
    const color = getAvatarColor("")
    expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })
})

describe("getHostModelColor", () => {
  it("returns the same color for the same host model", () => {
    const c1 = getHostModelColor("Mac153")
    const c2 = getHostModelColor("Mac153")
    expect(c1).toBe(c2)
  })

  it("returns a valid hex color from palette", () => {
    const color = getHostModelColor("anything")
    expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it("spreads common short hostnames across distinct colors", () => {
    const colors = ["Mac153", "nuc", "foo", "bar", "claude", "gpt-4"].map(getHostModelColor)
    expect(new Set(colors).size).toBeGreaterThan(3)
  })

  it("handles empty string", () => {
    const color = getHostModelColor("")
    expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })
})

describe("getHostModelTagColor", () => {
  it("returns a valid hex color", () => {
    expect(getHostModelTagColor("Mac153", "#000000")).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it("is darker than the base color on a dark background", () => {
    const base = getHostModelColor("gpt-4")
    const dim = getHostModelTagColor("gpt-4", "#000000")
    const luminance = (hex: string) => {
      const n = parseInt(hex.slice(1), 16)
      return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255)
    }
    expect(luminance(dim)).toBeLessThan(luminance(base))
  })

  it("mixes base color with the given background at the dim ratio", () => {
    const expected = mixHex(getHostModelColor("gpt-4"), "#123456", HOST_MODEL_DIM_RATIO)
    expect(getHostModelTagColor("gpt-4", "#123456")).toBe(expected)
  })

  it("is deterministic for the same inputs", () => {
    expect(getHostModelTagColor("nuc", "#000000")).toBe(getHostModelTagColor("nuc", "#000000"))
  })
})

describe("mixHex", () => {
  it("returns the first color at ratio 1", () => {
    expect(mixHex("#ff0000", "#000000", 1)).toBe("#ff0000")
  })

  it("returns the second color at ratio 0", () => {
    expect(mixHex("#ff0000", "#00ff00", 0)).toBe("#00ff00")
  })

  it("mixes evenly at ratio 0.5", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080")
  })

  it("expands 3-digit hex", () => {
    expect(mixHex("#fff", "#000", 1)).toBe("#ffffff")
  })
})

describe("truncate", () => {
  it("returns short strings unchanged", () => {
    expect(truncate("short", 20)).toBe("short")
  })

  it("truncates long strings with ellipsis", () => {
    expect(truncate("hello world", 8)).toBe("hello w…")
  })

  it("returns exact string if it fits exactly", () => {
    expect(truncate("exact", 5)).toBe("exact")
  })

  it("handles empty string", () => {
    expect(truncate("", 5)).toBe("")
  })

  it("handles max of 0", () => {
    expect(truncate("a", 0)).toBe("…")
  })
})

describe("formatRelativeTime", () => {
  const BASE = new Date("2026-07-05T10:00:00.000Z")
  const ago = (secs: number) => new Date(BASE.getTime() - secs * 1000).toISOString()

  it('returns "" for empty input', () => {
    expect(formatRelativeTime("", BASE)).toBe("")
  })

  it("returns input unchanged for invalid date string", () => {
    expect(formatRelativeTime("not-a-date", BASE)).toBe("not-a-date")
  })

  it('returns "now" for < 60s', () => {
    expect(formatRelativeTime(ago(0), BASE)).toBe("now")
    expect(formatRelativeTime(ago(59), BASE)).toBe("now")
  })

  it('returns "{N}m ago" for 60s–59m 59s', () => {
    expect(formatRelativeTime(ago(60), BASE)).toBe("1m ago")
    expect(formatRelativeTime(ago(119), BASE)).toBe("1m ago")
    expect(formatRelativeTime(ago(120), BASE)).toBe("2m ago")
    expect(formatRelativeTime(ago(59 * 60 + 59), BASE)).toBe("59m ago")
  })

  it('returns "{N}h ago" for 1h–23h on same calendar day', () => {
    const late = new Date("2026-07-05T23:59:00.000Z")
    const early = new Date(late.getTime() - (23 * 60 * 60 + 59 * 60) * 1000)
    expect(early.toISOString()).toBe("2026-07-05T00:00:00.000Z")
    expect(formatRelativeTime(early.toISOString(), late)).toBe("23h ago")

    expect(formatRelativeTime(ago(60 * 60), BASE)).toBe("1h ago")
    expect(formatRelativeTime(ago(3 * 60 * 60), BASE)).toBe("3h ago")
  })

  it('returns "Yesterday" for previous calendar day', () => {
    const evening = new Date("2026-07-04T23:00:00.000Z")
    const lateNight = new Date("2026-07-05T00:30:00.000Z")
    expect(formatRelativeTime(evening.toISOString(), lateNight)).toBe("Yesterday")
  })

  it('returns "MM/DD/YY" for ≥ 2 calendar days ago', () => {
    const past = new Date("2026-07-03T10:00:00.000Z")
    expect(formatRelativeTime(past.toISOString(), BASE)).toBe("07/03/26")

    const older = new Date("2026-05-01T10:00:00.000Z")
    expect(formatRelativeTime(older.toISOString(), BASE)).toBe("05/01/26")
  })

  it("treats future timestamps as now", () => {
    const future = new Date(BASE.getTime() + 10_000).toISOString()
    expect(formatRelativeTime(future, BASE)).toBe("now")
  })
})

describe("parseSSEStream", () => {
  it("parses a single complete event", () => {
    const events: Array<[string, string]> = []
    const onEvent: SSEEventHandler = (event, data) => events.push([event, data])
    const remainder = parseSSEStream('event: init\ndata: [{"id":"1"}]\n\n', onEvent)
    expect(events).toEqual([["init", '[{"id":"1"}]']])
    expect(remainder).toBe("")
  })

  it("returns incomplete data as remainder", () => {
    const events: Array<[string, string]> = []
    const onEvent: SSEEventHandler = (event, data) => events.push([event, data])
    const remainder = parseSSEStream("event: init\ndata: partial", onEvent)
    expect(events).toEqual([])
    expect(remainder).toBe("data: partial")
  })

  it("handles CRLF line endings", () => {
    const events: Array<[string, string]> = []
    const onEvent: SSEEventHandler = (event, data) => events.push([event, data])
    const remainder = parseSSEStream("event: init\r\ndata: hello\r\n\r\n", onEvent)
    expect(events).toEqual([["init", "hello"]])
    expect(remainder).toBe("")
  })

  it("parses multiple events in one buffer", () => {
    const events: Array<[string, string]> = []
    const onEvent: SSEEventHandler = (event, data) => events.push([event, data])
    const remainder = parseSSEStream(
      "event: a\ndata: 1\n\nevent: b\ndata: 2\n\n",
      onEvent,
    )
    expect(events).toEqual([["a", "1"], ["b", "2"]])
    expect(remainder).toBe("")
  })

  it("processes complete events and returns trailing partial data", () => {
    const events: Array<[string, string]> = []
    const onEvent: SSEEventHandler = (event, data) => events.push([event, data])
    const remainder = parseSSEStream(
      "event: a\ndata: 1\n\nevent: b\ndata: ",
      onEvent,
    )
    expect(events).toEqual([["a", "1"]])
    expect(remainder).toBe("data: ")
  })

  it("handles empty buffer", () => {
    const events: Array<[string, string]> = []
    const onEvent: SSEEventHandler = (event, data) => events.push([event, data])
    const remainder = parseSSEStream("", onEvent)
    expect(events).toEqual([])
    expect(remainder).toBe("")
  })

  it("ignores lines without event: or data: prefix", () => {
    const events: Array<[string, string]> = []
    const onEvent: SSEEventHandler = (event, data) => events.push([event, data])
    const remainder = parseSSEStream(
      ":comment\nevent: msg\ndata: hello\n\n",
      onEvent,
    )
    expect(events).toEqual([["msg", "hello"]])
    expect(remainder).toBe("")
  })

  it("accumulates multi-line data", () => {
    const events: Array<[string, string]> = []
    const onEvent: SSEEventHandler = (event, data) => events.push([event, data])
    const remainder = parseSSEStream(
      "event: msg\ndata: line1\ndata: line2\n\n",
      onEvent,
    )
    expect(events).toEqual([["msg", "line1\nline2"]])
    expect(remainder).toBe("")
  })
})

describe("safeParse", () => {
  it("parses valid JSON", () => {
    expect(safeParse('{"a":1}', {})).toEqual({ a: 1 })
  })

  it("returns fallback for invalid JSON", () => {
    expect(safeParse("not json", [])).toEqual([])
  })

  it("returns fallback for empty string", () => {
    expect(safeParse("", null)).toBeNull()
  })

  it("parses array JSON", () => {
    expect(safeParse('[1,2,3]', [])).toEqual([1, 2, 3])
  })
})
