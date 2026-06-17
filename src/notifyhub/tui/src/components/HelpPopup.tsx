import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"

export function HelpPopup() {
  const { width, height } = useTerminalDimensions()
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
      borderColor="#ffffff"
      backgroundColor="#000000"
      padding={1}
      flexDirection="column"
      gap={0}
    >
      <text fg="#6fc3df" attributes={TextAttributes.BOLD}>
        NotifyHub \u2014 Help
      </text>
      <text fg="#969696" />
      <text fg="#ffffff">  v          Toggle select mode</text>
      <text fg="#ffffff">  j/k / \u2191\u2193    Navigate cards (select mode)</text>
      <text fg="#ffffff">  PgUp/PgDn  Move page (select mode)</text>
      <text fg="#ffffff">  Home/End   Jump first/last (select mode)</text>
      <text fg="#ffffff">  Del        Delete card (select mode)</text>
      <text fg="#ffffff">  Esc        Deselect card</text>
      <text fg="#ffffff">  \u2191\u2193/\u2190\u2192    Scroll feed</text>
      <text fg="#ffffff">  s          Status popup</text>
      <text fg="#ffffff">  h / ?      Help (this popup)</text>
      <text fg="#ffffff">  q          Quit</text>
      <text fg="#969696" />
      <text fg="#969696">Press any key to close</text>
    </box>
  )
}
