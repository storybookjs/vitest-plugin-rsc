import { Pool } from "pg";

// oxlint-disable-next-line no-process-env
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
