import { expect, test } from "vitest";
import { toUserEvent } from "#test/user-event-column.ts";

// The user-event column as test/write-columns.ts writes it now: a change of
// tests/vitest/ that it hasn't been written again for fails here, before the
// column measures an older app than the others. Run `pnpm write-columns`.

const text = import.meta.glob<string>(["../vitest/*.test.tsx", "../vitest-user-event/*.test.tsx"], {
  query: "?raw",
  import: "default",
  eager: true,
});

test("tests/vitest-user-event/ is tests/vitest/ with the clicks and fills of user-event", () => {
  const originals = Object.keys(text).filter((file) => file.startsWith("../vitest/"));
  const copies = Object.keys(text).filter((file) => file.startsWith("../vitest-user-event/"));
  const asCopy = (file: string) => file.replace("../vitest/", "../vitest-user-event/");
  expect(copies).toEqual(originals.map(asCopy));
  for (const file of originals) expect(text[asCopy(file)], file).toBe(toUserEvent(text[file]!));
});
