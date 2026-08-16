import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { useTheme } from "../theme"

export function HelpPopup() {
  const { width, height } = useTerminalDimensions()
  const theme = useTheme()
  const popupW = Math.floor(width * 0.8)
  const popupH = 15
  const left = Math.floor((width - popupW) / 2)
  const top = Math.floor((height - popupH) / 2)

  return (
    <box
      position="absolute"
      left={left}
      top={top}
      width={popupW}
      height={popupH}
      borderStyle="rounded"
      borderColor={theme.border}
      backgroundColor={theme.background}
      padding={1}
      flexDirection="column"
      gap={0}
    >
      <text fg={theme.accent} attributes={TextAttributes.BOLD}>
        NotifyHub \u2014 Help
      </text>
      <text fg={theme.dim} />
      <text fg={theme.text}>  v          Toggle select mode</text>
      <text fg={theme.text}>  j/k / \u2191\u2193    Navigate cards (select mode)</text>
      <text fg={theme.text}>  PgUp/PgDn  Move page (select mode)</text>
      <text fg={theme.text}>  Home/End   Jump first/last (select mode)</text>
      <text fg={theme.text}>  Del        Delete card (select mode)</text>
      <text fg={theme.text}>  Esc        Deselect card</text>
      <text fg={theme.text}>  \u2191\u2193/\u2190\u2192    Scroll feed</text>
      <text fg={theme.text}>  s          Status popup</text>
      <text fg={theme.text}>  h / ?      Help (this popup)</text>
      <text fg={theme.text}>  q          Quit</text>
      <text fg={theme.dim} />
      <text fg={theme.dim}>Press any key to close</text>
    </box>
  )
}
