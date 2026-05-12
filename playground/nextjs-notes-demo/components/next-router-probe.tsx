"use client";

import Link from "next/link";
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
  useSelectedLayoutSegment,
  useSelectedLayoutSegments,
} from "next/navigation";

export function NextRouterProbe() {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedSegment = useSelectedLayoutSegment();
  const selectedSegments = useSelectedLayoutSegments();

  return (
    <section>
      <p>pathname: {pathname}</p>
      <p>search q: {searchParams.get("q")}</p>
      <p>search q all: {searchParams.getAll("q").join(",")}</p>
      <p>search has missing: {String(searchParams.has("missing"))}</p>
      <p>params: {JSON.stringify(params)}</p>
      <p>selected segment: {selectedSegment ?? "null"}</p>
      <p>selected segments: {selectedSegments.join(",") || "empty"}</p>
      <button type="button" onClick={() => router.push("/note/next")}>
        Push route
      </button>
      <button type="button" onClick={() => router.replace("/note/replaced")}>
        Replace route
      </button>
      <Link href={{ pathname: "/note/link", query: { q: "linked" } }} prefetch={false}>
        Link route
      </Link>
    </section>
  );
}
