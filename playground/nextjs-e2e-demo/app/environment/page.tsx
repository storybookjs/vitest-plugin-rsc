import { RenderedIn } from "../components/rendered-in.tsx";
import { env } from "../lib/env.ts";

// A server has no window to measure.
function viewport(): string {
  try {
    return `${window.innerWidth}px`;
  } catch {
    return "unknown";
  }
}

export default function EnvironmentPage() {
  return (
    <>
      <h1>Environment</h1>
      <p>Server Component: typeof window is {typeof window}</p>
      <p>Viewport: {viewport()}</p>
      <p>Server variable: {env.GREETING}</p>
      <RenderedIn />
    </>
  );
}
