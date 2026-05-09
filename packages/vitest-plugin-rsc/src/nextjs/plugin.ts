import type { Plugin } from "vite";

const reactClientOptimizeDeps = [
  "next/link",
  "next/dist/client/components/app-router-instance.js",
  "next/dist/client/components/navigation.js",
  "next/dist/client/components/redirect-boundary.js",
  "next/dist/client/components/router-reducer/compute-changed-path.js",
  "next/dist/client/components/router-reducer/create-initial-router-state.js",
  "next/dist/client/components/use-action-queue.js",
  "next/dist/shared/lib/app-router-context.shared-runtime.js",
  "next/dist/shared/lib/hooks-client-context.shared-runtime.js",
  "next/dist/shared/lib/server-inserted-html.shared-runtime.js",
];

const clientOptimizeDeps = [
  "next/dist/compiled/@edge-runtime/cookies/index.js",
  "next/dist/server/app-render/action-async-storage.external.js",
  "next/dist/server/app-render/work-async-storage.external.js",
  "next/dist/server/app-render/work-unit-async-storage.external.js",
  "next/dist/client/components/is-next-router-error.js",
  "next/dist/client/components/navigation.react-server.js",
  "next/dist/server/request/cookies.js",
  "next/dist/server/request/headers.js",
  "next/dist/server/web/spec-extension/adapters/headers.js",
  "next/dist/server/web/spec-extension/adapters/request-cookies.js",
  "next/dist/shared/lib/server-inserted-html.shared-runtime.js",
  ...reactClientOptimizeDeps,
];

const nextPublicModuleMocks = ["next/cache", "next/headers", "next/navigation"];

const nextAsyncLocalStoragePolyfillSource = `
const instances = new Set();
function isPromiseLike(value) {
  return value && (typeof value === "object" || typeof value === "function") && typeof value.then === "function";
}
class SequentialAsyncLocalStorage {
  constructor() {
    this.stack = [];
    instances.add(this);
  }
  getStore() {
    return this.stack[this.stack.length - 1];
  }
  run(store, callback, ...args) {
    this.stack.push(store);
    let result;
    try {
      result = callback(...args);
    } catch (error) {
      this.stack.pop();
      throw error;
    }
    if (isPromiseLike(result)) {
      return result.finally(() => {
        this.stack.pop();
      });
    }
    this.stack.pop();
    return result;
  }
  exit(callback, ...args) {
    const previousStack = this.stack;
    this.stack = [];
    let result;
    try {
      result = callback(...args);
    } catch (error) {
      this.stack = previousStack;
      throw error;
    }
    if (isPromiseLike(result)) {
      return result.finally(() => {
        this.stack = previousStack;
      });
    }
    this.stack = previousStack;
    return result;
  }
  enterWith(store) {
    if (this.stack.length === 0) {
      this.stack.push(store);
      return;
    }
    this.stack[this.stack.length - 1] = store;
  }
  disable() {
    this.stack = [];
  }
  static bind(fn) {
    const runInSnapshot = SequentialAsyncLocalStorage.snapshot();
    return (...args) => runInSnapshot(fn, ...args);
  }
  static snapshot() {
    const snapshot = new Map([...instances].map((instance) => [instance, instance.stack.slice()]));
    return (fn, ...args) => {
      const previous = new Map([...instances].map((instance) => [instance, instance.stack.slice()]));
      for (const [instance, stack] of snapshot) {
        instance.stack = stack.slice();
      }
      let result;
      try {
        result = fn(...args);
      } catch (error) {
        restoreStacks(previous);
        throw error;
      }
      if (isPromiseLike(result)) {
        return result.finally(() => restoreStacks(previous));
      }
      restoreStacks(previous);
      return result;
    };
  }
}
function restoreStacks(snapshot) {
  for (const [instance, stack] of snapshot) {
    instance.stack = stack;
  }
}
if (typeof globalThis.AsyncLocalStorage !== "function") {
  globalThis.AsyncLocalStorage = SequentialAsyncLocalStorage;
}
`;

export function vitestPluginNext(): Plugin[] {
  return [
    {
      name: "next-rsc-plugin",
      transformIndexHtml() {
        return [
          {
            tag: "script",
            attrs: { type: "module" },
            children: nextAsyncLocalStoragePolyfillSource,
            injectTo: "head-prepend",
          },
        ];
      },
      config() {
        return {
          define: {
            "process.env": JSON.stringify({}),
            __dirname: JSON.stringify(null),
          },
          optimizeDeps: {
            include: clientOptimizeDeps,
            exclude: nextPublicModuleMocks,
          },
          resolve: {
            alias: {
              "next/link": "next/dist/client/app-dir/link",
              "next/navigation": "vitest-plugin-rsc/dist/nextjs/navigation",
              "next/cache": "vitest-plugin-rsc/nextjs/cache",
              "next/headers": "vitest-plugin-rsc/nextjs/headers",
              "@vercel/turbopack-ecmascript-runtime/browser/dev/hmr-client/hmr-client.ts":
                "next/dist/client/dev/noop-turbopack-hmr",
              "react-server-dom-webpack/client":
                "@vitejs/plugin-rsc/vendor/react-server-dom/client.edge",
            },
          },
          environments: {
            client: {
              optimizeDeps: {
                include: clientOptimizeDeps,
                exclude: nextPublicModuleMocks,
              },
            },
            react_client: {
              resolve: {},
              optimizeDeps: {
                include: reactClientOptimizeDeps,
                exclude: nextPublicModuleMocks,
              },
            },
          },
        };
      },
    },
  ];
}
