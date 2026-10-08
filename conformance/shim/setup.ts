// The globals a test of Next finds in Jest, as Next's own
// `test/jest-setup-after-env.ts` sets them up.
import * as matchers from "jest-extended";
import { expect, vi } from "vitest";
import { commands } from "vitest/browser";
import "./console.ts";
import { isNextDeploy, isNextDev, isNextStart } from "./e2e-utils.ts";
import { installGate } from "./gate.ts";
import { unsupported } from "./unsupported.ts";

expect.extend(matchers as never);
// The matchers of Next's `test/lib/add-redbox-matchers.ts`, for the dev
// overlay. A run in `dev` mode gets to them.
const redbox = (matcher: string) => () =>
  unsupported(`${matcher}(): Next's dev overlay, which only \`next dev\` has`);
expect.extend({
  toDisplayRedbox: redbox("toDisplayRedbox"),
  toDisplayCollapsedRedbox: redbox("toDisplayCollapsedRedbox"),
});
installGate();
// What the server of an app can fetch from that a tab cannot: see
// `serverNetworkCommand()` in src/vite-plugin.ts.
await commands.conformanceServerNetwork();

Object.assign(globalThis, {
  global: globalThis,
  jest: Object.assign(Object.create(vi) as typeof vi, {
    // The timeouts are the runner's.
    setTimeout: () => {},
    retryTimes: () => {},
  }),
  isNextDev,
  isNextStart,
  isNextDeploy,
  browserName: "chrome",
});
