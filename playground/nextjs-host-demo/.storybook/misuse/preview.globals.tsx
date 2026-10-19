import { defineServerPreview } from "@storybook/nextjs-vite-rsc/server";

// A server preview with a global that preview.tsx does not declare.
export default defineServerPreview({ initialGlobals: { locale: "nl" } });
