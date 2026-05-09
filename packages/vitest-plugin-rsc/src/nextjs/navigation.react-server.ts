export {
  forbidden,
  notFound,
  permanentRedirect,
  ReadonlyURLSearchParams,
  redirect,
  RedirectType,
  unauthorized,
  unstable_rethrow,
} from "next/dist/client/components/navigation.react-server.js";

export {
  ServerInsertedHTMLContext,
  useServerInsertedHTML,
} from "next/dist/shared/lib/server-inserted-html.shared-runtime.js";

function clientHookInServerComponent(hookName: string): never {
  throw new Error(
    `${hookName} is only available in Client Components. Add "use client" to the file that calls it.`,
  );
}

export function useParams<T>(): T {
  return clientHookInServerComponent("useParams");
}

export function usePathname(): string {
  return clientHookInServerComponent("usePathname");
}

export function useRouter(): never {
  return clientHookInServerComponent("useRouter");
}

export function useSearchParams(): never {
  return clientHookInServerComponent("useSearchParams");
}

export function useSelectedLayoutSegment(): string | null {
  return clientHookInServerComponent("useSelectedLayoutSegment");
}

export function useSelectedLayoutSegments(): string[] {
  return clientHookInServerComponent("useSelectedLayoutSegments");
}
