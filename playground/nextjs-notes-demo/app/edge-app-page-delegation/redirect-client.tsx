"use client";

import { useRouter } from "next/navigation";

export function EdgeAppPageDelegationRedirectClient() {
  const router = useRouter();

  return (
    <button onClick={() => router.push("/route-patterns/conventions?mode=redirect")}>
      Follow RSC redirect
    </button>
  );
}
