import type { Plugin } from "@opencode-ai/plugin";
import { spawn } from "child_process";
import { homedir } from 'os';
import { join } from 'path';

function notifyhubPush(message: string): void {
  const notifyhubPush = join(homedir(), '.config', 'opencode', 'plugin', 'notifyhub-push.py');
  const child = spawn(
    notifyhubPush,
    [message],
    { stdio: "inherit", env: { VERBOSE_INT: '0', ...process.env } }
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

export const NotifyHub: Plugin = ({
  project,
  client,
  $,
  directory,
  worktree,
}) => {
  return Promise.resolve({
    "tool.execute.before": async (input: { tool: string; sessionID: string; callID: string }) => {
      if (input.tool === "question") {
        notifyhubPush("[#opencode.question] OpenCode is asking you a question");
      }
    },
    event: async ({ event }) => {
      if (event.type === "session.idle") {
        const sessionID = (event.properties as { sessionID: string }).sessionID;
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
        notifyhubPush(output);
      }
      else if (event.type === "session.error") {
        const props = event.properties as { sessionID?: string; error?: unknown };
        const errorObj = props.error as { data?: { message?: string }; message?: string } | undefined;
        const errorMessage = errorObj?.data?.message || errorObj?.message || "Something went wrong";
        notifyhubPush(`[#opencode.error] ${errorMessage}`);
      }
      else if ((event.type as string) === "permission.asked" || event.type === "permission.updated") {
        notifyhubPush("[#opencode.permission] OpenCode needs your permission");
      }
      else if ((event.type as string) === "question.asked") {
        notifyhubPush("[#opencode.question] OpenCode is asking you a question");
      }
    },
  });
};
