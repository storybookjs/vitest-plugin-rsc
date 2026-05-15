# Draft Upstream Issue: Preserve CJS `"use client"` Boundaries During RSC Dep Optimization

## Title

`@vitejs/plugin-rsc` should preserve CommonJS `"use client"` dependency boundaries during RSC dependency optimization

## Summary

When an RSC/server module imports a CommonJS dependency that re-exports relative modules, and one of those relative modules starts with `"use client"`, the RSC dependency optimizer can inline that client module into the server optimized chunk. That executes client-only code under React Server aliases instead of turning the module into a client reference.

This is observable with Next's real installed `next/dist/server/app-render/entry-base.js`. Next ships this file as a server-layer CommonJS module. It re-exports client components such as `next/dist/client/components/layout-router.js` through relative `require()` calls. Those target files carry `"use client"`. Next's webpack/Turbopack layer metadata preserves them as client references, but Vite/Rolldown dep optimization does not currently have equivalent boundary information for this CommonJS shape.

## Minimal Shape

```js
// server-entry.cjs
exports.LayoutRouter = require("./layout-router").default;
```

```js
// layout-router.js
"use client";

exports.default = function LayoutRouter() {
  return null;
};
```

```js
// rsc-entry.js
import { LayoutRouter } from "example/server-entry.cjs";

export function render() {
  return LayoutRouter;
}
```

In an RSC environment, optimizing `example/server-entry.cjs` should not inline and execute `layout-router.js` as server code. The `"use client"` module should become a client-reference proxy, or the dependency optimizer should leave a boundary that the RSC transform can turn into a client reference.

## Expected Behavior

- The optimized RSC chunk for the server entry preserves the `"use client"` dependency boundary.
- Client modules reached through CommonJS `require()` from a server dependency are registered through `registerClientReference`.
- Client modules are not evaluated under React Server aliases.
- Browser/SSR environments still import the real client module.

## Actual Behavior Seen In This Repository

Without a Next-specific optimizer plugin, optimizing the real `next/dist/server/app-render/entry-base.js` can inline client modules such as `next/dist/client/components/layout-router.js` into the RSC optimized dependency. That makes Next client internals execute in the RSC environment, where React resolves to server aliases.

The local workaround in `vitest-plugin-rsc` is intentionally narrow:

- keep importing the real installed `next/dist/server/app-render/entry-base.js`;
- intercept only relative imports from that entry-base module;
- resolve the installed target file and check that it has a real `"use client"` directive;
- emit a `registerClientReference` proxy in the RSC environment;
- emit a re-export of the real module in browser/SSR environments.

## Local Regression Coverage

`packages/vitest-plugin-rsc/src/nextjs/plugin-aliases.test.ts` warms the real RSC dependency optimizer for a project-rooted Next install, imports `next/dist/server/app-render/entry-base.js`, and asserts that the optimized chunk contains `registerClientReference` proxies and does not inline `next/dist/client/components/layout-router.js`.

## Exit Criteria For The Local Adapter

The Next-specific `next-rsc-entry-base-client-references` adapter can be deleted or reduced once upstream `@vitejs/plugin-rsc` has a generic fixture that preserves CommonJS `"use client"` dependency boundaries during RSC dep optimization. The replacement needs to cover both esbuild and Rolldown optimizer paths, because this repository runs against current Vite and newer Rolldown-backed optimizer builds.
