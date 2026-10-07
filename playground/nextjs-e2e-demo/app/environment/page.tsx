import { RenderedIn } from "../components/rendered-in.tsx";
import { env } from "../lib/env.ts";

export default function EnvironmentPage() {
  return (
    <>
      <h1>Environment</h1>
      <p>Server Component: typeof window is {typeof window}</p>
      <p>Server variable: {env.GREETING}</p>
      <RenderedIn />
    </>
  );
}
