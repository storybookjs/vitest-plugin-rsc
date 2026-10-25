import { cookies } from "next/headers";
import { after } from "next/server";
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer, runInServerAction } from "vitest-plugin-rsc/nextjs/testing-library";
import { AsyncContextProbe, cookieReads } from "./async-context-probe.tsx";

// The stores of a request, carried by Node's own `AsyncLocalStorage`, in the
// node projects of vitest.config.ts: in fidelity mode and in fast mode, whose
// speed feature `immediates` runs a timer of no delay as a task of the page's
// host.

const setProbeCookie = (value: string) =>
  runInServerAction(async () => {
    (await cookies()).set("probe", value);
  });

test("an async Server Component reads the cookies of its request after an await", async () => {
  await setProbeCookie("kept");

  await renderServer(<AsyncContextProbe label="after an await" />);

  await expect.element(page.getByText("after an await: kept")).toBeVisible();
});

test("after() reads the stores of the Server Action that left it, after an await", async () => {
  await setProbeCookie("kept");
  let seen: string | undefined;

  await runInServerAction(() => {
    after(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      seen = (await cookies()).get("probe")?.value;
    });
  });

  await expect.poll(() => seen).toBe("kept");
});

// Two tests, in this order: work of the first one's render goes on into the
// second.
test("work of a render that outlives its test reads that test's request", async () => {
  await setProbeCookie("first");

  await renderServer(<AsyncContextProbe label="first test" outlive={100} />);

  await expect.element(page.getByText("first test: first")).toBeVisible();
});

test("the next test reads its own request, while that work goes on", async () => {
  await setProbeCookie("second");

  await renderServer(<AsyncContextProbe label="second test" />);

  await expect.element(page.getByText("second test: second")).toBeVisible();
  await expect
    .poll(() => cookieReads.find(({ label }) => label === "first test, later"))
    .toEqual({ label: "first test, later", cookie: "first" });
});
