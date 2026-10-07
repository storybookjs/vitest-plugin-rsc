"use client";

import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

// Renders into a React root of its own, as a widget of a third party does. It
// tells the tab when the app's root unmounts it.
export function Widget() {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = container.current!.appendChild(document.createElement("div"));
    const root = createRoot(element);
    root.render(<p>Widget</p>);
    return () => {
      window.dispatchEvent(new Event("widget-unmount"));
      element.remove();
      // Not while React unmounts the app.
      setTimeout(() => root.unmount());
    };
  }, []);
  return <div ref={container} />;
}
