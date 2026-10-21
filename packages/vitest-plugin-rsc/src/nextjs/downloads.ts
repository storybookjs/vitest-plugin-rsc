// What a browser saves instead of showing: the answer to a navigation that
// asks for a download, an `<a download>`, or that says it is one, with
// `Content-Disposition: attachment`. The page that is open stays as it is,
// and without a page there is none to leave: see `navigate()` in page.ts.

/**
 * The name a browser saves the answer to a navigation as, or none when it
 * shows the answer. `requested` is the navigation's `downloadRequest`: the
 * `download` attribute of a link, `""` without a value.
 */
export function downloadName(response: Response, requested: string | null): string | undefined {
  const disposition = response.headers.get("content-disposition") ?? "";
  // RFC 6266: a type other than `inline` is a download, an unknown one too.
  const type = /^\s*([^\s;=]*)\s*(?:;|$)/.exec(disposition)?.[1]?.toLowerCase();
  if (requested === null && (!type || type === "inline")) return undefined;
  // The server's name wins over the link's, as in a browser.
  const segment = new URL(response.url).pathname.split("/").pop()!;
  const fromUrl = decode(percentDecoded(segment), "utf-8");
  return filenameOf(disposition) || requested || fromUrl || "download";
}

// The `filename*` of a disposition, else its `filename`, as a browser reads
// them: the first in the charset it names, the second in UTF-8, else as
// Latin-1, and in ASCII with `%` escapes, which browsers decode too.
function filenameOf(disposition: string): string | undefined {
  const parameters = new Map<string, string>();
  for (const [, name, value] of disposition.matchAll(
    /;\s*([^\s=;]+)\s*=\s*("(?:[^"\\]|\\.)*"|[^;]*)/g,
  )) {
    const unquoted = value!.startsWith('"') ? value!.slice(1, -1).replace(/\\(.)/g, "$1") : value!;
    if (!parameters.has(name!.toLowerCase())) parameters.set(name!.toLowerCase(), unquoted.trim());
  }
  const extended = /^([\w!#$%&+^`{}~-]+)'[^']*'(.*)$/.exec(parameters.get("filename*") ?? "");
  if (extended) {
    const decoded = decode(percentDecoded(extended[2]!), extended[1]!);
    if (decoded) return decoded;
  }
  const plain = parameters.get("filename");
  if (!plain) return undefined;
  // A header is bytes: a character of the string is one byte.
  const text =
    decode(
      Uint8Array.from(plain, (char) => char.charCodeAt(0) & 0xff),
      "utf-8",
    ) ?? plain;
  return /^[\x20-\x7e]*%[\da-f]{2}[\x20-\x7e]*$/i.test(text)
    ? (decode(percentDecoded(text), "utf-8") ?? text)
    : text;
}

function percentDecoded(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let at = 0; at < text.length; at++) {
    const escaped = /^%([\da-f]{2})/i.exec(text.slice(at, at + 3));
    if (escaped) {
      bytes.push(parseInt(escaped[1]!, 16));
      at += 2;
    } else bytes.push(text.charCodeAt(at) & 0xff);
  }
  return Uint8Array.from(bytes);
}

function decode(bytes: Uint8Array, charset: string): string | undefined {
  try {
    return new TextDecoder(charset, { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

/**
 * Hands the answer to the browser as a download, as `name`: the browser
 * saves the body of a Blob URL that an `<a download>` links, and the URL goes
 * once it has. An answer that is not ok is no file, as in a browser.
 */
export async function download(
  response: Response,
  name: string,
  signal: AbortSignal,
): Promise<void> {
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(
      `vitest-plugin-rsc: the download of ${response.url} failed: it responded with ` +
        `${response.status}. A browser saves no file for it.`,
    );
  }
  const blob = await response.blob();
  signal.throwIfAborted();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    // Not in the document: the app hears nothing of the click.
    link.click();
  } finally {
    // A click resolves the URL to its Blob at once.
    URL.revokeObjectURL(url);
  }
}
