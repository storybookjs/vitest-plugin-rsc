import type { ReactNode } from "react";
import {
  getCurrentUser,
  getOptionalCurrentUser,
  injectUserContext,
  type UserStore,
} from "./user-storage";

export function UserContextProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: UserStore;
}) {
  // Inspired by userland RSC context libraries like @nimpl/context and
  // @sodefa/next-server-context: a provider records context with enterWith()
  // because React evaluates the server descendants after returning children.
  injectUserContext(value);
  return children;
}

export function UserContextConsumer() {
  return (
    <div>
      <UserContextName />
      <AsyncUserContextRole />
    </div>
  );
}

export function OptionalUserContextConsumer() {
  return (
    <span data-testid="optional-current-user-name">
      {getOptionalCurrentUser()?.name ?? "No user context"}
    </span>
  );
}

function UserContextName() {
  return <span data-testid="enter-with-current-user-name">{getCurrentUser().name}</span>;
}

async function AsyncUserContextRole() {
  await Promise.resolve();

  return <span data-testid="enter-with-current-user-role">{getCurrentUser().role}</span>;
}
