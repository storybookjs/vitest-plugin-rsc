"use client";

import preview from "../.storybook/preview.ts";

// A page of the app in a story file with "use client", whose stories render
// in the browser: see misuse.stories.tsx.
const meta = preview.meta({ title: "Misuse/Client", tags: ["!autodocs"] });

export const PageInAClientFile = meta.story({ parameters: { nextjs: { url: "/notes/7" } } });
