import { chromium, firefox, webkit } from "/Users/kasperpeulen/code/github/storybookjs/vitest-plugin-rsc/.claude/worktrees/agent-af4b1127992764e28/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright/index.mjs";
import fs from "node:fs";
const fn = fs.readFileSync(new URL("./stack-page.js", import.meta.url), "utf8");
for (const [name, type, opts] of [["chromium", chromium, {}], ["chromium-1243 (153)", chromium, { executablePath: process.env.HOME + "/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" }], ["system chrome", chromium, { channel: "chrome" }]]) {
  try {
    const browser = await type.launch(opts);
    const page = await browser.newPage();
    const r = await page.evaluate(`(${fn.replace(/^\/\/.*\n/, "")})()`);
    console.log(name); for (const [k, v] of Object.entries(r)) console.log("  ", v.padEnd(12), k);
    await browser.close();
  } catch (e) { console.log(name, "ERR", String(e).slice(0, 300)); }
}
