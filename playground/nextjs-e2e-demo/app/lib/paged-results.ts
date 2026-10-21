import { cookies } from "next/headers";

// What a page of results reads of the request, one page at a time.
export async function* pagesOf(count: number) {
  for (let page = 1; page <= count; page++) {
    await new Promise((resolve) => setTimeout(resolve, 1));
    yield `${page}:${(await cookies()).get("who")?.value}`;
  }
}

// Reads the request in a `for await`, after each page.
export async function readAllPages(count: number) {
  const read: string[] = [];
  for await (const page of pagesOf(count)) {
    read.push(`${page}:${(await cookies()).get("who")?.value}`);
  }
  return read;
}
