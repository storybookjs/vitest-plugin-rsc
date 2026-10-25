import { label } from "./changing-label.ts";
import { ChangingProbeClient } from "./changing-probe-client.tsx";

export function ChangingProbe() {
  return (
    <>
      <p>Server Component: {label}</p>
      <ChangingProbeClient />
    </>
  );
}
