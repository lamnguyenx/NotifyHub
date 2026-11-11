import { PrototypeApp } from "./prototypes/PrototypeApp"
import { renderTui } from "./render"

renderTui(<PrototypeApp />).catch((err) => {
  console.error("Failed to start TUI prototype:", err)
  process.exit(1)
})
