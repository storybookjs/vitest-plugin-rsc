// A mistake `next build` stops at: a Server Component imports client-only code.
import { getViewportWidth } from "../../lib/viewport.ts";

export default function ClientOnlyInServerPage() {
  return <p>Width: {getViewportWidth()}</p>;
}
