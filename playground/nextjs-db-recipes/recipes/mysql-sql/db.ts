import { createPool } from "mysql2/promise";

export const pool = createPool({
  // oxlint-disable-next-line no-process-env
  uri: process.env.MYSQL_URL ?? "mysql://root:root@localhost:3306/todos",
  timezone: "Z",
});
