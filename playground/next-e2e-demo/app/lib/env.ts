import { createEnv, type StandardSchemaV1 } from "@t3-oss/env-core";

// A schema that takes any text. An app would use zod here.
const text: StandardSchemaV1<unknown, string> = {
  "~standard": {
    version: 1,
    vendor: "next-e2e-demo",
    validate: (value) => ({ value: String(value) }),
  },
};

// The library only hands out a server variable on the server, and it asks
// `typeof window` to know whether that is where it is.
export const env = createEnv({
  server: { GREETING: text },
  runtimeEnv: { GREETING: "hello from the server" },
});
