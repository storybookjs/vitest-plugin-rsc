# Internals

These pages explain how the plugin works inside. They're written for contributors and coding agents, so they're precise and long, and they list edge cases one by one. You don't need any of this to use the plugin. For that, start with the [README](../../README.md) and the [Next.js guide](../nextjs-guide.md).

| Page                                       | What's in it                                                                                                                                                                      |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Next.js: How It Works](next-routes.md)    | The full walkthrough: how the plugin ports Next's build to Vite and runs Next's runtime in three Vite environments. Ends with [Not Yet](next-routes.md#not-yet), every known gap. |
| [Architecture](architecture.md)            | The part without Next.js: two Vite environments, and the bridge between them.                                                                                                     |
| [Next.js conformance](next-conformance.md) | Next's own e2e tests, run against the plugin, with the reason for every failure.                                                                                                  |
| [Performance benchmarks](performance.md)   | How to run and compare the benchmarks.                                                                                                                                            |
| [Releasing](releasing.md)                  | Release Please, alpha releases and preview packages.                                                                                                                              |

## The big picture

Next.js is two things: a **build** (written for webpack and Turbopack) and a **runtime** (the request handler, renderer, router and caches in `next/dist`). Only the build is tied to a bundler. So the plugin redoes the build with Vite, asks Next's own build code for everything that isn't bundling, and runs the runtime unchanged.

Next compiles an app into three layers, each with its own module graph and its own copy of React. Here, each layer is a Vite environment, and all three run in the browser:

| Layer     | Runs                                                                                         | Vite environment |
| --------- | -------------------------------------------------------------------------------------------- | ---------------- |
| `rsc`     | Server Components, Server Actions, route handlers, and deciding which requests go to the app | `client`         |
| `ssr`     | Next's route module, the HTML renderer, the server in front of the app                       | `next_ssr`       |
| `browser` | Next's router and your Client Components                                                     | `react_client`   |

Your test runs in `client`, the `rsc` layer. That's why a module your test imports is the same instance your Server Components read. A test file with `"use client"` runs in `react_client` instead.
