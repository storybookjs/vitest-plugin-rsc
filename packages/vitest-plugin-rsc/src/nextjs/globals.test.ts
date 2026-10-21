import { afterAll, expect, test, vi } from "vitest";

vi.mock("virtual:vitest-plugin-rsc/next-env", () => ({
  default: { ASSIGNED_FIRST: "of-the-env", NOT_ASSIGNED: "of-the-env" },
}));

afterAll(() => {
  delete process.env.ASSIGNED_FIRST;
  delete process.env.NOT_ASSIGNED;
});

test("fills the env of the run into the names that the page's process.env does not have", async () => {
  process.env.ASSIGNED_FIRST = "of-the-page";

  await import("./globals.ts");

  expect(process.env.ASSIGNED_FIRST).toBe("of-the-page");
  expect(process.env.NOT_ASSIGNED).toBe("of-the-env");
});
