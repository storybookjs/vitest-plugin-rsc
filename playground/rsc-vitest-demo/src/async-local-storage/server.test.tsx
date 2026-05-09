import { screen } from "@testing-library/dom";
import { expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/testing-library";
import { UserAsyncStorageServer } from "./server";

test("user-defined AsyncLocalStorage is available during RSC module evaluation", async () => {
  await renderServer(<UserAsyncStorageServer />);

  expect(await screen.findByTestId("user-async-storage")).toHaveTextContent(
    "user-defined-async-storage",
  );
});
