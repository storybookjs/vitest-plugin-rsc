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

  // The shapes of unjs/unctx's tests of its transform, which does what this
  // one does for Nuxt.
  test("compiles a function on the first line of a module", () => {
    const code = compile(`async () => { await g() }`)!;

    expect(code).toMatch(/^async \(\) => \{const __vitest_plugin_rsc_call__=/);
    expect(() => parseAst(code)).not.toThrow();
  });

  test("leaves a module as it is that has await only in a name", () => {
    for (const code of [
      `export const f = () => awaitable();`,
      `export const f = () => object.await();`,
      `export const f = () => $await();`,
      `export const f = async () => ({ await: 1 }).await;`,
    ]) {
      expect(compile(code), code).toBeUndefined();
    }
  });

  test("compiles an await inside an await, and one that is the statement of an if", () => {
    const code = compile(
      `async function f(x) { await write(await read()); if (x) await g(); else await h(); }`,
    )!;

    expect(code.match(/__hooks__\.s\(/g)).toHaveLength(4);
    expect(() => parseAst(code)).not.toThrow();
  });

  test("compiles an arrow function with one parameter without parentheses", () => {
    const code = compile(`export const f = async route => (await g(route.path)).length > 0;`)!;

    expect(code).toContain("route =>{const ");
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

  "an await inside an await, and an await as the statement of an if": `async function (ALS, log, sleep) {
    const als = new ALS();
    const read = async (ms) => { await sleep(ms); return als.getStore(); };
    const write = async (value) => { await sleep(1); return value + " " + als.getStore(); };
    const handle = async (yes) => {
      const written = await write(await read(2));
      let seen = "";
      if (yes) await sleep(1);
      else await sleep(2);
      seen += als.getStore();
      if (yes) seen += " " + (await read(1)); else seen += " no";
      return written + " " + seen + " " + als.getStore();
    };
    await als.run("request", async () => {
      const cached = als.run("cache", () => handle(true));
      log("page", await handle(false), als.getStore());
      log("cached", await cached, als.getStore());
    });
  }`,

  "an arrow with one parameter without parentheses, and an expression body": `async function (ALS, log, sleep) {
    const als = new ALS();
    const read = async ms => (await sleep(ms), [ms, als.getStore()].join(" "));
    await als.run("request", async () => {
      const cached = als.run("cache", () => read(2));
      log("page", await read(1), als.getStore());
      log("cached", await cached, als.getStore());
    });
  }`,

  "an await of what is not a promise": `async function (ALS, log, sleep) {
    const als = new ALS();
    const read = async () => {
      const values = [await 1, await null, await { then: undefined }, await undefined];
      return values.length + " " + als.getStore();
    };
    await als.run("request", async () => {
      const cached = als.run("cache", read);
      await sleep(1);
      log("page", await read(), als.getStore());
      log("cached", await cached, als.getStore());
    });
  }`,

  // The shapes of the server code of an app, each with a value and the store
  // after an \`await\`, while the rest of the request runs in the meantime.
  "a class method, a static method, and super.method() after an await": `async function (ALS, log, sleep) {
    const als = new ALS();
    class Base {
      async read(ms) { await sleep(ms); return "base " + als.getStore(); }
    }
    class Notes extends Base {
      static async count(ms) { await sleep(ms); return this.name + " " + als.getStore(); }
      async read(ms) {
        await sleep(ms);
        const own = als.getStore();
        return (await super.read(ms)) + ", " + own + " " + als.getStore();
      }
    }
    await als.run("request", async () => {
      const cached = als.run("cache", async () => {
        log(await new Notes().read(2), await Notes.count(1), als.getStore());
      });
      log(await new Notes().read(1), await Notes.count(2), als.getStore());
      await cached;
    });
  }`,

  "a parameter default that is an async arrow, and new.target in a constructor": `async function (ALS, log, sleep) {
    const als = new ALS();
    async function read(load = async () => { await sleep(2); return als.getStore(); }) {
      await sleep(1);
      return (await load()) + " " + als.getStore();
    }
    class Note {
      constructor() {
        this.loaded = (async () => {
          await sleep(1);
          return new.target.name + " " + als.getStore();
        })();
      }
    }
    await als.run("request", async () => {
      const cached = als.run("cache", async () => {
        log(await read(), await new Note().loaded, als.getStore());
      });
      log(await read(), await new Note().loaded, als.getStore());
      await cached;
    });
  }`,

  "an object-literal method": `async function (ALS, log, sleep) {
    const als = new ALS();
    const notes = {
      title: "notes",
      async read(ms) { await sleep(ms); return this.title + " " + als.getStore(); },
      async ["computed"](ms) { await sleep(ms); return als.getStore(); },
    };
    await als.run("request", async () => {
      const cached = als.run("cache", async () => {
        log(await notes.read(2), await notes.computed(1), als.getStore());
      });
      log(await notes.read(1), await notes.computed(2), als.getStore());
      await cached;
    });
  }`,

  "an async arrow with a default and a destructured parameter": `async function (ALS, log, sleep) {
    const als = new ALS();
    const read = async ({ id, tags: [first] = [] }, ms = 1) => {
      await sleep(ms);
      return id + " " + first + " " + als.getStore();
    };
    await als.run("request", async () => {
      const cached = als.run("cache", async () => {
        log(await read({ id: "a", tags: ["x"] }, 2), await read({ id: "b" }), als.getStore());
      });
      log(await read({ id: "c" }), als.getStore());
      await cached;
    });
  }`,

  "arguments and this after an await": `async function (ALS, log, sleep) {
    const als = new ALS();
    async function read(ms) {
      await sleep(ms);
      return [this.name, arguments.length, arguments[1], als.getStore()].join(" ");
    }
    const self = { name: "self" };
    await als.run("request", async () => {
      const cached = als.run("cache", async () => {
        log(await read.call(self, 2, "second"), als.getStore());
      });
      log(await read.call(self, 1, "other", "third"), als.getStore());
      await cached;
    });
  }`,

  "nested async functions: the inner one reads the store of the outer one": `async function (ALS, log, sleep) {
    const als = new ALS();
    async function outer(ms) {
      await sleep(ms);
      async function inner() {
        await sleep(ms);
        return als.getStore();
      }
      const fromInner = await inner();
      const fromArrow = await (async () => { await sleep(1); return als.getStore(); })();
      return [fromInner, fromArrow, als.getStore()].join(" ");
    }
    await als.run("request", async () => {
      const cached = als.run("cache", () => outer(2));
      log("page", await outer(1), als.getStore());
      log("cached", await cached, als.getStore());
    });
  }`,

  "an await in a catch and in a finally": `async function (ALS, log, sleep) {
    const als = new ALS();
    const read = async () => {
      let value;
      try {
        await sleep(1);
        throw new Error("no");
      } catch (error) {
        value = error.message + " " + (await sleep(2), als.getStore());
      } finally {
        await sleep(1);
        value += " " + als.getStore();
      }
      return value;
    };
    await als.run("request", async () => {
      const cached = als.run("cache", read);
      log("page", await read(), als.getStore());
      log("cached", await cached, als.getStore());
    });
  }`,

  "an await in a ternary and in a template literal": `async function (ALS, log, sleep) {
    const als = new ALS();
    const value = async (ms) => { await sleep(ms); return als.getStore(); };
    const read = async (yes) => {
      const chosen = yes ? await value(2) : await value(1);
      return \`\${chosen} \${await value(1)} \${als.getStore()}\`;
    };
    await als.run("request", async () => {
      const cached = als.run("cache", () => read(true));
      log("page", await read(false), als.getStore());
      log("cached", await cached, als.getStore());
    });
  }`,

  "an await in a switch and in a labelled loop": `async function (ALS, log, sleep) {
    const als = new ALS();
    const read = async (kind) => {
      const seen = [];
      switch (kind) {
        case "a":
          await sleep(1);
          seen.push(als.getStore());
        // falls through
        case "b": {
          await sleep(1);
          seen.push(als.getStore());
          break;
        }
        default:
          seen.push("default");
      }
      outer: for (const i of [1, 2, 3]) {
        for (const j of [1, 2]) {
          await sleep(1);
          if (j === 2) continue outer;
          if (i === 3) break outer;
          seen.push(i + ":" + als.getStore());
        }
      }
      return seen.join(" ");
    };
    await als.run("request", async () => {
      const cached = als.run("cache", () => read("a"));
      log("page", await read("b"), als.getStore());
      log("cached", await cached, als.getStore());
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

  test("so does an async generator, which is left as it is: after its first yield", async () => {
    const source = `async function (ALS, log, sleep) {
      const als = new ALS();
      async function* pages() {
        yield als.getStore();
        await sleep(1);
        yield als.getStore();
      }
      await als.run("request", async () => {
        await als.run("cache", async () => {
          for (const page = pages(); ; ) {
            const { value, done } = await page.next();
            if (done) break;
            log(value, als.getStore());
          }
        });
      });
    }`;

    expect(await runWithNode(source)).toEqual(["cache cache", "cache cache"]);
    // The function that calls next() is compiled, and has its store back.
    expect(await runInRequest(source)).toEqual(["cache cache", "request cache"]);
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

// Where no store is entered, as in an app that never calls run(): a compiled
// function is the function it was.
describe("a compiled function with no store entered", () => {
  beforeAll(() => void vi.stubGlobal("__hooks__", asyncFunctionHooks));
  afterAll(() => void vi.unstubAllGlobals());
  afterEach(resetAsyncLocalStorage);

  const source = `({
    name: "notes",
    async read(id) {
      const before = this.storage.getStore();
      await Promise.resolve();
      if (id === "404") throw new Error("No note " + id);
      return [this.name, id, arguments.length, before, this.storage.getStore()];
    },
  })`;

  test.for([
    ["as it is", source],
    ["compiled", transformAsyncFunctions(source, "notes.js", "__hooks__")!.code],
  ])("returns, throws and has its this %s", async ([, code]) => {
    expect(code).toBeDefined();
    const notes = Object.assign((0, eval)(code!), {
      storage: new SequentialAsyncLocalStorage<string>(),
    });

    await expect(notes.read("1", "extra")).resolves.toEqual([
      "notes",
      "1",
      2,
      undefined,
      undefined,
    ]);
    await expect(notes.read("404")).rejects.toThrow("No note 404");
    expect(notes.storage.getStore()).toBeUndefined();
  });

  test("and leaves no store behind, also when it throws", async () => {
    const notes = (0, eval)(transformAsyncFunctions(source, "notes.js", "__hooks__")!.code);
    notes.storage = new SequentialAsyncLocalStorage<string>();
    await notes.read("404").catch(() => {});
    // A store entered after the function is done is not mixed with its own.
    await notes.storage.run("later", async () => {
      expect(await notes.read("1")).toEqual(["notes", "1", 1, "later", "later"]);
    });
    expect(notes.storage.getStore()).toBeUndefined();
  });
});
