import { AsyncLocalStorage as NodeAsyncLocalStorage } from "node:async_hooks";
import { parseAst } from "vite";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import {
  asyncFunctionHooks,
  enterAmbientScope,
  resetAsyncLocalStorage,
  SequentialAsyncLocalStorage,
} from "./async-local-storage.ts";
import { transformAsyncFunctions } from "./async-local-storage-transform.ts";

const compile = (code: string) => transformAsyncFunctions(code, "module.js", "__hooks__")?.code;

describe("the compile step", () => {
  test("puts the calls around an await, and around the function", () => {
    expect(compile(`async function f() { return await g(); }`)).toBe(
      `async function f() {const __vitest_plugin_rsc_call__=__hooks__.e();try{ ` +
        `return __hooks__.r(__vitest_plugin_rsc_call__,await __hooks__.s(__vitest_plugin_rsc_call__,(g()))); ` +
        `}finally{__hooks__.x(__vitest_plugin_rsc_call__)}}`,
    );
  });

  test("puts a call in a catch and in a finally", () => {
    const code = compile(
      `async function f() { try { await g(); } catch { a(); } finally { b(); } }`,
    )!;

    expect(code).toContain(`catch {__hooks__.c(__vitest_plugin_rsc_call__); a(); }`);
    expect(code).toContain(`finally {__hooks__.c(__vitest_plugin_rsc_call__); b(); }`);
  });

  test("leaves a module without an await as it is", () => {
    expect(compile(`export async function f() { return 1; }`)).toBeUndefined();
    expect(compile(`const awaited = 1; export const f = async () => awaited;`)).toBeUndefined();
  });

  test("leaves an await at the top level of a module as it is", () => {
    expect(compile(`const value = await load(); export default value;`)).toBeUndefined();
  });

  test("leaves a function as it is that waits where no call can go", () => {
    expect(compile(`async function f(a) { await 1; for await (const x of a) x; }`)).toBeUndefined();
    expect(compile(`async function f(a) { await 1; { await using x = a; } }`)).toBeUndefined();
    expect(compile(`async function* f(a) { await 1; yield a; }`)).toBeUndefined();
    // Not a function inside it.
    expect(compile(`async function* f() { yield async () => await 1; }`)).toBe(
      `async function* f() { yield async () =>{const __vitest_plugin_rsc_call__=__hooks__.e();try{return( ` +
        `__hooks__.r(__vitest_plugin_rsc_call__,await __hooks__.s(__vitest_plugin_rsc_call__,(1))))` +
        `}finally{__hooks__.x(__vitest_plugin_rsc_call__)}}; }`,
    );
  });

  test("leaves a function as it is that would not parse with its body in a block", () => {
    // In a block, a function declaration cannot have the name of another one, or of a `var`.
    expect(compile(`async function f() { await 1; function g() {} function g() {} }`)).toBe(
      undefined,
    );
    expect(compile(`async function f() { await 1; var g = 1; function g() {} }`)).toBeUndefined();
    expect(
      compile(
        `async function f(x) { await 1; if (x) { var { a: [g] = [] } = x; } function g() {} }`,
      ),
    ).toBeUndefined();

    // Not one whose function declarations have names of their own.
    const code = compile(
      `async function f(x) { await 1; var { g: a, ...b } = x; return g(a, b); function g() {} }`,
    )!;
    expect(code).toContain("__hooks__.e()");
    expect(() => (0, eval)(`"use strict"; (${code})`)).not.toThrow();
  });

  test("throws for a module that does not parse", () => {
    expect(() => compile(`export const f = async () => <p>{await g()}</p>;`)).toThrow();
  });

  test("keeps the directives of a function first", () => {
    expect(compile(`async function f() { "use server"; await g(); }`)).toMatch(
      /^async function f\(\) \{ "use server";;const /,
    );
  });

  test("takes a directive without a semicolon", () => {
    const code = compile(`async function f() {\n  "use server"\n  await g()\n}`)!;

    expect(code).toContain(`"use server";const `);
    expect(() => parseAst(code)).not.toThrow();
  });

  test("keeps the parentheses of an arrow function's body", () => {
    const code = compile(`export const f = async (x = () => 1) => ({ value: await x() });`)!;

    expect(code).toContain("=>{const ");
    expect(code).toContain("return( ({ value: ");
    expect(() => parseAst(code)).not.toThrow();
  });

  test("compiles what parses", () => {
    const code = compile(`
      export default async function f(a, { b } = {}) {
        label: for (const x of a) { if (x) continue label; await x; }
        if (b) await b; else await (b, async () => await a);
        try { await await a; } catch { await a } finally { await 1 }
        return (await a)?.[await b] ?? \`\${await a}\`;
      }
      class A { static async m() { return await this?.n(); } async [k]() { await 1; } #p = async () => await 2; }
      const o = { async m() { for (const x of y) for (const z of x) await z; }, n: async function () { await 1 } };
    `)!;

    expect(() => parseAst(code)).not.toThrow();
  });
});

// Node.js is the measure: every scenario runs as it is with Node's own
// AsyncLocalStorage, and compiled with the one of this package, inside the
// scope of a request. What each logs has to be the same.

type Log = (...values: unknown[]) => void;
type Scenario = (
  AsyncLocalStorage: new () => { run<R>(store: unknown, fn: () => R): R; getStore(): unknown },
  log: Log,
  sleep: (ms: number) => Promise<void>,
  queueMicrotask: (callback: () => void) => void,
) => Promise<void>;

// The time of a scenario: its timers fire in the order of their delay, one
// for a task of the process, however long the process takes. So what a
// scenario logs is in the same order every time it runs.
function createSleep() {
  const timers: { at: number; order: number; run: () => void }[] = [];
  let now = 0;
  let order = 0;
  let ticking = false;
  const tick = () => {
    const next = timers.sort((a, b) => a.at - b.at || a.order - b.order).shift();
    if (!next) return void (ticking = false);
    now = next.at;
    next.run();
    setImmediate(tick);
  };
  return (ms: number) =>
    new Promise<void>((resolve) => {
      timers.push({ at: now + ms, order: order++, run: resolve });
      if (!ticking) setImmediate(tick);
      ticking = true;
    });
}

async function run(
  code: string,
  AsyncLocalStorage: unknown,
  queue: (callback: () => void) => void,
): Promise<string[]> {
  const logged: string[] = [];
  const scenario = (0, eval)(code) as Scenario;
  await scenario(
    AsyncLocalStorage as never,
    (...values) => logged.push(values.map(String).join(" ")),
    createSleep(),
    queue,
  );
  return logged;
}

const runWithNode = (source: string) => run(`(${source})`, NodeAsyncLocalStorage, queueMicrotask);
// The `queueMicrotask` that React's Flight server is compiled to call: globals.ts.
const serverQueueMicrotask = (callback: () => void) =>
  queueMicrotask(SequentialAsyncLocalStorage.bind(callback));

async function runInRequest(source: string, compiled = true): Promise<string[]> {
  const code = compiled
    ? transformAsyncFunctions(`(${source})`, "scenario.js", "__hooks__")!.code
    : `(${source})`;
  const endRequest = enterAmbientScope();
  try {
    return await run(code, SequentialAsyncLocalStorage, serverQueueMicrotask);
  } finally {
    endRequest();
  }
}

// A request, which enters a store, and a part of it that enters another one
// of the same storage: what Next does for a cached function.
const scenarios: Record<string, string> = {
  "an await": `async function (ALS, log, sleep) {
    const als = new ALS();
    await als.run("request", async () => {
      await als.run("cache", async () => {
        log(als.getStore());
        await sleep(1);
        log(als.getStore());
        await null;
        log(als.getStore());
      });
      log(als.getStore());
    });
  }`,

  "the rest of the request, while the part waits": `async function (ALS, log, sleep) {
    const als = new ALS();
    await als.run("request", async () => {
      const cached = als.run("cache", async () => {
        log("cached", als.getStore());
        await sleep(2);
        log("cached", als.getStore());
        await sleep(2);
        log("cached", als.getStore());
      });
      const component = (async () => {
        await sleep(1);
        log("component", als.getStore());
        await sleep(2);
        log("component", als.getStore());
      })();
      await Promise.all([cached, component]);
      log("after", als.getStore());
    });
  }`,

  "a function that the part calls": `async function (ALS, log, sleep) {
    const als = new ALS();
    const read = async (ms) => { await sleep(ms); return als.getStore(); };
    await als.run("request", async () => {
      const cached = als.run("cache", async () => {
        await sleep(1);
        log("cached", await read(2), als.getStore());
        log("cached", (await Promise.all([read(1), read(2)])).join(), als.getStore());
      });
      log("page", await read(2), als.getStore());
      await cached;
      log("page", await read(1), als.getStore());
    });
  }`,

  "a part inside a part": `async function (ALS, log, sleep) {
    const als = new ALS();
    await als.run("request", async () => {
      await als.run("outer", async () => {
        await sleep(1);
        const inner = als.run("inner", async () => {
          await sleep(2);
          log("inner", als.getStore());
        });
        log("outer", als.getStore());
        await sleep(1);
        log("outer", als.getStore());
        await inner;
        log("outer", als.getStore());
      });
      log(als.getStore());
    });
  }`,

  "a store entered after an await": `async function (ALS, log, sleep) {
    const als = new ALS();
    await als.run("request", async () => {
      await sleep(1);
      const value = als.run("cache", () => als.getStore());
      log(value, als.getStore());
    });
  }`,

  "a store that a part leaves": `async function (ALS, log, sleep) {
    const als = new ALS();
    await als.run("request", async () => {
      const outside = als.exit(async () => {
        log("outside", als.getStore());
        await sleep(1);
        log("outside", als.getStore());
      });
      log(als.getStore());
      await outside;
      log(als.getStore());
    });
  }`,

  "a microtask": `async function (ALS, log, sleep, queueMicrotask) {
    const als = new ALS();
    await als.run("request", async () => {
      await sleep(1);
      await als.run("cache", () => new Promise((resolve) => {
        queueMicrotask(async () => {
          log("microtask", als.getStore());
          await sleep(1);
          log("microtask", als.getStore());
          resolve();
        });
      }));
      log(als.getStore());
    });
  }`,

  "an await that rejects": `async function (ALS, log, sleep) {
    const als = new ALS();
    const fail = async () => { await sleep(1); throw new Error("no"); };
    await als.run("request", async () => {
      try {
        await als.run("cache", async () => {
          try {
            await fail();
          } catch {
            log("catch", als.getStore());
            await sleep(1);
            log("catch", als.getStore());
          } finally {
            log("finally", als.getStore());
          }
          try {
            await fail();
          } finally {
            log("finally", als.getStore());
          }
        });
      } catch {
        log("caught", als.getStore());
      }
    });
  }`,

  "an error that is thrown, not awaited": `async function (ALS, log, sleep) {
    const als = new ALS();
    await als.run("request", async () => {
      await als.run("cache", async () => {
        try {
          throw new Error("no");
        } catch {
          log(als.getStore());
        }
        await sleep(1);
        try {
          JSON.parse("{");
        } catch {
          log(als.getStore());
        } finally {
          log(als.getStore());
        }
      });
      log(als.getStore());
    });
  }`,

  "arrow functions and methods": `async function (ALS, log, sleep) {
    const als = new ALS();
    const value = async (ms) => (await sleep(ms), als.getStore());
    const object = { async method(ms) { await sleep(ms); return als.getStore(); } };
    class Class {
      static async method(ms) { await sleep(ms); return als.getStore(); }
      #field = "x";
      async other() { return (await value(1)) + this.#field; }
    }
    await als.run("request", async () => {
      const cached = als.run("cache", async () => {
        log(await value(2), await object.method(1), await Class.method(1), await new Class().other());
      });
      log(await value(1), await object.method(1), await Class.method(2), await new Class().other());
      await cached;
    });
  }`,
};

describe("a store follows the awaits of a compiled function as it does on Node.js", () => {
  beforeAll(() => void vi.stubGlobal("__hooks__", asyncFunctionHooks));
  afterAll(() => void vi.unstubAllGlobals());
  // Also ends the scope of a request that a failed test left open.
  afterEach(resetAsyncLocalStorage);

  for (const [name, source] of Object.entries(scenarios)) {
    test(name, async () => {
      const expected = await runWithNode(source);
      expect(expected.length).toBeGreaterThan(0);

      expect(await runInRequest(source)).toEqual(expected);
    });
  }

  test("a function that is not compiled reads the store of the request after an await", async () => {
    const source = scenarios["an await"]!;

    expect(await runWithNode(source)).toEqual(["cache", "cache", "cache", "request"]);
    expect(await runInRequest(source, false)).toEqual(["cache", "request", "request", "request"]);
  });

  test("so does a function that is left as it is: one with a for await", async () => {
    const source = `async function (ALS, log, sleep) {
      const als = new ALS();
      await als.run("request", async () => {
        await als.run("cache", async () => {
          for await (const value of [sleep(1)]) log(als.getStore());
          await sleep(1);
          log(als.getStore());
        });
        log(als.getStore());
      });
    }`;

    expect(await runWithNode(source)).toEqual(["cache", "cache", "request"]);
    expect(await runInRequest(source)).toEqual(["request", "request", "request"]);
  });

  test("and a callback, of a promise or of a timer", async () => {
    const source = `async function (ALS, log, sleep) {
      const als = new ALS();
      await als.run("request", async () => {
        await als.run("cache", async () => {
          await sleep(1).then(() => log("then", als.getStore()));
          await new Promise((resolve) => setTimeout(() => resolve(log("timer", als.getStore()))));
          log(als.getStore());
        });
      });
    }`;

    expect(await runWithNode(source)).toEqual(["then cache", "timer cache", "cache"]);
    expect(await runInRequest(source)).toEqual(["then request", "timer request", "cache"]);
  });

  test("and a function of a package, until it returns to the compiled function", async () => {
    // Like every function of this file, it is not compiled.
    vi.stubGlobal("ofPackage", async (als: SequentialAsyncLocalStorage<string>) => {
      const before = als.getStore();
      await Promise.resolve();
      return `${before} ${als.getStore()}`;
    });
    const source = `async function (ALS, log) {
      const als = new ALS();
      await als.run("request", async () => {
        await als.run("cache", async () => {
          await null;
          log(await ofPackage(als), als.getStore());
        });
      });
    }`;

    expect(await runWithNode(source)).toEqual(["cache cache cache"]);
    expect(await runInRequest(source)).toEqual(["cache request cache"]);
  });

  test("and what a thenable does in its then(), like a query that runs when it is awaited", async () => {
    const source = `async function (ALS, log) {
      const als = new ALS();
      const query = { then: (resolve) => resolve(als.getStore()) };
      await als.run("request", async () => {
        await als.run("cache", async () => log(await query, als.getStore()));
      });
    }`;

    expect(await runWithNode(source)).toEqual(["cache cache"]);
    expect(await runInRequest(source)).toEqual(["request cache"]);
  });

  test("code that runs while a compiled function waits does not read its store", async () => {
    const als = new SequentialAsyncLocalStorage<string>();
    const sleep = createSleep();
    // With a `catch` after an `await` that did not reject, which has nothing to put back.
    const cached = (0, eval)(
      transformAsyncFunctions(
        `(async function (als, sleep) {
          await sleep(2);
          try { JSON.parse("{"); } catch {}
          await sleep(2);
          return als.getStore();
        })`,
        "cached.js",
        "__hooks__",
      )!.code,
    ) as (als: unknown, sleep: unknown) => Promise<string>;
    const seen: unknown[] = [];
    enterAmbientScope();

    const result = als.run("request", () => als.run("cache", () => cached(als, sleep)));
    // Not compiled, like React, which renders the rest of the page.
    await sleep(1);
    seen.push(als.getStore());
    await sleep(2);
    seen.push(als.getStore());

    expect(await result).toBe("cache");
    seen.push(als.getStore());
    expect(seen).toEqual(["request", "request", "request"]);
  });
});
