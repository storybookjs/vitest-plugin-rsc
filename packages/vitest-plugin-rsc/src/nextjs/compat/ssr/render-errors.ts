// What ssr.ts reads the error of a page's render with, as Next's renderer
// reads the one that fails the document: `shellErrorAnswer()`.

export {
  getAccessFallbackHTTPStatus,
  isHTTPAccessFallbackError,
} from "next/dist/client/components/http-access-fallback/http-access-fallback";
export {
  getRedirectStatusCodeFromError,
  getURLFromRedirectError,
} from "next/dist/client/components/redirect";
export { isRedirectError } from "next/dist/client/components/redirect-error";
