import type { Generated } from "kysely";

export interface Database {
  todos: {
    id: Generated<number>;
    title: string;
    // TINYINT(1): 0 or 1.
    done: Generated<number>;
    created_at: Generated<Date>;
  };
}
