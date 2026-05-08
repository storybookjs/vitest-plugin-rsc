import { vi, beforeAll, beforeEach, afterEach, inject } from "vitest";
import { cleanup, initialize } from "vitest-plugin-rsc/nextjs/testing-library";
import { page } from "vitest/browser";
import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "#db/schema.ts";
import { reset } from "#lib/db.mock.ts";
import { setCurrentUser } from "#lib/auth-session.mock.ts";
import { deleteFlashCookies } from "#lib/flash-cookie.mock.ts";
import "#app/globals.css";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";

// next/font/google is mocked below, so the --font-geist-* CSS variables that
// RootLayout's className would normally define are absent in tests. Bind the
// fontsource font-family names to those variables on :root so `font-sans`
// resolves to real Geist instead of the browser's serif fallback.
const fontVarsStyle = document.createElement("style");
fontVarsStyle.textContent = `:root {
  --font-geist-sans: "Geist Variable", ui-sans-serif, system-ui, sans-serif;
  --font-geist-mono: "Geist Mono Variable", ui-monospace, monospace;
}`;
document.head.appendChild(fontVarsStyle);

const disableMotionStyle = document.createElement("style");
disableMotionStyle.textContent = `
  *,
  *::before,
  *::after {
    animation: none !important;
    scroll-behavior: auto !important;
    transition-property: none !important;
  }
`;
document.head.appendChild(disableMotionStyle);

vi.mock("next/cache", () => ({ refresh: () => {} }));
vi.mock("#lib/auth.ts", () => ({
  auth: {
    api: {
      deletePasskey: vi.fn(),
      listPasskeys: vi.fn(async () => []),
      signInEmail: vi.fn(),
      signInMagicLink: vi.fn(),
      signOut: vi.fn(),
      signUpEmail: vi.fn(),
    },
  },
}));
vi.mock("#lib/auth-session.ts", () => import("#lib/auth-session.mock.ts"));
vi.mock("#lib/flash-cookie.ts", () => import("#lib/flash-cookie.mock.ts"));
vi.mock("#components/link.tsx", async () => {
  const { createElement } = await import("react");

  type LinkProps = Omit<ComponentPropsWithoutRef<"a">, "href"> & {
    href: string | URL;
  };

  return {
    Link: ({ href, children, ...props }: LinkProps) =>
      createElement("a", { ...props, href: String(href) }, children),
  };
});
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "font-geist-sans" }),
  Geist_Mono: () => ({ variable: "font-geist-mono" }),
}));
vi.mock("next-themes", () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => children,
  useTheme: () => ({ setTheme: vi.fn(), theme: "system" }),
}));

const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;
const TEST_NOW = "2026-05-06T00:00:00.000Z";

let base: PGlite;
let pointerResetTarget: HTMLElement | undefined;

// Vitest mounts React into an existing document, so rendering RootLayout's
// <html>/<body> tags would be invalid. Page tests wrap routes in AppShell and
// keep the matching document-level defaults here.
function applyDocumentDefaults() {
  document.documentElement.lang = "en";
  document.documentElement.className = "antialiased";
  document.documentElement.style.colorScheme = "";
  document.body.className = "";
  localStorage.removeItem("theme");
}

function changeTheme(colorScheme: "light" | "dark") {
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(colorScheme);
  document.documentElement.style.colorScheme = colorScheme;
}

async function resetInteractiveState() {
  if (!pointerResetTarget) {
    pointerResetTarget = document.createElement("div");
    pointerResetTarget.setAttribute("aria-hidden", "true");
    pointerResetTarget.style.cssText = [
      "position:fixed",
      "top:0",
      "left:0",
      "width:1px",
      "height:1px",
      "opacity:0",
      "pointer-events:auto",
      "z-index:2147483647",
    ].join(";");
  }

  if (!pointerResetTarget.isConnected) {
    document.body.appendChild(pointerResetTarget);
  }
  await page.elementLocator(pointerResetTarget).hover();
}

beforeAll(async () => {
  initialize();
  base = await PGlite.create("memory://");
  await base.exec(inject("testSchemaSQL"));
});

beforeEach(async () => {
  await cleanup();
  setCurrentUser(null);
  deleteFlashCookies();
  applyDocumentDefaults();
  const clone = await base.clone();
  if (!(clone instanceof PGlite)) {
    throw new TypeError("Expected PGlite.clone() to return a PGlite instance");
  }
  reset(drizzle(clone, { schema }));

  vi.setSystemTime(new Date(TEST_NOW));

  return () => {
    vi.useRealTimers();
  };
});

afterEach(async () => {
  await resetInteractiveState();
  changeTheme("light");
  await page.viewport(MOBILE_VIEWPORT.width, MOBILE_VIEWPORT.height);
});
