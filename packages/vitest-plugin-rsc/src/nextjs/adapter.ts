import type { NextAdapter } from "next/dist/build/adapter/build-complete.js";

// The deployment adapter of this plugin. Next's build hands an adapter the
// routes of the server in front of the app, and what it built for each route.
// project.ts calls that part of the build, and gets the two from here.
//
// Next imports this file itself, so it may be another instance of the module
// than the one project.ts has: they share the receivers through the global.

type Receive = (context: Parameters<NonNullable<NextAdapter["onBuildComplete"]>>[0]) => void;

const scope = globalThis as { __vitest_plugin_rsc_next_adapter__?: Map<string, Receive> };

/** Who waits for the outcome of a build, by the build directory it made up for it. */
export const receivers = (scope.__vitest_plugin_rsc_next_adapter__ ??= new Map());

const adapter: NextAdapter = {
  name: "vitest-plugin-rsc",
  onBuildComplete(context) {
    receivers.get(context.distDir)?.(context);
  },
};

export default adapter;
