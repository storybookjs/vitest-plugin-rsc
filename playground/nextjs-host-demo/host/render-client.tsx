"use client";

import { report } from "host-report";
import { createElement, version, type ComponentType } from "react";
import { createRoot } from "react-dom/client";

// What renders a component in the host's document, as the renderer of a
// framework does: with the `react-dom` of the browser layer, the one of the
// component it renders. In the rsc layer, where the host runs, React is the
// server's.
report({ from: "host/render-client.tsx", react: version });

export function renderClient(Component: ComponentType, container: Element): void {
  createRoot(container).render(createElement(Component));
}
