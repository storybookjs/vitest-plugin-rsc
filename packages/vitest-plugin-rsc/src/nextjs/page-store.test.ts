import { expect, test } from "vitest";
import { PageStore } from "./page-store.ts";

const storeWith = (...setCookies: string[]) => {
  const store = new PageStore();
  store.receive(setCookies);
  return store;
};

test("sets a cookie by its name, whatever its path, domain and flags", () => {
  const store = storeWith(
    "session=ada; Path=/; HttpOnly; Secure; SameSite=Lax",
    "admin=1; Path=/admin",
    "team=core; Domain=example.com",
  );

  expect(store.cookieHeader()).toBe("session=ada; admin=1; team=core");
});

test("keeps a value as the server wrote it", () => {
  const store = storeWith('data={"a":1}', "signed=abc.d+e/f==; Path=/", "encoded=a%20b");

  expect(store.cookieHeader()).toBe('data={"a":1}; signed=abc.d+e/f==; encoded=a%20b');
});

test("replaces a cookie of the same name, where it was", () => {
  const store = storeWith("a=1", "b=2", "a=3; Path=/other");

  expect(store.cookieHeader()).toBe("a=3; b=2");
});

test.for([
  ["Max-Age=0"],
  ["Max-Age=-1"],
  ["Expires=Thu, 01 Jan 1970 00:00:00 GMT"],
  ["max-age=0; Path=/"],
  // `Max-Age` before `Expires`, and the last of each.
  ["Expires=Thu, 01 Jan 2099 00:00:00 GMT; Max-Age=0"],
  ["Max-Age=60; Max-Age=0"],
])("deletes a cookie with %s", ([attributes]) => {
  const store = storeWith("a=1", "b=2");

  store.receive([`a=; ${attributes}`]);

  expect(store.cookieHeader()).toBe("b=2");
});

test.for([
  ["Max-Age=60"],
  ["Expires=Thu, 01 Jan 2099 00:00:00 GMT"],
  ["Max-Age=60; Expires=Thu, 01 Jan 1970 00:00:00 GMT"],
  // Neither is a date or a number: the cookie has no expiry.
  ["Expires=tomorrow; Max-Age=soon"],
])("keeps a cookie that expires later, with %s", ([attributes]) => {
  const store = storeWith(`a=1; ${attributes}`);

  expect(store.cookieHeader()).toBe("a=1");
});

test("sets the cookies of a cookie header", () => {
  const store = storeWith("a=1", "b=2");

  store.seed("b=3;c=4 ; ;d=");

  expect([...store.cookies]).toEqual([
    ["a", "1"],
    ["b", "3"],
    ["c", "4"],
    ["d", ""],
  ]);
});

test("reads a cookie without a `=` as a value without a name, as a browser does", () => {
  const store = storeWith("flag", "a=1");

  expect(store.cookieHeader()).toBe("flag; a=1");
  store.receive(["other"]);
  expect(store.cookieHeader()).toBe("other; a=1");
});

test("has no cookie header without cookies", () => {
  expect(new PageStore().cookieHeader()).toBe("");
  expect(storeWith("", "; Path=/").cookieHeader()).toBe("");
});
