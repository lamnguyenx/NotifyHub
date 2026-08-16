import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "./App"
import { ThemeProvider, DARK_THEME, LIGHT_THEME } from "./theme"

async function main() {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
  })

  const mode = (await renderer.waitForThemeMode(1_000)) ?? "dark"
  renderer.setBackgroundColor(mode === "light" ? LIGHT_THEME.rendererBackground : DARK_THEME.rendererBackground)

  createRoot(renderer).render(
    <ThemeProvider renderer={renderer}>
      <App />
    </ThemeProvider>,
  )
}

main().catch((err) => {
  console.error("Failed to start TUI:", err)
  process.exit(1)
})
