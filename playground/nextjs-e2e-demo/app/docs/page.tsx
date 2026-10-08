import Link from "next/link";

export default function DocsPage() {
  return (
    <>
      <h1>Docs</h1>
      <Link href="/docs/routing">Routing</Link> <Link href="/docs/start">Start</Link>{" "}
      <Link href="/go/routing">Go to routing</Link>
    </>
  );
}
