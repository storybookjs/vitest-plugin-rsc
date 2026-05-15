"use client";

import { useCallback, useState, type ComponentType, type ReactNode } from "react";
import * as nextError from "next/error";

type ErrorBoundaryProps = {
  onRecover: () => void;
};

type ErrorInfo = {
  error: Error;
  reset: () => void;
};

type NextErrorModule = {
  unstable_catchError?: (
    fallback: typeof ClientErrorFallback,
  ) => ComponentType<ErrorBoundaryProps & { children: ReactNode }>;
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

const unstableCatchError = (nextError as NextErrorModule).unstable_catchError;
const ClientErrorBoundary =
  typeof unstableCatchError === "function" ? unstableCatchError(ClientErrorFallback) : undefined;
export const supportsNextUnstableCatchError = Boolean(ClientErrorBoundary);

function ThrowWhenActive({ active }: { active: boolean }) {
  if (active) {
    throw new Error("next error boundary boom");
  }

  return <p>Client error boundary ready</p>;
}

export function ClientErrorProbe() {
  const [active, setActive] = useState(false);
  const recover = useCallback(() => setActive(false), []);

  if (!ClientErrorBoundary) {
    return <p>Client error boundary API unavailable in this Next version</p>;
  }

  return (
    <ClientErrorBoundary onRecover={recover}>
      <ThrowWhenActive active={active} />
      <button type="button" onClick={() => setActive(true)}>
        Trigger client error
      </button>
    </ClientErrorBoundary>
  );
}
