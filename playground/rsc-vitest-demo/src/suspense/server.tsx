import React from "react";

export function TestSuspense() {
  async function Inner() {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return <div>suspense-resolved</div>;
  }
  return (
    <div data-testid="suspense">
      <React.Suspense fallback={<div>suspense-fallback</div>}>
        <Inner />
      </React.Suspense>
    </div>
  );
}
