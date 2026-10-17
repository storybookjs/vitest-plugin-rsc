"use client";

// A file of a package of the host with `"use client"` that another file of
// the package imports, like the module of a Storybook framework that renders
// a client story: code of the browser layer, as client-greeting.js is.
import { report } from "host-report";
import { version } from "react";

report({ from: "host-package/client-story.js", react: version });

export function story(name) {
  return `A story of ${name}`;
}
