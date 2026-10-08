"use client";

import type { MouseEvent, ReactNode } from "react";

// Takes a function, which a Server Component cannot pass to it.
export function PressButton({
  onPress,
  children,
}: {
  onPress: (event: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}) {
  return <button onClick={onPress}>{children}</button>;
}
