import { describe, it, expect } from "bun:test"
import {
  parseMessage,
  getTitle,
  getAvatarColor,
  truncate,
  formatTime,
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

describe("formatTime", () => {
  it("formats a valid ISO string to locale time", () => {
    const result = formatTime("2026-07-05T10:30:00.000Z")
    expect(result).toMatch(/^\d{1,2}:\d{2}\s?(AM|PM)?$/i)
  })

  it("returns empty string for empty input", () => {
    expect(formatTime("")).toBe("")
  })

  it("returns input unchanged for invalid date string", () => {
    expect(formatTime("not-a-date")).toBe("not-a-date")
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
