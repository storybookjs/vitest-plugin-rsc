import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/expect-element.ts"],
  format: ["esm"],
  fixedExtension: false,
  dts: {
    sourcemap: process.argv.slice(2).includes("--sourcemap"),
  },
});
