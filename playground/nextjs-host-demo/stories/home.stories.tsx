import { expect } from "storybook/test";
import preview from "../.storybook/preview.server.tsx";

// A story without a component and a render is the page of the app at its URL,
// in its layouts, which own the document.
const meta = preview.type<{ args: { visitor: string } }>().meta({});

export const Home = meta.story({
  parameters: { nextjs: { url: "/" } },
  // A page has no props: its args are inputs of the story's `beforeEach`,
  // which runs before the request. What it stores is there while the page
  // renders.
  args: { visitor: "Ada" },
  beforeEach: ({ args }) => localStorage.setItem("visitor", args.visitor),
  play: async ({ canvas, canvasElement, userEvent }) => {
    // The page owns the document: its canvas is the page's `<body>`, the
    // story's root.
    await expect(canvasElement).toBe(document.getElementById("storybook-root"));
    await expect(canvasElement.tagName).toBe("BODY");
    await expect(await canvas.findByRole("heading", { name: "Home" })).toBeVisible();
    await expect(localStorage.getItem("visitor")).toBe("Ada");
    // A Client Component of the page, with the page's React.
    await userEvent.click(canvas.getByRole("button", { name: "Count: 0" }));
    await expect(await canvas.findByRole("button", { name: "Count: 1" })).toBeVisible();
  },
});

// A URL of the story's args: a new value loads the page at that URL, here
// Next's not-found page at `/gone`.
export const AtPath = meta.type<{ args: { path: string } }>().story({
  args: { visitor: "Ada", path: "/" },
  argTypes: { path: { control: "select", options: ["/", "/gone"] } },
  parameters: { nextjs: { url: ({ args }) => args.path } },
});
