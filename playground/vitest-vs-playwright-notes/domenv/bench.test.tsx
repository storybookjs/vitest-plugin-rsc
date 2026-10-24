import { screen } from "@testing-library/dom";
import { userEvent } from "@testing-library/user-event";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { expect, inject, test } from "vitest";
import { App, seed } from "./tree.tsx";

const tModule = Date.now();
const env = inject("envName");
const ITER = Number(inject("iterations"));
const WARM = 20;
const user = userEvent.setup({ delay: null });

function now() {
  return performance.now();
}

test("first test", () => {
  const t = Date.now();
  const t0 = Number(inject("t0"));
  console.log(
    "DOMENV_STARTUP " +
      JSON.stringify({
        env,
        toConfig: Number(inject("tConfig")) - t0,
        toModule: tModule - t0,
        toFirstTest: t - t0,
      }),
  );
});

test("bench", async () => {
  const samples: Record<string, number[]> = {};
  const rec = (k: string, v: number) => (samples[k] ??= []).push(v);
  let firstIteration = 0;
  for (let i = 0; i < ITER + WARM; i++) {
    const tIter = now();
    const keep = i >= WARM;
    const time = async (k: string, f: () => unknown) => {
      const t = now();
      const r = await f();
      if (keep) rec(k, now() - t);
      return r;
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await time("mount (createRoot + flushSync render)", () =>
      flushSync(() => root.render(<App notes={seed} />)),
    );
    await time("getByRole heading", () => screen.getByRole("heading", { name: "Notes" }));
    await time("getByRole link (of 24)", () => screen.getByRole("link", { name: "Note 17" }));
    await time("getByRole button (of 23)", () =>
      screen.getByRole("button", { name: "Favorite Note 12" }),
    );
    await time("getByLabelText", () => screen.getByLabelText("Search"));
    await time("getByText", () => screen.getByText("20 notes"));
    await time("findByText, present", () => screen.findByText("20 notes"));
    const fav = screen.getByRole("button", { name: "Favorite Note 12" });
    await time("user.click (state update)", () => user.click(fav));
    await time("findByRole after click", () =>
      screen.findByRole("button", { name: "Unfavorite Note 12" }),
    );
    const search = screen.getByLabelText("Search") as HTMLInputElement;
    await time("fill input (clear + paste)", async () => {
      await user.clear(search);
      await user.paste("groceries");
    });
    expect(search.value).toBe("groceries");
    const content = screen.getByLabelText("Content");
    await time("fill textarea + findByText counter", async () => {
      await user.clear(content);
      await user.paste("hello world");
      await screen.findByText("11 / 2000");
    });
    await time("user.type 5 chars (input)", () => user.type(search, "abcde"));
    await time("submit form (click) + findByText error", async () => {
      await user.click(screen.getByRole("button", { name: "Create note" }));
      await screen.findByText("Title is required.");
    });
    await time("unmount", () => {
      root.unmount();
      container.remove();
    });
    if (keep) rec("whole iteration", now() - tIter);
    if (i === 0) firstIteration = now() - tIter;
  }
  const summary: Record<string, { median: number; mean: number; p90: number; n: number }> = {};
  for (const [k, v] of Object.entries(samples)) {
    const s = [...v].sort((a, b) => a - b);
    summary[k] = {
      median: s[Math.floor(s.length / 2)]! * 1000,
      mean: (s.reduce((a, b) => a + b, 0) / s.length) * 1000,
      p90: s[Math.floor(s.length * 0.9)]! * 1000,
      n: s.length,
    };
  }
  let memory: unknown;
  if (env === "browser") {
    const { cdp } = await import("vitest/browser");
    const heap = await cdp().send("Runtime.getHeapUsage");
    memory = { heap, crossOriginIsolated: globalThis.crossOriginIsolated };
  } else {
    memory = process.memoryUsage();
  }
  console.log(
    "DOMENV_RESULT " + JSON.stringify({ env, firstIterationMs: firstIteration, summary, memory }),
  );
}, 600_000);
