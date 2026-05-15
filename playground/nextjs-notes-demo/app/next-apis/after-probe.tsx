import { after } from "next/server";

let afterRuns = 0;
let nestedAfterRuns = 0;

export function resetAfterProbe() {
  afterRuns = 0;
  nestedAfterRuns = 0;
}

export function getAfterProbeRuns() {
  return afterRuns;
}

export function getNestedAfterProbeRuns() {
  return nestedAfterRuns;
}

export function AfterProbe() {
  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    afterRuns += 1;
  });

  after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    after(
      new Promise<void>((resolve) => {
        setTimeout(() => {
          nestedAfterRuns += 1;
          resolve();
        }, 0);
      }),
    );
  });

  return <p>After task scheduled</p>;
}
