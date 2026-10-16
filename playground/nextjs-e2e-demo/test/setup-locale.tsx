"use client";

import { setLocale } from "../app/lib/locale.ts";

// A file with `"use client"` that a setup file without the directive imports,
// like one that calls `i18n.init()`. It runs in the browser layer, in the
// graph of the tab that the test files with `"use client"` share, once: the
// browser layer loads it when the setup file first runs, as Next's build
// loads the client modules of a layout with the page. A page of
// `renderServer()` has a graph of its own, which starts without it.
setLocale("nl");
