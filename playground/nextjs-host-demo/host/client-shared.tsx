"use client";

import { report } from "host-report";
import { version } from "react";
import { visit, visits } from "./shared.ts";

// A file of the host with "use client" that imports a file of the host
// without it, shared.ts: the page's instance of that file, not a copy of the
// browser layer. See `?view=shared` of main.tsx.
report({ from: "host/client-shared.tsx", react: version });
visit("host/client-shared.tsx");

export { visits };
