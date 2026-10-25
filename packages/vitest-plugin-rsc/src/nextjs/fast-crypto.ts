// The speed feature `fastCrypto` of `vitestPluginNext()`: what the server
// layers import to hash a password or derive a key, as a module of stand-ins
// that cost microseconds, src/fast-crypto/index.ts. The app's code and its
// packages run as they are: the layer resolves their import of `bcryptjs` or of
// `node:crypto` to a module that the plugin makes here, which has the API of
// the one it stands in for, and the stand-ins in it. The test files, which are
// in the rsc layer's environment, get the same, so that a user a test makes has
// a hash that the app's sign-in verifies. Web Crypto, which is the page's own,
// the plugin's setup file makes a stand-in of: `installWebCrypto()`.
//
// Only in a test run of Vitest, with the option: see plugin.ts.

import fs from "node:fs";
import { isBuiltin } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePath } from "vite";

// The built file, dist/fast-crypto/index.js, with @noble/hashes in it, from
// the source in src/ as from dist/, as the modules of Node.js are
// (node-builtins.ts): no dependency for Vite to find as a test runs.
const ownFile = fileURLToPath(import.meta.url);
const standInsFile = normalizePath(
  path.join(
    path.dirname(ownFile),
    path.extname(ownFile) === ".ts" ? "../../dist/fast-crypto/index.js" : "../fast-crypto/index.js",
  ),
);

/** The file of the stand-ins, which the modules below import. */
export function fastCryptoFile(): string {
  if (!fs.existsSync(standInsFile)) {
    throw new Error(
      `vitest-plugin-rsc: no ${standInsFile}, the package is not built: run \`pnpm build\``,
    );
  }
  return standInsFile;
}

// Each module: the factory of src/fast-crypto/index.ts that makes its
// stand-ins, and the names it exports, as the package does.
const packages: Record<string, { factory: string; names: string[]; specifiers: string[] }> = {
  bcryptjs: {
    factory: `bcrypt("bcryptjs")`,
    names: [
      "genSaltSync",
      "genSalt",
      "hashSync",
      "hash",
      "compareSync",
      "compare",
      "getRounds",
      "getSalt",
      "truncates",
      "encodeBase64",
      "decodeBase64",
      "setRandomFallback",
    ],
    specifiers: ["bcryptjs"],
  },
  // The native package, which no browser can load: its API is bcryptjs's.
  bcrypt: {
    factory: `bcrypt("bcrypt")`,
    names: ["genSaltSync", "genSalt", "hashSync", "hash", "compareSync", "compare", "getRounds"],
    specifiers: ["bcrypt"],
  },
  "node-rs-bcrypt": {
    factory: "nodeRsBcrypt()",
    names: [
      "DEFAULT_COST",
      "genSaltSync",
      "genSalt",
      "hashSync",
      "hash",
      "verifySync",
      "verify",
      "compareSync",
      "compare",
    ],
    specifiers: ["@node-rs/bcrypt"],
  },
  argon2: {
    factory: "argon2()",
    names: ["argon2d", "argon2i", "argon2id", "hash", "verify", "needsRehash"],
    specifiers: ["argon2"],
  },
  "node-rs-argon2": {
    factory: "nodeRsArgon2()",
    names: [
      "Algorithm",
      "Version",
      "hash",
      "hashSync",
      "hashRaw",
      "hashRawSync",
      "verify",
      "verifySync",
    ],
    specifiers: ["@node-rs/argon2"],
  },
  // Better Auth hashes its passwords with this one in a browser, where
  // @better-auth/utils has no `node:crypto`.
  "noble-scrypt": {
    factory: "nobleScrypt()",
    names: ["scrypt", "scryptAsync"],
    specifiers: ["@noble/hashes/scrypt", "@noble/hashes/scrypt.js"],
  },
  "noble-pbkdf2": {
    factory: "noblePbkdf2()",
    names: ["pbkdf2", "pbkdf2Async"],
    specifiers: ["@noble/hashes/pbkdf2", "@noble/hashes/pbkdf2.js"],
  },
  "noble-argon2": {
    factory: "nobleArgon2()",
    names: ["argon2d", "argon2i", "argon2id", "argon2dAsync", "argon2iAsync", "argon2idAsync"],
    specifiers: ["@noble/hashes/argon2", "@noble/hashes/argon2.js"],
  },
};

const moduleOfSpecifier = new Map(
  Object.entries(packages).flatMap(([name, { specifiers }]) =>
    specifiers.map((specifier) => [specifier, name] as const),
  ),
);

/**
 * The name of the stand-in module for an import of a server layer, if it has
 * one: a package that hashes passwords, or `node:crypto`, whose module is the
 * layer's own with the stand-ins in it, `nodeCrypto`.
 */
export function fastCryptoModuleOf(source: string): string | undefined {
  if (source === "crypto" || source === "node:crypto") return "node-crypto";
  return moduleOfSpecifier.get(source);
}

/**
 * The code of a stand-in module by its name: for `node-crypto`, the layer's
 * `node:crypto`, `nodeCrypto`, with its `pbkdf2`, `scrypt` and `argon2` the
 * stand-ins. That is the file of the package's module in a browser, and
 * Node's own in a worker of Node.js (node-builtins.ts).
 */
export function fastCryptoModule(name: string, nodeCrypto: string): string | undefined {
  const from = JSON.stringify(fastCryptoFile());
  if (name === "node-crypto") {
    const own = JSON.stringify(nodeCrypto);
    const names = ["pbkdf2", "pbkdf2Sync", "scrypt", "scryptSync", "argon2", "argon2Sync"];
    // Node's own module is no file of a build: a pre-bundle that requires
    // this module has its names only where they are named here, not from
    // an `export *` of it. They are the names of this process's Node.js.
    const reexports = isBuiltin(nodeCrypto)
      ? `export const { ${Object.keys(process.getBuiltinModule("node:crypto"))
          .filter((key) => /^[A-Za-z_$][\w$]*$/.test(key) && !names.includes(key))
          .join(", ")} } = own;\n`
      : `export * from ${own};\n`;
    return (
      `import own from ${own};\n` +
      `import { Buffer } from "node:buffer";\n` +
      `import { nodeCrypto } from ${from};\n` +
      reexports +
      `const fast = nodeCrypto(Buffer);\n` +
      `export const { ${names.join(", ")} } = fast;\n` +
      `export default { ...own, ...fast };\n`
    );
  }
  const standIn = packages[name];
  if (!standIn) return;
  const factory = standIn.factory.replace(/\(.*$/, "");
  return (
    `import { ${factory} } from ${from};\n` +
    `const standIns = ${standIn.factory};\n` +
    `export const { ${standIn.names.join(", ")} } = standIns;\n` +
    `export default standIns;\n`
  );
}

/** The module of the setup file: Web Crypto's PBKDF2 a stand-in, or nothing. */
export function fastCryptoSetup(enabled: boolean): string {
  if (!enabled) return "export {};\n";
  return (
    `import { installWebCrypto } from ${JSON.stringify(fastCryptoFile())};\n` +
    `installWebCrypto();\n`
  );
}
