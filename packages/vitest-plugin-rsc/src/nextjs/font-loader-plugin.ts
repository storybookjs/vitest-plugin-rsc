import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { createProjectRequire, getProjectRoot, normalizePath } from "./plugin-utils";

const virtualNextFontPrefix = "virtual:vitest-plugin-rsc/next-font/";

type FontKind = "google" | "local";

type FontRequest = {
  kind: FontKind;
  functionName: string;
  variableName: string;
  args: string;
  importer: string;
};

type NextFontLoaderResult = {
  css: string;
  fallbackFonts?: string[];
  weight?: string;
  style?: string;
  variable?: string;
};

type NextFontLoader = (options: {
  functionName: string;
  variableName: string;
  data: unknown[];
  emitFontFile(buffer: Buffer, ext: string): string;
  resolve(path: string): Promise<string>;
  isDev: boolean;
  isServer: boolean;
  loaderContext: {
    fs: typeof fs;
  };
}) => Promise<NextFontLoaderResult>;

type FontImport = {
  kind: FontKind;
  importedName: string;
  localName: string;
};

export function useNextFontLoader(): Plugin {
  let root = process.cwd();

  return {
    name: "next-rsc-font-loader",
    enforce: "pre",
    configResolved(config) {
      root = getProjectRoot(config);
    },
    resolveId(source) {
      if (source.startsWith(virtualNextFontPrefix)) {
        return source;
      }
    },
    async load(id) {
      if (!id.startsWith(virtualNextFontPrefix)) return;

      const request = parseFontRequest(id);
      const projectRequire = createProjectRequire(root);
      const loaderModule = projectRequire(
        request.kind === "google"
          ? "next/dist/compiled/@next/font/dist/google/loader.js"
          : "next/dist/compiled/@next/font/dist/local/loader.js",
      ) as { default?: NextFontLoader } | NextFontLoader;
      const loader = typeof loaderModule === "function" ? loaderModule : loaderModule.default;

      if (!loader) {
        throw new Error(`Could not load Next ${request.kind} font loader`);
      }

      const data = evaluateFontCallArgs(request.args, request.importer);
      const result = await loader({
        functionName: request.functionName,
        variableName: request.variableName,
        data,
        emitFontFile(buffer, ext) {
          return `data:${getFontMimeType(ext)};base64,${Buffer.from(buffer).toString("base64")}`;
        },
        async resolve(source) {
          return path.resolve(path.dirname(request.importer), source);
        },
        isDev: true,
        isServer: false,
        loaderContext: { fs },
      });

      const cssModule = createFontCssModule(request, result, data);
      return cssModule;
    },
    transform(code, id) {
      if (!/\bnext\/font\/(?:google|local)\b/.test(code) || !/\.(?:[cm]?[jt]sx?)($|\?)/.test(id)) {
        return;
      }

      const cleanId = id.replace(/\?.*$/, "");
      const transformResult = transformNextFontImports(code, cleanId);
      if (!transformResult) return;

      return {
        code: transformResult,
        map: null,
      };
    },
  };
}

function transformNextFontImports(code: string, importer: string): string | undefined {
  const imports: FontImport[] = [];
  const replacements: Array<{ start: number; end: number; text: string }> = [];

  collectNamedFontImports(code, "google", imports, replacements);
  collectDefaultFontImports(code, "local", imports, replacements);

  if (imports.length === 0) return;

  const importsByLocalName = new Map(
    imports.map((fontImport) => [fontImport.localName, fontImport]),
  );
  const generatedImports: string[] = [];

  const callPattern = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = callPattern.exec(code))) {
    const variableName = match[1];
    const calleeName = match[2];
    if (!variableName || !calleeName) continue;

    const fontImport = importsByLocalName.get(calleeName);
    if (!fontImport) continue;

    const argsStart = callPattern.lastIndex;
    const argsEnd = findMatchingToken(code, argsStart - 1, "(", ")");
    if (argsEnd < 0) continue;

    let statementEnd = argsEnd + 1;
    while (/\s/.test(code[statementEnd] ?? "")) statementEnd++;
    if (code[statementEnd] === ";") statementEnd++;

    const args = code.slice(argsStart, argsEnd);
    const request: FontRequest = {
      kind: fontImport.kind,
      functionName: fontImport.importedName,
      variableName,
      args,
      importer,
    };

    generatedImports.push(
      `import ${variableName} from ${JSON.stringify(createVirtualFontId(request))};`,
    );
    replacements.push({ start: match.index, end: statementEnd, text: "" });
    callPattern.lastIndex = statementEnd;
  }

  if (generatedImports.length === 0) return;

  const sortedReplacements = replacements.sort((a, b) => b.start - a.start);
  let transformed = code;
  for (const replacement of sortedReplacements) {
    transformed =
      transformed.slice(0, replacement.start) +
      replacement.text +
      transformed.slice(replacement.end);
  }

  const insertAt = findDirectivePrologueEnd(transformed);
  const importBlock = `${generatedImports.join("\n")}\n`;
  return `${transformed.slice(0, insertAt)}${importBlock}${transformed.slice(insertAt)}`;
}

