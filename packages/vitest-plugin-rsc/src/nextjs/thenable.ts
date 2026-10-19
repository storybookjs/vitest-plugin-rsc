// A promise that says whether it has settled, as React's `use()` reads one:
// a settled one gives its value, or throws its reason, without suspending.
// `use()` sets these fields itself on a promise it has not seen; set as the
// promise is made, the first render already reads a load that is done, and
// code without React, like the tab's graph, can tell one that is pending.

/** A promise that React's `use()` reads synchronously once it has settled. */
export type Thenable<T> = Promise<T> & {
  status?: "pending" | "fulfilled" | "rejected";
  value?: T;
  reason?: unknown;
};

/** `promise`, which says from now on whether it has settled. */
export function track<T>(promise: Promise<T>): Thenable<T> {
  const thenable = promise as Thenable<T>;
  thenable.status = "pending";
  // Handlers that return nothing: one that returned the thenable would make
  // a second promise, rejected as the thenable is, that nothing handles.
  promise.then(
    (value) => {
      thenable.status = "fulfilled";
      thenable.value = value;
    },
    (reason: unknown) => {
      thenable.status = "rejected";
      thenable.reason = reason;
    },
  );
  return thenable;
}

/** A thenable that has `value` already. */
export function fulfilled<T>(value: T): Thenable<T> {
  return Object.assign(Promise.resolve(value), { status: "fulfilled" as const, value });
}
