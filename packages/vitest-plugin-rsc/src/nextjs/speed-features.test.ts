import { afterEach, expect, test, vi } from "vitest";
import { registry } from "./registry.ts";
import { forgetTestFileAnswers, oncePerTestFile, whileVersionStays } from "./speed-features.ts";

afterEach(() => {
  forgetTestFileAnswers();
  registry.speedFeatures = undefined;
});

const withCache = (cacheDevServer: boolean) => {
  registry.speedFeatures = { cacheDevServer } as typeof registry.speedFeatures;
};
// An answer that counts the questions.
const counting = () => {
  const ask = vi.fn(async () => ask.mock.calls.length);
  return ask;
};

test("keeps an answer until the test file ends", async () => {
  withCache(true);
  const cache = new Map<string, Promise<number>>();
  const ask = counting();
  expect(await oncePerTestFile(cache, "a", ask)).toBe(1);
  expect(await oncePerTestFile(cache, "a", ask)).toBe(1);
  forgetTestFileAnswers();
  expect(await oncePerTestFile(cache, "a", ask)).toBe(2);
});

test("keeps an answer past the end of a test file while the version stays", async () => {
  withCache(true);
  const cache = new Map<string, Promise<number>>();
  const ask = counting();
  let current = 1;
  const version = vi.fn(async () => current);
  expect(await whileVersionStays(cache, "a", version, ask)).toBe(1);
  expect(await whileVersionStays(cache, "b", version, ask)).toBe(2);
  // The version once per test file.
  expect(version).toHaveBeenCalledTimes(1);
  forgetTestFileAnswers();
  expect(await whileVersionStays(cache, "a", version, ask)).toBe(1);
  expect(version).toHaveBeenCalledTimes(2);

  // A change in the test file is seen by the next one.
  current = 2;
  expect(await whileVersionStays(cache, "a", version, ask)).toBe(1);
  forgetTestFileAnswers();
  expect(await whileVersionStays(cache, "a", version, ask)).toBe(3);
  expect(await whileVersionStays(cache, "b", version, ask)).toBe(4);
});

test("asks every time without cacheDevServer, and again after an answer that failed", async () => {
  withCache(false);
  const cache = new Map<string, Promise<number>>();
  const ask = counting();
  const version = vi.fn(async () => 1);
  await whileVersionStays(cache, "a", version, ask);
  await whileVersionStays(cache, "a", version, ask);
  expect(ask).toHaveBeenCalledTimes(2);
  expect(version).not.toHaveBeenCalled();

  withCache(true);
  const failing = vi.fn(async () => {
    throw new Error("no answer");
  });
  await expect(whileVersionStays(cache, "c", version, failing)).rejects.toThrow("no answer");
  await expect(whileVersionStays(cache, "c", version, failing)).rejects.toThrow("no answer");
  expect(failing).toHaveBeenCalledTimes(2);
});
