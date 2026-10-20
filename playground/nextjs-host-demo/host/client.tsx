"use client";

import { report } from "host-report";
import { version } from "react";
import { createRoot } from "react-dom/client";
import { Counter } from "../app/components/counter.tsx";

// A file of the host with `"use client"`: code of the browser layer, like a
// test file with the directive. It renders a Client Component as React does,
// without the app of Next around it, with the React that Next has for the
// browser. `host-report` is the page's own: the host reads what it reports.
// The CSS of the component is a stylesheet of the app, which the page links
// as the host uses this file: see main.tsx, and client-graph.ts of the plugin.
report({ from: "host/client.tsx", react: version });

const root = document.createElement("div");
root.id = "client-root";
document.getElementById("host-root")!.append(root);
createRoot(root).render(<Counter />);
