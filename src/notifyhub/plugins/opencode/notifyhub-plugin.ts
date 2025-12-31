import type { Plugin } from "@opencode-ai/plugin"

export const NotifyHub: Plugin = ({ project, client, $, directory, worktree }) => {
  return Promise.resolve({
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        try {
          const response = await fetch("http://localhost:9080/api/notify", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
             body: JSON.stringify({
               message: `${process.env.HOST_ID || 'HOST_ID'} (opencode) : ${directory}`
             })
          })

          if (!response.ok) {
            console.error(`NotifyHub notification failed: ${response.status}`)
          }
        } catch (error) {
          console.error(`NotifyHub notification error: ${error}`)
        }
      }
    }
  })
}