"use client";

import React from "react";

export function ActionBindClient() {
  const hydrated = React.useSyncExternalStore(
    React.useCallback(() => () => {}, []),
    () => true,
    () => false,
  );
  return <div>{String(hydrated)}</div>;
}
