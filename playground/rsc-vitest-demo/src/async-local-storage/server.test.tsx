import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { cleanup, renderServer } from "vitest-plugin-rsc/testing-library";
import {
  OptionalUserContextConsumer,
  UserContextConsumer,
  UserContextProvider,
} from "./enter-with-server.tsx";
import { UserAsyncStorageServer } from "./server.tsx";
import { userAsyncStorage } from "./user-storage.ts";

test("user-defined AsyncLocalStorage is available across the server component tree", async () => {
  await userAsyncStorage.run(
    {
      user: {
        name: "Ada Lovelace",
        role: "admin",
      },
    },
    () => renderServer(<UserAsyncStorageServer />),
  );

  await expect.element(page.getByTestId("current-user-name")).toHaveTextContent("Ada Lovelace");
  await expect.element(page.getByTestId("current-user-role")).toHaveTextContent("admin");
});

test("enterWith provider makes user context available to server descendants", async () => {
  await renderServer(
    <UserContextProvider
      value={{
        user: {
          name: "Grace Hopper",
          role: "maintainer",
        },
      }}
    >
      <UserContextConsumer />
    </UserContextProvider>,
  );

  await expect
    .element(page.getByTestId("enter-with-current-user-name"))
    .toHaveTextContent("Grace Hopper");
  await expect
    .element(page.getByTestId("enter-with-current-user-role"))
    .toHaveTextContent("maintainer");
});

test("cleanup clears enterWith user context between renders", async () => {
  await renderServer(
    <UserContextProvider
      value={{
        user: {
          name: "Katherine Johnson",
          role: "reviewer",
        },
      }}
    >
      <UserContextConsumer />
    </UserContextProvider>,
  );

  await expect
    .element(page.getByTestId("enter-with-current-user-name"))
    .toHaveTextContent("Katherine Johnson");

  await cleanup();
  await renderServer(<OptionalUserContextConsumer />);

  await expect
    .element(page.getByTestId("optional-current-user-name"))
    .toHaveTextContent("No user context");
});
