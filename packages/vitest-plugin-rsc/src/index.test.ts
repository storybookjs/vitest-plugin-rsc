import type { Plugin } from "vite";
import { expect, test } from "vitest";
import { vitestPluginRSC } from "./index";

const viteClientCode = `
const importMetaUrl = new URL(import.meta.url);
const serverHost = __SERVER_HOST__;
const hmrPort = __HMR_PORT__;
const socketHost = \`\${__HMR_HOSTNAME__ || importMetaUrl.hostname}:\${
  hmrPort || importMetaUrl.port
}\${__HMR_BASE__}\`;
const directSocketHost = __HMR_DIRECT_TARGET__;
`;

test("uses the actual browser server host for Vite client websockets", async () => {
  const plugin = getPlugin("rsc:vite-client-websocket");
  const configResolved = getHookHandler(plugin.configResolved);
  const transform = getHookHandler(plugin.transform);

  await configResolved.call(
    {} as never,
    {
      plugins: [{ name: "vitest:browser:config" }],
    } as never,
  );

  const result = await transform.call(
    {} as never,
    viteClientCode,
    "/node_modules/vite/dist/client/client.mjs",
    {} as never,
  );

  expect(getCode(result)).toContain("const serverHost = `${location.host}${__BASE__ || '/'}`;");
  expect(getCode(result)).toContain("const socketHost = `${location.host}${__HMR_BASE__}`;");
  expect(getCode(result)).toContain("const directSocketHost = socketHost;");
});

test("leaves the Vite client untouched outside the Vitest browser server", async () => {
  const plugin = getPlugin("rsc:vite-client-websocket");
  const configResolved = getHookHandler(plugin.configResolved);
  const transform = getHookHandler(plugin.transform);

  await configResolved.call({} as never, { plugins: [] } as never);

  expect(
    await transform.call(
      {} as never,
      viteClientCode,
      "/node_modules/vite/dist/client/client.mjs",
      {} as never,
    ),
  ).toBeUndefined();
});

function getPlugin(name: string): Plugin {
  const plugin = vitestPluginRSC().find((candidate) => candidate.name === name);
  if (!plugin) throw new Error(`Could not find ${name}.`);
  return plugin;
}

function getHookHandler<T extends (...args: never[]) => unknown>(
  hook: T | { handler: T } | undefined,
): T {
  if (!hook) throw new Error("Expected Vite hook to be defined.");
  return typeof hook === "function" ? hook : hook.handler;
}

function getCode(result: unknown): string {
  if (typeof result === "string") return result;
  if (result && typeof result === "object" && "code" in result) {
    return String(result.code);
  }
  throw new Error("Expected transformed code.");
}
