"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

export function ClientNavigationProbe() {
  const pathname = usePathname();
  return (
    <section>
      <p>Pathname: {pathname}</p>
      <Link href="/notes">
        <LinkStatusProbe />
        Notes status link
      </Link>
    </section>
  );
}

function LinkStatusProbe() {
  const { pending } = useLinkStatus();
  return <span>Link pending: {String(pending)}</span>;
}
