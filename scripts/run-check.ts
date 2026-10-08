import { execFile } from "node:child_process";
import path from "node:path";

// What Vitest sets in the environment of a worker. A check is the plugin
// without Vitest, so its process gets the environment without these: with a
// NODE_ENV of `test`, Vite and Next make another app of it.
const ofVitest = /^(VITEST(_.*)?|TEST|NODE_ENV|MODE|DEV|PROD|SSR|BASE_URL)$/;

/**
 * Runs the check script of a playground, see check-host.ts, in a process of
 * its own. Rejects with what the script printed when a check failed.
 */
export function runCheck(script: string, ...args: string[]): Promise<void> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !ofVitest.test(name)),
    // Next's types say that an environment always has a NODE_ENV.
  ) as NodeJS.ProcessEnv;
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [script, ...args],
      { env, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (!error) return resolve();
        const command = [path.basename(script), ...args].join(" ");
        reject(new Error(`${command} failed.\n${stdout}\n${stderr}`, { cause: error }));
      },
    );
  });
}
