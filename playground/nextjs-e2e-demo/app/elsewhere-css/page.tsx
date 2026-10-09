import { headers } from "next/headers";

// Stylesheets that a page load does not wait for: one of another origin, which
// may never answer, and an alternate one, which a browser does not load.
export default async function ElsewhereCssPage() {
  const port = (await headers()).get("host")!.split(":")[1];
  return (
    <>
      <link rel="stylesheet" href={`http://127.0.0.1:${port}/service/never`} />
      <link rel="alternate stylesheet" href="/service/never" />
      <p>Loaded without them</p>
    </>
  );
}
