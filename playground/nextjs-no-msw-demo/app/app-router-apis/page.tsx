import dynamic from "next/dynamic";
import Form from "next/form";
import Head from "next/head";
import Link from "next/link";
import { ClientNavigationProbe } from "./client-navigation-probe";

const LazyMessage = dynamic(() => import("./lazy-message"));

export default function AppRouterApisPage() {
  return (
    <>
      <Head>
        <title>Ignored by app router noop head</title>
      </Head>
      <h1>App Router APIs</h1>
      <Link href="/route-probe">Route probe link</Link>
      <Form action="/route-probe">
        <input name="query" defaultValue="next-form" aria-label="Form query" />
        <button type="submit">Search</button>
      </Form>
      <LazyMessage />
      <ClientNavigationProbe />
    </>
  );
}
