// What node-server.stand-in.test.ts takes of how Next's handlers write a
// response to an `http.ServerResponse`: a route handler's `Response`, and a
// page that Next prerendered. No layer imports it.

export { NodeNextResponse } from "next/dist/server/base-http/node";
export { generateETag } from "next/dist/server/lib/etag";
export { default as RenderResult } from "next/dist/server/render-result";
export { sendRenderResult } from "next/dist/server/send-payload";
export { sendResponse } from "next/dist/server/send-response";
