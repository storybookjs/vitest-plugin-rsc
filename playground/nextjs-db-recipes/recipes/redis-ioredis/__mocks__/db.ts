import Redis from "ioredis-mock";

// `./db.ts` in the tests, which vitest.setup.ts mocks with this file: Redis
// in the page, ioredis-mock, with the API of ioredis and Lua of its own.
export const redis = new Redis();

export async function resetDb(): Promise<void> {
  await redis.flushall();
}
