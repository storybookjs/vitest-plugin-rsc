import { cookies } from "next/headers";
import { auditLater, rememberLater } from "../lib/after-actions.ts";

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
    </>
  );
}
