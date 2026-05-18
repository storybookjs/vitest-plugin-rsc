import { expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";

test("renderServer reports route handlers as unsupported render targets", async () => {
  await expect(() => renderServer({ url: "/api/next-request-response" })).rejects.toThrow(
    /matched Next route handler "\/api\/next-request-response\/route"/,
  );
});
