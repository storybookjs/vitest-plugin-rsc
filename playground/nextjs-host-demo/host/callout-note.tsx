"use client";

import { report } from "host-report";
import { version } from "react";

// A file of the host with `"use client"` that the entry of a page imports
// before anything of the plugin, as a preview file of Storybook imports one
// next to it: the browser layer evaluates it as the page loads.
report({ from: "host/callout-note.tsx", react: version });
