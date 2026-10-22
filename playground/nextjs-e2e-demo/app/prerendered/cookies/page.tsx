import { cookies } from "next/headers";

// A page that the config lets `next build` prerender, and that reads the
// request: its prerender bails out, and the build keeps it dynamic.
export default async function CookiesPage() {
  const theme = (await cookies()).get("theme")?.value ?? "none";
  return (
    <p>
      Theme {theme}, rendered as {Math.random()}
    </p>
  );
}
