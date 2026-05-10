import { cookies } from "next/headers";

export default async function FlashCookieProbe() {
  const cookieStore = await cookies();
  const flash = cookieStore.get("flash")?.value ?? "empty";

  return (
    <form
      action={async () => {
        "use server";

        const actionCookieStore = await cookies();
        actionCookieStore.set("flash", "saved", { httpOnly: true, path: "/" });
      }}
    >
      <p>flash: {flash}</p>
      <button>Set flash</button>
    </form>
  );
}
