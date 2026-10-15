import { cookies } from "next/headers";
import { Sidebar } from "../components/sidebar.tsx";

// As with the sidebar of shadcn/ui: the server renders the sidebar the way
// the cookie that the sidebar writes in the browser says.
export default async function InboxPage() {
  const open = (await cookies()).get("sidebar_state")?.value !== "false";
  return (
    <>
      <h1>Inbox</h1>
      <p>Rendered with the sidebar {open ? "open" : "closed"}</p>
      <Sidebar defaultOpen={open} />
    </>
  );
}
