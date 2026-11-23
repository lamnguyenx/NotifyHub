import { MouseButton, TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { useTheme } from "../theme"

export interface ContextMenuItem {
  label: string
  /** Destructive actions render in the danger color. */
  danger?: boolean
  run: () => void
}

interface Props {
  /** Absolute terminal coordinates of the right-click. */
  x: number
  y: number
  title: string
  items: ContextMenuItem[]
  selectedIndex: number
  onHighlight: (index: number) => void
  onSelect: (index: number) => void
}

/**
 * A small absolute context menu anchored at the pointer. It is sized to its
 * longest row and clamped so the whole menu stays inside the terminal.
 */
export function ContextMenu({
  x,
  y,
  title,
  items,
  selectedIndex,
  onHighlight,
  onSelect,
}: Props) {
  const theme = useTheme()
  const { width: termW, height: termH } = useTerminalDimensions()
  const longest = Math.max(title.length, ...items.map((item) => item.label.length))
  const menuW = Math.min(termW - 2, longest + 4)
  // Title + one row per item + top/bottom border.
  const menuH = items.length + 3
  const left = Math.max(0, Math.min(x, termW - menuW - 1))
  const top = Math.max(0, Math.min(y, termH - menuH - 1))

  return (
    <box
      position="absolute"
      left={left}
      top={top}
      width={menuW}
      height={menuH}
      zIndex={200}
      borderStyle="rounded"
      borderColor={theme.border}
      backgroundColor={theme.background}
      flexDirection="column"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <text fg={theme.dim} attributes={TextAttributes.BOLD} wrapMode="none">
        {` ${title} `}
      </text>
      {items.map((item, index) => (
        <box
          key={`${index}-${item.label}`}
          width="100%"
          height={1}
          backgroundColor={index === selectedIndex ? theme.accentBg : theme.background}
          onMouseOver={() => onHighlight(index)}
          onMouseDown={(event) => {
            if (event.button !== MouseButton.LEFT) return
            event.stopPropagation()
            onSelect(index)
          }}
        >
          <text fg={item.danger ? theme.danger : theme.text} wrapMode="none">
            {` ${item.label} `}
          </text>
        </box>
      ))}
    </box>
  )
}
