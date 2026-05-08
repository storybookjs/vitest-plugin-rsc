import { screen } from "@testing-library/dom";
import { userEvent } from "@testing-library/user-event";
import { expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/testing-library";
import { ClientCounter } from "../client-counter/client";

test("renders through the WebSocket React client transport", async () => {
  const removedHttpFallback = await fetch("/@vite/invoke-react-client?data={}");
  expect(removedHttpFallback.status).not.toBe(200);

  await renderServer(<ClientCounter />);
  await userEvent.click(await screen.findByRole("button", { name: "client-counter: 0" }));
  expect(await screen.findByRole("button", { name: "client-counter: 1" })).toBeVisible();
});
