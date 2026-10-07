import { cookies } from "next/headers";
import { ThemeToggle } from "../components/theme-toggle.tsx";
import { setLanguage } from "../lib/actions.ts";

export default async function SettingsPage() {
  const language = (await cookies()).get("language")?.value ?? "en";
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
