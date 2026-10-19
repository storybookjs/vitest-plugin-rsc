import preview from "../.storybook/misuse/preview.before-all.tsx";

// A story file of a server preview with a `beforeAll`.
const meta = preview.meta({ tags: ["!test"] });

export const BeforeAll = meta.story({ render: () => <p>A server story</p> });
