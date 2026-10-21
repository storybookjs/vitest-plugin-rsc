CREATE TABLE "todos" (
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "title" text NOT NULL,
  "done" integer NOT NULL DEFAULT 0,
  -- Milliseconds since 1970, which the app writes.
  "created_at" integer NOT NULL
);
