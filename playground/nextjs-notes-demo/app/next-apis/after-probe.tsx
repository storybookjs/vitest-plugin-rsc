import { after } from "next/server";

let afterRuns = 0;

export function resetAfterProbe() {
  afterRuns = 0;
}

export function getAfterProbeRuns() {
  return afterRuns;
}

export function AfterProbe() {
  after(() => {
    afterRuns += 1;
  });

  return <p>After task scheduled</p>;
}
