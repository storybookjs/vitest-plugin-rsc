"use client";

import { report } from "host-report";
import { version } from "react";

// A file of the host with `"use client"` that `?view=in-place` renders a
// component of, and again after a change: see in-place.tsx. It reports
// through the page's own `host-report`, once for every time it runs.
report({ from: "host/in-place-badge.tsx", react: version });

export { Badge } from "../app/components/badge.tsx";
export { note } from "./in-place-note.tsx";
