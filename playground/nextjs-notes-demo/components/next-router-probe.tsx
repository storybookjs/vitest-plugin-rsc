"use client";

import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";

export function NextRouterProbe() {
  const params = useParams<{ id: string; slug: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <button type="button" onClick={() => router.push("/note/next")}>
      {pathname}:{params.id}:{params.slug}:{searchParams.get("q")}
    </button>
  );
}
