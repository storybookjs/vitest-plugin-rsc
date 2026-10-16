"use client";

import { setLocale } from "../app/lib/locale.ts";

// What vitest.setup.client.tsx imports, like a file that calls `i18n.init()`.
// It runs in the browser layer, in the graph of the tab that the test files
// with `"use client"` share, once: a module loads once, and that setup file
// runs before every test file. A page of `renderServer()` has a graph of its
// own, which starts without it.
setLocale("nl");
