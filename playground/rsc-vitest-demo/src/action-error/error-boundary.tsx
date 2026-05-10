"use client";

import * as React from "react";

export default class ErrorBoundary extends React.Component<
  { children?: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children?: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div>
          ErrorBoundary caught '{this.state.error.message}'
          <button
            onClick={() => {
              this.setState({ error: null });
            }}
          >
            reset-error
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
