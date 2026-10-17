"use client";

import { report } from "host-report";
import { version } from "react";

// A file of the host with `"use client"` whose exports the host uses, as
// Storybook uses the stories of a file: the host renders them itself, see
// main.tsx. Unlike client.tsx, it renders nothing as it loads. The CSS of
// `Badge` is a stylesheet of the app, which the tab's graph links in the
// document of the host as the file loads. It reports through the page's own
// `host-report`, once for every time it runs.
report({ from: "host/client-module.tsx", react: version });

export { Badge } from "../app/components/badge.tsx";
export { Like } from "../app/components/like.tsx";
