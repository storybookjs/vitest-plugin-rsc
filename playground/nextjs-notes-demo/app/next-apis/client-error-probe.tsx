"use client";

import { useCallback, useState } from "react";
import { unstable_catchError, type ErrorInfo } from "next/error";

type ErrorBoundaryProps = {
  onRecover: () => void;
};

function ClientErrorFallback({ onRecover }: ErrorBoundaryProps, errorInfo: ErrorInfo) {
  return (
    <section aria-label="Caught client error">
      <p>Client error caught: {errorInfo.error.message}</p>
      <button
        type="button"
        onClick={() => {
          onRecover();
          errorInfo.reset();
        }}
      >
        Recover client error
      </button>
    </section>
  );
}

const ClientErrorBoundary = unstable_catchError(ClientErrorFallback);

function ThrowWhenActive({ active }: { active: boolean }) {
  if (active) {
    throw new Error("next error boundary boom");
  }

  return <p>Client error boundary ready</p>;
}

export function ClientErrorProbe() {
  const [active, setActive] = useState(false);
  const recover = useCallback(() => setActive(false), []);

  return (
    <ClientErrorBoundary onRecover={recover}>
      <ThrowWhenActive active={active} />
      <button type="button" onClick={() => setActive(true)}>
        Trigger client error
      </button>
    </ClientErrorBoundary>
  );
}
