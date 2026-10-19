import { defineServerPreview } from "@storybook/nextjs-vite-rsc/server";
import a11y from "@storybook/addon-a11y";
import { headers } from "next/headers";
import { ThemeProvider } from "../app/components/theme.tsx";
import { db } from "../app/db.ts";
import "./preview.css";

// The preview of the stories of files without "use client", which render on
// the server: server code, as the app's routes are.
export default defineServerPreview({
  // a11y runs after each story, on the document; Storybook's backgrounds,
  // outline, measure and viewport are in every preview.
  addons: [a11y()],
  decorators: [
    // An async decorator that reads the request, around a Client Component
    // that provides context.
    async (Story) => {
      const agent = (await headers()).get("user-agent");
      return (
        <ThemeProvider theme="storybook">
          <div data-testid="server-decorator" data-agent={agent ? "read" : "none"}>
            <Story />
          </div>
        </ThemeProvider>
      );
    },
  ],
  // The database of the app, which the routes read, seeded before each story.
  beforeEach: () => {
    db.clear();
    db.set("visitor", "Grace");
  },
});
