import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "./App"

async function main() {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    backgroundColor: "#0a0a0a",
  })

  createRoot(renderer).render(<App />)
}

main().catch((err) => {
  console.error("Failed to start TUI:", err)
  process.exit(1)
})
