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
 * pick its production build by themselves. And in the files of the renderers
 * (the `renderers` option), packages that render with React and pick their
 * code by React's build the same way. The files of the app and of its other
 * packages keep the `NODE_ENV` they have. For the dependency optimizer, which
 * pre-bundles all of them.
 *
 * A define, not a text replacement: Next's files also have `process.env.NODE_ENV`
 * in strings, and assign it. Its name, with the renderers in it, is in the
 * hash of the pre-bundled dependencies: they are not the ones of the
 * development build, and another list pre-bundles again.
 */
export function productionPlugin(nextDir: string, renderers: readonly string[]): Rolldown.Plugin {
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Rolldown matches the id with `/` for a separator. A renderer by its name
  // in the path: every copy of it under `node_modules`, as Vite pre-bundles
  // it. Not a package nested under it, which has its own reasons to read
  // `NODE_ENV`.
  const dirs = [
    `^${escape(`${normalizePath(nextDir)}/dist/`)}`,
    ...renderers.map((name) => `/node_modules/${escape(name)}/(?!.*node_modules/)`),
  ];
  return {
    name: ["vitest-plugin-rsc:next-production", ...renderers].join(":"),
    transform: {
      filter: {
        id: new RegExp(`(?:${dirs.join("|")}).*\\.[cm]?js$`),
        code: "process.env.NODE_ENV",
      },
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
