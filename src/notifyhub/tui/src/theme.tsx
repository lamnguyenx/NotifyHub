import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { CliRenderer, ThemeMode } from "@opentui/core"

export interface Theme {
  mode: ThemeMode
  rendererBackground: string
  background: string
  footerBackground: string
  surfaceSelected: string
  border: string
  borderSelected: string
  text: string
  dim: string
  pwdText: string
  truncatedText: string
  accent: string
  accentBg: string
  success: string
  warning: string
  danger: string
  error: string
}

export const DARK_THEME: Theme = {
  mode: "dark",
  rendererBackground: "#0a0a0a",
  background: "#000000",
  footerBackground: "#2a2a2a",
  surfaceSelected: "#2a2a2a",
  border: "#ffffff",
  borderSelected: "#6fc3df",
  text: "#ffffff",
  dim: "#969696",
  pwdText: "#a0a0a0",
  truncatedText: "#505050",
  accent: "#6fc3df",
  accentBg: "#1a3a5c",
  success: "#15ff15",
  warning: "#ffcc00",
  danger: "#ff5555",
  error: "#ef5350",
}

export const LIGHT_THEME: Theme = {
  mode: "light",
  rendererBackground: "#f5f5f5",
  background: "#ffffff",
  footerBackground: "#e4e4e4",
  surfaceSelected: "#dceaf5",
  border: "#4a4a4a",
  borderSelected: "#0f6fae",
  text: "#1a1a1a",
  dim: "#6b6b6b",
  pwdText: "#555555",
  truncatedText: "#9c9c9c",
  accent: "#0f6fae",
  accentBg: "#cde3f3",
  success: "#157f3b",
  warning: "#a06a00",
  danger: "#c22f2f",
  error: "#c22f2f",
}

export const ThemeContext = createContext<Theme>(DARK_THEME)

export function useTheme(): Theme {
  return useContext(ThemeContext)
}

interface ThemeProviderProps {
  renderer: CliRenderer
  children: ReactNode
}

export function ThemeProvider({ renderer, children }: ThemeProviderProps) {
  const [mode, setMode] = useState<ThemeMode | null>(renderer.themeMode ?? null)

  useEffect(() => {
    let alive = true

    if (renderer.themeMode == null) {
      renderer.waitForThemeMode(1_000).then((m) => {
        if (alive && m) setMode(m)
      })
    }

    const onThemeMode = (next: ThemeMode) => setMode(next)
    renderer.on("theme_mode", onThemeMode)

    return () => {
      alive = false
      renderer.off("theme_mode", onThemeMode)
    }
  }, [renderer])

  const theme = mode === "light" ? LIGHT_THEME : DARK_THEME

  useEffect(() => {
    renderer.setBackgroundColor(theme.rendererBackground)
  }, [renderer, theme])

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
}