function collectNamedFontImports(
  code: string,
  kind: FontKind,
  imports: FontImport[],
  replacements: Array<{ start: number; end: number; text: string }>,
) {
  const pattern =
    kind === "google"
      ? /import\s*\{([^}]+)\}\s*from\s*["']next\/font\/google(?:\.js)?["']\s*;?/g
      : /import\s*\{([^}]+)\}\s*from\s*["']next\/font\/local(?:\.js)?["']\s*;?/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(code))) {
    const specifiers = match[1];
    if (!specifiers) continue;

    for (const specifier of specifiers.split(",")) {
      const [importedName, localName = importedName] = specifier
        .trim()
        .split(/\s+as\s+/)
        .map((part) => part.trim());
      if (!importedName || !localName) continue;

      imports.push({ kind, importedName, localName });
    }

    replacements.push({ start: match.index, end: match.index + match[0].length, text: "" });
  }
}

function collectDefaultFontImports(
  code: string,
  kind: FontKind,
  imports: FontImport[],
  replacements: Array<{ start: number; end: number; text: string }>,
) {
  const pattern =
    kind === "local"
      ? /import\s+([A-Za-z_$][\w$]*)\s+from\s*["']next\/font\/local(?:\.js)?["']\s*;?/g
      : /import\s+([A-Za-z_$][\w$]*)\s+from\s*["']next\/font\/google(?:\.js)?["']\s*;?/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(code))) {
    const localName = match[1];
    if (!localName) continue;

    imports.push({ kind, importedName: "default", localName });
    replacements.push({ start: match.index, end: match.index + match[0].length, text: "" });
  }
}

function createVirtualFontId(request: FontRequest) {
  return `${virtualNextFontPrefix}${Buffer.from(JSON.stringify(request)).toString("base64url")}`;
}

function parseFontRequest(id: string): FontRequest {
  const encoded = id.slice(virtualNextFontPrefix.length);
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as FontRequest;
}

function evaluateFontCallArgs(args: string, importer: string): unknown[] {
  try {
    const parser = new StaticValueParser(args);
    const parsedArgs = parser.parseArguments();
    parser.assertEnd();
    return parsedArgs;
  } catch (error) {
    throw new Error(
      `Could not evaluate static next/font call in ${normalizePath(importer)}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

class StaticValueParser {
  private index = 0;

  constructor(private readonly input: string) {}

  parseArguments(): unknown[] {
    const values: unknown[] = [];
    this.skipWhitespace();
    if (this.isEnd()) return values;

    while (!this.isEnd()) {
      values.push(this.parseValue());
      this.skipWhitespace();
      if (!this.consume(",")) break;
      this.skipWhitespace();
      if (this.isEnd()) break;
    }

    return values;
  }

  assertEnd() {
    this.skipWhitespace();
    if (!this.isEnd()) {
      throw new Error(`Unexpected token ${JSON.stringify(this.peek())}`);
    }
  }

  private parseValue(): unknown {
    this.skipWhitespace();
    const char = this.peek();

    if (char === "{") return this.parseObject();
    if (char === "[") return this.parseArray();
    if (char === '"' || char === "'") return this.parseString();
    if (char === "-" || /\d/.test(char)) return this.parseNumber();
    if (this.consumeKeyword("true")) return true;
    if (this.consumeKeyword("false")) return false;
    if (this.consumeKeyword("null")) return null;

    throw new Error(`Unsupported static value at ${this.index}`);
  }

  private parseObject() {
    const value: Record<string, unknown> = {};
    this.expect("{");
    this.skipWhitespace();

    while (!this.consume("}")) {
      const key = this.parseObjectKey();
      this.skipWhitespace();
      this.expect(":");
      value[key] = this.parseValue();
      this.skipWhitespace();
      if (!this.consume(",")) {
        this.expect("}");
        break;
      }
      this.skipWhitespace();
    }

    return value;
  }

  private parseArray() {
    const value: unknown[] = [];
    this.expect("[");
    this.skipWhitespace();

    while (!this.consume("]")) {
      value.push(this.parseValue());
      this.skipWhitespace();
      if (!this.consume(",")) {
        this.expect("]");
        break;
      }
      this.skipWhitespace();
    }

    return value;
  }

  private parseObjectKey() {
    const char = this.peek();
    if (char === '"' || char === "'") {
      return this.parseString();
    }

    const match = /^[A-Za-z_$][\w$-]*/.exec(this.input.slice(this.index));
    if (!match?.[0]) {
      throw new Error(`Expected object key at ${this.index}`);
    }

    this.index += match[0].length;
    return match[0];
  }

  private parseString() {
    const quote = this.peek();
    this.index++;
    let value = "";

    while (!this.isEnd()) {
      const char = this.peek();
      this.index++;

      if (char === quote) return value;
      if (char === "\\") {
        const escaped = this.peek();
        this.index++;
        value += escaped;
      } else {
        value += char;
      }
    }

    throw new Error("Unterminated string");
  }

  private parseNumber() {
    const match = /^-?\d+(?:\.\d+)?/.exec(this.input.slice(this.index));
    if (!match?.[0]) {
      throw new Error(`Expected number at ${this.index}`);
    }

    this.index += match[0].length;
    return Number(match[0]);
  }

  private consumeKeyword(keyword: string) {
    if (
      this.input.startsWith(keyword, this.index) &&
      !/[\w$-]/.test(this.input[this.index + keyword.length] ?? "")
    ) {
      this.index += keyword.length;
      return true;
    }

    return false;
  }

  private consume(token: string) {
    if (this.input.startsWith(token, this.index)) {
      this.index += token.length;
      return true;
    }

    return false;
  }

  private expect(token: string) {
    if (!this.consume(token)) {
      throw new Error(`Expected ${JSON.stringify(token)} at ${this.index}`);
    }
  }

  private skipWhitespace() {
    while (/\s/.test(this.peek())) {
      this.index++;
    }
  }

  private peek() {
    return this.input[this.index] ?? "";
  }

  private isEnd() {
    return this.index >= this.input.length;
  }
}

function createFontCssModule(request: FontRequest, result: NextFontLoaderResult, data: unknown[]) {
  const hash = createHash(
    `${request.kind}:${request.functionName}:${request.variableName}:${request.args}:${request.importer}`,
  );
  const cssVariable = result.variable ?? getFontOption(data, "variable");
  const className = `__next_font_${hash}`;
  const variableClassName = cssVariable ? `__next_font_variable_${hash}` : "";
  const fontFamily = createFontFamilyValue(result);
  const css = [
    result.css,
    `.${className} { font-family: ${fontFamily};${
      result.weight ? ` font-weight: ${result.weight};` : ""
    }${result.style ? ` font-style: ${result.style};` : ""} }`,
    cssVariable ? `.${variableClassName} { ${cssVariable}: ${fontFamily}; }` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `
const css = ${JSON.stringify(css)};
const id = ${JSON.stringify(`vitest-plugin-rsc-next-font-${hash}`)};
const fontStyles = globalThis[Symbol.for("vitest-plugin-rsc.nextjs.fontStyles")] ??= new Map();
fontStyles.set(id, css);
if (typeof document !== "undefined" && !document.getElementById(id)) {
  const style = document.createElement("style");
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}
const font = {
  className: ${JSON.stringify(className)},
  variable: ${JSON.stringify(variableClassName)},
  style: {
    fontFamily: ${JSON.stringify(fontFamily)},
    ${result.weight ? `fontWeight: ${JSON.stringify(result.weight)},` : ""}
    ${result.style ? `fontStyle: ${JSON.stringify(result.style)},` : ""}
  },
};
export default font;
`;
}

function getFontOption(data: unknown[], key: string) {
  const options = data[0];
  if (!options || typeof options !== "object" || Array.isArray(options)) return;

  const value = (options as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function createFontFamilyValue(result: NextFontLoaderResult) {
  const primary = extractFirstCssDeclaration(result.css, "font-family") ?? "sans-serif";
  const fallback = result.fallbackFonts?.length ? `, ${result.fallbackFonts.join(", ")}` : "";
  return `${primary}${fallback}`;
}

function extractFirstCssDeclaration(css: string, property: string) {
  const match = new RegExp(`${property}\\s*:\\s*([^;]+);`).exec(css);
  return match?.[1]?.trim();
}

function findMatchingToken(code: string, openIndex: number, openToken: string, closeToken: string) {
  let depth = 0;
  let quote: string | undefined;
  let escaped = false;

  for (let index = openIndex; index < code.length; index++) {
    const char = code[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }

    if (char === openToken) {
      depth++;
    } else if (char === closeToken) {
      depth--;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function findDirectivePrologueEnd(code: string) {
  let index = 0;
  const directivePattern = /\s*(?:"use client"|'use client'|"use server"|'use server')\s*;?/gy;
  let match: RegExpExecArray | null;

  while ((match = directivePattern.exec(code))) {
    index = directivePattern.lastIndex;
  }

  if (index > 0 && code[index] === "\n") {
    index++;
  }

  return index;
}

function getFontMimeType(ext: string) {
  switch (ext) {
    case "woff":
      return "font/woff";
    case "woff2":
      return "font/woff2";
    case "ttf":
      return "font/ttf";
    case "otf":
      return "font/otf";
    default:
      return "application/octet-stream";
  }
}

function createHash(input: string) {
  let hash = 5381;
  for (let index = 0; index < input.length; index++) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}
