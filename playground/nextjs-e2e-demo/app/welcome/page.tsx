import { cookies } from "next/headers";
import { audit } from "../lib/audit.ts";

// Where a sign-in goes on to. It reads the session after an `await` of its
// own, as an auth library does that looks the session up, and says in the
// audit log whom it welcomed.
export default async function WelcomePage() {
  await new Promise((resolve) => setTimeout(resolve, 50));
  audit(`welcomed ${(await cookies()).get("session")?.value}`);
  return <h1>Welcome</h1>;
}
