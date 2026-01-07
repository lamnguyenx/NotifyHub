import type { Plugin } from "@opencode-ai/plugin";
import { spawn } from "child_process";
import { homedir } from 'os';
import { join } from 'path';

export const NotifyHub: Plugin = ({
  project,
  client,
  $,
  directory,
  worktree,
}) => {
  return Promise.resolve({
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        const sessionID = (event.properties as { sessionID: string }).sessionID;
        console.log("Session idle, conversation ID:", sessionID);
        const configPluginsDir = join(homedir(), '.config', 'opencode', 'plugin');
        const message = `${process.env.HOST_ID || "HOST_ID"} (opencode) - Session: ${sessionID}`;
        const child = spawn(
          join(configPluginsDir, 'notifyhub-push.sh'),
          [message],
          { cwd: directory, stdio: "inherit", env: { VERBOSE_INT: '0', ...process.env } }
        );
        child.on("close", (code) => {
          if (code !== 0) {
            console.error(`NotifyHub notification failed: exit code ${code}`);
          }
        });
        child.on("error", (error) => {
          console.error(`NotifyHub notification error: ${error}`);
        });
      }
    },
  });
};
