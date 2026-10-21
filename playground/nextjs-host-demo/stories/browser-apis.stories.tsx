"use client";

import NextLink from "next/link";
import { expect } from "storybook/test";
import preview from "../.storybook/preview.tsx";

// A client story renders as a component does in the browser, without Next's
// app: the document has the browser's own cookies, storage and `fetch`, in
// whatever order the preview showed or loaded stories before it. What it
// writes, another document of the origin reads, as a frame of `about:blank`
// does here.
const meta = preview.meta({});

// Whether the document has the browser's own APIs, and what a frame of the
// origin reads of a write. test/storybook.test.ts asks a docs page the same.
async function browserApis(write: string) {
  localStorage.setItem("browser-apis", write);
  sessionStorage.setItem("browser-apis", write);
  document.cookie = `browser-apis=${write}; path=/`;
  const frame = document.body.appendChild(document.createElement("iframe"));
  try {
    const other = frame.contentWindow!;
    return {
      localStorage: Object.getPrototypeOf(localStorage) === Storage.prototype,
      sessionStorage: Object.getPrototypeOf(sessionStorage) === Storage.prototype,
      cookie: !Object.hasOwn(document, "cookie"),
      cookieStore: "cookieStore" in window,
      fetch: Function.prototype.toString.call(fetch).includes("[native code]"),
      stored: other.localStorage.getItem("browser-apis"),
      cookieRead: other.document.cookie.includes(`browser-apis=${write}`),
    };
  } finally {
    frame.remove();
    localStorage.removeItem("browser-apis");
    sessionStorage.removeItem("browser-apis");
    document.cookie = "browser-apis=; path=/; max-age=0";
  }
}

export const BrowserApis = meta.story({
  render: () => <p>The browser's own APIs</p>,
  play: async () => {
    await expect(await browserApis("story")).toEqual({
      localStorage: true,
      sessionStorage: true,
      cookie: true,
      cookieStore: true,
      fetch: true,
      stored: "story",
      cookieRead: true,
    });
  },
});

// A link of Next's, which without its router leaves the navigation to the
// browser. The preview stays, and the Actions panel shows where it went. In
// the manager, Storybook's `<base target="_parent">` of the preview opens
// a link in the manager, as for any story of `@storybook/react`.
export const Link = meta.story({
  render: () => <NextLink href="/elsewhere">Elsewhere</NextLink>,
});
