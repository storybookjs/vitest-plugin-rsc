import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { expect, test } from "vitest";
import { useNextSwcTransform } from "./swc-transform-plugin";

const fixtureRoot = fileURLToPath(
  new URL("../../../../playground/nextjs-notes-demo/", import.meta.url),
);

test("uses Next SWC to rewrite exported next/font calls", async () => {
  const code = await transformWithNextSwc(
    `
      import { Geist } from "next/font/google";

      export const geist = Geist({
        subsets: ["latin"],
        variable: "--font-geist",
      });
    `,
    "app/next-apis/swc-font-fixture.tsx",
  );

  expect(code).toContain("next/font/google/target.css?");
  expect(code).toContain('"path":"app/next-apis/swc-font-fixture.tsx"');
  expect(code).toContain('"variableName":"geist"');
  expect(code).toContain("export { geist }");
});

test("uses Next SWC to rewrite default-exported next/font/local calls", async () => {
  const code = await transformWithNextSwc(
    `
      import localFont from "next/font/local";

      const localSans = localFont({
        src: "./fixtures/local-sans.woff2",
        variable: "--font-local-sans",
      });

      export default localSans;
    `,
    "app/next-apis/swc-local-font-fixture.tsx",
  );

  expect(code).toContain("next/font/local/target.css?");
  expect(code).toContain('"path":"app/next-apis/swc-local-font-fixture.tsx"');
  expect(code).toContain('"variableName":"localSans"');
  expect(code).toContain("export default localSans");
});

test("uses Next SWC to add next/dynamic loadable metadata", async () => {
  const code = await transformWithNextSwc(
    `
      import dynamic from "next/dynamic";

      const Lazy = dynamic(() => import("./lazy-message"));

      export default function Page() {
        return <Lazy />;
      }
    `,
    "app/next-apis/swc-dynamic-fixture.tsx",
  );

  expect(code).toContain("loadableGenerated");
  expect(code).toContain("app/next-apis/swc-dynamic-fixture.tsx -> ");
  expect(code).toContain("./lazy-message");
});

async function transformWithNextSwc(source: string, relativeFile: string) {
  const previousCwd = process.cwd();
  const plugin = useNextSwcTransform();
  const configResolved = getHookHandler(plugin.configResolved);
  const transform = getHookHandler(plugin.transform);

  process.chdir(fixtureRoot);
  try {
    await configResolved.call({} as never, { root: fixtureRoot, mode: "test" } as never);

    const result = await transform.call(
      {
        environment: { name: "client" },
        getCombinedSourcemap: () => null,
      } as never,
      source,
      path.join(fixtureRoot, relativeFile),
    );

    if (!result || typeof result === "string") {
      throw new Error("Expected Next SWC transform to return a transform result.");
    }

    return result.code;
  } finally {
    process.chdir(previousCwd);
  }
}

function getHookHandler<T extends (...args: never[]) => unknown>(
  hook: T | { handler: T } | undefined,
): T {
  if (!hook) throw new Error("Expected Vite hook to be defined.");
  return typeof hook === "function" ? hook : hook.handler;
}
