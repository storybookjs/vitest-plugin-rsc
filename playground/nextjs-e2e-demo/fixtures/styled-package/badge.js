// A component of a package that imports its own CSS.
import { createElement } from "react";
import "./badge.css";

export function Badge({ children }) {
  return createElement("span", { className: "package-badge" }, children);
}
