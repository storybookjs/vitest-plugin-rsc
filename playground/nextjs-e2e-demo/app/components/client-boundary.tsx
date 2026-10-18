"use client";

import { Component, type ReactNode } from "react";

// Shows what its children threw, in their place.
export class ClientBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  override state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    const { error } = this.state;
    return error ? <p role="alert">Caught: {error.message}</p> : this.props.children;
  }
}

// Throws as the page renders it, when it is to: not on the server.
export function ThrowsOnClient({ when }: { when: boolean }): ReactNode {
  if (when && typeof window !== "undefined") throw new Error("Thrown on the client");
  return <p>Not thrown</p>;
}
