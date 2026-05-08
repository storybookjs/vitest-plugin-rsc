/// <reference types="vite/client" />

import { screen } from "@testing-library/dom";
import { userEvent } from "@testing-library/user-event";
import { bench, describe } from "vitest";
import { renderServer, cleanup } from "vitest-plugin-rsc/testing-library";
import { ServerCounter } from "../action/server.tsx";
import { ClientCounter } from "../client-counter/client.tsx";

const options = {
  iterations: Number(import.meta.env.VITE_PERF_BENCH_ITERATIONS ?? 10),
  time: Number(import.meta.env.VITE_PERF_BENCH_TIME_MS ?? 250),
  warmupIterations: Number(import.meta.env.VITE_PERF_BENCH_WARMUP_ITERATIONS ?? 2),
  warmupTime: Number(import.meta.env.VITE_PERF_BENCH_WARMUP_TIME_MS ?? 100),
};

describe("RSC render helpers", () => {
  bench(
    "server component render",
    async () => {
      await withCleanup(async () => {
        await renderServer(<ServerCounter />);
        await screen.findByRole("button", { name: "server-counter: 0" });
      });
    },
    options,
  );

  bench(
    "client component render and update",
    async () => {
      await withCleanup(async () => {
        await renderServer(<ClientCounter />);
        await userEvent.click(await screen.findByRole("button", { name: "client-counter: 0" }));
        await screen.findByRole("button", { name: "client-counter: 1" });
      });
    },
    options,
  );
});

async function withCleanup(callback: () => Promise<void>): Promise<void> {
  try {
    await callback();
  } finally {
    await cleanup();
  }
}
