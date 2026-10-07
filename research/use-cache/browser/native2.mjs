import { chromium } from "/Users/kasperpeulen/code/github/storybookjs/vitest-plugin-rsc/.claude/worktrees/agent-af4b1127992764e28/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright/index.mjs";
const targets = [
  { name: "system chrome", opts: { channel: "chrome" } },
  { name: "pw chromium-1243", opts: { executablePath: process.env.HOME + "/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" } },
];
const flagSets = [[], ["--js-flags=--harmony-async-context"], ["--js-flags=--js-async-context"], ["--js-flags=--async-context"], ["--enable-experimental-web-platform-features"], ["--enable-blink-features=AsyncContext"], ["--enable-features=AsyncContext"], ["--js-flags=--js-staging"], ["--js-flags=--harmony"]];
for (const t of targets) for (const flags of flagSets) {
  try {
    const browser = await chromium.launch({ ...t.opts, headless: true, args: flags });
    const page = await browser.newPage();
    const r = await page.evaluate(() => ({ AsyncContext: typeof globalThis.AsyncContext, v: navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0] }));
    console.log(t.name, JSON.stringify(flags), JSON.stringify(r));
    await browser.close();
  } catch (e) { console.log(t.name, JSON.stringify(flags), "ERR", String(e).slice(0, 200)); }
}
