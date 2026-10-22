// What client.tsx, the app's client entry in the browser layer, runs of
// Next's own client entry.

export { appBootstrap } from "next/dist/client/app-bootstrap";
export { callServer } from "next/dist/client/app-call-server";

/** Next's client entry, which reads the Flight payload in the document as it loads. */
export const loadAppIndex = () => import("next/dist/client/app-index");
