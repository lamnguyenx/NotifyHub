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
        // console.log("Session idle, conversation ID:", sessionID);
        const configPluginsDir = join(homedir(), '.config', 'opencode', 'plugin');
        const traceChild = spawn(
          join(configPluginsDir, 'opencode-trace.py'),
          [directory, '--notifyhub', '--session', sessionID],
          { cwd: directory, stdio: ['inherit', 'pipe', 'inherit'], env: { VERBOSE_INT: '0', ...process.env } }
        );
        const output = await new Promise<string>((resolve, reject) => {
          let output = '';
          traceChild.stdout.on('data', (data) => { output += data.toString(); });
          traceChild.on("close", (code) => {
            if (code === 0) resolve(output.replace(/\s+$/, ''));
            else reject(new Error(`opencode-trace.py failed: ${code}`));
          });
          traceChild.on("error", reject);
        });
        const message = output;
        const child = spawn(
          join(configPluginsDir, 'notifyhub-push.py'),
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
