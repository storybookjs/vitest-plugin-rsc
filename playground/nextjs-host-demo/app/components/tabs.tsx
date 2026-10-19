"use client";

import { Children, createContext, isValidElement, use, type ReactNode } from "react";

// Client Components that read what they get as a UI library does: the type
// of each child, a static of that type, a context they are given, and a
// function they call. The host renders them as client references from JSX of
// the rsc layer, where each of these exports is a reference: see
// host/references.tsx. They see the exports, as with Flight.

export const Accent = createContext("plain");

export function TabPanel({ label }: { label: string }) {
  return <span data-testid="tab-panel">{label}</span>;
}
TabPanel.muiName = "TabPanel";

/** What a function of a file with "use client" does, which browser code calls. */
export function shout(text: string): string {
  return `${text.toUpperCase()}!`;
}

export function Tabs({
  children,
  context,
  format,
}: {
  children: ReactNode;
  context: React.Context<string>;
  format: (text: string) => string;
}) {
  const panels = Children.toArray(children).map((child) =>
    isValidElement(child) && child.type === TabPanel
      ? (child.type as { muiName?: string }).muiName
      : "other",
  );
  return (
    <div>
      <span data-testid="tabs-seen">{`${format("tabs")} ${use(context)} ${panels.join(",")}`}</span>
      {children}
    </div>
  );
}
