import { App } from "./App"
import { renderTui } from "./render"

renderTui(<App />).catch((err) => {
  console.error("Failed to start TUI:", err)
  process.exit(1)
})
