import { expect, test } from "vitest";
import { loadClientModule } from "vitest-plugin-rsc/nextjs/testing-library";
import { fileChanged } from "../test/service.ts";
import { shared } from "../vitest.shared.ts";

// A file of the host is evaluated once, in the layer its directive names.
// vitest.shared.ts has none: it is the page's, also for a file of the host
// with "use client" that imports it, vitest.shared.client.tsx.

test('gives a file of the host with "use client" the page\'s instance of one without it', async () => {
  const client = await loadClientModule(await import("../vitest.shared.client.tsx"));

  expect(client.shared).toBe(shared);
});

test("keeps the page's instance after a change of the file", async () => {
  // The dev server has the file changed. The page keeps the module it
  // evaluated, as Vitest has no HMR. The tab's graph evaluates the modules of
  // the app again as the next file with the directive loads, here the one
  // that imports the changed file, but not a module of the page: the file
  // gets the page's instance still, not a copy of the change, which would be
  // a second instance, with another version than the page's.
  await fileChanged(
    "vitest.shared.ts",
    `import "server-only";\n` +
      `export const shared = { version: 2 };\n` +
      `(globalThis.__vitestSharedEvaluations ??= []).push(shared);\n`,
  );
  try {
    const again = await loadClientModule(
      await import(/* @vite-ignore */ `../vitest.shared.client.tsx?t=${Date.now()}`),
    );

    expect(again.shared).toBe(shared);
    expect(shared.version).toBe(1);
  } finally {
    await fileChanged("vitest.shared.ts");
  }
});
