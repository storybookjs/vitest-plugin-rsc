import { refresh } from "next/cache";

let count = 0;

export function resetDirectActionProbe() {
  count = 0;
}

export function DirectActionProbe({ shouldRefresh = false }: { shouldRefresh?: boolean }) {
  return (
    <form
      action={async () => {
        "use server";

        count += 1;
        if (shouldRefresh) {
          refresh();
        }
      }}
    >
      <p>server count: {count}</p>
      <button>Increment</button>
    </form>
  );
}
