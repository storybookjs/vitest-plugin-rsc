// What Google Fonts answers for the fonts of the Next.js playgrounds, so that
// their tests need no network. `next/font/google` downloads a font when a run
// first loads it, as `next dev` does; with NEXT_FONT_GOOGLE_MOCKED_RESPONSES
// set to this file, Next's loader reads the answers here instead. That is how
// Next tests `next/font/google` itself. The variable is one for the process,
// and so for every project of the workspace.
const { createRequire } = require("node:module");
const path = require("node:path");

const playground = (name) => path.join(__dirname, "playground", name);
const notesDemo = createRequire(path.join(playground("nextjs-notes-demo"), "package.json"));
const fontsource = (name) =>
  path.join(
    path.dirname(notesDemo.resolve(`@fontsource-variable/${name}/package.json`)),
    `files/${name}-latin-wght-normal.woff2`,
  );

// The stylesheet of a variable font with one subset. The file is on disk:
// Next reads a URL that is a path instead of downloading it.
const stylesheet = (family, file) => `/* latin */
@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url(${file}) format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
`;
const url = (family) =>
  `https://fonts.googleapis.com/css2?family=${family.replaceAll(" ", "+")}:wght@100..900&display=swap`;

module.exports = {
  // nextjs-e2e-demo. Not Inter itself: a font file the demo has.
  [url("Inter")]: stylesheet(
    "Inter",
    path.join(playground("nextjs-e2e-demo"), "app/fonts/geist-latin.woff2"),
  ),
  // nextjs-notes-demo, from the files of Fontsource.
  [url("Geist")]: stylesheet("Geist", fontsource("geist")),
  [url("Geist Mono")]: stylesheet("Geist Mono", fontsource("geist-mono")),
};
