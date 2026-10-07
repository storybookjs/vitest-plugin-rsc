// The server of the app runs in the tab, so the tab's console is both: what
// `next dev` or `next start` prints, which Next's tests read as
// `next.cliOutput`, and the console of the page, which they read as
// `browser.log()`. Both read from here.

export type PageLog = { source: string; message: string; args: unknown[] };

// Playwright's names for the console methods.
const sources = {
  log: "log",
  info: "info",
  warn: "warning",
  error: "error",
  debug: "debug",
} as const;

const logs: PageLog[] = [];
const listeners = new Set<(chunk: string, source: string) => void>();
let output = "";

function format(args: unknown[]): string {
  const [first, ...rest] = args;
  let index = 0;
  // The format specifiers a console takes.
  const text =
    typeof first === "string"
      ? first.replace(/%[sdifoOc%]/g, (specifier) => {
          if (specifier === "%%") return "%";
          if (index >= rest.length) return specifier;
          const value = rest[index++];
          if (specifier === "%c") return "";
          if (specifier === "%s") return String(value);
          if (specifier === "%d" || specifier === "%i") return String(parseInt(String(value), 10));
          if (specifier === "%f") return String(parseFloat(String(value)));
          return inspect(value);
        })
      : inspect(first);
  return [
    text,
    ...rest.slice(index).map((value) => (typeof value === "string" ? value : inspect(value))),
  ].join(" ");
}

// As Node.js prints a value, for what the tests read of it: an error has
// its own properties after its stack, like the `digest` that Next gives it.
function inspect(value: unknown): string {
  if (value instanceof Error) {
    const stack = value.stack ?? `${value.name}: ${value.message}`;
    const own = Object.entries(value).map(
      ([key, property]) =>
        `  ${key}: ${typeof property === "string" ? `'${property}'` : inspect(property)}`,
    );
    return own.length === 0 ? stack : `${stack} {\n${own.join(",\n")}\n}`;
  }
  if (typeof value === "string") return value;
  if (typeof value === "function") return `[Function: ${value.name || "anonymous"}]`;
  if (typeof value !== "object" || value === null) return String(value);
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

type Method = keyof typeof sources;
const originals = {} as Record<Method, (...args: unknown[]) => void>;

for (const [method, source] of Object.entries(sources) as [Method, string][]) {
  const original = (originals[method] = console[method].bind(console));
  console[method] = (...args: unknown[]) => {
    if (args.length > 0) {
      const message = format(args);
      logs.push({ source, message, args });
      output += `${message}\n`;
      for (const listener of listeners) listener(`${message}\n`, source);
    }
    original(...args);
  };
}

export const consoleCapture = {
  /** How many messages there are now: a page reads the ones after its own start. */
  get length(): number {
    return logs.length;
  },
  logsSince(start: number): PageLog[] {
    return logs.slice(start);
  },
  get output(): string {
    return output;
  },
  /** Logs for whoever reads the output of the run, not for the test. */
  aside(method: Method, ...args: unknown[]): void {
    originals[method](...args);
  },
  listen(listener: (chunk: string, source: string) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
