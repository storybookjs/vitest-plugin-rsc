"use client";

import { shared } from "./vitest.shared.ts";

// A file of the host with "use client", `host.files` in vitest.config.ts,
// that imports one without the directive: the page's instance of it, not a
// copy of the browser layer. See app/host-file.test.tsx.
export { shared };
