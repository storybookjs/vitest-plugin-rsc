"use client";

import preview from "../.storybook/preview.server.tsx";

// A file with "use client", whose stories render in the browser, with the
// preview of the server stories.
const meta = preview.meta({ tags: ["!test"] });

export const WrongFactory = meta.story({ render: () => <p>A client story</p> });
