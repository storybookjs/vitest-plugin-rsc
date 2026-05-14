import { notFound, permanentRedirect, redirect } from "next/navigation";
import { NextActionProtocolClient } from "./next-action-protocol-client";

export function NextActionProtocolProbe() {
  async function defaultRedirectAction() {
    "use server";

    redirect("/action-protocol-default-target?from=action");
  }

  async function redirectAction() {
    "use server";

    redirect("/action-protocol-target?from=action", "push");
  }

  async function permanentRedirectAction() {
    "use server";

    permanentRedirect("/action-protocol-permanent-target?from=action");
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
      permanentRedirectAction={permanentRedirectAction}
      redirectAction={redirectAction}
      throwAction={throwAction}
    />
  );
}
