"use client";

import {
  useParams,
  usePathname,
  useSearchParams,
  useSelectedLayoutSegments,
} from "next/navigation";

// What Next's router says about the URL it is at.
export function RouterState() {
  const pathname = usePathname();
  const params = useParams();
  const searchParams = useSearchParams();
  const segments = useSelectedLayoutSegments();
  return (
    <dl aria-label="Router">
      <dt>Pathname</dt>
      <dd>{pathname}</dd>
      <dt>Params</dt>
      <dd>{JSON.stringify(params)}</dd>
      <dt>Search</dt>
      <dd>{searchParams.toString()}</dd>
      <dt>Segments below</dt>
      <dd>{JSON.stringify(segments)}</dd>
    </dl>
  );
}
