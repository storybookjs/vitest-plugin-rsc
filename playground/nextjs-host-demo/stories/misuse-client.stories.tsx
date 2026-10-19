"use client";

import preview from "../.storybook/preview.tsx";

// Client stories that do what only a server story can: React says why not.
const meta = preview.meta({ tags: ["!test"] });

export const AsyncRender = meta.story({
  // @ts-expect-error A Client Component is not async.
  render: async () => <p>{await Promise.resolve("A Server Component")}</p>,
});
