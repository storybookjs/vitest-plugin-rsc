import { expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("renderServer reports metadata route endpoints as unsupported route-handler targets", async () => {
  await expect(renderServer({ url: "/robots.txt" })).rejects.toThrow(/matched Next route handler/);
});
