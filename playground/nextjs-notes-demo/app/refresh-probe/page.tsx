import { ClientRefreshProbe } from "#components/client-refresh-probe.tsx";
import { ServerRefreshProbe } from "#components/server-refresh-probe.tsx";

export default async function RefreshProbePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const mode = (await searchParams).mode;
  const shouldRefresh = mode === "server-refresh";

  return (
    <>
      <ServerRefreshProbe shouldRefresh={shouldRefresh} />
      {mode === "client-refresh" ? <ClientRefreshProbe /> : null}
    </>
  );
}
