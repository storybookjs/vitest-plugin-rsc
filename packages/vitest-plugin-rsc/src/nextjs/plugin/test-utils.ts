import { fileURLToPath } from "node:url";

export const fixtureRoot = fileURLToPath(
  new URL("../../../../../playground/nextjs-notes-demo/", import.meta.url),
);
export const noMswFixtureRoot = fileURLToPath(
  new URL("../../../../../playground/nextjs-no-msw-demo/", import.meta.url),
);

export function getHookHandler<T extends (...args: never[]) => unknown>(
  hook: T | { handler: T } | undefined,
): T {
  if (!hook) throw new Error("Expected Vite hook to be defined.");
  return typeof hook === "function" ? hook : hook.handler;
}
