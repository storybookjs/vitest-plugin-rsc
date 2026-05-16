import { notFound, redirect } from "next/navigation";
import { NextActionProtocolClient } from "./next-action-protocol-client.tsx";

export function NextActionProtocolProbe() {
  async function defaultRedirectAction() {
    "use server";

    redirect("/action-protocol-default-target?from=action");
  }

  async function redirectAction() {
    "use server";

    redirect("/action-protocol-target?from=action", "push");
  }

  async function throwAction() {
    "use server";

    throw new Error("action exploded");
  }

  async function notFoundAction() {
    "use server";

    notFound();
  }

  return (
    <NextActionProtocolClient
      defaultRedirectAction={defaultRedirectAction}
      notFoundAction={notFoundAction}
      redirectAction={redirectAction}
      throwAction={throwAction}
    />
  );
}
