"use client";

import { useRouter } from "next/navigation";

// Has Next's router render the page again.
export function RefreshButton() {
  const router = useRouter();
  return <button onClick={() => router.refresh()}>Refresh</button>;
}
