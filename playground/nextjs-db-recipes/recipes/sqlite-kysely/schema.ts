import type { Generated } from "kysely";

export interface Database {
  todos: {
    id: Generated<number>;
    title: string;
    // 0 or 1.
    done: Generated<number>;
    // ISO 8601, which the app writes.
    created_at: string;
  };
}
