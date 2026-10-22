import { cookies } from "next/headers";
import { auditLater, rememberAfterStaticRoute, rememberLater } from "../lib/after-actions.ts";

export default async function AfterActionPage() {
  const remembered = (await cookies()).get("remembered")?.value ?? "nothing";
  return (
    <>
      <h1>After an action</h1>
      <p>Remembered: {remembered}</p>
      <form action={auditLater}>
        <button>Audit later</button>
      </form>
      <form action={rememberLater.bind(null, "ada")}>
        <button>Remember ada</button>
      </form>
      <form action={rememberAfterStaticRoute.bind(null, "grace")}>
        <button>Remember grace after a static route</button>
      </form>
    </>
  );
}
