import { expect } from "storybook/test";
import FlashCookieProbe from "./flash-cookie-probe.tsx";
import { roundTrip } from "#.storybook/round-trip.ts";
import preview from "#.storybook/preview.server.tsx";

// A Server Component that reads the cookies and headers of its request, and
// sets a cookie in a Server Action: see flash-cookie-probe.test.tsx.
const meta = preview.meta({
  component: FlashCookieProbe,
  tags: ["autodocs"],
});

// What `parameters.nextjs.headers` sends with the request of the story.
export const FromRequest = meta.story({
  parameters: { nextjs: { headers: { cookie: "flash=hello", "x-test-request": "story" } } },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("flash: hello")).toBeVisible();
    await expect(canvas.getByText("request id: story")).toBeVisible();
  },
});

// The Server Action sets the cookie, and the component reads it again.
export const SetFlash = meta.story({
  play: async ({ canvas, userEvent }) => {
    await expect(await canvas.findByText("flash: empty")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Set flash" }));
    await expect(await canvas.findByText("flash: saved", {}, roundTrip)).toBeVisible();
  },
});
