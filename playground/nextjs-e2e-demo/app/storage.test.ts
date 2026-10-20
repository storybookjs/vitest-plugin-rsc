import { expect, test, vi } from "vitest";

// The page's `localStorage`, a storage of the plugin's: it behaves as the
// browser's own. `cleanup()` runs before every test, so each starts empty.

test("is a Storage", () => {
  expect(localStorage).toBeInstanceOf(Storage);
  expect(sessionStorage).toBeInstanceOf(Storage);
  expect(localStorage).not.toBe(sessionStorage);
  expect(Object.prototype.toString.call(localStorage)).toBe("[object Storage]");
});

test("stores strings, in the order they were set", () => {
  localStorage.setItem("theme", "dark");
  localStorage.setItem("count", 1 as unknown as string);
  localStorage.setItem("theme", "light");

  expect(localStorage.getItem("theme")).toBe("light");
  expect(localStorage.getItem("count")).toBe("1");
  expect(localStorage.getItem("missing")).toBeNull();
  expect(localStorage.length).toBe(2);
  expect([localStorage.key(0), localStorage.key(1), localStorage.key(2)]).toEqual([
    "theme",
    "count",
    null,
  ]);
  // An `unsigned long`, as the browser takes it.
  expect(localStorage.key(-1)).toBeNull();
  expect(localStorage.key(2 ** 32)).toBe("theme");

  localStorage.removeItem("theme");
  expect(localStorage.length).toBe(1);
  localStorage.clear();
  expect(localStorage.length).toBe(0);
});

test("has its items as properties", () => {
  localStorage.setItem("theme", "dark");
  (localStorage as unknown as Record<string, unknown>).count = 1;

  expect(localStorage.theme).toBe("dark");
  expect(localStorage.getItem("count")).toBe("1");
  expect("theme" in localStorage).toBe(true);
  expect(Object.keys(localStorage)).toEqual(["theme", "count"]);
  expect(JSON.stringify(localStorage)).toBe('{"theme":"dark","count":"1"}');
  expect(Object.entries(localStorage)).toEqual([
    ["theme", "dark"],
    ["count", "1"],
  ]);
  const enumerated: string[] = [];
  for (const key in localStorage) enumerated.push(key);
  expect(enumerated.slice(0, 2)).toEqual(["theme", "count"]);

  delete localStorage.theme;
  expect(localStorage.getItem("theme")).toBeNull();
  expect(Object.keys(localStorage)).toEqual(["count"]);
});

test("hides an item behind a name of Storage, as the browser does", () => {
  localStorage.setItem("key", "value");
  localStorage.setItem("length", "10");

  expect(typeof localStorage.key).toBe("function");
  expect(localStorage.length).toBe(2);
  expect(localStorage.getItem("length")).toBe("10");
  expect(JSON.stringify(localStorage)).toBe("{}");
});

test("cannot be frozen, nor have an accessor for an item", () => {
  expect(() => Object.preventExtensions(localStorage)).toThrow(TypeError);
  expect(() => Object.defineProperty(localStorage, "theme", { get: () => "dark" })).toThrow(
    TypeError,
  );
  expect(localStorage.length).toBe(0);
});

test("calls a spy on a method, as an own property", () => {
  const setItem = vi.spyOn(localStorage, "setItem");

  localStorage.setItem("theme", "dark");

  expect(setItem).toHaveBeenCalledWith("theme", "dark");
  expect(localStorage.getItem("theme")).toBe("dark");
  expect(localStorage.getItem("setItem")).toBeNull();
  setItem.mockRestore();
  expect(Object.keys(localStorage)).toEqual(["theme"]);
});

test("passes on a storage event that a script of the document dispatches", () => {
  // As a library tells its hooks in this document of a change.
  const heard: Array<string | null> = [];
  const hear = ({ key }: StorageEvent) => heard.push(key);
  window.addEventListener("storage", hear);
  try {
    window.dispatchEvent(new StorageEvent("storage", { key: "theme", newValue: "dark" }));
  } finally {
    window.removeEventListener("storage", hear);
  }
  expect(heard).toEqual(["theme"]);
});

test("leaves the browser's storage of another document as the browser has it", () => {
  const blank = document.body.appendChild(document.createElement("iframe"));
  const browser = blank.contentWindow!.localStorage;
  try {
    browser.setItem("host-panel", "wide");
    expect(browser.getItem("host-panel")).toBe("wide");
    expect(localStorage.getItem("host-panel")).toBeNull();
  } finally {
    browser.removeItem("host-panel");
    blank.remove();
  }
});
