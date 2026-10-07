// A mistake `next build` stops at: a Server Component calls a client hook.
import { useState } from "react";

export default function ClientHookInServerPage() {
  const [count] = useState(0);
  return <p>Count: {count}</p>;
}
