import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Next's tests are not in the `next` package. They are fetched from
// `vercel/next.js` at the tag of the installed `next`, and only the
// directories the runner uses: `test/lib` and the fixtures. A blobless,
// shallow, sparse clone is a few megabytes; the whole repository is gigabytes.

const repository = "https://github.com/vercel/next.js";

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/**
 * Makes `directories` of Next's repository at `tag` available, and returns
 * where: a checkout in `into` that is kept between runs.
 */
export function fetchNext(into: string, tag: string, directories: string[]): string {
  const checkout = path.join(into, tag);
  // `test/lib` has a tsconfig that extends the one of the repository.
  const patterns = [
    "/license.md",
    "/tsconfig.json",
    "/test/lib/",
    ...directories.map((directory) => `/${directory}/`),
  ].sort();
  const stamp = path.join(checkout, ".git", "next-conformance-patterns");
  const wanted = patterns.join("\n");
  if (fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8") === wanted) return checkout;

  if (!fs.existsSync(path.join(checkout, ".git"))) {
    fs.mkdirSync(checkout, { recursive: true });
    git(checkout, "init", "--quiet");
    git(checkout, "remote", "add", "origin", repository);
    git(checkout, "config", "remote.origin.promisor", "true");
    git(checkout, "config", "remote.origin.partialclonefilter", "blob:none");
  }
  console.log(`Fetching ${patterns.length} directories of vercel/next.js at ${tag}`);
  git(checkout, "sparse-checkout", "set", "--no-cone", ...patterns);
  git(
    checkout,
    "fetch",
    "--quiet",
    "--depth",
    "1",
    "--filter=blob:none",
    "origin",
    `refs/tags/${tag}:refs/tags/${tag}`,
  );
  git(checkout, "checkout", "--quiet", "--force", tag);
  fs.writeFileSync(stamp, wanted);
  return checkout;
}
