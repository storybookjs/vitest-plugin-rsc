import { screen } from "@testing-library/dom";
import { userEvent } from "@testing-library/user-event";
import { expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

import FlashCookieProbe from "./flash-cookie-probe";

test("server actions can set cookies for the rerendered server tree", async () => {
  await renderServer(<FlashCookieProbe />);

  expect(await screen.findByText("flash: empty")).toBeVisible();

  await userEvent.click(await screen.findByRole("button", { name: "Set flash" }));

  expect(await screen.findByText("flash: saved")).toBeVisible();
});
