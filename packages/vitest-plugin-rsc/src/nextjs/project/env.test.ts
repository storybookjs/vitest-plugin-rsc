import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, onTestFinished, test } from "vitest";
import { describeEnv, pageEnvOf, readTestEnv } from "./env.ts";

const demo = fileURLToPath(new URL("../../../../../playground/nextjs-e2e-demo", import.meta.url));
const nextDir = path.dirname(
  createRequire(path.join(demo, "package.json")).resolve("next/package.json"),
);
const nextEnv = createRequire(path.join(nextDir, "package.json")).resolve("@next/env");
const envWorker = fileURLToPath(new URL("./env-worker.ts", import.meta.url));

// A project with these env files.
function projectWith(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "next-env-"));
  onTestFinished(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, contents] of Object.entries(files)) {
    fs.writeFileSync(path.join(root, name), contents);
  }
  return root;
}

const read = (root: string, build = false) => readTestEnv(root, { nextEnv, envWorker, build });

test("a run reads .env.test.local, .env.test and .env, the first file that has a name wins", async () => {
  const root = projectWith({
    ".env.test.local": "SECRET=local\n",
    ".env.test": "SECRET=test\nTEST=test\n",
    ".env": "SECRET=env\nTEST=env\nENV=env\n",
    ".env.local": "LOCAL=local\n",
    ".env.development": "DEVELOPMENT=development\n",
    ".env.production": "PRODUCTION=production\n",
  });

  expect(await read(root)).toEqual({
    values: { SECRET: "local", TEST: "test", ENV: "env" },
    files: [".env.test.local", ".env.test", ".env"],
  });
});

test("a build reads no .local file", async () => {
  const root = projectWith({
    ".env.test.local": "SECRET=local\n",
    ".env.test": "SECRET=test\n",
    ".env.local": "LOCAL=local\n",
  });

  expect(await read(root, true)).toEqual({ values: { SECRET: "test" }, files: [".env.test"] });
});

test("parses and expands as Next does, against the files and not the host's process", async () => {
  process.env.SECRET_TOKEN = "of-the-shell";
  onTestFinished(() => {
    delete process.env.SECRET_TOKEN;
  });
  const root = projectWith({
    ".env.test": [
      "BASE=https://notes.example",
      "URL=$BASE/api",
      "QUOTED='single $BASE'",
      'DOUBLE="double ${BASE}"',
      'MULTILINE="one',
      'two"',
      "ESCAPED=\\$BASE",
      "DEFAULTED=${MISSING:-fallback}",
      "SHELL=$SECRET_TOKEN",
      "LATER=$IN_ENV",
      "COMMENTED=value # a comment",
      "# NOT=read",
      "",
    ].join("\n"),
    ".env": "IN_ENV=env\n",
  });

  const { values } = await read(root);

  // Next expands inside single quotes too. A file is expanded before the
  // next one is read: a name of a later file is empty.
  expect(values).toEqual({
    BASE: "https://notes.example",
    URL: "https://notes.example/api",
    QUOTED: "single https://notes.example",
    DOUBLE: "double https://notes.example",
    MULTILINE: "one\ntwo",
    ESCAPED: "$BASE",
    DEFAULTED: "fallback",
    SHELL: "",
    LATER: "",
    COMMENTED: "value",
    IN_ENV: "env",
  });
  expect(process.env.URL).toBeUndefined();
  expect(process.env.BASE).toBeUndefined();
});

test("leaves out NODE_ENV, NEXT_RUNTIME and Next's __NEXT_ names", async () => {
  const root = projectWith({
    ".env.test": "NODE_ENV=production\nNEXT_RUNTIME=edge\n__NEXT_TEST_MODE=1\nKEPT=1\n",
  });

  expect((await read(root)).values).toEqual({ KEPT: "1" });
});

test("a project without env files has an empty env", async () => {
  expect(await read(projectWith({}))).toEqual({ values: {}, files: [] });
});

test("env of next.config is in the page, with the files' value of a name they have too", () => {
  const env = pageEnvOf(
    { values: { DATABASE_URL: "postgres://test" }, files: [".env.test"] },
    { "process.env.DATABASE_URL": "postgres://of-env-local", "process.env.FEATURE": "on" },
  );

  expect(env).toEqual({
    values: { DATABASE_URL: "postgres://test", FEATURE: "on" },
    files: [".env.test"],
    configNames: ["FEATURE"],
  });
});

test("a build says which files and names it puts into the site, never a value", () => {
  const env = pageEnvOf(
    { values: { DATABASE_URL: "postgres://secret-value" }, files: [".env.test", ".env"] },
    { "process.env.FEATURE": "on-value" },
  );

  const said = describeEnv(env, true);

  expect(said).toBe(
    "vitest-plugin-rsc: the build puts into the site the env of .env.test, .env: DATABASE_URL; " +
      "and env of next.config: FEATURE",
  );
  expect(said).not.toContain("secret-value");
  expect(said).not.toContain("on-value");
  expect(describeEnv(pageEnvOf({ values: {}, files: [] }, {}), true)).toBe(
    "vitest-plugin-rsc: the build puts into the site the env of no env file, as there is no " +
      ".env.test or .env",
  );
});

test("a run says which files it read", () => {
  const env = pageEnvOf({ values: { SECRET: "value" }, files: [".env.test"] }, {});

  expect(describeEnv(env, false)).toBe(
    "vitest-plugin-rsc: process.env of the app's server code is from .env.test",
  );
  expect(describeEnv(pageEnvOf({ values: {}, files: [] }, {}), false)).toBe(
    "vitest-plugin-rsc: process.env of the app's server code is from no env file, as there is " +
      "no .env.test.local or .env.test or .env",
  );
});
