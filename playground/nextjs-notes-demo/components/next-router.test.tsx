import { screen, waitFor } from "@testing-library/dom";
import { userEvent } from "@testing-library/user-event";
import { test } from "vitest";
import {
  expectToHaveBeenNavigatedTo,
  NextRouter,
  renderServer,
} from "vitest-plugin-rsc/nextjs/testing-library";
import { NextRouterProbe } from "./next-router-probe";

test("NextRouter provides app router hooks and records navigation", async () => {
  await renderServer(
    <NextRouter url="/note/123/hello?q=test" route="/note/[id]/[slug]">
      <NextRouterProbe />
    </NextRouter>,
  );

  await userEvent.click(
    await screen.findByRole("button", {
      name: "/note/123/hello:123:hello:test",
    }),
  );

  await waitFor(() => expectToHaveBeenNavigatedTo({ pathname: "/note/next" }));
});
