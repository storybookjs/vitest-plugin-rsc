import { getCurrentUser } from "./user-storage.ts";

export async function UserAsyncStorageServer() {
  return (
    <div>
      <CurrentUserName />
      <CurrentUserRole />
    </div>
  );
}

function CurrentUserName() {
  return <span data-testid="current-user-name">{getCurrentUser().name}</span>;
}

async function CurrentUserRole() {
  await Promise.resolve();

  return <span data-testid="current-user-role">{getCurrentUser().role}</span>;
}
