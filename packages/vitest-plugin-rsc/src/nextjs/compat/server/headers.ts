// What server-in-front.ts, the server in front of the app, takes of Next's
// server for the headers of a request and a response. It runs in both server
// layers: in the rsc layer, the document's, and in the ssr layer.

export { filterInternalHeaders } from "next/dist/server/lib/server-ipc/utils";
export {
  fromNodeOutgoingHttpHeaders,
  splitCookiesString,
  toNodeOutgoingHttpHeaders,
} from "next/dist/server/web/utils";
