import {
  getAccessFallbackHTTPStatus,
  HTTP_ERROR_FALLBACK_ERROR_CODE,
  isHTTPAccessFallbackError,
} from "next/dist/client/components/http-access-fallback/http-access-fallback.js";
import { getURLFromRedirectError } from "next/dist/client/components/redirect.js";
import { isRedirectError } from "next/dist/client/components/redirect-error.js";

// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/client/app-index.tsx#L58-L115
// Adaptation: Next app-index consumes `self.__next_f.push(...)` calls as they
// execute in the browser. Vitest already has rendered document HTML, so this
// extracts the same segment tuples from inline scripts and rebuilds the
// ReadableStream that React Flight expects for document hydration.
// Begin adapted: Next.js inline Flight bootstrap parser shape
type NextFlightSegment =
  | [isBootStrap: 0]
  | [isNotBootstrap: 1, responsePartial: string]
  | [isFormState: 2, formState: unknown]
  | [isBinary: 3, responseBase64Partial: string];

export function createNextDocumentFlightStream(html: string) {
  const chunks = collectNextDocumentFlightChunks(html);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

function collectNextDocumentFlightChunks(html: string) {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let sawBootstrap = false;

  for (const text of collectInlineScriptText(html)) {
    if (!text.includes("__next_f") || !text.includes(".push(")) continue;

    for (const segment of parseNextFlightSegmentScript(text)) {
      if (segment[0] === 0) {
        sawBootstrap = true;
      } else if (segment[0] === 1) {
        if (!sawBootstrap) throw new Error("Unexpected Next Flight data before bootstrap.");
        chunks.push(encoder.encode(segment[1]));
      } else if (segment[0] === 3) {
        if (!sawBootstrap) throw new Error("Unexpected Next Flight data before bootstrap.");
        chunks.push(Uint8Array.from(atob(segment[1]), (char) => char.charCodeAt(0)));
      }
    }
  }

  if (!sawBootstrap) {
    throw new Error("Next document HTML did not include inline Flight bootstrap data.");
  }

  return chunks;
}

function collectInlineScriptText(html: string) {
  return Array.from(
    html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi),
    (match) => match[1] ?? "",
  );
}

function parseNextFlightSegmentScript(text: string): NextFlightSegment[] {
  const segments: NextFlightSegment[] = [];
  let offset = 0;

  while (offset < text.length) {
    const pushIndex = text.indexOf(".push(", offset);
    if (pushIndex === -1) break;

    const start = pushIndex + ".push(".length;
    const end = findPushCallEnd(text, start);
    if (end === -1) break;

    const segment = JSON.parse(text.slice(start, end).trim()) as NextFlightSegment;
    if (Array.isArray(segment) && typeof segment[0] === "number") {
      segments.push(segment);
    }
    offset = end + 1;
  }

  return segments;
}

function findPushCallEnd(text: string, start: number) {
  let inString = false;
  let escaped = false;
  let bracketDepth = 0;

  for (let index = start; index < text.length; index++) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "[") {
      bracketDepth++;
    } else if (char === "]") {
      bracketDepth--;
    } else if (char === ")" && bracketDepth === 0) {
      return index;
    }
  }

  return -1;
}
// End adapted

// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/client/app-index.tsx
// Adaptation: Next 16.0.x and 16.1.x render dev HotReload state inside
// AppRouter. Component tests do not run app-index bootstrap, so provide no-op
// browser state with the same property shape.
// Begin adapted: Next.js app-index dev bootstrap state shape
export const webSocket = {
  readyState: WebSocket.OPEN,
  OPEN: WebSocket.OPEN,
  send: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  close: () => {},
} as unknown as WebSocket;

export const staticIndicatorState = { pathname: null, appIsrManifest: null };
// End adapted

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
