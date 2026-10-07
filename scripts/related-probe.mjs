// Says which test files `vitest related <file>` picks, without running them.
//
//   NODE_OPTIONS='--conditions=vitest-plugin-rsc-source' node scripts/related-probe.mjs \
//     nextjs-e2e-demo playground/nextjs-e2e-demo/app/notice/page.tsx
import path from "node:path";
import { createVitest } from "vitest/node";

const [project, ...files] = process.argv.slice(2);
const source = process.env.NODE_OPTIONS?.includes("vitest-plugin-rsc-source");
for (const file of files) {
  const vitest = await createVitest("test", {
    watch: false,
    project: [project],
    related: [path.resolve(file)],
    configLoader: source ? "native" : "runner",
  });
  const specs = await vitest.getRelevantTestSpecifications();
  const picked = specs.map((spec) => path.relative(process.cwd(), spec.moduleId)).sort();
  console.log("RELATED", file, "->", JSON.stringify(picked));
  await vitest.close();
}
process.exit(0);
