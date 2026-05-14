import dynamic from "next/dynamic";
import { unstable_catchError as catchError } from "next/error";
import Form from "next/form";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { ClientNavigationProbe } from "./client-navigation-probe";

const LazyPanel = dynamic(() => import("./lazy-panel"));

export default function NextApisPage() {
  return (
    <main>
      <Head>
        <title>Ignored by App Router head</title>
      </Head>
      <h1>Next APIs</h1>
      <Link href="/notes">Notes link</Link>
      <Form action="/notes">
        <input aria-label="Search notes" name="q" defaultValue="next-form" />
        <button type="submit">Search</button>
      </Form>
      <Image
        alt="Next API image"
        height={24}
        priority
        src="/vitest-rsc.png"
        unoptimized
        width={48}
      />
      <LazyPanel />
      <ClientNavigationProbe />
      <p>Error API: {typeof catchError}</p>
    </main>
  );
}
