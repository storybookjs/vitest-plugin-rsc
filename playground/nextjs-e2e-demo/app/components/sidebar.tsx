"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Keeps whether it is open in a cookie that it writes itself, as the sidebar
// of shadcn/ui does, for the server to render it that way.
export function Sidebar({ defaultOpen }: { defaultOpen: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);

  function toggle() {
    setOpen(!open);
    document.cookie = `sidebar_state=${!open}; path=/; max-age=${60 * 60 * 24 * 7}`;
  }

  return (
    <>
      <button onClick={toggle}>{open ? "Close sidebar" : "Open sidebar"}</button>
      <button onClick={() => router.refresh()}>Refresh</button>
      <nav aria-label="Mailboxes" hidden={!open}>
        Mailboxes
      </nav>
    </>
  );
}
