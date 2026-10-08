import type { Metadata } from "next";
import { cookies } from "next/headers";
import { setTheme } from "../actions.ts";
import { DensityMenu } from "../components/density-menu.tsx";

export const metadata: Metadata = { title: "Settings" };

// Reads the cookie that the Server Action of its form sets.
export default async function SettingsPage() {
  const theme = (await cookies()).get("theme")?.value ?? "light";
  return (
    <>
      <h1>Settings</h1>
      <p>Theme: {theme}</p>
      <form action={setTheme}>
        <input type="hidden" name="theme" value={theme === "dark" ? "light" : "dark"} />
        <button>Use the {theme === "dark" ? "light" : "dark"} theme</button>
      </form>
      <DensityMenu />
    </>
  );
}
