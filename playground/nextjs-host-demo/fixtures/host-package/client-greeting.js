"use client";

// A file of a package of the host with `"use client"`, which the host imports
// by the name of the package: code of the browser layer, as host/client.tsx
// is. It reports with the React it has, through the page's own `host-report`.
import { report } from "host-report";
import { version } from "react";

report({ from: "host-package/client-greeting.js", react: version });

export function greeting(name) {
  return `Hello ${name}`;
}
