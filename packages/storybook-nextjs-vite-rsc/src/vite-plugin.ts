import type { Plugin } from "vite";

// SB-2260: the Vite plugins that run a Next.js app with React Server
// Components in Storybook, on vitest-plugin-rsc. None until then.
export function storybookNextjsViteRsc(): Plugin[] {
  return [];
}
