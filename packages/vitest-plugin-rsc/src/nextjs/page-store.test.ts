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

  expect(store.cookieHeader()).toBe("a=1; b=3; c=4; d=");
  // As a `Set-Cookie` without attributes: not `HttpOnly`.
  expect(store.documentCookie()).toBe("a=1; b=3; c=4; d=");
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

test("shows a script the cookies that are not HttpOnly, also the Secure ones", () => {
  const store = storeWith(
    "session=ada; Path=/; HttpOnly",
    "theme=dark; Secure",
    "__Host-csrf=abc; Path=/; Secure",
    "flag",
  );

  expect(store.documentCookie()).toBe("theme=dark; __Host-csrf=abc; flag");
  expect(store.cookieHeader()).toBe("session=ada; theme=dark; __Host-csrf=abc; flag");
});

test("reads HttpOnly without a value, in any case", () => {
  const store = storeWith("a=1; httponly", "b=2; HTTPONLY=", "c=3; HttpOnlyNot");

  expect(store.documentCookie()).toBe("c=3");
});

test("sets and deletes the cookies a script writes, as a browser does", () => {
  const store = storeWith("a=1");

  store.write("b=2; path=/; max-age=604800; Secure; SameSite=Lax");
  store.write("a=3");
  expect(store.documentCookie()).toBe("a=3; b=2");

  store.write("a=; expires=Thu, 01 Jan 1970 00:00:00 GMT");
  expect(store.documentCookie()).toBe("b=2");
});

test("keeps a script from writing an HttpOnly cookie, or changing one", () => {
  const store = storeWith("session=ada; HttpOnly");

  store.write("other=1; HttpOnly");
  store.write("session=mallory");
  store.write("session=; Max-Age=0");

  expect(store.cookieHeader()).toBe("session=ada");
});

test("lets the server turn a cookie of a script into an HttpOnly one, and back", () => {
  const store = new PageStore();
  store.write("a=1");

  store.receive(["a=2; HttpOnly"]);
  expect(store.documentCookie()).toBe("");
  expect(store.cookieHeader()).toBe("a=2");

  store.receive(["a=3"]);
  expect(store.documentCookie()).toBe("a=3");
});
