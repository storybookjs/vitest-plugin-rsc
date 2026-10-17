"use client";

// A Client Component of a package that is no file of the host, with a
// stylesheet: code of the app's layers, like a component of a UI library.
// The package is not pre-bundled, so a dev server gives the id of this module
// Vite's version of the dependencies, `?v=1a2b3c4d`, also in the rsc layer,
// where Vite RSC has its reference by the file. See ../../../vite.config.ts.
import { createElement } from "react";
import "./tag.css";

export function Tag({ children }) {
  return createElement("span", { className: "host-package-tag", "data-testid": "tag" }, children);
}
