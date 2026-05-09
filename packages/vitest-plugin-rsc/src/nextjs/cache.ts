import { fn } from "@vitest/spy";

export const revalidatePath = fn();
export const revalidateTag = fn();
export const refresh = fn();
export const updateTag = fn();
export const unstable_noStore = fn();
export const cacheLife = fn();
export const cacheTag = fn();
export const unstable_cache = fn(
  <TArgs extends unknown[], TResult>(callback: (...args: TArgs) => TResult) => callback,
);
