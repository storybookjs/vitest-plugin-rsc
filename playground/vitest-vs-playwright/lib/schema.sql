CREATE TABLE IF NOT EXISTS "todos" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL
);
