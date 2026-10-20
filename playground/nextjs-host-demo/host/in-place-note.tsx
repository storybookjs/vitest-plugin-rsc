"use client";

import { report } from "host-report";
import { version } from "react";

// A file of the host with `"use client"` that in-place-badge.tsx imports and
// the host reads itself too, as a docs page imports the stories that it
// shows: see in-place.tsx. It reports through the page's own `host-report`,
// once for every time it runs.
report({ from: "host/in-place-note.tsx", react: version });

export const note = { text: "A note" };
