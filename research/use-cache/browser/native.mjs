import { chromium } from "/Users/kasperpeulen/code/github/storybookjs/vitest-plugin-rsc/.claude/worktrees/agent-af4b1127992764e28/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright/index.mjs";
import { execFileSync } from "node:child_process";
const exe = chromium.executablePath();
console.log("exe", exe);
// V8 flag list of this build
try {
  const out = execFileSync(exe, ["--headless", "--no-sandbox", "--js-flags=--help", "about:blank", "--dump-dom"], { encoding: "utf8", timeout: 20000, stdio: ["ignore","pipe","pipe"] });
  const lines = out.split("\n").filter((l) => /async|continuation|context/i.test(l));
  console.log("v8 flags matching async|continuation|context:\n" + lines.slice(0, 60).join("\n"));
} catch (e) { const out = String(e.stdout ?? "") + String(e.stderr ?? ""); console.log("flag dump (from error):\n" + out.split("\n").filter((l) => /async|continuation/i.test(l)).slice(0,60).join("\n")); }
for (const flags of [[], ["--js-flags=--harmony-async-context"], ["--js-flags=--js-async-context"], ["--enable-experimental-web-platform-features"], ["--enable-blink-features=AsyncContext"], ["--enable-features=AsyncContext"], ["--js-flags=--harmony"], ["--js-flags=--js-staging"], ["--js-flags=--experimental"]]) {
  try {
    const browser = await chromium.launch({ args: flags });
    const page = await browser.newPage();
    const r = await page.evaluate(() => ({ AsyncContext: typeof globalThis.AsyncContext, createTask: typeof console.createTask, postTask: typeof globalThis.scheduler?.postTask, yield: typeof globalThis.scheduler?.yield, v: navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0] }));
    console.log(JSON.stringify(flags), JSON.stringify(r));
    await browser.close();
  } catch (e) { console.log(JSON.stringify(flags), "ERR", String(e).slice(0, 160)); }
}
