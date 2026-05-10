import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/testing-library";
import { TestPayloadServer } from "./server.tsx";

test("payload", async () => {
  await renderServer(<TestPayloadServer />);

  await expect
    .element(page.getByTestId("rsc-payload"))
    .toHaveTextContent(/.*true.*true.*true.*true/);
});
