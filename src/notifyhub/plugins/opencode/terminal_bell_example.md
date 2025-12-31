# Terminal Bell

A simple OpenCode plugin to ring the terminal bell once a request is complete.

## How to Install?
On Linux, save `terminal-bell.ts` to `~/.config/opencode/plugin/terminal-bell.ts`.

## terminal-bell.ts
```ts
import type { Plugin } from "@opencode-ai/plugin"

export const TerminalBell: Plugin = async ({ project, client, $, directory, worktree }) => {
  return {
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        console.log("Session went idle")
        await Bun.write(Bun.stdout, "\x07")
      }
    }
  }
}
```

## VS Code
If you are using VSCode & SSH, you need to enable terminalBell in the settings, in a project that will be `.vscode/settings.json` the settings file can be as simple as:
```json
{
    "accessibility.signals.terminalBell": {
        "sound": "on",
        "announcement": "auto",
    }
}
```

## Credit
[CarlosGtrz](https://x.com/CarlosGtrz/status/1969623801240412281)