import { ChangingProbe } from "#components/changing-probe.tsx";

// For components/changing-probe.test.tsx: a page that the app's server
// renders, with the modules it has now. A node that a test renders is the
// test file's, as it imported it.
export default function ChangingProbePage() {
  return <ChangingProbe />;
}
