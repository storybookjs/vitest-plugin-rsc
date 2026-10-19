import preview from "../.storybook/misuse/preview.globals.tsx";

// A story file of a server preview with a global of its own.
const meta = preview.meta({ tags: ["!test"] });

export const Globals = meta.story({ render: () => <p>A server story</p> });
