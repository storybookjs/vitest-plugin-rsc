"use cache";

import { cacheTag } from "next/cache";

let renders = 0;

// A page with the directive at its top: the page itself is cached.
export default async function Static() {
  cacheTag("static");
  return <h1>Static {++renders}</h1>;
}
