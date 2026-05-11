import { beforeEach, expect, test } from "vitest";
import { cookies, headers, resetHeaders } from "./headers";

beforeEach(() => {
  resetHeaders();
});

test("cookies can be set and read again", async () => {
  const cookieStore = await cookies();

  cookieStore.set("flash", "saved", { httpOnly: true, path: "/" });

  expect(cookieStore.get("flash")?.value).toBe("saved");
  expect((await cookies()).get("flash")?.value).toBe("saved");
});

test("headers can be set and read again", async () => {
  const headersStore = await headers();

  headersStore.set("x-test", "saved");

  expect(headersStore.get("x-test")).toBe("saved");
  expect((await headers()).get("x-test")).toBe("saved");
});

test("resetHeaders clears headers and cookies", async () => {
  (await headers()).set("x-test", "saved");
  (await cookies()).set("flash", "saved", { httpOnly: true, path: "/" });

  resetHeaders();

  expect((await headers()).get("x-test")).toBeNull();
  expect((await cookies()).get("flash")).toBeUndefined();
});
