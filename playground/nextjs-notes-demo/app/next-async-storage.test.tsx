import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { nextAsyncStorage } from "./next-async-storage/probe.tsx";

test("renders a real App Page with Next async storage scope", async () => {
  await nextAsyncStorage.run({ route: "/next-async-storage" }, () =>
    renderServer({ url: "/next-async-storage" }),
  );

  await expect
    .element(page.getByText("Next async storage route: /next-async-storage"))
    .toBeInTheDocument();
});
