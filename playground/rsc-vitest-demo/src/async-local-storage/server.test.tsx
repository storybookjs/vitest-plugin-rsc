import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/testing-library";
import { UserAsyncStorageServer } from "./server";

test("user-defined AsyncLocalStorage is available during RSC module evaluation", async () => {
  await renderServer(<UserAsyncStorageServer />);

  await expect
    .element(page.getByTestId("user-async-storage"))
    .toHaveTextContent("user-defined-async-storage");
});
