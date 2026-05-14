"use client";

import { usePathname } from "next/navigation";

export function ClientNavigationProbe() {
  const pathname = usePathname();
  return <p>Pathname: {pathname}</p>;
}
