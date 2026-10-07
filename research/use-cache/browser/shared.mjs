// Which shapes break the awaiter chain that the attribution by async call stack follows?
import { chromium } from "/Users/kasperpeulen/code/github/storybookjs/vitest-plugin-rsc/.claude/worktrees/agent-af4b1127992764e28/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright/index.mjs";
const browser = await chromium.launch();
const page = await browser.newPage();
const r = await page.evaluate(async () => {
  const out = {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const seen = () => { const l = Error.stackTraceLimit; Error.stackTraceLimit = Infinity; const s = new Error().stack; Error.stackTraceLimit = l; return /__scope_(\d+)__/.exec(s)?.[1] ?? null; };
  let n = 0;
  const run = (fn) => { const name = `__scope_${++n}__`; return { async [name]() { return await fn(); } }[name](); };
  const probe = (label) => { out[label] = seen() === String(n) ? "ok" : `MISS(${seen()})`; };
  await run(async () => {
    const shared = (async () => { await sleep(2); probe("shared promise, awaited twice: inside it"); })();
    await Promise.all([(async () => { await shared; probe("shared promise: 1st awaiter after it"); })(), (async () => { await shared; probe("shared promise: 2nd awaiter after it"); })()]);
    const p = (async () => { await sleep(2); probe("promise with .then(log) and await: inside it"); })();
    p.then(() => {}); await p;
    probe("after it");
    const memo = new Map(); const dedupe = (k) => memo.get(k) ?? memo.set(k, (async () => { await sleep(2); probe("memoized loader, second caller joins: inside it"); return 1; })()).get(k);
    await Promise.all([dedupe("a"), dedupe("a")]);
    await new Promise((res) => { const ch = new MessageChannel(); ch.port1.onmessage = () => { probe("MessageChannel callback"); res(); }; ch.port2.postMessage(1); });
    probe("after awaiting a promise resolved from a callback");
    const stream = new ReadableStream({ async pull(c) { await sleep(1); probe("ReadableStream pull()"); c.enqueue(1); c.close(); } });
    for await (const _ of stream) probe("for await over a stream: body");
    const res = await fetch("data:text/plain,hi"); await res.text(); probe("after await fetch + text()");
  });
  return out;
});
for (const [k, v] of Object.entries(r)) console.log(v.padEnd(12), k);
await browser.close();
