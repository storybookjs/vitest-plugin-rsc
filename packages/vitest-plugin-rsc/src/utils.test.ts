import { expect, test, vi } from "vitest";
import { versionEvent } from "./page-protocol.ts";

// The page's checks of a dev server's modules, without a browser: a host of
// the page whose server answers the version of the modules of each
// environment, as `versionOf()` in module-versions.ts does. The question goes
// through the host, so it is the same in a browser and in Node.js.

// The version of the modules of each environment, by its name.
const versions = vi.hoisted(() => new Map<string, number>());

vi.mock("virtual:vitest-plugin-rsc/host-modules", () => ({ default: undefined }));
vi.mock("virtual:vitest-plugin-rsc/layers", () => ({ default: undefined }));
vi.mock("virtual:vitest-plugin-rsc/vite-client", () => ({}));
vi.mock("virtual:vitest-plugin-rsc/page-host", () => ({
  default: {
    async request(event: string, data: { environment: string }) {
      if (event !== versionEvent) throw new Error(`no answer for ${event}`);
      return versions.get(data.environment) ?? 1;
    },
  },
}));

const { checkFetchedModules, checkedVersions } = await import("./utils.ts");

test("checks the versions of the modules the page keeps answers about before a page load", async () => {
  const first = await checkedVersions();
  expect(first).toContain("client:1");
  expect(first).toContain("react_client:1");
  // Kept until the next check.
  versions.set("client", 2);
  expect(await checkedVersions()).toBe(first);
  await checkFetchedModules();
  expect(await checkedVersions()).not.toBe(first);
  expect(await checkedVersions()).toContain("client:2");
});
