import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { AppView } from "../App"
import { truncate } from "../components/NotificationRow"
import { useTheme } from "../theme"
import type { NotificationItem } from "../types"
import { buildScenarios } from "./scenarios"

interface BarProps {
  index: number
  total: number
  title: string
  frozen: boolean
}

function PrototypeBar({ index, total, title, frozen }: BarProps) {
  const theme = useTheme()
  const { width } = useTerminalDimensions()
  const narrow = width < 60
  const label = narrow
    ? `PROTO ${index}/${total} ${truncate(title, 16)}  |  n/p  |  t:${frozen ? "frozen" : "live"}`
    : `PROTOTYPE ${index}/${total}  ${title}  |  n/p: scenario  |  t: time ${frozen ? "frozen" : "live"}  |  mock data`
  return (
    <box width="100%" height={1} flexShrink={0} backgroundColor={theme.accentBg} paddingX={1}>
      <text fg={theme.accent} wrapMode="none">
        {label}
      </text>
    </box>
  )
}

/**
 * Standalone TUI harness. It runs the real AppView and components with fake
 * data, so layout, theme, selection, popups and overflow behave like the app.
 * See docs/_meta/how-to-prototype.md.
 */
export function PrototypeApp() {
  const [scenarioIdx, setScenarioIdx] = useState(0)
  const [referenceNow, setReferenceNow] = useState(() => new Date())
  const [frozenAt, setFrozenAt] = useState<Date | null>(null)
  const [deleted, setDeleted] = useState<string[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMoreOverride, setHasMoreOverride] = useState<boolean | null>(null)
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scenarios = useMemo(() => buildScenarios(referenceNow), [referenceNow])
  const scenario = scenarios[scenarioIdx] ?? scenarios[0]!
  const hasMore = hasMoreOverride ?? scenario.hasMore

  const clearLoadTimer = useCallback(() => {
    if (loadTimer.current) {
      clearTimeout(loadTimer.current)
      loadTimer.current = null
    }
  }, [])

  useEffect(() => clearLoadTimer, [clearLoadTimer])

  const selectScenario = useCallback(
    (index: number) => {
      const count = scenarios.length
      const next = ((index % count) + count) % count
      clearLoadTimer()
      setLoadingMore(false)
      setHasMoreOverride(null)
      setScenarioIdx(next)
      setDeleted([])
      if (!frozenAt) setReferenceNow(new Date())
    },
    [scenarios.length, frozenAt, clearLoadTimer],
  )

  const toggleFreeze = useCallback(() => {
    if (frozenAt) {
      setFrozenAt(null)
      setReferenceNow(new Date())
    } else {
      const t = new Date()
      setFrozenAt(t)
      setReferenceNow(t)
    }
  }, [frozenAt])

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore) return
    setLoadingMore(true)
    loadTimer.current = setTimeout(() => {
      // One fake page is enough to show the loading state and the end of
      // history; the prototype does not append rows.
      setLoadingMore(false)
      setHasMoreOverride(false)
      loadTimer.current = null
    }, 700)
  }, [hasMore, loadingMore])

  const handleDelete = useCallback((id: string) => {
    setDeleted((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }, [])

  useKeyboard((key) => {
    if (key.name === "n") {
      selectScenario(scenarioIdx + 1)
      return
    }
    if (key.name === "p") {
      selectScenario(scenarioIdx - 1)
      return
    }
    if (key.name === "t") {
      toggleFreeze()
      return
    }
    if (/^[1-9]$/.test(key.name)) {
      const index = Number(key.name) - 1
      if (index < scenarios.length) selectScenario(index)
    }
  })

  const notifications: NotificationItem[] = scenario.notifications.filter(
    (n) => !deleted.includes(n.id),
  )

  return (
    <AppView
      header={
        <PrototypeBar
          index={scenarioIdx + 1}
          total={scenarios.length}
          title={scenario.title}
          frozen={frozenAt !== null}
        />
      }
      notifications={notifications}
      agentStatus={scenario.agentStatus}
      serverInfo={scenario.serverInfo}
      hasMore={hasMore}
      loadingMore={loadingMore}
      handleDelete={handleDelete}
      loadMore={loadMore}
      lockedCount={notifications.filter((n) => n.locked).length}
      now={frozenAt ?? undefined}
    />
  )
}
