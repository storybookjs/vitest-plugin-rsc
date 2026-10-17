import { expect, test } from "vitest";
import { clientReferenceKeyOf } from "./client-reference.ts";

// React's client reference, as `registerClientReference(proxy, key, name)` of
// Vite RSC makes it for each export of a file with `"use client"`: the
// shape of `registerClientReferenceImpl()` in react-server-dom. Its own
// module needs the `react-server` condition, which this test has not.
const referenceOf = (key: string, name: string) =>
  Object.defineProperties(() => {}, {
    $$typeof: { value: Symbol.for("react.client.reference") },
    $$id: { value: `${key}#${name}` },
    $$async: { value: false },
  });

// A module namespace, as the rsc layer has it.
const moduleOf = (exports: Record<string, unknown>) =>
  Object.freeze(Object.assign(Object.create(null), exports) as object);

test("has the reference key of a client reference module", () => {
  const key = "/host/badge.tsx";
  const reference = moduleOf({
    Badge: referenceOf(key, "Badge"),
    default: referenceOf(key, "default"),
  });

  expect(clientReferenceKeyOf(reference)).toBe(key);
  // A key of a build, a hash, and one of a module of Vite RSC for a package.
  expect(clientReferenceKeyOf(moduleOf({ a: referenceOf("5f3a9c1e", "a") }))).toBe("5f3a9c1e");
  const proxy = "/@id/__x00__virtual:vite-rsc/client-package-proxy/framework/by-name";
  expect(clientReferenceKeyOf(moduleOf({ story: referenceOf(proxy, "story") }))).toBe(proxy);
});

test("has none for any other module", () => {
  const key = "/host/badge.tsx";
  const reference = referenceOf(key, "Badge");

  // A module with code of its own, also next to a reference it imports.
  expect(clientReferenceKeyOf(moduleOf({ Badge() {} }))).toBeUndefined();
  expect(clientReferenceKeyOf(moduleOf({ Badge: reference, title: "Badge" }))).toBeUndefined();
  expect(clientReferenceKeyOf(moduleOf({ Badge: reference, meta: null }))).toBeUndefined();
  // A server module that re-exports a reference under another name.
  expect(clientReferenceKeyOf(moduleOf({ Renamed: reference }))).toBeUndefined();
  // The references of two files.
  expect(
    clientReferenceKeyOf(
      moduleOf({ Badge: reference, Card: referenceOf("/host/card.tsx", "Card") }),
    ),
  ).toBeUndefined();
  // A module without exports: nothing of it to use, also of a file with the
  // directive, which ran in the browser layer as its module loaded.
  expect(clientReferenceKeyOf(moduleOf({}))).toBeUndefined();
});
