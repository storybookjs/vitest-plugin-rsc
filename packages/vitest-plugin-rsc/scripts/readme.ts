// Writes the package's README.md from the repository's, for npm. npm shows
// the README of the tarball, and a relative link there points nowhere, so
// every relative link and image becomes one to GitHub's `main`.
//
// Runs on `prepack`, so `npm publish` and pkg.pr.new's `pnpm pack` both ship
// it. The file is ignored by git: the repository's README is the source.

import fs from "node:fs";
import { fileURLToPath } from "node:url";

const repo = "https://github.com/storybookjs/vitest-plugin-rsc";
const raw = "https://raw.githubusercontent.com/storybookjs/vitest-plugin-rsc/main";

const source = fileURLToPath(new URL("../../../README.md", import.meta.url));
const target = fileURLToPath(new URL("../README.md", import.meta.url));

const isRelative = (url: string) => !/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(url);

// An image goes to its raw file, which npm renders, and any other link to
// GitHub's page of the file or directory.
const absolute = (url: string) =>
  /\.(svg|png|jpe?g|gif|webp)$/i.test(url) ? `${raw}/${url}` : `${repo}/blob/main/${url}`;

export function absoluteLinks(markdown: string): string {
  // The odd parts of the split are fenced code blocks, which stay as written.
  return markdown
    .split(/(^```[^\n]*\n[\s\S]*?^```$)/m)
    .map((part, index) => (index % 2 ? part : prose(part)))
    .join("");
}

function prose(markdown: string): string {
  return markdown
    .replace(/(\]\()([^)\s]+)(\))/g, (match, open, url, close) =>
      isRelative(url) ? `${open}${absolute(url)}${close}` : match,
    )
    .replace(/(<img\b[^>]*\bsrc=")([^"]+)(")/g, (match, open, url, close) =>
      isRelative(url) ? `${open}${absolute(url)}${close}` : match,
    );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(target, absoluteLinks(fs.readFileSync(source, "utf8")));
}
