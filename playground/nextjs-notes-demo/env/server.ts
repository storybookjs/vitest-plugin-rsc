import { createEnv } from "@t3-oss/env-nextjs";
import { vercel } from "@t3-oss/env-core/presets-zod";
import * as z from "zod";

export const env = createEnv({
  server: {
    BETTER_AUTH_SECRET: z.string().min(32).default("dev-secret-dev-secret-dev-secret-dev-secret"),
    CI: z.stringbool().default(false),
    DATABASE_URL: z.url().optional(),
    DATABASE_URL_UNPOOLED: z.url().optional(),
    PORT: z.coerce.number().int().positive().default(3000),
    RESEND_API_KEY: z.string().optional(),
    RESEND_FROM_EMAIL: z.string().optional(),
    // Required, with no default: the tests and the stories have it from
    // .env.test.
    SUPPORT_EMAIL: z.email(),
  },
  shared: {
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
  extends: [vercel()],
  experimental__runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
