import preview from "../.storybook/preview.tsx";

// A file without "use client", which is server code, with the preview of the
// client stories: `preview.server.tsx` forgotten.
const meta = preview.meta({ tags: ["!test"] });

export const ClientPreview = meta.story({ render: () => <p>A server story</p> });
