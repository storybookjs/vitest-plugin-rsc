import { cookies } from "next/headers";
import { after } from "next/server";
import { ThemeToggle } from "../components/theme-toggle.tsx";
import { setLanguage } from "../lib/actions.ts";
import { audit } from "../lib/audit.ts";

export default async function SettingsPage() {
  const language = (await cookies()).get("language")?.value ?? "en";
  // Runs once the response has been sent.
  after(() => audit(`opened settings in ${language}`));
  return (
    <>
      <h1>Settings</h1>
      <ThemeToggle />
      <p>Language: {language}</p>
      <form action={setLanguage.bind(null, "nl")}>
        <button>Use Dutch</button>
      </form>
    </>
  );
}
