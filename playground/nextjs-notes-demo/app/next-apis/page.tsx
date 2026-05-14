import dynamic from "next/dynamic";
import Form from "next/form";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import * as rootParams from "next/root-params";
import Script from "next/script";
import { connection } from "next/server";
import { AfterProbe } from "./after-probe";
import { ClientErrorProbe } from "./client-error-probe";
import { ClientNavigationProbe } from "./client-navigation-probe";
import staticLogo from "./fixtures/static-logo.svg";
import { WebVitalsProbe } from "./web-vitals-probe";

const LazyPanel = dynamic(() => import("./lazy-panel"));

export default async function NextApisPage() {
  await connection();
  const rootParamNames = Object.keys(rootParams).join(", ") || "none";

  return (
    <main>
      <Head>
        <title>Ignored by App Router head</title>
      </Head>
      <h1>Next APIs</h1>
      <p>Connection scope ready</p>
      <p>Root params available: {rootParamNames}</p>
      <AfterProbe />
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
      <Image alt="Imported static logo" priority src={staticLogo} unoptimized />
      <Script id="next-api-script" strategy="afterInteractive">
        {`window.__nextApiScript = "loaded";`}
      </Script>
      <LazyPanel />
      <ClientNavigationProbe />
      <ClientErrorProbe />
      <WebVitalsProbe />
    </main>
  );
}
