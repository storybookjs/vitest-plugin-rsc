import { useState } from "react";
import preview from "../.storybook/preview.ts";
import { Badge } from "../app/components/badge.tsx";

// Stories that use the framework wrong, each with the error that says how to
// do it right: test/storybook.test.ts opens them. A story file without
// "use client" is server code.
const meta = preview.meta({ title: "Misuse/Server", tags: ["!autodocs"] });

// A hook with state, in a render function that runs on the server.
export const HookOnTheServer = meta.story({
  render: function Counter() {
    const [count] = useState(0);
    return <Badge>{count}</Badge>;
  },
});

// A render function that throws when the server renders it: Storybook shows
// its error, not the error page of Next.
export const ThrowsOnTheServer = meta.story({
  render: () => {
    throw new Error("The render function threw on the server");
  },
});

// Neither a component nor a render function: a page, which needs a URL.
export const PageWithoutUrl = meta.story();

// A page, which has its layouts already.
export const PageWithLayouts = meta.story({
  parameters: { nextjs: { url: "/notes/7", layouts: true } },
});
