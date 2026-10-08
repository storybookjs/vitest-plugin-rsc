import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateGate } from "./gate-expression.ts";

const run = {
  mode: "start",
  dev: false,
  start: true,
  deploy: false,
  turbopack: false,
  adapter: false,
  TODO: false,
};
const holds = (source: string) => Boolean(evaluateGate(source, run));

await test("evaluates the pragmas that Next's tests have", () => {
  assert.equal(holds("!deploy"), true);
  assert.equal(holds("start"), true);
  assert.equal(holds("dev"), false);
  assert.equal(holds("TODO"), false);
  assert.equal(holds("!dev && !deploy"), true);
  assert.equal(holds("!deploy || adapter"), true);
  assert.equal(holds("turbopack && !deploy"), false);
  assert.equal(holds("turbopack && (!deploy || adapter)"), false);
  assert.equal(holds("!(turbopack || dev)"), true);
});

await test("compares a condition with a string", () => {
  assert.equal(holds("mode === 'start'"), true);
  assert.equal(holds('mode !== "start"'), false);
  assert.equal(holds("mode == 'dev' || !deploy"), true);
  assert.equal(evaluateGate("output === 'a b'", { output: "a b" }), true);
});

await test("binds && and || from left to right, like Next's parser", () => {
  assert.equal(holds("dev && deploy || start"), true);
  assert.equal(holds("start || dev && deploy"), false);
});

await test("rejects a condition that no run has", () => {
  assert.throws(() => holds("cacheComponent"), /undeclared condition "cacheComponent"/);
  assert.throws(() => holds("constructor"), /undeclared condition "constructor"/);
});

await test("rejects what is not a condition", () => {
  for (const source of ["", "dev &&", "(dev", "dev)", "dev start", "dev; alert(1)", "&& dev"]) {
    assert.throws(() => holds(source), /Unparsable @gate pragma|undeclared condition/, source);
  }
});
