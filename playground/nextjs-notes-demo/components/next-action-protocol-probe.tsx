import {
  forbidden,
  notFound,
  permanentRedirect,
  redirect,
  unauthorized,
  unstable_rethrow,
} from "next/navigation";
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

  async function permanentRedirectAction() {
    "use server";

    permanentRedirect("/action-protocol-permanent-target?from=action");
  }

  async function rethrowRedirectAction() {
    "use server";

    try {
      redirect("/action-protocol-rethrow-target?from=action");
    } catch (error) {
      unstable_rethrow(error);
      throw new Error("redirect was not rethrown");
    }
  }

  async function throwAction() {
    "use server";

    throw new Error("action exploded");
  }

  async function notFoundAction() {
    "use server";

    notFound();
  }

  async function forbiddenAction() {
    "use server";

    forbidden();
  }

  async function unauthorizedAction() {
    "use server";

    unauthorized();
  }

  return (
    <NextActionProtocolClient
      defaultRedirectAction={defaultRedirectAction}
      forbiddenAction={forbiddenAction}
      notFoundAction={notFoundAction}
      permanentRedirectAction={permanentRedirectAction}
      rethrowRedirectAction={rethrowRedirectAction}
      redirectAction={redirectAction}
      throwAction={throwAction}
      unauthorizedAction={unauthorizedAction}
    />
  );
}
