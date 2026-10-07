// Which code can be attributed to an open scope by the async call stack?
async () => {
  const results = {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function scopeOnStack() {
    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = 200;
    const stack = new Error().stack;
    Error.stackTraceLimit = limit;
    return /__scope_(\d+)__/.exec(stack)?.[1] ?? null;
  }
  let n = 0;
  // run(fn): fn runs "inside" a scope; returns [id, promise]
  function run(fn) {
    const id = String(++n);
    const name = `__scope_${id}__`;
    const marker = { async [name]() { return await fn(); } }[name];
    return [id, marker()];
  }
  const probe = (label, id) => { results[label] = scopeOnStack() === id ? "ok" : `MISS(${scopeOnStack()})`; };

  async function helper(label, id) { await sleep(1); probe(label, id); await null; probe(label + " 2nd", id); }
  async function* gen() { yield 1; await sleep(1); yield 2; }

  const [id, p] = run(async () => {
    const me = String(n);
    probe("sync start", me);
    await null; probe("after await null", me);
    await sleep(1); probe("after await timer promise", me);
    await helper("in awaited async helper", me);
    await Promise.all([helper("Promise.all[0]", me), helper("Promise.all[1]", me)]);
    await Promise.allSettled([helper("Promise.allSettled", me)]);
    await Promise.any([helper("Promise.any", me)]);
    await Promise.race([helper("Promise.race", me)]);
    await helper("helper().then(x=>x)", me).then((x) => x);
    await sleep(1).then(() => probe("inside .then callback", me));
    await new Promise((resolve) => setTimeout(() => { probe("inside setTimeout callback", me); resolve(); }, 1));
    await (async () => { await sleep(1); probe("async arrow IIFE", me); })();
    for await (const v of gen()) probe("for await body", me);
    await { then(res) { setTimeout(() => res(1), 1); } }; probe("after await custom thenable", me);
    try { await Promise.reject(new Error("x")); } catch { probe("in catch after rejected await", me); }
    const unawaited = helper("not awaited (fire and forget)", me); await sleep(5); await unawaited;
    queueMicrotask(() => probe("queueMicrotask callback", me));
    // deep chain
    const deep = async (d) => { if (d === 0) { await sleep(1); probe("depth 50 chain", me); } else await deep(d - 1); };
    await deep(50);
    // result consumed by .then by the caller (like React / createLazyResult does)
    return 1;
  });
  // A sibling running concurrently must NOT be attributed.
  const sibling = (async () => { await sleep(2); results["sibling sees no scope"] = scopeOnStack() === null ? "ok" : "LEAK"; })();
  // two concurrent scopes
  const order = [];
  const mk = (ms) => run(async () => { const me = String(n); await sleep(ms); order.push(scopeOnStack() === me); await sleep(ms); order.push(scopeOnStack() === me); });
  const [, a] = mk(3); const [, b] = mk(2);
  await Promise.all([p, sibling, a, b]);
  results["two concurrent scopes each see their own"] = order.every(Boolean) ? "ok" : "WRONG " + order;
  // consumer side: lazy-result shape (two .then reactions on fn's promise), does fn still see marker?
  {
    let seen;
    const name = "__scope_777__";
    const inner = async () => { await sleep(1); seen = scopeOnStack(); };
    const marker = { async [name]() { return await inner(); } }[name];
    const pending = Promise.resolve(marker());
    pending.then(() => {}); await pending.then(() => {});
    results["consumer attaches two .then to marker promise"] = seen === "777" ? "ok" : `MISS(${seen})`;
  }
  // cost
  {
    const t0 = performance.now(); for (let i = 0; i < 10000; i++) scopeOnStack(); const shallow = (performance.now() - t0) / 10000;
    let deepCost; const deep = async (d) => { if (d === 0) { await sleep(1); const t = performance.now(); for (let i = 0; i < 2000; i++) scopeOnStack(); deepCost = (performance.now() - t) / 2000; } else await deep(d - 1); };
    await deep(30);
    results["cost per lookup (µs) shallow / 30 async frames"] = `${(shallow * 1000).toFixed(1)} / ${(deepCost * 1000).toFixed(1)}`;
  }
  results.ua = navigator.userAgent.match(/(Chrome|Firefox|Version)\/[\d.]+/)?.[0];
  return results;
}
