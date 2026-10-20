"use client";

import { useEffect } from "react";

// A flash is shown once: by the response of the Server Action that set it.
// A Server Component cannot delete a cookie, and a Server Action that does
// renders the page again, without the flash it shows. So the page forgets
// the flash with a route handler once it has shown it, and a later visit
// renders the form without it. `id` is that of the flash, new for each.
export function ForgetFlash({ id }: { id: string | undefined }) {
  useEffect(() => {
    if (id) void fetch("/api/flash", { method: "DELETE" });
  }, [id]);
  return null;
}
