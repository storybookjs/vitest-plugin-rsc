import { afterEach, expect, test, vi } from "vitest";
import { registry } from "./registry.ts";
import {
  forgetFileChangeAnswers,
  forgetTestFileAnswers,
  oncePerTestFile,
  untilFilesChange,
} from "./speed-features.ts";

afterEach(() => {
  forgetTestFileAnswers();
  forgetFileChangeAnswers();
  registry.speedFeatures = undefined;
});

const withCache = (cacheDevServer: boolean) => {
  registry.speedFeatures = { cacheDevServer } as typeof registry.speedFeatures;
};

test("keeps an answer until the test file ends", async () => {
  withCache(true);
  const cache = new Map<string, Promise<number>>();
  const ask = vi.fn(async () => ask.mock.calls.length);
  expect(await oncePerTestFile(cache, "a", ask)).toBe(1);
  expect(await oncePerTestFile(cache, "a", ask)).toBe(1);
  forgetTestFileAnswers();
  expect(await oncePerTestFile(cache, "a", ask)).toBe(2);
});

test("keeps an answer past the end of a test file, until a file changes", async () => {
  withCache(true);
  const cache = new Map<string, Promise<number>>();
  const ask = vi.fn(async () => ask.mock.calls.length);
  expect(await untilFilesChange(cache, "a", ask)).toBe(1);
  forgetTestFileAnswers();
  expect(await untilFilesChange(cache, "a", ask)).toBe(1);
  expect(await untilFilesChange(cache, "b", ask)).toBe(2);
  forgetFileChangeAnswers();
  expect(await untilFilesChange(cache, "a", ask)).toBe(3);
});

test("asks every time without cacheDevServer, and again after an answer that failed", async () => {
  withCache(false);
  const cache = new Map<string, Promise<number>>();
  const ask = vi.fn(async () => ask.mock.calls.length);
  await untilFilesChange(cache, "a", ask);
  await untilFilesChange(cache, "a", ask);
  expect(ask).toHaveBeenCalledTimes(2);

  withCache(true);
  const failing = vi.fn(async () => {
    throw new Error("no answer");
  });
  await expect(untilFilesChange(cache, "c", failing)).rejects.toThrow("no answer");
  await expect(untilFilesChange(cache, "c", failing)).rejects.toThrow("no answer");
  expect(failing).toHaveBeenCalledTimes(2);
});
