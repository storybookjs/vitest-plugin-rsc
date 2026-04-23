# Vite 8 + RSC + Rolldown compatibility test

Scaffolded from [`vitejs/vite-plugin-react/packages/plugin-rsc/examples/starter`](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-rsc/examples/starter).

Versions used:
- `vite@8.0.9`
- `@vitejs/plugin-rsc@0.5.24`
- `@vitejs/plugin-react@6.0.1`
- `rolldown@1.0.0-rc.16` (bundled inside vite 8)
- `rolldown-vite@7.3.1` (deprecated, for comparison only)

## Matrix

| Configuration                                              | `vite dev`     | `vite build` |
| ---------------------------------------------------------- | -------------- | ------------ |
| vite 8, default (rollup for build, esbuild for dev deps)   | ok             | ok           |
| vite 8, `experimental.bundledDev: true` (rolldown dev)     | **fails**      | ok           |
| `rolldown-vite@7` override (deprecated, vite 7)            | ok             | ok           |

## Details

### 1. Baseline (rollup)

`vite dev` boots and serves HTTP 200 on `/`. `vite build` completes all 5
environment stages (analyze client refs, analyze server refs, build rsc,
build client, build ssr).

### 2. `experimental.bundledDev: true` on vite 8

Dev server boots but the first page request crashes with two separate errors
coming from rolldown:

**(a) `@vitejs/plugin-rsc` crashes inside rolldown's `generateBundle`:**

```
[plugin rsc:virtual:vite-rsc/assets-manifest]
TypeError: Cannot convert undefined or null to object
    at Function.values (<anonymous>)
    at PluginContextImpl.generateBundle
      (.../@vitejs/plugin-rsc/dist/plugin-DMfc_Eqq.js:1035:36)
    at PluginContextImpl.handler (vite/chunks/node.js)
    at plugin (rolldown/.../bindingify-input-options-*.mjs)
```

The plugin calls `Object.values(bundle)` on a bundle argument that rolldown
passes in as `undefined`/`null` during dev bundling. The same hook works under
rollup at build time.

**(b) Rolldown's parser rejects TypeScript `import type { ... }` syntax:**

```
Parse failure: Parse failed with 1 error:
Expected `from` but found `{`
 7:   decodeFormState,
 8: } from '@vitejs/plugin-rsc/rsc'
 9: import type { ReactFormState } from 'react-dom/client'
                ^
At file: src/framework/entry.rsc.tsx:9:12
```

This is the rolldown `ssrTransformScript` path choking on the type-only import
that is present in the starter's `entry.rsc.tsx`. Removing `import type { ... }`
lines would bypass this particular parser bug, but the plugin-rsc error above
still blocks the feature.

Production `vite build` is unaffected, because `bundledDev` only affects dev.

### 3. `rolldown-vite` override

Pinning `"vite": "npm:rolldown-vite@latest"` installs `rolldown-vite@7.3.1`,
which npm marks deprecated:

> Use this package to migrate from Vite 7 to Vite 8. For the most recent
> updates, migrate to Vite 8 once you're ready.

Under this v7 package, both `vite dev` (reports `ROLLDOWN-VITE v7.3.1`) and
`vite build` complete successfully for the RSC starter. So the RSC plugin +
rolldown combination does work on the older v7 line, but is not yet compatible
with vite 8's upstreamed `experimental.bundledDev`.

## Reproducing

```sh
pnpm install
pnpm exec vite        # dev
pnpm exec vite build  # build
```

Toggle `experimental.bundledDev` in `vite.config.ts` to switch between rollup
(default) and rolldown dev bundling.
