import Redis from "ioredis";

// Connected at the first command, as a pool of pg or mysql2 is: not as the
// module loads, for `next build`.
// oxlint-disable-next-line no-process-env
export const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  lazyConnect: true,
});
