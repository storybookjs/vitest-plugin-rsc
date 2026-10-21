import { expect, test } from "vitest";
import { joinSetCookies } from "./routing.ts";

test("joins the Set-Cookie headers of a rule of next.config into one, for the object Next's build hands an adapter", () => {
  const rule = {
    source: "/:path*",
    headers: [
      { key: "Set-Cookie", value: "a=1; Expires=Wed, 01 Jan 2044 00:00:00 GMT" },
      { key: "X-Rule", value: "yes" },
      { key: "set-cookie", value: "b=2" },
    ],
  };

  expect(joinSetCookies(rule)).toEqual({
    source: "/:path*",
    headers: [
      { key: "X-Rule", value: "yes" },
      { key: "Set-Cookie", value: "a=1; Expires=Wed, 01 Jan 2044 00:00:00 GMT, b=2" },
    ],
  });
});

test("leaves a rule with one Set-Cookie header, or none, as it is", () => {
  const one = { source: "/", headers: [{ key: "Set-Cookie", value: "a=1" }] };
  const none = { source: "/", headers: [{ key: "X-Rule", value: "yes" }] };

  expect(joinSetCookies(one)).toBe(one);
  expect(joinSetCookies(none)).toBe(none);
});
