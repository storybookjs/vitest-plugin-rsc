import {
  getAccessFallbackHTTPStatus,
  HTTP_ERROR_FALLBACK_ERROR_CODE,
  isHTTPAccessFallbackError,
} from "next/dist/client/components/http-access-fallback/http-access-fallback.js";
import { getURLFromRedirectError } from "next/dist/client/components/redirect.js";
import { isRedirectError } from "next/dist/client/components/redirect-error.js";

// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/client/app-index.tsx#L58-L115
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/client/components/http-access-fallback/http-access-fallback.ts#L1-L64
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/client/components/redirect-error.ts#L1-L46
// Adaptation: Browser-mode tests inspect Flight text before React consumes it
// so Next HTTP access fallback and redirect control-flow errors can be surfaced
// through the same client digest helpers Next uses.
// Begin adapted: Next.js app-index Flight control-flow payload parsing
export function createNextHttpAccessFallbackError(status: number) {
  const error = new Error(`${HTTP_ERROR_FALLBACK_ERROR_CODE};${status}`) as Error & {
    digest: `${typeof HTTP_ERROR_FALLBACK_ERROR_CODE};${number}`;
  };
  error.digest = `${HTTP_ERROR_FALLBACK_ERROR_CODE};${status}`;
  return error;
}

export function isNextHttpAccessFallbackError(error: unknown) {
  return getNextHttpAccessFallbackStatus(error) !== undefined;
}

export function getNextHttpAccessFallbackStatus(errorOrText: unknown) {
  if (isHTTPAccessFallbackError(errorOrText)) {
    return getAccessFallbackHTTPStatus(errorOrText);
  }

  if (errorOrText instanceof Error) {
    const error = createDigestError(findEncodedControlFlowDigest(errorOrText.message));
    return isHTTPAccessFallbackError(error) ? getAccessFallbackHTTPStatus(error) : undefined;
  }

  if (typeof errorOrText !== "string") return;

  return getNextDigestErrorsFromFlightPayloadText(errorOrText)
    .map((error) =>
      isHTTPAccessFallbackError(error) ? getAccessFallbackHTTPStatus(error) : undefined,
    )
    .find((status) => status !== undefined);
}

export function getNextRedirectUrlFromFlightPayloadText(text: string) {
  for (const error of getNextDigestErrorsFromFlightPayloadText(text)) {
    if (isRedirectError(error)) {
      const redirectUrl = getURLFromRedirectError(error);
      if (redirectUrl) return redirectUrl;
    }
  }
}

function getNextDigestErrorsFromFlightPayloadText(text: string) {
  const errors: Array<Error & { digest: string }> = [];

  for (const payload of getReactFlightDigestRowPayloads(text)) {
    const error = createDigestError(
      parseFlightRowDigest(payload) ?? findEncodedControlFlowDigest(payload),
    );
    if (error) errors.push(error);
  }

  return errors;
}

function getReactFlightDigestRowPayloads(text: string) {
  const payloads: string[] = [];

  for (const line of text.split("\n")) {
    const row = line.trim();
    if (!row) continue;

    const separator = row.indexOf(":");
    if (separator === -1) continue;
    if (!/^[0-9a-z]+$/i.test(row.slice(0, separator))) continue;

    payloads.push(row.slice(separator + 1));
  }

  return payloads;
}

function parseFlightRowDigest(payload: string) {
  const jsonStart = payload.indexOf("{");
  if (jsonStart === -1) return;

  try {
    const parsed = JSON.parse(payload.slice(jsonStart)) as { digest?: unknown };
    return typeof parsed.digest === "string" ? parsed.digest : undefined;
  } catch {
    // Ignore malformed rows. React's Flight client will report the real
    // protocol error when this stream is consumed for rendering.
  }
}

function findEncodedControlFlowDigest(payload: string) {
  const accessFallback = /NEXT_HTTP_ERROR_FALLBACK;(?:401|403|404)/.exec(payload);
  if (accessFallback) return accessFallback[0];

  const redirect = /NEXT_REDIRECT;(?:push|replace);[^"\\]+;\d+;/.exec(payload);
  return redirect?.[0];
}

function createDigestError(digest: string | undefined) {
  return digest ? Object.assign(new Error(digest), { digest }) : undefined;
}
// End adapted
