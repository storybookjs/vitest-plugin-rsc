CREATE TABLE "todos" (
  "id" serial PRIMARY KEY,
  "title" text NOT NULL,
  "done" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz(3) NOT NULL DEFAULT now()
);
