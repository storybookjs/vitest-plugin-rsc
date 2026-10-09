import { normalizePath, transformWithOxc, type Rolldown } from "vite";

/**
 * The code that Next's runtime and React run: their development code, as
 * `next dev` runs it, or their production code, as `next start` runs it after
 * `next build`. The app's own `process.env.NODE_ENV` is the same for both:
 * see docs/next-routes.md, "Development Or Production".
 */
export type NextBuild = "development" | "production";

export const nextBuilds: readonly NextBuild[] = ["development", "production"];

/**
 * Makes `process.env.NODE_ENV` `"production"` in the files of Next: its
 * runtime and the copies of React, React DOM, the scheduler and the Flight
 * codec that it ships, which every layer runs on. React's entry files then
 * pick its production build by themselves. The files of the app and of its
 * other packages keep the `NODE_ENV` they have. For the dependency optimizer,
 * which pre-bundles all of Next.
 *
 * A define, not a text replacement: Next's files also have `process.env.NODE_ENV`
 * in strings, and assign it. Its name is in the hash of the pre-bundled
 * dependencies, which then are not the ones of the development build.
 */
export function nextProductionPlugin(nextDir: string): Rolldown.Plugin {
  const dist = `${normalizePath(nextDir)}/dist/`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return {
    name: "vitest-plugin-rsc:next-production",
    transform: {
      // Rolldown matches the id with `/` for a separator.
      filter: { id: new RegExp(`^${dist}.*\\.[cm]?js$`), code: "process.env.NODE_ENV" },
      async handler(code, id) {
        const { code: compiled, map } = await transformWithOxc(code, id, {
          lang: "js",
          define: { "process.env.NODE_ENV": '"production"' },
        });
        return { code: compiled, map };
      },
    },
  };
}
