import { defineServerPreview } from "@storybook/nextjs-vite-rsc/server";

// A server preview with a `beforeAll`, which Storybook never runs for it.
export default defineServerPreview({ beforeAll: () => {} });
