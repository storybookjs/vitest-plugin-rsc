import { runWithUserStore, userAsyncStorage } from "./user-storage";

export async function UserAsyncStorageServer() {
  return runWithUserStore({ label: "user-defined-async-storage" }, async () => {
    await Promise.resolve();

    return (
      <div>
        <span data-testid="user-async-storage">{userAsyncStorage.getStore()?.label}</span>
      </div>
    );
  });
}
