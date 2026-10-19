"use client";

import { Component, type ReactNode } from "react";

// An error boundary: what its children threw, in their place.
export class Boundary extends Component<{ children: ReactNode }, { error?: Error }> {
  override state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    const { error } = this.state;
    return error ? <p role="alert">Caught: {error.message}</p> : this.props.children;
  }
}
