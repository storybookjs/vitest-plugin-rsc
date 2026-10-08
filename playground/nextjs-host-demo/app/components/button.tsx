"use client";

import type { MouseEventHandler, ReactNode } from "react";

// Takes a function, which a Server Component cannot pass to it.
export function Button({
  onClick,
  children,
}: {
  onClick?: MouseEventHandler<HTMLButtonElement>;
  children: ReactNode;
}) {
  return <button onClick={onClick}>{children}</button>;
}
