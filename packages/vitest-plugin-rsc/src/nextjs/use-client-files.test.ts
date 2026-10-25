import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { useClientFiles } from "./use-client-files.ts";

test("finds the app's files that start with `use client`, not tests nor packages", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-use-client-"));
  const write = (file: string, code: string) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), code);
  };
  try {
    write("app/page.tsx", "export default function Page() { return null; }\n");
    write("components/button.tsx", '// A button.\n"use client";\nexport const a = <b />;\n');
    write("components/form.js", "'use client'\nexport const a = 1;\n");
    write("lib/says.ts", 'export const says = "use client";\n');
    write("components/button.test.tsx", '"use client";\n');
    write("node_modules/a/index.js", '"use client";\n');
    expect(await useClientFiles(root)).toEqual([
      path.join(root, "components/button.tsx"),
      path.join(root, "components/form.js"),
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
