"use client";

import { expect, test } from "vitest";
import { shared, type Evaluations } from "../vitest.shared.ts";

// A test file with "use client" that imports a file of the host without the
// directive, vitest.shared.ts: the page evaluated that file, as its
// `server-only` says, which throws in the browser layer, and once, also
// where a test file without the directive imported it in the same tab, as
// host-file.test.tsx does. This file has that evaluation.

test("has the page's instance of a file of the host without the directive", () => {
  const evaluations = (globalThis as Evaluations).__vitestSharedEvaluations;

  expect(evaluations).toHaveLength(1);
  expect(evaluations![0]).toBe(shared);
});
