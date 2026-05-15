import { redirect } from "next/navigation";
import { RouteActionClient } from "./client";

let routeActionCount = 0;

export function resetRouteActionState() {
  routeActionCount = 0;
}

export default function RouteActionPage() {
  async function increment() {
    "use server";

    routeActionCount += 1;
    return routeActionCount;
  }

  async function redirectToConventions() {
    "use server";

    redirect("/route-patterns/conventions?from=route-action");
  }

  return (
    <>
      <h1>Route action</h1>
      <RouteActionClient increment={increment} redirectToConventions={redirectToConventions} />
    </>
  );
}
