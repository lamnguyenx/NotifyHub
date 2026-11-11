import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import type { ReactNode } from "react"
import { ThemeProvider, DARK_THEME, LIGHT_THEME } from "./theme"

/** Shared boot path for the app and the prototype harness. */
export async function renderTui(children: ReactNode) {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    // The SSE stream and poll timers keep the event loop alive, so tearing
    // down the screen alone ("q") would leave a hung process behind.
    onDestroy: () => process.exit(0),
  })

  const mode = (await renderer.waitForThemeMode(1_000)) ?? "dark"
  renderer.setBackgroundColor(mode === "light" ? LIGHT_THEME.rendererBackground : DARK_THEME.rendererBackground)

  createRoot(renderer).render(
    <ThemeProvider renderer={renderer}>
      {children}
    </ThemeProvider>,
  )
}
