import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import "./framed.css";

// A file of the host without "use client" that imports CSS of its own, as a
// framework's preview file does: in the document while a use of the file
// holds it, a node it renders or `linkStylesheetsOf()`, not as it loads. See
// `?view=own-css` in main.tsx.
export function renderFramed(container: HTMLElement) {
  return renderServer(<p className="framed">Framed by the host</p>, {
    container,
    hostFiles: ["host/framed.tsx"],
  });
}
