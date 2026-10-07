"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";

export function NextRouterProbe() {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <section>
      <p>pathname: {pathname}</p>
      <p>search q: {searchParams.get("q")}</p>
      <p>search q all: {searchParams.getAll("q").join(",")}</p>
      <p>search has missing: {String(searchParams.has("missing"))}</p>
      <p>params: {JSON.stringify(params)}</p>
      <button type="button" onClick={() => router.push("/fixtures/router/next/pushed")}>
        Push route
      </button>
      <button type="button" onClick={() => router.replace("/fixtures/router/next/replaced")}>
        Replace route
      </button>
      <Link
        href={{ pathname: "/fixtures/router/next/linked", query: { q: "linked" } }}
        prefetch={false}
      >
        Link route
      </Link>
    </section>
  );
}
