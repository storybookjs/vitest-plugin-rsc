"use client";

// A Client Component of a package that imports its own CSS.
import { createElement } from "react";
import "./client-badge.css";

export function ClientBadge({ children }) {
  return createElement("span", { className: "package-client-badge" }, children);
}
