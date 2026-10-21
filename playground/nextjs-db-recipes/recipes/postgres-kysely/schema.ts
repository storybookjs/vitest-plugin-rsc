import type { Generated } from "kysely";

export interface Database {
  todos: {
    id: Generated<number>;
    title: string;
    done: Generated<boolean>;
    created_at: Generated<Date>;
  };
}
